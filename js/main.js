import * as UI from './ui.js';
import * as API from './api.js';
import * as State from './state.js';
import { applyTheme, toISODateString } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {

    let historyCurrentPage = 1;
    let historyFilters = { 
        mes: new Date().toISOString().slice(0, 7), // Padrão para o mês atual
        pesquisa: '' 
    };
    let billsCurrentPage = 1;
    let billsFilters = { mes: 'todos', pesquisa: '' };

    async function reloadStateAndRender() {
        try {
            const data = await API.fetchData();
            State.setState(data);
            UI.renderAllComponents({ history: historyFilters, bills: billsFilters });
        } catch (error) {
            UI.showToast(error.message, 'error');
        }
    }

    // --- AÇÕES (Salvar, Deletar, etc.) ---
    async function salvarConta(e) { /* ... (código anterior sem alterações) ... */ }
    async function deletarConta(id) { /* ... (código anterior sem alterações) ... */ }
    async function confirmarPagamento(e) { /* ... (código anterior sem alterações) ... */ }
    async function salvarTransacaoUnificada(e) { /* ... (código anterior sem alterações) ... */ }
    async function deletarLancamento(id, compraId) { /* ... (código anterior sem alterações) ... */ }
    async function deletarTransacao(id) { /* ... (código anterior sem alterações) ... */ }

    // --- LISTENERS DE EVENTOS ---
    function setupEventListeners() {
        document.getElementById('theme-switcher').addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            applyTheme(current === 'light' ? 'dark' : 'light');
        });

        document.getElementById('btn-add-account').addEventListener('click', () => {
            UI.openModal(UI.getAccountModalContent());
        });

        document.body.addEventListener('click', e => {
            if (e.target.matches('#modal-container, #modal-close-btn, .btn-close')) {
                UI.closeModal();
            }
            const target = e.target.closest('[data-action]');
            if (!target) return;
            const action = target.dataset.action;
            const id = parseInt(target.dataset.id);
            const compraId = parseInt(target.dataset.compraId);

            switch (action) {
                case 'editar-conta': UI.openModal(UI.getAccountModalContent(id)); break;
                case 'deletar-conta': deletarConta(id); break;
                case 'ver-fatura': UI.showToast('Função "Ver Fatura" não implementada.', 'error'); break;
                case 'pagar-conta': UI.openModal(UI.getPayBillModalContent(id)); break;
                case 'editar-lancamento': UI.openModal(UI.getBillModalContent(id)); break;
                case 'deletar-lancamento': deletarLancamento(id, compraId); break;
                case 'recriar-compra-parcelada':
                    const compra = State.getState().comprasParceladas.find(c => c.id === id);
                    if (compra) UI.openModal(UI.getInstallmentPurchaseModalContent(compra));
                    break;
                case 'editar-transacao': UI.openModal(UI.getTransactionModalContent(id)); break;
                case 'deletar-transacao': deletarTransacao(id); break;
            }
        });

        document.body.addEventListener('change', e => {
            if (e.target.id === 'tipo-compra') {
                // ... (lógica anterior sem alterações)
            }
            if (e.target.id === 'history-month-filter') {
                historyFilters.mes = e.target.value;
                historyCurrentPage = 1;
                UI.renderHistoricoTransacoes(historyCurrentPage, historyFilters);
            }
            if (e.target.id === 'bills-month-filter') {
                billsFilters.mes = e.target.value;
                billsCurrentPage = 1;
                UI.renderLancamentosFuturos(billsCurrentPage, billsFilters);
            }
        });
        
        document.body.addEventListener('input', e => {
            if (e.target.id === 'history-search-input') {
                historyFilters.pesquisa = e.target.value;
                historyCurrentPage = 1;
                UI.renderHistoricoTransacoes(historyCurrentPage, historyFilters);
            }
            if (e.target.id === 'bills-search-input') {
                billsFilters.pesquisa = e.target.value;
                billsCurrentPage = 1;
                UI.renderLancamentosFuturos(billsCurrentPage, billsFilters);
            }
        });

        document.body.addEventListener('submit', e => {
            e.preventDefault();
            switch (e.target.id) {
                case 'form-conta': salvarConta(e); break;
                case 'form-transacao-unificada': salvarTransacaoUnificada(e); break;
                case 'form-pagamento': confirmarPagamento(e); break;
            }
        });
    }

    async function initializeApp() {
        UI.showToast('Carregando dados...');
        try {
            const data = await API.fetchData();
            State.setState(data);
            UI.renderAllComponents({ history: historyFilters, bills: billsFilters });
        } catch (error) {
            UI.showToast(error.message, 'error');
            console.error("Falha na inicialização:", error);
        }
    }

    applyTheme(localStorage.getItem('confin-theme') || 'light');
    setupEventListeners();
    initializeApp();
});
