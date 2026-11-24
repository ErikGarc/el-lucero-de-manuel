
import { initializeApp } from
    "https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js";

import { getFirestore } from
    "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";

// Configuración de El Lucero de Manuel

const firebaseConfig = {
    apiKey: "AIzaSyBXnK7mq50CiAnXXmm5JfXez21sHPxMN6g",
    authDomain: "ellucerodemanuel.firebaseapp.com",
    projectId: "ellucerodemanuel",
    storageBucket: "ellucerodemanuel.firebasestorage.app",
    messagingSenderId: "347268862971",
    appId: "1:347268862971:web:21ad42261208d390baf15e"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);

// Preparar Firestore
const db = getFirestore(app);

console.log("Firebase inicializado correctamente");

export { app, db };
