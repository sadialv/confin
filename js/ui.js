// js/ui.js
import { formatarMoeda, CATEGORIAS_PADRAO, toISODateString, CATEGORY_ICONS, HOJE, CHART_COLORS } from './utils.js';
import { getState, getContaPorId, getContas } from './state.js';

let summaryChart = null;
let annualChart = null;

// --- GERAL ---
export const showToast = (message, type = 'success') => {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
};
export const setLoadingState = (button, isLoading, originalText = 'Salvar') => {
    if(!button) return;
    button.disabled = isLoading;
    button.innerHTML = isLoading ? `<i class="fas fa-spinner fa-spin"></i>` : originalText;
};

// ESTA É A VERSÃO CORRETA QUE ADICIONA O BOTÃO DE FECHAR
export const openModal = (content) => {
    const modalContent = `<button class="modal-close-btn" id="modal-close-btn">&times;</button>${content}`;
    document.getElementById('modal-content-area').innerHTML = modalContent;
    document.getElementById('modal-container').classList.add('active');
    document.getElementById('modal-close-btn').addEventListener('click', closeModal);
};

export const closeModal = () => document.getElementById('modal-container').classList.remove('active');

export const switchTab = (button, parentSelector) => {
    const parent = document.querySelector(parentSelector);
    parent.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    parent.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    button.classList.add('active');
    parent.querySelector(`#${button.dataset.tab}`).classList.add('active');
};

// --- RENDERIZAÇÃO ---
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
    if (!contas.length) { container.innerHTML = '<p class="placeholder">Nenhuma conta.</p>'; return; }
    container.innerHTML = contas.map(conta => {
        const saldo = transacoes.filter(t => t.conta_id === conta.id).reduce((acc, t) => t.tipo === 'receita' ? acc + t.valor : acc - t.valor, conta.saldo_inicial);
        let botoesEspecificos = '';
        if (conta.tipo === 'Cartão de Crédito') {
            botoesEspecificos = `<button class="btn-icon" data-action="ver-fatura" data-id="${conta.id}" title="Ver Fatura"><i class="fas fa-file-invoice"></i></button>`;
        }
        return `<div class="account-item">
                    <div>
                        <div class="account-name">${conta.nome}</div>
                        <div class="account-type">${conta.tipo}</div>
                    </div>
                    <span class="account-balance ${saldo >= 0 ? 'income-text' : 'expense-text'}">${formatarMoeda(saldo)}</span>
                    <div class="account-actions">
                        ${botoesEspecificos}
                        <button class="btn-icon" data-action="editar-conta" data-id="${conta.id}" title="Editar"><i class="fas fa-edit"></i></button>
                        <button class="btn-icon" data-action="deletar-conta" data-id="${conta.id}" title="Deletar"><i class="fas fa-trash"></i></button>
                    </div>
                </div>`;
    }).join('');
};

export const renderVisaoMensal = () => { /* ...código completo da função... */ };
export const renderVisaoAnual = () => { /* ...código completo da função... */ };
export const renderLancamentosFuturos = () => { /* ...código completo da função... */ };
const renderBillItem = (bill, compras) => { /* ...código completo da função... */ };
export const renderHistoricoTransacoes = () => { /* ...código completo da função... */ };
const renderTransactionCard = (t) => { /* ...código completo da função... */ };
export const renderFormTransacaoRapida = () => { /* ...código completo da função... */ };

// --- MODAIS ---
export const getAccountModalContent = (id=null) => { /* ...código completo da função... */ };
export const getBillModalContent = (id=null) => { /* ...código completo da função... */ };
export const getPayBillModalContent = (billId) => { /* ...código completo da função... */ };
export const getInstallmentPurchaseModalContent = () => { /* ...código completo da função... */ };
export const getStatementModalContent = (contaId) => {
    const conta = getContaPorId(contaId);
    const { transacoes } = getState();
    const mesesDisponiveis = [...new Set(transacoes.filter(t => t.conta_id === contaId).map(t => t.data.substring(0, 7)))].sort().reverse();
    const options = mesesDisponiveis.map(mes => {
        const [ano, mesNum] = mes.split('-');
        const data = new Date(ano, mesNum - 1);
        const nomeMes = data.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
        return `<option value="${mes}">${nomeMes}</option>`;
    }).join('');
    // Esta função retorna APENAS o conteúdo. O botão de fechar é adicionado pela openModal.
    return `
        <h2>Fatura - ${conta.nome}</h2>
        <div class="form-group">
            <label for="statement-month-select">Selecione a Fatura:</label>
            <select id="statement-month-select" data-conta-id="${contaId}">
                <option value="">Selecione...</option>
                ${options}
            </select>
        </div>
        <div id="statement-details-container" style="margin-top: 1.5rem;">
            <p class="placeholder">Selecione um mês para ver os detalhes.</p>
        </div>`;
};
export const renderStatementDetails = (contaId, mesSelecionado) => { /* ...código completo da função... */ };
