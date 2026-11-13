<?php
/* ============================================================
   Rappidos · conexion.php
   Datos para conectarse a MySQL. Con XAMPP normalmente el usuario
   es "root" y la contraseña va vacía. Si tu MySQL usa otros datos,
   cámbialos aquí.
   ============================================================ */

declare(strict_types=1);

const BD_HOST    = '127.0.0.1';
const BD_PUERTO  = 3306;
const BD_NOMBRE  = 'rappidos';
const BD_USUARIO = 'root';
const BD_CLAVE   = '';

function conexion(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        // Variables de entorno opcionales (útiles para pruebas automáticas).
        $host    = getenv('RAPPIDOS_BD_HOST') ?: BD_HOST;
        $usuario = getenv('RAPPIDOS_BD_USUARIO') ?: BD_USUARIO;
        $clave   = getenv('RAPPIDOS_BD_CLAVE') !== false ? getenv('RAPPIDOS_BD_CLAVE') : BD_CLAVE;
        $dsn = 'mysql:host=' . $host . ';port=' . BD_PUERTO . ';dbname=' . BD_NOMBRE . ';charset=utf8mb4';
        $pdo = new PDO($dsn, $usuario, $clave, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    }
    return $pdo;
}
