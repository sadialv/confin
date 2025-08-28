import { formatarMoeda, CATEGORias_PADRAO, toISODateString, CATEGORY_ICONS, CHART_COLORS } from './utils.js';
import { getState, getContaPorId, getContas } from './state.js';

let summaryChart = null;
let annualChart = null;
const ITEMS_PER_PAGE = 10;

// --- FUNÇÕES GERAIS DE UI ---
export const showToast = (message, type = 'success') => { /* ... (código anterior) ... */ };
export const setLoadingState = (button, isLoading, originalText = 'Salvar') => { /* ... (código anterior) ... */ };
export const openModal = (content) => { /* ... (código anterior) ... */ };
export const closeModal = () => { /* ... (código anterior) ... */ };

const gerarTransacoesVirtuais = () => {
    // ... (código anterior sem alterações)
};

// --- FUNÇÃO MASTER DE RENDERIZAÇÃO ---
export const renderAllComponents = (initialFilters) => {
    renderContas();
    renderFormTransacaoRapida();
    renderVisaoMensal();
    renderVisaoAnual();
    renderFilters('bills', initialFilters.bills);
    renderLancamentosFuturos(1, initialFilters.bills);
    renderFilters('history', initialFilters.history);
    renderHistoricoTransacoes(1, initialFilters.history);
};

// --- RENDERIZAÇÃO DE COMPONENTES ---

export const renderContas = () => { /* ... (código anterior) ... */ };
export const renderFormTransacaoRapida = () => { /* ... (código anterior) ... */ };
export const renderVisaoMensal = () => { /* ... (código anterior) ... */ };
export const renderVisaoAnual = () => { /* ... (código anterior) ... */ };

export const renderFilters = (type, currentFilters = {}) => {
    const container = document.getElementById(`${type}-filters-container`);
    if (!container) return;
    
    const data = type === 'bills' ? getState().lancamentosFuturos : [...getState().transacoes, ...gerarTransacoesVirtuais()];
    const dateKey = type === 'bills' ? 'data_vencimento' : 'data';

    const availableMonths = [...new Set(data.map(item => item[dateKey]?.substring(0, 7)))].filter(Boolean).sort().reverse();

    const monthOptions = availableMonths.map(mes => {
        const [ano, mesNum] = mes.split('-');
        const nomeMes = new Date(ano, mesNum - 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
        return `<option value="${mes}" ${currentFilters.mes === mes ? 'selected' : ''}>${nomeMes}</option>`;
    }).join('');

    container.innerHTML = `
        <div class="row g-2 mb-3">
            <div class="col-md-8">
                <select class="form-select form-select-sm" id="${type}-month-filter">
                    <option value="todos" ${!currentFilters.mes || currentFilters.mes === 'todos' ? 'selected' : ''}>Todos os Meses</option>
                    ${monthOptions}
                </select>
            </div>
            <div class="col-md-4">
                <input type="search" class="form-control form-control-sm" id="${type}-search-input" placeholder="Pesquisar..." value="${currentFilters.pesquisa || ''}">
            </div>
        </div>`;
};

const renderSummaryPanel = (containerId, items, type) => {
    const container = document.getElementById(containerId);
    if (!container) return;

    const isHistory = type === 'history';
    const totalReceitas = isHistory ? items.filter(t => t.tipo === 'receita').reduce((s, t) => s + t.valor, 0) : items.filter(t => t.tipo === 'a_receber').reduce((s, t) => s + t.valor, 0);
    const totalDespesas = isHistory ? items.filter(t => t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0) : items.filter(t => t.tipo === 'a_pagar').reduce((s, t) => s + t.valor, 0);
    const saldo = totalReceitas - totalDespesas;
    const receitasLabel = isHistory ? 'Receitas' : 'A Receber';
    const despesasLabel = isHistory ? 'Despesas' : 'A Pagar';
    
    container.innerHTML = `
        <div class="alert alert-light py-2">
            <div class="d-flex justify-content-around flex-wrap small text-center">
                <span>Itens na Tela: <strong class="d-block">${items.length}</strong></span>
                <span class="income-text">${receitasLabel}: <strong class="d-block">${formatarMoeda(totalReceitas)}</strong></span>
                <span class="expense-text">${despesasLabel}: <strong class="d-block">${formatarMoeda(totalDespesas)}</strong></span>
                ${isHistory ? `<span>Saldo: <strong class="d-block ${saldo >= 0 ? 'income-text' : 'expense-text'}">${formatarMoeda(saldo)}</strong></span>` : ''}
            </div>
        </div>`;
};

// --- RENDERIZAÇÃO DAS LISTAS EM ACORDEÃO ---
const renderBillItem = (bill, compras) => { /* ... (código anterior) ... */ };
const renderTransactionCard = (t) => { /* ... (código anterior) ... */ };

export const renderLancamentosFuturos = (page = 1, filters) => {
    const container = document.getElementById('bills-list-container');
    if (!container) return;
    const { lancamentosFuturos, comprasParceladas } = getState();
    
    const filtrados = lancamentosFuturos
        .filter(l => l.status === 'pendente')
        .filter(l => (filters.mes === 'todos' || !filters.mes) || l.data_vencimento.startsWith(filters.mes))
        .filter(l => l.descricao.toLowerCase().includes((filters.pesquisa || '').toLowerCase()))
        .sort((a,b) => new Date(a.data_vencimento) - new Date(b.data_vencimento));
    
    renderSummaryPanel('bills-summary-panel', filtrados, 'bills');

    const paginados = filtrados.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
    if (!paginados.length) { 
        container.innerHTML = '<p class="text-center text-body-secondary p-3">Nenhum lançamento futuro encontrado.</p>'; 
        return; 
    }
    container.innerHTML = paginados.map(l => renderBillItem(l, comprasParceladas)).join('');
};

export const renderHistoricoTransacoes = (page = 1, filters) => {
    const container = document.getElementById('history-list-container');
    if (!container) return;
    const transacoesCompletas = [...getState().transacoes, ...gerarTransacoesVirtuais()];

    const filtrados = transacoesCompletas
        .filter(t => (filters.mes === 'todos' || !filters.mes) || t.data.startsWith(filters.mes))
        .filter(t => t.descricao.toLowerCase().includes((filters.pesquisa || '').toLowerCase()))
        .sort((a,b) => new Date(b.data) - new Date(a.data));

    renderSummaryPanel('history-summary-panel', filtrados, 'history');
    
    const paginados = filtrados.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
    if (!paginados.length) { 
        container.innerHTML = '<p class="text-center text-body-secondary p-3">Nenhuma transação encontrada para os filtros selecionados.</p>'; 
        return; 
    }
    container.innerHTML = paginados.map(renderTransactionCard).join('');
};

// --- GERADORES DE CONTEÚDO PARA MODAL ---
export const getAccountModalContent = (id = null) => { /* ... (código anterior) ... */ };
export const getPayBillModalContent = (billId) => { /* ... (código anterior) ... */ };
