import { app, db } from "./firebase-config.js";
import {
  getAuth,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import {
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
const auth = getAuth(app);
const MODO_ENVIO_PRUEBAS = true;
let cantidadModal = 1;
const identidad = (id, quitados, opciones) =>
  JSON.stringify([id, [...quitados].sort(), [...opciones].sort()]);
const API = "https://el-lucero-pruebas-worker.eriikgow.workers.dev/api";
const $ = (id) => document.getElementById(id);
const form = $("form-venta-mostrador");
const modal = $("modal-mostrador");
let carrito = [],
  seleccionado,
  ocupado = false,
  pendiente = null,
  usuario = null;
const moneda = (n) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(
    n,
  );
const total = () =>
  carrito.reduce((s, p) => s + p.centavos * p.cantidad, 0) / 100;
const nodo = (tag, texto, clase) => {
  const e = document.createElement(tag);
  if (texto !== undefined) e.textContent = texto;
  if (clase) e.className = clase;
  return e;
};
function boton(texto, accion) {
  const b = nodo("button", texto, "boton-modulo");
  b.type = "button";
  b.onclick = () => {
    if (!ocupado && !pendiente) accion();
  };
  return b;
}
function actualizar() {
  const bloqueado = ocupado || !!pendiente;
  const efectivo = $("pago-mostrador").value === "efectivo";
  $("seccion-efectivo").hidden = !efectivo;
  $("efectivo-recibido").required = efectivo;
  const recibido = Number($("efectivo-recibido").value);
  $("cambio-mostrador").textContent = moneda(
    Math.max(0, Math.round((recibido - total()) * 100) / 100),
  );
  $("total-mostrador").textContent = moneda(total());
  for (const e of form.querySelectorAll("input,select,button"))
    e.disabled = bloqueado;
  $("btn-registrar-venta").disabled =
    ocupado ||
    !usuario ||
    (!pendiente &&
      (!carrito.length ||
        !$("pago-mostrador").value ||
        (efectivo && (!$("efectivo-recibido").value || recibido < total()))));
  $("btn-registrar-venta").textContent = pendiente
    ? "Reintentar misma venta"
    : "Registrar venta";
  for (const b of $("productos-mostrador").querySelectorAll("button"))
    b.disabled = bloqueado;
  const lista = $("carrito-mostrador");
  lista.replaceChildren();
  if (!carrito.length) lista.append(nodo("p", "La orden está vacía."));
  carrito.forEach((p, i) => {
    const fila = nodo("article", undefined, "tarjeta-pedido");
    fila.append(
      nodo("h3", p.nombre),
      nodo(
        "p",
        [
          p.ingredientesQuitados.length
            ? "Sin " + p.ingredientesQuitados.join(", ")
            : "",
          (p.opcionesElegidas || []).length
            ? "Opciones: " + p.opcionesElegidas.join(" + ")
            : "",
        ]
          .filter(Boolean)
          .join(" | ") || "Sin modificaciones",
      ),
      nodo(
        "p",
        `${p.cantidad} × ${moneda(p.centavos / 100)} = ${moneda((p.centavos * p.cantidad) / 100)}`,
      ),
    );
    const menos = boton("−", () => {
      if (--p.cantidad === 0) carrito.splice(i, 1);
      actualizar();
    });
    const mas = boton("+", () => {
      if (p.cantidad < 20) p.cantidad++;
      actualizar();
    });
    const quitar = boton("Quitar", () => {
      carrito.splice(i, 1);
      actualizar();
    });
    for (const b of [menos, mas, quitar]) b.disabled = bloqueado;
    mas.disabled = bloqueado || p.cantidad >= 20;
    fila.append(menos, mas, quitar);
    lista.append(fila);
  });
}
function personalizar(p) {
  seleccionado = p;
  cantidadModal = 1;
  $("titulo-personalizacion").textContent = p.nombre;
  const intro = modal.querySelector("p");
  if (intro) intro.textContent = "Personaliza tu producto";
  const lista = $("ingredientes-mostrador");
  lista.replaceChildren();
  const min = p.opciones_minimas,
    max = p.opciones_maximas;
  const opciones = p.ingredientes.filter((i) => i.disponible && i.esOpcion);
  const removibles = p.ingredientes.filter(
    (i) => i.disponible && i.sePuedeQuitar && !i.esOpcion,
  );
  if (opciones.length < min)
    return alert("No hay suficientes opciones disponibles.");
  const agregar = $("btn-confirmar-producto");
  const subt = nodo("p", undefined, "total-pedido");
  const cantidad = nodo("strong", "1");
  const actualizarModal = () => {
    const checks = [...lista.querySelectorAll('input[data-tipo="opcion"]')];
    const n = checks.filter((c) => c.checked).length;
    checks.forEach((c) => (c.disabled = !c.checked && n >= max));
    agregar.disabled = n < min || n > max;
    cantidad.textContent = String(cantidadModal);
    subt.textContent =
      "Subtotal: " + moneda((Math.round(p.precio * 100) * cantidadModal) / 100);
    menos.disabled = cantidadModal <= 1;
    mas.disabled = cantidadModal >= 20;
  };
  if (max > 0) {
    lista.append(
      nodo(
        "p",
        `Elige de ${min} a ${max} opciones por orden (sin costo adicional).`,
      ),
    );
    for (const i of opciones) {
      const l = nodo("label");
      const c = nodo("input");
      c.type = "checkbox";
      c.value = i.nombre;
      c.dataset.tipo = "opcion";
      c.onchange = actualizarModal;
      l.append(c, " " + i.nombre);
      lista.append(l, nodo("br"));
    }
  }
  if (removibles.length) {
    lista.append(nodo("p", "Ingredientes que deseas quitar:"));
    for (const i of removibles) {
      const l = nodo("label");
      const c = nodo("input");
      c.type = "checkbox";
      c.value = i.nombre;
      c.dataset.tipo = "quitar";
      l.append(c, " Sin " + i.nombre);
      lista.append(l, nodo("br"));
    }
  }
  lista.append(nodo("p", "Cantidad de órdenes (misma personalización)"));
  const menos = boton("−", () => {
    cantidadModal = Math.max(1, cantidadModal - 1);
    actualizarModal();
  });
  const mas = boton("+", () => {
    cantidadModal = Math.min(20, cantidadModal + 1);
    actualizarModal();
  });
  const fila = nodo("div");
  fila.style.cssText =
    "display:flex;align-items:center;justify-content:center;gap:12px";
  fila.append(menos, cantidad, mas);
  lista.append(fila, subt);
  actualizarModal();
  modal.showModal();
}
$("btn-cancelar-personalizacion").onclick = () => modal.close();
$("btn-confirmar-producto").onclick = () => {
  if (!seleccionado || ocupado || pendiente) return;
  const lista = $("ingredientes-mostrador");
  const quitados = Array.from(
    lista.querySelectorAll('input[data-tipo="quitar"]:checked'),
    (e) => e.value,
  ).sort();
  const opciones = Array.from(
    lista.querySelectorAll('input[data-tipo="opcion"]:checked'),
    (e) => e.value,
  ).sort();
  const p = seleccionado;
  if (
    opciones.length < p.opciones_minimas ||
    opciones.length > p.opciones_maximas
  )
    return alert("Revisa las opciones elegidas.");
  const key = identidad(p.id, quitados, opciones);
  const existente = carrito.find(
    (x) =>
      identidad(x.id, x.ingredientesQuitados, x.opcionesElegidas || []) === key,
  );
  if (existente) {
    if (existente.cantidad + cantidadModal > 20)
      return alert("Máximo 20 órdenes por personalización.");
    existente.cantidad += cantidadModal;
  } else {
    if (carrito.length >= 30) return alert("Máximo 30 partidas.");
    carrito.push({
      id: p.id,
      nombre: p.nombre,
      centavos: Math.round(p.precio * 100),
      cantidad: cantidadModal,
      ingredientesQuitados: quitados,
      opcionesElegidas: opciones,
    });
  }
  modal.close();
  actualizar();
};
async function cargar() {
  const r = await fetch(API + "/menu", { cache: "no-store" });
  if (!r.ok) throw Error("No se pudo consultar el menú");
  const d = await r.json();
  const lista = $("productos-mostrador");
  lista.replaceChildren();
  if (
    !Array.isArray(d.productos) ||
    d.productos.some(
      (p) =>
        !Number.isInteger(p.opciones_minimas) ||
        !Number.isInteger(p.opciones_maximas) ||
        !Array.isArray(p.ingredientes) ||
        p.ingredientes.some((i) => typeof i.esOpcion !== "boolean"),
    )
  )
    throw Error("El catálogo no incluye la configuración de opciones.");
  for (const p of d.productos.filter((p) => p.disponible)) {
    const card = nodo("article", undefined, "tarjeta-pedido");
    card.append(
      nodo("h3", p.nombre),
      nodo("p", p.descripcion || ""),
      nodo("p", moneda(p.precio), "total-pedido"),
      boton("+ Agregar", () => personalizar(p)),
    );
    lista.append(card);
  }
  $("mensaje-mostrador").textContent = "Selecciona los productos de la orden.";
  actualizar();
}
$("pago-mostrador").onchange = actualizar;
$("efectivo-recibido").oninput = actualizar;
$("btn-vaciar-orden").onclick = () => {
  if (!ocupado && !pendiente && confirm("¿Vaciar la orden?")) {
    carrito = [];
    form.reset();
    actualizar();
  }
};
const clave = (uid) => "lucero-mostrador-pendiente-v1-" + uid;
form.onsubmit = async (e) => {
  e.preventDefault();
  if (ocupado || !usuario || auth.currentUser?.uid !== usuario.uid) return;
  const uid = usuario.uid;
  if (!MODO_ENVIO_PRUEBAS)
    return alert(
      "Envío temporalmente deshabilitado para pruebas visuales. No se registró ninguna venta.",
    );
  if (!pendiente) {
    if (!carrito.length || total() > 10000)
      return alert("Revisa el total de la orden.");
    const metodoPago = $("pago-mostrador").value;
    const nombreCliente = $("cliente-mostrador").value.trim();
    if (nombreCliente.length === 1)
      return alert("Escribe al menos dos caracteres o deja el nombre vacío.");
    if (!["efectivo", "transferencia"].includes(metodoPago)) return;
    if (
      metodoPago === "efectivo" &&
      Number($("efectivo-recibido").value) < total()
    )
      return alert("Efectivo insuficiente.");
    if (
      !confirm(`¿Confirmas que recibiste ${moneda(total())} por ${metodoPago}?`)
    )
      return;
    const datos = {
      solicitudId: crypto.randomUUID(),
      nombreCliente,
      metodoPago,
      totalEsperado: total(),
      productos: carrito.map(
        ({ id, cantidad, ingredientesQuitados, opcionesElegidas }) => ({
          id,
          cantidad,
          ingredientesQuitados,
          opcionesElegidas: opcionesElegidas || [],
        }),
      ),
    };
    const intento = {
      datos,
      carrito: structuredClone(carrito),
      recibido: $("efectivo-recibido").value,
    };
    try {
      localStorage.setItem(clave(uid), JSON.stringify(intento));
    } catch {
      return alert(
        "No se pudo conservar el identificador de la venta. No se envió.",
      );
    }
    pendiente = intento;
  }
  ocupado = true;
  actualizar();
  try {
    const token = await usuario.getIdToken();
    const r = await fetch(API + "/admin/mostrador", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(pendiente.datos),
    });
    const d = await r.json();
    if (!r.ok || d.guardado !== true) {
      // Conservar el mismo identificador ante cualquier respuesta incierta.
      throw Error(d.error || "No se confirmó el registro");
    }
    localStorage.removeItem(clave(uid));
    pendiente = null;
    carrito = [];
    form.reset();
    alert(
      `Venta registrada. Pedido #${d.numeroPedido}. Total: ${moneda(d.total)}`,
    );
    $("mensaje-mostrador").textContent =
      `Última venta: pedido #${d.numeroPedido}`;
  } catch (err) {
    alert(
      err.message +
        "\nNo vuelvas a cobrar. Reintenta la misma venta o consulta al administrador antes de iniciar otra.",
    );
  } finally {
    ocupado = false;
    actualizar();
  }
};
onAuthStateChanged(auth, async (u) => {
  $("pagina-mostrador").hidden = true;
  usuario = null;
  carrito = [];
  pendiente = null;
  if (!u) return location.replace("login.html");
  try {
    const perfil = await getDoc(doc(db, "usuarios", u.uid));
    if (
      !perfil.exists() ||
      perfil.data().activo !== true ||
      !["dueno", "trabajador"].includes(perfil.data().rol)
    )
      return location.replace("login.html");
    if (auth.currentUser?.uid !== u.uid) return;
    usuario = u;
    const guardado = localStorage.getItem(clave(u.uid));
    if (guardado) {
      pendiente = JSON.parse(guardado);
      carrito = pendiente.carrito;
      $("cliente-mostrador").value = pendiente.datos.nombreCliente;
      $("pago-mostrador").value = pendiente.datos.metodoPago;
      $("efectivo-recibido").value = pendiente.recibido;
    }
    $("pagina-mostrador").hidden = false;
    actualizar();
    await cargar();
  } catch (err) {
    $("mensaje-mostrador").textContent = err.message;
    if (!usuario) location.replace("login.html");
  }
});
