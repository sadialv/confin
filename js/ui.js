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
    const listHtml = contas.map((conta, index) => {
        const saldo = transacoes.filter(t => t.conta_id === conta.id).reduce((acc, t) => t.tipo === 'receita' ? acc + t.valor : acc - t.valor, conta.saldo_inicial);
        
        let acoesEspecificas = '';
        if (conta.tipo === 'Cartão de Crédito') {
            acoesEspecificas = `<button class="btn btn-outline-info btn-sm" data-action="ver-fatura" data-id="${conta.id}" title="Ver Fatura"><i class="fas fa-file-invoice"></i></button>`;
        } else if (conta.tipo === 'Conta Corrente' || conta.tipo === 'Dinheiro' || conta.tipo === 'Poupança') {
            acoesEspecificas = `<button class="btn btn-outline-info btn-sm" data-action="ver-extrato" data-id="${conta.id}" title="Ver Extrato"><i class="fas fa-list-alt"></i></button>`;
        }

        const botoesGerais = `<button class="btn btn-outline-secondary btn-sm" data-action="editar-conta" data-id="${conta.id}" title="Editar"><i class="fas fa-edit"></i></button>
                              <button class="btn btn-outline-danger btn-sm" data-action="deletar-conta" data-id="${conta.id}" title="Deletar"><i class="fas fa-trash"></i></button>`;

        return `<li class="list-group-item d-flex justify-content-between align-items-center" data-aos="fade-up" data-aos-delay="${index * 50}">
                    <div>
                        <div class="fw-bold">${conta.nome}</div>
                        <small class="text-body-secondary">${conta.tipo}</small>
                    </div>
                    <div class="d-flex align-items-center gap-2">
                        <span class="fw-bold ${saldo >= 0 ? 'income-text' : 'expense-text'}">${formatarMoeda(saldo)}</span>
                        <div class="btn-group">
                            ${acoesEspecificas}
                            ${botoesGerais}
                        </div>
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
    if (summaryChart) {
        summaryChart.destroy();
        summaryChart = null;
    }
    
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
        <div id="summary-chart-monthly"></div>`;
    
    const despesasPorCat = transacoesMes.filter(t=>t.tipo==='despesa').reduce((acc,t)=>{acc[t.categoria]=(acc[t.categoria]||0)+t.valor;return acc;},{});
    
    const options = {
        series: Object.values(despesasPorCat),
        labels: Object.keys(despesasPorCat),
        chart: { type: 'donut', height: 250 },
        colors: CHART_COLORS,
        legend: { position: 'bottom' },
        theme: { mode: document.documentElement.getAttribute('data-theme') === 'dark' || document.documentElement.getAttribute('data-theme') === 'nordic-night' ? 'dark' : 'light' },
        responsive: [{ breakpoint: 480, options: { chart: { width: 200 }, legend: { position: 'bottom' } } }]
    };

    if(Object.keys(despesasPorCat).length > 0) {
        summaryChart = new ApexCharts(document.querySelector("#summary-chart-monthly"), options);
        summaryChart.render();
    } else {
        container.querySelector("#summary-chart-monthly").innerHTML = '<p class="text-center text-body-secondary p-5">Sem despesas no mês.</p>';
    }
};

export const renderVisaoAnual = () => {
    const container = document.getElementById('dashboard-yearly-pane');
    if (!container) return;
    if (annualChart) {
        annualChart.destroy();
        annualChart = null;
    }

    const ano = new Date().getFullYear();
    const transacoesAno = [...getState().transacoes,...gerarTransacoesVirtuais()].filter(t => t.data?.startsWith(ano));
    let receitasPorMes = Array(12).fill(0), despesasPorMes = Array(12).fill(0);
    transacoesAno.forEach(t => {const mes = new Date(t.data+'T12:00:00').getMonth(); if(t.tipo==='receita') receitasPorMes[mes]+=t.valor; else despesasPorMes[mes]+=t.valor;});
    
    container.innerHTML = `<div id="annual-chart"></div>`;

    const options = {
        series: [{ name: 'Receitas', data: receitasPorMes.map(v => v.toFixed(2)) }, { name: 'Despesas', data: despesasPorMes.map(v => v.toFixed(2)) }],
        chart: { type: 'bar', height: 300, stacked: false },
        plotOptions: { bar: { horizontal: false, columnWidth: '50%' } },
        xaxis: { categories: ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'] },
        yaxis: { labels: { formatter: (val) => `R$ ${val.toFixed(0)}` } },
        colors: [getComputedStyle(document.documentElement).getPropertyValue('--income-color').trim(), getComputedStyle(document.documentElement).getPropertyValue('--expense-color').trim()],
        legend: { position: 'top' },
        theme: { mode: document.documentElement.getAttribute('data-theme') === 'dark' || document.documentElement.getAttribute('data-theme') === 'nordic-night' ? 'dark' : 'light' }
    };

    annualChart = new ApexCharts(document.querySelector("#annual-chart"), options);
    annualChart.render();
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
const renderBillItem = (bill, compras) => {
    const isParcela = !!bill.compra_parcelada_id;
    let cat = bill.categoria;
    if (isParcela) {
        const c = compras.find(compra => compra.id === bill.compra_parcelada_id);
        if(c) cat = c.categoria;
    }
    const icon = CATEGORY_ICONS[cat] || CATEGORY_ICONS['Outros'];
    const editAction = isParcela ? 'recriar-compra-parcelada' : 'editar-lancamento';
    const editId = isParcela ? bill.compra_parcelada_id : bill.id;
    const collapseId = `collapse-bill-${bill.id}`;

    return `
        <div class="accordion-item" data-aos="fade-up" data-aos-once="true">
            <h2 class="accordion-header">
                <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}">
                    <div class="d-flex w-100 align-items-center">
                        <span class="transaction-icon-wrapper me-3" style="background-color:${icon.color};"><i class="${icon.icon}"></i></span>
                        <span>${bill.descricao}</span>
                        <span class="ms-auto fw-bold ${bill.tipo === 'a_pagar' ? 'expense-text' : 'income-text'}">${formatarMoeda(bill.valor)}</span>
                    </div>
                </button>
            </h2>
            <div id="${collapseId}" class="accordion-collapse collapse">
                <div class="accordion-body d-flex justify-content-between align-items-center">
                    <div>
                        <small class="text-body-secondary">Vencimento: ${new Date(bill.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR')}</small>
                    </div>
                    <div class="btn-group">
                        <button class="btn btn-success btn-sm" data-action="pagar-conta" data-id="${bill.id}">Pagar</button>
                        <button class="btn btn-outline-secondary btn-sm" data-action="${editAction}" data-id="${editId}" title="Editar"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-outline-danger btn-sm" data-action="deletar-lancamento" data-id="${bill.id}" data-compra-id="${bill.compra_parcelada_id || ''}"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            </div>
        </div>`;
};

const renderTransactionCard = (t) => {
    const conta = getContaPorId(t.conta_id);
    const icon = CATEGORY_ICONS[t.categoria] || CATEGORY_ICONS['Outros'];
    const collapseId = `collapse-trans-${t.id || t.descricao.replace(/\W/g, '')}`;
    
    const actions = t.isVirtual ? '<small class="text-info">Parcela Futura (Virtual)</small>' : `
        <div class="btn-group">
            <button class="btn btn-outline-secondary btn-sm" data-action="editar-transacao" data-id="${t.id}" title="Editar"><i class="fas fa-edit"></i></button>
            <button class="btn btn-outline-danger btn-sm" data-action="deletar-transacao" data-id="${t.id}" title="Deletar"><i class="fas fa-trash"></i></button>
        </div>`;

    return `
        <div class="accordion-item" data-aos="fade-up" data-aos-once="true">
            <h2 class="accordion-header">
                <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}">
                    <div class="d-flex w-100 align-items-center">
                        <span class="transaction-icon-wrapper me-3" style="background-color:${icon.color};"><i class="${icon.icon}"></i></span>
                        <span>${t.descricao}</span>
                        <span class="ms-auto fw-bold ${t.tipo === 'despesa' ? 'expense-text' : 'income-text'}">${t.tipo === 'despesa' ? '-' : '+'} ${formatarMoeda(t.valor)}</span>
                    </div>
                </button>
            </h2>
            <div id="${collapseId}" class="accordion-collapse collapse">
                <div class="accordion-body d-flex justify-content-between align-items-center">
                    <div>
                        <small class="text-body-secondary">
                            <i class="fas fa-calendar-alt"></i> ${new Date(t.data + 'T12:00:00').toLocaleDateString('pt-BR')} |
                            <i class="fas fa-tag"></i> ${t.categoria} |
                            <i class="fas fa-wallet"></i> ${conta ? conta.nome : 'N/A'}
                        </small>
                    </div>
                    ${actions}
                </div>
            </div>
        </div>`;
};

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
        container.innerHTML = '<p class="text-center text-body-secondary p-3">Nenhuma transação encontrada para os filtros selecionados.</p>'; 
        return; 
    }
    container.innerHTML = paginados.map(renderTransactionCard).join('');
};

// --- GERADORES DE CONTEÚDO PARA MODAL ---
export const getAccountModalContent = (id = null) => {
    const conta = id ? getContaPorId(id) : {};
    const title = id ? 'Editar Conta' : 'Nova Conta';
    const isCreditCard = conta?.tipo === 'Cartão de Crédito';
    const body = `
        <form id="form-conta" data-id="${id || ''}">
            <div class="mb-3"><label class="form-label">Nome da Conta</label><input name="nome" class="form-control" value="${conta.nome || ''}" required></div>
            <div class="mb-3"><label class="form-label">Tipo</label>
                <select name="tipo" id="conta-tipo" class="form-select">
                    <option ${conta.tipo === 'Conta Corrente' ? 'selected' : ''}>Conta Corrente</option>
                    <option ${conta.tipo === 'Cartão de Crédito' ? 'selected' : ''}>Cartão de Crédito</option>
                    <option ${conta.tipo === 'Dinheiro' ? 'selected' : ''}>Dinheiro</option>
                    <option ${conta.tipo === 'Poupança' ? 'selected' : ''}>Poupança</option>
                </select>
            </div>
            <div class="mb-3"><label class="form-label">Saldo Inicial</label><input name="saldo_inicial" type="number" step="0.01" class="form-control" value="${conta.saldo_inicial || 0}" ${id ? 'disabled' : ''}></div>
            <div id="cartao-credito-fields" style="display: ${isCreditCard ? 'block' : 'none'};">
                 <div class="mb-3">
                    <label class="form-label">Dia do Fechamento da Fatura</label>
                    <input name="dia_fechamento_cartao" type="number" min="1" max="31" class="form-control" value="${conta.dia_fechamento_cartao || ''}" placeholder="Ex: 20">
                </div>
                 <div class="mb-3">
                    <label class="form-label">Dia do Vencimento da Fatura</label>
                    <input name="dia_vencimento_cartao" type="number" min="1" max="31" class="form-control" value="${conta.dia_vencimento_cartao || ''}" placeholder="Ex: 28">
                </div>
            </div>
            <div class="text-end"><button type="submit" class="btn btn-primary">Salvar</button></div>
        </form>`;
    return { title, body };
};

export const getPayBillModalContent = (billId) => {
    const bill = getState().lancamentosFuturos.find(b=>b.id===billId);
    if (!bill) return { title: 'Erro', body: 'Lançamento não encontrado.' };
    const title = `Pagar Lançamento`;
    const body = `
        <form id="form-pagamento" data-bill-id="${bill.id}" data-valor="${bill.valor}" data-desc="${bill.descricao}" data-cat="${bill.categoria || 'Contas'}">
            <p>Você está pagando <strong>${bill.descricao}</strong> no valor de:</p>
            <p class="h3 text-center my-3">${formatarMoeda(bill.valor)}</p>
            <div class="mb-3"><label class="form-label">Data do Pagamento</label><input type="date" name="data" value="${toISODateString(new Date())}" class="form-control"></div>
            <div class="mb-3"><label class="form-label">Pagar com a conta</label><select name="conta_id" class="form-select">${getContas().filter(c=>c.tipo!=='Cartão de Crédito').map(c=>`<option value="${c.id}">${c.nome}</option>`).join('')}</select></div>
            <div class="text-end"><button type="submit" class="btn btn-success">Confirmar Pagamento</button></div>
        </form>`;
    return { title, body };
};

export const getBillModalContent = (id = null) => {
    const bill = id ? getState().lancamentosFuturos.find(l => l.id === id) : {};
    const title = id ? 'Editar Lançamento Futuro' : 'Novo Lançamento';
    const categoriasOptions = CATEGORIAS_PADRAO.map(c => `<option value="${c}" ${bill.categoria === c ? 'selected' : ''}>${c}</option>`).join('');
    const body = `
        <form id="form-lancamento" data-id="${id || ''}">
            <div class="mb-3"><label class="form-label">Descrição</label><input name="descricao" value="${bill.descricao || ''}" class="form-control" required></div>
            <div class="mb-3"><label class="form-label">Valor</label><input name="valor" type="number" step="0.01" value="${bill.valor || ''}" class="form-control" required></div>
            <div class="mb-3"><label class="form-label">Data Vencimento</label><input name="data_vencimento" type="date" value="${bill.data_vencimento || toISODateString(new Date())}" class="form-control" required></div>
            <div class="mb-3"><label class="form-label">Categoria</label><select name="categoria" class="form-select">${categoriasOptions}</select></div>
            <div class="mb-3"><label class="form-label">Tipo</label><select name="tipo" class="form-select"><option value="a_pagar" ${bill.tipo==='a_pagar'?'selected':''}>A Pagar</option><option value="a_receber" ${bill.tipo==='a_receber'?'selected':''}>A Receber</option></select></div>
            <div class="text-end"><button type="submit" class="btn btn-primary">Salvar</button></div>
        </form>`;
    return { title, body };
};

export const getTransactionModalContent = (id) => {
    const transacao = getState().transacoes.find(t => t.id === id);
    if (!transacao) return { title: 'Erro', body: '<p>Transação não encontrada.</p>' };
    const title = 'Editar Transação';
    const contasOptions = getContas().map(c => `<option value="${c.id}" ${transacao.conta_id === c.id ? 'selected' : ''}>${c.nome}</option>`).join('');
    const categoriasOptions = CATEGORIAS_PADRAO.map(c => `<option value="${c}" ${transacao.categoria === c ? 'selected' : ''}>${c}</option>`).join('');
    const body = `
        <form id="form-edicao-transacao" data-id="${id}">
            <div class="mb-3"><label class="form-label">Descrição</label><input name="descricao" value="${transacao.descricao}" class="form-control" required></div>
            <div class="mb-3"><label class="form-label">Valor</label><input name="valor" type="number" step="0.01" value="${transacao.valor}" class="form-control" required></div>
            <div class="mb-3"><label class="form-label">Data</label><input name="data" type="date" value="${transacao.data}" class="form-control" required></div>
            <div class="mb-3"><label class="form-label">Conta</label><select name="conta_id" class="form-select">${contasOptions}</select></div>
            <div class="mb-3"><label class="form-label">Categoria</label><select name="categoria" class="form-select">${categoriasOptions}</select></div>
            <div class="mb-3"><label class="form-label">Tipo</label><select name="tipo" class="form-select"><option value="despesa" ${transacao.tipo==='despesa'?'selected':''}>Despesa</option><option value="receita" ${transacao.tipo==='receita'?'selected':''}>Receita</option></select></div>
            <div class="text-end"><button type="submit" class="btn btn-primary">Salvar Alterações</button></div>
        </form>`;
    return { title, body };
};

export const getInstallmentPurchaseModalContent = (compra) => {
    if (!compra) return { title: 'Erro', body: '<p>Compra não encontrada.</p>' };
    const title = 'Recriar Compra Parcelada';
    const contasCartao = getContas().filter(c => c.tipo === 'Cartão de Crédito');
    const contasOptions = contasCartao.map(c => `<option value="${c.id}" ${compra.conta_id === c.id ? 'selected' : ''}>${c.nome}</option>`).join('');
    const categoriasOptions = CATEGORIAS_PADRAO.map(c => `<option value="${c}" ${compra.categoria === c ? 'selected' : ''}>${c}</option>`).join('');
    const body = `
        <div class="alert alert-warning small">Ajuste os dados e salve. A compra antiga e todas as suas parcelas futuras serão substituídas.</div>
        <form id="form-compra-parcelada" data-compra-antiga-id="${compra.id}">
            <div class="mb-3"><label class="form-label">Descrição</label><input name="descricao" value="${compra.descricao}" class="form-control" required></div>
            <div class="mb-3"><label class="form-label">Valor Total</label><input name="valor_total" type="number" step="0.01" value="${compra.valor_total}" class="form-control" required></div>
            <div class="mb-3"><label class="form-label">Número de Parcelas</label><input name="numero_parcelas" type="number" min="1" value="${compra.numero_parcelas}" class="form-control" required></div>
            <div class="mb-3"><label class="form-label">Data da Compra</label><input name="data_compra" type="date" value="${compra.data_compra}" class="form-control" required></div>
            <div class="mb-3"><label class="form-label">Cartão de Crédito</label><select name="conta_id" class="form-select" required>${contasOptions}</select></div>
            <div class="mb-3"><label class="form-label">Categoria</label><select name="categoria" class="form-select" required>${categoriasOptions}</select></div>
            <div class="text-end"><button type="submit" class="btn btn-primary">Salvar e Substituir</button></div>
        </form>`;
    return { title, body };
};

export const getStatementModalContent = (contaId) => {
    const conta = getContaPorId(contaId);
    if (!conta) return { title: 'Erro', body: 'Conta não encontrada.' };
    const title = `Fatura - ${conta.nome}`;
    const { transacoes, lancamentosFuturos, comprasParceladas } = getState();
    const mesesDeTransacoes = transacoes.filter(t => t.conta_id === contaId).map(t => t.data.substring(0, 7));
    const mesesDeLancamentos = lancamentosFuturos
        .filter(l => {
            if (!l.compra_parcelada_id) return false;
            const compra = comprasParceladas.find(c => c.id === l.compra_parcelada_id);
            return compra && compra.conta_id === contaId;
        })
        .map(l => l.data_vencimento.substring(0, 7));
    const mesesDisponiveis = [...new Set([...mesesDeTransacoes, ...mesesDeLancamentos])].sort().reverse();
    const options = mesesDisponiveis.map(mes => {
        const [ano, mesNum] = mes.split('-');
        const data = new Date(ano, mesNum - 1);
        const nomeMes = data.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
        return `<option value="${mes}">${nomeMes}</option>`;
    }).join('');
    const body = `
        <div class="mb-3"><label for="statement-month-select" class="form-label">Selecione a Fatura:</label><select id="statement-month-select" class="form-select" data-conta-id="${contaId}"><option value="">Selecione...</option>${options}</select></div>
        <div id="statement-details-container" class="mt-4"><p class="text-center text-body-secondary">Selecione um mês para ver os detalhes da fatura.</p></div>`;
    return { title, body };
};

export const renderStatementDetails = (contaId, mesSelecionado) => {
    const container = document.getElementById('statement-details-container');
    if (!container) return;
    if (!mesSelecionado) {
        container.innerHTML = '<p class="text-center text-body-secondary">Selecione um mês para ver os detalhes.</p>';
        return;
    }
    const conta = getContaPorId(contaId);
    const transacoesCompletas = [...getState().transacoes, ...gerarTransacoesVirtuais()];
    const diaFechamento = conta.dia_fechamento_cartao || 28;
    const [ano, mes] = mesSelecionado.split('-').map(Number);
    const fimCiclo = new Date(ano, mes - 1, diaFechamento, 12);
    const inicioCiclo = new Date(fimCiclo);
    inicioCiclo.setMonth(inicioCiclo.getMonth() - 1);
    const transacoesFatura = transacoesCompletas.filter(t => {
        const dataTransacao = new Date(t.data + 'T12:00:00');
        return t.conta_id === contaId && dataTransacao > inicioCiclo && dataTransacao <= fimCiclo && t.tipo === 'despesa';
    }).sort((a, b) => new Date(a.data) - new Date(b.data));
    const totalFatura = transacoesFatura.reduce((acc, t) => acc + t.valor, 0);
    const itemsHtml = transacoesFatura.length ? 
        transacoesFatura.map(renderTransactionCard).join('') : 
        '<p class="text-center text-body-secondary p-3">Nenhuma despesa nesta fatura.</p>';
    container.innerHTML = `
        <div>
            <h5 class="d-flex justify-content-between"><span>Total da Fatura:</span><span class="expense-text">${formatarMoeda(totalFatura)}</span></h5>
            <p class="text-body-secondary small">Período de ${inicioCiclo.toLocaleDateString('pt-BR')} a ${fimCiclo.toLocaleDateString('pt-BR')}</p>
        </div>
        <div class="accordion mt-3">${itemsHtml}</div>`;
};

export const getAccountStatementModalContent = (contaId) => {
    const conta = getContaPorId(contaId);
    if (!conta) return { title: 'Erro', body: 'Conta não encontrada.' };
    const title = `Extrato - ${conta.nome}`;
    const { transacoes } = getState();
    const mesesDisponiveis = [...new Set(transacoes.filter(t => t.conta_id === contaId).map(t => t.data.substring(0, 7)))].sort().reverse();
    const options = mesesDisponiveis.map(mes => {
        const [ano, mesNum] = mes.split('-');
        const data = new Date(ano, mesNum - 1);
        const nomeMes = data.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
        return `<option value="${mes}">${nomeMes}</option>`;
    }).join('');
    const body = `
        <div class="mb-3"><label for="account-statement-month-select" class="form-label">Selecione o Mês:</label><select id="account-statement-month-select" class="form-select" data-conta-id="${contaId}"><option value="">Selecione...</option>${options}</select></div>
        <div id="account-statement-details-container" class="mt-4"><p class="text-center text-body-secondary">Selecione um mês para ver os detalhes do extrato.</p></div>`;
    return { title, body };
};

export const renderAccountStatementDetails = (contaId, mesSelecionado) => {
    const container = document.getElementById('account-statement-details-container');
    if (!container) return;
    if (!mesSelecionado) {
        container.innerHTML = '<p class="text-center text-body-secondary">Selecione um mês para ver os detalhes.</p>';
        return;
    }
    const conta = getContaPorId(contaId);
    const { transacoes } = getState();
    const [ano, mes] = mesSelecionado.split('-').map(Number);
    const inicioDoMes = new Date(ano, mes - 1, 1);
    const transacoesAnteriores = transacoes.filter(t => {
        const dataTransacao = new Date(t.data + 'T12:00:00');
        return t.conta_id === contaId && dataTransacao < inicioDoMes;
    });
    const saldoAnterior = transacoesAnteriores.reduce((acc, t) => {
        return t.tipo === 'receita' ? acc + t.valor : acc - t.valor;
    }, conta.saldo_inicial);
    const transacoesDoMes = transacoes
        .filter(t => t.conta_id === contaId && t.data.startsWith(mesSelecionado))
        .sort((a, b) => new Date(a.data) - new Date(b.data));
    const totalEntradas = transacoesDoMes.filter(t => t.tipo === 'receita').reduce((acc, t) => acc + t.valor, 0);
    const totalSaidas = transacoesDoMes.filter(t => t.tipo === 'despesa').reduce((acc, t) => acc + t.valor, 0);
    const saldoFinal = saldoAnterior + totalEntradas - totalSaidas;
    const itemsHtml = transacoesDoMes.length ?
        transacoesDoMes.map(renderTransactionCard).join('') :
        '<p class="text-center text-body-secondary p-3">Nenhuma transação neste mês.</p>';
    container.innerHTML = `
        <ul class="list-group list-group-flush mb-3">
            <li class="list-group-item d-flex justify-content-between"><span>Saldo Anterior:</span> <span>${formatarMoeda(saldoAnterior)}</span></li>
            <li class="list-group-item d-flex justify-content-between"><span>Total de Entradas:</span> <span class="income-text">${formatarMoeda(totalEntradas)}</span></li>
            <li class="list-group-item d-flex justify-content-between"><span>Total de Saídas:</span> <span class="expense-text">${formatarMoeda(totalSaidas)}</span></li>
            <li class="list-group-item d-flex justify-content-between fw-bold"><span>Saldo Final:</span> <span>${formatarMoeda(saldoFinal)}</span></li>
        </ul>
        <div class="accordion">
            ${itemsHtml}
        </div>`;
};
