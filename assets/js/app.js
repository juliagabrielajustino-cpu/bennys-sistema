import { auth, db } from "./firebase.js";

import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

import {
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

export async function iniciarSistema() {

    return new Promise((resolve) => {

        onAuthStateChanged(auth, async (usuario) => {

            if (!usuario) {
                window.location.href = "../index.html";
                return;
            }

            const nomeMenu = document.getElementById("nomeMenu");
            const emailMenu = document.getElementById("emailMenu");

            if (nomeMenu) {
                nomeMenu.textContent = usuario.email.split("@")[0];
            }

            if (emailMenu) {
                emailMenu.textContent = usuario.email;
            }

            try {

                const docRef = doc(db, "usuarios", usuario.uid);
                const snap = await getDoc(docRef);

                if (snap.exists()) {

                    const dados = snap.data();

                    if (nomeMenu) {
                        nomeMenu.textContent = dados.nome;
                    }

                    document
                        .querySelectorAll(".somente-admin")
                        .forEach(item => {

                            item.style.display =
                                dados.cargo === "administrador"
                                    ? "flex"
                                    : "none";

                        });

                }

            } catch (e) {

                console.error(e);

            }

            resolve(usuario);

        });

    });

}

export function configurarMenu() {

    const abrir = document.getElementById("abrirMenu");
    const menu = document.getElementById("menuLateral");
    const fundo = document.getElementById("fundoMenu");

    if (abrir) {

        abrir.onclick = () => {

            menu.classList.toggle("aberto");
            fundo.classList.toggle("ativo");

        };

    }

    if (fundo) {

        fundo.onclick = () => {

            menu.classList.remove("aberto");
            fundo.classList.remove("ativo");

        };

    }

}

export function configurarLogout() {

    const sair = document.getElementById("sair");

    if (!sair) return;

    sair.onclick = async () => {

        await signOut(auth);

        window.location.href = "../index.html";

    };

}
