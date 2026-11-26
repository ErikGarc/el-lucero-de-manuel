import { app, db } from "./firebase-config.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
const auth = getAuth(app);
const API = "https://el-lucero-pruebas-worker.eriikgow.workers.dev/api/admin/cupones";
const $ = id => document.getElementById(id);
const pagina = $("pagina-cupones"), form = $("form-cupon"), lista = $("lista-cupones");
let usuario = null, ocupado = false, cargado = false, editando = null, generacion = 0;
function mensaje(texto) { $("mensaje-cupones").textContent = texto; }
function bloquear(valor) {
    ocupado = valor;
    pagina.querySelectorAll("button,input,select").forEach(e => e.disabled = valor);
    $("nuevo-cupon").disabled = valor || !cargado;
    $("limite-cupon").disabled = valor || editando !== null;
}
async function api(metodo = "GET", datos, id) {
    const u = usuario, g = generacion;
    if (!u || auth.currentUser !== u) throw new Error("Sesión no disponible");
    const token = await u.getIdToken();
    if (g !== generacion) throw new Error("Sesión modificada");
    const r = await fetch(API + (id == null ? "" : `/${id}`), {
        method: metodo, cache: "no-store", signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        ...(datos === undefined ? {} : {body: JSON.stringify(datos)})
    });
    if (g !== generacion) throw new Error("Sesión modificada");
    if (r.status === 401 || r.status === 403) { pagina.hidden = true; window.location.replace("admin.html"); throw new Error("Acceso denegado"); }
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
    return d;
}
function nodo(tag, texto, clase) {
    const e = document.createElement(tag); if (texto !== undefined) e.textContent = texto; if (clase) e.className = clase; return e;
}
function boton(texto, accion, clase) {
    const b = nodo("button", texto, clase); b.type = "button"; b.addEventListener("click", accion); return b;
}
function pintar(cupones) {
    lista.replaceChildren();
    let activos = 0, inactivos = 0, agotados = 0;
    for (const c of cupones) {
        const activo = Number(c.activo) === 1, restantes = Math.max(0, c.limite_usos - c.usos);
        const estado = !activo ? "Desactivado" : restantes === 0 ? "Agotado" : "Activo";
        if (!activo) inactivos++; else if (!restantes) agotados++; else activos++;
        const tarjeta = nodo("article", undefined, "cupon-tarjeta");
        const cabecera = nodo("div", undefined, "cupones-barra");
        cabecera.append(nodo("h3", c.codigo), nodo("span", estado, `cupon-estado ${estado.toLowerCase()}`));
        const progreso = document.createElement("progress"); progreso.max = c.limite_usos; progreso.value = Math.min(c.usos, c.limite_usos); progreso.setAttribute("aria-label", "Usos del cupón");
        const acciones = nodo("div", undefined, "cupones-barra");
        acciones.append(boton("Editar código", () => abrir(c), "cupon-secundario"), boton(activo ? "Desactivar" : "Activar", () => cambiar(c, !activo), activo ? "cupon-peligro" : ""));
        const ampliar = boton("Ampliar usos", () => ampliarUsos(c), "cupon-secundario");
        acciones.append(ampliar);
        tarjeta.append(cabecera, nodo("strong", `${c.porcentaje}% de descuento`, "cupon-descuento"), nodo("p", `${c.usos} de ${c.limite_usos} usos · ${restantes} restantes`), progreso, acciones);
        lista.append(tarjeta);
    }
    $("cupones-activos").textContent = activos; $("cupones-inactivos").textContent = inactivos; $("cupones-agotados").textContent = agotados;
    if (!cupones.length) lista.append(nodo("p", "Todavía no hay cupones. Crea el primero."));
}
async function cargar() {
    const d = await api(); if (!Array.isArray(d.cupones)) throw new Error("Respuesta inválida"); pintar(d.cupones); cargado = true;
}
async function actualizar() {
    if (ocupado) return; bloquear(true); mensaje("Consultando cupones...");
    try { await cargar(); mensaje("Cupones actualizados."); } catch(e) { cargado = false; lista.replaceChildren(); for(const id of ["cupones-activos","cupones-inactivos","cupones-agotados"]) $(id).textContent = "—"; mensaje(e.message); } finally { bloquear(false); }
}
function abrir(c = null) {
    if (ocupado || !cargado) return;
    editando = c ? c.id : null; form.reset();
    $("titulo-form-cupon").textContent = c ? "Editar código" : "Nuevo cupón";
    $("codigo-cupon").value = c ? c.codigo : "";
    $("campos-nuevo-cupon").hidden = !!c; $("nota-edicion-cupon").hidden = !c;
    $("limite-cupon").disabled = !!c; form.hidden = false; form.scrollIntoView({block:"nearest"}); $("codigo-cupon").focus();
}
function cerrarEditor() { form.hidden = true; editando = null; form.reset(); }
async function guardar(metodo, datos, id) {
    bloquear(true); let confirmado = false;
    try { const d = await api(metodo, datos, id); if (d.actualizado !== true) throw new Error("Cambio no confirmado"); confirmado = true; cerrarEditor(); await cargar(); mensaje("Cambio guardado correctamente."); }
    catch(e) { mensaje(confirmado ? "Cambio guardado; no se pudo actualizar la lista. Pulsa Actualizar." : `No se confirmó el cambio: ${e.message}. Actualiza la lista antes de reintentar.`); cargado = false; lista.replaceChildren(); cerrarEditor(); }
    finally { bloquear(false); }
}

const modalCupon = $("modal-cupon");
let accionModalCupon = null;

modalCupon.setAttribute(
    "aria-labelledby",
    "modal-cupon-titulo"
);

function abrirModalCupon(titulo, contenido, textoBoton, accion) {
    if (ocupado || modalCupon.open) return;

    $("modal-cupon-titulo").textContent = titulo;
    $("modal-cupon-contenido").replaceChildren(contenido);
    $("confirmar-modal-cupon").textContent = textoBoton;
    $("confirmar-modal-cupon").disabled = false;

    accionModalCupon = accion;
    modalCupon.showModal();
}

function cerrarModalCupon() {
    accionModalCupon = null;

    if (modalCupon.open) {
        modalCupon.close();
    }
}

$("cerrar-modal-cupon").addEventListener(
    "click", cerrarModalCupon
);

$("cancelar-modal-cupon").addEventListener(
    "click", cerrarModalCupon
);

modalCupon.addEventListener("cancel", e => {
    e.preventDefault();
    cerrarModalCupon();
});

$("confirmar-modal-cupon").addEventListener("click", () => {
    if (ocupado || !accionModalCupon) return;
    accionModalCupon();
});
function ampliarUsos(c) {
    if (ocupado || !cargado) return;

    const actual = Number(c.limite_usos);
    const usados = Number(c.usos);
    const maximo = 1000000 - actual;

    if (maximo <= 0) {
        mensaje("El cupón ya tiene el límite máximo permitido.");
        return;
    }

    const contenido = nodo("div");
    contenido.style.display = "grid";
    contenido.style.gap = "16px";

    contenido.append(
        nodo("div", c.codigo, "modal-cupon-codigo"),
        nodo("p", `${c.porcentaje}% de descuento`)
    );

    const estadisticas = nodo(
        "div", undefined, "modal-cupon-estadisticas"
    );

    for (const [titulo, valor] of [
        ["Límite actual", actual],
        ["Utilizados", usados],
        ["Disponibles", Math.max(0, actual - usados)]
    ]) {
        const tarjeta = nodo("div");

        tarjeta.append(
            nodo("strong", String(valor)),
            nodo("span", titulo)
        );

        estadisticas.append(tarjeta);
    }

    const etiqueta = nodo("label", "Usos adicionales");
    etiqueta.htmlFor = "usos-adicionales-cupon";

    const entrada = nodo("input");
    entrada.id = "usos-adicionales-cupon";
    entrada.type = "number";
    entrada.min = "1";
    entrada.max = String(maximo);
    entrada.step = "1";
    entrada.value = String(Math.min(10, maximo));

    const resultado = nodo(
        "div", undefined, "modal-cupon-resultado"
    );

    const nuevoLimite = nodo("strong");
    const disponibles = nodo("p");

    resultado.append(
        nodo("span", "Nuevo límite total"),
        nuevoLimite,
        disponibles
    );

    const nota = nodo(
        "p",
        "Se conservarán los usos anteriores, el porcentaje y el estado de activación del cupón.",
        "modal-cupon-nota"
    );

    const aviso = nodo("p");
    aviso.style.color = "#ff7777";
    aviso.setAttribute("role", "status");

    contenido.append(
        estadisticas,
        etiqueta,
        entrada,
        resultado,
        aviso,
        nota
    );

    function cantidadValida() {
        const valor = Number(entrada.value);

        return /^\d+$/.test(entrada.value) &&
            Number.isSafeInteger(valor) &&
            valor >= 1 &&
            valor <= maximo;
    }

    function recalcular() {
        const valido = cantidadValida();

        $("confirmar-modal-cupon").disabled = !valido;

        if (!valido) {
            nuevoLimite.textContent = "—";
            disponibles.textContent = "";
            aviso.textContent =
                `Ingresa una cantidad entre 1 y ${maximo}.`;
            return;
        }

        const nuevo = actual + Number(entrada.value);

        nuevoLimite.textContent = nuevo.toLocaleString("es-MX");

        disponibles.textContent =
            `Usos disponibles: ${Math.max(0, nuevo - usados)}`;

        aviso.textContent = "";
    }

    entrada.addEventListener("input", recalcular);

    abrirModalCupon(
        "🎟️ Ampliar usos",
        contenido,
        "Ampliar usos",
        async () => {
            if (!cantidadValida()) return;

            const nuevo = actual + Number(entrada.value);

            cerrarModalCupon();

            await guardar(
                "PATCH",
                { limiteUsos: nuevo },
                c.id
            );
        }
    );

    recalcular();
    entrada.focus();
    entrada.select();
}
async function cambiar(c, activo) {
    if (ocupado || !cargado || !confirm(`¿Deseas ${activo ? "activar" : "desactivar"} ${c.codigo}?`)) return;
    await guardar("PATCH", {activo}, c.id);
}
form.addEventListener("submit", async e => {
    e.preventDefault(); if (ocupado || !cargado) return;
    const codigo = $("codigo-cupon").value.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{1,40}$/.test(codigo)) { mensaje("Código inválido."); return; }
    if (editando !== null) await guardar("PATCH", {codigo}, editando);
    else await guardar("POST", {codigo, porcentaje:Number($("porcentaje-cupon").value), limiteUsos:Number($("limite-cupon").value), activo:$("activo-cupon").checked});
});
$("nuevo-cupon").addEventListener("click", () => abrir());
$("cancelar-cupon").addEventListener("click", cerrarEditor);
$("recargar-cupones").addEventListener("click", actualizar);
onAuthStateChanged(auth, async u => {
    const g = ++generacion; pagina.hidden = true; usuario = null; cargado = false; lista.replaceChildren(); cerrarEditor();
    if (!u) { window.location.replace("login.html"); return; }
    try {
        const p = await getDoc(doc(db,"usuarios",u.uid)); if (g !== generacion) return;
        if (
    !p.exists() ||
    p.data().activo !== true ||
    !["dueno", "trabajador"].includes(p.data().rol)
) {
    window.location.replace("admin.html");
    return;
}
        usuario = u; pagina.hidden = false; ocupado = false; await actualizar();
    } catch(e) { if (g === generacion) window.location.replace("admin.html"); }
});