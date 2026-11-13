<?php
/* ============================================================
   Rappidos · api.php
   Puente entre las páginas (JavaScript) y la base de datos MySQL.
   Todas las respuestas son JSON.

   Lecturas (GET):   api.php?accion=estado | menu | insumos | pedidos
                     | pedido&id=5 | movimientos
   Escrituras (POST, cuerpo JSON):
     crear_pedido, cambiar_estado, agregar_producto, actualizar_producto,
     eliminar_producto, registrar_entrada, ajustar_existencia, actualizar_insumo

   Reglas importantes:
   - El precio y la receta de cada pedido los calcula el servidor con los
     datos de la base, no se confía en lo que manda el navegador.
   - El inventario se descuenta UNA sola vez, cuando el pedido pasa a
     "listo" (ya se preparó). Cada descuento queda en movimientos_inventario.
   ============================================================ */

declare(strict_types=1);
require __DIR__ . '/conexion.php';

date_default_timezone_set('America/Mexico_City');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

const ESTADOS = ['pendiente', 'preparacion', 'listo', 'entregado'];
const COLUMNA_HORA = ['preparacion' => 'preparacion_en', 'listo' => 'listo_en', 'entregado' => 'entregado_en'];
const SECTORES = ['caliente', 'bebidas', 'postres'];
const CATEGORIAS = ['postres', 'comida', 'frias', 'calientes'];
const RUTA_FOTO = '/^img\/[A-Za-z0-9_.-]+\.(jpe?g|png|webp)$/i';

/** Error causado por datos inválidos: se responde con código 400 y el mensaje. */
class ErrorDatos extends Exception {}

function responder(array $datos, int $codigo = 200): void
{
    http_response_code($codigo);
    echo json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION);
    exit;
}

function cuerpo(): array
{
    $datos = json_decode(file_get_contents('php://input') ?: '{}', true);
    return is_array($datos) ? $datos : [];
}

function ahora(): string { return date('Y-m-d H:i:s'); }
function iso(?string $fecha): ?string { return $fecha ? (new DateTime($fecha))->format('c') : null; }
function num($v): float { return (float) $v; }
function texto($v, int $max): string { return mb_substr(trim((string) ($v ?? '')), 0, $max); }

/* ============================================================ LECTURAS */

function leer_insumos(PDO $bd): array
{
    $filas = $bd->query('SELECT * FROM insumos ORDER BY tipo, nombre')->fetchAll();
    return array_map(fn($i) => [
        'id' => $i['id'], 'nombre' => $i['nombre'], 'tipo' => $i['tipo'], 'unidad' => $i['unidad'],
        'existencia' => num($i['existencia']), 'minimo' => num($i['stock_minimo']), 'costo' => num($i['costo_unitario']),
    ], $filas);
}

function leer_menu(PDO $bd): array
{
    $productos = [];
    foreach ($bd->query('SELECT * FROM productos ORDER BY orden, nombre') as $p) {
        $productos[$p['id']] = [
            'id' => $p['id'], 'nombre' => $p['nombre'], 'categoria' => $p['categoria'], 'sector' => $p['sector'],
            'precio' => num($p['precio']), 'descripcion' => $p['descripcion'],
            'imagen' => $p['imagen'], 'disponible' => (bool) $p['disponible'], 'orden' => (int) $p['orden'],
            'receta' => [], 'opciones' => [],
        ];
    }
    foreach ($bd->query('SELECT producto_id, insumo_id, cantidad FROM recetas ORDER BY producto_id') as $r) {
        if (isset($productos[$r['producto_id']])) {
            $productos[$r['producto_id']]['receta'][] = ['insumoId' => $r['insumo_id'], 'cantidad' => num($r['cantidad'])];
        }
    }
    $opciones = [];
    foreach ($bd->query('SELECT * FROM opciones ORDER BY producto_id, orden, id') as $o) {
        $opciones[$o['id']] = ['producto' => $o['producto_id'], 'datos' => [
            'id' => $o['clave'], 'titulo' => $o['titulo'], 'tipo' => $o['tipo'], 'mostrarTotal' => (bool) $o['mostrar_total'],
            'incluidos' => $o['incluidos'] === null ? null : (int) $o['incluidos'],
            'extraAdicional' => $o['extra_adicional'] === null ? null : num($o['extra_adicional']),
            'elecciones' => [],
        ]];
    }
    $elecciones = [];
    foreach ($bd->query('SELECT * FROM elecciones ORDER BY opcion_id, orden, id') as $e) {
        $elecciones[$e['id']] = ['opcion' => $e['opcion_id'], 'datos' => [
            'nombre' => $e['nombre'], 'extra' => num($e['extra']), 'pideIndicaciones' => (bool) $e['pide_indicaciones'], 'receta' => [],
        ]];
    }
    foreach ($bd->query('SELECT eleccion_id, insumo_id, cantidad FROM receta_elecciones') as $r) {
        if (isset($elecciones[$r['eleccion_id']])) {
            $elecciones[$r['eleccion_id']]['datos']['receta'][] = ['insumoId' => $r['insumo_id'], 'cantidad' => num($r['cantidad'])];
        }
    }
    foreach ($elecciones as $e) {
        if (isset($opciones[$e['opcion']])) $opciones[$e['opcion']]['datos']['elecciones'][] = $e['datos'];
    }
    foreach ($opciones as $o) {
        if (isset($productos[$o['producto']])) $productos[$o['producto']]['opciones'][] = $o['datos'];
    }
    return array_values($productos);
}

function leer_pedidos(PDO $bd, ?int $id = null, int $limite = 300): array
{
    if ($id !== null) {
        $st = $bd->prepare('SELECT * FROM pedidos WHERE id = ?');
        $st->execute([$id]);
    } else {
        $st = $bd->query('SELECT * FROM pedidos ORDER BY creado DESC, id DESC LIMIT ' . max(1, min(1000, $limite)));
    }
    $pedidos = $st->fetchAll();
    if (!$pedidos) return [];

    $ids = array_column($pedidos, 'id');
    $marcas = implode(',', array_fill(0, count($ids), '?'));
    $st = $bd->prepare("SELECT * FROM pedido_productos WHERE pedido_id IN ($marcas) ORDER BY id");
    $st->execute($ids);
    $lineas = $st->fetchAll();

    $insumos = [];
    if ($lineas) {
        $lids = array_column($lineas, 'id');
        $marcas = implode(',', array_fill(0, count($lids), '?'));
        $st = $bd->prepare("SELECT * FROM pedido_insumos WHERE pedido_producto_id IN ($marcas) ORDER BY id");
        $st->execute($lids);
        foreach ($st as $r) {
            $insumos[$r['pedido_producto_id']][] = [
                'insumoId' => $r['insumo_id'], 'nombre' => $r['nombre'], 'cantidad' => num($r['cantidad']), 'unidad' => $r['unidad'],
            ];
        }
    }
    $porPedido = [];
    foreach ($lineas as $l) {
        $porPedido[$l['pedido_id']][] = [
            'productoId' => $l['producto_id'], 'nombre' => $l['nombre'], 'sector' => $l['sector'], 'cantidad' => (int) $l['cantidad'],
            'precioUnitario' => num($l['precio_unitario']), 'subtotal' => num($l['subtotal']),
            'opciones' => json_decode($l['opciones'], true) ?: [], 'indicaciones' => $l['indicaciones'],
            'receta' => $insumos[$l['id']] ?? [],
        ];
    }
    return array_map(fn($p) => [
        'id' => (string) $p['id'], 'folio' => $p['folio'], 'estado' => $p['estado'], 'tipo' => $p['tipo'],
        'cliente' => ['nombre' => $p['cliente_nombre'], 'telefono' => $p['cliente_telefono']],
        'direccion' => $p['tipo'] === 'domicilio' ? ['calle' => $p['calle'], 'colonia' => $p['colonia']] : null,
        'notas' => $p['notas'], 'total' => num($p['total']), 'creado' => iso($p['creado']),
        'historial' => array_filter([
            'pendiente' => iso($p['creado']), 'preparacion' => iso($p['preparacion_en']),
            'listo' => iso($p['listo_en']), 'entregado' => iso($p['entregado_en']),
        ]),
        'inventarioDescontado' => (bool) $p['inventario_descontado'],
        'productos' => $porPedido[$p['id']] ?? [],
    ], $pedidos);
}

function leer_movimientos(PDO $bd, int $limite = 500): array
{
    $sql = 'SELECT m.*, i.nombre, i.unidad, p.folio FROM movimientos_inventario m
            JOIN insumos i ON i.id = m.insumo_id
            LEFT JOIN pedidos p ON p.id = m.pedido_id
            ORDER BY m.creado DESC, m.id DESC LIMIT ' . max(1, min(2000, $limite));
    return array_map(fn($m) => [
        'id' => (string) $m['id'], 'insumoId' => $m['insumo_id'], 'nombre' => $m['nombre'], 'unidad' => $m['unidad'],
        'tipo' => $m['tipo'], 'cantidad' => num($m['cantidad']), 'existencia' => num($m['existencia_resultante']),
        'costo' => num($m['costo_unitario']), 'folio' => $m['folio'], 'nota' => $m['nota'], 'creado' => iso($m['creado']),
    ], $bd->query($sql)->fetchAll());
}

/* ============================================================ PEDIDOS */

/** Precio, textos de opciones y receta de UNA pieza con lo que eligió el cliente. */
function calcular_linea(array $p, array $sel): array
{
    $precio = $p['precio'];
    $textos = [];
    $receta = [];
    $pide = false;
    $sumar = function (array $lista) use (&$receta) {
        foreach ($lista as $r) $receta[$r['insumoId']] = ($receta[$r['insumoId']] ?? 0) + $r['cantidad'];
    };
    $sumar($p['receta']);
    foreach ($p['opciones'] as $op) {
        $valor = $sel[$op['id']] ?? null;
        $nombres = is_array($valor)
            ? array_values(array_unique(array_map('strval', $valor)))
            : (($valor === null || $valor === '') ? [] : [(string) $valor]);
        if ($op['tipo'] === 'una' && $op['elecciones'] && count($nombres) !== 1) {
            throw new ErrorDatos('Elige una opción de "' . $op['titulo'] . '" en ' . $p['nombre'] . '.');
        }
        foreach ($nombres as $n) {
            $el = null;
            foreach ($op['elecciones'] as $e) if ($e['nombre'] === $n) { $el = $e; break; }
            if (!$el) throw new ErrorDatos('La opción "' . $n . '" ya no existe en ' . $p['nombre'] . '.');
            $precio += $el['extra'];
            $sumar($el['receta']);
            if ($el['pideIndicaciones']) $pide = true;
        }
        if ($op['tipo'] === 'varias' && $op['incluidos'] !== null && ($op['extraAdicional'] ?? 0) > 0) {
            $precio += max(0, count($nombres) - $op['incluidos']) * $op['extraAdicional'];
        }
        if ($nombres) $textos[] = $op['titulo'] . ': ' . implode(', ', $nombres);
    }
    return [$precio, $textos, $receta, $pide];
}

function nuevo_folio(): string
{
    $letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    $s = '';
    for ($i = 0; $i < 4; $i++) $s .= $letras[random_int(0, strlen($letras) - 1)];
    return 'A-' . $s;
}

function crear_pedido(PDO $bd, array $d): array
{
    $tipo = (string) ($d['tipo'] ?? '');
    if (!in_array($tipo, ['recoger', 'domicilio'], true)) throw new ErrorDatos('Elige si recoges o es a domicilio.');
    $nombre = texto($d['cliente']['nombre'] ?? '', 60);
    if (mb_strlen($nombre) < 2) throw new ErrorDatos('Escribe tu nombre.');
    $telefono = preg_replace('/\D/', '', (string) ($d['cliente']['telefono'] ?? ''));
    if (strlen($telefono) !== 10) throw new ErrorDatos('Escribe un teléfono de 10 dígitos.');
    $calle = $colonia = null;
    if ($tipo === 'domicilio') {
        $calle = texto($d['direccion']['calle'] ?? '', 80);
        $colonia = texto($d['direccion']['colonia'] ?? '', 60);
        if (mb_strlen($calle) < 3 || mb_strlen($colonia) < 2) throw new ErrorDatos('Escribe la calle y la colonia.');
    }
    $notas = texto($d['notas'] ?? '', 200);
    $items = $d['productos'] ?? [];
    if (!is_array($items) || !$items || count($items) > 30) throw new ErrorDatos('El carrito está vacío o es demasiado grande.');

    $menu = [];
    foreach (leer_menu($bd) as $p) $menu[$p['id']] = $p;
    $insumos = [];
    foreach (leer_insumos($bd) as $i) $insumos[$i['id']] = $i;

    $lineas = [];
    $total = 0.0;
    $necesario = [];
    foreach ($items as $it) {
        $p = $menu[(string) ($it['productoId'] ?? '')] ?? null;
        if (!$p) throw new ErrorDatos('Un producto de tu carrito ya no existe.');
        if (!$p['disponible']) throw new ErrorDatos($p['nombre'] . ' está agotado.');
        $cantidad = (int) ($it['cantidad'] ?? 0);
        if ($cantidad < 1 || $cantidad > 20) throw new ErrorDatos('La cantidad debe ser de 1 a 20.');
        $sel = is_array($it['selecciones'] ?? null) ? $it['selecciones'] : [];
        $indicaciones = texto($it['indicaciones'] ?? '', 100);
        [$unitario, $textos, $receta, $pide] = calcular_linea($p, $sel);
        if ($pide && $indicaciones === '') throw new ErrorDatos('Escribe en Indicaciones los ingredientes de ' . $p['nombre'] . '.');
        foreach ($receta as $iid => $c) $necesario[$iid] = ($necesario[$iid] ?? 0) + $c * $cantidad;
        $lineas[] = compact('p', 'cantidad', 'indicaciones', 'unitario', 'textos', 'receta');
        $total += $unitario * $cantidad;
    }
    foreach ($necesario as $iid => $c) {
        $i = $insumos[$iid] ?? null;
        if ($i && $i['existencia'] < $c) throw new ErrorDatos('No alcanza ' . $i['nombre'] . ' para tu pedido. Quita o cambia ese producto.');
    }

    $bd->beginTransaction();
    try {
        $existe = $bd->prepare('SELECT 1 FROM pedidos WHERE folio = ?');
        do { $folio = nuevo_folio(); $existe->execute([$folio]); } while ($existe->fetch());
        $bd->prepare('INSERT INTO pedidos (folio, estado, tipo, cliente_nombre, cliente_telefono, calle, colonia, notas, total, creado)
                      VALUES (?, \'pendiente\', ?, ?, ?, ?, ?, ?, ?, ?)')
           ->execute([$folio, $tipo, $nombre, $telefono, $calle, $colonia, $notas, $total, ahora()]);
        $pedidoId = (int) $bd->lastInsertId();
        $insLinea = $bd->prepare('INSERT INTO pedido_productos (pedido_id, producto_id, nombre, sector, cantidad, precio_unitario, subtotal, opciones, indicaciones)
                                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $insInsumo = $bd->prepare('INSERT INTO pedido_insumos (pedido_producto_id, insumo_id, nombre, cantidad, unidad) VALUES (?, ?, ?, ?, ?)');
        foreach ($lineas as $l) {
            $insLinea->execute([$pedidoId, $l['p']['id'], $l['p']['nombre'], $l['p']['sector'], $l['cantidad'], $l['unitario'],
                $l['unitario'] * $l['cantidad'], json_encode($l['textos'], JSON_UNESCAPED_UNICODE), $l['indicaciones']]);
            $lineaId = (int) $bd->lastInsertId();
            foreach ($l['receta'] as $iid => $c) {
                $i = $insumos[$iid] ?? ['nombre' => $iid, 'unidad' => ''];
                $insInsumo->execute([$lineaId, $iid, $i['nombre'], $c * $l['cantidad'], $i['unidad']]);
            }
        }
        $bd->commit();
    } catch (Throwable $e) {
        if ($bd->inTransaction()) $bd->rollBack();
        throw $e;
    }
    return leer_pedidos($bd, $pedidoId)[0];
}

/** Resta del inventario lo que usó el pedido y lo registra (una sola vez). */
function descontar_inventario(PDO $bd, int $pedidoId, string $folio): void
{
    $st = $bd->prepare('SELECT pi.insumo_id, SUM(pi.cantidad) AS cantidad FROM pedido_insumos pi
                        JOIN pedido_productos pp ON pp.id = pi.pedido_producto_id
                        WHERE pp.pedido_id = ? GROUP BY pi.insumo_id');
    $st->execute([$pedidoId]);
    $restar = $bd->prepare('UPDATE insumos SET existencia = existencia - ? WHERE id = ?');
    $leer = $bd->prepare('SELECT existencia, costo_unitario FROM insumos WHERE id = ?');
    $mov = $bd->prepare("INSERT INTO movimientos_inventario (insumo_id, tipo, cantidad, existencia_resultante, costo_unitario, pedido_id, nota, creado)
                         VALUES (?, 'salida', ?, ?, ?, ?, ?, ?)");
    foreach ($st->fetchAll() as $r) {
        $cantidad = num($r['cantidad']);
        $restar->execute([$cantidad, $r['insumo_id']]);
        if ($restar->rowCount() === 0) continue;   // el insumo ya no existe
        $leer->execute([$r['insumo_id']]);
        $i = $leer->fetch();
        $mov->execute([$r['insumo_id'], -$cantidad, $i['existencia'], $i['costo_unitario'], $pedidoId, 'Pedido ' . $folio, ahora()]);
    }
    $bd->prepare('UPDATE pedidos SET inventario_descontado = 1 WHERE id = ?')->execute([$pedidoId]);
}

function cambiar_estado(PDO $bd, array $d): array
{
    $id = (int) ($d['id'] ?? 0);
    $estado = (string) ($d['estado'] ?? '');
    if (!isset(COLUMNA_HORA[$estado])) throw new ErrorDatos('Estado no válido.');
    $bd->beginTransaction();
    try {
        $st = $bd->prepare('SELECT id, folio, estado, inventario_descontado FROM pedidos WHERE id = ? FOR UPDATE');
        $st->execute([$id]);
        $p = $st->fetch();
        if (!$p) throw new ErrorDatos('El pedido ya no existe.');
        if (array_search($estado, ESTADOS, true) !== array_search($p['estado'], ESTADOS, true) + 1) {
            throw new ErrorDatos('Este pedido ya cambió de estado en otra pantalla.');
        }
        $columna = COLUMNA_HORA[$estado];
        $bd->prepare("UPDATE pedidos SET estado = ?, $columna = ? WHERE id = ?")->execute([$estado, ahora(), $id]);
        if ($estado === 'listo' && !(int) $p['inventario_descontado']) descontar_inventario($bd, $id, $p['folio']);
        $bd->commit();
    } catch (Throwable $e) {
        if ($bd->inTransaction()) $bd->rollBack();
        throw $e;
    }
    return leer_pedidos($bd, $id)[0];
}

/* ============================================================ MENÚ */

function agregar_producto(PDO $bd, array $d): array
{
    $nombre = texto($d['nombre'] ?? '', 80);
    if (mb_strlen($nombre) < 2) throw new ErrorDatos('Escribe el nombre del producto.');
    $precio = $d['precio'] ?? null;
    if (!is_numeric($precio) || $precio < 0) throw new ErrorDatos('Escribe un precio válido (0 o más).');
    $categoria = (string) ($d['categoria'] ?? '');
    $sector = (string) ($d['sector'] ?? '');
    if (!in_array($categoria, CATEGORIAS, true) || !in_array($sector, SECTORES, true)) throw new ErrorDatos('Categoría o sector no válido.');
    $imagen = texto($d['imagen'] ?? '', 80);
    if ($imagen !== '' && !preg_match(RUTA_FOTO, $imagen)) throw new ErrorDatos('Escribe la foto como img/nombre.jpg.');

    $base = trim(preg_replace('/[^a-z0-9]+/', '-', strtolower(iconv('UTF-8', 'ASCII//TRANSLIT', $nombre) ?: 'producto')), '-') ?: 'producto';
    $id = $base;
    $existe = $bd->prepare('SELECT 1 FROM productos WHERE id = ?');
    for ($n = 2; ; $n++) { $existe->execute([$id]); if (!$existe->fetch()) break; $id = $base . '-' . $n; }
    $orden = (int) $bd->query('SELECT COALESCE(MAX(orden), 0) + 1 FROM productos')->fetchColumn();
    $bd->prepare('INSERT INTO productos (id, nombre, categoria, sector, precio, descripcion, imagen, disponible, orden)
                  VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)')
       ->execute([$id, $nombre, $categoria, $sector, (float) $precio, texto($d['descripcion'] ?? '', 200), $imagen, $orden]);
    return ['id' => $id];
}

function actualizar_producto(PDO $bd, array $d): array
{
    $id = (string) ($d['id'] ?? '');
    $cambios = is_array($d['cambios'] ?? null) ? $d['cambios'] : [];
    $sets = [];
    $valores = [];
    foreach ($cambios as $campo => $valor) {
        switch ($campo) {
            case 'precio':
                if (!is_numeric($valor) || $valor < 0) throw new ErrorDatos('Escribe un precio válido (0 o más).');
                $sets[] = 'precio = ?'; $valores[] = (float) $valor; break;
            case 'disponible':
                $sets[] = 'disponible = ?'; $valores[] = $valor ? 1 : 0; break;
            case 'sector':
                if (!in_array($valor, SECTORES, true)) throw new ErrorDatos('Sector no válido.');
                $sets[] = 'sector = ?'; $valores[] = $valor; break;
            case 'imagen':
                $valor = texto($valor, 80);
                if ($valor !== '' && !preg_match(RUTA_FOTO, $valor)) throw new ErrorDatos('Escribe la foto como img/nombre.jpg.');
                $sets[] = 'imagen = ?'; $valores[] = $valor; break;
            default:
                throw new ErrorDatos('No se puede cambiar el campo ' . $campo . '.');
        }
    }
    if (!$sets) throw new ErrorDatos('No hay cambios.');
    $valores[] = $id;
    $st = $bd->prepare('UPDATE productos SET ' . implode(', ', $sets) . ' WHERE id = ?');
    $st->execute($valores);
    return ['id' => $id];
}

function eliminar_producto(PDO $bd, array $d): array
{
    $st = $bd->prepare('DELETE FROM productos WHERE id = ?');
    $st->execute([(string) ($d['id'] ?? '')]);
    if ($st->rowCount() === 0) throw new ErrorDatos('El producto ya no existe.');
    return ['ok' => true];
}

/* ============================================================ INVENTARIO */

function insumo_o_error(PDO $bd, string $id): array
{
    $st = $bd->prepare('SELECT * FROM insumos WHERE id = ? FOR UPDATE');
    $st->execute([$id]);
    $i = $st->fetch();
    if (!$i) throw new ErrorDatos('El insumo no existe.');
    return $i;
}

function movimiento(PDO $bd, string $insumoId, string $tipo, float $cantidad, string $nota): void
{
    $st = $bd->prepare('SELECT existencia, costo_unitario FROM insumos WHERE id = ?');
    $st->execute([$insumoId]);
    $i = $st->fetch();
    $bd->prepare('INSERT INTO movimientos_inventario (insumo_id, tipo, cantidad, existencia_resultante, costo_unitario, nota, creado)
                  VALUES (?, ?, ?, ?, ?, ?, ?)')
       ->execute([$insumoId, $tipo, $cantidad, $i['existencia'], $i['costo_unitario'], $nota, ahora()]);
}

function registrar_entrada(PDO $bd, array $d): array
{
    $id = (string) ($d['insumoId'] ?? '');
    $cantidad = $d['cantidad'] ?? null;
    if (!is_numeric($cantidad) || $cantidad <= 0 || $cantidad > 1000000) throw new ErrorDatos('Escribe una cantidad mayor que 0.');
    $costo = $d['costo'] ?? null;
    if ($costo !== null && $costo !== '' && (!is_numeric($costo) || $costo < 0)) throw new ErrorDatos('El costo debe ser 0 o más.');
    $bd->beginTransaction();
    try {
        insumo_o_error($bd, $id);
        $bd->prepare('UPDATE insumos SET existencia = existencia + ?' . (is_numeric($costo) ? ', costo_unitario = ?' : '') . ' WHERE id = ?')
           ->execute(is_numeric($costo) ? [(float) $cantidad, (float) $costo, $id] : [(float) $cantidad, $id]);
        movimiento($bd, $id, 'entrada', (float) $cantidad, texto($d['nota'] ?? 'Compra', 120) ?: 'Compra');
        $bd->commit();
    } catch (Throwable $e) {
        if ($bd->inTransaction()) $bd->rollBack();
        throw $e;
    }
    return ['ok' => true];
}

function ajustar_existencia(PDO $bd, array $d): array
{
    $id = (string) ($d['insumoId'] ?? '');
    $nueva = $d['existencia'] ?? null;
    if (!is_numeric($nueva) || $nueva < 0) throw new ErrorDatos('La existencia contada debe ser 0 o más.');
    $bd->beginTransaction();
    try {
        $i = insumo_o_error($bd, $id);
        $diferencia = (float) $nueva - (float) $i['existencia'];
        if (abs($diferencia) > 0.0001) {
            $bd->prepare('UPDATE insumos SET existencia = ? WHERE id = ?')->execute([(float) $nueva, $id]);
            movimiento($bd, $id, 'ajuste', $diferencia, texto($d['nota'] ?? 'Conteo físico', 120) ?: 'Conteo físico');
        }
        $bd->commit();
    } catch (Throwable $e) {
        if ($bd->inTransaction()) $bd->rollBack();
        throw $e;
    }
    return ['ok' => true];
}

function actualizar_insumo(PDO $bd, array $d): array
{
    $id = (string) ($d['id'] ?? '');
    $campo = (string) ($d['campo'] ?? '');
    $valor = $d['valor'] ?? null;
    $columnas = ['minimo' => 'stock_minimo', 'costo' => 'costo_unitario'];
    if (!isset($columnas[$campo])) throw new ErrorDatos('No se puede cambiar ese dato.');
    if (!is_numeric($valor) || $valor < 0) throw new ErrorDatos('El valor debe ser 0 o más.');
    $st = $bd->prepare('UPDATE insumos SET ' . $columnas[$campo] . ' = ? WHERE id = ?');
    $st->execute([(float) $valor, $id]);
    return ['ok' => true];
}

/* ============================================================ RUTAS */

$accion = (string) ($_GET['accion'] ?? '');
$escrituras = ['crear_pedido', 'cambiar_estado', 'agregar_producto', 'actualizar_producto', 'eliminar_producto',
               'registrar_entrada', 'ajustar_existencia', 'actualizar_insumo'];
try {
    if (in_array($accion, $escrituras, true) && ($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        responder(['ok' => false, 'error' => 'Usa POST para esta acción.'], 405);
    }
    $bd = conexion();
    switch ($accion) {
        case 'estado':
            $bd->query('SELECT 1');
            responder(['ok' => true, 'modo' => 'mysql', 'version' => 5]);
        case 'menu':        responder(['ok' => true, 'menu' => leer_menu($bd)]);
        case 'insumos':     responder(['ok' => true, 'insumos' => leer_insumos($bd)]);
        case 'pedidos':     responder(['ok' => true, 'pedidos' => leer_pedidos($bd)]);
        case 'pedido':
            $p = leer_pedidos($bd, (int) ($_GET['id'] ?? 0));
            responder(['ok' => true, 'pedido' => $p[0] ?? null]);
        case 'movimientos': responder(['ok' => true, 'movimientos' => leer_movimientos($bd)]);
        case 'crear_pedido':        responder(['ok' => true, 'pedido' => crear_pedido($bd, cuerpo())]);
        case 'cambiar_estado':      responder(['ok' => true, 'pedido' => cambiar_estado($bd, cuerpo())]);
        case 'agregar_producto':    responder(['ok' => true] + agregar_producto($bd, cuerpo()));
        case 'actualizar_producto': responder(['ok' => true] + actualizar_producto($bd, cuerpo()));
        case 'eliminar_producto':   responder(eliminar_producto($bd, cuerpo()));
        case 'registrar_entrada':   responder(registrar_entrada($bd, cuerpo()));
        case 'ajustar_existencia':  responder(ajustar_existencia($bd, cuerpo()));
        case 'actualizar_insumo':   responder(actualizar_insumo($bd, cuerpo()));
        default:
            responder(['ok' => false, 'error' => 'Acción no reconocida.'], 404);
    }
} catch (ErrorDatos $e) {
    responder(['ok' => false, 'error' => $e->getMessage()], 400);
} catch (PDOException $e) {
    // En un sistema real este detalle se guarda en un log y no se muestra.
    responder(['ok' => false, 'error' => 'No se pudo usar la base de datos MySQL: ' . $e->getMessage(), 'bd' => true], 500);
} catch (Throwable $e) {
    responder(['ok' => false, 'error' => 'Error del servidor: ' . $e->getMessage()], 500);
}
