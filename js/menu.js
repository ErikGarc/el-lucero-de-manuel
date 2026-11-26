/* =====================================
   EL LUCERO DE MANUEL
   Menú y carrito personalizado
===================================== */

// =====================================
// CONEXIÓN CON NUESTRA API DE CLOUDFLARE
// =====================================

// Entorno de pruebas. No se envían pedidos hasta habilitarlo expresamente.
const API_BASE = "https://el-lucero-pruebas-worker.eriikgow.workers.dev";
const API_MENU = `${API_BASE}/api/menu`;
const API_PEDIDOS = `${API_BASE}/api/pedidos`;
const API_NEGOCIO = `${API_BASE}/api/negocio`;
const MODO_ENVIO_PRUEBAS = true;
let solicitudPendienteId = null;
let enviandoPedido = false;

// El catálogo completo proviene de D1.
let productos = [];
let categorias = [];

function iconoProducto(nombre) {
    const texto = nombre.toLowerCase();

    if (/combo|promoci[oó]n/.test(texto)) return "🍔🍟";
    if (texto.includes("hamburguesa")) return "🍔";
    if (/hot[ -]?dog/.test(texto)) return "🌭";
    if (texto.includes("alitas")) return "🍗";
    if (/boneless|boneles/.test(texto)) return "🍗";
    if (texto.includes("papas")) return "🍟";
    if (texto.includes("refresco")) return "🥤";
    if (texto.includes("sincronizada")) return "🧀";

    return "🍽️";
}

function normalizar(p) {
    return {id:String(p.id), nombre:p.nombre, descripcion:p.descripcion||"", precio:Number(p.precio),
        imagen:p.esCombo?"🍔🍟":iconoProducto(p.nombre), opcionesMinimas:p.opciones_minimas, opcionesMaximas:p.opciones_maximas,
        opciones:p.ingredientes.filter(i=>i.disponible&&i.esOpcion).map(i=>i.nombre),
        ingredientes:p.ingredientes.filter(i=>i.disponible&&i.sePuedeQuitar&&!i.esOpcion).map(i=>i.nombre)};
}

async function consultarMenuAPI() {
    try {
        const respuesta = await fetch(API_MENU, { cache: "no-store" });
        if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
        const datos = await respuesta.json();
        if (!Array.isArray(datos.productos)) {
            throw new Error("El menú recibido no es válido.");
        }
        if (datos.productos.some(p => !Number.isInteger(p.opciones_minimas) || !Number.isInteger(p.opciones_maximas) || !Array.isArray(p.ingredientes) || p.ingredientes.some(i => typeof i.esOpcion !== "boolean"))) {
            throw new Error("El catálogo no incluye la configuración de opciones.");
        }
        if (!Array.isArray(datos.categorias) || datos.productos.some(p => typeof p.esCombo !== "boolean" || typeof p.disponibleEfectivo !== "boolean" || !Array.isArray(p.componentesCombo))) throw new Error("Catálogo incompatible");
        categorias = datos.categorias.filter(c => c.disponible).sort((a,b)=>a.orden-b.orden);
        productos = datos.productos.map(p => ({...normalizar(p), categoriaId:p.categoriaId,
            disponible:p.disponibleEfectivo === true, esCombo:p.esCombo,
            componentes:p.componentesCombo.flatMap(c => Array.from({length:c.cantidad}, (_,n)=>({componenteId:c.id, unidad:n+1, producto:normalizar(c.producto)})))
        }));
        mostrarProductos();
        if (!productos.some(p => p.disponible)) {
            contenedor.textContent = "Por el momento no hay productos disponibles.";
        }
    } catch (error) {
        productos = [];
        contenedor.textContent = "No se pudo cargar el menú. Recarga la página.";
        console.error("Error al consultar Cloudflare:", error);
    }
}

// Cada elemento representa una configuración y su cantidad.
let carrito = [];
let siguienteId = 1;
let pedidoConfirmado = false;
let versionCarrito = 0;
let versionRevisada = -1;
let cuponAplicado = null, validandoCupon = false;
const dineroCupon = n => `$${(n/100).toFixed(2)} MXN`;
function importesCarrito(){
    const subtotal = carrito.reduce((n,p)=>n+Math.round(p.precio*100)*p.cantidad,0);
    const descuento = Math.round(subtotal*(cuponAplicado?.porcentaje||0)/100);
    return {subtotal, descuento, total:subtotal-descuento};
}

function invalidarSolicitudPendiente() {
    solicitudPendienteId = null;
}


// ELEMENTOS HTML

const contenedor =
    document.getElementById("lista-productos");

const contenedorCarrito =
    document.getElementById("carrito-productos");

const totalCarrito =
    document.getElementById("total-carrito");

const btnVaciar =
    document.getElementById("btn-vaciar");

// Cupón: controles insertados sin modificar index.html.
const bloqueCupon = document.createElement('section');
bloqueCupon.className = 'carrito-cupon';
bloqueCupon.innerHTML = `<label for="codigo-cupon">🎟️ ¿Tienes un cupón de descuento?</label><div class="cupon-controles"><input id="codigo-cupon" maxlength="40" placeholder="Código de cupón" autocomplete="off"><button type="button" id="aplicar-cupon">Aplicar</button><button type="button" id="quitar-cupon" hidden>Quitar</button></div><p id="mensaje-cupon" role="status"></p><div id="importes-cupon" hidden></div>`;
document.querySelector('.carrito-total').before(bloqueCupon);
const codigoCupon = bloqueCupon.querySelector('input');
const aplicarCupon = bloqueCupon.querySelector('#aplicar-cupon');
const quitarCupon = bloqueCupon.querySelector('#quitar-cupon');
const mensajeCupon = bloqueCupon.querySelector('#mensaje-cupon');
const importesCupon = bloqueCupon.querySelector('#importes-cupon');
function pintarCupon(){
    const bloqueado = enviandoPedido || pedidoConfirmado || validandoCupon;
    codigoCupon.disabled = bloqueado || !!cuponAplicado || !carrito.length;
    aplicarCupon.disabled = codigoCupon.disabled;
    quitarCupon.disabled = bloqueado;
    quitarCupon.hidden = !cuponAplicado;
    importesCupon.hidden = !cuponAplicado;
    const i = importesCarrito();
    importesCupon.textContent = `Subtotal: ${dineroCupon(i.subtotal)} · Descuento (${cuponAplicado?.porcentaje||0}%): −${dineroCupon(i.descuento)}`;
}
aplicarCupon.addEventListener('click', async()=>{
    if(enviandoPedido||pedidoConfirmado||validandoCupon||!carrito.length||cuponAplicado)return;
    const codigo = codigoCupon.value.trim().toUpperCase();
    if(!/^[A-Z0-9_-]{1,40}$/.test(codigo)){mensajeCupon.textContent='Escribe un código válido.';return;}
    const version = versionCarrito;
    validandoCupon=true; pintarCupon(); mensajeCupon.textContent='Validando cupón...';
    try{
        const r=await fetch(`${API_BASE}/api/cupones/validar`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({codigo}),signal:AbortSignal.timeout(10000)});
        const d=await r.json();
        if(version!==versionCarrito||enviandoPedido||pedidoConfirmado)return;
        if(!r.ok||d.valido!==true||![5,10].includes(d.porcentaje)||typeof d.codigo!=='string')throw new Error(d.error||'Cupón no disponible');
        cuponAplicado={codigo:d.codigo,porcentaje:d.porcentaje}; codigoCupon.value=d.codigo;
        mensajeCupon.textContent=`Cupón aplicado: ${d.porcentaje}% de descuento`;
        mostrarCarrito();
    }catch(e){if(version===versionCarrito)mensajeCupon.textContent=e.message;}
    finally{validandoCupon=false;pintarCupon();}
});
quitarCupon.addEventListener('click',()=>{
    if(enviandoPedido||pedidoConfirmado||validandoCupon)return;
    cuponAplicado=null;codigoCupon.value='';mensajeCupon.textContent='';mostrarCarrito();
});
// CREAR VENTANA DE PERSONALIZACIÓN

const modal = document.createElement("div");
modal.className = "modal-personalizacion";
modal.hidden = true;
document.body.appendChild(modal);

let productoSeleccionado = null;

// MOSTRAR PRODUCTOS

let categoriaActiva = null;
let desplazamientoCategorias = 0;
const accesoCarrito = document.createElement("button");
accesoCarrito.type = "button";
accesoCarrito.className = "lucero-carrito-flotante";
accesoCarrito.hidden = true;
accesoCarrito.addEventListener("click", () => document.querySelector(".seccion-carrito").scrollIntoView({behavior:"smooth",block:"start"}));
document.body.append(accesoCarrito);
document.body.classList.add("lucero-menu-app");

function mostrarProductos() {
    contenedor.replaceChildren();
    contenedor.classList.add("menu-por-categorias", "lucero-app-catalogo");
    const grupos = [...categorias, {id:null,nombre:"Otros productos",icono:"🍽️"}]
        .map(c=>({...c, visibles:productos.filter(p=>p.disponible && (c.id===null?p.categoriaId==null:p.categoriaId===c.id))}))
        .filter(c=>c.visibles.length);
    if (!grupos.length) return;
    const activo = grupos.find(c=>c.id===categoriaActiva) || grupos[0];
    categoriaActiva = activo.id;
    const nav = document.createElement("nav");
    nav.className = "lucero-app-nav";
    nav.setAttribute("aria-label","Categorías del menú");
    for (const c of grupos) {
        const boton = document.createElement("button");
        boton.type="button";
        boton.setAttribute("aria-pressed",String(c.id===activo.id));
        const icono=document.createElement("span"); icono.className="lucero-app-icono"; icono.textContent=c.icono;
        const nombre=document.createElement("span"); nombre.textContent=c.nombre;
        boton.append(icono,nombre);
        boton.addEventListener("click",()=>{desplazamientoCategorias=nav.scrollLeft; categoriaActiva=c.id; mostrarProductos(); const seleccionado=contenedor.querySelector('[aria-pressed="true"]'); seleccionado?.focus({preventScroll:true});});
        nav.append(boton);
    }
    const encabezado=document.createElement("div"); encabezado.className="lucero-app-titulo";
    const titulo=document.createElement("h3"); titulo.textContent=activo.nombre;
    const cuenta=document.createElement("span"); cuenta.textContent=`${activo.visibles.length} productos`;
    encabezado.append(titulo,cuenta);
    const rejilla=document.createElement("div"); rejilla.className="lucero-app-lista";
    for(const producto of activo.visibles){
        const tarjeta=document.createElement("article"); tarjeta.className="producto lucero-app-producto";
        const imagen=document.createElement("div"); imagen.className="producto-imagen"; imagen.textContent=producto.imagen;
        const detalle=document.createElement("div"); detalle.className="lucero-app-detalle";
        const nombre=document.createElement("h3"); nombre.textContent=producto.nombre;
        const descripcion=document.createElement("p"); descripcion.textContent=producto.descripcion;
        const precio=document.createElement("span"); precio.className="precio"; precio.textContent=`$${producto.precio.toFixed(2)} MXN`;
        detalle.append(nombre,descripcion,precio);
        const boton=document.createElement("button"); boton.type="button"; boton.textContent="+";
        boton.setAttribute("aria-label",`Personalizar y agregar ${producto.nombre}`);
        boton.disabled=pedidoConfirmado;
        boton.addEventListener("click",()=>abrirPersonalizacion(producto.id));
        tarjeta.append(imagen,detalle,boton); rejilla.append(tarjeta);
    }
    contenedor.append(nav,encabezado,rejilla); nav.scrollLeft=desplazamientoCategorias;
}

// ABRIR PERSONALIZACIÓN

function abrirPersonalizacion(id) {
    productoSeleccionado =
        productos.find(p => p.id === id);

    if (!productoSeleccionado || enviandoPedido || pedidoConfirmado) return;

    modal.innerHTML = "";

    const contenido = document.createElement("div");
    contenido.className = "modal-contenido";

    const titulo = document.createElement("h2");
    titulo.textContent = productoSeleccionado.nombre;

    const p = productoSeleccionado;
    if (!p.disponible) return;
    const bloques = p.esCombo ? p.componentes : [{producto:p}];
    const panel = document.createElement("div");
    const controles = bloques.map((c, indice) => {
        const base=c.producto;
        const bloque=document.createElement("section"); bloque.className="menu-componente";
        if(p.esCombo){const h=document.createElement("h3"); h.textContent=`${indice+1}. ${base.nombre}`; bloque.append(h);}
        const lista=document.createElement("div"); lista.className="lista-ingredientes";
        const opciones=document.createElement("div"); opciones.className="lista-ingredientes";
        function casilla(destino,nombre,esOpcion){
            const etiqueta=document.createElement("label"); etiqueta.className="ingrediente-opcion";
            const input=document.createElement("input"); input.type=esOpcion&&base.opcionesMinimas===1&&base.opcionesMaximas===1?"radio":"checkbox";
            input.name=`opciones-${indice}`; input.value=nombre;
            etiqueta.append(input,document.createTextNode(esOpcion?nombre:`Sin ${nombre}`)); destino.append(etiqueta);
        }
        if(base.ingredientes.length){const aviso=document.createElement("p"); aviso.textContent="Ingredientes que deseas quitar:"; bloque.append(aviso,lista); base.ingredientes.forEach(n=>casilla(lista,n,false));}
        if(base.opcionesMaximas>0){const aviso=document.createElement("p"); aviso.textContent=`Elige de ${base.opcionesMinimas} a ${base.opcionesMaximas} opciones.`; bloque.append(aviso,opciones); base.opciones.forEach(n=>casilla(opciones,n,true));}
        panel.append(bloque);
        return {c,base,lista,opciones};
    });
    const leer = div=>Array.from(div.querySelectorAll("input:checked"),i=>i.value).sort();
    let cantidad = 1;
    const cantidadTitulo = document.createElement("p");
    cantidadTitulo.textContent = "Cantidad de órdenes (misma personalización)";
    const selector = document.createElement("div");
    selector.className = "modal-acciones";
    const menos = document.createElement("button");
    menos.type = "button"; menos.textContent = "−"; menos.setAttribute("aria-label", "Disminuir cantidad");
    const numero = document.createElement("strong");
    const mas = document.createElement("button");
    mas.type = "button"; mas.textContent = "+"; mas.setAttribute("aria-label", "Aumentar cantidad");
    selector.append(menos, numero, mas);
    const precio = document.createElement("p");
    precio.className = "precio";
    precio.textContent =
        `$${productoSeleccionado.precio.toFixed(2)} MXN`;

    const acciones = document.createElement("div");
    acciones.className = "modal-acciones";

    const cancelar = document.createElement("button");
    cancelar.type = "button";
    cancelar.textContent = "Cancelar";
    cancelar.className = "btn-cancelar";

    cancelar.addEventListener("click", cerrarModal);

    const agregar = document.createElement("button");
    agregar.type = "button";
    agregar.textContent = "Agregar al carrito";
    agregar.className = "btn-confirmar";

    function actualizar() {
        let valido=controles.length>0;
        for(const {base,opciones} of controles){
            const n=leer(opciones).length;
            opciones.querySelectorAll('input[type="checkbox"]').forEach(c=>c.disabled=!c.checked&&n>=base.opcionesMaximas);
            if(n<base.opcionesMinimas||n>base.opcionesMaximas) valido=false;
        }
        agregar.disabled=!valido;
        numero.textContent = String(cantidad);
        menos.disabled = cantidad <= 1;
        mas.disabled = cantidad >= 20;
        precio.textContent = `Subtotal: $${(p.precio * cantidad).toFixed(2)} MXN`;
    }
    menos.addEventListener("click", () => { if (cantidad > 1) cantidad--; actualizar(); });
    mas.addEventListener("click", () => { if (cantidad < 20) cantidad++; actualizar(); });
    panel.addEventListener("change", actualizar);
    agregar.addEventListener("click", () => {
        if (enviandoPedido || pedidoConfirmado) return;
        if(agregar.disabled) return;
        const seleccion=controles.map(({c,base,lista,opciones})=>({componenteId:c.componenteId,unidad:c.unidad,nombre:base.nombre,ingredientesQuitados:leer(lista),opcionesElegidas:leer(opciones)}));
        const ingredientesQuitados=p.esCombo?[]:seleccion[0].ingredientesQuitados;
        const opcionesElegidas=p.esCombo?[]:seleccion[0].opcionesElegidas;
        const componentesCombo=p.esCombo?seleccion:[];
        const clave=JSON.stringify([p.id,ingredientesQuitados,opcionesElegidas,componentesCombo]);
        const existente = carrito.find(i => i.clave === clave);
        if ((existente?.cantidad || 0) + cantidad > 20) return alert("Máximo 20 órdenes por personalización.");
        if (!existente && carrito.length >= 30) return alert("Máximo 30 configuraciones por pedido.");
        if (existente) existente.cantidad += cantidad;
        else carrito.push({idCarrito: siguienteId++, clave, idProducto: p.id, nombre: p.nombre, precio: p.precio, cantidad, ingredientesQuitados, opcionesElegidas, componentesCombo});
        mostrarCarrito();
        cerrarModal();
    });
    acciones.append(cancelar, agregar);
    contenido.append(titulo);
    contenido.append(panel);
    contenido.append(cantidadTitulo, selector, precio, acciones);
    actualizar();

    modal.appendChild(contenido);
    modal.hidden = false;
}

function cerrarModal() {
    modal.hidden = true;
    modal.innerHTML = "";
    productoSeleccionado = null;
}

function indicacionesItem(item) {
    if(item.componentesCombo?.length) return item.componentesCombo.map((c,i)=>`${i+1}. ${c.nombre}: ${indicacionesItem(c)}`).join(" | ");
    const partes = [];
    if (item.opcionesElegidas.length) partes.push("Opciones: " + item.opcionesElegidas.join(" + "));
    if (item.ingredientesQuitados.length) partes.push("Sin: " + item.ingredientesQuitados.join(", "));
    return partes.join(" · ") || "Completo";
}

// MOSTRAR CARRITO

function mostrarCarrito() {

    // Registrar cambios y ocultar resúmenes anteriores
    versionCarrito++;
    invalidarSolicitudPendiente();

    const resumenAnterior =
        document.querySelector(".resumen-confirmacion");

    if (resumenAnterior) {
        resumenAnterior.hidden = true;
    }

    contenedorCarrito.innerHTML = "";

    let total = 0;

    if (carrito.length === 0) {
        const mensaje = document.createElement("p");
        mensaje.textContent = "Tu carrito está vacío.";
        contenedorCarrito.appendChild(mensaje);
    }

    carrito.forEach(item => {
        total += Math.round(item.precio * 100) * item.cantidad / 100;

        const fila = document.createElement("div");
        fila.className = "item-carrito";

        const detalle = document.createElement("div");
        detalle.className = "detalle-carrito";

        const nombre = document.createElement("strong");
        nombre.textContent = `${item.cantidad} × ${item.nombre}`;

        const indicaciones = document.createElement("small");

        indicaciones.textContent =
            indicacionesItem(item);

        detalle.append(nombre, indicaciones);

        const precio = document.createElement("span");
        precio.textContent =
            `$${(item.precio * item.cantidad).toFixed(2)} MXN`;

        const eliminar = document.createElement("button");
        eliminar.type = "button";
        eliminar.className = "btn-eliminar";
        eliminar.textContent = "Eliminar";

        eliminar.addEventListener("click", () => {
            if (enviandoPedido || pedidoConfirmado) return;
            carrito = carrito.filter(
                p => p.idCarrito !== item.idCarrito
            );
            mostrarCarrito();
        });

        fila.append(detalle, precio, eliminar);
        contenedorCarrito.appendChild(fila);
    });

    if (!carrito.length) {cuponAplicado=null;codigoCupon.value='';mensajeCupon.textContent='';}
    total = importesCarrito().total/100;
    pintarCupon();
    totalCarrito.textContent =
        `$${total.toFixed(2)} MXN`;
    const cantidadTotal = carrito.reduce((n,item)=>n+item.cantidad,0);
    accesoCarrito.textContent = `🛒 Ver carrito (${cantidadTotal}) · $${total.toFixed(2)} MXN`;
    accesoCarrito.hidden = cantidadTotal === 0 || pedidoConfirmado;
}

// VACIAR CARRITO

btnVaciar.addEventListener("click", () => {
    if (enviandoPedido || pedidoConfirmado) return;
    carrito = [];
    mostrarCarrito();
});

// INICIAR

mostrarProductos();
mostrarCarrito();
consultarMenuAPI();

// =====================================
// FORMULARIO DE PEDIDOS
// =====================================

const formularioPedido =
    document.getElementById("formulario-pedido");

const tipoEntrega =
    document.getElementById("tipo-entrega");

const campoLocal =
    document.getElementById("campo-local");

const nombreLocal =
    document.getElementById("nombre-local");

// Mostrar el campo del local solamente
// cuando el cliente elija entrega en local.

tipoEntrega.addEventListener("change", () => {

    const entregaEnLocal =
        tipoEntrega.value === "local";

    campoLocal.hidden = !entregaEnLocal;
    nombreLocal.required = entregaEnLocal;

    if (!entregaEnLocal) {
        nombreLocal.value = "";
    }

});

// Por ahora evitamos enviar el formulario.
// En el siguiente paso mostraremos el
// resumen del pedido y sus validaciones.


// =====================================
// RESUMEN DEL PEDIDO
// =====================================

const resumenPedido = document.createElement("section");
resumenPedido.className = "seccion-pedido resumen-confirmacion";
resumenPedido.hidden = true;

document.getElementById("seccion-pedido")
    .insertAdjacentElement("afterend", resumenPedido);

function crearTexto(etiqueta, valor) {
    const parrafo = document.createElement("p");

    const negritas = document.createElement("strong");
    negritas.textContent = etiqueta + ": ";

    const texto = document.createTextNode(valor);

    parrafo.append(negritas, texto);

    return parrafo;
}

formularioPedido.addEventListener("submit", (evento) => {
    evento.preventDefault();
    if (enviandoPedido || pedidoConfirmado || validandoCupon) return;

    // Validar que existan productos
    if (carrito.length === 0) {
        alert("Primero agrega productos a tu carrito.");
        return;
    }

    const nombreCliente = document
        .getElementById("nombre-cliente")
        .value.trim();

    const entrega = tipoEntrega.value;
    const local = nombreLocal.value.trim();

    // Validar nombre
    if (!nombreCliente) {
        alert("Escribe tu nombre.");
        return;
    }

    // Validar ubicación de entrega
    if (entrega === "local" && !local) {
        alert("Escribe el número o nombre del local.");
        return;
    }

    // Limpiar resumen anterior
    resumenPedido.innerHTML = "";

    const titulo = document.createElement("h2");
    titulo.textContent = "📋 Revisa tu pedido";

    resumenPedido.appendChild(titulo);

    resumenPedido.appendChild(
        crearTexto("Cliente", nombreCliente)
    );

    resumenPedido.appendChild(
        crearTexto(
            "Entrega",
            entrega === "local"
                ? "Entrega en local"
                : "Recoger en mostrador"
        )
    );

    if (entrega === "local") {
        resumenPedido.appendChild(
            crearTexto("Local", local)
        );
    }

    const subtitulo = document.createElement("h3");
    subtitulo.textContent = "Productos";
    subtitulo.style.marginTop = "20px";

    resumenPedido.appendChild(subtitulo);

    let total = 0;

    // Mostrar cada producto individual
    carrito.forEach((item, indice) => {
        const producto = document.createElement("div");
        producto.className = "item-carrito";

        const detalle = document.createElement("div");
        detalle.className = "detalle-carrito";

        const nombre = document.createElement("strong");
        nombre.textContent =
            `${indice + 1}. ${item.cantidad} × ${item.nombre}`;

        const ingredientes = document.createElement("small");

        ingredientes.textContent =
            indicacionesItem(item);

        const precio = document.createElement("span");
        precio.textContent =
            `$${(item.precio * item.cantidad).toFixed(2)} MXN`;

        detalle.append(nombre, ingredientes);
        producto.append(detalle, precio);

        resumenPedido.appendChild(producto);

        total += Math.round(item.precio * 100) * item.cantidad / 100;
    });

    const importes = importesCarrito();
    total = importes.total/100;
    if(cuponAplicado){
        resumenPedido.append(crearTexto('Subtotal',dineroCupon(importes.subtotal)),crearTexto(`Cupón ${cuponAplicado.codigo} (${cuponAplicado.porcentaje}%)`,'−'+dineroCupon(importes.descuento)));
    }
    const totalElemento = document.createElement("h3");
    totalElemento.style.marginTop = "25px";
    totalElemento.style.color = "#ffc400";
    totalElemento.textContent =
        `Total: $${total.toFixed(2)} MXN`;

    resumenPedido.appendChild(totalElemento);

    // Guardar la versión del carrito revisada
    versionRevisada = versionCarrito;

    // Botón de confirmación
    const botonConfirmar = document.createElement("button");
    botonConfirmar.type = "button";
    botonConfirmar.className = "btn-confirmacion-final";
    botonConfirmar.textContent = "✓ Confirmar pedido";

    botonConfirmar.addEventListener("click", async () => {
        if (pedidoConfirmado || enviandoPedido || validandoCupon) return;

        // Seguridad: el envío queda desactivado hasta autorizar una prueba.
        if (!MODO_ENVIO_PRUEBAS) {
            alert("El envío está preparado, pero las pruebas siguen desactivadas. No se registró ningún pedido.");
            return;
        }

        if (versionRevisada !== versionCarrito) {
            alert("Tu carrito cambió. Revisa nuevamente tu pedido.");
            resumenPedido.hidden = true;
            return;
        }

        const nombreActual = document.getElementById("nombre-cliente").value.trim();
        const entregaActual = tipoEntrega.value;
        const localActual = nombreLocal.value.trim();
        if (nombreActual !== nombreCliente || entregaActual !== entrega ||
            (entrega === "local" && localActual !== local)) {
            alert("Los datos de entrega cambiaron. Revisa nuevamente tu pedido.");
            resumenPedido.hidden = true;
            return;
        }
        if (!carrito.length) {
            alert("Tu carrito está vacío.");
            return;
        }

        enviandoPedido = true;
        pintarCupon();
        botonConfirmar.disabled = true;
        botonConfirmar.textContent = "Enviando pedido...";
        try {
            // Verificar directamente el estado del mismo Worker que recibirá el pedido.
            const estadoRespuesta = await fetch(API_NEGOCIO, {cache: "no-store"});
            if (!estadoRespuesta.ok) throw new Error("No se pudo consultar el estado del negocio.");
            const estado = await estadoRespuesta.json();
            if (estado.aceptandoPedidos !== true) {
                throw new Error("Por el momento no estamos recibiendo pedidos.");
            }

            if (!solicitudPendienteId) {
    solicitudPendienteId =
        typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : "10000000-1000-4000-8000-100000000000".replace(
                /[018]/g,
                c => (
                    Number(c) ^
                    (crypto.getRandomValues(new Uint8Array(1))[0] &
                    (15 >> (Number(c) / 4)))
                ).toString(16)
            );
}
            const productosPedido = carrito.map(item => ({
                id: String(item.idProducto), cantidad: item.cantidad,
                ingredientesQuitados: [...item.ingredientesQuitados],
                opcionesElegidas: [...item.opcionesElegidas],
                componentesCombo: (item.componentesCombo||[]).map(({componenteId,unidad,ingredientesQuitados,opcionesElegidas})=>({componenteId,unidad,ingredientesQuitados,opcionesElegidas}))
            }));
            if (productosPedido.length > 30 || productosPedido.some(p => p.cantidad > 20)) {
                throw new Error("El pedido supera el límite permitido de productos.");
            }

            const respuesta = await fetch(API_PEDIDOS, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    solicitudId: solicitudPendienteId,
                    nombreCliente,
                    tipoEntrega: entrega,
                    lugarEntrega: entrega === "local" ? local : null,
                    productos: productosPedido,
                    ...(cuponAplicado ? {cuponCodigo:cuponAplicado.codigo,totalEsperado:total} : {})
                })
            });
            const resultado = await respuesta.json();
            if (!respuesta.ok || resultado.guardado !== true || !resultado.pedidoId) {
    const error = new Error(
        resultado.mensaje ||
        resultado.error ||
        "No se pudo guardar el pedido."
    );

    error.cuponNoDisponible =
        respuesta.status === 409 &&
        resultado.error === "CUPON_NO_DISPONIBLE";

    throw error;
}

            pedidoConfirmado = true;
            accesoCarrito.hidden = true;
            document.querySelectorAll(".producto button, .btn-eliminar, #btn-vaciar")
                .forEach(boton => { boton.disabled = true; });
            formularioPedido.querySelectorAll("input, select, button")
                .forEach(campo => { campo.disabled = true; });
            resumenPedido.hidden = true;
            const pantallaFinal = document.createElement("section");
            pantallaFinal.className = "pantalla-confirmacion";
            const tituloFinal = document.createElement("h2");
            tituloFinal.textContent = `¡Pedido #${resultado.numeroPedido} confirmado!`;
            const mensajeFinal = document.createElement("p");
            mensajeFinal.textContent = `¡Gracias, ${nombreCliente}! Tu pedido se realizó correctamente. Gracias por elegir El Lucero de Manuel.`;
            const totalFinal = document.createElement("h3");
            totalFinal.textContent = `Total: $${Number(resultado.total).toFixed(2)} MXN`;
            pantallaFinal.append(tituloFinal, mensajeFinal);
            if(resultado.cuponCodigo) pantallaFinal.append(crearTexto('Subtotal',dineroCupon(Math.round(resultado.subtotal*100))),crearTexto(`Cupón ${resultado.cuponCodigo} (${resultado.cuponPorcentaje}%)`,'−'+dineroCupon(resultado.descuentoCentavos)));
            pantallaFinal.append(totalFinal);
            resumenPedido.insertAdjacentElement("afterend", pantallaFinal);
            pantallaFinal.scrollIntoView({behavior: "smooth"});
            try { agregarTicket(pantallaFinal, resultado, nombreCliente, entrega, local); }
            catch (errorTicket) { console.error("Ticket:", errorTicket); }
        
        } catch (error) {
            console.error("Error al registrar pedido:", error);

            // Detectar si el servidor rechazó el cupón porque se agotó.
          const cuponAgotado = error.cuponNoDisponible === true;
            if (cuponAgotado && cuponAplicado) {

                // Retirar únicamente el cupón.
                cuponAplicado = null;
                codigoCupon.value = "";

                // Informar al cliente.
                mensajeCupon.textContent =
                    "Este cupón ya no está disponible. Conservamos los productos de tu carrito. Revisa el nuevo total antes de confirmar.";

                // Actualizar importes y conservar todos los productos.
                mostrarCarrito();

                // Obligar a revisar nuevamente el pedido.
                resumenPedido.hidden = true;

                // Mostrar nuevamente el total actualizado.
                document.querySelector(".seccion-carrito")
                    ?.scrollIntoView({
                        behavior: "smooth",
                        block: "center"
                    });

            } else {

                alert(
                    "No se confirmó el pedido: " + error.message +
                    " Si hubo un problema de conexión, reintenta sin modificar el carrito."
                );

            }

        } finally {

            enviandoPedido = false;
            pintarCupon();
            if (!pedidoConfirmado) {
                botonConfirmar.disabled = false;
                botonConfirmar.textContent = "✓ Confirmar pedido";
            }
        }
    });

    resumenPedido.appendChild(botonConfirmar);


    // Botón para regresar
    const botonEditar = document.createElement("button");
    botonEditar.type = "button";
    botonEditar.id = "btn-confirmar-pedido";
    botonEditar.textContent = "← Editar mi pedido";
    botonEditar.style.marginTop = "20px";

    botonEditar.addEventListener("click", () => {
        resumenPedido.hidden = true;

        document.getElementById("seccion-pedido")
            .scrollIntoView({ behavior: "smooth" });
    });

    resumenPedido.appendChild(botonEditar);

    // Mostrar resumen
    resumenPedido.hidden = false;

    resumenPedido.scrollIntoView({
        behavior: "smooth"
    });
});

// Ticket digital: usa los importes y productos confirmados por el servidor.
function agregarTicket(pantalla, resultado, nombre, entrega, local) {
    const aviso = document.createElement('p');
    aviso.textContent = 'Guarda tu comprobante antes de salir.';
    pantalla.append(aviso);
    const volver = document.createElement('button');
    volver.type = 'button'; volver.className = 'btn-confirmacion-final';
    volver.textContent = 'Volver al menú';
    volver.addEventListener('click', () => location.reload());
    pantalla.append(volver);
    if (!Array.isArray(resultado.productos) || !resultado.productos.length) {
        aviso.textContent = 'Pedido confirmado. Conserva una captura del número y total. El servidor no devolvió el detalle necesario para generar el ticket.';
        return;
    }
    const guardar = document.createElement('button');
    guardar.type = 'button'; guardar.className = 'btn-confirmacion-final';
    guardar.textContent = 'Guardar ticket digital'; guardar.disabled = true;
    pantalla.insertBefore(guardar, volver);
    const fecha = new Date().toLocaleString('es-MX', {timeZone:'America/Mexico_City'});
    const dinero = n => '$' + Number(n).toFixed(2) + ' MXN';
    const filas = [];
    const linea = (texto, color='#171717', tam=25, negrita=false, sangria=0, centro=false, fondo=null) => filas.push({texto:String(texto),color,tam,negrita,sangria,centro,fondo});
    const separador = () => filas.push({separador:true});
    linea('COMPROBANTE DE PEDIDO','#171717',38,true,0,true,'#ffc400');
    linea('#'+resultado.numeroPedido,'#171717',90,true,0,true);
    linea('Fecha de pedido:','#171717',26,true,62); 
    linea(fecha,'#333333',25,false,62);
    separador();
    linea('Cliente: '+nombre,'#171717',26,true,36);
    linea('Entrega: '+(entrega==='local'?'Entrega en local '+local:'Recoger en mostrador'),'#171717',26,true,36);
    separador();
    function modificaciones(p,sangria) {
        if(p.ingredientesQuitados?.length) linea('SIN: '+p.ingredientesQuitados.join(', '),'#d71920',23,true,sangria);
        if(p.opcionesElegidas?.length) linea('OPCIONES: '+p.opcionesElegidas.join(' + '),'#171717',23,true,sangria);
    }
    for(const p of resultado.productos) {
        linea(p.cantidad+' × '+p.nombre,'#171717',28,true);
        linea(dinero(p.subtotal),'#171717',26,true);
        modificaciones(p,16);
        if(p.componentesCombo?.length) {
            linea('Contenido por combo (repetir '+p.cantidad+' ×):','#444444',23,false,16);
            for(const c of p.componentesCombo) {
                linea('•  '+(c.cantidad||1)+' × '+c.nombre+' · unidad '+c.unidad,'#171717',24,true,24);
                modificaciones(c,36);
            }
        }
        separador();
    }
    if(resultado.cuponCodigo){
        linea('Subtotal: '+dinero(resultado.subtotal),'#171717',26,true);
        linea('Cupón: '+resultado.cuponCodigo+' ('+resultado.cuponPorcentaje+'%)','#176438',25,true);
        linea('Descuento: −'+dinero(resultado.descuento),'#176438',26,true);
        separador();
    }
    linea('TOTAL: '+dinero(resultado.total),'#171717',36,true,0,true,'#ffc400');

    
    linea('¡Gracias por elegir','#171717',42,true,0,true);
    linea('El Lucero de Manuel!','#171717',42,true,0,true);
    linea('Este ticket es únicamente para consultar','#444444',22,false,0,true);
    linea('los detalles de tu pedido. No acredita el pago.','#444444',22,false,0,true);
    async function preparar() {
        const logo = new Image();
        const cargado = new Promise(resolve => {logo.onload=()=>resolve(true);logo.onerror=()=>resolve(false);});
        logo.src = 'assets/imagenes/logo.png';
        const tieneLogo = await cargado;
        const canvas = document.createElement('canvas');
        const ancho=720, margen=42;
        canvas.width=ancho;
        const ctx=canvas.getContext('2d');
        const fuentes = [
            ['TicketBold', 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@800&family=Lobster&display=swap']
        ];
        // Las fuentes son opcionales: si no cargan, se conserva un respaldo local.
        const estilo = document.createElement('link');
        estilo.rel='stylesheet'; estilo.href=fuentes[0][1];
        await Promise.race([new Promise(resolve=>{estilo.onload=estilo.onerror=resolve;document.head.append(estilo);}),new Promise(resolve=>setTimeout(resolve,2500))]);
        if(document.fonts) await Promise.race([Promise.allSettled([document.fonts.load('800 40px "Barlow Condensed"'),document.fonts.load('40px Lobster')]),new Promise(resolve=>setTimeout(resolve,2500))]);
        const fuente = f => f.texto?.includes('Gracias por elegir') || f.texto==='El Lucero de Manuel!'
            ? `${f.tam+6}px Lobster, cursive`
            : `${f.negrita?'800':'normal'} ${f.tam}px ${f.texto?.startsWith('#') || f.fondo ? 'Arial, sans-serif' : 'Arial, sans-serif'}`;
        function redondo(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();ctx.fill();}
        const bloques=filas.map(f=>{
            if(f.separador) return {...f,alto:26};
            ctx.font=fuente(f);
            const max=ancho-2*margen-f.sangria-(f.fondo?24:0)-(f.texto.startsWith('•')?22:0)-(f.texto.includes('Gracias por elegir')||f.texto==='El Lucero de Manuel!'?120:0);
            const renglones=[]; let actual='';
            for(const palabra of f.texto.split(/\s+/)) {
                const candidato=actual?actual+' '+palabra:palabra;
                if(ctx.measureText(candidato).width<=max){actual=candidato;continue;}
                if(actual) renglones.push(actual);
                actual='';
                for(const letra of palabra){if(actual&&ctx.measureText(actual+letra).width>max){renglones.push(actual);actual='';}actual+=letra;}
            }
            if(actual) renglones.push(actual);
            return {...f,renglones,alto:renglones.length*(f.tam+9)+8+(f.fondo?24:0)};
        });
        const inicio=260;
        canvas.height=inicio+bloques.reduce((s,f)=>s+f.alto,0)+44;
        if(canvas.height>16000) throw new Error('Ticket demasiado largo para una sola imagen.');
        ctx.fillStyle='#171717';ctx.fillRect(0,0,ancho,canvas.height);
        ctx.fillStyle='#fff7e9';ctx.fillRect(12,14,ancho-24,canvas.height-28);
        ctx.strokeStyle='#8b8275';ctx.lineWidth=2;ctx.strokeRect(5,5,ancho-10,canvas.height-10);ctx.strokeRect(19,20,ancho-38,canvas.height-40);
        ctx.fillStyle='#171717';
        for(let x=28;x<ancho-15;x+=28){for(const y of [14,canvas.height-14]){ctx.beginPath();ctx.arc(x,y,9,0,Math.PI*2);ctx.fill();}}
        if(tieneLogo){const escala=Math.min(248/logo.naturalWidth,248/logo.naturalHeight);const w=logo.naturalWidth*escala,h=logo.naturalHeight*escala;ctx.drawImage(logo,20+(248-w)/2,12+(248-h)/2,w,h);}
        const centro=tieneLogo?462:ancho/2;
        ctx.textAlign='center';ctx.textBaseline='top';ctx.fillStyle='#171717';ctx.font='800 53px "Barlow Condensed", Impact, sans-serif';
        ctx.fillText('EL LUCERO',centro,40);ctx.fillText('DE MANUEL',centro,94);
        ctx.fillStyle='#ffc400';ctx.fillRect(centro-112,155,224,6);
        ctx.fillStyle='#171717';ctx.font='800 32px "Barlow Condensed", Impact, sans-serif';ctx.fillText('LOCAL HV10',centro,174);
        if(tieneLogo){ctx.strokeStyle='#171717';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(280,42);ctx.lineTo(280,220);ctx.stroke();}
        let y=inicio;
        for(const f of bloques){
            if(f.separador){ctx.strokeStyle='#777066';ctx.lineWidth=1;ctx.setLineDash([8,6]);ctx.beginPath();ctx.moveTo(margen,y+10);ctx.lineTo(ancho-margen,y+10);ctx.stroke();ctx.setLineDash([]);}
            else {
                if(f.fondo){ctx.fillStyle=f.fondo;redondo(margen,y,ancho-2*margen,f.alto-8,18);}
                if(f.texto==='Fecha de pedido:'){ctx.strokeStyle='#cfc6b8';ctx.lineWidth=2;ctx.strokeRect(margen,y-2,ancho-2*margen,f.alto+40);ctx.strokeStyle='#171717';ctx.strokeRect(margen+14,y+10,32,30);ctx.beginPath();ctx.moveTo(margen+14,y+20);ctx.lineTo(margen+46,y+20);ctx.stroke();}
                if(f.texto.startsWith('Cliente:')||f.texto.startsWith('Entrega:')){ctx.font='25px Arial';ctx.fillStyle='#171717';ctx.textAlign='left';ctx.fillText(f.texto.startsWith('Cliente:')?'♟':'▣',margen,y);}

                ctx.font=fuente(f);ctx.fillStyle=f.color;ctx.textBaseline='top';ctx.textAlign=f.centro?'center':'left';
                if(f.texto.startsWith('#')){ctx.strokeStyle='#ffc400';ctx.lineWidth=7;ctx.lineCap='round';for(const lado of [-1,1]){for(let j=-1;j<=1;j++){ctx.beginPath();ctx.moveTo(ancho/2+lado*100,y+38+j*12);ctx.lineTo(ancho/2+lado*145,y+38+j*25);ctx.stroke();}}}
                if(f.texto.startsWith('TOTAL: ') && f.renglones.length===1){ctx.textAlign='left';ctx.fillText('TOTAL:',margen+18,y+12);ctx.textAlign='right';ctx.fillText(f.texto.slice(7),ancho-margen-18,y+12);}
                else if(f.texto.startsWith('•  ')){ctx.fillStyle='#ffc400';ctx.beginPath();ctx.arc(margen+f.sangria+7,y+13,7,0,Math.PI*2);ctx.fill();ctx.fillStyle=f.color;f.renglones.forEach((r,i)=>ctx.fillText(i===0?r.replace(/^•\s*/, ''):r,margen+f.sangria+22,y+i*(f.tam+9)));}
                else f.renglones.forEach((r,i)=>ctx.fillText(r,f.centro?ancho/2:margen+f.sangria,y+(f.fondo?12:0)+i*(f.tam+9)));
                if(f.texto.startsWith('¡Gracias')){ctx.font='42px Arial';ctx.textAlign='center';ctx.fillText('🍔',65,y+20);ctx.fillText('🍟',ancho-65,y+20);}

            }
            y+=f.alto;
        }
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
        if(!blob) throw new Error('No se pudo generar la imagen.');
        const url=URL.createObjectURL(blob);
        const archivo=`Lucero-${resultado.fechaNegocio}-${resultado.numeroPedido}.png`;
        const imagen=document.createElement('img');imagen.src=url;imagen.alt='Ticket digital del pedido '+resultado.numeroPedido;
        imagen.style.cssText='display:block;width:100%;max-width:420px;height:auto;margin:16px auto;border:1px solid #555;border-radius:12px';
        pantalla.insertBefore(imagen,guardar);
        guardar.disabled=false;
        guardar.addEventListener('click',()=>{const a=document.createElement('a');a.href=url;a.download=archivo;document.body.append(a);a.click();a.remove();});
        if(typeof File==='function' && navigator.canShare && navigator.share){
            const file=new File([blob],archivo,{type:'image/png'});
            if(navigator.canShare({files:[file]})){
                const compartir=document.createElement('button');compartir.type='button';compartir.className='btn-confirmacion-final';compartir.textContent='Compartir ticket';
                compartir.addEventListener('click',async()=>{try{await navigator.share({files:[file]});}catch(e){if(e.name!=='AbortError') alert('No se pudo compartir. Puedes guardar la imagen.');}});
                pantalla.insertBefore(compartir,volver);
            }
        }
        aviso.textContent='Guarda tu comprobante antes de salir.';
    }
    preparar().catch(error=>{console.error('Ticket:',error);guardar.hidden=true;aviso.textContent='Tu pedido está confirmado. No se pudo generar el ticket; conserva una captura del número y total.';});
}
// Vista previa local: ejecutar vistaPreviaTicket() desde la consola.
if (['localhost','127.0.0.1'].includes(location.hostname)) {
 window.vistaPreviaTicket = () => {
  document.getElementById('vista-ticket-local')?.remove();
  const panel=document.createElement('section');panel.id='vista-ticket-local';panel.style.cssText='position:fixed;inset:0;overflow:auto;background:#202020;color:white;z-index:99999;padding:20px;text-align:center';
  const titulo=document.createElement('h2');titulo.textContent='Vista previa local — no registra pedidos';panel.append(titulo);document.body.append(panel);
  agregarTicket(panel,{numeroPedido:'7',fechaNegocio:'VISTA-PREVIA',total:225,productos:[{cantidad:1,nombre:'Hamburguesa Doble con Alas y Papas',subtotal:225,componentesCombo:[{cantidad:1,nombre:'Hamburguesa Doble',unidad:1,ingredientesQuitados:['Cebolla','Jamón']},{cantidad:1,nombre:'ALITAS',unidad:1,opcionesElegidas:['MANGO HABANERO','RANCH']},{cantidad:1,nombre:'PAPAS A LA FRANCESA',unidad:1,ingredientesQuitados:['CATSUP']}]}]},'Cliente de prueba','mostrador','');
 };
}