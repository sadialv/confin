import { formatarMoeda, CATEGORIAS_PADRAO, toISODateString, CATEGORY_ICONS, CHART_COLORS } from './utils.js';
import { getState, getContaPorId, getContas } from './state.js';

let summaryChart = null;
let annualChart = null;
const ITEMS_PER_PAGE = 10;

// --- FUNÇÕES GERAIS DE UI ---
export const showToast = (message, type = 'success') => {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type} show`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => toast.remove());
    }, 3000);
};

export const setLoadingState = (button, isLoading, originalText = 'Salvar') => {
    if(!button) return;
    button.disabled = isLoading;
    button.innerHTML = isLoading ? `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>` : originalText;
};

export const openModal = (content) => {
    const container = document.getElementById('modal-container');
    if(!container) return;

    const modalHTML = `
        <div class="popup-dialog">
            <div class="popup-header">
                <h5 class="popup-title">${content.title}</h5>
                <button type="button" class="btn-close" id="modal-close-btn"></button>
            </div>
            <div class="popup-body">
                ${content.body}
            </div>
        </div>`;
    
    container.innerHTML = modalHTML;
    container.classList.add('active');
};

export const closeModal = () => {
    const container = document.getElementById('modal-container');
    if(container) container.classList.remove('active');
};

const gerarTransacoesVirtuais = () => {
    const { comprasParceladas, lancamentosFuturos } = getState();
    return lancamentosFuturos
        .filter(l => l.compra_parcelada_id && l.status === 'pendente')
        .map(parcela => {
            const compra = comprasParceladas.find(c => c.id === parcela.compra_parcelada_id);
            if (!compra) return null;
            return {
                id: `v_${parcela.id}`, descricao: parcela.descricao, valor: parcela.valor,
                data: parcela.data_vencimento, categoria: compra.categoria, conta_id: compra.conta_id,
                tipo: 'despesa', isVirtual: true
            };
        }).filter(Boolean);
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


// --- RENDERIZAÇÃO DE COMPONENTES ESPECÍFICOS ---

export const renderContas = () => {
    const container = document.getElementById('accounts-container');
    const { contas, transacoes } = getState();
    if (!contas || !contas.length) { 
        container.innerHTML = '<p class="text-center text-body-secondary p-3">Nenhuma conta.</p>'; 
        return; 
    }
    const listHtml = contas.map(conta => {
        const saldo = transacoes.filter(t => t.conta_id === conta.id).reduce((acc, t) => t.tipo === 'receita' ? acc + t.valor : acc - t.valor, conta.saldo_inicial);
        let botoes = `<button class="btn btn-outline-secondary btn-sm" data-action="editar-conta" data-id="${conta.id}" title="Editar"><i class="fas fa-edit"></i></button>
                      <button class="btn btn-outline-danger btn-sm" data-action="deletar-conta" data-id="${conta.id}" title="Deletar"><i class="fas fa-trash"></i></button>`;
        if (conta.tipo === 'Cartão de Crédito') {
            botoes = `<button class="btn btn-outline-info btn-sm" data-action="ver-fatura" data-id="${conta.id}" title="Ver Fatura"><i class="fas fa-file-invoice"></i></button>` + botoes;
        }
        return `<li class="list-group-item d-flex justify-content-between align-items-center">
                    <div>
                        <div class="fw-bold">${conta.nome}</div>
                        <small class="text-body-secondary">${conta.tipo}</small>
                    </div>
                    <div class="d-flex align-items-center gap-2">
                        <span class="fw-bold ${saldo >= 0 ? 'income-text' : 'expense-text'}">${formatarMoeda(saldo)}</span>
                        <div class="btn-group">${botoes}</div>
                    </div>
                </li>`;
    }).join('');
    container.innerHTML = `<ul class="list-group list-group-flush">${listHtml}</ul>`;
};

export const renderFormTransacaoRapida = () => {
    const container = document.getElementById('form-transacao-unificada');
    if (!container) return;
    const contas = getContas();
    const contasCartao = contas.filter(c => c.tipo === 'Cartão de Crédito');
    
    const contasOptions = contas.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
    const contasCartaoOptions = contasCartao.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
    const categoriasOptions = CATEGORIAS_PADRAO.map(c => `<option value="${c}">${c}</option>`).join('');

    container.innerHTML = `
        <div class="mb-3">
            <label for="tipo-compra" class="form-label">Tipo de Compra</label>
            <select id="tipo-compra" name="tipo_compra" class="form-select form-select-sm">
                <option value="vista">À Vista</option>
                <option value="parcelada">Parcelada</option>
                <option value="recorrente">Recorrente</option>
            </select>
        </div>
        <div class="mb-3"><label class="form-label">Descrição</label><input type="text" name="descricao" class="form-control form-control-sm" required></div>
        
        <div class="mb-3">
            <label for="tipo-transacao" class="form-label">Tipo</label>
            <select id="tipo-transacao" name="tipo" class="form-select form-select-sm">
                <option value="despesa" selected>Despesa (Débito)</option>
                <option value="receita">Receita (Crédito)</option>
            </select>
        </div>

        <div class="mb-3"><label id="label-valor" class="form-label">Valor</label><input type="number" name="valor" min="0" step="0.01" class="form-control form-control-sm" required></div>
        
        <div class="mb-3" id="group-data"><label id="label-data" class="form-label">Data</label><input type="date" name="data" value="${toISODateString(new Date())}" class="form-control form-control-sm" required></div>
        <div class="mb-3" id="group-conta"><label id="label-conta" class="form-label">Conta</label><select name="conta_id" class="form-select form-select-sm" required>${contasOptions}</select></div>
        
        <div id="parcelada-fields" class="extra-fields">
            <div class="mb-3"><label class="form-label">Nº de Parcelas</label><input name="numero_parcelas" type="number" min="2" class="form-control form-control-sm"></div>
        </div>
        
        <div id="recorrente-fields" class="extra-fields">
            <div class="mb-3"><label class="form-label">Frequência</label>
                <select name="frequencia" class="form-select form-select-sm">
                    <option value="diaria">Diária</option>
                    <option value="quinzenal">Quinzenal</option>
                    <option value="mensal" selected>Mensal</option>
                    <option value="anual">Anual</option>
                </select>
            </div>
            <div class="mb-3" id="group-dia-vencimento"><label class="form-label">Dia do Vencimento</label><input name="dia_vencimento" type="number" min="1" max="31" value="10" class="form-control form-control-sm"></div>
            <div class="mb-3"><label class="form-label">Quantidade</label><input name="quantidade" type="number" min="1" value="12" class="form-control form-control-sm"></div>
        </div>
        
        <div class="mb-3"><label class="form-label">Categoria</label><select name="categoria" class="form-select form-select-sm" required>${categoriasOptions}</select></div>
        <button type="submit" class="btn btn-primary w-100">Salvar Transação</button>
    `;

    const contaSelect = container.querySelector('select[name="conta_id"]');
    if (contaSelect) {
        contaSelect.dataset.allOptions = contasOptions;
        contaSelect.dataset.creditCardOptions = contasCartaoOptions;
    }
};

export const renderVisaoMensal = () => {
    const container = document.getElementById('dashboard-monthly-pane');
    if (!container) return;
    const mes = new Date().toISOString().slice(0, 7);
    const transacoesMes = [...getState().transacoes, ...gerarTransacoesVirtuais()].filter(t => t.data?.startsWith(mes));
    const receitas = transacoesMes.filter(t => t.tipo === 'receita').reduce((s, t) => s + t.valor, 0);
    const despesas = transacoesMes.filter(t => t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0);
    container.innerHTML = `
        <div class="row text-center mb-3">
            <div class="col-4"><h6>Receitas</h6><p class="h4 income-text mb-0">${formatarMoeda(receitas)}</p></div>
            <div class="col-4"><h6>Despesas</h6><p class="h4 expense-text mb-0">${formatarMoeda(despesas)}</p></div>
            <div class="col-4"><h6>Saldo</h6><p class="h4 ${(receitas-despesas) >= 0 ? 'income-text':'expense-text'} mb-0">${formatarMoeda(receitas-despesas)}</p></div>
        </div>
        <div style="height: 250px;"><canvas id="summary-chart-monthly"></canvas></div>`;
    if (summaryChart) summaryChart.destroy();
    const ctx = document.getElementById('summary-chart-monthly')?.getContext('2d');
    const despesasPorCat = transacoesMes.filter(t=>t.tipo==='despesa').reduce((acc,t)=>{acc[t.categoria]=(acc[t.categoria]||0)+t.valor;return acc;},{});
    if(ctx && Object.keys(despesasPorCat).length > 0) {
        summaryChart = new Chart(ctx, {type:'doughnut',data:{labels:Object.keys(despesasPorCat),datasets:[{data:Object.values(despesasPorCat),backgroundColor:CHART_COLORS}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true,position:'right'}}}});
    }
};

export const renderVisaoAnual = () => {
    const container = document.getElementById('dashboard-yearly-pane');
    if (!container) return;
    const ano = new Date().getFullYear();
    const transacoesAno = [...getState().transacoes,...gerarTransacoesVirtuais()].filter(t => t.data?.startsWith(ano));
    let receitasPorMes = Array(12).fill(0), despesasPorMes = Array(12).fill(0);
    transacoesAno.forEach(t => {const mes = new Date(t.data+'T12:00:00').getMonth(); if(t.tipo==='receita') receitasPorMes[mes]+=t.valor; else despesasPorMes[mes]+=t.valor;});
    container.innerHTML = `<div style="height: 300px;"><canvas id="annual-chart"></canvas></div>`;
    if(annualChart) annualChart.destroy();
    const ctx = document.getElementById('annual-chart')?.getContext('2d');
    if(ctx) {
        annualChart = new Chart(ctx, {type:'bar',data:{labels:['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'],datasets:[{label:'Receitas',data:receitasPorMes,backgroundColor:'rgba(25,135,84,0.7)'},{label:'Despesas',data:despesasPorMes,backgroundColor:'rgba(220,53,69,0.7)'}]},options:{responsive:true,maintainAspectRatio:false,scales:{y:{beginAtZero:true}}}});
    }
};

export const renderFilters = (type, currentFilters = {}) => {
    const container = document.getElementById(`${type}-filters-container`);
    if (!container) return;
    
    const contas = getContas();
    const accountOptions = contas.map(conta => 
        `<option value="${conta.id}" ${currentFilters.contaId == conta.id ? 'selected' : ''}>${conta.nome}</option>`
    ).join('');

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
            <div class="col-md-4">
                <select class="form-select form-select-sm" id="${type}-month-filter">
                    <option value="todos" ${!currentFilters.mes || currentFilters.mes === 'todos' ? 'selected' : ''}>Todos os Meses</option>
                    ${monthOptions}
                </select>
            </div>
            <div class="col-md-4">
                <select class="form-select form-select-sm" id="${type}-account-filter">
                    <option value="todas" ${!currentFilters.contaId || currentFilters.contaId === 'todas' ? 'selected' : ''}>Todas as Contas</option>
                    ${accountOptions}
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
        .filter(l => {
            if (filters.contaId === 'todas' || !filters.contaId) return true;
            if (!l.compra_parcelada_id) return true;
            const compra = comprasParceladas.find(c => c.id === l.compra_parcelada_id);
            return compra && compra.conta_id == filters.contaId;
        })
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
        .filter(t => (filters.contaId === 'todas' || !filters.contaId) || t.conta_id == filters.contaId)
        .filter(t => t.descricao.toLowerCase().includes((filters.pesquisa || '').toLowerCase()))
        .sort((a,b) => new Date(b.data) - new Date(a.data));

    renderSummaryPanel('history-summary-panel', filtrados, 'history');
    const paginados = filtrados.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
    if (!paginados.length) { 
        container.innerHTML = '<p class="text-center text-body-secondary p-3">Nenhuma transação encontrada.</p>'; 
        return; 
    }
    container.innerHTML = paginados.map(renderTransactionCard).join('');
};

// --- GERADORES DE CONTEÚDO PARA MODAL ---
export const getAccountModalContent = (id = null) => { /* ... (código anterior) ... */ };
export const getPayBillModalContent = (billId) => { /* ... (código anterior) ... */ };
export const getBillModalContent = (id = null) => { /* ... (código anterior) ... */ };
export const getTransactionModalContent = (id) => { /* ... (código anterior) ... */ };
export const getInstallmentPurchaseModalContent = (compra) => { /* ... (código anterior) ... */ };
export const getStatementModalContent = (contaId) => { /* ... (código anterior) ... */ };
export const renderStatementDetails = (contaId, mesSelecionado) => { /* ... (código anterior) ... */ };
