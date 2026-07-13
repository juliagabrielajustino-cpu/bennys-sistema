import {
    auth,
    db
} from "./firebase.js";

import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

import {
    collection,
    doc,
    getDoc,
    getDocs,
    onSnapshot,
    query,
    serverTimestamp,
    where,
    writeBatch
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";


/* ELEMENTOS DA PÁGINA */

const nomeMenu = document.getElementById("nomeMenu");
const emailMenu = document.getElementById("emailMenu");

const dataAtual = document.getElementById("dataAtual");
const relogio = document.getElementById("relogio");

const statusPonto = document.getElementById("statusPonto");
const horarioEntrada = document.getElementById("horarioEntrada");
const tempoTrabalhado = document.getElementById("tempoTrabalhado");

const botaoEntrada = document.getElementById("baterEntrada");
const botaoSaida = document.getElementById("baterSaida");
const botaoSair = document.getElementById("sair");

const mensagemPonto = document.getElementById("mensagemPonto");
const listaRegistros = document.getElementById("listaRegistros");

const abrirMenu = document.getElementById("abrirMenu");
const menuLateral = document.getElementById("menuLateral");
const fundoMenu = document.getElementById("fundoMenu");

const elementosAdmin =
    document.querySelectorAll(".somente-admin");


/* ESTADO */

let usuarioAtual = null;
let pontoAtual = null;

let intervaloTempo = null;
let intervaloRelogio = null;
let cancelarObservadorPonto = null;


/* FUNÇÕES GERAIS */

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


function iniciarRelogio() {
    function atualizar() {
        relogio.textContent = new Date().toLocaleTimeString(
            "pt-BR",
            {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit"
            }
        );
    }

    atualizar();

    intervaloRelogio = setInterval(atualizar, 1000);
}


function formatarHorario(data) {
    if (!data) {
        return "—";
    }

    return data.toLocaleTimeString(
        "pt-BR",
        {
            hour: "2-digit",
            minute: "2-digit"
        }
    );
}


function formatarData(data) {
    if (!data) {
        return "—";
    }

    return data.toLocaleDateString(
        "pt-BR",
        {
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
        }
    );
}


function formatarDuracao(totalMinutos) {
    const minutosSeguros = Math.max(
        0,
        Math.floor(Number(totalMinutos) || 0)
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


function converterTimestampEmData(timestamp) {
    if (!timestamp) {
        return null;
    }

    if (typeof timestamp.toDate === "function") {
        return timestamp.toDate();
    }

    return new Date(timestamp);
}


function obterNomePeloEmail(email) {
    if (!email) {
        return "Funcionário";
    }

    return email
        .split("@")[0]
        .replace(/[._-]+/g, " ")
        .replace(/\b\w/g, (letra) =>
            letra.toUpperCase()
        );
}


/* MENU MOBILE */

function alternarMenu() {
    menuLateral.classList.toggle("aberto");
    fundoMenu.classList.toggle("ativo");
}


function fecharMenu() {
    menuLateral.classList.remove("aberto");
    fundoMenu.classList.remove("ativo");
}


abrirMenu.addEventListener("click", alternarMenu);
fundoMenu.addEventListener("click", fecharMenu);


/* PERFIL */

async function carregarPerfil(usuario) {
    const nomePadrao = obterNomePeloEmail(usuario.email);

    nomeMenu.textContent = nomePadrao;
    emailMenu.textContent = usuario.email || "Sem e-mail";

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

        nomeMenu.textContent =
            dados.nome || nomePadrao;

        const cargo = String(
            dados.cargo || "Funcionário"
        )
            .trim()
            .toLowerCase();

        const administrador =
            cargo === "administrador" ||
            cargo === "admin" ||
            cargo === "dono";

        if (administrador) {
            elementosAdmin.forEach((elemento) => {
                elemento.style.display = "flex";
            });
        }

    } catch (erro) {
        console.error(
            "Erro ao carregar perfil:",
            erro
        );
    }
}


/* CONTADOR DE TEMPO */

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

        const totalMinutos =
            (
                agora.getTime() -
                dataEntrada.getTime()
            ) / 60000;

        tempoTrabalhado.textContent =
            formatarDuracao(totalMinutos);
    }

    atualizar();

    intervaloTempo = setInterval(atualizar, 1000);
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


function mostrarEmServico(dados) {
    pontoAtual = dados;

    statusPonto.textContent = "Em serviço";
    statusPonto.className = "status em";

    botaoEntrada.disabled = true;
    botaoSaida.disabled = false;

    const entrada = converterTimestampEmData(
        dados.entrada
    );

    if (!entrada) {
        horarioEntrada.textContent = "Registrando...";
        tempoTrabalhado.textContent = "00h00min";
        return;
    }

    horarioEntrada.textContent =
        formatarHorario(entrada);

    iniciarContador(entrada);
}


/* OBSERVAR PONTO ATIVO */

function observarPontoAtual(usuario) {
    if (cancelarObservadorPonto) {
        cancelarObservadorPonto();
    }

    const referencia = doc(
        db,
        "pontos_ativos",
        usuario.uid
    );

    cancelarObservadorPonto = onSnapshot(
        referencia,

        (documento) => {
            if (documento.exists()) {
                mostrarEmServico(documento.data());
            } else {
                mostrarForaDeServico();
            }
        },

        (erro) => {
            console.error(
                "Erro ao consultar ponto ativo:",
                erro
            );

            mostrarMensagem(
                "Não foi possível consultar seu ponto.",
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

        const documentoExistente = await getDoc(
            referenciaPontoAtivo
        );

        if (documentoExistente.exists()) {
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

        await carregarRegistrosRecentes();

    } catch (erro) {
        console.error(
            "Erro ao registrar entrada:",
            erro
        );

        mostrarMensagem(
            "Não foi possível registrar a entrada.",
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

        const documentoAtivo = await getDoc(
            referenciaPontoAtivo
        );

        if (!documentoAtivo.exists()) {
            mostrarMensagem(
                "Nenhuma entrada aberta foi encontrada.",
                "erro"
            );

            mostrarForaDeServico();
            return;
        }

        const dados = documentoAtivo.data();

        const entrada = converterTimestampEmData(
            dados.entrada
        );

        if (!entrada) {
            mostrarMensagem(
                "A entrada ainda está sendo processada. Aguarde alguns segundos.",
                "erro"
            );

            botaoSaida.disabled = false;
            return;
        }

        const saidaLocal = new Date();

        const totalMinutos = Math.max(
            0,
            Math.round(
                (
                    saidaLocal.getTime() -
                    entrada.getTime()
                ) / 60000
            )
        );

        const referenciaHistorico = doc(
            db,
            "pontos",
            dados.pontoId
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

        await carregarRegistrosRecentes();

    } catch (erro) {
        console.error(
            "Erro ao registrar saída:",
            erro
        );

        mostrarMensagem(
            "Não foi possível registrar a saída.",
            "erro"
        );

        botaoSaida.disabled = false;
    }
}


/* REGISTROS RECENTES */

function criarRegistroHTML(dados) {
    const entrada = converterTimestampEmData(
        dados.entrada
    );

    const saida = converterTimestampEmData(
        dados.saida
    );

    const duracao =
        dados.status === "aberto"
            ? "Em andamento"
            : formatarDuracao(dados.totalMinutos);

    return `
        <article class="registro">

            <div>
                <span>Data</span>
                <strong>
                    ${formatarData(entrada)}
                </strong>
            </div>

            <div>
                <span>Entrada</span>
                <strong>
                    ${formatarHorario(entrada)}
                </strong>
            </div>

            <div>
                <span>Saída</span>
                <strong>
                    ${formatarHorario(saida)}
                </strong>
            </div>

            <div>
                <span>Total</span>
                <strong>
                    ${duracao}
                </strong>
            </div>

        </article>
    `;
}


async function carregarRegistrosRecentes() {
    if (!usuarioAtual) {
        return;
    }

    listaRegistros.innerHTML = `
        <p class="carregando">
            Carregando registros...
        </p>
    `;

    try {
        const consulta = query(
            collection(db, "pontos"),
            where(
                "usuarioId",
                "==",
                usuarioAtual.uid
            )
        );

        const resultado = await getDocs(consulta);

        const registros = resultado.docs.map(
            (documento) => ({
                id: documento.id,
                ...documento.data()
            })
        );

        registros.sort((a, b) => {
            const dataA =
                converterTimestampEmData(a.entrada);

            const dataB =
                converterTimestampEmData(b.entrada);

            return (
                (dataB?.getTime() || 0) -
                (dataA?.getTime() || 0)
            );
        });

        const recentes = registros.slice(0, 5);

        if (recentes.length === 0) {
            listaRegistros.innerHTML = `
                <p class="sem-registros">
                    Você ainda não possui registros.
                </p>
            `;

            return;
        }

        listaRegistros.innerHTML =
            recentes
                .map(criarRegistroHTML)
                .join("");

    } catch (erro) {
        console.error(
            "Erro ao carregar registros:",
            erro
        );

        listaRegistros.innerHTML = `
            <p class="sem-registros">
                Não foi possível carregar os registros.
            </p>
        `;
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


/* PROTEGER E INICIAR A PÁGINA */

onAuthStateChanged(auth, async (usuario) => {
    if (!usuario) {
        window.location.href = "../index.html";
        return;
    }

    usuarioAtual = usuario;

    formatarDataAtual();
    iniciarRelogio();

    await carregarPerfil(usuario);

    observarPontoAtual(usuario);

    await carregarRegistrosRecentes();
});


window.addEventListener("beforeunload", () => {
    pararContador();

    if (intervaloRelogio) {
        clearInterval(intervaloRelogio);
    }

    if (cancelarObservadorPonto) {
        cancelarObservadorPonto();
    }
});
