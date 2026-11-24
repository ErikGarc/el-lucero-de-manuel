import { app, db } from './firebase-config.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js';

const auth = getAuth(app);
const API = 'https://el-lucero-pruebas-worker.eriikgow.workers.dev/api/admin/productos';
const $ = id => document.getElementById(id);
const pagina = document.querySelector('.pagina-pedidos');
const lista = $('lista-productos');
const mensaje = $('mensaje-productos');
const formulario = $('formulario-producto');
const form = $('form-producto');
const ingredientes = $('lista-ingredientes');
let editando = null;
let ocupado = false;
let autorizado = false;
pagina.hidden = true;

async function api(ruta = '', metodo = 'GET', datos) {
    const usuario = auth.currentUser;
    if (!autorizado || !usuario) throw new Error('Sesión no autorizada');
    const token = await usuario.getIdToken();
    const respuesta = await fetch(API + ruta, {
        method: metodo, cache: 'no-store',
        headers: { Authorization: `Bearer ${token}`, ...(datos ? {'Content-Type': 'application/json'} : {}) },
        ...(datos ? {body: JSON.stringify(datos)} : {})
    });
    const resultado = await respuesta.json();
    if (!respuesta.ok) throw new Error(resultado.error || `HTTP ${respuesta.status}`);
    return resultado;
}
function elemento(tipo, texto, clase) {
    const e = document.createElement(tipo);
    if (texto !== undefined) e.textContent = texto;
    if (clase) e.className = clase;
    return e;
}
function boton(texto, accion) {
    const b = elemento('button', texto, 'boton-modulo');
    b.type = 'button';
    b.addEventListener('click', () => { if (!ocupado) accion(); });
    return b;
}
function agregarIngrediente(i = {}) {
    if (ingredientes.children.length >= 40) return alert('Máximo 40 ingredientes.');
    const fila = elemento('div');
    const nombre = elemento('input');
    nombre.type = 'text'; nombre.required = true; nombre.maxLength = 80;
    nombre.placeholder = 'Nombre del ingrediente'; nombre.value = i.nombre || '';
    nombre.setAttribute('aria-label', 'Nombre del ingrediente');
    const quitar = elemento('input'); quitar.type = 'checkbox'; quitar.checked = i.sePuedeQuitar === true;
    const disponible = elemento('input'); disponible.type = 'checkbox'; disponible.checked = i.disponible !== false;
    const l1 = elemento('label'); l1.append(quitar, ' Se puede quitar');
    const l2 = elemento('label'); l2.append(disponible, ' Disponible');
    fila.append(nombre, l1, l2, boton('Quitar ingrediente', () => fila.remove()));
    ingredientes.append(fila);
}
function abrirFormulario(p = null) {
    editando = p?.id ?? null;
    form.reset(); ingredientes.replaceChildren();
    $('titulo-formulario').textContent = p ? 'Editar producto' : 'Nuevo producto';
    $('nombre-producto').value = p?.nombre ?? '';
    $('descripcion-producto').value = p?.descripcion ?? '';
    $('precio-producto').value = p?.precio ?? '';
    $('disponible-producto').checked = p?.disponible ?? true;
    (p?.ingredientes || []).forEach(agregarIngrediente);
    formulario.hidden = false;
    formulario.scrollIntoView({behavior:'smooth'});
}
async function cargar() {
    const datos = await api();
    lista.replaceChildren();
    for (const p of datos.productos) {
        const tarjeta = elemento('article', undefined, 'tarjeta-pedido');
        tarjeta.append(elemento('h3', p.nombre), elemento('p', p.descripcion || ''),
            elemento('p', `$${Number(p.precio).toFixed(2)} MXN`, 'total-pedido'),
            elemento('p', p.disponible ? '🟢 Disponible' : '🔴 No disponible'),
            elemento('p', 'Ingredientes: ' + (p.ingredientes.map(i => i.nombre).join(', ') || 'Sin ingredientes')),
            boton('Editar', () => abrirFormulario(p)),
            boton(p.disponible ? 'Desactivar' : 'Activar', () => cambiarDisponibilidad(p)));
        lista.append(tarjeta);
    }
    mensaje.textContent = `${datos.productos.length} producto(s) registrado(s)`;
    $('btn-agregar-producto').disabled = false;
}
async function cambiarDisponibilidad(p) {
    if (!confirm(`${p.disponible ? 'Desactivar' : 'Activar'} ${p.nombre}?`)) return;
    ocupado = true;
    try { await api('/' + encodeURIComponent(p.id), 'PATCH', {disponible: !p.disponible}); await cargar(); }
    catch(e) { alert(e.message); }
    finally { ocupado = false; }
}
$('btn-agregar-producto').addEventListener('click', () => { if (!ocupado) abrirFormulario(); });
$('btn-agregar-ingrediente').addEventListener('click', () => { if (!ocupado) agregarIngrediente(); });
$('btn-cancelar-producto').addEventListener('click', () => { if (!ocupado) formulario.hidden = true; });
form.addEventListener('submit', async e => {
    e.preventDefault(); if (ocupado) return;
    const datos = { nombre: $('nombre-producto').value.trim(), descripcion: $('descripcion-producto').value.trim(),
        precio: Number($('precio-producto').value), disponible: $('disponible-producto').checked,
        ingredientes: Array.from(ingredientes.children, fila => {
            const [nombre, quitar, disponible] = fila.querySelectorAll('input');
            return {nombre: nombre.value.trim(), sePuedeQuitar: quitar.checked, disponible: disponible.checked};
        }) };
    if (!confirm('¿Guardar los cambios del producto?')) return;
    ocupado = true; $('btn-guardar-producto').disabled = true;
    try {
        await api(editando ? '/' + encodeURIComponent(editando) : '', editando ? 'PATCH' : 'POST', datos);
        formulario.hidden = true;
        try { await cargar(); } catch { mensaje.textContent = 'Producto guardado. Recarga para consultar el catálogo.'; }
    } catch(e) { alert(e.message); }
    finally { ocupado = false; $('btn-guardar-producto').disabled = false; }
});
onAuthStateChanged(auth, async usuario => {
    autorizado = false; pagina.hidden = true; lista.replaceChildren(); formulario.hidden = true;
    if (!usuario) return window.location.replace('login.html');
    try {
        const perfil = await getDoc(doc(db, 'usuarios', usuario.uid));
        if (!perfil.exists() || perfil.data().activo !== true || !['dueno','trabajador'].includes(perfil.data().rol)) {
            await signOut(auth); return window.location.replace('login.html');
        }
        if (auth.currentUser?.uid !== usuario.uid) return;
        autorizado = true; pagina.hidden = false;
        await cargar();
    } catch(e) {
        if (!autorizado) return window.location.replace('login.html');
        mensaje.textContent = 'No se pudo consultar el catálogo: ' + e.message;
    }
});