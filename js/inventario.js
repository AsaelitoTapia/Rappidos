/* ============================================================
   Rappidos · inventario.js
   Pestaña Inventario del panel: existencias, compras (entradas),
   conteos físicos (ajustes), gasto en materia prima y movimientos.
   ============================================================ */

const Inventario = {
  insumos: [],
  movimientos: [],
  filtro: "todos",
  buscar: "",
  periodo: "hoy",
  formAbierto: null,       // { id, tipo: "entrada" | "ajuste" }
  _pendiente: false,
  _iniciado: false,

  $(id) { return document.getElementById(id); },

  iniciar() {
    if (this._iniciado) return;
    this._iniciado = true;
    this._eventos();
    Store.escucharMovimientos(lista => { this.movimientos = lista; this.pintarResumen(); this.pintarConsumo(); this.pintarMovimientos(); },
      e => Negocio._error(Store.mensajeError(e)));
  },

  recibirInsumos(lista) {
    this.insumos = lista;
    const surtir = lista.filter(i => this.estado(i) !== "ok").length;
    const globo = this.$("n-cuenta-surtir");
    globo.textContent = surtir;
    globo.hidden = surtir === 0;
    this.pintarResumen();
    this.pintarTabla();
  },

  estado(i) {
    if (i.existencia <= 0) return "agotado";
    if (i.existencia <= i.minimo) return "surtir";
    return "ok";
  },

  /* ---------- Resumen ---------- */

  _desdePeriodo() {
    const d = new Date();
    if (this.periodo === "hoy") { d.setHours(0, 0, 0, 0); return d.getTime(); }
    if (this.periodo === "semana") return d.getTime() - 7 * 24 * 3600 * 1000;
    return 0;
  },

  _gasto(desde) {
    return this.movimientos
      .filter(m => m.tipo === "salida" && Date.parse(m.creado) >= desde)
      .reduce((s, m) => s + (-m.cantidad) * (Number(m.costo) || 0), 0);
  },

  pintarResumen() {
    const cont = this.$("n-inv-resumen");
    if (!cont) return;
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const valor = this.insumos.reduce((s, i) => s + Math.max(0, i.existencia) * (Number(i.costo) || 0), 0);
    const surtir = this.insumos.filter(i => this.estado(i) !== "ok").length;
    const tarjetas = [
      ["Gasto en materia prima hoy", Util.dinero(Math.round(this._gasto(hoy.getTime()) * 100) / 100)],
      ["Gasto de los últimos 7 días", Util.dinero(Math.round(this._gasto(Date.now() - 7 * 24 * 3600 * 1000) * 100) / 100)],
      ["Valor del inventario", Util.dinero(Math.round(valor * 100) / 100)],
      ["Insumos por surtir", String(surtir)]
    ];
    cont.innerHTML = tarjetas.map(([t, v], k) =>
      `<div class="dato${k === 3 && surtir ? " dato-alerta" : ""}"><span class="dato-valor">${v}</span><span class="dato-texto">${t}</span></div>`).join("");
  },

  /* ---------- Tabla de insumos ---------- */

  pintarTabla() {
    const tbody = this.$("n-filas-inventario");
    const activo = document.activeElement;
    if (activo && tbody.contains(activo) && activo.tagName === "INPUT") { this._pendiente = true; return; }
    this._pendiente = false;
    const q = this.buscar.toLowerCase();
    let lista = this.insumos.filter(i => !q || i.nombre.toLowerCase().includes(q));
    if (this.filtro === "surtir") lista = lista.filter(i => this.estado(i) !== "ok");
    if (this.filtro === "ingrediente" || this.filtro === "empaque") lista = lista.filter(i => i.tipo === this.filtro);
    if (!lista.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="vacio">No hay insumos con ese filtro.</td></tr>';
      return;
    }
    const ETQ = { ok: ["ok", "Suficiente"], surtir: ["surtir", "Por surtir"], agotado: ["agotado", "Agotado"] };
    tbody.innerHTML = lista.map(i => {
      const id = Util.esc(i.id);
      const [clase, texto] = ETQ[this.estado(i)];
      const u = UNIDADES[i.unidad] || i.unidad;
      const form = this.formAbierto && this.formAbierto.id === i.id ? this._formulario(i) : "";
      return `
        <tr data-id="${id}">
          <td><strong>${Util.esc(i.nombre)}</strong><br><span class="nota">${i.tipo === "empaque" ? "Empaque" : "Ingrediente"} · por ${u}</span></td>
          <td class="num"><strong>${Util.cantidad(i.existencia, i.unidad)}</strong></td>
          <td><input id="n-min-${id}" class="entrada-corta" type="number" min="0" step="any" data-inv-campo="minimo" data-id="${id}"
                value="${i.minimo}" aria-label="Mínimo de ${Util.esc(i.nombre)}"> <span class="nota">${u}</span></td>
          <td><input id="n-costo-${id}" class="entrada-corta" type="number" min="0" step="any" data-inv-campo="costo" data-id="${id}"
                value="${i.costo}" aria-label="Costo por ${u} de ${Util.esc(i.nombre)}"> <span class="nota">$/${u}</span></td>
          <td class="num">${Util.dinero(Math.round(Math.max(0, i.existencia) * i.costo * 100) / 100)}</td>
          <td><span class="estado-insumo ${clase}">${texto}</span></td>
          <td class="acciones-inv">
            <button type="button" class="boton boton-mini-texto" data-inv="entrada" data-id="${id}">Registrar compra</button>
            <button type="button" class="boton boton-mini-texto boton-secundario" data-inv="ajuste" data-id="${id}">Ajustar conteo</button>
          </td>
        </tr>${form}`;
    }).join("");
  },

  _formulario(i) {
    const id = Util.esc(i.id);
    const u = UNIDADES[i.unidad] || i.unidad;
    if (this.formAbierto.tipo === "entrada") {
      return `
        <tr class="fila-form"><td colspan="7">
          <form class="form-inv" data-form-inv="entrada" data-id="${id}" novalidate>
            <strong>Compra de ${Util.esc(i.nombre)}</strong>
            <label for="n-ent-cant">Cantidad (${u})</label>
            <input id="n-ent-cant" type="number" min="0" step="any" required>
            <label for="n-ent-costo">Costo por ${u} (opcional)</label>
            <input id="n-ent-costo" type="number" min="0" step="any" placeholder="${i.costo}">
            <button type="submit" class="boton boton-principal">Guardar entrada</button>
            <button type="button" class="boton boton-secundario" data-inv="cerrar">Cancelar</button>
          </form>
        </td></tr>`;
    }
    return `
      <tr class="fila-form"><td colspan="7">
        <form class="form-inv" data-form-inv="ajuste" data-id="${id}" novalidate>
          <strong>Conteo físico de ${Util.esc(i.nombre)}</strong>
          <label for="n-aj-cant">Existencia real (${u})</label>
          <input id="n-aj-cant" type="number" min="0" step="any" value="${i.existencia}" required>
          <label for="n-aj-nota">Motivo</label>
          <input id="n-aj-nota" maxlength="80" placeholder="Ej. merma, conteo semanal">
          <button type="submit" class="boton boton-principal">Guardar ajuste</button>
          <button type="button" class="boton boton-secundario" data-inv="cerrar">Cancelar</button>
        </form>
      </td></tr>`;
  },

  async guardarFormulario(form) {
    const id = form.dataset.id;
    const i = this.insumos.find(x => x.id === id);
    if (!i) return;
    try {
      if (form.dataset.formInv === "entrada") {
        const cant = Number(this.$("n-ent-cant").value);
        const costoTxt = this.$("n-ent-costo").value;
        if (!(cant > 0)) { Negocio._error("Escribe una cantidad mayor que 0."); return; }
        if (costoTxt !== "" && !(Number(costoTxt) >= 0)) { Negocio._error("El costo debe ser 0 o más."); return; }
        await Store.registrarEntrada(id, cant, costoTxt === "" ? null : Number(costoTxt), "Compra");
        Util.aviso(this.$("n-aviso"), `Entrada de ${Util.cantidad(cant, i.unidad)} de ${i.nombre} registrada.`);
      } else {
        const txt = this.$("n-aj-cant").value;
        const cant = Number(txt);
        if (txt === "" || !(cant >= 0)) { Negocio._error("La existencia contada debe ser 0 o más."); return; }
        await Store.ajustarExistencia(id, cant, this.$("n-aj-nota").value.trim() || "Conteo físico");
        Util.aviso(this.$("n-aviso"), `Existencia de ${i.nombre} ajustada a ${Util.cantidad(cant, i.unidad)}.`);
      }
      this.formAbierto = null;
      this.pintarTabla();
    } catch (e) {
      Negocio._error(Store.mensajeError(e));
    }
  },

  async guardarCampo(input) {
    const id = input.dataset.id;
    const campo = input.dataset.invCampo;
    const i = this.insumos.find(x => x.id === id);
    const valor = Number(input.value);
    if (!i) return;
    if (input.value === "" || !(valor >= 0)) {
      Negocio._error("El valor debe ser 0 o más.");
      input.value = i[campo];
      return;
    }
    if (valor === Number(i[campo])) return;
    try {
      await Store.actualizarInsumo(id, campo, valor);
      Util.aviso(this.$("n-aviso"), campo === "minimo" ? `Mínimo de ${i.nombre} actualizado.` : `Costo de ${i.nombre} actualizado.`);
    } catch (e) {
      Negocio._error(Store.mensajeError(e));
    }
  },

  /* ---------- Gasto y movimientos ---------- */

  pintarConsumo() {
    const cont = this.$("n-consumo");
    if (!cont) return;
    const desde = this._desdePeriodo();
    const usos = new Map();
    this.movimientos.filter(m => m.tipo === "salida" && Date.parse(m.creado) >= desde).forEach(m => {
      const u = usos.get(m.insumoId) || { nombre: m.nombre, unidad: m.unidad, cantidad: 0, costo: 0 };
      u.cantidad += -m.cantidad;
      u.costo += -m.cantidad * (Number(m.costo) || 0);
      usos.set(m.insumoId, u);
    });
    const lista = [...usos.values()].sort((a, b) => b.costo - a.costo);
    if (!lista.length) {
      cont.innerHTML = '<p class="vacio">Todavía no se ha preparado ningún pedido en este periodo.</p>';
      return;
    }
    const total = lista.reduce((s, u) => s + u.costo, 0);
    cont.innerHTML = `
      <div class="tabla-scroll"><table class="tabla">
        <thead><tr><th scope="col">Insumo</th><th scope="col" class="num">Cantidad usada</th><th scope="col" class="num">Costo</th></tr></thead>
        <tbody>${lista.map(u => `<tr><td>${Util.esc(u.nombre)}</td><td class="num">${Util.cantidad(u.cantidad, u.unidad)}</td>
          <td class="num">${Util.dinero(Math.round(u.costo * 100) / 100)}</td></tr>`).join("")}
          <tr class="fila-total"><td>Total</td><td></td><td class="num">${Util.dinero(Math.round(total * 100) / 100)}</td></tr>
        </tbody></table></div>`;
  },

  pintarMovimientos() {
    const cont = this.$("n-movimientos");
    if (!cont) return;
    const lista = this.movimientos.slice(0, 40);
    if (!lista.length) { cont.innerHTML = '<p class="vacio">Sin movimientos.</p>'; return; }
    const TIPO = { entrada: "Entrada", salida: "Salida", ajuste: "Ajuste" };
    cont.innerHTML = `
      <div class="tabla-scroll"><table class="tabla tabla-mov">
        <thead><tr><th scope="col">Fecha</th><th scope="col">Insumo</th><th scope="col">Tipo</th><th scope="col" class="num">Cantidad</th><th scope="col" class="num">Queda</th><th scope="col">Nota</th></tr></thead>
        <tbody>${lista.map(m => `<tr>
          <td>${Util.fechaHora(m.creado)}</td><td>${Util.esc(m.nombre)}</td>
          <td><span class="mov ${m.tipo}">${TIPO[m.tipo] || m.tipo}</span></td>
          <td class="num">${m.cantidad > 0 ? "+" : ""}${Util.cantidad(m.cantidad, m.unidad)}</td>
          <td class="num">${Util.cantidad(m.existencia, m.unidad)}</td>
          <td class="nota">${Util.esc(m.nota || "")}</td></tr>`).join("")}</tbody>
      </table></div>`;
  },

  /* ---------- Eventos ---------- */

  _eventos() {
    const sec = this.$("n-inventario");
    sec.addEventListener("click", ev => {
      const b = ev.target.closest("button");
      if (!b) return;
      if (b.dataset.filtroInv) {
        this.filtro = b.dataset.filtroInv;
        sec.querySelectorAll("[data-filtro-inv]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
        this.pintarTabla();
        return;
      }
      if (b.dataset.inv === "cerrar") { this.formAbierto = null; this.pintarTabla(); return; }
      if (b.dataset.inv === "entrada" || b.dataset.inv === "ajuste") {
        this.formAbierto = { id: b.dataset.id, tipo: b.dataset.inv };
        this.pintarTabla();
        const primero = sec.querySelector(".form-inv input");
        if (primero) primero.focus();
      }
    });
    sec.addEventListener("submit", ev => {
      if (!ev.target.dataset.formInv) return;
      ev.preventDefault();
      this.guardarFormulario(ev.target);
    });
    sec.addEventListener("change", ev => {
      const t = ev.target;
      if (t.dataset.invCampo) this.guardarCampo(t);
      if (t.id === "n-periodo") { this.periodo = t.value; this.pintarConsumo(); }
    });
    sec.addEventListener("input", ev => {
      if (ev.target.id === "n-inv-buscar") { this.buscar = ev.target.value.trim(); this.pintarTabla(); }
    });
    sec.addEventListener("focusout", () => {
      setTimeout(() => { if (this._pendiente && !(document.activeElement && document.activeElement.closest("#n-filas-inventario"))) this.pintarTabla(); }, 0);
    });
  }
};
