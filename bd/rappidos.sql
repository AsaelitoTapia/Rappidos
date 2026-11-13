-- ============================================================
-- Rappidos · Base de datos MySQL / MariaDB
-- Sistema web de pedidos para Mr's Pancake (prototipo escolar)
-- Administración de Proyectos Informáticos · UAEMex Atlacomulco
--
-- Cómo usarla (XAMPP):
--   1. Abre http://localhost/phpmyadmin
--   2. Pestaña "Importar" > elige este archivo > "Importar".
--   Crea la base "rappidos" con sus tablas y los datos iniciales.
--   OJO: si la base ya existe, BORRA sus tablas y las vuelve a crear.
--
-- Las recetas y los costos son una propuesta: deben validarse con el negocio.
-- ============================================================

SET NAMES utf8mb4;
SET time_zone = '-06:00';  -- hora del centro de México (para NOW())

CREATE DATABASE IF NOT EXISTS rappidos CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE rappidos;

SET FOREIGN_KEY_CHECKS = 0;
DROP VIEW IF EXISTS vista_consumo_insumos;
DROP TABLE IF EXISTS movimientos_inventario, pedido_insumos, pedido_productos, pedidos,
  receta_elecciones, recetas, elecciones, opciones, productos, insumos;
SET FOREIGN_KEY_CHECKS = 1;

-- Materia prima y empaques.
CREATE TABLE insumos (
  id             VARCHAR(40)  NOT NULL PRIMARY KEY,
  nombre         VARCHAR(80)  NOT NULL,
  tipo           ENUM('ingrediente','empaque') NOT NULL DEFAULT 'ingrediente',
  unidad         ENUM('g','ml','pza') NOT NULL,
  existencia     DECIMAL(12,2) NOT NULL DEFAULT 0,
  stock_minimo   DECIMAL(12,2) NOT NULL DEFAULT 0,
  costo_unitario DECIMAL(12,4) NOT NULL DEFAULT 0 COMMENT 'Pesos por g, mL o pieza'
) ENGINE=InnoDB;

CREATE TABLE productos (
  id           VARCHAR(40)  NOT NULL PRIMARY KEY,
  nombre       VARCHAR(80)  NOT NULL,
  categoria    VARCHAR(20)  NOT NULL,
  sector       VARCHAR(20)  NOT NULL,
  precio       DECIMAL(8,2) NOT NULL,
  descripcion  VARCHAR(200) NOT NULL DEFAULT '',
  imagen       VARCHAR(80)  NOT NULL DEFAULT '',
  disponible   TINYINT(1)   NOT NULL DEFAULT 1,
  orden        INT          NOT NULL DEFAULT 0
) ENGINE=InnoDB;

CREATE TABLE opciones (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  producto_id     VARCHAR(40)  NOT NULL,
  clave           VARCHAR(30)  NOT NULL,
  titulo          VARCHAR(60)  NOT NULL,
  tipo            ENUM('una','varias') NOT NULL,
  mostrar_total   TINYINT(1)   NOT NULL DEFAULT 0,
  incluidos       INT          NULL,
  extra_adicional DECIMAL(8,2) NULL,
  orden           INT          NOT NULL DEFAULT 0,
  UNIQUE KEY uq_opcion (producto_id, clave),
  CONSTRAINT fk_opcion_producto FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE elecciones (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  opcion_id         INT          NOT NULL,
  nombre            VARCHAR(100) NOT NULL,
  extra             DECIMAL(8,2) NOT NULL DEFAULT 0,
  pide_indicaciones TINYINT(1)   NOT NULL DEFAULT 0,
  orden             INT          NOT NULL DEFAULT 0,
  CONSTRAINT fk_eleccion_opcion FOREIGN KEY (opcion_id) REFERENCES opciones(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Receta base de cada producto (una pieza).
CREATE TABLE recetas (
  producto_id VARCHAR(40)   NOT NULL,
  insumo_id   VARCHAR(40)   NOT NULL,
  cantidad    DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (producto_id, insumo_id),
  CONSTRAINT fk_receta_producto FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_receta_insumo   FOREIGN KEY (insumo_id)   REFERENCES insumos(id) ON UPDATE CASCADE
) ENGINE=InnoDB;

-- Lo que agrega cada elección (ej. el topping Nutella agrega 20 g de Nutella).
CREATE TABLE receta_elecciones (
  eleccion_id INT           NOT NULL,
  insumo_id   VARCHAR(40)   NOT NULL,
  cantidad    DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (eleccion_id, insumo_id),
  CONSTRAINT fk_receta_eleccion FOREIGN KEY (eleccion_id) REFERENCES elecciones(id) ON DELETE CASCADE,
  CONSTRAINT fk_receta_el_insumo FOREIGN KEY (insumo_id)  REFERENCES insumos(id) ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE pedidos (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  folio                 CHAR(6)       NOT NULL UNIQUE,
  estado                ENUM('pendiente','preparacion','listo','entregado') NOT NULL DEFAULT 'pendiente',
  tipo                  ENUM('recoger','domicilio') NOT NULL,
  cliente_nombre        VARCHAR(60)   NOT NULL,
  cliente_telefono      CHAR(10)      NOT NULL,
  calle                 VARCHAR(80)   NULL,
  colonia               VARCHAR(60)   NULL,
  notas                 VARCHAR(200)  NOT NULL DEFAULT '',
  total                 DECIMAL(10,2) NOT NULL,
  creado                DATETIME      NOT NULL,
  preparacion_en        DATETIME      NULL,
  listo_en              DATETIME      NULL,
  entregado_en          DATETIME      NULL,
  inventario_descontado TINYINT(1)    NOT NULL DEFAULT 0,
  INDEX ix_pedidos_estado (estado),
  INDEX ix_pedidos_creado (creado)
) ENGINE=InnoDB;

CREATE TABLE pedido_productos (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  pedido_id       INT           NOT NULL,
  producto_id     VARCHAR(40)   NOT NULL,
  nombre          VARCHAR(80)   NOT NULL,
  sector          VARCHAR(20)   NOT NULL,
  cantidad        INT           NOT NULL,
  precio_unitario DECIMAL(8,2)  NOT NULL,
  subtotal        DECIMAL(10,2) NOT NULL,
  opciones        TEXT          NOT NULL COMMENT 'Lista en JSON, ej. ["Sabor: Oreo"]',
  indicaciones    VARCHAR(100)  NOT NULL DEFAULT '',
  CONSTRAINT fk_pp_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Ingredientes que usa cada renglón del pedido (ya multiplicados por la cantidad).
CREATE TABLE pedido_insumos (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  pedido_producto_id INT           NOT NULL,
  insumo_id          VARCHAR(40)   NOT NULL,
  nombre             VARCHAR(80)   NOT NULL,
  cantidad           DECIMAL(10,2) NOT NULL,
  unidad             VARCHAR(5)    NOT NULL,
  CONSTRAINT fk_pi_pp FOREIGN KEY (pedido_producto_id) REFERENCES pedido_productos(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Cada entrada (compra), salida (pedido preparado) o ajuste (conteo físico).
CREATE TABLE movimientos_inventario (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  insumo_id             VARCHAR(40)   NOT NULL,
  tipo                  ENUM('entrada','salida','ajuste') NOT NULL,
  cantidad              DECIMAL(12,2) NOT NULL COMMENT 'Positiva entra, negativa sale',
  existencia_resultante DECIMAL(12,2) NOT NULL,
  costo_unitario        DECIMAL(12,4) NOT NULL,
  pedido_id             INT           NULL,
  nota                  VARCHAR(120)  NOT NULL DEFAULT '',
  creado                DATETIME      NOT NULL,
  INDEX ix_mov_creado (creado),
  CONSTRAINT fk_mov_insumo FOREIGN KEY (insumo_id) REFERENCES insumos(id) ON UPDATE CASCADE,
  CONSTRAINT fk_mov_pedido FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Cuánto se ha gastado de cada insumo por los pedidos preparados.
CREATE VIEW vista_consumo_insumos AS
SELECT i.id AS insumo_id, i.nombre, i.unidad,
       -SUM(m.cantidad) AS cantidad_usada,
       -SUM(m.cantidad * m.costo_unitario) AS costo_usado
FROM movimientos_inventario m
JOIN insumos i ON i.id = m.insumo_id
WHERE m.tipo = 'salida'
GROUP BY i.id, i.nombre, i.unidad;


-- ---------------- Datos iniciales ----------------

INSERT INTO insumos (id, nombre, tipo, unidad, existencia, stock_minimo, costo_unitario) VALUES
('harina-hotcakes', 'Harina para hot cakes', 'ingrediente', 'g', 5000, 1500, 0.06),
('harina-trigo', 'Harina de trigo', 'ingrediente', 'g', 3000, 1000, 0.025),
('leche', 'Leche entera', 'ingrediente', 'ml', 12000, 4000, 0.028),
('huevo', 'Huevo', 'ingrediente', 'g', 3000, 1000, 0.055),
('mantequilla', 'Mantequilla', 'ingrediente', 'g', 1000, 300, 0.25),
('azucar', 'Azúcar', 'ingrediente', 'g', 3000, 1000, 0.03),
('azucar-glass', 'Azúcar glass', 'ingrediente', 'g', 1000, 300, 0.05),
('nutella', 'Crema de avellana (Nutella)', 'ingrediente', 'g', 2000, 700, 0.3),
('kinder-delice', 'Kinder Delice', 'ingrediente', 'g', 800, 300, 0.55),
('oreo', 'Galleta Oreo', 'ingrediente', 'g', 1500, 500, 0.18),
('palitos-chocolate', 'Palitos de chocolate', 'ingrediente', 'g', 800, 300, 0.3),
('coco-rayado', 'Coco rayado', 'ingrediente', 'g', 600, 200, 0.15),
('granola', 'Granola', 'ingrediente', 'g', 1000, 300, 0.12),
('nueces', 'Nueces', 'ingrediente', 'g', 800, 250, 0.35),
('durazno-almibar', 'Durazno en almíbar', 'ingrediente', 'g', 2500, 800, 0.06),
('fresa', 'Fresa', 'ingrediente', 'g', 6000, 2000, 0.07),
('mango', 'Mango', 'ingrediente', 'g', 2000, 600, 0.04),
('lechera', 'Leche condensada (Lechera)', 'ingrediente', 'g', 2500, 800, 0.09),
('cajeta', 'Cajeta', 'ingrediente', 'g', 1500, 500, 0.12),
('queso-crema', 'Queso crema (Philadelphia)', 'ingrediente', 'g', 1500, 500, 0.2),
('media-crema', 'Media crema', 'ingrediente', 'g', 3000, 1000, 0.1),
('crema-batida', 'Crema batida', 'ingrediente', 'g', 1000, 300, 0.25),
('jarabe-maple', 'Jarabe sabor maple', 'ingrediente', 'g', 1500, 400, 0.08),
('totopos', 'Totopos', 'ingrediente', 'g', 4000, 1200, 0.08),
('salsa-verde', 'Salsa verde', 'ingrediente', 'g', 5000, 1500, 0.05),
('queso-fresco', 'Queso fresco', 'ingrediente', 'g', 2000, 600, 0.16),
('cebolla', 'Cebolla', 'ingrediente', 'g', 1500, 400, 0.03),
('pan-baguette', 'Pan baguette', 'ingrediente', 'pza', 20, 6, 12),
('pan-caja', 'Pan de caja', 'ingrediente', 'g', 2500, 700, 0.07),
('jamon', 'Jamón', 'ingrediente', 'g', 1500, 500, 0.2),
('queso-manchego', 'Queso manchego', 'ingrediente', 'g', 1500, 500, 0.22),
('papas-fritas', 'Papas fritas de bolsa', 'ingrediente', 'g', 1500, 400, 0.18),
('hielo', 'Hielo', 'ingrediente', 'g', 20000, 5000, 0.004),
('agua', 'Agua purificada', 'ingrediente', 'ml', 40000, 10000, 0.002),
('agua-mineral', 'Agua mineral', 'ingrediente', 'ml', 12000, 4000, 0.03),
('cafe-molido', 'Café molido', 'ingrediente', 'g', 2000, 500, 0.4),
('matcha', 'Té matcha en polvo', 'ingrediente', 'g', 400, 100, 2.5),
('polvo-chocolate', 'Chocolate en polvo endulzado', 'ingrediente', 'g', 3000, 900, 0.12),
('polvo-taro', 'Polvo sabor taro', 'ingrediente', 'g', 1000, 300, 0.3),
('jarabe-frambuesa', 'Jarabe sabor frambuesa', 'ingrediente', 'ml', 1500, 400, 0.3),
('jarabe-manzana', 'Jarabe sabor manzana verde', 'ingrediente', 'ml', 1500, 400, 0.3),
('jarabe-mora', 'Jarabe sabor mora azul', 'ingrediente', 'ml', 1500, 400, 0.3),
('jarabe-fresa', 'Jarabe sabor fresa', 'ingrediente', 'ml', 1500, 400, 0.3),
('jarabe-amaretto', 'Jarabe sabor amaretto', 'ingrediente', 'ml', 1000, 300, 0.3),
('jarabe-almendra', 'Jarabe sabor almendra', 'ingrediente', 'ml', 1000, 300, 0.3),
('vaso-16oz', 'Vaso de 16 oz con tapa', 'empaque', 'pza', 300, 80, 3.5),
('vaso-12oz', 'Vaso de 12 oz con tapa', 'empaque', 'pza', 300, 80, 3),
('vaso-4oz', 'Vaso de 4 oz para espresso', 'empaque', 'pza', 150, 40, 1.5),
('bowl', 'Bowl de cartón', 'empaque', 'pza', 200, 50, 5),
('plato', 'Plato desechable', 'empaque', 'pza', 300, 80, 3),
('palito', 'Palito para brocheta', 'empaque', 'pza', 500, 100, 0.3);

INSERT INTO productos (id, nombre, categoria, sector, precio, descripcion, imagen, disponible, orden) VALUES
('bowl-mini-pancakes', 'Bowl de mini pancakes', 'postres', 'postres', 60, 'Mini pancakes con 4 toppings incluidos. Cada topping extra cuesta $8.', 'img/bowl-mini-pancakes.jpg', 1, 1),
('crepas', 'Crepas', 'postres', 'postres', 56, 'Elige tu crepa favorita o arma la tuya con 4 ingredientes.', 'img/crepas.jpg', 1, 2),
('wafles', 'Wafles con fruta', 'postres', 'postres', 55, 'Wafles acompañados de fruta.', 'img/wafles.jpg', 1, 3),
('fresas-con-crema', 'Fresas con crema', 'postres', 'postres', 50, 'En vaso: chico, mediano o grande.', 'img/fresas-con-crema.jpg', 1, 4),
('brochetas', 'Brochetas con crema de avellana', 'postres', 'postres', 30, 'Mini pancakes y fruta en brocheta, con crema de avellana.', 'img/brochetas.jpg', 1, 5),
('chilaquiles', 'Chilaquiles', 'comida', 'caliente', 55, '', 'img/chilaquiles.jpg', 1, 6),
('baguette-chilaquiles', 'Baguette de chilaquiles', 'comida', 'caliente', 65, '', 'img/baguette-chilaquiles.jpg', 1, 7),
('sandwich', 'Sandwich de jamón y queso', 'comida', 'caliente', 45, 'Sencillo o con papas.', 'img/sandwich.jpg', 1, 8),
('frappe', 'Frappé', 'frias', 'bebidas', 60, 'Galleta Oreo, chocolate, matcha, taro o capuchino.', 'img/frappe.jpg', 1, 9),
('soda-italiana', 'Soda italiana', 'frias', 'bebidas', 56, '', 'img/soda-italiana.jpg', 1, 10),
('capuchino-frio', 'Capuchino frío', 'frias', 'bebidas', 56, 'Clásico o con sabor.', '', 1, 11),
('latte-frio', 'Latte frío', 'frias', 'bebidas', 56, 'Clásico o con sabor.', '', 1, 12),
('chocolate-frio', 'Chocolate frío', 'frias', 'bebidas', 52, '', '', 1, 13),
('cafe-americano', 'Café americano', 'calientes', 'bebidas', 40, 'Sencillo o doble.', 'img/cafe-americano.jpg', 1, 14),
('espresso', 'Espresso', 'calientes', 'bebidas', 16, 'Sencillo o doble.', '', 1, 15),
('latte', 'Latte', 'calientes', 'bebidas', 56, 'Clásico o con sabor.', 'img/latte.jpg', 1, 16),
('capuchino', 'Capuchino', 'calientes', 'bebidas', 55, 'Clásico o con sabor.', 'img/capuchino.jpg', 1, 17),
('matcha', 'Matcha', 'calientes', 'bebidas', 56, 'Frío o caliente.', 'img/matcha.jpg', 1, 18),
('chocolate-caliente', 'Chocolate caliente', 'calientes', 'bebidas', 55, '', '', 1, 19);

INSERT INTO recetas (producto_id, insumo_id, cantidad) VALUES
('bowl-mini-pancakes', 'harina-hotcakes', 70),
('bowl-mini-pancakes', 'leche', 60),
('bowl-mini-pancakes', 'huevo', 25),
('bowl-mini-pancakes', 'mantequilla', 5),
('bowl-mini-pancakes', 'bowl', 1),
('crepas', 'harina-trigo', 35),
('crepas', 'leche', 60),
('crepas', 'huevo', 15),
('crepas', 'mantequilla', 3),
('crepas', 'azucar-glass', 3),
('crepas', 'plato', 1),
('wafles', 'harina-hotcakes', 80),
('wafles', 'leche', 65),
('wafles', 'huevo', 25),
('wafles', 'mantequilla', 8),
('wafles', 'fresa', 80),
('wafles', 'jarabe-maple', 30),
('wafles', 'plato', 1),
('fresas-con-crema', 'fresa', 150),
('fresas-con-crema', 'media-crema', 60),
('fresas-con-crema', 'lechera', 25),
('fresas-con-crema', 'vaso-16oz', 1),
('brochetas', 'harina-hotcakes', 25),
('brochetas', 'leche', 20),
('brochetas', 'huevo', 8),
('brochetas', 'fresa', 30),
('brochetas', 'mango', 30),
('brochetas', 'nutella', 15),
('brochetas', 'palito', 1),
('chilaquiles', 'totopos', 90),
('chilaquiles', 'salsa-verde', 120),
('chilaquiles', 'media-crema', 25),
('chilaquiles', 'queso-fresco', 25),
('chilaquiles', 'cebolla', 10),
('chilaquiles', 'plato', 1),
('baguette-chilaquiles', 'pan-baguette', 1),
('baguette-chilaquiles', 'totopos', 60),
('baguette-chilaquiles', 'salsa-verde', 80),
('baguette-chilaquiles', 'media-crema', 20),
('baguette-chilaquiles', 'queso-fresco', 20),
('baguette-chilaquiles', 'cebolla', 8),
('baguette-chilaquiles', 'plato', 1),
('sandwich', 'pan-caja', 55),
('sandwich', 'jamon', 40),
('sandwich', 'queso-manchego', 30),
('sandwich', 'mantequilla', 5),
('sandwich', 'plato', 1),
('frappe', 'leche', 180),
('frappe', 'hielo', 150),
('frappe', 'azucar', 15),
('frappe', 'crema-batida', 20),
('frappe', 'vaso-16oz', 1),
('soda-italiana', 'agua-mineral', 280),
('soda-italiana', 'hielo', 120),
('soda-italiana', 'vaso-16oz', 1),
('capuchino-frio', 'cafe-molido', 9),
('capuchino-frio', 'agua', 30),
('capuchino-frio', 'leche', 150),
('capuchino-frio', 'hielo', 120),
('capuchino-frio', 'azucar', 10),
('capuchino-frio', 'vaso-16oz', 1),
('latte-frio', 'cafe-molido', 9),
('latte-frio', 'agua', 30),
('latte-frio', 'leche', 180),
('latte-frio', 'hielo', 120),
('latte-frio', 'vaso-16oz', 1),
('chocolate-frio', 'polvo-chocolate', 35),
('chocolate-frio', 'leche', 200),
('chocolate-frio', 'hielo', 120),
('chocolate-frio', 'vaso-16oz', 1),
('cafe-americano', 'cafe-molido', 12),
('cafe-americano', 'agua', 240),
('cafe-americano', 'vaso-12oz', 1),
('espresso', 'cafe-molido', 9),
('espresso', 'agua', 30),
('espresso', 'vaso-4oz', 1),
('latte', 'cafe-molido', 9),
('latte', 'agua', 30),
('latte', 'leche', 220),
('latte', 'vaso-12oz', 1),
('capuchino', 'cafe-molido', 9),
('capuchino', 'agua', 30),
('capuchino', 'leche', 160),
('capuchino', 'vaso-12oz', 1),
('matcha', 'matcha', 4),
('matcha', 'leche', 220),
('matcha', 'azucar', 10),
('chocolate-caliente', 'polvo-chocolate', 35),
('chocolate-caliente', 'leche', 220),
('chocolate-caliente', 'vaso-12oz', 1);

INSERT INTO opciones (id, producto_id, clave, titulo, tipo, mostrar_total, incluidos, extra_adicional, orden) VALUES
(1, 'bowl-mini-pancakes', 'toppings', 'Toppings', 'varias', 0, 4, 8, 1),
(2, 'crepas', 'crepa', 'Elige tu crepa', 'una', 1, NULL, NULL, 1),
(3, 'fresas-con-crema', 'tamano', 'Tamaño', 'una', 1, NULL, NULL, 1),
(4, 'sandwich', 'tipo', 'Elige', 'una', 1, NULL, NULL, 1),
(5, 'frappe', 'sabor', 'Sabor', 'una', 1, NULL, NULL, 1),
(6, 'soda-italiana', 'sabor', 'Sabor', 'una', 0, NULL, NULL, 1),
(7, 'capuchino-frio', 'sabor', 'Sabor', 'una', 1, NULL, NULL, 1),
(8, 'latte-frio', 'sabor', 'Sabor', 'una', 1, NULL, NULL, 1),
(9, 'cafe-americano', 'tamano', 'Elige', 'una', 1, NULL, NULL, 1),
(10, 'espresso', 'tamano', 'Elige', 'una', 1, NULL, NULL, 1),
(11, 'latte', 'sabor', 'Sabor', 'una', 1, NULL, NULL, 1),
(12, 'capuchino', 'sabor', 'Sabor', 'una', 1, NULL, NULL, 1),
(13, 'matcha', 'temperatura', 'Elige', 'una', 1, NULL, NULL, 1);

INSERT INTO elecciones (id, opcion_id, nombre, extra, pide_indicaciones, orden) VALUES
(1, 1, 'Palitos de chocolate', 0, 0, 1),
(2, 1, 'Kinder Delice', 0, 0, 2),
(3, 1, 'Coco rayado', 0, 0, 3),
(4, 1, 'Galleta Oreo', 0, 0, 4),
(5, 1, 'Granola', 0, 0, 5),
(6, 1, 'Nueces', 0, 0, 6),
(7, 1, 'Durazno en almíbar', 0, 0, 7),
(8, 1, 'Fresas', 0, 0, 8),
(9, 1, 'Nutella', 0, 0, 9),
(10, 1, 'Lechera', 0, 0, 10),
(11, 1, 'Cajeta', 0, 0, 11),
(12, 2, 'Nutella con fresas', 2, 0, 1),
(13, 2, 'Nutella con durazno', 2, 0, 2),
(14, 2, 'Fresa y queso Philadelphia', 8, 0, 3),
(15, 2, 'Durazno en almíbar y queso Philadelphia', 4, 0, 4),
(16, 2, 'Nutella, Kinder Delice y fresa', 12, 0, 5),
(17, 2, 'Cajeta, lechera y durazno', 0, 0, 6),
(18, 2, 'Crepa armable (escribe tus 4 ingredientes en Indicaciones)', 12, 1, 7),
(19, 3, 'Chico', 0, 0, 1),
(20, 3, 'Mediano', 10, 0, 2),
(21, 3, 'Grande', 25, 0, 3),
(22, 4, 'Sencillo', 0, 0, 1),
(23, 4, 'Con papas', 13, 0, 2),
(24, 5, 'Galleta Oreo', 5, 0, 1),
(25, 5, 'Chocolate', 0, 0, 2),
(26, 5, 'Matcha', 0, 0, 3),
(27, 5, 'Taro', 0, 0, 4),
(28, 5, 'Capuchino', 5, 0, 5),
(29, 6, 'Frambuesa', 0, 0, 1),
(30, 6, 'Manzana verde', 0, 0, 2),
(31, 6, 'Mora azul', 0, 0, 3),
(32, 6, 'Fresa', 0, 0, 4),
(33, 7, 'Clásico', 0, 0, 1),
(34, 7, 'Amareto', 3, 0, 2),
(35, 7, 'Nutella', 3, 0, 3),
(36, 7, 'Cajeta', 3, 0, 4),
(37, 7, 'Almendra', 3, 0, 5),
(38, 8, 'Clásico', 0, 0, 1),
(39, 8, 'Amareto', 3, 0, 2),
(40, 8, 'Nutella', 3, 0, 3),
(41, 8, 'Cajeta', 3, 0, 4),
(42, 8, 'Almendra', 3, 0, 5),
(43, 9, 'Sencillo', 0, 0, 1),
(44, 9, 'Doble', 5, 0, 2),
(45, 10, 'Sencillo', 0, 0, 1),
(46, 10, 'Doble', 19, 0, 2),
(47, 11, 'Clásico', 0, 0, 1),
(48, 11, 'Amareto', 6, 0, 2),
(49, 11, 'Nutella', 6, 0, 3),
(50, 11, 'Cajeta', 6, 0, 4),
(51, 11, 'Almendra', 6, 0, 5),
(52, 12, 'Clásico', 0, 0, 1),
(53, 12, 'Amareto', 4, 0, 2),
(54, 12, 'Nutella', 4, 0, 3),
(55, 12, 'Cajeta', 4, 0, 4),
(56, 12, 'Almendra', 4, 0, 5),
(57, 13, 'Caliente', 0, 0, 1),
(58, 13, 'Frío', 2, 0, 2);

INSERT INTO receta_elecciones (eleccion_id, insumo_id, cantidad) VALUES
(1, 'palitos-chocolate', 15),
(2, 'kinder-delice', 20),
(3, 'coco-rayado', 10),
(4, 'oreo', 15),
(5, 'granola', 15),
(6, 'nueces', 10),
(7, 'durazno-almibar', 40),
(8, 'fresa', 40),
(9, 'nutella', 20),
(10, 'lechera', 20),
(11, 'cajeta', 20),
(12, 'nutella', 35),
(12, 'fresa', 60),
(13, 'nutella', 35),
(13, 'durazno-almibar', 60),
(14, 'queso-crema', 40),
(14, 'fresa', 60),
(15, 'queso-crema', 40),
(15, 'durazno-almibar', 60),
(16, 'nutella', 30),
(16, 'kinder-delice', 20),
(16, 'fresa', 50),
(17, 'cajeta', 25),
(17, 'lechera', 20),
(17, 'durazno-almibar', 50),
(20, 'fresa', 50),
(20, 'media-crema', 20),
(20, 'lechera', 8),
(21, 'fresa', 120),
(21, 'media-crema', 45),
(21, 'lechera', 20),
(23, 'papas-fritas', 30),
(24, 'oreo', 30),
(24, 'polvo-chocolate', 10),
(25, 'polvo-chocolate', 35),
(26, 'matcha', 5),
(27, 'polvo-taro', 35),
(28, 'cafe-molido', 9),
(28, 'agua', 30),
(29, 'jarabe-frambuesa', 45),
(30, 'jarabe-manzana', 45),
(31, 'jarabe-mora', 45),
(32, 'jarabe-fresa', 45),
(34, 'jarabe-amaretto', 20),
(35, 'nutella', 15),
(36, 'cajeta', 15),
(37, 'jarabe-almendra', 20),
(39, 'jarabe-amaretto', 20),
(40, 'nutella', 15),
(41, 'cajeta', 15),
(42, 'jarabe-almendra', 20),
(44, 'cafe-molido', 12),
(46, 'cafe-molido', 9),
(46, 'agua', 30),
(48, 'jarabe-amaretto', 20),
(49, 'nutella', 15),
(50, 'cajeta', 15),
(51, 'jarabe-almendra', 20),
(53, 'jarabe-amaretto', 20),
(54, 'nutella', 15),
(55, 'cajeta', 15),
(56, 'jarabe-almendra', 20),
(57, 'vaso-12oz', 1),
(58, 'hielo', 120),
(58, 'vaso-16oz', 1);

INSERT INTO movimientos_inventario (insumo_id, tipo, cantidad, existencia_resultante, costo_unitario, nota, creado)
SELECT id, 'entrada', existencia, existencia, costo_unitario, 'Inventario inicial', NOW() FROM insumos;
