// ARQUIVO: js/ui.js
import { formatarMoeda, CATEGORIAS_PADRAO, toISODateString, CATEGORY_ICONS, CHART_COLORS } from './utils.js';
import { getState, getContaPorId, getContas, getCategorias, getTiposContas, isTipoCartao } from './state.js';
import { calculateFinancialHealthMetrics, calculateAnnualTimeline, calculateCategoryGrid, calculateDailyEvolution } from './finance.js';

// --- VARIÁVEIS GLOBAIS (Controle de Gráficos e Estado de UI) ---
let summaryChart = null;
let dailyChart = null;
let annualChart = null;
let netWorthChart = null;
let avgSpendingChart = null;
let annualMixedChart = null;

// Estados locais da UI
let currentPlanningYear = new Date().getFullYear();
let currentDashboardMonth = new Date().toISOString().slice(0, 7);

const ITEMS_PER_PAGE = 10;

// --- HELPERS ---

const getCategoriaOptionsHTML = (selecionada = null) => {
    const categorias = getCategorias();
    if (!categorias || !categorias.length) {
        return '<option disabled>Nenhuma categoria cadastrada</option>';
    }
    return categorias.map(c => 
        `<option value="${c.nome}" ${c.nome === selecionada ? 'selected' : ''}>${c.nome}</option>`
    ).join('');
};

const gerarTransacoesVirtuais = () => {
    const { comprasParceladas, lancamentosFuturos } = getState();
    return lancamentosFuturos
        .filter(l => l.compra_parcelada_id && l.status === 'pendente')
        .map(parcela => {
            const compra = comprasParceladas.find(c => c.id === parcela.compra_parcelada_id);
            if (!compra) return null;
            return {
                id: `v_${parcela.id}`, 
                descricao: parcela.descricao, 
                valor: parcela.valor,
                data: parcela.data_vencimento, 
                categoria: compra.categoria, 
                conta_id: compra.conta_id,
                tipo: 'despesa', 
                isVirtual: true
            };
        }).filter(Boolean);
};

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
    button.innerHTML = isLoading 
        ? `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>` 
        : originalText;
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

// =========================================================================
// === RENDERIZADORES DE COMPONENTES ===
// =========================================================================

// 1. Renderiza Cards de Contas
export const renderContas = () => {
    const container = document.getElementById('accounts-container');
    const { contas, transacoes } = getState();

    const headerHtml = `
        <div class="d-flex justify-content-end mb-3">
            <button id="btn-manage-categories" class="btn btn-outline-primary btn-sm">
                <i class="fas fa-tags me-2"></i>Gerenciar Categorias
            </button>
        </div>
    `;

    if (!contas || !contas.length) {
        container.innerHTML = headerHtml + '<p class="text-center text-body-secondary p-3">Nenhuma conta cadastrada.</p>';
        return;
    }

    const ACCOUNT_TYPE_ICONS = {
        'Conta Corrente': 'fas fa-university',
        'Cartão de Crédito': 'far fa-credit-card',
        'Dinheiro': 'fas fa-money-bill-wave',
        'Poupança': 'fas fa-piggy-bank',
        'default': 'fas fa-wallet'
    };

    const cardsHtml = contas.map(conta => {
        const saldo = transacoes
            .filter(t => t.conta_id === conta.id)
            .reduce((acc, t) => t.tipo === 'receita' ? acc + t.valor : acc - t.valor, conta.saldo_inicial);

        const iconClass = ACCOUNT_TYPE_ICONS[conta.tipo] || ACCOUNT_TYPE_ICONS['default'];

        let acoesEspecificas = '';
        if (isTipoCartao(conta.tipo)) {
            acoesEspecificas = `
                <button class="btn btn-outline-secondary btn-sm" data-action="ver-fatura" data-id="${conta.id}" title="Ver Fatura">
                    <i class="fas fa-receipt fa-fw"></i>
                </button>`;
        } else {
            acoesEspecificas = `
                <button class="btn btn-outline-secondary btn-sm" data-action="ver-extrato" data-id="${conta.id}" title="Ver Extrato">
                    <i class="fas fa-chart-bar fa-fw"></i>
                </button>`;
        }

        const botoesGerais = `
            <button class="btn btn-outline-secondary btn-sm" data-action="editar-conta" data-id="${conta.id}" title="Editar">
                <i class="fas fa-pen fa-fw"></i>
            </button>
            <button class="btn btn-outline-danger btn-sm" data-action="deletar-conta" data-id="${conta.id}" title="Deletar">
                <i class="fas fa-trash-can fa-fw"></i>
            </button>
        `;

        return `
            <div class="card shadow-sm mb-2">
                <div class="card-body p-3">
                    <div class="d-flex align-items-center">
                        <div class="me-3 fs-2 text-primary opacity-75">
                            <i class="${iconClass}"></i>
                        </div>
                        <div class="flex-grow-1">
                            <div class="fw-bold">${conta.nome}</div>
                            <small class="text-body-secondary">${conta.tipo}</small>
                        </div>
                        <div class="text-end">
                            <span class="fw-bold fs-5 ${saldo >= 0 ? 'income-text' : 'expense-text'}">${formatarMoeda(saldo)}</span>
                        </div>
                    </div>
                    <div class="d-flex justify-content-end gap-1 border-top pt-2 mt-2">
                        ${acoesEspecificas}
                        ${botoesGerais}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = headerHtml + `
        <div class="p-1" style="max-height: 550px; overflow-y: auto; padding-right: 5px;">
            ${cardsHtml}
        </div>`;
};

// 2. Renderiza Formulário de Transação Rápida
export const renderFormTransacaoRapida = () => {
    const container = document.getElementById('form-transacao-unificada');
    if (!container) return;
    
    const contas = getContas();
    const contasOptions = contas.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
    const categoriasOptions = getCategoriaOptionsHTML();

    container.innerHTML = `
        <div class="mb-3">
            <label for="tipo-compra" class="form-label">Tipo de Compra</label>
            <select id="tipo-compra" name="tipo_compra" class="form-select form-select-sm">
                <option value="vista">À Vista</option>
                <option value="parcelada">Parcelada</option>
                <option value="recorrente">Recorrente</option>
            </select>
        </div>
        <div class="mb-3">
            <label class="form-label">Descrição</label>
            <input type="text" name="descricao" class="form-control form-control-sm" required>
        </div>
        <div class="mb-3">
            <label for="tipo-transacao" class="form-label">Tipo</label>
            <select id="tipo-transacao" name="tipo" class="form-select form-select-sm">
                <option value="despesa" selected>Despesa (Débito)</option>
                <option value="receita">Receita (Crédito)</option>
            </select>
        </div>
        <div class="mb-3">
            <label id="label-valor" class="form-label">Valor</label>
            <input type="number" name="valor" min="0" step="0.01" class="form-control form-control-sm" required>
        </div>
        <div class="mb-3" id="group-data">
            <label id="label-data" class="form-label">Data</label>
            <input type="date" name="data" value="${toISODateString(new Date())}" class="form-control form-control-sm" required>
        </div>
        <div class="mb-3" id="group-conta">
            <label id="label-conta" class="form-label">Conta</label>
            <select name="conta_id" class="form-select form-select-sm" required>${contasOptions}</select>
        </div>
        <div id="parcelada-fields" class="extra-fields">
            <div class="mb-3">
                <label class="form-label">Nº de Parcelas</label>
                <input name="numero_parcelas" type="number" min="2" class="form-control form-control-sm">
            </div>
        </div>
        <div id="recorrente-fields" class="extra-fields">
            <div class="mb-3">
                <label class="form-label">Frequência</label>
                <select name="frequencia" class="form-select form-select-sm">
                    <option value="diaria">Diária</option>
                    <option value="quinzenal">Quinzenal</option>
                    <option value="mensal" selected>Mensal</option>
                    <option value="anual">Anual</option>
                </select>
            </div>
            <div class="mb-3" id="group-dia-vencimento">
                <label class="form-label">Dia do Vencimento</label>
                <input name="dia_vencimento" type="number" min="1" max="31" value="10" class="form-control form-control-sm">
            </div>
            <div class="mb-3">
                <label class="form-label">Quantidade</label>
                <input name="quantidade" type="number" min="1" value="12" class="form-control form-control-sm">
            </div>
        </div>
        <div class="mb-3">
            <label class="form-label">Categoria</label>
            <select name="categoria" class="form-select form-select-sm" required>${categoriasOptions}</select>
        </div>
        <button type="submit" class="btn btn-primary w-100">Salvar Transação</button>
    `;

    const selectConta = container.querySelector('select[name="conta_id"]');
    if (selectConta) { selectConta.dataset.allOptions = contasOptions; }
};

// =========================================================================
// === ABA: PLANEJAMENTO ANUAL ===
// =========================================================================

export const renderAnnualPlanningTab = () => {
    const container = document.getElementById('planning-tab-pane');
    if (!container) return;

    container.innerHTML = `
        <div class="p-3">
            <div class="d-flex justify-content-between align-items-center mb-3">
                <div class="d-flex align-items-center bg-white border rounded px-2 py-1">
                    <button class="btn btn-link text-decoration-none p-0 text-dark" id="btn-prev-year">
                        <i class="fas fa-chevron-left"></i>
                    </button>
                    <span class="mx-3 fw-bold fs-5" id="label-planning-year">${currentPlanningYear}</span>
                    <button class="btn btn-link text-decoration-none p-0 text-dark" id="btn-next-year">
                        <i class="fas fa-chevron-right"></i>
                    </button>
                </div>
                <div class="btn-group" role="group">
                    <input type="radio" class="btn-check" name="btnradio" id="btn-view-chart" autocomplete="off" checked>
                    <label class="btn btn-outline-primary btn-sm" for="btn-view-chart"><i class="fas fa-chart-bar"></i> Gráfico</label>
                    <input type="radio" class="btn-check" name="btnradio" id="btn-view-table" autocomplete="off">
                    <label class="btn btn-outline-primary btn-sm" for="btn-view-table"><i class="fas fa-table"></i> Detalhado</label>
                </div>
            </div>
            <div id="panel-chart-view">
                <div style="height: 400px; position: relative;">
                    <canvas id="annual-mixed-chart"></canvas>
                </div>
                <div class="row text-center mt-4" id="chart-summary-footer"></div>
            </div>
            <div id="panel-table-view" class="table-responsive" style="display: none;"></div>
        </div>
    `;

    renderMixedChart();

    document.getElementById('btn-prev-year').addEventListener('click', () => { currentPlanningYear--; updatePlanningView(); });
    document.getElementById('btn-next-year').addEventListener('click', () => { currentPlanningYear++; updatePlanningView(); });
    document.getElementById('btn-view-chart').addEventListener('change', () => {
        document.getElementById('panel-chart-view').style.display = 'block';
        document.getElementById('panel-table-view').style.display = 'none';
        renderMixedChart();
    });
    document.getElementById('btn-view-table').addEventListener('change', () => {
        document.getElementById('panel-chart-view').style.display = 'none';
        document.getElementById('panel-table-view').style.display = 'block';
        renderDetailedTable();
    });
};

const updatePlanningView = () => {
    document.getElementById('label-planning-year').textContent = currentPlanningYear;
    if (document.getElementById('btn-view-chart').checked) renderMixedChart(); else renderDetailedTable();
};

const renderMixedChart = () => {
    const timelineData = calculateAnnualTimeline(getState(), currentPlanningYear);
    const labels = timelineData.map(d => d.mes.substring(0, 3).toUpperCase());
    const receitas = timelineData.map(d => d.receitas);
    const despesas = timelineData.map(d => d.despesas);
    const acumulado = timelineData.map(d => d.acumulado);
    const totalRec = receitas.reduce((a, b) => a + b, 0);
    const totalDesp = despesas.reduce((a, b) => a + b, 0);
    const saldoAno = totalRec - totalDesp;

    const elFooter = document.getElementById('chart-summary-footer');
    if(elFooter) {
        elFooter.innerHTML = `
            <div class="col-4"><small class="text-body-secondary">Receitas</small><h5 class="income-text">${formatarMoeda(totalRec)}</h5></div>
            <div class="col-4"><small class="text-body-secondary">Despesas</small><h5 class="expense-text">${formatarMoeda(totalDesp)}</h5></div>
            <div class="col-4"><small class="text-body-secondary">Resultado</small><h5 class="${saldoAno>=0?'income-text':'expense-text'}">${formatarMoeda(saldoAno)}</h5></div>
        `;
    }

    const ctx = document.getElementById('annual-mixed-chart')?.getContext('2d');
    if(!ctx) return;
    if (annualMixedChart) annualMixedChart.destroy();

    annualMixedChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                { label: 'Saldo Acumulado', data: acumulado, type: 'line', borderColor: '#4A5568', borderWidth: 2, tension: 0.3, pointRadius: 3, yAxisID: 'y1' },
                { label: 'Receitas', data: receitas, backgroundColor: 'rgba(56, 161, 105, 0.6)', order: 2 },
                { label: 'Despesas', data: despesas, backgroundColor: 'rgba(229, 62, 62, 0.6)', order: 3 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } },
            scales: { x: { grid: { display: false } }, y: { display: false }, y1: { display: false } }
        }
    });
};

const renderDetailedTable = () => {
    const container = document.getElementById('panel-table-view');
    if(!container) return;
    
    const data = calculateCategoryGrid(getState(), currentPlanningYear);
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    
    const styleStickyHeader = 'position: sticky; top: 0; z-index: 10;';
    const styleStickyCol = 'position: sticky; left: 0; z-index: 5; border-right: 2px solid #ccc;';
    const headerCols = meses.map(m => `<th class="text-center py-2 border text-uppercase" style="min-width: 90px; background-color: #e0e0e0;">${m}</th>`).join('');

    const createRows = (objData) => Object.keys(objData).sort().map(cat => {
        const cols = objData[cat].map(v => `<td class="text-end small border px-1">${v===0?'-':formatarMoeda(v).replace('R$', '')}</td>`).join('');
        return `<tr><td class="fw-bold small ps-2 bg-white border" style="${styleStickyCol}">${cat}</td>${cols}</tr>`;
    }).join('');

    const renderSummaryRow = (label, values, bgClass = '', textClass = 'text-dark') => {
        const cols = values.map(v => `<td class="text-end fw-bold border px-1 ${textClass}" style="font-size:0.85rem;">${formatarMoeda(v).replace('R$', '')}</td>`).join('');
        return `<tr class="${bgClass}"><td class="fw-bold ps-2 border" style="${styleStickyCol} background-color: inherit;">${label}</td>${cols}</tr>`;
    };

    const rowTotalEntradas = renderSummaryRow('Total Entradas', data.totalReceitas, 'table-info');
    const rowTotalSaidas = renderSummaryRow('Total Saídas', data.totalDespesas, 'bg-danger text-white');

    const rowResumoReceitas = renderSummaryRow('Receitas', data.totalReceitas, 'bg-white');
    const rowResumoInvest = renderSummaryRow('Investimentos', data.totalInvestimentos, 'bg-white');
    const rowResumoSaldos = renderSummaryRow('Saldos de contas', data.totalSaldosConta, 'bg-white');
    const rowResumoDespesas = renderSummaryRow('Despesas', data.totalDespesas, 'bg-danger', 'text-white');
    const rowResumoLiquido = renderSummaryRow('Saldo Liquido', data.saldoLiquido, 'table-primary');

    container.innerHTML = `
        <div class="table-responsive" style="max-height: 600px; border: 1px solid #ccc;">
            <table class="table table-sm mb-0" style="font-size: 0.8rem; border-collapse: separate; border-spacing: 0;">
                <thead style="${styleStickyHeader}">
                    <tr><th class="ps-2 bg-secondary text-white border" style="${styleStickyCol} min-width: 150px; z-index: 11;">PERIODO</th>${headerCols}</tr>
                </thead>
                <tbody>
                    <tr class="table-info"><td colspan="13" class="fw-bold ps-2 text-primary">RECEITAS</td></tr>
                    ${createRows(data.receitas)}
                    ${rowTotalEntradas}
                    <tr class="table-danger"><td colspan="13" class="fw-bold ps-2 text-danger">DESPESAS</td></tr>
                    ${createRows(data.despesas)}
                    ${rowTotalSaidas}
                    <tr class="table-secondary"><td colspan="13" class="fw-bold ps-2 text-uppercase border-top border-dark border-2">RESUMO DO CAIXA</td></tr>
                    ${rowResumoReceitas}
                    ${rowResumoInvest}
                    ${rowResumoSaldos}
                    ${rowResumoDespesas}
                    ${rowResumoLiquido}
                </tbody>
            </table>
        </div>`;
};

// =========================================================================
// === DASHBOARDS E GRÁFICOS (MENSAL/ANUAL/SAÚDE) ===
// =========================================================================

export const renderVisaoMensal = () => {
    const container = document.getElementById('dashboard-monthly-container');
    if (!container) return;
    const metrics = calculateFinancialHealthMetrics(getState(), currentDashboardMonth);

    container.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-4">
            <h5 class="mb-0">Resumo do Mês</h5>
            <input type="month" id="dashboard-month-picker" class="form-control form-control-sm w-auto" value="${currentDashboardMonth}">
        </div>
        <div class="row text-center mb-4 g-2">
            <div class="col-md-4"><div class="card border-0 shadow-sm h-100 bg-success-subtle"><div class="card-body py-2"><small class="text-success-emphasis fw-bold">RECEITAS PREVISTAS</small><h4 class="mb-0 text-success">${formatarMoeda(metrics.rendaPrevistaTotal)}</h4><small style="font-size: 0.75rem" class="text-muted">Realizado: ${formatarMoeda(metrics.rendaRealizada)}</small></div></div></div>
            <div class="col-md-4"><div class="card border-0 shadow-sm h-100 bg-danger-subtle"><div class="card-body py-2"><small class="text-danger-emphasis fw-bold">DESPESAS PREVISTAS</small><h4 class="mb-0 text-danger">${formatarMoeda(metrics.despesaPrevistaTotal)}</h4><small style="font-size: 0.75rem" class="text-muted">Realizado: ${formatarMoeda(metrics.despesaRealizada)}</small></div></div></div>
            <div class="col-md-4"><div class="card border-0 shadow-sm h-100 ${metrics.saldoPrevisto >= 0 ? 'bg-primary-subtle' : 'bg-warning-subtle'}"><div class="card-body py-2"><small class="text-primary-emphasis fw-bold">SALDO PREVISTO</small><h4 class="mb-0 ${metrics.saldoPrevisto >= 0 ? 'text-primary' : 'text-danger'}">${formatarMoeda(metrics.saldoPrevisto)}</h4><small style="font-size: 0.75rem" class="text-muted">Líquido do Mês</small></div></div></div>
        </div>
        <div class="row">
            <div class="col-lg-7 mb-3"><div class="card shadow-sm h-100"><div class="card-header bg-white"><h6 class="mb-0">Fluxo de Caixa Diário</h6></div><div class="card-body"><div style="height: 250px;"><canvas id="daily-evolution-chart"></canvas></div></div></div></div>
            <div class="col-lg-5 mb-3"><div class="card shadow-sm h-100"><div class="card-header bg-white"><h6 class="mb-0">Despesas por Categoria</h6></div><div class="card-body"><div style="height: 250px;"><canvas id="summary-chart-monthly"></canvas></div></div></div></div>
        </div>
    `;

    document.getElementById('dashboard-month-picker').addEventListener('change', (e) => {
        currentDashboardMonth = e.target.value;
        renderVisaoMensal();
    });
    renderDailyChart();
    renderCategoryChart();
};

const renderDailyChart = () => {
    const ctx = document.getElementById('daily-evolution-chart')?.getContext('2d');
    if (!ctx) return;
    if (dailyChart) dailyChart.destroy();
    const dailyData = calculateDailyEvolution(getState(), currentDashboardMonth);
    const labels = dailyData.map(d => d.dia);
    const dataAcumulado = dailyData.map(d => d.acumulado);
    dailyChart = new Chart(ctx, {
        type: 'line', data: {labels: labels, datasets: [{label: 'Saldo Acumulado', data: dataAcumulado, borderColor: '#0d6efd', backgroundColor: 'rgba(13, 110, 253, 0.1)', fill: true, tension: 0.4}]},
        options: {responsive: true, maintainAspectRatio: false, scales: {x: {grid: {display: false}}}}
    });
};

const renderCategoryChart = () => {
    const ctx = document.getElementById('summary-chart-monthly')?.getContext('2d');
    if (!ctx) return;
    if (summaryChart) summaryChart.destroy();
    const { transacoes, lancamentosFuturos } = getState();
    const despesasMap = {};
    transacoes.filter(t => t.data.startsWith(currentDashboardMonth) && t.tipo === 'despesa').forEach(t => { despesasMap[t.categoria] = (despesasMap[t.categoria] || 0) + t.valor; });
    lancamentosFuturos.filter(l => l.data_vencimento.startsWith(currentDashboardMonth) && l.tipo === 'a_pagar' && l.status === 'pendente').forEach(l => { despesasMap[l.categoria] = (despesasMap[l.categoria] || 0) + l.valor; });
    if (Object.keys(despesasMap).length > 0) {
        summaryChart = new Chart(ctx, { type: 'doughnut', data: {labels: Object.keys(despesasMap), datasets: [{data: Object.values(despesasMap), backgroundColor: CHART_COLORS}]}, options: {responsive: true, maintainAspectRatio: false, plugins: {legend: {position: 'bottom', labels: {boxWidth: 12, font: {size: 10}}}}} });
    }
};

export const renderVisaoAnual = () => {
    const container = document.getElementById('dashboard-yearly-container');
    if (!container) return;
    const timelineData = calculateAnnualTimeline(getState(), new Date().getFullYear());
    const labels = timelineData.map(d => d.mes.substring(0, 3));
    const receitas = timelineData.map(d => d.receitas);
    const despesas = timelineData.map(d => d.despesas);
    container.innerHTML = `<h5 class="mb-3">Fluxo de Caixa (Real + Previsto)</h5><div style="height: 300px;"><canvas id="annual-chart"></canvas></div>`;
    if(annualChart) annualChart.destroy();
    const ctx = document.getElementById('annual-chart')?.getContext('2d');
    if(ctx) {
        annualChart = new Chart(ctx, { type: 'bar', data: {labels: labels, datasets: [{label: 'Receitas', data: receitas, backgroundColor: 'rgba(25,135,84,0.7)'}, {label: 'Despesas', data: despesas, backgroundColor: 'rgba(220,53,69,0.7)'}]}, options: {responsive: true, maintainAspectRatio: false, scales: {y: {beginAtZero: true}}} });
    }
};

export const renderFinancialHealth = () => {
    const container = document.getElementById('health-tab-pane');
    if (!container) return;
    const metrics = calculateFinancialHealthMetrics(getState());
    const scoreColor = metrics.financialScore >= 75 ? 'success' : metrics.financialScore >= 40 ? 'warning' : 'danger';
    container.innerHTML = `<div class="row"><div class="col-12"><div class="card mb-3"><div class="card-body text-center"><h5 class="card-title">Score de Saúde Financeira</h5><div class="progress mx-auto my-3" style="height: 25px; max-width: 400px;"><div class="progress-bar bg-${scoreColor}" role="progressbar" style="width: ${metrics.financialScore.toFixed(0)}%;">${metrics.financialScore.toFixed(0)} / 100</div></div></div></div></div></div><div class="row"><div class="col-lg-6 mb-3"><div class="card h-100"><div class="card-header"><h6 class="mb-0">Patrimônio Líquido</h6></div><ul class="list-group list-group-flush"><li class="list-group-item d-flex justify-content-between"><span>Ativos</span> <span class="text-success">${formatarMoeda(metrics.totalAtivos)}</span></li><li class="list-group-item d-flex justify-content-between"><span>Passivos</span> <span class="text-danger">${formatarMoeda(metrics.totalPassivos)}</span></li><li class="list-group-item d-flex justify-content-between"><strong>Total</strong> <strong>${formatarMoeda(metrics.patrimonioLiquido)}</strong></li></ul></div></div><div class="col-lg-6 mb-3"><div class="card h-100"><div class="card-header"><h6 class="mb-0">Evolução do Patrimônio</h6></div><div class="card-body"><canvas id="net-worth-chart"></canvas></div></div></div></div>`;
    if (netWorthChart) netWorthChart.destroy();
    const nwCtx = document.getElementById('net-worth-chart')?.getContext('2d');
    if (nwCtx && metrics.historicoPatrimonio.length) {
        netWorthChart = new Chart(nwCtx, { type: 'line', data: {labels: metrics.historicoPatrimonio.map(h => h.mes), datasets: [{label: 'Patrimônio', data: metrics.historicoPatrimonio.map(h => h.valor), borderColor: '#4A5568', tension: 0.1, fill: false}]}, options: {responsive: true, maintainAspectRatio: false} });
    }
};

// =========================================================================
// === RENDERIZADORES DE LISTAS (FILTROS, CARDS, EXTRATOS) ===
// =========================================================================

export const renderFilters = (type, currentFilters = {}) => {
    const container = document.getElementById(`${type}-filters-container`);
    if (!container) return;
    const contas = getContas();
    const accountOptions = contas.map(conta => `<option value="${conta.id}" ${currentFilters.contaId == conta.id ? 'selected' : ''}>${conta.nome}</option>`).join('');
    const data = type === 'bills' ? getState().lancamentosFuturos : [...getState().transacoes, ...gerarTransacoesVirtuais()];
    const dateKey = type === 'bills' ? 'data_vencimento' : 'data';
    const availableMonths = [...new Set(data.map(item => item[dateKey]?.substring(0, 7)))].filter(Boolean).sort().reverse();
    const monthOptions = availableMonths.map(mes => { const [ano, mesNum] = mes.split('-'); return `<option value="${mes}" ${currentFilters.mes === mes ? 'selected' : ''}>${new Date(ano, mesNum - 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}</option>`; }).join('');
    container.innerHTML = `<div class="row g-2 mb-3"><div class="col-md-4"><select class="form-select form-select-sm" id="${type}-month-filter"><option value="todos" ${!currentFilters.mes || currentFilters.mes === 'todos' ? 'selected' : ''}>Todos os Meses</option>${monthOptions}</select></div><div class="col-md-4"><select class="form-select form-select-sm" id="${type}-account-filter"><option value="todas" ${!currentFilters.contaId || currentFilters.contaId === 'todas' ? 'selected' : ''}>Todas as Contas</option>${accountOptions}</select></div><div class="col-md-4"><input type="search" class="form-control form-control-sm" id="${type}-search-input" placeholder="Pesquisar..." value="${currentFilters.pesquisa || ''}"></div></div>`;
};

const renderSummaryPanel = (containerId, items, type) => {
    const container = document.getElementById(containerId);
    if (!container) return;
    const isHistory = type === 'history';
    const totalReceitas = isHistory ? items.filter(t => t.tipo === 'receita').reduce((s, t) => s + t.valor, 0) : items.filter(t => t.tipo === 'a_receber').reduce((s, t) => s + t.valor, 0);
    const totalDespesas = isHistory ? items.filter(t => t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0) : items.filter(t => t.tipo === 'a_pagar').reduce((s, t) => s + t.valor, 0);
    const saldo = totalReceitas - totalDespesas;
    container.innerHTML = `<div class="alert alert-light py-2"><div class="d-flex justify-content-around flex-wrap small text-center"><span>Itens: <strong>${items.length}</strong></span><span class="income-text">${isHistory ? 'Receitas' : 'A Receber'}: <strong>${formatarMoeda(totalReceitas)}</strong></span><span class="expense-text">${isHistory ? 'Despesas' : 'A Pagar'}: <strong>${formatarMoeda(totalDespesas)}</strong></span>${isHistory ? `<span>Saldo: <strong class="${saldo >= 0 ? 'income-text' : 'expense-text'}">${formatarMoeda(saldo)}</strong></span>` : ''}</div></div>`;
};

const renderTransactionCard = (t) => {
    const conta = getContaPorId(t.conta_id);
    const icon = CATEGORY_ICONS[t.categoria] || CATEGORY_ICONS['Outros'];
    const isPendente = t.isPending === true; 
    const dataExibicao = t.data || t.data_vencimento; 
    const collapseId = `collapse-trans-${t.id || Math.random().toString(36).substr(2, 9)}`;
    const statusBadge = isPendente ? '<span class="badge bg-warning text-dark me-2">Pendente</span>' : '<span class="badge bg-success me-2">Realizado</span>';
    const opacityClass = isPendente ? 'opacity-75' : '';
    const extraBtn = (t.compra_parcelada_id) ? `<button class="btn btn-outline-secondary btn-sm" data-action="recriar-compra-parcelada" data-id="${t.compra_parcelada_id}" title="Configurar Série"><i class="fas fa-cog"></i></button>` : '';
    let actions = isPendente ? `<div class="btn-group"><button class="btn ${t.tipo==='a_receber'?'btn-primary':'btn-success'} btn-sm" data-action="pagar-conta" data-id="${t.id}" title="${t.tipo==='a_receber'?'Receber':'Pagar'}"><i class="fas fa-check"></i></button><button class="btn btn-outline-secondary btn-sm" data-action="editar-lancamento" data-id="${t.id}"><i class="fas fa-edit"></i></button>${extraBtn}<button class="btn btn-outline-danger btn-sm" data-action="deletar-lancamento" data-id="${t.id}" title="Apagar"><i class="fas fa-trash"></i></button></div>` : `<div class="btn-group"><button class="btn btn-outline-secondary btn-sm" data-action="editar-transacao" data-id="${t.id}"><i class="fas fa-edit"></i></button>${extraBtn}<button class="btn btn-outline-danger btn-sm" data-action="deletar-transacao" data-id="${t.id}"><i class="fas fa-trash"></i></button></div>`;
    const sinal = (t.tipo === 'despesa' || t.tipo === 'a_pagar') ? '-' : '+';
    const corValor = (t.tipo === 'despesa' || t.tipo === 'a_pagar') ? 'expense-text' : 'income-text';
    return `<div class="accordion-item ${opacityClass}"><h2 class="accordion-header"><button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}"><div class="d-flex w-100 align-items-center"><span class="transaction-icon-wrapper me-3" style="background-color:${icon.color};"><i class="${icon.icon}"></i></span><div class="flex-grow-1"><span>${t.descricao}</span><div class="small">${statusBadge}</div></div><span class="ms-auto fw-bold ${corValor}">${sinal} ${formatarMoeda(t.valor)}</span></div></button></h2><div id="${collapseId}" class="accordion-collapse collapse"><div class="accordion-body d-flex justify-content-between align-items-center"><div><small class="text-body-secondary"><i class="fas fa-calendar-alt"></i> ${new Date(dataExibicao + 'T12:00:00').toLocaleDateString('pt-BR')} | <i class="fas fa-tag"></i> ${t.categoria} | <i class="fas fa-wallet"></i> ${conta ? conta.nome : 'N/A'}</small></div>${actions}</div></div></div>`;
};

const renderBillItem = (bill, compras) => {
    const isParcela = !!bill.compra_parcelada_id;
    let cat = bill.categoria;
    let isSerie = false;
    if (isParcela) { const c = compras.find(compra => compra.id === bill.compra_parcelada_id); if(c) { cat = c.categoria; if (c.descricao && c.descricao.includes('(Série)')) isSerie = true; } }
    const icon = CATEGORY_ICONS[cat] || CATEGORY_ICONS['Outros'];
    const collapseId = `collapse-bill-${bill.id}`;
    const extraButton = isParcela ? `<button class="btn btn-outline-secondary btn-sm" data-action="recriar-compra-parcelada" data-id="${bill.compra_parcelada_id}" title="Configurar Série"><i class="fas fa-cog"></i></button>` : '';
    let linkText = '';
    if (isParcela) linkText = isSerie ? '<br><small class="text-success"><i class="fas fa-sync-alt"></i> Série Recorrente</small>' : '<br><small class="text-info"><i class="fas fa-credit-card"></i> Compra Parcelada</small>';
    const isReceita = bill.tipo === 'a_receber';
    const payButtonClass = isReceita ? 'btn-primary' : 'btn-success';
    const payButtonIcon = isReceita ? 'fas fa-hand-holding-usd' : 'fas fa-check';
    return `<div class="accordion-item"><h2 class="accordion-header"><button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}"><div class="d-flex w-100 align-items-center"><span class="transaction-icon-wrapper me-3" style="background-color:${icon.color};"><i class="${icon.icon}"></i></span><span>${bill.descricao}</span><span class="ms-auto fw-bold ${bill.tipo === 'a_pagar' ? 'expense-text' : 'income-text'}">${formatarMoeda(bill.valor)}</span></div></button></h2><div id="${collapseId}" class="accordion-collapse collapse"><div class="accordion-body d-flex justify-content-between align-items-center"><div><small class="text-body-secondary">Vencimento: ${new Date(bill.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR')}</small>${linkText}</div><div class="btn-group"><button class="btn ${payButtonClass} btn-sm" data-action="pagar-conta" data-id="${bill.id}"><i class="${payButtonIcon}"></i></button><button class="btn btn-outline-secondary btn-sm" data-action="editar-lancamento" data-id="${bill.id}"><i class="fas fa-edit"></i></button>${extraButton}<button class="btn btn-outline-danger btn-sm" data-action="deletar-lancamento" data-id="${bill.id}" data-compra-id="${bill.compra_parcelada_id || ''}"><i class="fas fa-trash"></i></button></div></div></div></div>`;
};

export const renderLancamentosFuturos = (page = 1, filters) => {
    const container = document.getElementById('bills-list-container');
    if (!container) return;
    const { lancamentosFuturos, comprasParceladas } = getState();
    const filtrados = lancamentosFuturos.filter(l => l.status === 'pendente').filter(l => (filters.mes === 'todos' || !filters.mes) || l.data_vencimento.startsWith(filters.mes)).filter(l => {if (filters.contaId === 'todas' || !filters.contaId) return true; const compra = comprasParceladas.find(c => c.id === l.compra_parcelada_id); return compra && compra.conta_id == filters.contaId;}).filter(l => l.descricao.toLowerCase().includes((filters.pesquisa || '').toLowerCase())).sort((a,b) => new Date(a.data_vencimento) - new Date(b.data_vencimento));
    renderSummaryPanel('bills-summary-panel', filtrados, 'bills');
    const paginados = filtrados.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
    if (!paginados.length) { container.innerHTML = '<p class="text-center text-body-secondary p-3">Nenhum lançamento futuro encontrado.</p>'; return; }
    container.innerHTML = paginados.map(l => renderBillItem(l, comprasParceladas)).join('');
};

export const renderHistoricoTransacoes = (page = 1, filters) => {
    const container = document.getElementById('history-list-container');
    if (!container) return;
    const transacoesCompletas = [...getState().transacoes, ...gerarTransacoesVirtuais()];
    const filtrados = transacoesCompletas.filter(t => (filters.mes === 'todos' || !filters.mes) || t.data.startsWith(filters.mes)).filter(t => (filters.contaId === 'todas' || !filters.contaId) || t.conta_id == filters.contaId).filter(t => t.descricao.toLowerCase().includes((filters.pesquisa || '').toLowerCase())).sort((a,b) => new Date(b.data) - new Date(a.data));
    renderSummaryPanel('history-summary-panel', filtrados, 'history');
    const paginados = filtrados.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
    if (!paginados.length) { container.innerHTML = '<p class="text-center text-body-secondary p-3">Nenhuma transação encontrada.</p>'; return; }
    container.innerHTML = paginados.map(renderTransactionCard).join('');
};

// --- MODAIS ---
export const getAccountModalContent = (id = null) => {
    const conta = id ? getContaPorId(id) : {};
    const title = id ? 'Editar Conta' : 'Nova Conta';
    const tipos = getTiposContas();
    const options = tipos.map(t => `<option value="${t.nome}" data-is-card="${t.e_cartao}" ${conta.tipo === t.nome ? 'selected' : ''}>${t.nome}</option>`).join('');
    const currentIsCard = conta.tipo ? isTipoCartao(conta.tipo) : (tipos[0] ? tipos[0].e_cartao : false);
    const body = `<form id="form-conta" data-id="${id || ''}"><div class="mb-3"><label class="form-label">Nome da Conta</label><input name="nome" class="form-control" value="${conta.nome || ''}" required></div><div class="mb-3"><label class="form-label d-flex justify-content-between">Tipo de Conta <a href="#" id="link-manage-types" class="small text-decoration-none">Gerenciar Tipos</a></label><select name="tipo" id="conta-tipo" class="form-select">${options}</select></div><div class="mb-3"><label class="form-label">Saldo Inicial</label><input name="saldo_inicial" type="number" step="0.01" class="form-control" value="${conta.saldo_inicial || 0}" ${id ? 'disabled' : ''}></div><div id="cartao-credito-fields" style="display: ${currentIsCard ? 'block' : 'none'};"><div class="mb-3"><label class="form-label">Dia do Fechamento</label><input name="dia_fechamento_cartao" type="number" min="1" max="31" class="form-control" value="${conta.dia_fechamento_cartao || ''}" placeholder="Ex: 20"></div><div class="mb-3"><label class="form-label">Dia do Vencimento</label><input name="dia_vencimento_cartao" type="number" min="1" max="31" class="form-control" value="${conta.dia_vencimento_cartao || ''}" placeholder="Ex: 28"></div></div><div class="text-end"><button type="submit" class="btn btn-primary">Salvar</button></div></form>`;
    return { title, body };
};
export const getCategoriesModalContent = () => {
    const categorias = getCategorias();
    const listaHtml = categorias.map(c => `<li class="list-group-item d-flex justify-content-between align-items-center"><span>${c.nome}</span><div class="btn-group"><button class="btn btn-sm btn-outline-secondary" data-action="editar-categoria" data-id="${c.id}" data-nome="${c.nome}"><i class="fas fa-pen"></i></button><button class="btn btn-sm btn-outline-danger" data-action="deletar-categoria" data-id="${c.id}"><i class="fas fa-trash"></i></button></div></li>`).join('');
    const body = `<form id="form-nova-categoria" class="mb-4 d-flex gap-2"><input type="text" name="nome" class="form-control" placeholder="Nova Categoria..." required><button type="submit" class="btn btn-success"><i class="fas fa-plus"></i></button></form><div style="max-height: 300px; overflow-y: auto;"><ul class="list-group list-group-flush" id="lista-categorias-modal">${listaHtml}</ul></div>`;
    return { title: 'Gerenciar Categorias', body };
};
export const getEditCategoryModalContent = (id, nomeAtual) => {
    const body = `<div class="alert alert-warning small"><i class="fas fa-exclamation-triangle"></i> Alterar o nome atualizará todo o histórico.</div><form id="form-editar-categoria" data-id="${id}" data-nome-antigo="${nomeAtual}"><div class="mb-3"><label class="form-label">Nome da Categoria</label><input type="text" name="nome" class="form-control" value="${nomeAtual}" required></div><div class="text-end"><button type="submit" class="btn btn-primary">Salvar</button></div></form>`;
    return { title: 'Editar Categoria', body };
};
export const getAccountTypesModalContent = () => {
    const tipos = getTiposContas();
    const listaHtml = tipos.map(t => `<li class="list-group-item d-flex justify-content-between align-items-center"><div><span>${t.nome}</span>${t.e_cartao ? '<span class="badge bg-info text-dark ms-2" style="font-size:0.6rem">Cartão</span>' : ''}</div><button class="btn btn-sm btn-outline-danger" data-action="deletar-tipo-conta" data-id="${t.id}"><i class="fas fa-trash"></i></button></li>`).join('');
    const body = `<form id="form-novo-tipo-conta" class="mb-4"><div class="input-group mb-2"><input type="text" name="nome" class="form-control" placeholder="Novo Tipo..." required><button type="submit" class="btn btn-success"><i class="fas fa-plus"></i></button></div><div class="form-check"><input class="form-check-input" type="checkbox" name="e_cartao" id="check-e-cartao"><label class="form-check-label small" for="check-e-cartao">Funciona como Cartão de Crédito?</label></div></form><div style="max-height: 300px; overflow-y: auto;"><ul class="list-group list-group-flush">${listaHtml}</ul></div>`;
    return { title: 'Gerenciar Tipos de Conta', body };
};
export const getBillModalContent = (id = null) => {
    const bill = id ? getState().lancamentosFuturos.find(l => l.id === id) : {};
    const title = id ? 'Editar Parcela' : 'Novo Lançamento';
    const isParcela = !!bill.compra_parcelada_id;
    const categoriasOptions = getCategoriaOptionsHTML(bill.categoria);
    const warning = isParcela ? `<div class="alert alert-info small"><i class="fas fa-info-circle"></i> Editando parcela.</div>` : '';
    const body = `<form id="form-lancamento" data-id="${id || ''}">${warning}<div class="mb-3"><label class="form-label">Descrição</label><input name="descricao" value="${bill.descricao || ''}" class="form-control" required></div><div class="mb-3"><label class="form-label">Valor</label><input name="valor" type="number" step="0.01" value="${bill.valor || ''}" class="form-control" required></div><div class="mb-3"><label class="form-label">Data Vencimento</label><input name="data_vencimento" type="date" value="${bill.data_vencimento || toISODateString(new Date())}" class="form-control" required></div><div class="mb-3"><label class="form-label">Categoria</label><select name="categoria" class="form-select">${categoriasOptions}</select></div><div class="mb-3"><label class="form-label">Tipo</label><select name="tipo" class="form-select"><option value="a_pagar" ${bill.tipo==='a_pagar'?'selected':''}>A Pagar</option><option value="a_receber" ${bill.tipo==='a_receber'?'selected':''}>A Receber</option></select></div><div class="text-end"><button type="submit" class="btn btn-primary">Salvar</button></div></form>`;
    return { title, body };
};
export const getTransactionModalContent = (id) => {
    const transacao = getState().transacoes.find(t => t.id === id);
    if (!transacao) return { title: 'Erro', body: '<p>Transação não encontrada.</p>' };
    const contasOptions = getContas().map(c => `<option value="${c.id}" ${transacao.conta_id === c.id ? 'selected' : ''}>${c.nome}</option>`).join('');
    const categoriasOptions = getCategoriaOptionsHTML(transacao.categoria);
    const body = `<form id="form-edicao-transacao" data-id="${id}"><div class="mb-3"><label class="form-label">Descrição</label><input name="descricao" value="${transacao.descricao}" class="form-control" required></div><div class="mb-3"><label class="form-label">Valor</label><input name="valor" type="number" step="0.01" value="${transacao.valor}" class="form-control" required></div><div class="mb-3"><label class="form-label">Data</label><input name="data" type="date" value="${transacao.data}" class="form-control" required></div><div class="mb-3"><label class="form-label">Conta</label><select name="conta_id" class="form-select">${contasOptions}</select></div><div class="mb-3"><label class="form-label">Categoria</label><select name="categoria" class="form-select">${categoriasOptions}</select></div><div class="mb-3"><label class="form-label">Tipo</label><select name="tipo" class="form-select"><option value="despesa" ${transacao.tipo==='despesa'?'selected':''}>Despesa</option><option value="receita" ${transacao.tipo==='receita'?'selected':''}>Receita</option></select></div><div class="text-end"><button type="submit" class="btn btn-primary">Salvar Alterações</button></div></form>`;
    return { title, body };
};
export const getInstallmentPurchaseModalContent = (compra) => {
    if (!compra) return { title: 'Erro', body: '<p>Série não encontrada.</p>' };
    const conta = getContaPorId(compra.conta_id);
    const isCartao = conta && isTipoCartao(conta.tipo);
    const title = isCartao ? 'Reconfigurar Parcelamento' : 'Editar Série Recorrente';
    const contasOptions = getContas().map(c => `<option value="${c.id}" ${compra.conta_id === c.id ? 'selected' : ''}>${c.nome}</option>`).join('');
    const categoriasOptions = getCategoriaOptionsHTML(compra.categoria);
    let camposEspecificos = isCartao ? `<div class="mb-3"><label class="form-label">Número de Parcelas</label><input name="numero_parcelas" type="number" min="1" value="${compra.numero_parcelas}" class="form-control" required></div><div class="mb-3"><label class="form-label">Data da Compra Original</label><input name="data_inicio" type="date" value="${compra.data_compra}" class="form-control" required></div><input type="hidden" name="tipo_serie" value="parcelada">` : `<div class="row"><div class="col-6 mb-3"><label class="form-label">Frequência</label><select name="frequencia" class="form-select"><option value="mensal">Mensal</option><option value="quinzenal">Quinzenal</option><option value="semestral">Semestral</option><option value="anual">Anual</option></select></div><div class="col-6 mb-3"><label class="form-label">Qtde Restante</label><input name="quantidade" type="number" value="12" class="form-control"></div></div><div class="mb-3"><label class="form-label">Data do Próximo</label><input name="data_inicio" type="date" value="${toISODateString(new Date())}" class="form-control" required></div><input type="hidden" name="tipo_serie" value="recorrente">`;
    const body = `<div class="alert alert-info small"><i class="fas fa-info-circle"></i> Ao salvar, os lançamentos <strong>pendentes</strong> serão recriados. Histórico mantido.</div><form id="form-compra-parcelada" data-compra-antiga-id="${compra.id}"><div class="mb-3"><label class="form-label">Descrição</label><input name="descricao" value="${compra.descricao}" class="form-control" required></div><div class="mb-3"><label class="form-label">Valor (Novo)</label><input name="valor_total" type="number" step="0.01" value="${(compra.valor_total / (compra.numero_parcelas || 1)).toFixed(2)}" class="form-control" required></div>${camposEspecificos}<div class="mb-3"><label class="form-label">Conta</label><select name="conta_id" class="form-select" required>${contasOptions}</select></div><div class="mb-3"><label class="form-label">Categoria</label><select name="categoria" class="form-select" required>${categoriasOptions}</select></div><div class="text-end"><button type="submit" class="btn btn-primary">Atualizar Série</button></div></form>`;
    return { title, body };
};
export const getPayBillModalContent = (billId) => {
    const bill = getState().lancamentosFuturos.find(b=>b.id===billId);
    if (!bill) return { title: 'Erro', body: 'Lançamento não encontrado.' };
    const body = `<form id="form-pagamento" data-bill-id="${bill.id}" data-valor="${bill.valor}" data-desc="${bill.descricao}" data-cat="${bill.categoria || 'Contas'}"><p>Você está ${bill.tipo==='a_receber'?'recebendo':'pagando'} <strong>${bill.descricao}</strong> no valor de:</p><p class="h3 text-center my-3 ${bill.tipo==='a_receber'?'income-text':'expense-text'}">${formatarMoeda(bill.valor)}</p><div class="mb-3"><label class="form-label">Data</label><input type="date" name="data" value="${toISODateString(new Date())}" class="form-control"></div><div class="mb-3"><label class="form-label">Conta</label><select name="conta_id" class="form-select">${getContas().filter(c=>c.tipo!=='Cartão de Crédito').map(c=>`<option value="${c.id}">${c.nome}</option>`).join('')}</select></div><div class="text-end"><button type="submit" class="btn ${bill.tipo==='a_receber'?'btn-primary':'btn-success'}">${bill.tipo==='a_receber'?'Confirmar Recebimento':'Confirmar Pagamento'}</button></div></form>`;
    return { title, body };
};
export const getStatementModalContent = (contaId) => { const conta = getContaPorId(contaId); if (!conta) return { title: 'Erro', body: 'Conta não encontrada.' }; const { transacoes, lancamentosFuturos, comprasParceladas } = getState(); const meses = [...new Set([...transacoes.filter(t => t.conta_id === contaId).map(t => t.data.substring(0, 7)), ...lancamentosFuturos.filter(l => {if (!l.compra_parcelada_id) return false; const compra = comprasParceladas.find(c => c.id === l.compra_parcelada_id); return compra && compra.conta_id === contaId;}).map(l => l.data_vencimento.substring(0, 7))])].sort().reverse(); const options = meses.map(m => `<option value="${m}">${new Date(m.split('-')[0], m.split('-')[1]-1).toLocaleString('pt-BR', {month:'long', year:'numeric'})}</option>`).join(''); const body = `<div class="mb-3"><label>Selecione a Fatura:</label><select id="statement-month-select" class="form-select" data-conta-id="${contaId}"><option value="">Selecione...</option>${options}</select></div><div id="statement-details-container" class="mt-4"><p class="text-center text-body-secondary">Selecione um mês.</p></div>`; return { title: `Fatura - ${conta.nome}`, body }; };
export const renderStatementDetails = (contaId, mesSelecionado) => { const container = document.getElementById('statement-details-container'); if (!container || !mesSelecionado) return; const conta = getContaPorId(contaId); const transacoesCompletas = [...getState().transacoes, ...gerarTransacoesVirtuais()]; const diaFechamento = conta.dia_fechamento_cartao || 28; const [ano, mes] = mesSelecionado.split('-').map(Number); const fimCiclo = new Date(ano, mes - 1, diaFechamento, 12); const inicioCiclo = new Date(fimCiclo); inicioCiclo.setMonth(inicioCiclo.getMonth() - 1); const transacoesFatura = transacoesCompletas.filter(t => {const d = new Date(t.data + 'T12:00:00'); return t.conta_id === contaId && d > inicioCiclo && d <= fimCiclo && t.tipo === 'despesa';}).sort((a, b) => new Date(a.data) - new Date(b.data)); const totalFatura = transacoesFatura.reduce((acc, t) => acc + t.valor, 0); const itemsHtml = transacoesFatura.length ? transacoesFatura.map(renderTransactionCard).join('') : '<p class="text-center">Nenhuma despesa.</p>'; container.innerHTML = `<div><h5 class="d-flex justify-content-between"><span>Total:</span><span class="expense-text">${formatarMoeda(totalFatura)}</span></h5></div><div class="accordion mt-3">${itemsHtml}</div>`; };
export const getAccountStatementModalContent = (contaId) => { const conta = getContaPorId(contaId); if (!conta) return { title: 'Erro', body: 'Conta não encontrada.' }; const { transacoes } = getState(); const meses = [...new Set(transacoes.filter(t => t.conta_id === contaId).map(t => t.data.substring(0, 7)))].sort().reverse(); const options = meses.map(m => `<option value="${m}">${new Date(m.split('-')[0], m.split('-')[1]-1).toLocaleString('pt-BR', {month:'long', year:'numeric'})}</option>`).join(''); const body = `<div class="mb-3"><label>Selecione o Mês:</label><select id="account-statement-month-select" class="form-select" data-conta-id="${contaId}"><option value="">Selecione...</option>${options}</select></div><div id="account-statement-details-container" class="mt-4"><p class="text-center text-body-secondary">Selecione um mês.</p></div>`; return { title: `Extrato - ${conta.nome}`, body }; };
export const renderAccountStatementDetails = (contaId, mesSelecionado) => { const container = document.getElementById('account-statement-details-container'); if (!container || !mesSelecionado) return; const conta = getContaPorId(contaId); const { transacoes } = getState(); const [ano, mes] = mesSelecionado.split('-').map(Number); const inicioDoMes = new Date(ano, mes - 1, 1); const transacoesAnteriores = transacoes.filter(t => {const d = new Date(t.data + 'T12:00:00'); return t.conta_id === contaId && d < inicioDoMes;}); const saldoAnterior = transacoesAnteriores.reduce((acc, t) => t.tipo === 'receita' ? acc + t.valor : acc - t.valor, conta.saldo_inicial); const transacoesDoMes = transacoes.filter(t => t.conta_id === contaId && t.data.startsWith(mesSelecionado)).sort((a, b) => new Date(a.data) - new Date(b.data)); const totalEntradas = transacoesDoMes.filter(t => t.tipo === 'receita').reduce((acc, t) => acc + t.valor, 0); const totalSaidas = transacoesDoMes.filter(t => t.tipo === 'despesa').reduce((acc, t) => acc + t.valor, 0); const saldoFinal = saldoAnterior + totalEntradas - totalSaidas; const itemsHtml = transacoesDoMes.length ? transacoesDoMes.map(renderTransactionCard).join('') : '<p class="text-center">Sem transações.</p>'; container.innerHTML = `<ul class="list-group list-group-flush mb-3"><li class="list-group-item d-flex justify-content-between"><span>Saldo Anterior:</span> <span>${formatarMoeda(saldoAnterior)}</span></li><li class="list-group-item d-flex justify-content-between"><span>Entradas:</span> <span class="income-text">${formatarMoeda(totalEntradas)}</span></li><li class="list-group-item d-flex justify-content-between"><span>Saídas:</span> <span class="expense-text">${formatarMoeda(totalSaidas)}</span></li><li class="list-group-item d-flex justify-content-between fw-bold"><span>Final:</span> <span>${formatarMoeda(saldoFinal)}</span></li></ul><div class="accordion">${itemsHtml}</div>`; };

// =========================================================================
// === MASTER RENDERER ===
// =========================================================================

export const renderAllComponents = (initialFilters) => {
    renderContas();
    renderFormTransacaoRapida();
    renderVisaoMensal();
    renderVisaoAnual();
    renderFinancialHealth();
    renderFilters('bills', initialFilters.bills);
    renderLancamentosFuturos(1, initialFilters.bills);
    renderFilters('history', initialFilters.history);
    renderHistoricoTransacoes(1, initialFilters.history);
    renderMonthlyStatementTab();
    renderAnnualPlanningTab();
};
