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

const auth = getAuth(app);
const API =
  "https://el-lucero-pruebas-worker.eriikgow.workers.dev/api/admin/productos";
const $ = (id) => document.getElementById(id);
const pagina = document.querySelector(".pagina-pedidos");
const lista = $("lista-productos");
const mensaje = $("mensaje-productos");
const formulario = $("formulario-producto");
const form = $("form-producto");
const ingredientes = $("lista-ingredientes");
let editando = null;
let seccion = "productos",
  catalogo = null,
  editandoCategoria = null;
const camposSimples = $("campos-simples");
const camposCombo = $("campos-combo");
const componentes = $("lista-componentes");
const editorCategoria = $("editor-categoria");
const esPromoPrueba = (p) => /^promoci[oó]n viernes$/i.test(p.nombre.trim());
let ocupado = false;
let autorizado = false;
pagina.hidden = true;

async function api(ruta = "", metodo = "GET", datos) {
  const usuario = auth.currentUser;
  if (!autorizado || !usuario) throw new Error("Sesión no autorizada");
  const token = await usuario.getIdToken();
  const respuesta = await fetch(
    ruta.startsWith("/categorias")
      ? API.replace(/productos$/, "categorias") + ruta.slice(11)
      : API + ruta,
    {
      method: metodo,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(datos ? { "Content-Type": "application/json" } : {}),
      },
      ...(datos ? { body: JSON.stringify(datos) } : {}),
    },
  );
  const resultado = await respuesta.json();
  if (!respuesta.ok)
    throw new Error(resultado.error || `HTTP ${respuesta.status}`);
  return resultado;
}
function elemento(tipo, texto, clase) {
  const e = document.createElement(tipo);
  if (texto !== undefined) e.textContent = texto;
  if (clase) e.className = clase;
  return e;
}
function boton(texto, accion) {
  const b = elemento("button", texto, "boton-modulo");
  b.type = "button";
  b.addEventListener("click", () => {
    if (!ocupado) accion();
  });
  return b;
}
function agregarIngrediente(i = {}) {
  if (ingredientes.children.length >= 40)
    return alert("Máximo 40 ingredientes y opciones.");
  const fila = elemento("div");
  const nombre = elemento("input");
  nombre.type = "text";
  nombre.required = true;
  nombre.maxLength = 80;
  nombre.placeholder = "Nombre del ingrediente u opción";
  nombre.value = i.nombre || "";
  nombre.setAttribute("aria-label", "Nombre del ingrediente u opción");
  const quitar = elemento("input");
  quitar.type = "checkbox";
  quitar.checked = i.sePuedeQuitar === true;
  const disponible = elemento("input");
  disponible.type = "checkbox";
  disponible.checked = i.disponible !== false;
  const opcion = elemento("input");
  opcion.type = "checkbox";
  opcion.checked = i.esOpcion === true;
  const sincronizar = () => {
    if (opcion.checked) quitar.checked = false;
    quitar.disabled = opcion.checked;
  };
  opcion.addEventListener("change", sincronizar);
  sincronizar();
  const l3 = elemento("label");
  l3.append(opcion, " Es una opción seleccionable");
  const l1 = elemento("label");
  l1.append(quitar, " Se puede quitar");
  const l2 = elemento("label");
  l2.append(disponible, " Disponible");
  fila.append(
    nombre,
    l1,
    l2,
    l3,
    boton("Eliminar fila", () => fila.remove()),
  );
  ingredientes.append(fila);
}
function abrirFormulario(p = null) {
  editando = p?.id ?? null;
  form.reset();
  ingredientes.replaceChildren();
  componentes.replaceChildren();
  editorCategoria.hidden = true;
  const combo = seccion === "combos";
  camposSimples.hidden = combo;
  camposCombo.hidden = !combo;
  const select = $("categoria-producto");
  select.replaceChildren();
  for (const c of catalogo.categorias) select.add(new Option(c.nombre, c.id));
  select.value = String(
    p?.categoriaId ??
      catalogo.categorias.find(
        (c) => c.nombre === (combo ? "Combos y promociones" : "Otros"),
      )?.id ??
      catalogo.categorias[0]?.id,
  );
  for (const c of p?.componentesCombo || []) agregarComponente(c);
  $("titulo-formulario").textContent = p
    ? combo
      ? "Editar combo"
      : "Editar producto"
    : combo
      ? "Nuevo combo"
      : "Nuevo producto";
  $("nombre-producto").value = p?.nombre ?? "";
  $("descripcion-producto").value = p?.descripcion ?? "";
  $("precio-producto").value = p?.precio ?? "";
  $("disponible-producto").checked = p?.disponible ?? !combo;
  $("disponible-producto").disabled = false;
  $("opciones-minimas").value = p?.opciones_minimas ?? 0;
  $("opciones-maximas").value = p?.opciones_maximas ?? 0;
  (p?.ingredientes || []).forEach(agregarIngrediente);
  formulario.hidden = false;
  formulario.scrollIntoView({ behavior: "smooth" });
}
function agregarComponente(c = {}) {
  if (componentes.children.length >= 20) return alert("Máximo 20 componentes.");
  const fila = elemento("div");
  const select = elemento("select");
  select.required = true;
  select.setAttribute("aria-label", "Producto incluido");
  select.add(new Option("Selecciona un producto", ""));
  for (const p of catalogo.productos.filter(
    (p) => !p.esCombo && !esPromoPrueba(p),
  ))
    select.add(
      new Option(
        p.nombre + (p.disponibleEfectivo ? "" : " (no disponible)"),
        p.id,
      ),
    );
  select.value = c.productoId || "";
  const cantidad = elemento("input");
  cantidad.type = "number";
  cantidad.min = 1;
  cantidad.max = 20;
  cantidad.step = 1;
  cantidad.required = true;
  cantidad.value = c.cantidad ?? 1;
  cantidad.setAttribute("aria-label", "Cantidad incluida");
  fila.append(
    select,
    cantidad,
    boton("Quitar", () => fila.remove()),
  );
  componentes.append(fila);
}
function abrirCategoria(c = null) {
  formulario.hidden = true;
  editandoCategoria = c?.id ?? null;
  $("nombre-categoria").value = c?.nombre ?? "";
  $("icono-categoria").value = c?.icono ?? "🍽️";
  $("orden-categoria").value =
    c?.orden ?? Math.max(0, ...catalogo.categorias.map((x) => x.orden)) + 1;
  $("disponible-categoria").checked = c?.disponible ?? true;
  editorCategoria.hidden = false;
  editorCategoria.scrollIntoView({ behavior: "smooth" });
}
function render() {
  lista.replaceChildren();
  const combo = seccion === "combos",
    cats = seccion === "categorias";
  $("titulo-seccion").textContent = cats
    ? "Categorías registradas"
    : combo
      ? "Combos registrados"
      : "Productos registrados";
  $("btn-agregar-producto").textContent = cats
    ? "+ Agregar categoría"
    : combo
      ? "+ Agregar combo"
      : "+ Agregar producto";
  const registros = cats
    ? catalogo.categorias
    : catalogo.productos.filter((p) =>
        combo ? p.esCombo || esPromoPrueba(p) : !p.esCombo && !esPromoPrueba(p),
      );
  for (const p of registros) {
    const t = elemento("article", undefined, "tarjeta-pedido");
    t.append(elemento("h3", cats ? p.icono + " " + p.nombre : p.nombre));
    if (cats) {
      t.append(
        elemento("p", "Orden: " + p.orden),
        elemento(
          "p",
          catalogo.productos.filter((x) => x.categoriaId === p.id).length +
            " productos",
        ),
        elemento("p", p.disponible ? "🟢 Disponible" : "🔴 Desactivada"),
        boton("Editar", () => abrirCategoria(p)),
      );
    } else {
      t.append(
        elemento("p", p.descripcion || ""),
        elemento("p", `$${Number(p.precio).toFixed(2)} MXN`, "total-pedido"),
        elemento(
          "p",
          p.disponibleEfectivo
            ? "🟢 Disponible"
            : p.disponible
              ? "🟠 Bloqueado por configuración"
              : "🔴 Desactivado",
        ),
        elemento(
          "p",
          "Categoría: " +
            (catalogo.categorias.find((c) => c.id === p.categoriaId)?.nombre ||
              "Sin categoría"),
        ),
      );
      if (esPromoPrueba(p)) {
        t.append(
          elemento("p", "Promoción de prueba. Se mantiene sin cambios."),
        );
      } else {
        if (combo)
          t.append(
            elemento(
              "p",
              "Incluye: " +
                p.componentesCombo
                  .map(
                    (c) =>
                      `${c.cantidad} × ${c.producto?.nombre || c.productoId}`,
                  )
                  .join(" + "),
            ),
          );
        else
          t.append(
            elemento(
              "p",
              "Ingredientes: " +
                (p.ingredientes
                  .filter((i) => !i.esOpcion)
                  .map((i) => i.nombre)
                  .join(", ") || "Sin ingredientes"),
            ),
            elemento(
              "p",
              "Opciones: " +
                (p.ingredientes
                  .filter((i) => i.esOpcion)
                  .map(
                    (i) => i.nombre + (i.disponible ? "" : " (no disponible)"),
                  )
                  .join(", ") || "Sin opciones"),
            ),
            elemento(
              "p",
              `Selección: mínimo ${p.opciones_minimas}, máximo ${p.opciones_maximas}`,
            ),
          );
        t.append(boton("Editar", () => abrirFormulario(p)));
        t.append(
          boton(p.disponible ? "Desactivar" : "Activar", () =>
            cambiarDisponibilidad(p),
          ),
        );
      }
    }
    lista.append(t);
  }
  mensaje.textContent = `${registros.length} registro(s)`;
  $("btn-agregar-producto").disabled = false;
}
async function cargar() {
  const datos = await api();
  if (
    !Array.isArray(datos.categorias) ||
    !Array.isArray(datos.productos) ||
    datos.productos.some(
      (p) =>
        typeof p.esCombo !== "boolean" ||
        typeof p.disponibleEfectivo !== "boolean" ||
        !Array.isArray(p.componentesCombo) ||
        !Array.isArray(p.ingredientes) ||
        !Number.isInteger(p.opciones_minimas) ||
        !Number.isInteger(p.opciones_maximas),
    )
  )
    throw new Error("Catálogo incompatible. No edites el menú.");
  catalogo = datos;
  render();
}
for (const b of document.querySelectorAll("[data-seccion]"))
  b.addEventListener("click", () => {
    if (ocupado || !catalogo) return;
    if (
      (!formulario.hidden || !editorCategoria.hidden) &&
      !confirm("¿Descartar cambios sin guardar?")
    )
      return;
    formulario.hidden = true;
    editorCategoria.hidden = true;
    seccion = b.dataset.seccion;
    for (const x of document.querySelectorAll("[data-seccion]"))
      x.setAttribute("aria-pressed", String(x === b));
    render();
  });
$("agregar-componente").onclick = () => {
  if (!ocupado) agregarComponente();
};
$("cancelar-categoria").onclick = () => {
  if (!ocupado) editorCategoria.hidden = true;
};
$("form-categoria").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (ocupado) return;
  const d = {
    nombre: $("nombre-categoria").value.trim(),
    icono: $("icono-categoria").value,
    orden: Number($("orden-categoria").value),
    disponible: $("disponible-categoria").checked,
  };
  if (!d.nombre || !confirm("¿Guardar categoría?")) return;
  ocupado = true;
  try {
    await api(
      "/categorias" + (editandoCategoria ? "/" + editandoCategoria : ""),
      editandoCategoria ? "PATCH" : "POST",
      d,
    );
    editorCategoria.hidden = true;
    await cargar();
  } catch (e) {
    alert(e.message);
  } finally {
    ocupado = false;
  }
});
async function cambiarDisponibilidad(p) {
  if (p.esCombo && !p.disponible) {
    abrirFormulario(p);
    $("disponible-producto").checked = true;
    return;
  }
  if (!confirm(`${p.disponible ? "Desactivar" : "Activar"} ${p.nombre}?`))
    return;
  ocupado = true;
  try {
    await api("/" + encodeURIComponent(p.id), "PATCH", {
      disponible: !p.disponible,
    });
    await cargar();
  } catch (e) {
    alert(e.message);
  } finally {
    ocupado = false;
  }
}
$("btn-agregar-producto").addEventListener("click", () => {
  if (!ocupado) {
    if (seccion === "categorias") abrirCategoria();
    else abrirFormulario();
  }
});
$("btn-agregar-ingrediente").addEventListener("click", () => {
  if (!ocupado) agregarIngrediente();
});
$("btn-cancelar-producto").addEventListener("click", () => {
  if (!ocupado) formulario.hidden = true;
});
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (ocupado) return;
  const datos = {
    nombre: $("nombre-producto").value.trim(),
    descripcion: $("descripcion-producto").value.trim(),
    precio: Number($("precio-producto").value),
    disponible: $("disponible-producto").checked,
    opcionesMinimas: Number($("opciones-minimas").value),
    opcionesMaximas: Number($("opciones-maximas").value),
    ingredientes: Array.from(ingredientes.children, (fila) => {
      const [nombre, quitar, disponible, opcion] =
        fila.querySelectorAll("input");
      return {
        nombre: nombre.value.trim(),
        sePuedeQuitar: !opcion.checked && quitar.checked,
        disponible: disponible.checked,
        esOpcion: opcion.checked,
      };
    }),
  };
  datos.categoriaId = Number($("categoria-producto").value);
  datos.esCombo = seccion === "combos";
  datos.componentesCombo = [];
  if (datos.esCombo) {
    datos.ingredientes = [];
    datos.opcionesMinimas = 0;
    datos.opcionesMaximas = 0;
    datos.componentesCombo = Array.from(componentes.children, (f) => ({
      productoId: f.querySelector("select").value,
      cantidad: Number(f.querySelector("input").value),
    }));
    if (
      !datos.componentesCombo.length ||
      datos.componentesCombo.some(
        (c) => !c.productoId || !Number.isInteger(c.cantidad) || c.cantidad < 1,
      ) ||
      datos.componentesCombo.reduce((n, c) => n + c.cantidad, 0) > 20
    )
      return alert("Agrega entre 1 y 20 componentes válidos.");
  }
  const min = datos.opcionesMinimas,
    max = datos.opcionesMaximas;
  const opciones = datos.ingredientes.filter((i) => i.esOpcion);
  if (
    !Number.isInteger(min) ||
    !Number.isInteger(max) ||
    min < 0 ||
    max < min ||
    max > 40 ||
    min > opciones.filter((i) => i.disponible).length ||
    (max === 0 && opciones.length) ||
    (max > 0 && !opciones.length) ||
    max > opciones.length
  )
    return alert(
      "Revisa los límites y las opciones disponibles. Usa 0 y 0 si no hay opciones.",
    );
  if (
    datos.ingredientes.some((i) => !i.nombre) ||
    new Set(datos.ingredientes.map((i) => i.nombre.toLowerCase())).size !==
      datos.ingredientes.length
  )
    return alert("Revisa los nombres vacíos o duplicados.");
  if (!confirm("¿Guardar los cambios del producto?")) return;
  ocupado = true;
  $("btn-guardar-producto").disabled = true;
  try {
    await api(
      editando ? "/" + encodeURIComponent(editando) : "",
      editando ? "PATCH" : "POST",
      datos,
    );
    formulario.hidden = true;
    try {
      await cargar();
    } catch {
      mensaje.textContent =
        "Producto guardado. Recarga para consultar el catálogo.";
    }
  } catch (e) {
    alert(e.message);
  } finally {
    ocupado = false;
    $("btn-guardar-producto").disabled = false;
  }
});
onAuthStateChanged(auth, async (usuario) => {
  autorizado = false;
  catalogo = null;
  pagina.hidden = true;
  lista.replaceChildren();
  formulario.hidden = true;
  editorCategoria.hidden = true;
  $("btn-agregar-producto").disabled = true;
  if (!usuario) return window.location.replace("login.html");
  try {
    const perfil = await getDoc(doc(db, "usuarios", usuario.uid));
    if (
      !perfil.exists() ||
      perfil.data().activo !== true ||
      !["dueno", "trabajador"].includes(perfil.data().rol)
    ) {
      await signOut(auth);
      return window.location.replace("login.html");
    }
    if (auth.currentUser?.uid !== usuario.uid) return;
    autorizado = true;
    pagina.hidden = false;
    await cargar();
  } catch (e) {
    if (!autorizado) return window.location.replace("login.html");
    mensaje.textContent = "No se pudo consultar el catálogo: " + e.message;
  }
});