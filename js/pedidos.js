import { app, db } from "./firebase-config.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import {
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
const auth = getAuth(app),
  pagina = document.querySelector(".pagina-pedidos"),
  lista = document.getElementById("lista-pedidos");
const API =
  "https://el-lucero-pruebas-worker.eriikgow.workers.dev/api/admin/pedidos";
const moneda = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});
const estados = {
  pendiente: "Pendientes",
  preparando: "Preparando",
  listo: "Listos",
  entregado: "Entregados",
  cancelado: "Cancelados",
};
let pedidos = [],
  filtro = "activos",
  cocina = false,
  seleccionado = null,
  generacion = 0,
  timer,
  ocupado = false,
  consultando = false,
  vigente = false,
  vistos = null,
  audio = null,
  sonido = false;
pagina.hidden = true;
pagina.classList.add("kds");
lista.replaceChildren();
function el(tag, texto, clase) {
  const n = document.createElement(tag);
  if (texto != null) n.textContent = texto;
  if (clase) n.className = clase;
  return n;
}
function boton(texto, fn, clase = "") {
  const b = el("button", texto, "kds-btn " + clase);
  b.type = "button";
  b.onclick = fn;
  return b;
}
const aviso = el("p", "Consultando pedidos...");
aviso.setAttribute("role", "status");
const barra = el("div", null, "kds-barra"),
  filtros = el("div", null, "kds-filtros");
const modal = el("dialog", null, "kds-modal");
pagina.append(modal);
lista.before(barra, filtros, aviso);
const modo = boton("👨‍🍳 Modo cocina", async () => {
  cocina = !cocina;
  pagina.classList.toggle("kds-cocina", cocina);
  modo.textContent = cocina ? "Salir de cocina" : "👨‍🍳 Modo cocina";
  try {
    if (cocina && !document.fullscreenElement) await pagina.requestFullscreen();
    else if (!cocina && document.fullscreenElement === pagina)
      await document.exitFullscreen();
  } catch {}
  render();
});
document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement && cocina) {
    cocina = false;
    pagina.classList.remove("kds-cocina");
    modo.textContent = "👨‍🍳 Modo cocina";
    render();
  }
});
const sonidoBtn = boton("🔇 Activar sonido", async () => {
  try {
    if (sonido) {
      sonido = false;
      sonidoBtn.textContent = "🔇 Activar sonido";
      return;
    }
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    await audio.resume();
    sonido = true;
    sonidoBtn.textContent = "🔊 Sonido activo";
    pitido();
  } catch {
    alert("El navegador no permite activar el audio.");
  }
});
barra.append(modo, sonidoBtn);
function pitido() {
  if (!sonido || audio?.state !== "running") return;
  for (let i = 0; i < 3; i++) {
    const o = audio.createOscillator(),
      g = audio.createGain(),
      t = audio.currentTime + i * 0.22;
    o.frequency.value = 740 + i * 120;
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g);
    g.connect(audio.destination);
    o.start(t);
    o.stop(t + 0.19);
  }
}
function reloj(p) {
  const raw = String(p.creado_en || "");
  const iso = /^\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d(?:\.\d+)?$/.test(raw)
    ? raw.replace(" ", "T") + "Z"
    : raw;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "Hora no disponible";
  if (["entregado", "cancelado"].includes(p.estado))
    return new Date(t).toLocaleTimeString("es-MX");
  const m = Math.max(0, Math.floor((Date.now() - t) / 60000));
  return `${Math.floor(m / 60)} h ${m % 60} min desde ingreso`;
}
function actualizarRelojes() {
  pagina.querySelectorAll("[data-reloj]").forEach((n) => {
    const p = pedidos.find((p) => String(p.id) === n.dataset.reloj);
    if (p) n.textContent = reloj(p);
  });
}
setInterval(actualizarRelojes, 1000);
function tarjeta(p, grande = false) {
  const a = el("article", null, "kds-ticket estado-" + p.estado);
  const h = el("div", null, "kds-cabecera");
  h.append(
    el("h2", `#${p.numero_pedido}`),
    el("span", estados[p.estado] || p.estado, "kds-estado"),
  );
  a.append(
    h,
    el(
      "div",
      p.origen === "mostrador"
        ? "🛒 MOSTRADOR"
        : p.origen === "en_linea"
          ? "📱 EN LÍNEA"
          : "Origen desconocido",
      "kds-origen " + (p.origen === "mostrador" ? "mostrador" : "linea"),
    ),
  );
  const r = el("p", reloj(p), "kds-reloj");
  r.dataset.reloj = p.id;
  a.append(
    r,
    el("p", p.nombre_cliente),
    el(
      "p",
      p.tipo_entrega === "local"
        ? `Local: ${p.lugar_entrega}`
        : "Recoger en mostrador",
    ),
  );
  function mostrarPersonalizacion(destino, producto) {
    if (Array.isArray(producto.opcionesElegidas) && producto.opcionesElegidas.length) {
      const opciones = el("div", "OPCIONES: " + producto.opcionesElegidas.join(" + ").toUpperCase(), "kds-opciones");
      opciones.style.color = "#ffc400";
      opciones.style.fontWeight = "bold";
      opciones.style.marginTop = "5px";
      destino.append(opciones);
    }
    if (Array.isArray(producto.ingredientesQuitados) && producto.ingredientesQuitados.length) {
      destino.append(el("div", "SIN " + producto.ingredientesQuitados.join(", ").toUpperCase(), "kds-sin"));
    }
  }
  for (const prod of p.productos) {
    const item = el("div", null, "kds-item");
    item.append(el("strong", `${prod.cantidad} × ${prod.nombre}`));
    mostrarPersonalizacion(item, prod);
    if (Array.isArray(prod.componentesCombo) && prod.componentesCombo.length) {
      const grupo = el("div", null, "kds-combo-componentes");
      grupo.append(el("div", `Contenido por combo (repetir ${prod.cantidad} ×):`, "kds-combo-nota"));
      for (const c of prod.componentesCombo) {
        const bloque = el("div", null, "kds-combo-componente");
        bloque.append(el("strong", `1 × ${c.nombre} · unidad ${c.unidad}`));
        mostrarPersonalizacion(bloque, c);
        grupo.append(bloque);
      }
      item.append(grupo);
    }
    a.append(item);
  }
  const pagado = ["efectivo", "transferencia"].includes(p.metodo_pago);
  if (!cocina) {
    const descuento = Number(p.descuento_centavos);
    const porcentaje = Number(p.cupon_porcentaje);
    const totalCentavos = Math.round(Number(p.total) * 100);
    if (p.cupon_codigo && [5, 10].includes(porcentaje) &&
        Number.isSafeInteger(descuento) && descuento >= 0 &&
        Number.isSafeInteger(totalCentavos)) {
      const desglose = el("div", null, "kds-cupon");
      desglose.style.marginTop = "10px";
      const detalle = el("p", `🎟️ Cupón ${p.cupon_codigo} (${porcentaje}%)`);
      const ahorro = el("p", `Descuento: −${moneda.format(descuento / 100)} MXN`);
      detalle.style.color = ahorro.style.color = "#4ade80";
      desglose.append(
        el("p", `Subtotal: ${moneda.format((totalCentavos + descuento) / 100)} MXN`),
        detalle, ahorro
      );
      a.append(desglose);
    }
  }
  if (!cocina)
    a.append(
      el("p", `Total: ${moneda.format(p.total)} MXN`, "kds-total"),
      el("p", pagado ? `Cobrado por ${p.metodo_pago}` : "Pendiente de pago"),
    );
  if (!grande)
    a.append(boton("⛶ Ampliar pedido", () => abrir(p.id), "principal"));
  const sig = {
    pendiente: ["preparando", "Comenzar preparación"],
    preparando: ["listo", "Marcar listo"],
    listo: ["entregado", "Marcar entregado"],
  }[p.estado];
  if (sig)
    a.append(
      boton(sig[1], () => cambiar(p, { estado: sig[0] }, sig[1]), "principal"),
    );
  if (
    !cocina &&
    p.metodo_pago == null &&
    ["pendiente", "preparando", "listo", "entregado"].includes(p.estado)
  ) {
    for (const m of ["efectivo", "transferencia"])
      a.append(
        boton("Cobrar en " + m, () =>
          cambiar(
            p,
            { metodoPago: m },
            `Confirmar recepción de ${moneda.format(p.total)} por ${m}`,
          ),
        ),
      );
    if (p.estado !== "entregado")
      a.append(
        boton("Cancelar pedido", () =>
          cambiar(p, { estado: "cancelado" }, "Cancelar definitivamente"),
        ),
      );
  }
  a.querySelectorAll("button").forEach((b) => {
    if (b.textContent !== "⛶ Ampliar pedido") b.disabled = !vigente || ocupado;
  });
  return a;
}
function abrir(id) {
  seleccionado = id;
  renderModal();
  if (!modal.open) modal.showModal();
}
modal.addEventListener("close", () => (seleccionado = null));
function renderModal() {
  if (seleccionado === null) return;
  const p = pedidos.find((p) => p.id === seleccionado);
  if (!p) {
    modal.close();
    seleccionado = null;
    return;
  }
  modal.replaceChildren(
    boton("✕ Cerrar pedido", () => modal.close()),
    tarjeta(p, true),
  );
}
function render() {
  filtros.replaceChildren();
  const activos = (p) =>
    ["pendiente", "preparando", "listo"].includes(p.estado);
  for (const [k, n] of [["activos", "Activos"], ...Object.entries(estados)]) {
    const count = pedidos.filter((p) =>
      k === "activos" ? activos(p) : p.estado === k,
    ).length;
    const b = boton(
      `${n} (${count})`,
      () => {
        filtro = k;
        render();
      },
      filtro === k ? "principal" : "",
    );
    b.setAttribute("aria-pressed", String(filtro === k));
    filtros.append(b);
  }
  const visibles = pedidos
    .filter((p) => (filtro === "activos" ? activos(p) : p.estado === filtro))
    .sort((a, b) => a.numero_pedido - b.numero_pedido);
  lista.replaceChildren(...visibles.map((p) => tarjeta(p)));
  if (!visibles.length) lista.append(el("p", "No hay pedidos en esta vista."));
  renderModal();
}
async function denegar() {
  generacion++;
  clearTimeout(timer);
  vigente = false;
  pagina.hidden = true;
  pedidos = [];
  vistos = null;
  lista.replaceChildren();
  if (modal.open) modal.close();
  try {
    await signOut(auth);
  } finally {
    location.replace("login.html");
  }
}
async function consultar(usuario, turno) {
  if (turno !== generacion || ocupado || consultando) return;
  consultando = true;
  try {
    const token = await usuario.getIdToken();
    const r = await fetch(API, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (turno !== generacion) return;
    if ([401, 403].includes(r.status)) {
      await denegar();
      return;
    }
    if (!r.ok) throw Error(`HTTP ${r.status}`);
    const d = await r.json();
    if (turno !== generacion) return;
    if (!Array.isArray(d.pedidos)) throw Error("Respuesta inválida");
    const nuevos = d.pedidos.map((p) => `${d.fechaNegocio}:${p.id}`);
    if (vistos && nuevos.some((k) => !vistos.has(k))) pitido();
    vistos = new Set(nuevos);
    pedidos = d.pedidos;
    vigente = true;
    aviso.textContent = `${pedidos.length} pedidos del día · Actualizado ${new Date().toLocaleTimeString("es-MX")}`;
    render();
  } catch (e) {
    if (turno !== generacion) return;
    vigente = false;
    aviso.textContent =
      "Sin conexión actualizada. Acciones bloqueadas hasta reconectar.";
    console.error(e);
    render();
  } finally {
    consultando = false;
    if (turno === generacion)
      timer = setTimeout(() => consultar(usuario, turno), 10000);
    else if (auth.currentUser && !pagina.hidden)
      timer = setTimeout(() => consultar(auth.currentUser, generacion), 1000);
  }
}
async function cambiar(p, cambio, mensaje) {
  if (
    ocupado ||
    consultando ||
    !vigente ||
    !confirm(`${mensaje} · Pedido #${p.numero_pedido}?`)
  )
    return;
  const u = auth.currentUser;
  if (!u) return;
  const turno = generacion;
  ocupado = true;
  clearTimeout(timer);
  render();
  let fallo = "";
  try {
    const token = await u.getIdToken();
    if (turno !== generacion) return;
    const r = await fetch(`${API}/${p.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cambio),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (turno !== generacion) return;
    if ([401, 403].includes(r.status)) {
      await denegar();
      return;
    }
    const d = await r.json();
    if (!r.ok || d.actualizado !== true)
      throw Error(d.error || `HTTP ${r.status}`);
  } catch (e) {
    fallo = "No se pudo confirmar el cambio: " + e.message;
  } finally {
    ocupado = false;
    if (turno === generacion) {
      await consultar(u, turno);
      if (fallo && turno === generacion)
        alert(fallo + " Revisa el estado antes de reintentar.");
    }
  }
}
onAuthStateChanged(auth, async (u) => {
  const turno = ++generacion;
  clearTimeout(timer);
  pagina.hidden = true;
  vigente = false;
  pedidos = [];
  vistos = null;
  lista.replaceChildren();
  if (modal.open) modal.close();
  if (!u) {
    location.replace("login.html");
    return;
  }
  try {
    const d = await getDoc(doc(db, "usuarios", u.uid));
    if (turno !== generacion) return;
    if (
      !d.exists() ||
      d.data().activo !== true ||
      !["dueno", "trabajador"].includes(d.data().rol)
    ) {
      await denegar();
      return;
    }
    pagina.hidden = false;
    await consultar(u, turno);
  } catch {
    if (turno === generacion) await denegar();
  }
});