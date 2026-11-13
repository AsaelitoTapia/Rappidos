/* ============================================================
   Rappidos · cliente.js
   Página del cliente: menú con fotos, ingredientes,
   personalización, carrito, formulario y seguimiento del pedido.
   ============================================================ */

const Cliente = {
  menu: [],
  menuCargado: false,
  insumos: new Map(),          // id -> insumo (nombre, unidad y existencia)
  // Cada línea: { clave, productoId, nombre, selecciones, cantidad, indicaciones }
  carrito: [],
  abierto: null,
  borrador: null,              // { selecciones, cantidad, indicaciones }
  pedidoActual: null,
  enviando: false,
  _dejarPedido: null,
  _iniciado: false,

  CLAVE_CARRITO: "rappidos-carrito-v4",
  CLAVE_ULTIMO: "rappidos-ultimo-pedido-v4",
  CLAVE_DATOS: "rappidos-mis-datos",

  $(id) { return document.getElementById(id); },

  async iniciar() {
    if (this._iniciado) return;
    this._iniciado = true;
    const guardado = Util.recuperar(this.CLAVE_CARRITO, []);
    this.carrito = Array.isArray(guardado) ? guardado : [];
    const datos = Util.recuperar(this.CLAVE_DATOS, null);
    if (datos) {
      this.$("c-nombre").value = datos.nombre || "";
      this.$("c-telefono").value = datos.telefono || "";
    }
    this._eventos();
    this.pintarCarrito();

    const modo = await Store.iniciar();
    this._pintarConexion(modo);
    if (modo === "sin-conexion") {
      this.$("c-menu").innerHTML = `<p class="vacio">No se pudo conectar con la base de datos. ${Util.esc(Store.errorConexion)}</p>`;
      return;
    }
    Store.escucharInsumos(lista => {
      this.insumos = new Map(lista.map(i => [i.id, i]));
      if (!this.menuCargado) return;
      // Si el cliente está personalizando, no se redibuja su formulario (perdería lo que escribe).
      if (this.abierto) this._refrescarPanel(); else this.pintarMenu();
      this.pintarCarrito();
    }, e => this._errorEnvio(Store.mensajeError(e)));
    Store.escucharMenu(lista => {
      this.menu = lista;
      this.menuCargado = true;
      this.pintarMenu();
      this.pintarCarrito();
    }, e => this._errorEnvio(Store.mensajeError(e)));

    const ultimo = Util.recuperar(this.CLAVE_ULTIMO, null);
    if (ultimo && ultimo.id) this._seguirPedido(ultimo.id);
  },

  /* ---------- Disponibilidad según el inventario ---------- */

  // Un producto se agota si el negocio lo marcó o si no alcanza su receta base.
  agotado(p) {
    return p.disponible === false || Recetas.faltantes(p.receta || [], this.insumos).length > 0;
  },
  eleccionAgotada(el) {
    return Recetas.faltantes(el.receta || [], this.insumos).length > 0;
  },

  /* ---------- Menú ---------- */

  pintarMenu() {
    const cont = this.$("c-menu");
    if (!this.menu.length) {
      cont.innerHTML = '<p class="vacio">Todavía no hay productos en el menú. El negocio los agrega desde su panel, en la pestaña Menú.</p>';
      this.$("c-saltos").innerHTML = "";
      return;
    }
    const grupos = Object.entries(CATEGORIAS).map(([clave, titulo]) => ({
      clave, titulo, productos: this.menu.filter(p => p.categoria === clave)
    }));
    const otros = this.menu.filter(p => !CATEGORIAS[p.categoria]);
    if (otros.length) grupos.push({ clave: "otros", titulo: "Otros", productos: otros });
    const visibles = grupos.filter(g => g.productos.length);
    this.$("c-saltos").innerHTML = visibles.map(g =>
      `<button type="button" class="salto" data-accion="saltar" data-cat="${g.clave}">${Util.esc(g.titulo)}</button>`).join("");
    cont.innerHTML = visibles.map(g => `
      <section class="categoria" id="c-cat-${g.clave}">
        <h2>${Util.esc(g.titulo)}</h2>
        <div class="productos">${g.productos.map(p => this._tarjeta(p)).join("")}</div>
      </section>`).join("");
  },

  _tarjeta(p) {
    const agotado = this.agotado(p);
    const abierto = this.abierto === p.id && !agotado;
    let accion = "";
    if (agotado) accion = '<span class="etiqueta etiqueta-agotado">Agotado</span>';
    else if (!abierto) accion = `<button type="button" class="boton" data-accion="abrir" data-id="${Util.esc(p.id)}">Agregar</button>`;
    return `
      <article class="producto${agotado ? " agotado" : ""}${abierto ? " abierto" : ""}">
        ${this._foto(p)}
        <div class="producto-cuerpo">
          <div>
            <h3>${Util.esc(p.nombre)}</h3>
            ${p.descripcion ? `<p class="producto-desc">${Util.esc(p.descripcion)}</p>` : ""}
          </div>
          <div class="producto-pie">
            <span class="precio">${Precios.texto(p)}</span>
            ${accion}
          </div>
          ${abierto ? this._panelOpciones(p) : ""}
        </div>
      </article>`;
  },

  _foto(p) {
    if (p.imagen && RUTA_FOTO.test(p.imagen)) {
      return `<div class="producto-foto"><img src="${Util.esc(p.imagen)}" alt="${Util.esc(p.nombre)}" width="640" height="480" loading="lazy"></div>`;
    }
    return `<div class="producto-foto sin-foto"><img src="img/mascota.webp" alt="" width="200" height="176" loading="lazy"><span>Foto próximamente</span></div>`;
  },

  _panelOpciones(p) {
    const b = this.borrador;
    const grupos = (p.opciones || []).map(op => {
      const varias = op.tipo === "varias";
      const conIncluidos = varias && op.incluidos != null;
      const elecciones = (op.elecciones || []).map((el, i) => {
        const idInput = `c-op-${p.id}-${op.id}-${i}`;
        const marcado = varias ? (b.selecciones[op.id] || []).includes(el.nombre) : b.selecciones[op.id] === el.nombre;
        const sinInsumo = this.eleccionAgotada(el);
        let precio = "";
        if (op.mostrarTotal) precio = ` <span class="extra">${Util.dinero((Number(p.precio) || 0) + (Number(el.extra) || 0))}</span>`;
        else if (Number(el.extra)) precio = ` <span class="extra">+${Util.dinero(el.extra)}</span>`;
        return `
          <label class="opcion${sinInsumo ? " sin-insumo" : ""}" for="${Util.esc(idInput)}">
            <input type="${varias ? "checkbox" : "radio"}" id="${Util.esc(idInput)}" name="${Util.esc(op.id)}"
              value="${Util.esc(el.nombre)}" data-opcion="${Util.esc(op.id)}" ${marcado ? "checked" : ""} ${sinInsumo && !marcado ? "disabled" : ""}>
            <span>${Util.esc(el.nombre)}${sinInsumo ? " (agotado)" : ""}</span>${precio}
          </label>`;
      }).join("");
      let ayuda = "";
      if (conIncluidos) ayuda = ` <small>(${op.incluidos} incluidos; cada extra +${Util.dinero(op.extraAdicional)})</small>`;
      else if (varias) ayuda = " <small>(puedes elegir varias)</small>";
      return `
        <fieldset${op.mostrarTotal ? ' class="variantes"' : ""}>
          <legend>${Util.esc(op.titulo)}${ayuda}</legend>
          ${elecciones}
          ${conIncluidos ? `<p class="nota contador-incluidos" data-cuenta-op="${Util.esc(op.id)}">${this._textoIncluidos(op)}</p>` : ""}
        </fieldset>`;
    }).join("");

    return `
      <form class="personalizar" data-id="${Util.esc(p.id)}" novalidate>
        ${grupos}
        <div class="fila-cantidad">
          <span>Cantidad</span>
          <span class="contador">
            <button type="button" class="boton-mini" data-accion="menos-borrador" aria-label="Quitar uno">−</button>
            <output id="c-cantidad-borrador">${b.cantidad}</output>
            <button type="button" class="boton-mini" data-accion="mas-borrador" aria-label="Agregar uno">+</button>
          </span>
        </div>
        <div class="campo">
          <label for="c-indicaciones">Indicaciones (opcional)</label>
          <input id="c-indicaciones" data-campo="indicaciones" maxlength="100" placeholder="Ej. sin azúcar" value="${Util.esc(b.indicaciones)}" aria-describedby="c-indicaciones-error">
          <p class="error-campo" id="c-indicaciones-error"></p>
        </div>
        <div id="c-info-receta" class="info-receta">${this._infoReceta(p)}</div>
        <div class="acciones">
          <button type="submit" class="boton boton-principal" id="c-agregar">${this._textoAgregar(p)}</button>
          <button type="button" class="boton boton-secundario" data-accion="cerrar">Cancelar</button>
        </div>
      </form>`;
  },

  // Ingredientes y cantidades de lo que el cliente está armando.
  _infoReceta(p) {
    const b = this.borrador;
    const receta = Recetas.deProducto(p, b.selecciones);
    if (!receta.length) return "";
    const ingredientes = Recetas.detalle(receta, this.insumos, b.cantidad).filter(r => r.tipo !== "empaque");
    if (!ingredientes.length) return "";
    const piezas = b.cantidad === 1 ? "1 pieza" : b.cantidad + " piezas";
    return `
      <h4>Ingredientes y cantidades <span class="nota">(${piezas})</span></h4>
      <table class="tabla-ingredientes">
        <tbody>${ingredientes.map(r => `<tr><td>${Util.esc(r.nombre)}</td><td class="num">${Util.cantidad(r.cantidad, r.unidad)}</td></tr>`).join("")}</tbody>
      </table>`;
  },

  _textoAgregar(p) {
    return "Agregar · " + Util.dinero(Precios.unitario(p, this.borrador.selecciones) * this.borrador.cantidad);
  },

  _textoIncluidos(op) {
    const n = Precios.elegidos(this.borrador.selecciones, op).length;
    const inc = Number(op.incluidos) || 0;
    if (n <= inc) return `Llevas ${n} de ${inc} incluidos.`;
    const extra = n - inc;
    return `Llevas ${n}: ${inc} incluidos + ${extra} extra (+${Util.dinero(extra * (Number(op.extraAdicional) || 0))}).`;
  },

  abrir(id) {
    const p = this.menu.find(x => x.id === id);
    if (!p) return;
    const sel = Precios.porDefecto(p);
    // Si la primera elección está agotada, se elige la siguiente que sí haya.
    (p.opciones || []).forEach(op => {
      if (op.tipo === "una") {
        const libre = (op.elecciones || []).find(el => !this.eleccionAgotada(el));
        if (libre) sel[op.id] = libre.nombre;
      }
    });
    this.abierto = id;
    this.borrador = { selecciones: sel, cantidad: 1, indicaciones: "" };
    this.pintarMenu();
    const panel = document.querySelector(".personalizar");
    if (panel) {
      panel.scrollIntoView({ block: "nearest" });
      const primero = panel.querySelector("input:not([disabled])");
      if (primero) primero.focus({ preventScroll: true });
    }
  },

  cerrar() {
    this.abierto = null;
    this.borrador = null;
    this.pintarMenu();
  },

  textoOpciones(producto, selecciones) {
    const textos = [];
    (producto.opciones || []).forEach(op => {
      const nombres = Precios.elegidos(selecciones, op);
      if (nombres.length) textos.push(op.titulo + ": " + nombres.join(", "));
    });
    return textos;
  },

  agregar(p) {
    const b = this.borrador;
    const selecciones = JSON.parse(JSON.stringify(b.selecciones));
    const indicaciones = b.indicaciones.trim();
    const pide = (p.opciones || []).some(op =>
      (op.elecciones || []).some(el => el.pideIndicaciones && Precios.elegidos(selecciones, op).includes(el.nombre)));
    if (pide && !indicaciones) {
      this.$("c-indicaciones-error").textContent = "Escribe aquí los ingredientes que quieres.";
      this.$("c-indicaciones").setAttribute("aria-invalid", "true");
      this.$("c-indicaciones").focus();
      return;
    }
    const faltan = Recetas.faltantes(Recetas.deProducto(p, selecciones), this.insumos, b.cantidad);
    if (faltan.length) {
      this.$("c-indicaciones-error").textContent = `No alcanza: ${faltan.join(", ")}. Baja la cantidad o cambia la opción.`;
      return;
    }
    const clave = p.id + "|" + JSON.stringify(selecciones) + "|" + indicaciones;
    const igual = this.carrito.find(l => l.clave === clave);
    if (igual) igual.cantidad = Math.min(20, igual.cantidad + b.cantidad);
    else this.carrito.push({ clave, productoId: p.id, nombre: p.nombre, selecciones, cantidad: b.cantidad, indicaciones });
    const cantidad = b.cantidad;
    this._guardarCarrito();
    this.cerrar();
    this.pintarCarrito();
    Util.aviso(this.$("c-aviso"), `Agregaste ${cantidad} × ${p.nombre} a tu pedido.`);
  },

  /* ---------- Carrito ---------- */

  _lineasCalculadas() {
    return this.carrito.map((l, i) => {
      const producto = this.menu.find(p => p.id === l.productoId);
      const disponible = !!producto && !this.agotado(producto);
      const unitario = producto ? Precios.unitario(producto, l.selecciones) : 0;
      const receta = producto ? Recetas.deProducto(producto, l.selecciones) : [];
      return {
        i, linea: l, producto, disponible, unitario, receta,
        total: unitario * l.cantidad,
        opciones: producto ? this.textoOpciones(producto, l.selecciones) : []
      };
    });
  },

  pintarCarrito() {
    const cont = this.$("c-lineas");
    const form = this.$("c-form");
    const lineas = this._lineasCalculadas();
    const total = lineas.reduce((s, l) => s + (l.disponible ? l.total : 0), 0);
    const piezas = this.carrito.reduce((s, l) => s + l.cantidad, 0);
    this.$("c-cuenta").textContent = piezas;
    this.$("c-total-barra").textContent = this.menuCargado ? Util.dinero(total) : "—";
    if (!this.carrito.length) {
      cont.innerHTML = '<p class="vacio">Tu carrito está vacío. Agrega algo del menú.</p>';
      form.hidden = true;
      return;
    }
    cont.innerHTML = `
      <ul class="lineas">
        ${lineas.map(l => `
          <li class="linea">
            <div class="linea-info">
              <strong>${Util.esc(l.producto ? l.producto.nombre : l.linea.nombre)}</strong>
              ${l.opciones.length ? `<span class="nota">${Util.esc(l.opciones.join(" · "))}</span>` : ""}
              ${l.linea.indicaciones ? `<span class="nota">“${Util.esc(l.linea.indicaciones)}”</span>` : ""}
              ${this.menuCargado && !l.disponible ? '<span class="error-campo">Ya no está disponible. Quítalo para continuar.</span>' : ""}
            </div>
            <div class="linea-ctrl">
              <span class="contador">
                <button type="button" class="boton-mini" data-accion="menos" data-i="${l.i}" aria-label="Quitar uno">−</button>
                <output>${l.linea.cantidad}</output>
                <button type="button" class="boton-mini" data-accion="mas" data-i="${l.i}" aria-label="Agregar uno">+</button>
              </span>
              <span class="precio">${this.menuCargado ? Util.dinero(l.total) : "—"}</span>
              <button type="button" class="enlace" data-accion="quitar" data-i="${l.i}">Quitar</button>
            </div>
          </li>`).join("")}
      </ul>
      <p class="total"><span>Total</span><span class="precio">${this.menuCargado ? Util.dinero(total) : "—"}</span></p>`;
    form.hidden = false;
    if (!this.enviando) this.$("c-enviar").textContent = "Confirmar pedido · " + Util.dinero(total);
  },

  cambiarCantidad(i, delta) {
    const l = this.carrito[i];
    if (!l) return;
    l.cantidad = Math.max(1, Math.min(20, l.cantidad + delta));
    this._guardarCarrito();
    this.pintarCarrito();
  },

  quitar(i) {
    this.carrito.splice(i, 1);
    this._guardarCarrito();
    this.pintarCarrito();
  },

  _guardarCarrito() { Util.recordar(this.CLAVE_CARRITO, this.carrito); },

  /* ---------- Formulario y envío ---------- */

  _leerFormulario() {
    return {
      tipo: this.$("c-tipo-domicilio").checked ? "domicilio" : "recoger",
      nombre: this.$("c-nombre").value.trim(),
      telefono: this.$("c-telefono").value.replace(/\D/g, ""),
      calle: this.$("c-calle").value.trim(),
      colonia: this.$("c-colonia").value.trim(),
      notas: this.$("c-notas").value.trim()
    };
  },

  _validar(d) {
    const errores = {};
    if (d.nombre.length < 2) errores.nombre = "Escribe tu nombre.";
    if (d.telefono.length !== 10) errores.telefono = "Escribe un teléfono de 10 dígitos.";
    if (d.tipo === "domicilio") {
      if (d.calle.length < 3) errores.calle = "Escribe la calle y el número.";
      if (d.colonia.length < 2) errores.colonia = "Escribe la colonia.";
    }
    ["nombre", "telefono", "calle", "colonia"].forEach(campo => {
      const input = this.$("c-" + campo);
      this.$("c-" + campo + "-error").textContent = errores[campo] || "";
      if (errores[campo]) input.setAttribute("aria-invalid", "true");
      else input.removeAttribute("aria-invalid");
    });
    return errores;
  },

  async confirmar() {
    if (this.enviando) return;
    this._errorEnvio("");
    const d = this._leerFormulario();
    const errores = this._validar(d);
    const primero = Object.keys(errores)[0];
    if (primero) { this.$("c-" + primero).focus(); return; }
    const lineas = this._lineasCalculadas();
    if (!this.menuCargado) { this._errorEnvio("Espera a que cargue el menú."); return; }
    if (lineas.some(l => !l.disponible)) { this._errorEnvio("Quita del carrito los productos que ya no están disponibles."); return; }

    const productos = lineas.map(l => ({
      productoId: l.producto.id,
      nombre: l.producto.nombre,
      sector: l.producto.sector || "caliente",
      cantidad: l.linea.cantidad,
      selecciones: l.linea.selecciones,
      precioUnitario: l.unitario,
      opciones: l.opciones,
      indicaciones: l.linea.indicaciones || "",
      subtotal: l.total,
      receta: Recetas.detalle(l.receta, this.insumos, l.linea.cantidad)
        .map(r => ({ insumoId: r.insumoId, nombre: r.nombre, cantidad: r.cantidad, unidad: r.unidad }))
    }));

    const boton = this.$("c-enviar");
    this.enviando = true;
    boton.disabled = true;
    boton.textContent = "Enviando…";
    try {
      const pedido = await Store.crearPedido({
        tipo: d.tipo,
        cliente: { nombre: d.nombre, telefono: d.telefono },
        direccion: d.tipo === "domicilio" ? { calle: d.calle, colonia: d.colonia } : null,
        notas: d.notas,
        productos
      });
      Util.recordar(this.CLAVE_DATOS, { nombre: d.nombre, telefono: d.telefono });
      Util.recordar(this.CLAVE_ULTIMO, { id: pedido.id });
      this.carrito = [];
      this._guardarCarrito();
      ["c-calle", "c-colonia", "c-notas"].forEach(id => { this.$(id).value = ""; });
      this._seguirPedido(pedido.id, pedido);
      this.$("c-confirmacion").scrollIntoView({ block: "start" });
    } catch (e) {
      this._errorEnvio(Store.mensajeError(e));
    } finally {
      this.enviando = false;
      boton.disabled = false;
      this.pintarCarrito();
    }
  },

  _errorEnvio(texto) {
    const el = this.$("c-error-envio");
    el.textContent = texto;
    el.hidden = !texto;
  },

  /* ---------- Seguimiento del pedido ---------- */

  _seguirPedido(id, inicial) {
    if (this._dejarPedido) this._dejarPedido();
    this.pedidoActual = inicial || null;
    this.pintarConfirmacion();
    this._dejarPedido = Store.escucharPedido(id, p => {
      if (!p) {
        if (!this.pedidoActual || this.pedidoActual.id === id) this.ocultarSeguimiento();
        return;
      }
      this.pedidoActual = p;
      this.pintarConfirmacion();
    });
  },

  ocultarSeguimiento() {
    if (this._dejarPedido) this._dejarPedido();
    this._dejarPedido = null;
    this.pedidoActual = null;
    Util.olvidar(this.CLAVE_ULTIMO);
    this.pintarConfirmacion();
  },

  pintarConfirmacion() {
    const cont = this.$("c-confirmacion");
    const p = this.pedidoActual;
    if (!p) { cont.hidden = true; cont.innerHTML = ""; return; }
    const abiertos = new Set([...cont.querySelectorAll("details[open]")].map(d => d.dataset.i));
    const estado = ESTADOS[p.estado] ? p.estado : "pendiente";
    const actual = ORDEN_ESTADOS.indexOf(estado);
    const historial = p.historial || {};
    const pasos = ORDEN_ESTADOS.map((e, i) => {
      const clase = i < actual ? "hecho" : (i === actual ? "actual" : "");
      const hora = historial[e] ? ` <span class="nota">${Util.hora(historial[e])}</span>` : "";
      return `<li class="${clase}">${ESTADOS[e].texto}${hora}</li>`;
    }).join("");
    const productos = (p.productos || []).map((l, i) => {
      const ingredientes = (l.receta || []).filter(r => (this.insumos.get(r.insumoId) || {}).tipo !== "empaque");
      return `
        <details data-i="${i}" ${abiertos.has(String(i)) ? "open" : ""}>
          <summary><strong>${l.cantidad} × ${Util.esc(l.nombre)}</strong></summary>
          ${l.opciones && l.opciones.length ? `<p class="nota">${Util.esc(l.opciones.join(" · "))}</p>` : ""}
          ${ingredientes.length ? `<table class="tabla-ingredientes"><tbody>${ingredientes.map(r =>
            `<tr><td>${Util.esc(r.nombre)}</td><td class="num">${Util.cantidad(r.cantidad, r.unidad)}</td></tr>`).join("")}</tbody></table>` : ""}
        </details>`;
    }).join("");
    cont.hidden = false;
    cont.innerHTML = `
      <div class="caja confirmacion">
        <p class="conf-titulo">${estado === "entregado" ? "Pedido entregado. ¡Gracias!" : "Pedido recibido"}</p>
        <p class="conf-folio">Folio <strong>${Util.esc(p.folio)}</strong></p>
        <p>${Util.dinero(p.total)} · ${p.tipo === "domicilio" ? "A domicilio" : "Recoger en el local"}</p>
        <p class="semaforo ${ESTADOS[estado].color}">${ESTADOS[estado].texto}</p>
        <ol class="pasos">${pasos}</ol>
        <div class="conf-productos">
          <h3>Ingredientes de tu pedido</h3>
          ${productos}
        </div>
        <p class="nota">Esta pantalla se actualiza sola cuando la cocina avanza tu pedido.</p>
        <button type="button" class="boton boton-secundario" data-accion="ocultar-seguimiento">Ocultar seguimiento</button>
      </div>`;
  },

  /* ---------- Conexión ---------- */

  _pintarConexion(modo) {
    const el = this.$("c-conexion");
    el.dataset.modo = modo;
    el.textContent = {
      "mysql": "En línea: tu pedido llega directo a la cocina.",
      "local": "Modo local: los pedidos solo llegan al panel abierto en este mismo navegador.",
      "sin-conexion": "No se pudo conectar con la base de datos MySQL."
    }[modo] || "Conectando…";
  },

  /* ---------- Eventos ---------- */

  _eventos() {
    const raiz = this.$("vista-cliente");
    raiz.addEventListener("click", ev => {
      const b = ev.target.closest("[data-accion]");
      if (!b || !raiz.contains(b)) return;
      const accion = b.dataset.accion;
      const i = Number(b.dataset.i);
      if (accion === "abrir") this.abrir(b.dataset.id);
      else if (accion === "cerrar") this.cerrar();
      else if (accion === "menos-borrador" || accion === "mas-borrador") {
        this.borrador.cantidad = Math.max(1, Math.min(20, this.borrador.cantidad + (accion === "mas-borrador" ? 1 : -1)));
        this.$("c-cantidad-borrador").textContent = this.borrador.cantidad;
        this._refrescarPanel();
      }
      else if (accion === "menos") this.cambiarCantidad(i, -1);
      else if (accion === "mas") this.cambiarCantidad(i, 1);
      else if (accion === "quitar") this.quitar(i);
      else if (accion === "ocultar-seguimiento") this.ocultarSeguimiento();
      else if (accion === "ir-carrito") this.$("c-carrito").scrollIntoView({ block: "start" });
      else if (accion === "saltar") {
        const sec = this.$("c-cat-" + b.dataset.cat);
        if (sec) sec.scrollIntoView({ block: "start" });
      }
    });

    raiz.addEventListener("change", ev => {
      const t = ev.target;
      if (t.dataset.opcion && this.borrador) {
        const op = t.dataset.opcion;
        if (t.type === "checkbox") {
          const lista = new Set(this.borrador.selecciones[op] || []);
          if (t.checked) lista.add(t.value); else lista.delete(t.value);
          this.borrador.selecciones[op] = [...lista];
        } else {
          this.borrador.selecciones[op] = t.value;
        }
        this._refrescarPanel();
      }
      if (t.name === "tipo") this.$("c-domicilio").hidden = !this.$("c-tipo-domicilio").checked;
    });

    raiz.addEventListener("input", ev => {
      if (ev.target.dataset.campo === "indicaciones" && this.borrador) {
        this.borrador.indicaciones = ev.target.value;
        if (ev.target.value.trim()) {
          this.$("c-indicaciones-error").textContent = "";
          ev.target.removeAttribute("aria-invalid");
        }
      }
    });

    raiz.addEventListener("submit", ev => {
      ev.preventDefault();
      if (ev.target.id === "c-form") { this.confirmar(); return; }
      if (ev.target.classList.contains("personalizar")) {
        const p = this.menu.find(x => x.id === ev.target.dataset.id);
        if (p && !this.agotado(p)) this.agregar(p);
      }
    });
  },

  // Actualiza precio, contador de toppings e ingredientes sin redibujar todo.
  _refrescarPanel() {
    const p = this.menu.find(x => x.id === this.abierto);
    if (!p) return;
    const boton = this.$("c-agregar");
    if (boton) boton.textContent = this._textoAgregar(p);
    document.querySelectorAll("#vista-cliente [data-cuenta-op]").forEach(el => {
      const op = (p.opciones || []).find(o => o.id === el.dataset.cuentaOp);
      if (op) el.textContent = this._textoIncluidos(op);
    });
    const info = this.$("c-info-receta");
    if (info) info.innerHTML = this._infoReceta(p);
    // Si cambió el inventario, se habilitan o deshabilitan las opciones.
    document.querySelectorAll("#vista-cliente .personalizar input[data-opcion]").forEach(input => {
      const op = (p.opciones || []).find(o => o.id === input.dataset.opcion);
      const el = op && (op.elecciones || []).find(e => e.nombre === input.value);
      if (!el) return;
      const sinInsumo = this.eleccionAgotada(el);
      input.disabled = sinInsumo && !input.checked;
      input.closest(".opcion").classList.toggle("sin-insumo", sinInsumo);
    });
  }
};
