/* ============================================================
   Rappidos · datos-iniciales.js
   Datos con los que arranca el sistema:
     INSUMOS_INICIALES  materia prima y empaques, con existencia,
                        mínimo para resurtir y costo por unidad.
     MENU_INICIAL       menú de Mr's Pancake (precios de sus volantes)
                        con la receta de cada producto y de cada opción.
   El modo local los carga la primera vez. Para MySQL, el archivo
   bd/rappidos.sql trae exactamente los mismos datos.

   IMPORTANTE (validar con el negocio):
   - Las cantidades de las recetas son una PROPUESTA del equipo.
   - Los costos por unidad son ESTIMADOS; se actualizan con cada compra.

   Campos de un insumo:
     unidad: "g" | "ml" | "pza"      tipo: "ingrediente" | "empaque"
     costo: pesos por unidad          existencia / minimo: en su unidad
   ============================================================ */

const { INSUMOS_INICIALES, MENU_INICIAL } = (() => {

function insumo(id, nombre, unidad, existencia, minimo, costo, extra) {
  return Object.assign({ id, nombre, tipo: "ingrediente", unidad, existencia, minimo, costo }, extra || {});
}
const EMPAQUE = { tipo: "empaque" };

const INSUMOS_INICIALES = [
  // ---- Masas y básicos
  insumo("harina-hotcakes", "Harina para hot cakes", "g", 5000, 1500, 0.06),
  insumo("harina-trigo", "Harina de trigo", "g", 3000, 1000, 0.025),
  insumo("leche", "Leche entera", "ml", 12000, 4000, 0.028),
  insumo("huevo", "Huevo", "g", 3000, 1000, 0.055),
  insumo("mantequilla", "Mantequilla", "g", 1000, 300, 0.25),
  insumo("azucar", "Azúcar", "g", 3000, 1000, 0.03),
  insumo("azucar-glass", "Azúcar glass", "g", 1000, 300, 0.05),
  // ---- Toppings y rellenos
  insumo("nutella", "Crema de avellana (Nutella)", "g", 2000, 700, 0.30),
  insumo("kinder-delice", "Kinder Delice", "g", 800, 300, 0.55),
  insumo("oreo", "Galleta Oreo", "g", 1500, 500, 0.18),
  insumo("palitos-chocolate", "Palitos de chocolate", "g", 800, 300, 0.30),
  insumo("coco-rayado", "Coco rayado", "g", 600, 200, 0.15),
  insumo("granola", "Granola", "g", 1000, 300, 0.12),
  insumo("nueces", "Nueces", "g", 800, 250, 0.35),
  insumo("durazno-almibar", "Durazno en almíbar", "g", 2500, 800, 0.06),
  insumo("fresa", "Fresa", "g", 6000, 2000, 0.07),
  insumo("mango", "Mango", "g", 2000, 600, 0.04),
  insumo("lechera", "Leche condensada (Lechera)", "g", 2500, 800, 0.09),
  insumo("cajeta", "Cajeta", "g", 1500, 500, 0.12),
  insumo("queso-crema", "Queso crema (Philadelphia)", "g", 1500, 500, 0.20),
  insumo("media-crema", "Media crema", "g", 3000, 1000, 0.10),
  insumo("crema-batida", "Crema batida", "g", 1000, 300, 0.25),
  insumo("jarabe-maple", "Jarabe sabor maple", "g", 1500, 400, 0.08),
  // ---- Alimentos
  insumo("totopos", "Totopos", "g", 4000, 1200, 0.08),
  insumo("salsa-verde", "Salsa verde", "g", 5000, 1500, 0.05),
  insumo("queso-fresco", "Queso fresco", "g", 2000, 600, 0.16),
  insumo("cebolla", "Cebolla", "g", 1500, 400, 0.03),
  insumo("pan-baguette", "Pan baguette", "pza", 20, 6, 12),
  insumo("pan-caja", "Pan de caja", "g", 2500, 700, 0.07),
  insumo("jamon", "Jamón", "g", 1500, 500, 0.20),
  insumo("queso-manchego", "Queso manchego", "g", 1500, 500, 0.22),
  insumo("papas-fritas", "Papas fritas de bolsa", "g", 1500, 400, 0.18),
  // ---- Bebidas
  insumo("hielo", "Hielo", "g", 20000, 5000, 0.004),
  insumo("agua", "Agua purificada", "ml", 40000, 10000, 0.002),
  insumo("agua-mineral", "Agua mineral", "ml", 12000, 4000, 0.03),
  insumo("cafe-molido", "Café molido", "g", 2000, 500, 0.40),
  insumo("matcha", "Té matcha en polvo", "g", 400, 100, 2.50),
  insumo("polvo-chocolate", "Chocolate en polvo endulzado", "g", 3000, 900, 0.12),
  insumo("polvo-taro", "Polvo sabor taro", "g", 1000, 300, 0.30),
  insumo("jarabe-frambuesa", "Jarabe sabor frambuesa", "ml", 1500, 400, 0.30),
  insumo("jarabe-manzana", "Jarabe sabor manzana verde", "ml", 1500, 400, 0.30),
  insumo("jarabe-mora", "Jarabe sabor mora azul", "ml", 1500, 400, 0.30),
  insumo("jarabe-fresa", "Jarabe sabor fresa", "ml", 1500, 400, 0.30),
  insumo("jarabe-amaretto", "Jarabe sabor amaretto", "ml", 1000, 300, 0.30),
  insumo("jarabe-almendra", "Jarabe sabor almendra", "ml", 1000, 300, 0.30),
  // ---- Empaques
  insumo("vaso-16oz", "Vaso de 16 oz con tapa", "pza", 300, 80, 3.5, EMPAQUE),
  insumo("vaso-12oz", "Vaso de 12 oz con tapa", "pza", 300, 80, 3.0, EMPAQUE),
  insumo("vaso-4oz", "Vaso de 4 oz para espresso", "pza", 150, 40, 1.5, EMPAQUE),
  insumo("bowl", "Bowl de cartón", "pza", 200, 50, 5.0, EMPAQUE),
  insumo("plato", "Plato desechable", "pza", 300, 80, 3.0, EMPAQUE),
  insumo("palito", "Palito para brocheta", "pza", 500, 100, 0.3, EMPAQUE),
];

/* ---------- Menú con recetas ---------- */

// Atajo para escribir recetas: R("leche", 220) -> { insumoId: "leche", cantidad: 220 }
const R = (insumoId, cantidad) => ({ insumoId, cantidad });
const E = (nombre, extra, receta, mas) => Object.assign({ nombre, extra, receta: receta || [] }, mas || {});

const SABORES_CAFE = (extra) => [
  E("Clásico", 0),
  E("Amareto", extra, [R("jarabe-amaretto", 20)]),
  E("Nutella", extra, [R("nutella", 15)]),
  E("Cajeta", extra, [R("cajeta", 15)]),
  E("Almendra", extra, [R("jarabe-almendra", 20)]),
];
const MASA_HOTCAKE = (h, l, hv, m) => [R("harina-hotcakes", h), R("leche", l), R("huevo", hv)].concat(m ? [R("mantequilla", m)] : []);

const MENU_INICIAL = [
  /* ---------- Mini pancakes y postres ---------- */
  {
    id: "bowl-mini-pancakes", orden: 1, categoria: "postres", sector: "postres",
    nombre: "Bowl de mini pancakes", precio: 60, disponible: true,
    descripcion: "Mini pancakes con 4 toppings incluidos. Cada topping extra cuesta $8.",
    imagen: "img/bowl-mini-pancakes.jpg",
    receta: MASA_HOTCAKE(70, 60, 25, 5).concat([R("bowl", 1)]),
    opciones: [
      { id: "toppings", titulo: "Toppings", tipo: "varias", incluidos: 4, extraAdicional: 8, elecciones: [
        E("Palitos de chocolate", 0, [R("palitos-chocolate", 15)]),
        E("Kinder Delice", 0, [R("kinder-delice", 20)]),
        E("Coco rayado", 0, [R("coco-rayado", 10)]),
        E("Galleta Oreo", 0, [R("oreo", 15)]),
        E("Granola", 0, [R("granola", 15)]),
        E("Nueces", 0, [R("nueces", 10)]),
        E("Durazno en almíbar", 0, [R("durazno-almibar", 40)]),
        E("Fresas", 0, [R("fresa", 40)]),
        E("Nutella", 0, [R("nutella", 20)]),
        E("Lechera", 0, [R("lechera", 20)]),
        E("Cajeta", 0, [R("cajeta", 20)]),
      ] }
    ]
  },
  {
    id: "crepas", orden: 2, categoria: "postres", sector: "postres",
    nombre: "Crepas", precio: 56, disponible: true,
    descripcion: "Elige tu crepa favorita o arma la tuya con 4 ingredientes.",
    imagen: "img/crepas.jpg",
    receta: [R("harina-trigo", 35), R("leche", 60), R("huevo", 15), R("mantequilla", 3), R("azucar-glass", 3), R("plato", 1)],
    opciones: [
      { id: "crepa", titulo: "Elige tu crepa", tipo: "una", mostrarTotal: true, elecciones: [
        E("Nutella con fresas", 2, [R("nutella", 35), R("fresa", 60)]),
        E("Nutella con durazno", 2, [R("nutella", 35), R("durazno-almibar", 60)]),
        E("Fresa y queso Philadelphia", 8, [R("queso-crema", 40), R("fresa", 60)]),
        E("Durazno en almíbar y queso Philadelphia", 4, [R("queso-crema", 40), R("durazno-almibar", 60)]),
        E("Nutella, Kinder Delice y fresa", 12, [R("nutella", 30), R("kinder-delice", 20), R("fresa", 50)]),
        E("Cajeta, lechera y durazno", 0, [R("cajeta", 25), R("lechera", 20), R("durazno-almibar", 50)]),
        E("Crepa armable (escribe tus 4 ingredientes en Indicaciones)", 12, [], { pideIndicaciones: true }),
      ] }
    ]
  },
  {
    id: "wafles", orden: 3, categoria: "postres", sector: "postres",
    nombre: "Wafles con fruta", precio: 55, disponible: true,
    descripcion: "Wafles acompañados de fruta.",
    imagen: "img/wafles.jpg",
    receta: MASA_HOTCAKE(80, 65, 25, 8).concat([R("fresa", 80), R("jarabe-maple", 30), R("plato", 1)]),
    opciones: []
  },
  {
    id: "fresas-con-crema", orden: 4, categoria: "postres", sector: "postres",
    nombre: "Fresas con crema", precio: 50, disponible: true,
    descripcion: "En vaso: chico, mediano o grande.",
    imagen: "img/fresas-con-crema.jpg",
    receta: [R("fresa", 150), R("media-crema", 60), R("lechera", 25), R("vaso-16oz", 1)],
    opciones: [
      { id: "tamano", titulo: "Tamaño", tipo: "una", mostrarTotal: true, elecciones: [
        E("Chico", 0),
        E("Mediano", 10, [R("fresa", 50), R("media-crema", 20), R("lechera", 8)]),
        E("Grande", 25, [R("fresa", 120), R("media-crema", 45), R("lechera", 20)]),
      ] }
    ]
  },
  {
    id: "brochetas", orden: 5, categoria: "postres", sector: "postres",
    nombre: "Brochetas con crema de avellana", precio: 30, disponible: true,
    descripcion: "Mini pancakes y fruta en brocheta, con crema de avellana.",
    imagen: "img/brochetas.jpg",
    receta: MASA_HOTCAKE(25, 20, 8).concat([R("fresa", 30), R("mango", 30), R("nutella", 15), R("palito", 1)]),
    opciones: []
  },

  /* ---------- Alimentos ---------- */
  {
    id: "chilaquiles", orden: 6, categoria: "comida", sector: "caliente",
    nombre: "Chilaquiles", precio: 55, disponible: true, descripcion: "", imagen: "img/chilaquiles.jpg",
    receta: [R("totopos", 90), R("salsa-verde", 120), R("media-crema", 25), R("queso-fresco", 25), R("cebolla", 10), R("plato", 1)],
    opciones: []
  },
  {
    id: "baguette-chilaquiles", orden: 7, categoria: "comida", sector: "caliente",
    nombre: "Baguette de chilaquiles", precio: 65, disponible: true, descripcion: "", imagen: "img/baguette-chilaquiles.jpg",
    receta: [R("pan-baguette", 1), R("totopos", 60), R("salsa-verde", 80), R("media-crema", 20), R("queso-fresco", 20), R("cebolla", 8), R("plato", 1)],
    opciones: []
  },
  {
    id: "sandwich", orden: 8, categoria: "comida", sector: "caliente",
    nombre: "Sandwich de jamón y queso", precio: 45, disponible: true,
    descripcion: "Sencillo o con papas.", imagen: "img/sandwich.jpg",
    receta: [R("pan-caja", 55), R("jamon", 40), R("queso-manchego", 30), R("mantequilla", 5), R("plato", 1)],
    opciones: [
      { id: "tipo", titulo: "Elige", tipo: "una", mostrarTotal: true, elecciones: [
        E("Sencillo", 0), E("Con papas", 13, [R("papas-fritas", 30)])
      ] }
    ]
  },

  /* ---------- Bebidas frías ---------- */
  {
    id: "frappe", orden: 9, categoria: "frias", sector: "bebidas",
    nombre: "Frappé", precio: 60, disponible: true,
    descripcion: "Galleta Oreo, chocolate, matcha, taro o capuchino.", imagen: "img/frappe.jpg",
    receta: [R("leche", 180), R("hielo", 150), R("azucar", 15), R("crema-batida", 20), R("vaso-16oz", 1)],
    opciones: [
      { id: "sabor", titulo: "Sabor", tipo: "una", mostrarTotal: true, elecciones: [
        E("Galleta Oreo", 5, [R("oreo", 30), R("polvo-chocolate", 10)]),
        E("Chocolate", 0, [R("polvo-chocolate", 35)]),
        E("Matcha", 0, [R("matcha", 5)]),
        E("Taro", 0, [R("polvo-taro", 35)]),
        E("Capuchino", 5, [R("cafe-molido", 9), R("agua", 30)]),
      ] }
    ]
  },
  {
    id: "soda-italiana", orden: 10, categoria: "frias", sector: "bebidas",
    nombre: "Soda italiana", precio: 56, disponible: true, descripcion: "", imagen: "img/soda-italiana.jpg",
    receta: [R("agua-mineral", 280), R("hielo", 120), R("vaso-16oz", 1)],
    opciones: [
      { id: "sabor", titulo: "Sabor", tipo: "una", elecciones: [
        E("Frambuesa", 0, [R("jarabe-frambuesa", 45)]),
        E("Manzana verde", 0, [R("jarabe-manzana", 45)]),
        E("Mora azul", 0, [R("jarabe-mora", 45)]),
        E("Fresa", 0, [R("jarabe-fresa", 45)]),
      ] }
    ]
  },
  {
    id: "capuchino-frio", orden: 11, categoria: "frias", sector: "bebidas",
    nombre: "Capuchino frío", precio: 56, disponible: true, descripcion: "Clásico o con sabor.", imagen: "",
    receta: [R("cafe-molido", 9), R("agua", 30), R("leche", 150), R("hielo", 120), R("azucar", 10), R("vaso-16oz", 1)],
    opciones: [{ id: "sabor", titulo: "Sabor", tipo: "una", mostrarTotal: true, elecciones: SABORES_CAFE(3) }]
  },
  {
    id: "latte-frio", orden: 12, categoria: "frias", sector: "bebidas",
    nombre: "Latte frío", precio: 56, disponible: true, descripcion: "Clásico o con sabor.", imagen: "",
    receta: [R("cafe-molido", 9), R("agua", 30), R("leche", 180), R("hielo", 120), R("vaso-16oz", 1)],
    opciones: [{ id: "sabor", titulo: "Sabor", tipo: "una", mostrarTotal: true, elecciones: SABORES_CAFE(3) }]
  },
  {
    id: "chocolate-frio", orden: 13, categoria: "frias", sector: "bebidas",
    nombre: "Chocolate frío", precio: 52, disponible: true, descripcion: "", imagen: "",
    receta: [R("polvo-chocolate", 35), R("leche", 200), R("hielo", 120), R("vaso-16oz", 1)],
    opciones: []
  },

  /* ---------- Bebidas calientes ---------- */
  {
    id: "cafe-americano", orden: 14, categoria: "calientes", sector: "bebidas",
    nombre: "Café americano", precio: 40, disponible: true, descripcion: "Sencillo o doble.", imagen: "img/cafe-americano.jpg",
    receta: [R("cafe-molido", 12), R("agua", 240), R("vaso-12oz", 1)],
    opciones: [
      { id: "tamano", titulo: "Elige", tipo: "una", mostrarTotal: true, elecciones: [
        E("Sencillo", 0), E("Doble", 5, [R("cafe-molido", 12)])
      ] }
    ]
  },
  {
    id: "espresso", orden: 15, categoria: "calientes", sector: "bebidas",
    nombre: "Espresso", precio: 16, disponible: true, descripcion: "Sencillo o doble.", imagen: "",
    receta: [R("cafe-molido", 9), R("agua", 30), R("vaso-4oz", 1)],
    opciones: [
      { id: "tamano", titulo: "Elige", tipo: "una", mostrarTotal: true, elecciones: [
        E("Sencillo", 0), E("Doble", 19, [R("cafe-molido", 9), R("agua", 30)])
      ] }
    ]
  },
  {
    id: "latte", orden: 16, categoria: "calientes", sector: "bebidas",
    nombre: "Latte", precio: 56, disponible: true, descripcion: "Clásico o con sabor.", imagen: "img/latte.jpg",
    receta: [R("cafe-molido", 9), R("agua", 30), R("leche", 220), R("vaso-12oz", 1)],
    opciones: [{ id: "sabor", titulo: "Sabor", tipo: "una", mostrarTotal: true, elecciones: SABORES_CAFE(6) }]
  },
  {
    id: "capuchino", orden: 17, categoria: "calientes", sector: "bebidas",
    nombre: "Capuchino", precio: 55, disponible: true, descripcion: "Clásico o con sabor.", imagen: "img/capuchino.jpg",
    receta: [R("cafe-molido", 9), R("agua", 30), R("leche", 160), R("vaso-12oz", 1)],
    opciones: [{ id: "sabor", titulo: "Sabor", tipo: "una", mostrarTotal: true, elecciones: SABORES_CAFE(4) }]
  },
  {
    id: "matcha", orden: 18, categoria: "calientes", sector: "bebidas",
    nombre: "Matcha", precio: 56, disponible: true, descripcion: "Frío o caliente.", imagen: "img/matcha.jpg",
    receta: [R("matcha", 4), R("leche", 220), R("azucar", 10)],
    opciones: [
      { id: "temperatura", titulo: "Elige", tipo: "una", mostrarTotal: true, elecciones: [
        E("Caliente", 0, [R("vaso-12oz", 1)]), E("Frío", 2, [R("hielo", 120), R("vaso-16oz", 1)])
      ] }
    ]
  },
  {
    id: "chocolate-caliente", orden: 19, categoria: "calientes", sector: "bebidas",
    nombre: "Chocolate caliente", precio: 55, disponible: true, descripcion: "", imagen: "",
    receta: [R("polvo-chocolate", 35), R("leche", 220), R("vaso-12oz", 1)],
    opciones: []
  }
];

return { INSUMOS_INICIALES, MENU_INICIAL };
})();
