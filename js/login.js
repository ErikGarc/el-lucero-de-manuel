
import { app, db } from "./firebase-config.js";

import {
    getAuth,
    signInWithEmailAndPassword,
    signOut
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";

import {
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";

// Inicializar Authentication
const auth = getAuth(app);

// Elementos del formulario
const formularioLogin =
    document.getElementById("formulario-login");

const correoLogin =
    document.getElementById("correo-login");

const passwordLogin =
    document.getElementById("password-login");

const mensajeLogin =
    document.getElementById("mensaje-login");

const botonLogin =
    formularioLogin.querySelector("button[type='submit']");

formularioLogin.addEventListener("submit", async (evento) => {

    evento.preventDefault();

    const correo = correoLogin.value.trim();
    const password = passwordLogin.value;

    mensajeLogin.textContent = "";
    botonLogin.disabled = true;
    botonLogin.textContent = "Verificando...";

    try {

        // 1. Iniciar sesión con Firebase Authentication
        const credencial = await signInWithEmailAndPassword(
            auth,
            correo,
            password
        );

        const usuario = credencial.user;

        // 2. Buscar el perfil usando su UID
        const referenciaUsuario = doc(
            db,
            "usuarios",
            usuario.uid
        );

        const documentoUsuario =
            await getDoc(referenciaUsuario);

        // 3. Comprobar que exista el perfil
        if (!documentoUsuario.exists()) {

            await signOut(auth);

            mensajeLogin.style.color = "#ff6b6b";
            mensajeLogin.textContent =
                "Tu cuenta no tiene un perfil autorizado.";

            return;
        }

        // 4. Obtener los datos del perfil
        const datosUsuario = documentoUsuario.data();

        // 5. Comprobar que esté activo
        if (datosUsuario.activo !== true) {

            await signOut(auth);

            mensajeLogin.style.color = "#ff6b6b";
            mensajeLogin.textContent =
                "Tu cuenta se encuentra desactivada.";

            return;
        }

        // 6. Identificar el rol
        if (datosUsuario.rol === "dueno") {

            mensajeLogin.style.color = "#4ade80";
            mensajeLogin.textContent =
                "¡Bienvenido, administrador!";

            console.log("Rol identificado: dueño");
            window.location.replace("admin.html");

        } else if (datosUsuario.rol === "trabajador") {

            mensajeLogin.style.color = "#4ade80";
            mensajeLogin.textContent =
                "¡Bienvenido, trabajador!";

            console.log("Rol identificado: trabajador");
            window.location.replace("admin.html");

        } else {

            await signOut(auth);

            mensajeLogin.style.color = "#ff6b6b";
            mensajeLogin.textContent =
                "Tu cuenta no tiene un rol válido.";
        }

        // Limpiar contraseña del formulario
        passwordLogin.value = "";

    } catch (error) {

        mensajeLogin.style.color = "#ff6b6b";

        if (
            error.code === "auth/invalid-credential" ||
            error.code === "auth/wrong-password" ||
            error.code === "auth/user-not-found"
        ) {

            mensajeLogin.textContent =
                "Correo o contraseña incorrectos.";

        } else if (error.code === "permission-denied") {

            mensajeLogin.textContent =
                "No tienes permiso para consultar tu perfil.";

        } else if (error.code === "auth/network-request-failed" ||
                   error.code === "unavailable") {

            mensajeLogin.textContent =
                "Error de conexión. Intenta nuevamente.";

        } else {

            mensajeLogin.textContent =
                "No se pudo verificar tu acceso.";

            console.error("Error:", error.code);
        }

    } finally {

        botonLogin.disabled = false;
        botonLogin.textContent = "Iniciar sesión";

    }

});
