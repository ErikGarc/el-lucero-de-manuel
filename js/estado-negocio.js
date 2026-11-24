window.negocioAceptandoPedidos = false;

const API_NEGOCIO =
    "https://el-lucero-pruebas-worker.eriikgow.workers.dev/api/negocio";

// Crear indicador de estado
const indicador = document.createElement("div");

indicador.id = "estado-negocio";
indicador.textContent = "Consultando disponibilidad...";

document.body.prepend(indicador);

// Consultar disponibilidad desde Cloudflare D1
async function consultarEstadoNegocio() {

    try {

        const respuesta = await fetch(API_NEGOCIO, {
            cache: "no-store",
            signal: AbortSignal.timeout(8000)
        });

        if (!respuesta.ok) {
            throw new Error(`HTTP ${respuesta.status}`);
        }

        const configuracion = await respuesta.json();

        window.negocioAceptandoPedidos =
            configuracion.aceptandoPedidos === true;

        if (window.negocioAceptandoPedidos) {

            indicador.textContent =
                "🟢 Estamos recibiendo pedidos";

            indicador.className = "negocio-abierto";

        } else {

            indicador.textContent =
                "🔴 Por el momento no recibimos pedidos";

            indicador.className = "negocio-cerrado";

        }

    } catch (error) {

        console.error(
            "Error al consultar disponibilidad:",
            error.message
        );

        window.negocioAceptandoPedidos = false;

        indicador.textContent =
            "No se pudo verificar la disponibilidad.";

        indicador.className = "negocio-cerrado";

    } finally {

        // Consultar nuevamente después de 10 segundos
        setTimeout(consultarEstadoNegocio, 10000);

    }

}

// Primera consulta
consultarEstadoNegocio();