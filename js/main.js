// js/main.js

// A linha mais importante: importa TODAS as funções de 'ui.js' para um objeto chamado 'UI'
import * as UI from './ui.js';
import { fetchData, salvarDados, deletarDados, salvarMultiplosLancamentos, deletarLancamentosPorCompraId } from './api.js';
import { setState, getState } from './state.js';
import { applyTheme, toISODateString } from './utils.js';

// --- AÇÕES ---
async function salvarConta(event) {
    event.preventDefault();
    const form = event.target;
    const button = form.querySelector('button[type="submit"]');
    UI.setLoadingState(button, true);

    try {
        const id = form.dataset.id;
        const formData = new FormData(form);
        const dados = Object.fromEntries(formData.entries());
        
        const savedAccount = await salvarDados('contas', dados, id);
        
        const { contas } = getState();
        const newContas = id ? contas.map(c => c.id == savedAccount.id ? savedAccount : c) : [...contas, savedAccount];
        setState({ contas: newContas.sort((a,b) => a.nome.localeCompare(b.nome)) });

        UI.renderContas();
        UI.renderFormTransacaoRapida();
        UI.closeModal();
        UI.showToast(`Conta ${id ? 'atualizada' : 'criada'} com sucesso!`);
    } catch (error) {
        UI.showToast(`Erro: ${error.message}`, 'error');
    } finally {
        UI.setLoadingState(button, false);
    }
}

async function deletarConta(id) { /* Código completo da função aqui... */ }

async function salvarLancamentoFuturo(event) { /* Código completo da função aqui... */ }

async function deletarLancamento(id, compraId) { /* Código completo da função aqui... */ }

async function confirmarPagamento(event) { /* Código completo da função aqui... */ }

async function salvarTransacaoRapida(event) { /* Código completo da função aqui... */ }

async function deletarTransacao(id) { /* Código completo da função aqui... */ }

async function salvarCompraParcelada(event) { /* Código completo da função aqui... */ }


// --- EVENT LISTENERS ---
function setupEventListeners() {
    document.getElementById('theme-switcher').addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        applyTheme(currentTheme === 'light' ? 'dark' : 'light');
    });

    document.getElementById('main-tab-buttons').addEventListener('click', (e) => {
        if (e.target.classList.contains('tab-button')) {
            UI.switchTab(e.target, '.card:has(#main-tab-buttons)');
        }
    });

    document.getElementById('dashboard-tab-buttons').addEventListener('click', (e) => {
        if (e.target.classList.contains('tab-button')) {
             UI.switchTab(e.target, '.card:has(#dashboard-tab-buttons)');
        }
    });

    document.getElementById('form-transacao-rapida').addEventListener('submit', salvarTransacaoRapida);
    
    document.getElementById('btn-add-account').addEventListener('click', () => {
        UI.openModal(UI.getAccountModalContent());
        document.getElementById('form-conta').addEventListener('submit', salvarConta);
    });
    
    document.getElementById('btn-open-bill').addEventListener('click', () => {
        UI.openModal(UI.getBillModalContent());
        document.getElementById('form-lancamento').addEventListener('submit', salvarLancamentoFuturo);
    });

    document.getElementById('btn-open-installment').addEventListener('click', () => {
        UI.openModal(UI.getInstallmentPurchaseModalContent());
        document.getElementById('form-compra-parcelada').addEventListener('submit', salvarCompraParcelada);
    });

    document.body.addEventListener('click', (e) => {
        const target = e.target.closest('[data-action]');
        if (!target) return;
        const action = target.dataset.action;
        const id = parseInt(target.dataset.id);

        switch(action) {
            case 'editar-conta':
                UI.openModal(UI.getAccountModalContent(id));
                document.getElementById('form-conta').addEventListener('submit', salvarConta);
                break;
            case 'deletar-conta':
                deletarConta(id);
                break;
            // ... outros cases
            case 'toggle-lancamentos':
                const group = target.closest('.monthly-group');
                group.classList.toggle('open');
                const content = group.querySelector('.monthly-content');
                if (group.classList.contains('open')) {
                    content.style.maxHeight = content.scrollHeight + "px";
                } else {
                    content.style.maxHeight = null;
                }
                break;
        }
    });
}

// --- INICIALIZAÇÃO ---
async function initializeApp() {
    applyTheme(localStorage.getItem('confin-theme') || 'light');
    setupEventListeners();
    try {
        const initialData = await fetchData();
        setState(initialData);
        UI.renderAllComponents();
    } catch (error) {
        console.error("Erro fatal ao carregar dados:", error);
        UI.showToast(`Erro fatal ao carregar dados: ${error.message}`, 'error');
    }
}

initializeApp();
