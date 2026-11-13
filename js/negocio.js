/* ============================================================
   Rappidos · negocio.js
   Panel del negocio: Pedidos, Cocina (semáforo y cantidades de
   cada ingrediente), Menú e Inventario (ver inventario.js).
   ============================================================ */

const Negocio = {
  pedidos: [],
  menu: [],
  insumos: new Map(),
  pestana: "pedidos",
  filtroPedidos: "activos",
  sector: "todos",
  confirmarBorrar: null,
  _conocidos: null,
  _ocupados: new Set(),
  _menuPendiente: false,
  _detalles: new Map(),      // qué listas de cantidades abrió o cerró el cocinero
  _iniciado: false,

  $(id) { return document.getElementById(id); },

  async iniciar(pestana) {
    if (pestana) this.mostrarPestana(pestana);
    if (this._iniciado) return;
    this._iniciado = true;
    this._eventos();
    const modo = await Store.iniciar();
    this._pintarConexion(modo);
    if (modo === "sin-conexion") {
      this.$("n-lista-pedidos").innerHTML = `<p class="vacio">${Util.esc(Store.errorConexion)}</p>`;
      this.$("n-tablero").innerHTML = "";
      return;
    }
    Store.escucharInsumos(lista => {
      this.insumos = new Map(lista.map(i => [i.id, i]));
      Inventario.recibirInsumos(lista);
      this.pintarCocina();
    }, e => this._error(Store.mensajeError(e)));
    Store.escucharPedidos(lista => this._recibirPedidos(lista), e => this._error(Store.mensajeError(e)));
    Store.escucharMenu(lista => { this.menu = lista; this.pintarMenu(); }, e => this._error(Store.mensajeError(e)));
    Inventario.iniciar(this);
    setInterval(() => this._actualizarTiempos(), 30000);
  },

  mostrarPestana(nombre) {
    const todas = ["pedidos", "cocina", "menu", "inventario"];
    if (!todas.includes(nombre)) nombre = "pedidos";
    this.pestana = nombre;
    todas.forEach(p => { this.$("n-" + p).hidden = p !== nombre; });
    document.querySelectorAll("#vista-negocio [data-pestana]").forEach(b => {
      b.setAttribute("aria-pressed", String(b.dataset.pestana === nombre));
    });
  },

  /* ---------- Pedidos ---------- */

  _recibirPedidos(lista) {
    if (this._conocidos === null) {
      this._conocidos = new Set(lista.map(p => p.id));
    } else {
      const nuevos = lista.filter(p => !this._conocidos.has(p.id));
      nuevos.forEach(p => this._conocidos.add(p.id));
      const pend = nuevos.filter(p => this._estado(p) === "pendiente");
      if (pend.length === 1) Util.aviso(this.$("n-aviso"), `Nuevo pedido ${pend[0].folio} de ${(pend[0].cliente && pend[0].cliente.nombre) || "un cliente"}.`);
      else if (pend.length > 1) Util.aviso(this.$("n-aviso"), `${pend.length} pedidos nuevos.`);
    }
    this.pedidos = lista;
    const pendientes = lista.filter(p => this._estado(p) === "pendiente").length;
    const globo = this.$("n-cuenta-pendientes");
    globo.textContent = pendientes;
    globo.hidden = pendientes === 0;
    this.pintarPedidos();
    this.pintarCocina();
  },

  _estado(p) { return ESTADOS[p.estado] ? p.estado : "pendiente"; },
  _desde(p) { return (p.historial || {})[this._estado(p)] || p.creado; },

  _sectorDe(linea) {
    if (SECTORES[linea.sector]) return linea.sector;
    const prod = this.menu.find(m => m.id === linea.productoId);
    return prod && SECTORES[prod.sector] ? prod.sector : "caliente";
  },

  _textoLinea(l) {
    const ops = Array.isArray(l.opciones) && l.opciones.length ? ` <span class="nota">${Util.esc(l.opciones.join(" · "))}</span>` : "";
    const ind = l.indicaciones ? ` <em>“${Util.esc(l.indicaciones)}”</em>` : "";
    return `<strong>${Number(l.cantidad) || 1}×</strong> ${Util.esc(l.nombre)}${ops}${ind}`;
  },

  // Cantidades de cada ingrediente para preparar la línea (ya multiplicadas por la cantidad).
  _ingredientesLinea(l) {
    const lista = (l.receta || []).filter(r => (this.insumos.get(r.insumoId) || {}).tipo !== "empaque");
    if (!lista.length) return l.indicaciones ? "" : '<p class="nota">Sin receta registrada.</p>';
    return `<ul class="lista-ingredientes">${lista.map(r =>
      `<li><span>${Util.esc(r.nombre)}</span><span class="num">${Util.cantidad(r.cantidad, r.unidad)}</span></li>`).join("")}</ul>`;
  },

  _botonAvanzar(p, grande) {
    const info = ESTADOS[this._estado(p)];
    if (!info.siguiente) return '<span class="nota">Terminado</span>';
    const ocupado = this._ocupados.has(p.id);
    return `<button type="button" class="boton ${grande ? "boton-grande" : ""} boton-${ESTADOS[info.siguiente].color}"
      data-accion="avanzar" data-id="${Util.esc(p.id)}" ${ocupado ? "disabled" : ""}>${info.boton}</button>`;
  },

  _etiquetaEstado(p) {
    const e = this._estado(p);
    return `<span class="semaforo ${ESTADOS[e].color}">${ESTADOS[e].texto}</span>`;
  },

  _tiempo(p) {
    if (this._estado(p) === "entregado") {
      const h = p.historial && p.historial.entregado;
      return h ? `<span class="nota">a las ${Util.hora(h)}</span>` : "";
    }
    const desde = this._desde(p);
    return `<span class="nota" data-desde="${Util.esc(desde)}">${Util.textoMinutos(Util.minutosDesde(desde))}</span>`;
  },

  pintarPedidos() {
    const cont = this.$("n-lista-pedidos");
    let lista = this.pedidos;
    if (this.filtroPedidos === "activos") lista = lista.filter(p => ESTADOS_ACTIVOS.includes(this._estado(p)));
    if (this.filtroPedidos === "entregado") lista = lista.filter(p => this._estado(p) === "entregado");
    if (!lista.length) {
      cont.innerHTML = {
        activos: '<p class="vacio">No hay pedidos activos. Cuando un cliente confirme un pedido, aparecerá aquí sin recargar la página.</p>',
        entregado: '<p class="vacio">Todavía no hay pedidos entregados.</p>',
        todos: '<p class="vacio">Todavía no hay pedidos.</p>'
      }[this.filtroPedidos];
      return;
    }
    cont.innerHTML = `
      <div class="tabla-scroll">
        <table class="tabla tabla-pedidos">
          <thead><tr>
            <th scope="col">Folio</th><th scope="col">Hora</th><th scope="col">Cliente</th><th scope="col">Entrega</th>
            <th scope="col">Productos</th><th scope="col" class="num">Total</th><th scope="col">Estado</th>
            <th scope="col"><span class="oculto">Acción</span></th>
          </tr></thead>
          <tbody>
            ${lista.map(p => `
              <tr class="fila-${ESTADOS[this._estado(p)].color}">
                <td><strong class="folio">${Util.esc(p.folio)}</strong></td>
                <td>${Util.hora(p.creado)}</td>
                <td>${Util.esc(p.cliente && p.cliente.nombre)}<br><span class="nota">${Util.esc(p.cliente && p.cliente.telefono)}</span></td>
                <td>${p.tipo === "domicilio"
                  ? `A domicilio<br><span class="nota">${Util.esc(p.direccion && p.direccion.calle)}, ${Util.esc(p.direccion && p.direccion.colonia)}</span>`
                  : "Recoger en el local"}</td>
                <td>
                  <ul class="lista-simple">${(p.productos || []).map(l => `<li>${this._textoLinea(l)}</li>`).join("")}</ul>
                  ${p.notas ? `<p class="nota">Notas: ${Util.esc(p.notas)}</p>` : ""}
                </td>
                <td class="num precio">${Util.dinero(p.total)}</td>
                <td>${this._etiquetaEstado(p)}<br>${this._tiempo(p)}${p.inventarioDescontado ? '<br><span class="nota">Inventario descontado</span>' : ""}</td>
                <td>${this._botonAvanzar(p, false)}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>`;
  },

  /* ---------- Cocina ---------- */

  pintarCocina() {
    const cont = this.$("n-tablero");
    const activos = this.pedidos
      .filter(p => ESTADOS_ACTIVOS.includes(this._estado(p)))
      .slice()
      .sort((a, b) => String(a.creado).localeCompare(String(b.creado)));
    const tarjetas = activos.map(p => {
      const grupos = {};
      (p.productos || []).forEach((l, i) => {
        const s = this._sectorDe(l);
        if (this.sector !== "todos" && s !== this.sector) return;
        (grupos[s] = grupos[s] || []).push({ l, i });
      });
      const sectores = Object.keys(SECTORES).filter(s => grupos[s]);
      if (!sectores.length) return "";
      const estado = this._estado(p);
      return `
        <article class="comanda borde-${ESTADOS[estado].color}">
          <header class="comanda-cab">
            <span class="folio">${Util.esc(p.folio)}</span>
            ${this._etiquetaEstado(p)}
          </header>
          <p class="nota">Llegó ${Util.hora(p.creado)} · ${this._tiempo(p)} en este estado · ${p.tipo === "domicilio" ? "A domicilio" : "Recoger"}</p>
          ${sectores.map(s => `
            <div class="comanda-sector">
              <h3>${SECTORES[s]}</h3>
              ${grupos[s].map(({ l, i }) => {
                const clave = p.id + "-" + i;
                return `
                <div class="comanda-linea">
                  <p>${this._textoLinea(l)}</p>
                  <details data-clave="${Util.esc(clave)}" ${(this._detalles.has(clave) ? this._detalles.get(clave) : estado !== "listo") ? "open" : ""}>
                    <summary>Cantidades a usar</summary>
                    ${this._ingredientesLinea(l)}
                  </details>
                </div>`;
              }).join("")}
            </div>`).join("")}
          ${p.notas ? `<p class="comanda-notas">Notas: ${Util.esc(p.notas)}</p>` : ""}
          ${this._botonAvanzar(p, true)}
        </article>`;
    }).filter(Boolean);
    if (!tarjetas.length) {
      cont.innerHTML = this.sector === "todos"
        ? '<p class="vacio">No hay pedidos activos en este momento.</p>'
        : `<p class="vacio">No hay productos de ${SECTORES[this.sector]} en los pedidos activos.</p>`;
      return;
    }
    cont.innerHTML = tarjetas.join("");
  },

  async avanzar(id) {
    const p = this.pedidos.find(x => x.id === id);
    if (!p || this._ocupados.has(id)) return;
    const siguiente = ESTADOS[this._estado(p)].siguiente;
    if (!siguiente) return;
    this._ocupados.add(id);
    this.pintarPedidos();
    this.pintarCocina();
    try {
      await Store.cambiarEstado(id, siguiente);
      Util.aviso(this.$("n-aviso"), `${p.folio}: ${ESTADOS[siguiente].texto}.` + (siguiente === "listo" ? " Se descontaron sus ingredientes del inventario." : ""));
    } catch (e) {
      this._error(Store.mensajeError(e));
    } finally {
      this._ocupados.delete(id);
      this.pintarPedidos();
      this.pintarCocina();
    }
  },

  _actualizarTiempos() {
    document.querySelectorAll("#vista-negocio [data-desde]").forEach(el => {
      el.textContent = Util.textoMinutos(Util.minutosDesde(el.dataset.desde));
    });
  },

  /* ---------- Menú ---------- */

  pintarMenu() {
    const tbody = this.$("n-filas-menu");
    const activo = document.activeElement;
    if (activo && tbody.contains(activo) && activo.matches('input[type="number"], input[data-campo="imagen"]')) {
      this._menuPendiente = true;
      return;
    }
    this._menuPendiente = false;
    if (!this.menu.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="vacio">El menú está vacío. Agrega el primer producto con el formulario de arriba.</td></tr>';
      return;
    }
    tbody.innerHTML = this.menu.map(p => {
      const id = Util.esc(p.id);
      const nombre = Util.esc(p.nombre);
      const opciones = (p.opciones || []).length ? `<br><span class="nota">Opciones: ${Util.esc(p.opciones.map(o => o.titulo).join(", "))}</span>` : "";
      const receta = (p.receta || []).length
        ? `<details><summary>Receta base (1 pieza)</summary><ul class="lista-ingredientes">${Recetas.detalle(p.receta, this.insumos).map(r =>
            `<li><span>${Util.esc(r.nombre)}</span><span class="num">${Util.cantidad(r.cantidad, r.unidad)}</span></li>`).join("")}</ul></details>`
        : '<br><span class="nota">Sin receta registrada.</span>';
      const sector = SECTORES[p.sector] ? p.sector : "caliente";
      const rango = Precios.rango(p);
      const notaPrecio = rango.max > rango.min ? `<br><span class="nota">Base. Con opciones: ${Util.dinero(rango.min)} a ${Util.dinero(rango.max)}</span>` : "";
      const foto = p.imagen && RUTA_FOTO.test(p.imagen)
        ? `<img class="miniatura" src="${Util.esc(p.imagen)}" alt="" width="64" height="48" loading="lazy">`
        : `<span class="miniatura sin-foto">Sin foto</span>`;
      const borrar = this.confirmarBorrar === p.id
        ? `<span class="confirmar-borrar">¿Eliminar ${nombre}?
             <button type="button" class="boton boton-peligro" data-accion="borrar-si" data-id="${id}">Sí, eliminar</button>
             <button type="button" class="boton boton-secundario" data-accion="borrar-no">No</button></span>`
        : `<button type="button" class="boton boton-secundario" data-accion="borrar" data-id="${id}">Eliminar</button>`;
      return `
        <tr data-id="${id}">
          <td class="celda-foto">${foto}
            <input id="n-imagen-${id}" class="entrada-foto" data-campo="imagen" data-id="${id}" maxlength="80"
              value="${Util.esc(p.imagen || "")}" placeholder="img/archivo.jpg" aria-label="Foto de ${nombre}">
          </td>
          <td><strong>${nombre}</strong>${p.descripcion ? `<br><span class="nota">${Util.esc(p.descripcion)}</span>` : ""}${opciones}${receta}</td>
          <td>${Util.esc(CATEGORIAS[p.categoria] || p.categoria || "—")}</td>
          <td><select id="n-sector-${id}" data-campo="sector" data-id="${id}" aria-label="Sector de ${nombre}">
            ${Object.entries(SECTORES).map(([k, t]) => `<option value="${k}" ${k === sector ? "selected" : ""}>${t}</option>`).join("")}
          </select></td>
          <td><input id="n-precio-${id}" class="entrada-precio" type="number" min="0" step="1" inputmode="numeric"
              data-campo="precio" data-id="${id}" value="${Number(p.precio) || 0}" aria-label="Precio de ${nombre}">${notaPrecio}</td>
          <td><label class="opcion" for="n-disp-${id}">
              <input type="checkbox" id="n-disp-${id}" data-campo="disponible" data-id="${id}" ${p.disponible !== false ? "checked" : ""}>
              ${p.disponible !== false ? "Sí" : "Agotado"}</label></td>
          <td>${borrar}</td>
        </tr>`;
    }).join("");
  },

  async guardarCampo(input) {
    const id = input.dataset.id;
    const campo = input.dataset.campo;
    const p = this.menu.find(x => x.id === id);
    if (!p) return;
    let valor;
    if (campo === "precio") {
      valor = Number(input.value);
      if (input.value === "" || !isFinite(valor) || valor < 0) {
        this._error("Escribe un precio válido (0 o más).");
        input.value = Number(p.precio) || 0;
        return;
      }
      if (valor === Number(p.precio)) return;
    } else if (campo === "disponible") valor = input.checked;
    else if (campo === "sector") valor = input.value;
    else if (campo === "imagen") {
      valor = input.value.trim();
      if (valor && !RUTA_FOTO.test(valor)) {
        this._error("Escribe la foto como img/nombre.jpg (también sirve .png o .webp).");
        input.value = p.imagen || "";
        return;
      }
      if (valor === (p.imagen || "")) return;
    } else return;
    try {
      await Store.actualizarProducto(id, { [campo]: valor });
      const textos = {
        precio: `Precio de ${p.nombre}: ${Util.dinero(valor)}.`,
        disponible: valor ? `${p.nombre} está disponible.` : `${p.nombre} quedó como agotado.`,
        sector: `${p.nombre} ahora se prepara en ${SECTORES[valor]}.`,
        imagen: valor ? `Foto de ${p.nombre} actualizada.` : `Se quitó la foto de ${p.nombre}.`
      };
      Util.aviso(this.$("n-aviso"), textos[campo]);
    } catch (e) {
      this._error(Store.mensajeError(e));
      this.pintarMenu();
    }
  },

  async agregarProducto() {
    const errorEl = this.$("n-form-error");
    const nombre = this.$("n-nuevo-nombre").value.trim();
    const precioTexto = this.$("n-nuevo-precio").value;
    const precio = Number(precioTexto);
    const imagen = this.$("n-nuevo-imagen").value.trim();
    let error = "";
    if (nombre.length < 2) error = "Escribe el nombre del producto.";
    else if (precioTexto === "" || !isFinite(precio) || precio < 0) error = "Escribe un precio válido (0 o más).";
    else if (this.menu.some(p => String(p.nombre).toLowerCase() === nombre.toLowerCase())) error = "Ya existe un producto con ese nombre.";
    else if (imagen && !RUTA_FOTO.test(imagen)) error = "Escribe la foto como img/nombre.jpg (también sirve .png o .webp).";
    errorEl.textContent = error;
    errorEl.hidden = !error;
    if (error) return;
    const boton = this.$("n-agregar");
    boton.disabled = true;
    try {
      await Store.agregarProducto({
        nombre, precio, imagen,
        categoria: this.$("n-nuevo-categoria").value,
        sector: this.$("n-nuevo-sector").value,
        descripcion: this.$("n-nuevo-descripcion").value.trim()
      });
      this.$("n-form-producto").reset();
      Util.aviso(this.$("n-aviso"), `${nombre} se agregó al menú.`);
    } catch (e) {
      errorEl.textContent = Store.mensajeError(e);
      errorEl.hidden = false;
    } finally {
      boton.disabled = false;
    }
  },

  async eliminar(id) {
    const p = this.menu.find(x => x.id === id);
    this.confirmarBorrar = null;
    try {
      await Store.eliminarProducto(id);
      Util.aviso(this.$("n-aviso"), `${p ? p.nombre : "El producto"} se eliminó del menú.`);
    } catch (e) {
      this._error(Store.mensajeError(e));
      this.pintarMenu();
    }
  },

  /* ---------- Conexión y errores ---------- */

  _pintarConexion(modo) {
    const el = this.$("n-conexion");
    el.dataset.modo = modo;
    el.textContent = {
      "mysql": "En línea con MySQL: los pedidos y el inventario se guardan en la base de datos.",
      "local": "Modo local: solo llegan los pedidos hechos en este mismo navegador (sin MySQL).",
      "sin-conexion": "No se pudo conectar con MySQL: " + Store.errorConexion
    }[modo] || "Conectando…";
  },

  _error(texto) {
    const el = this.$("n-error");
    el.textContent = texto;
    el.hidden = !texto;
    clearTimeout(this._tError);
    if (texto) this._tError = setTimeout(() => { el.hidden = true; }, 8000);
  },

  /* ---------- Eventos ---------- */

  _eventos() {
    const raiz = this.$("vista-negocio");
    raiz.addEventListener("click", ev => {
      const b = ev.target.closest("button");
      if (!b || !raiz.contains(b) || b.disabled) return;
      if (b.dataset.pestana) { this.mostrarPestana(b.dataset.pestana); return; }
      if (b.dataset.filtroPedidos) {
        this.filtroPedidos = b.dataset.filtroPedidos;
        raiz.querySelectorAll("[data-filtro-pedidos]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
        this.pintarPedidos();
        return;
      }
      if (b.dataset.sector) {
        this.sector = b.dataset.sector;
        raiz.querySelectorAll("[data-sector]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
        this.pintarCocina();
        return;
      }
      const accion = b.dataset.accion;
      if (accion === "avanzar") this.avanzar(b.dataset.id);
      else if (accion === "borrar") { this.confirmarBorrar = b.dataset.id; this.pintarMenu(); }
      else if (accion === "borrar-no") { this.confirmarBorrar = null; this.pintarMenu(); }
      else if (accion === "borrar-si") this.eliminar(b.dataset.id);
    });
    raiz.addEventListener("change", ev => {
      const t = ev.target;
      if (t.dataset.campo && t.dataset.id && t.closest("#n-filas-menu")) { this.guardarCampo(t); return; }
      if (t.id === "n-nuevo-categoria") this.$("n-nuevo-sector").value = SECTOR_SUGERIDO[t.value] || "caliente";
    });
    raiz.addEventListener("toggle", ev => {
      const d = ev.target;
      if (d.dataset && d.dataset.clave) this._detalles.set(d.dataset.clave, d.open);
    }, true);
    raiz.addEventListener("focusout", () => {
      setTimeout(() => { if (this._menuPendiente) this.pintarMenu(); }, 0);
    });
    raiz.addEventListener("submit", ev => {
      ev.preventDefault();
      if (ev.target.id === "n-form-producto") this.agregarProducto();
    });
  }
};
