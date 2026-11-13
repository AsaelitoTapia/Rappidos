/* ============================================================
   Rappidos · util.js
   Constantes y funciones que usan las dos páginas:
   estados, categorías, precios y recetas (para el inventario).
   ============================================================ */

// Estados del pedido, en orden. "color" es el color del semáforo.
const ESTADOS = {
  pendiente:   { texto: "Pendiente",      color: "rojo",     siguiente: "preparacion", boton: "Empezar a preparar" },
  preparacion: { texto: "En preparación", color: "amarillo", siguiente: "listo",       boton: "Marcar como listo" },
  listo:       { texto: "Listo",          color: "verde",    siguiente: "entregado",   boton: "Marcar como entregado" },
  entregado:   { texto: "Entregado",      color: "gris",     siguiente: null,          boton: "" }
};
const ORDEN_ESTADOS = ["pendiente", "preparacion", "listo", "entregado"];
const ESTADOS_ACTIVOS = ["pendiente", "preparacion", "listo"];

const SECTORES = { caliente: "Cocina caliente", bebidas: "Bebidas", postres: "Postres" };

const CATEGORIAS = {
  postres: "Mini pancakes y postres",
  comida: "Alimentos",
  frias: "Bebidas frías",
  calientes: "Bebidas calientes"
};
const SECTOR_SUGERIDO = { postres: "postres", comida: "caliente", frias: "bebidas", calientes: "bebidas" };

// Foto de un producto: archivo dentro de la carpeta img/ (jpg, png o webp).
const RUTA_FOTO = /^img\/[A-Za-z0-9_.-]+\.(jpe?g|png|webp)$/i;

const UNIDADES = { g: "g", ml: "mL", pza: "pza" };

const Util = {
  dinero(n) {
    const v = Number(n) || 0;
    return "$" + v.toLocaleString("es-MX", { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 });
  },
  // Cantidad con unidad: 1500 g -> "1.5 kg"; 250 ml -> "250 mL"; 3 pza -> "3 pza"
  cantidad(n, unidad, corta) {
    const v = Number(n) || 0;
    const fmt = x => x.toLocaleString("es-MX", { maximumFractionDigits: Math.abs(x) < 10 ? 1 : 0 });
    if (!corta && unidad === "g" && Math.abs(v) >= 1000) return fmt(v / 1000) + " kg";
    if (!corta && unidad === "ml" && Math.abs(v) >= 1000) return fmt(v / 1000) + " L";
    return fmt(v) + " " + (UNIDADES[unidad] || unidad || "");
  },
  esc(texto) {
    return String(texto ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  },
  hora(iso) {
    const d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
  },
  fechaHora(iso) {
    const d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  },
  minutosDesde(iso) {
    const t = Date.parse(iso);
    return isNaN(t) ? null : Math.max(0, Math.floor((Date.now() - t) / 60000));
  },
  textoMinutos(min) {
    if (min === null || min === undefined) return "";
    if (min < 1) return "menos de 1 min";
    if (min < 60) return min + " min";
    const h = Math.floor(min / 60), m = min % 60;
    return h + " h" + (m ? " " + m + " min" : "");
  },
  nuevoFolio() {
    const letras = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let s = "";
    for (let i = 0; i < 4; i++) s += letras[Math.floor(Math.random() * letras.length)];
    return "A-" + s;
  },
  recordar(clave, valor) { try { localStorage.setItem(clave, JSON.stringify(valor)); } catch (e) { /* sin memoria */ } },
  recuperar(clave, porDefecto) {
    try { const t = localStorage.getItem(clave); return t ? JSON.parse(t) : porDefecto; } catch (e) { return porDefecto; }
  },
  olvidar(clave) { try { localStorage.removeItem(clave); } catch (e) { /* nada */ } },
  aviso(el, mensaje, tipo) {
    if (!el) return;
    el.textContent = mensaje;
    el.dataset.tipo = tipo || "ok";
    el.hidden = false;
    clearTimeout(el._temporizador);
    el._temporizador = setTimeout(() => { el.hidden = true; }, 6000);
  }
};

/* ---------- Precios ---------- */
const Precios = {
  elegidos(selecciones, op) {
    const sel = selecciones ? selecciones[op.id] : null;
    return Array.isArray(sel) ? sel : (sel ? [sel] : []);
  },
  unitario(producto, selecciones) {
    let total = Number(producto.precio) || 0;
    (producto.opciones || []).forEach(op => {
      const nombres = this.elegidos(selecciones, op);
      nombres.forEach(n => {
        const el = (op.elecciones || []).find(x => x.nombre === n);
        if (el) total += Number(el.extra) || 0;
      });
      if (op.tipo === "varias" && op.incluidos != null && Number(op.extraAdicional) > 0) {
        total += Math.max(0, nombres.length - Number(op.incluidos)) * Number(op.extraAdicional);
      }
    });
    return total;
  },
  rango(producto) {
    let min = Number(producto.precio) || 0, max = min;
    (producto.opciones || []).forEach(op => {
      if (op.tipo !== "una" || !(op.elecciones || []).length) return;
      const extras = op.elecciones.map(e => Number(e.extra) || 0);
      min += Math.min(...extras);
      max += Math.max(...extras);
    });
    return { min, max };
  },
  texto(producto) {
    const r = this.rango(producto);
    return (r.max > r.min ? "Desde " : "") + Util.dinero(r.min);
  },
  // Selección por defecto: la primera elección en "una", ninguna en "varias".
  porDefecto(producto) {
    const sel = {};
    (producto.opciones || []).forEach(op => {
      sel[op.id] = op.tipo === "varias" ? [] : ((op.elecciones || [])[0] || {}).nombre;
    });
    return sel;
  }
};

/* ---------- Recetas ----------
   Cantidad de cada insumo que lleva un producto. Se usa para mostrar las
   cantidades en cocina y para descontar el inventario. */
const Recetas = {
  // Receta de UNA pieza con lo elegido: [{ insumoId, cantidad }] (sumando repetidos).
  deProducto(producto, selecciones) {
    const mapa = new Map();
    const sumar = lista => (lista || []).forEach(r => {
      mapa.set(r.insumoId, (mapa.get(r.insumoId) || 0) + (Number(r.cantidad) || 0));
    });
    sumar(producto.receta);
    (producto.opciones || []).forEach(op => {
      Precios.elegidos(selecciones, op).forEach(n => {
        const el = (op.elecciones || []).find(x => x.nombre === n);
        if (el) sumar(el.receta);
      });
    });
    return [...mapa].map(([insumoId, cantidad]) => ({ insumoId, cantidad }));
  },

  // Agrega nombre y unidad: [{ insumoId, nombre, cantidad, unidad, tipo }]
  detalle(receta, insumos, factor) {
    const f = factor || 1;
    return receta.map(r => {
      const i = insumos.get(r.insumoId) || {};
      return { insumoId: r.insumoId, nombre: i.nombre || r.insumoId, cantidad: r.cantidad * f, unidad: i.unidad || "", tipo: i.tipo || "ingrediente" };
    });
  },

  // ¿Alcanza el inventario para preparar "factor" piezas?
  faltantes(receta, insumos, factor) {
    const f = factor || 1;
    return receta.filter(r => {
      const i = insumos.get(r.insumoId);
      return i && Number(i.existencia) < r.cantidad * f;
    }).map(r => insumos.get(r.insumoId).nombre);
  }
};
