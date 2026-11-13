/* ============================================================
   Rappidos · store.js  (capa de datos)
   ------------------------------------------------------------
   Es la ÚNICA parte del código que sabe dónde se guardan los datos.
   Tiene dos modos y los elige solo al arrancar:

   - "mysql": la página está en un servidor con PHP (XAMPP) y
     api/api.php responde. Los datos viven en la base MySQL
     "rappidos"; cliente, cocina e inventario pueden estar en
     dispositivos distintos de la misma red. Los cambios se
     consultan cada pocos segundos.
   - "local": no hay servidor PHP (por ejemplo, Live Server).
     Los datos se guardan en el navegador (localStorage); cliente
     y panel deben estar en pestañas del MISMO navegador.

   Funciones que usa el resto de la aplicación:
     iniciar()
     escucharMenu(cb) · escucharInsumos(cb) · escucharPedidos(cb)
     escucharPedido(id, cb) · escucharMovimientos(cb)
     crearPedido(datos) · cambiarEstado(id, estado)
     agregarProducto(datos) · actualizarProducto(id, cambios) · eliminarProducto(id)
     registrarEntrada(insumoId, cantidad, costo, nota)
     ajustarExistencia(insumoId, existencia, nota)
     actualizarInsumo(id, campo, valor)
   ============================================================ */

const Store = {
  modo: "conectando",          // "mysql" | "local" | "sin-conexion"
  puedeEscribir: true,
  errorConexion: "",
  API: "api/api.php",
  INTERVALOS: { menu: 10000, insumos: 4000, pedidos: 3000, pedido: 3000, movimientos: 5000 },
  _inicio: null,
  _oyentes: { menu: [], insumos: [], pedidos: [], pedido: [], movimientos: [] },
  _sondeos: {},
  _CLAVE: "rappidos-datos-v4",
  _local: null,

  /* ---------------- Arranque ---------------- */

  iniciar() {
    if (!this._inicio) this._inicio = this._arrancar();
    return this._inicio;
  },

  async _arrancar() {
    try {
      const r = await fetch(this.API + "?accion=estado", { cache: "no-store" });
      let d = null;
      try { d = JSON.parse(await r.text()); } catch (e) { d = null; }   // Live Server devuelve el código PHP, no JSON
      if (d && d.ok && d.modo === "mysql") { this.modo = "mysql"; return this.modo; }
      if (d && d.ok === false) {
        this.modo = "sin-conexion";
        this.errorConexion = d.error || "MySQL no responde.";
        return this.modo;
      }
    } catch (e) { /* no hay servidor PHP */ }
    this._iniciarLocal();
    this.modo = "local";
    return this.modo;
  },

  /* ---------------- Escuchar cambios ---------------- */

  escucharMenu(cb, alError) { return this._escuchar("menu", cb, alError); },
  escucharInsumos(cb, alError) { return this._escuchar("insumos", cb, alError); },
  escucharPedidos(cb, alError) { return this._escuchar("pedidos", cb, alError); },
  escucharMovimientos(cb, alError) { return this._escuchar("movimientos", cb, alError); },
  escucharPedido(id, cb, alError) { return this._escuchar("pedido", cb, alError, id); },

  _escuchar(tipo, cb, alError, id) {
    const oyente = { cb, alError, id, ultimo: null };
    this._oyentes[tipo].push(oyente);
    if (this.modo === "local") this._entregarLocal(tipo, oyente);
    if (this.modo === "mysql") {
      this._consultar(tipo, oyente);
      if (!this._sondeos[tipo]) this._sondeos[tipo] = setInterval(() => this._consultar(tipo), this.INTERVALOS[tipo]);
    }
    return () => { this._oyentes[tipo] = this._oyentes[tipo].filter(o => o !== oyente); };
  },

  // Entrega datos solo si cambiaron (evita repintar la pantalla sin necesidad).
  _entregar(oyente, datos) {
    const json = JSON.stringify(datos);
    if (json === oyente.ultimo) return;
    oyente.ultimo = json;
    oyente.cb(datos);
  },

  async _consultar(tipo, soloEste) {
    const oyentes = soloEste ? [soloEste] : this._oyentes[tipo].slice();
    if (!oyentes.length) return;
    if (tipo === "pedido") {
      for (const o of oyentes) {
        try { this._entregar(o, (await this._api("pedido&id=" + encodeURIComponent(o.id))).pedido); }
        catch (e) { if (o.alError) o.alError(e); }
      }
      return;
    }
    try {
      const d = await this._api(tipo);
      oyentes.forEach(o => this._entregar(o, d[tipo]));
    } catch (e) {
      oyentes.forEach(o => { if (o.alError) o.alError(e); });
    }
  },

  _refrescar(tipos) {
    if (this.modo === "mysql") tipos.forEach(t => this._consultar(t));
  },

  async _api(accion, cuerpo) {
    const opciones = cuerpo === undefined
      ? { cache: "no-store" }
      : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) };
    let r;
    try { r = await fetch(this.API + "?accion=" + accion, opciones); }
    catch (e) { throw { code: "red", message: "No hay conexión con el servidor. Revisa que Apache esté encendido." }; }
    let d;
    try { d = await r.json(); }
    catch (e) { throw { code: "servidor", message: "El servidor respondió algo inesperado." }; }
    if (!d.ok) throw { code: d.bd ? "bd" : "datos", message: d.error || "No se pudo completar." };
    return d;
  },

  /* ---------------- Pedidos ---------------- */

  /* datos = { tipo, cliente, direccion, notas, productos: [{ productoId, cantidad, selecciones,
     indicaciones, nombre, sector, precioUnitario, subtotal, opciones, receta }] }
     En MySQL el servidor recalcula precio y receta; en modo local se usan los del navegador. */
  async crearPedido(datos) {
    if (this.modo === "mysql") {
      const d = await this._api("crear_pedido", {
        tipo: datos.tipo, cliente: datos.cliente, direccion: datos.direccion, notas: datos.notas,
        productos: datos.productos.map(p => ({
          productoId: p.productoId, cantidad: p.cantidad, selecciones: p.selecciones,
          indicaciones: p.indicaciones
        }))
      });
      this._refrescar(["pedidos"]);
      return d.pedido;
    }
    this._exigirLocal();
    this._local = this._leerLocal();
    // ¿Alcanza el inventario?
    const necesario = {};
    datos.productos.forEach(p => p.receta.forEach(r => { necesario[r.insumoId] = (necesario[r.insumoId] || 0) + r.cantidad; }));
    Object.entries(necesario).forEach(([id, c]) => {
      const i = this._local.insumos[id];
      if (i && i.existencia < c) throw { code: "datos", message: `No alcanza ${i.nombre} para tu pedido. Quita o cambia ese producto.` };
    });
    const ahora = new Date().toISOString();
    const id = "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const pedido = {
      folio: Util.nuevoFolio(), estado: "pendiente", tipo: datos.tipo, cliente: datos.cliente,
      direccion: datos.direccion, notas: datos.notas,
      total: datos.productos.reduce((s, p) => s + p.subtotal, 0),
      creado: ahora, historial: { pendiente: ahora }, inventarioDescontado: false,
      productos: datos.productos.map(p => ({
        productoId: p.productoId, nombre: p.nombre, sector: p.sector, cantidad: p.cantidad,
        precioUnitario: p.precioUnitario, subtotal: p.subtotal, opciones: p.opciones,
        indicaciones: p.indicaciones, receta: p.receta
      }))
    };
    this._local.pedidos[id] = pedido;
    this._guardarLocal(["pedidos", "pedido"]);
    return { id, ...pedido };
  },

  async cambiarEstado(id, estado) {
    if (this.modo === "mysql") {
      await this._api("cambiar_estado", { id, estado });
      this._refrescar(["pedidos", "pedido", "insumos", "movimientos"]);
      return;
    }
    this._exigirLocal();
    this._local = this._leerLocal();
    const p = this._local.pedidos[id];
    if (!p) throw { code: "datos", message: "El pedido ya no existe." };
    if (ORDEN_ESTADOS.indexOf(estado) !== ORDEN_ESTADOS.indexOf(p.estado) + 1) {
      throw { code: "datos", message: "Este pedido ya cambió de estado en otra pantalla." };
    }
    const ahora = new Date().toISOString();
    p.estado = estado;
    p.historial = { ...(p.historial || {}), [estado]: ahora };
    // Al quedar listo (ya preparado) se descuenta el inventario, una sola vez.
    if (estado === "listo" && !p.inventarioDescontado) {
      const usados = {};
      (p.productos || []).forEach(l => (l.receta || []).forEach(r => { usados[r.insumoId] = (usados[r.insumoId] || 0) + r.cantidad; }));
      Object.entries(usados).forEach(([insumoId, cantidad]) => {
        const i = this._local.insumos[insumoId];
        if (!i) return;
        i.existencia = Math.round((i.existencia - cantidad) * 100) / 100;
        this._movimientoLocal(insumoId, "salida", -cantidad, "Pedido " + p.folio, p.folio);
      });
      p.inventarioDescontado = true;
    }
    this._guardarLocal(["pedidos", "pedido", "insumos", "movimientos"]);
  },

  /* ---------------- Menú ---------------- */

  async agregarProducto(datos) {
    if (this.modo === "mysql") {
      const d = await this._api("agregar_producto", datos);
      this._refrescar(["menu"]);
      return d.id;
    }
    this._exigirLocal();
    this._local = this._leerLocal();
    const base = datos.nombre.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "producto";
    let id = base, n = 2;
    while (this._local.menu[id]) id = base + "-" + n++;
    const orden = Object.values(this._local.menu).reduce((m, p) => Math.max(m, Number(p.orden) || 0), 0) + 1;
    this._local.menu[id] = {
      nombre: datos.nombre, precio: datos.precio, categoria: datos.categoria, sector: datos.sector,
      descripcion: datos.descripcion || "",
      imagen: datos.imagen || "", disponible: true, orden, receta: [], opciones: []
    };
    this._guardarLocal(["menu"]);
    return id;
  },

  async actualizarProducto(id, cambios) {
    if (this.modo === "mysql") {
      await this._api("actualizar_producto", { id, cambios });
      this._refrescar(["menu"]);
      return;
    }
    this._exigirLocal();
    this._local = this._leerLocal();
    if (!this._local.menu[id]) throw { code: "datos", message: "El producto ya no existe." };
    Object.assign(this._local.menu[id], cambios);
    this._guardarLocal(["menu"]);
  },

  async eliminarProducto(id) {
    if (this.modo === "mysql") {
      await this._api("eliminar_producto", { id });
      this._refrescar(["menu"]);
      return;
    }
    this._exigirLocal();
    this._local = this._leerLocal();
    delete this._local.menu[id];
    this._guardarLocal(["menu"]);
  },

  /* ---------------- Inventario ---------------- */

  async registrarEntrada(insumoId, cantidad, costo, nota) {
    if (this.modo === "mysql") {
      await this._api("registrar_entrada", { insumoId, cantidad, costo, nota });
      this._refrescar(["insumos", "movimientos"]);
      return;
    }
    this._exigirLocal();
    this._local = this._leerLocal();
    const i = this._local.insumos[insumoId];
    if (!i) throw { code: "datos", message: "El insumo no existe." };
    i.existencia = Math.round((i.existencia + cantidad) * 100) / 100;
    if (costo !== null && costo !== undefined && costo !== "") i.costo = Number(costo);
    this._movimientoLocal(insumoId, "entrada", cantidad, nota || "Compra");
    this._guardarLocal(["insumos", "movimientos"]);
  },

  async ajustarExistencia(insumoId, existencia, nota) {
    if (this.modo === "mysql") {
      await this._api("ajustar_existencia", { insumoId, existencia, nota });
      this._refrescar(["insumos", "movimientos"]);
      return;
    }
    this._exigirLocal();
    this._local = this._leerLocal();
    const i = this._local.insumos[insumoId];
    if (!i) throw { code: "datos", message: "El insumo no existe." };
    const diferencia = existencia - i.existencia;
    if (Math.abs(diferencia) < 0.0001) return;
    i.existencia = existencia;
    this._movimientoLocal(insumoId, "ajuste", diferencia, nota || "Conteo físico");
    this._guardarLocal(["insumos", "movimientos"]);
  },

  async actualizarInsumo(id, campo, valor) {
    if (this.modo === "mysql") {
      await this._api("actualizar_insumo", { id, campo, valor });
      this._refrescar(["insumos"]);
      return;
    }
    this._exigirLocal();
    this._local = this._leerLocal();
    if (!this._local.insumos[id] || !["minimo", "costo"].includes(campo)) throw { code: "datos", message: "No se puede cambiar ese dato." };
    this._local.insumos[id][campo] = valor;
    this._guardarLocal(["insumos"]);
  },

  mensajeError(e) {
    if (e && e.message && ["datos", "bd", "red", "servidor", "almacenamiento"].includes(e.code)) return e.message;
    return "No se pudo completar. Intenta otra vez.";
  },

  /* ---------------- Modo local (localStorage) ---------------- */

  _exigirLocal() {
    if (this.modo !== "local") throw { code: "red", message: "Sin conexión con la base de datos." };
  },

  _iniciarLocal() {
    this._local = this._leerLocal();
    if (!Object.keys(this._local.menu).length && typeof MENU_INICIAL !== "undefined") {
      MENU_INICIAL.forEach(p => { const { id, ...resto } = JSON.parse(JSON.stringify(p)); this._local.menu[id] = resto; });
    }
    if (!Object.keys(this._local.insumos).length && typeof INSUMOS_INICIALES !== "undefined") {
      INSUMOS_INICIALES.forEach(i => { const { id, ...resto } = i; this._local.insumos[id] = { ...resto }; });
      INSUMOS_INICIALES.forEach(i => this._movimientoLocal(i.id, "entrada", i.existencia, "Inventario inicial"));
    }
    try { localStorage.setItem(this._CLAVE, JSON.stringify(this._local)); } catch (e) { /* sin memoria */ }
    window.addEventListener("storage", ev => {
      if (ev.key !== this._CLAVE) return;
      this._local = this._leerLocal();
      this._avisarLocal(["menu", "insumos", "pedidos", "pedido", "movimientos"]);
    });
  },

  _leerLocal() {
    try {
      const d = JSON.parse(localStorage.getItem(this._CLAVE) || "{}");
      return { menu: d.menu || {}, insumos: d.insumos || {}, pedidos: d.pedidos || {}, movimientos: d.movimientos || [] };
    } catch (e) {
      return { menu: {}, insumos: {}, pedidos: {}, movimientos: [] };
    }
  },

  _guardarLocal(tipos) {
    try { localStorage.setItem(this._CLAVE, JSON.stringify(this._local)); }
    catch (e) { throw { code: "almacenamiento", message: "Este navegador no deja guardar datos. Prueba sin modo incógnito." }; }
    this._avisarLocal(tipos);
  },

  _movimientoLocal(insumoId, tipo, cantidad, nota, folio) {
    const i = this._local.insumos[insumoId];
    this._local.movimientos.unshift({
      id: "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      insumoId, nombre: i.nombre, unidad: i.unidad, tipo, cantidad,
      existencia: i.existencia, costo: i.costo, folio: folio || null, nota, creado: new Date().toISOString()
    });
    this._local.movimientos = this._local.movimientos.slice(0, 2000);
  },

  _lista(tipo, id) {
    const L = this._local;
    if (tipo === "menu") return Object.entries(L.menu).map(([id, p]) => ({ id, ...p })).sort((a, b) => (a.orden ?? 9999) - (b.orden ?? 9999));
    if (tipo === "insumos") return Object.entries(L.insumos).map(([id, i]) => ({ id, ...i }))
      .sort((a, b) => (a.tipo === b.tipo ? a.nombre.localeCompare(b.nombre, "es") : (a.tipo === "empaque" ? 1 : -1)));
    if (tipo === "pedidos") return Object.entries(L.pedidos).map(([id, p]) => ({ id, ...p })).sort((a, b) => String(b.creado).localeCompare(String(a.creado)));
    if (tipo === "movimientos") return L.movimientos.slice(0, 500);
    if (tipo === "pedido") return L.pedidos[id] ? { id, ...L.pedidos[id] } : null;
    return null;
  },

  _entregarLocal(tipo, oyente) { this._entregar(oyente, this._lista(tipo, oyente.id)); },

  _avisarLocal(tipos) {
    tipos.forEach(t => this._oyentes[t].forEach(o => this._entregarLocal(t, o)));
  }
};
