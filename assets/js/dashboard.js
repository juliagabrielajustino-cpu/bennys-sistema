import {
    iniciarSistema,
    configurarMenu,
    configurarLogout
} from "./app.js";

import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

import {
    collection,
    deleteDoc,
    doc,
    getDoc,
    onSnapshot,
    serverTimestamp,
    writeBatch
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";


/* ELEMENTOS DA PÁGINA */

const nomeUsuario = document.getElementById("nomeUsuario");
const nomeMenu = document.getElementById("nomeMenu");

const emailUsuario = document.getElementById("emailUsuario");
const emailMenu = document.getElementById("emailMenu");

const cargoUsuario = document.getElementById("cargoUsuario");
const dataAtual = document.getElementById("dataAtual");

const statusPonto = document.getElementById("statusPonto");
const horarioEntrada = document.getElementById("horarioEntrada");
const tempoTrabalhado = document.getElementById("tempoTrabalhado");

const botaoEntrada = document.getElementById("baterEntrada");
const botaoSaida = document.getElementById("baterSaida");
const botaoSair = document.getElementById("sair");

const mensagemPonto = document.getElementById("mensagemPonto");

const abrirMenu = document.getElementById("abrirMenu");
const menuLateral = document.getElementById("menuLateral");
const fundoMenu = document.getElementById("fundoMenu");

const elementosAdmin = document.querySelectorAll(".somente-admin");


/* ESTADO DO SISTEMA */

let usuarioAtual = null;
let pontoAtual = null;
let intervaloTempo = null;
let cancelarObservadorPonto = null;


/* FUNÇÕES AUXILIARES */

function mostrarMensagem(texto, tipo = "") {
    mensagemPonto.textContent = texto;
    mensagemPonto.className = "mensagem";

    if (tipo) {
        mensagemPonto.classList.add(tipo);
    }
}


function formatarDataAtual() {
    const agora = new Date();

    dataAtual.textContent = agora.toLocaleDateString(
        "pt-BR",
        {
            weekday: "long",
            day: "2-digit",
            month: "long",
            year: "numeric"
        }
    );
}


function formatarHorario(data) {
    return data.toLocaleTimeString(
        "pt-BR",
        {
            hour: "2-digit",
            minute: "2-digit"
        }
    );
}


function formatarDuracao(totalMinutos) {
    const minutosSeguros = Math.max(
        0,
        Math.floor(totalMinutos)
    );

    const horas = Math.floor(minutosSeguros / 60);
    const minutos = minutosSeguros % 60;

    return (
        String(horas).padStart(2, "0") +
        "h" +
        String(minutos).padStart(2, "0") +
        "min"
    );
}


function obterNomePeloEmail(email) {
    if (!email) {
        return "Funcionário";
    }

    const parteInicial = email.split("@")[0];

    return parteInicial
        .replace(/[._-]+/g, " ")
        .replace(/\b\w/g, (letra) => letra.toUpperCase());
}


function converterTimestampEmData(timestamp) {
    if (!timestamp) {
        return null;
    }

    if (typeof timestamp.toDate === "function") {
        return timestamp.toDate();
    }

    return new Date(timestamp);
}


/* MENU NO CELULAR */

function abrirOuFecharMenu() {
    menuLateral.classList.toggle("aberto");
    fundoMenu.classList.toggle("ativo");
}


function fecharMenu() {
    menuLateral.classList.remove("aberto");
    fundoMenu.classList.remove("ativo");
}


abrirMenu.addEventListener("click", abrirOuFecharMenu);
fundoMenu.addEventListener("click", fecharMenu);


/* PERFIL DO FUNCIONÁRIO */

async function carregarPerfil(usuario) {
    const nomePadrao = obterNomePeloEmail(usuario.email);

    nomeUsuario.textContent = nomePadrao;
    nomeMenu.textContent = nomePadrao;

    emailUsuario.textContent = usuario.email || "Sem e-mail";
    emailMenu.textContent = usuario.email || "Sem e-mail";

    cargoUsuario.textContent = "Funcionário";

    elementosAdmin.forEach((elemento) => {
        elemento.style.display = "none";
    });

    try {
        const referenciaUsuario = doc(
            db,
            "usuarios",
            usuario.uid
        );

        const documentoUsuario = await getDoc(
            referenciaUsuario
        );

        if (!documentoUsuario.exists()) {
            return;
        }

        const dados = documentoUsuario.data();

        const nome = dados.nome || nomePadrao;
        const cargo = dados.cargo || "Funcionário";

        nomeUsuario.textContent = nome;
        nomeMenu.textContent = nome;
        cargoUsuario.textContent = cargo;

        const cargoNormalizado = cargo
            .toString()
            .trim()
            .toLowerCase();

        const administrador =
            cargoNormalizado === "administrador" ||
            cargoNormalizado === "admin" ||
            cargoNormalizado === "dono";

        if (administrador) {
            elementosAdmin.forEach((elemento) => {
                elemento.style.display = "flex";
            });
        }

    } catch (erro) {
        console.error(
            "Não foi possível carregar o perfil:",
            erro
        );
    }
}


/* TEMPO TRABALHADO */

function pararContador() {
    if (intervaloTempo) {
        clearInterval(intervaloTempo);
        intervaloTempo = null;
    }
}


function iniciarContador(dataEntrada) {
    pararContador();

    function atualizar() {
        const agora = new Date();

        const diferencaMilissegundos =
            agora.getTime() - dataEntrada.getTime();

        const totalMinutos =
            diferencaMilissegundos / 60000;

        tempoTrabalhado.textContent =
            formatarDuracao(totalMinutos);
    }

    atualizar();

    intervaloTempo = setInterval(
        atualizar,
        1000
    );
}


/* INTERFACE DO PONTO */

function mostrarForaDeServico() {
    pontoAtual = null;

    statusPonto.textContent = "Fora de serviço";
    statusPonto.className = "status fora";

    horarioEntrada.textContent = "—";
    tempoTrabalhado.textContent = "00h00min";

    botaoEntrada.disabled = false;
    botaoSaida.disabled = true;

    pararContador();
}


function mostrarEmServico(dadosPonto) {
    pontoAtual = dadosPonto;

    statusPonto.textContent = "Em serviço";
    statusPonto.className = "status em";

    botaoEntrada.disabled = true;
    botaoSaida.disabled = false;

    const dataEntrada = converterTimestampEmData(
        dadosPonto.entrada
    );

    if (!dataEntrada) {
        horarioEntrada.textContent = "Registrando...";
        tempoTrabalhado.textContent = "00h00min";
        return;
    }

    horarioEntrada.textContent =
        formatarHorario(dataEntrada);

    iniciarContador(dataEntrada);
}


/* OBSERVAR O PONTO ATUAL */

function observarPontoAtual(usuario) {
    if (cancelarObservadorPonto) {
        cancelarObservadorPonto();
    }

    const referenciaPontoAtivo = doc(
        db,
        "pontos_ativos",
        usuario.uid
    );

    cancelarObservadorPonto = onSnapshot(
        referenciaPontoAtivo,

        (documento) => {
            if (documento.exists()) {
                mostrarEmServico(documento.data());
            } else {
                mostrarForaDeServico();
            }
        },

        (erro) => {
            console.error(
                "Erro ao consultar o ponto:",
                erro
            );

            mostrarMensagem(
                "Não foi possível consultar o ponto.",
                "erro"
            );
        }
    );
}


/* BATER ENTRADA */

async function baterEntrada() {
    if (!usuarioAtual) {
        return;
    }

    botaoEntrada.disabled = true;
    mostrarMensagem("Registrando entrada...");

    try {
        const referenciaPontoAtivo = doc(
            db,
            "pontos_ativos",
            usuarioAtual.uid
        );

        const pontoExistente = await getDoc(
            referenciaPontoAtivo
        );

        if (pontoExistente.exists()) {
            mostrarMensagem(
                "Você já possui uma entrada aberta.",
                "erro"
            );

            botaoSaida.disabled = false;
            return;
        }

        const referenciaHistorico = doc(
            collection(db, "pontos")
        );

        const lote = writeBatch(db);

        lote.set(referenciaHistorico, {
            usuarioId: usuarioAtual.uid,
            email: usuarioAtual.email || "",
            entrada: serverTimestamp(),
            saida: null,
            totalMinutos: null,
            status: "aberto"
        });

        lote.set(referenciaPontoAtivo, {
            pontoId: referenciaHistorico.id,
            usuarioId: usuarioAtual.uid,
            email: usuarioAtual.email || "",
            entrada: serverTimestamp(),
            status: "aberto"
        });

        await lote.commit();

        mostrarMensagem(
            "Entrada registrada com sucesso.",
            "sucesso"
        );

    } catch (erro) {
        console.error(
            "Erro ao bater entrada:",
            erro
        );

        mostrarMensagem(
            "Não foi possível registrar a entrada. Confira as regras do Firestore.",
            "erro"
        );

        botaoEntrada.disabled = false;
    }
}


/* BATER SAÍDA */

async function baterSaida() {
    if (!usuarioAtual) {
        return;
    }

    botaoSaida.disabled = true;
    mostrarMensagem("Registrando saída...");

    try {
        const referenciaPontoAtivo = doc(
            db,
            "pontos_ativos",
            usuarioAtual.uid
        );

        const documentoPontoAtivo = await getDoc(
            referenciaPontoAtivo
        );

        if (!documentoPontoAtivo.exists()) {
            mostrarMensagem(
                "Nenhuma entrada aberta foi encontrada.",
                "erro"
            );

            mostrarForaDeServico();
            return;
        }

        const dadosAtivos = documentoPontoAtivo.data();

        const dataEntrada = converterTimestampEmData(
            dadosAtivos.entrada
        );

        if (!dataEntrada) {
            mostrarMensagem(
                "A entrada ainda está sendo processada. Aguarde alguns segundos.",
                "erro"
            );

            botaoSaida.disabled = false;
            return;
        }

        const dataSaidaLocal = new Date();

        const totalMinutos = Math.max(
            0,
            Math.round(
                (
                    dataSaidaLocal.getTime() -
                    dataEntrada.getTime()
                ) / 60000
            )
        );

        const referenciaHistorico = doc(
            db,
            "pontos",
            dadosAtivos.pontoId
        );

        const lote = writeBatch(db);

        lote.update(referenciaHistorico, {
            saida: serverTimestamp(),
            totalMinutos: totalMinutos,
            status: "finalizado"
        });

        lote.delete(referenciaPontoAtivo);

        await lote.commit();

        mostrarMensagem(
            `Saída registrada. Total: ${formatarDuracao(totalMinutos)}.`,
            "sucesso"
        );

    } catch (erro) {
        console.error(
            "Erro ao bater saída:",
            erro
        );

        mostrarMensagem(
            "Não foi possível registrar a saída.",
            "erro"
        );

        botaoSaida.disabled = false;
    }
}


/* LOGOUT */

async function sairDaConta() {
    try {
        await signOut(auth);

        window.location.href = "../index.html";

    } catch (erro) {
        console.error("Erro ao sair:", erro);

        mostrarMensagem(
            "Não foi possível sair da conta.",
            "erro"
        );
    }
}


/* EVENTOS */

botaoEntrada.addEventListener(
    "click",
    baterEntrada
);

botaoSaida.addEventListener(
    "click",
    baterSaida
);

botaoSair.addEventListener(
    "click",
    sairDaConta
);


/* PROTEGER A PÁGINA */

onAuthStateChanged(auth, async (usuario) => {
    if (!usuario) {
        window.location.href = "../index.html";
        return;
    }

    usuarioAtual = usuario;

    formatarDataAtual();
    await carregarPerfil(usuario);
    observarPontoAtual(usuario);
});
