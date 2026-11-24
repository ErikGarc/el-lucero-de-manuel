import { app, db } from "./firebase-config.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";

const auth = getAuth(app);
const API = "https://el-lucero-pruebas-worker.eriikgow.workers.dev";
const panel = document.querySelector(".panel-admin");
const mensaje = document.getElementById("mensaje-estado-admin");
const boton = document.getElementById("btn-cambiar-estado");
const cerrar = document.getElementById("btn-cerrar-sesion");
let esDueno = false, cargado = false, abierto = false, guardando = false;
let generacion = 0, temporizador = null, autorizado = false;
panel.hidden = true;

function pintar() {
    boton.disabled = !autorizado || !esDueno || !cargado || guardando;
    boton.textContent = guardando ? "Guardando..." : !esDueno ? "Solo disponible para el dueño" : !cargado ? "Estado no disponible" : abierto ? "🔴 Cerrar pedidos" : "🟢 Abrir pedidos";
    mensaje.textContent = !cargado ? "No se pudo verificar el estado." : abierto ? "🟢 Estamos recibiendo pedidos" : "🔴 El negocio está cerrado";
}
function detener() {
    generacion++;
    autorizado = false;
    cargado = false;
    esDueno = false;
    clearTimeout(temporizador);
    panel.hidden = true;
    pintar();
}
function regresar() { detener(); window.location.replace("login.html"); }
async function consultar(g) {
    if (g !== generacion || !autorizado) return;
    try {
        if (guardando) return;
        const r = await fetch(`${API}/api/negocio`, {cache: "no-store", signal: AbortSignal.timeout(8000)});
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const datos = await r.json();
        if (typeof datos.aceptandoPedidos !== "boolean") throw new Error("Estado inválido");
        if (g !== generacion || guardando) return;
        abierto = datos.aceptandoPedidos;
        cargado = true;
    } catch (error) {
        if (g !== generacion || guardando) return;
        cargado = false;
        console.error("Error al consultar estado:", error.message);
    } finally {
        if (g === generacion && autorizado) {
            pintar();
            clearTimeout(temporizador);
            temporizador = setTimeout(() => consultar(g), 10000);
        }
    }
}
onAuthStateChanged(auth, async usuario => {
    detener();
    const g = generacion;
    if (!usuario) { regresar(); return; }
    try {
        const perfil = await getDoc(doc(db, "usuarios", usuario.uid));
        if (g !== generacion) return;
        const datos = perfil.data();
        if (!perfil.exists() || datos.activo !== true || !["dueno", "trabajador"].includes(datos.rol)) {
            await signOut(auth); regresar(); return;
        }
        esDueno = datos.rol === "dueno";
        autorizado = true;
        panel.hidden = false;
        pintar();
        mensaje.textContent = "Consultando disponibilidad...";
        await consultar(g);
    } catch (error) {
        if (g === generacion) regresar();
    }
});
cerrar.addEventListener("click", async () => {
    cerrar.disabled = true;
    try { await signOut(auth); regresar(); }
    catch { cerrar.disabled = false; alert("No se pudo cerrar sesión."); }
});
boton.addEventListener("click", async () => {
    if (!autorizado || !esDueno || !cargado || guardando || !auth.currentUser) return;
    const nuevo = !abierto;
    if (!confirm(nuevo ? "¿Deseas abrir la recepción de pedidos?" : "¿Deseas cerrar la recepción de pedidos?")) return;
    const usuario = auth.currentUser;
    const g = ++generacion;
    clearTimeout(temporizador);
    guardando = true;
    pintar();
    try {
        const token = await usuario.getIdToken();
        if (g !== generacion || auth.currentUser !== usuario) return;
        const r = await fetch(`${API}/api/admin/negocio`, {
            method: "PATCH",
            headers: {Authorization: `Bearer ${token}`, "Content-Type": "application/json"},
            body: JSON.stringify({aceptandoPedidos: nuevo}),
            signal: AbortSignal.timeout(10000)
        });
        const datos = await r.json();
        if (!r.ok || datos.actualizado !== true || datos.aceptandoPedidos !== nuevo) throw new Error(datos.error || `HTTP ${r.status}`);
        if (g !== generacion) return;
        abierto = datos.aceptandoPedidos;
        cargado = true;
    } catch (error) {
        if (g === generacion) {
            cargado = false;
            alert("No se pudo confirmar el cambio. Se consultará nuevamente el estado.");
            console.error("Error al cambiar estado:", error.message);
        }
    } finally {
        guardando = false;
        if (g === generacion && autorizado) { pintar(); await consultar(g); }
    }
});