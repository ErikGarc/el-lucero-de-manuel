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
        productos = datos.productos.map(p => ({
            id: String(p.id),
            nombre: p.nombre,
            descripcion: p.descripcion || "",
            precio: Number(p.precio),
            imagen: iconoProducto(p.nombre),
            disponible: p.disponible === true,
            opcionesMinimas: p.opciones_minimas,
            opcionesMaximas: p.opciones_maximas,
            opciones: p.ingredientes.filter(i => i.disponible === true && i.esOpcion === true).map(i => i.nombre),
            ingredientes: Array.isArray(p.ingredientes)
                ? p.ingredientes.filter(i => i.disponible === true && i.sePuedeQuitar === true && !i.esOpcion)
                    .map(i => i.nombre)
                : []
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

// CREAR VENTANA DE PERSONALIZACIÓN

const modal = document.createElement("div");
modal.className = "modal-personalizacion";
modal.hidden = true;
document.body.appendChild(modal);

let productoSeleccionado = null;

// MOSTRAR PRODUCTOS

function mostrarProductos() {
    contenedor.innerHTML = "";

    productos.forEach(producto => {
        if (!producto.disponible) return;

        const tarjeta = document.createElement("article");
        tarjeta.className = "producto";

        const imagen = document.createElement("div");
        imagen.className = "producto-imagen";
        imagen.textContent = producto.imagen;

        const nombre = document.createElement("h3");
        nombre.textContent = producto.nombre;

        const descripcion = document.createElement("p");
        descripcion.textContent = producto.descripcion;

        const precio = document.createElement("span");
        precio.className = "precio";
        precio.textContent =
            `$${producto.precio.toFixed(2)} MXN`;

        const boton = document.createElement("button");
        boton.type = "button";
        boton.textContent = "Personalizar y agregar";

        boton.addEventListener("click", () => {
            abrirPersonalizacion(producto.id);
        });

        tarjeta.append(
            imagen,
            nombre,
            descripcion,
            precio,
            boton
        );

        contenedor.appendChild(tarjeta);
    });
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

    const instrucciones = document.createElement("p");
    instrucciones.textContent =
        "Selecciona los ingredientes que deseas quitar:";

    const lista = document.createElement("div");
    lista.className = "lista-ingredientes";

    productoSeleccionado.ingredientes.forEach(ingrediente => {
        const etiqueta = document.createElement("label");
        etiqueta.className = "ingrediente-opcion";

        const casilla = document.createElement("input");
        casilla.type = "checkbox";
        casilla.value = ingrediente;

        const texto = document.createElement("span");
        texto.textContent = `Sin ${ingrediente}`;

        etiqueta.append(casilla, texto);
        lista.appendChild(etiqueta);
    });

    const opciones = document.createElement("div");
    opciones.className = "lista-ingredientes";
    const p = productoSeleccionado;
    const aviso = document.createElement("p");
    if (p.opcionesMaximas > 0) {
        aviso.textContent = `Elige de ${p.opcionesMinimas} a ${p.opcionesMaximas} opciones por orden (sin costo adicional).`;
        for (const opcion of p.opciones) {
            const etiqueta = document.createElement("label");
            etiqueta.className = "ingrediente-opcion";
            const casilla = document.createElement("input");
            casilla.type = p.opcionesMaximas === 1 && p.opcionesMinimas === 1 ? "radio" : "checkbox";
            casilla.name = "opciones-producto";
            casilla.value = opcion;
            etiqueta.append(casilla, document.createTextNode(opcion));
            opciones.append(etiqueta);
        }
    }
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
        const elegidas = opciones.querySelectorAll("input:checked").length;
        opciones.querySelectorAll('input[type="checkbox"]').forEach(c => {
            c.disabled = !c.checked && elegidas >= p.opcionesMaximas;
        });
        agregar.disabled = elegidas < p.opcionesMinimas || elegidas > p.opcionesMaximas;
        numero.textContent = String(cantidad);
        menos.disabled = cantidad <= 1;
        mas.disabled = cantidad >= 20;
        precio.textContent = `Subtotal: $${(p.precio * cantidad).toFixed(2)} MXN`;
    }
    menos.addEventListener("click", () => { if (cantidad > 1) cantidad--; actualizar(); });
    mas.addEventListener("click", () => { if (cantidad < 20) cantidad++; actualizar(); });
    opciones.addEventListener("change", actualizar);
    agregar.addEventListener("click", () => {
        if (enviandoPedido || pedidoConfirmado) return;
        const ingredientesQuitados = Array.from(lista.querySelectorAll("input:checked"), i => i.value).sort();
        const opcionesElegidas = Array.from(opciones.querySelectorAll("input:checked"), i => i.value).sort();
        if (opcionesElegidas.length < p.opcionesMinimas || opcionesElegidas.length > p.opcionesMaximas) return;
        const clave = JSON.stringify([p.id, ingredientesQuitados, opcionesElegidas]);
        const existente = carrito.find(i => i.clave === clave);
        if ((existente?.cantidad || 0) + cantidad > 20) return alert("Máximo 20 órdenes por personalización.");
        if (!existente && carrito.length >= 30) return alert("Máximo 30 configuraciones por pedido.");
        if (existente) existente.cantidad += cantidad;
        else carrito.push({idCarrito: siguienteId++, clave, idProducto: p.id, nombre: p.nombre, precio: p.precio, cantidad, ingredientesQuitados, opcionesElegidas});
        mostrarCarrito();
        cerrarModal();
    });
    acciones.append(cancelar, agregar);
    contenido.append(titulo);
    if (p.ingredientes.length) contenido.append(instrucciones, lista);
    if (p.opcionesMaximas > 0) contenido.append(aviso, opciones);
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

    totalCarrito.textContent =
        `$${total.toFixed(2)} MXN`;
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
    if (enviandoPedido || pedidoConfirmado) return;

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
        if (pedidoConfirmado || enviandoPedido) return;

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

            if (!solicitudPendienteId) solicitudPendienteId = crypto.randomUUID();
            const productosPedido = carrito.map(item => ({
                id: String(item.idProducto), cantidad: item.cantidad,
                ingredientesQuitados: [...item.ingredientesQuitados],
                opcionesElegidas: [...item.opcionesElegidas]
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
                    productos: productosPedido
                })
            });
            const resultado = await respuesta.json();
            if (!respuesta.ok || resultado.guardado !== true || !resultado.pedidoId) {
                throw new Error(resultado.mensaje || resultado.error || "No se pudo guardar el pedido.");
            }

            pedidoConfirmado = true;
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
            pantallaFinal.append(tituloFinal, mensajeFinal, totalFinal);
            resumenPedido.insertAdjacentElement("afterend", pantallaFinal);
            pantallaFinal.scrollIntoView({behavior: "smooth"});
        } catch (error) {
            console.error("Error al registrar pedido:", error);
            alert("No se confirmó el pedido: " + error.message +
                " Si hubo un problema de conexión, reintenta sin modificar el carrito.");
            // Conservamos solicitudPendienteId para que un reintento no duplique el pedido.
        } finally {
            enviandoPedido = false;
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