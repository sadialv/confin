// js/ui.js

import { formatarMoeda, CATEGORIAS_PADRAO, toISODateString, CATEGORY_ICONS, HOJE } from './utils.js';
import { getState, getContaPorId, getContas } from './state.js';

let summaryChart = null;

// --- FUNÇÕES GERAIS DE UI ---

export const showToast = (message, type = 'success') => {
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => toast.remove());
    }, 3000);
};

export const setLoadingState = (button, isLoading, originalText = 'Salvar') => {
    if (!button) return;
    if (isLoading) {
        button.disabled = true;
        button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Salvando...`;
    } else {
        button.disabled = false;
        button.innerHTML = originalText;
    }
};

export const openModal = (content) => {
    const modalHTML = `<button class="modal-close-btn" id="modal-close-btn">×</button>${content}`;
    const modalContentArea = document.getElementById('modal-content-area');
    modalContentArea.innerHTML = modalHTML;
    document.getElementById('modal-container').classList.add('active');
    document.getElementById('modal-close-btn').addEventListener('click', closeModal);
};

export const closeModal = () => {
    document.getElementById('modal-container').classList.remove('active');
    document.getElementById('modal-content-area').innerHTML = '';
};

export const switchTab = (clickedButton, parentContainerSelector) => {
    const tabName = clickedButton.dataset.tab;
    const parentContainer = document.querySelector(parentContainerSelector);
    if (!parentContainer) return;

    parentContainer.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
    parentContainer.querySelectorAll('.tab-button').forEach(tb => tb.classList.remove('active'));

    const tabContent = parentContainer.querySelector(`#${tabName}`);
    if (tabContent) tabContent.classList.add('active');
    clickedButton.classList.add('active');
};

// --- FUNÇÕES DE RENDERIZAÇÃO ---

export const renderAllComponents = () => {
    renderContas();
    renderVisaoMensal();
    renderVisaoAnual();
    renderLancamentosFuturos();
    renderHistoricoTransacoes();
    renderFormTransacaoRapida();
};

export const renderContas = () => {
    const container = document.getElementById('accounts-container');
    const { contas, transacoes } = getState();

    if (!contas || contas.length === 0) {
        container.innerHTML = '<p style="text-align:center; color: var(--text-secondary);">Nenhuma conta cadastrada.</p>';
        return;
    }

    container.innerHTML = contas.map(conta => {
        const transacoesDaConta = transacoes.filter(t => t.conta_id === conta.id);
        const saldo = transacoesDaConta.reduce((acc, t) => t.tipo === 'receita' ? acc + t.valor : acc - t.valor, conta.saldo_inicial);
        const corSaldo = saldo >= 0 ? 'var(--income-color)' : 'var(--expense-color)';
        
        let botoesEspecificos = '';
        if (conta.tipo === 'Conta Corrente' || conta.tipo === 'Poupança') {
             botoesEspecificos = `<button class="btn-icon" data-action="ajustar-saldo" data-id="${conta.id}" title="Ajustar Saldo"><i class="fas fa-calculator"></i></button>`;
        } else if (conta.tipo === 'Cartão de Crédito') {
            botoesEspecificos = `<button class="btn-icon" data-action="ver-fatura" data-id="${conta.id}" title="Ver Fatura"><i class="fas fa-file-invoice"></i></button>`;
        }

        return `<div class="account-item">
                    <div class="account-details">
                        <span class="account-name">${conta.nome}</span>
                        <span class="account-type">${conta.tipo}</span>
                    </div>
                    <div class="account-actions">
                        <span class="account-balance" style="color: ${corSaldo};">${formatarMoeda(saldo)}</span>
                        ${botoesEspecificos}
                        <button class="btn-icon" data-action="editar-conta" data-id="${conta.id}" title="Editar"><i class="fas fa-edit"></i></button>
                        <button class="btn-icon" data-action="deletar-conta" data-id="${conta.id}" title="Deletar"><i class="fas fa-trash"></i></button>
                    </div>
                </div>`;
    }).join('');
};

export const renderVisaoMensal = () => {
    const container = document.getElementById('dashboard-monthly');
    const mesSelecionado = document.getElementById('dashboard-month-filter')?.value || new Date().toISOString().slice(0, 7);
    
    const { transacoes } = getState();
    const transacoesDoMes = transacoes.filter(t => t.data && t.data.startsWith(mesSelecionado));
    
    const receitas = transacoesDoMes.filter(t => t.tipo === 'receita').reduce((sum, t) => sum + t.valor, 0);
    const despesas = transacoesDoMes.filter(t => t.tipo === 'despesa').reduce((sum, t) => sum + t.valor, 0);
    const saldo = receitas - despesas;

    container.innerHTML = `
        <div class="dashboard-controls" style="margin-bottom: 1rem;">
            <input type="month" id="dashboard-month-filter" value="${mesSelecionado}">
        </div>
        <div class="dashboard-chart-container"><canvas id="summary-chart-monthly"></canvas></div>`;
    
    document.getElementById('dashboard-month-filter').addEventListener('change', renderVisaoMensal);
    
    const ctx = document.getElementById('summary-chart-monthly')?.getContext('2d');
    if (summaryChart) summaryChart.destroy();
    
    const despesasPorCategoria = transacoesDoMes
        .filter(t => t.tipo === 'despesa')
        .reduce((acc, t) => {
            acc[t.categoria] = (acc[t.categoria] || 0) + t.valor;
            return acc;
        }, {});

    if (ctx) {
        summaryChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(despesasPorCategoria),
                datasets: [{ 
                    data: Object.values(despesasPorCategoria), 
                    backgroundColor: Object.keys(despesasPorCategoria).map(cat => CATEGORY_ICONS[cat]?.color || '#cccccc'),
                    borderColor: 'var(--bg-card)',
                    borderWidth: 4
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: 'right' } } }
        });
    }
};

export const renderVisaoAnual = () => { /* Código completo da função aqui... */ };

export const renderLancamentosFuturos = () => { /* Código completo da função aqui... */ };

const renderBillItem = (bill, comprasParceladas) => { /* Código completo da função aqui... */ };

export const renderHistoricoTransacoes = () => { /* Código completo da função aqui... */ };

const renderTransactionCard = (t) => { /* Código completo da função aqui... */ };

export const renderFormTransacaoRapida = () => { /* Código completo da função aqui... */ };

// --- MODAIS ---
export const getAccountModalContent = (id = null) => { /* Código completo da função aqui... */ };
export const getBillModalContent = (id = null) => { /* Código completo da função aqui... */ };
export const getPayBillModalContent = (billId) => { /* Código completo da função aqui... */ };
export const getInstallmentPurchaseModalContent = () => { /* Código completo da função aqui... */ };
