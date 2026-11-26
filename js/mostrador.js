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
const identidad = (id, quitados, opciones, componentes = []) =>
  JSON.stringify([id, [...quitados].sort(), [...opciones].sort(), componentes]);
let controles = [];
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
let cupon = null, validandoCupon = false;
const subtotalCentavos = () => carrito.reduce((s,p)=>s+p.centavos*p.cantidad,0);
const descuentoCentavos = () => Math.round(subtotalCentavos()*(cupon?.porcentaje || 0)/100);
const total = () => pendiente ? pendiente.datos.totalEsperado : (subtotalCentavos()-descuentoCentavos())/100;
const bloqueCupon = document.createElement('div');
bloqueCupon.className = 'carrito-cupon';
bloqueCupon.innerHTML = `<label for="codigo-cupon">🎟️ Cupón de descuento</label><div class="cupon-controles"><input id="codigo-cupon" maxlength="40" placeholder="Código de cupón" autocomplete="off"><button type="button" id="aplicar-cupon">Aplicar</button><button type="button" id="quitar-cupon" hidden>Quitar</button></div><p id="mensaje-cupon" role="status"></p><div id="importes-cupon" hidden></div>`;
$('total-mostrador').closest('h3').before(bloqueCupon);
function limpiarCupon(){cupon=null;$('codigo-cupon').value='';$('mensaje-cupon').textContent='';}
$('aplicar-cupon').onclick = async () => {
  if(ocupado||pendiente||validandoCupon||!usuario||!carrito.length||cupon)return;
  const codigo=$('codigo-cupon').value.trim().toUpperCase();
  if(!/^[A-Z0-9_-]{1,40}$/.test(codigo)){ $('mensaje-cupon').textContent='Escribe un código válido.';return; }
  const u=usuario;
  validandoCupon=true; actualizar(); $('mensaje-cupon').textContent='Validando cupón...';
  try {
    const r=await fetch(API+'/cupones/validar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({codigo}),signal:AbortSignal.timeout(10000)});
    const d=await r.json();
    if(usuario!==u||auth.currentUser?.uid!==u.uid)return;
    if(!r.ok||d.valido!==true||![5,10].includes(d.porcentaje)||typeof d.codigo!=='string')throw Error(d.error||'Cupón no disponible');
    cupon={codigo:d.codigo,porcentaje:d.porcentaje}; $('codigo-cupon').value=d.codigo;
    $('mensaje-cupon').textContent=`Cupón aplicado: ${d.porcentaje}% de descuento`;
  } catch(e){if(usuario===u)$('mensaje-cupon').textContent=e.message;}
  finally{validandoCupon=false;actualizar();}
};
$('quitar-cupon').onclick=()=>{if(!ocupado&&!pendiente&&!validandoCupon){limpiarCupon();actualizar();}};
$('codigo-cupon').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('aplicar-cupon').click();}};
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
    if (!ocupado && !pendiente && !validandoCupon) accion();
  };
  return b;
}
function actualizar() {
  const bloqueado = ocupado || !!pendiente || validandoCupon;
  if(!carrito.length && !pendiente && !validandoCupon) limpiarCupon();
  $('codigo-cupon').disabled=bloqueado||!!cupon||!carrito.length;
  $('aplicar-cupon').disabled=bloqueado||!!cupon||!carrito.length;
  $('quitar-cupon').disabled=bloqueado;
  $('quitar-cupon').hidden=!cupon;
  $('importes-cupon').hidden=!cupon;
  $('importes-cupon').textContent=`Subtotal: ${moneda(subtotalCentavos()/100)} · Descuento (${cupon?.porcentaje||0}%): −${moneda(descuentoCentavos()/100)}`;
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
    ocupado || validandoCupon ||
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
          .join(" | ") ||
    (p.componentesCombo?.length
        ? "Personalización por componente:"
        : "Sin modificaciones"),
      ),
      nodo(
        "p",
        `${p.cantidad} × ${moneda(p.centavos / 100)} = ${moneda((p.centavos * p.cantidad) / 100)}`,
      ),
    );
    for (const c of p.componentesCombo || []) {
      fila.append(nodo("p", `${c.nombre}: ${[c.ingredientesQuitados.length ? "Sin " + c.ingredientesQuitados.join(", ") : "", c.opcionesElegidas.length ? "Opciones: " + c.opcionesElegidas.join(" + ") : ""].filter(Boolean).join(" | ") || "Sin modificaciones"}`));
    }
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
  const bloques = p.esCombo ? p.componentesCombo.flatMap(c => Array.from({length:c.cantidad}, (_,i)=>({componenteId:c.id,unidad:i+1,producto:c.producto}))) : [{producto:p}];
  const agregar = $("btn-confirmar-producto");
  const subt = nodo("p", undefined, "total-pedido");
  const cantidad = nodo("strong", "1");
  controles = bloques.map((c, i) => {
    const base = c.producto;
    const bloque = nodo("section", undefined, "mostrador-componente");
    if (p.esCombo) bloque.append(nodo("h3", `${i+1}. ${base.nombre}`));
    const opciones = base.ingredientes.filter(x=>x.disponible && x.esOpcion);
    const removibles = base.ingredientes.filter(x=>x.disponible && x.sePuedeQuitar && !x.esOpcion);
    const checks = [], quitar = [];
    function casilla(x, esOpcion) {
      const l = nodo("label"), input = nodo("input");
      input.type = "checkbox"; input.value = x.nombre;
      input.onchange = () => actualizarModal();
      l.append(input, esOpcion ? " " + x.nombre : " Sin " + x.nombre);
      bloque.append(l, nodo("br"));
      (esOpcion ? checks : quitar).push(input);
    }
    if (base.opciones_maximas > 0) { bloque.append(nodo("p", `Elige de ${base.opciones_minimas} a ${base.opciones_maximas} opciones.`)); opciones.forEach(x=>casilla(x,true)); }
    if (removibles.length) { bloque.append(nodo("p", "Ingredientes que deseas quitar:")); removibles.forEach(x=>casilla(x,false)); }
    lista.append(bloque);
    return {c,base,checks,quitar};
  });
  const actualizarModal = () => {
    let valido = controles.length > 0;
    for (const {base,checks} of controles) {
      const n = checks.filter(c=>c.checked).length;
      checks.forEach(c=>c.disabled = !c.checked && n >= base.opciones_maximas);
      if (n < base.opciones_minimas || n > base.opciones_maximas) valido = false;
    }
    agregar.disabled = !valido;
    cantidad.textContent = String(cantidadModal);
    subt.textContent = "Subtotal: " + moneda(Math.round(p.precio*100)*cantidadModal/100);
    menos.disabled = cantidadModal <= 1;
    mas.disabled = cantidadModal >= 20;
  };
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
  if ($("btn-confirmar-producto").disabled) return;
  const p = seleccionado;
  const leer = a => a.filter(x=>x.checked).map(x=>x.value).sort();
  const seleccion = controles.map(({c,base,checks,quitar})=>({componenteId:c.componenteId,unidad:c.unidad,nombre:base.nombre,ingredientesQuitados:leer(quitar),opcionesElegidas:leer(checks)}));
  const quitados = p.esCombo ? [] : seleccion[0].ingredientesQuitados;
  const opciones = p.esCombo ? [] : seleccion[0].opcionesElegidas;
  const componentesCombo = p.esCombo ? seleccion : [];
  const key = identidad(p.id, quitados, opciones, componentesCombo);
  const existente = carrito.find(x=>identidad(x.id,x.ingredientesQuitados,x.opcionesElegidas || [],x.componentesCombo || [])===key);
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
      componentesCombo,
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
  if (!Array.isArray(d.categorias) || d.productos.some(p=>typeof p.disponibleEfectivo!=="boolean" || !Array.isArray(p.componentesCombo))) throw Error("Catálogo incompatible.");
  const disponibles = d.productos.filter(p=>p.disponibleEfectivo);
  const categorias = d.categorias.filter(c=>c.disponible && disponibles.some(p=>p.categoriaId===c.id)).sort((a,b)=>a.orden-b.orden);
  const nav = nodo("div",undefined,"lucero-app-nav");
  const tarjetas = nodo("div",undefined,"mostrador-app-lista");
  lista.append(nav,tarjetas);
  function mostrar(c) {
    for (const b of nav.querySelectorAll("button")) b.setAttribute("aria-pressed",String(b.dataset.id===String(c.id)));
    tarjetas.replaceChildren();
    for (const p of disponibles.filter(p=>p.categoriaId===c.id)) {
      const card = nodo("article",undefined,"mostrador-app-producto");
      const detalle = nodo("div",undefined,"lucero-app-detalle");
      detalle.append(nodo("h3",p.nombre),nodo("p",p.descripcion || ""),nodo("p",moneda(p.precio),"total-pedido"));
      const agregar = boton("+",()=>personalizar(p)); agregar.setAttribute("aria-label","Agregar "+p.nombre);
      card.append(nodo("span",c.icono || "🍽️","lucero-app-icono"),detalle,agregar); tarjetas.append(card);
    }
    actualizar();
  }
  for (const c of categorias) {
    const b = boton("",()=>mostrar(c)); b.dataset.id=String(c.id);
    b.append(nodo("span",c.icono || "🍽️","lucero-app-icono"),nodo("span",c.nombre)); nav.append(b);
  }
  if (categorias.length) mostrar(categorias[0]); else tarjetas.append(nodo("p","No hay productos disponibles."));
  $("mensaje-mostrador").textContent = "Selecciona los productos de la orden.";
  actualizar();
}
$("pago-mostrador").onchange = actualizar;
$("efectivo-recibido").oninput = actualizar;
$("btn-vaciar-orden").onclick = () => {
  if (!ocupado && !pendiente && !validandoCupon && confirm("¿Vaciar la orden?")) {
    carrito = [];
    form.reset();
    actualizar();
  }
};
const clave = (uid) => "lucero-mostrador-pendiente-v1-" + uid;
form.onsubmit = async (e) => {
  e.preventDefault();
  if (ocupado || validandoCupon || !usuario || auth.currentUser?.uid !== usuario.uid) return;
  const uid = usuario.uid;
  if (!MODO_ENVIO_PRUEBAS)
    return alert(
      "Envío temporalmente deshabilitado para pruebas visuales. No se registró ninguna venta.",
    );
  if (!pendiente) {
    if (!carrito.length || subtotalCentavos() > 1000000)
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
      ...(cupon ? {cuponCodigo:cupon.codigo} : {}),
      productos: carrito.map(
        ({ id, cantidad, ingredientesQuitados, opcionesElegidas, componentesCombo }) => ({
          id,
          cantidad,
          ingredientesQuitados,
          opcionesElegidas: opcionesElegidas || [],
          componentesCombo: (componentesCombo || []).map(({componenteId,unidad,ingredientesQuitados,opcionesElegidas})=>({componenteId,unidad,ingredientesQuitados,opcionesElegidas})),
        }),
      ),
    };
    const intento = {
      datos,
      carrito: structuredClone(carrito),
      cupon: cupon ? {...cupon} : null,
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

if (
  r.status === 409 &&
  d.error === "CUPON_NO_DISPONIBLE" &&
  pendiente?.datos.cuponCodigo &&
  usuario?.uid === uid &&
  auth.currentUser?.uid === uid
) {
  localStorage.removeItem(clave(uid));

  pendiente = null;
  limpiarCupon();

  $("mensaje-cupon").textContent =
    "El cupón ya no está disponible. Revisa el nuevo total.";

  $("mensaje-mostrador").textContent =
    "Venta no registrada. Verifica el importe recibido antes de confirmar nuevamente.";

  alert(
    "El cupón ya no está disponible.\n\n" +
    "Se conservaron los productos de la orden.\n" +
    "Nuevo total: " + moneda(total()) + "\n\n" +
    "Si ya recibiste dinero, ajusta únicamente la diferencia. No cobres nuevamente el importe completo."
  );

  return;
}

if (!r.ok || d.guardado !== true) {
  throw Error(d.mensaje || d.error || "No se confirmó el registro");
}
    localStorage.removeItem(clave(uid));
    pendiente = null;
    carrito = [];
    limpiarCupon();
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
  limpiarCupon();
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
      cupon = pendiente.cupon || null;
      if(cupon){$('codigo-cupon').value=cupon.codigo;$('mensaje-cupon').textContent=`Cupón aplicado: ${cupon.porcentaje}% de descuento`; }
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