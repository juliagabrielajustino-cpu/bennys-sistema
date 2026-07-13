import {
    iniciarSistema,
    configurarMenu,
    configurarLogout
} from "./app.js";

import {
    db
} from "./firebase.js";

import {
    collection,
    doc,
    getDoc,
    getDocs,
    updateDoc
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";


/* ELEMENTOS */

const listaFuncionarios =
    document.getElementById("listaFuncionarios");

const botaoAtualizar =
    document.getElementById("atualizar");


/* INICIAR SISTEMA */

const usuarioAtual = await iniciarSistema();

configurarMenu();
configurarLogout();


/* FUNÇÕES AUXILIARES */

function normalizarCargo(cargo) {
    return String(cargo || "funcionário")
        .trim()
        .toLowerCase();
}


function cargoBonito(cargo) {
    const cargoNormalizado = normalizarCargo(cargo);

    const nomes = {
        administrador: "Administrador",
        admin: "Administrador",
        dono: "Dono",
        gerente: "Gerente",
        mecanico: "Mecânico",
        mecânico: "Mecânico",
        funcionario: "Funcionário",
        funcionário: "Funcionário"
    };

    return nomes[cargoNormalizado] || cargo;
}


function usuarioEhAdministrador(cargo) {
    const cargoNormalizado = normalizarCargo(cargo);

    return (
        cargoNormalizado === "administrador" ||
        cargoNormalizado === "admin" ||
        cargoNormalizado === "dono"
    );
}


/* VERIFICAR PERMISSÃO */

async function verificarAdministrador() {
    try {
        const referencia = doc(
            db,
            "usuarios",
            usuarioAtual.uid
        );

        const documento = await getDoc(referencia);

        if (!documento.exists()) {
            window.location.href = "dashboard.html";
            return false;
        }

        const dados = documento.data();

        if (
            !usuarioEhAdministrador(dados.cargo) ||
            dados.ativo === false
        ) {
            alert(
                "Você não tem permissão para acessar esta página."
            );

            window.location.href = "dashboard.html";
            return false;
        }

        return true;

    } catch (erro) {
        console.error(
            "Erro ao verificar administrador:",
            erro
        );

        window.location.href = "dashboard.html";
        return false;
    }
}


/* CRIAR CARTÃO DO FUNCIONÁRIO */

function criarFuncionarioHTML(funcionario) {
    const cargo = cargoBonito(funcionario.cargo);

    const classeCargo =
        usuarioEhAdministrador(funcionario.cargo)
            ? "admin"
            : "funcionario";

    const estaAtivo =
        funcionario.ativo !== false;

    const classeAtivo =
        estaAtivo ? "ativo" : "inativo";

    const textoAtivo =
        estaAtivo ? "Ativo" : "Inativo";

    const textoBotao =
        estaAtivo ? "Desativar" : "Ativar";

    return `
        <article class="funcionario">

            <div class="info">

                <h3>
                    ${funcionario.nome || "Sem nome"}
                </h3>

                <p>
                    ${funcionario.email || "Sem e-mail"}
                </p>

                <div class="badges">

                    <span class="badge ${classeCargo}">
                        ${cargo}
                    </span>

                    <span class="badge ${classeAtivo}">
                        ${textoAtivo}
                    </span>

                </div>

            </div>

            <div class="acoes">

                <button
                    type="button"
                    class="editar"
                    data-id="${funcionario.id}"
                >
                    Editar cargo
                </button>

                <button
                    type="button"
                    class="desativar"
                    data-id="${funcionario.id}"
                    data-ativo="${estaAtivo}"
                >
                    ${textoBotao}
                </button>

            </div>

        </article>
    `;
}


/* CARREGAR FUNCIONÁRIOS */

async function carregarFuncionarios() {
    listaFuncionarios.innerHTML = `
        <p class="carregando">
            Carregando funcionários...
        </p>
    `;

    botaoAtualizar.disabled = true;
    botaoAtualizar.textContent = "Atualizando...";

    try {
        const resultado = await getDocs(
            collection(db, "usuarios")
        );

        const funcionarios = resultado.docs.map(
            (documento) => ({
                id: documento.id,
                ...documento.data()
            })
        );

        funcionarios.sort((a, b) => {
            const nomeA = String(a.nome || "");
            const nomeB = String(b.nome || "");

            return nomeA.localeCompare(
                nomeB,
                "pt-BR"
            );
        });

        if (funcionarios.length === 0) {
            listaFuncionarios.innerHTML = `
                <p class="carregando">
                    Nenhum funcionário cadastrado.
                </p>
            `;

            return;
        }

        listaFuncionarios.innerHTML =
            funcionarios
                .map(criarFuncionarioHTML)
                .join("");

        configurarBotoes();

    } catch (erro) {
        console.error(
            "Erro ao carregar funcionários:",
            erro
        );

        listaFuncionarios.innerHTML = `
            <p class="carregando">
                Não foi possível carregar os funcionários.
            </p>
        `;

    } finally {
        botaoAtualizar.disabled = false;
        botaoAtualizar.textContent = "Atualizar";
    }
}


/* EDITAR CARGO */

async function editarCargo(usuarioId) {
    const novoCargo = prompt(
        "Digite o novo cargo:\n\n" +
        "administrador\n" +
        "gerente\n" +
        "mecânico\n" +
        "funcionário"
    );

    if (!novoCargo) {
        return;
    }

    const cargoNormalizado =
        normalizarCargo(novoCargo);

    const cargosPermitidos = [
        "administrador",
        "gerente",
        "mecanico",
        "mecânico",
        "funcionario",
        "funcionário"
    ];

    if (!cargosPermitidos.includes(cargoNormalizado)) {
        alert("Cargo inválido.");
        return;
    }

    try {
        await updateDoc(
            doc(db, "usuarios", usuarioId),
            {
                cargo: cargoNormalizado
            }
        );

        alert("Cargo atualizado com sucesso.");

        await carregarFuncionarios();

    } catch (erro) {
        console.error(
            "Erro ao alterar cargo:",
            erro
        );

        alert("Não foi possível alterar o cargo.");
    }
}


/* ATIVAR OU DESATIVAR */

async function alterarStatus(
    usuarioId,
    statusAtual
) {
    if (usuarioId === usuarioAtual.uid) {
        alert(
            "Você não pode desativar sua própria conta."
        );

        return;
    }

    const novoStatus = !statusAtual;

    const confirmar = confirm(
        novoStatus
            ? "Deseja ativar este funcionário?"
            : "Deseja desativar este funcionário?"
    );

    if (!confirmar) {
        return;
    }

    try {
        await updateDoc(
            doc(db, "usuarios", usuarioId),
            {
                ativo: novoStatus
            }
        );

        alert(
            novoStatus
                ? "Funcionário ativado."
                : "Funcionário desativado."
        );

        await carregarFuncionarios();

    } catch (erro) {
        console.error(
            "Erro ao alterar status:",
            erro
        );

        alert(
            "Não foi possível alterar o status."
        );
    }
}


/* CONFIGURAR BOTÕES DOS CARTÕES */

function configurarBotoes() {
    document
        .querySelectorAll(".editar")
        .forEach((botao) => {
            botao.addEventListener(
                "click",
                () => {
                    editarCargo(
                        botao.dataset.id
                    );
                }
            );
        });

    document
        .querySelectorAll(".desativar")
        .forEach((botao) => {
            botao.addEventListener(
                "click",
                () => {
                    const statusAtual =
                        botao.dataset.ativo === "true";

                    alterarStatus(
                        botao.dataset.id,
                        statusAtual
                    );
                }
            );
        });
}


/* EVENTOS */

botaoAtualizar.addEventListener(
    "click",
    carregarFuncionarios
);


/* INICIAR PÁGINA */

const permitido =
    await verificarAdministrador();

if (permitido) {
    await carregarFuncionarios();
}
