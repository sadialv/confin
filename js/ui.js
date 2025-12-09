// ARQUIVO: js/ui.js
import { formatarMoeda, CATEGORIAS_PADRAO, toISODateString, CATEGORY_ICONS, CHART_COLORS } from './utils.js';
import { getState, getContaPorId, getContas, getCategorias, getTiposContas, isTipoCartao } from './state.js';
import { calculateFinancialHealthMetrics, calculateAnnualTimeline, calculateCategoryGrid } from './finance.js';

// --- VARIÁVEIS GLOBAIS (Controle de Gráficos e Estado de UI) ---
let summaryChart = null;
let annualChart = null;
let netWorthChart = null;
let avgSpendingChart = null;
let annualMixedChart = null;

// Estado local da UI para o ano de planejamento
let currentPlanningYear = new Date().getFullYear();

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

// 1. Renderiza Cards de Contas (Com Scrollbar)
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
            acoesEspecificas = `<button class="btn btn-outline-secondary btn-sm" data-action="ver-fatura" data-id="${conta.id}" title="Ver Fatura"><i class="fas fa-receipt fa-fw"></i></button>`;
        } else {
            acoesEspecificas = `<button class="btn btn-outline-secondary btn-sm" data-action="ver-extrato" data-id="${conta.id}" title="Ver Extrato"><i class="fas fa-chart-bar fa-fw"></i></button>`;
        }

        const botoesGerais = `
            <button class="btn btn-outline-secondary btn-sm" data-action="editar-conta" data-id="${conta.id}" title="Editar"><i class="fas fa-pen fa-fw"></i></button>
            <button class="btn btn-outline-danger btn-sm" data-action="deletar-conta" data-id="${conta.id}" title="Deletar"><i class="fas fa-trash-can fa-fw"></i></button>
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

    // Container com Scrollbar aplicada
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
// === ABA: PLANEJAMENTO ANUAL (GRÁFICO MISTO E TABELA) ===
// =========================================================================

export const renderAnnualPlanningTab = () => {
    const container = document.getElementById('planning-tab-pane');
    if (!container) return;

    container.innerHTML = `
        <div class="p-3">
            <div class="d-flex justify-content-between align-items-center mb-3">
                <div class="d-flex align-items-center bg-white border rounded px-2 py-1">
                    <button class="btn btn-link text-decoration-none p-0 text-dark" id="btn-prev-year"><i class="fas fa-chevron-left"></i></button>
                    <span class="mx-3 fw-bold fs-5" id="label-planning-year">${currentPlanningYear}</span>
                    <button class="btn btn-link text-decoration-none p-0 text-dark" id="btn-next-year"><i class="fas fa-chevron-right"></i></button>
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

    // Listeners de Ano
    document.getElementById('btn-prev-year').addEventListener('click', () => {
        currentPlanningYear--;
        updatePlanningView();
    });
    document.getElementById('btn-next-year').addEventListener('click', () => {
        currentPlanningYear++;
        updatePlanningView();
    });

    // Listeners de Toggle View
    document.getElementById('btn-view-chart').addEventListener('change', () => {
        document.getElementById('panel-chart-view').style.display = 'block';
        document.getElementById('panel-table-view').style.display = 'none';
        renderMixedChart(); // Garante render atualizado ao trocar
    });

    document.getElementById('btn-view-table').addEventListener('change', () => {
        document.getElementById('panel-chart-view').style.display = 'none';
        document.getElementById('panel-table-view').style.display = 'block';
        renderDetailedTable();
    });
};

const updatePlanningView = () => {
    document.getElementById('label-planning-year').textContent = currentPlanningYear;
    if (document.getElementById('btn-view-chart').checked) {
        renderMixedChart();
    } else {
        renderDetailedTable();
    }
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

    const footer = document.getElementById('chart-summary-footer');
    if(footer) footer.innerHTML = `
        <div class="col-4"><small class="text-body-secondary">Receitas</small><h5 class="income-text">${formatarMoeda(totalRec)}</h5></div>
        <div class="col-4"><small class="text-body-secondary">Despesas</small><h5 class="expense-text">${formatarMoeda(totalDesp)}</h5></div>
        <div class="col-4"><small class="text-body-secondary">Resultado</small><h5 class="${saldoAno>=0?'income-text':'expense-text'}">${formatarMoeda(saldoAno)}</h5></div>
    `;

    const elChart = document.getElementById('annual-mixed-chart');
    if(!elChart) return;
    const ctx = elChart.getContext('2d');

    if (annualMixedChart) annualMixedChart.destroy();

    annualMixedChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Saldo Acumulado',
                    data: acumulado,
                    type: 'line',
                    borderColor: '#4A5568',
                    borderWidth: 2,
                    pointBackgroundColor: '#fff',
                    pointBorderColor: '#4A5568',
                    tension: 0.3,
                    pointRadius: 3,
                    yAxisID: 'y1'
                },
                {
                    label: 'Receitas',
                    data: receitas,
                    backgroundColor: 'rgba(56, 161, 105, 0.6)',
                    borderColor: 'rgba(56, 161, 105, 1)',
                    borderWidth: 1,
                    order: 2
                },
                {
                    label: 'Despesas Totais',
                    data: despesas,
                    backgroundColor: 'rgba(229, 62, 62, 0.6)',
                    borderColor: 'rgba(229, 62, 62, 1)',
                    borderWidth: 1,
                    order: 3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { position: 'bottom' } },
            scales: {
                x: { grid: { display: false } },
                y: { display: false },
                y1: { display: false }
            }
        }
    });
};

const renderDetailedTable = () => {
    const container = document.getElementById('panel-table-view');
    if(!container) return;
    
    const data = calculateCategoryGrid(getState(), currentPlanningYear);
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const headerCols = meses.map(m => `<th class="text-center bg-light">${m}</th>`).join('');

    const createRows = (objData, cssClass) => {
        return Object.keys(objData).sort().map(cat => {
            const vals = objData[cat].map(v => v === 0 ? '<span class="text-muted opacity-25">-</span>' : formatarMoeda(v).replace('R$', ''));
            const cols = vals.map(v => `<td class="text-end small">${v}</td>`).join('');
            return `<tr><td class="fw-bold small text-truncate" style="max-width: 150px;">${cat}</td>${cols}</tr>`;
        }).join('');
    };

    const rowsReceitas = createRows(data.receitas, 'income-text');
    const rowsDespesas = createRows(data.despesas, 'expense-text');
    
    const rowSaldo = data.saldos.map(v => {
        const color = v >= 0 ? 'text-success' : 'text-danger';
        return `<td class="text-end fw-bold ${color}" style="font-size: 0.8rem;">${formatarMoeda(v).replace('R$', '')}</td>`;
    }).join('');

    container.innerHTML = `
        <table class="table table-bordered table-sm table-hover" style="font-size: 0.85rem;">
            <thead style="position: sticky; top: 0; z-index: 2;">
                <tr><th class="bg-light" style="min-width: 120px;">Categoria</th>${headerCols}</tr>
            </thead>
            <tbody>
                <tr class="table-success"><td colspan="13"><strong>RECEITAS</strong></td></tr>
                ${rowsReceitas || '<tr><td colspan="13" class="text-center text-muted">Sem dados</td></tr>'}
                
                <tr class="table-danger border-top"><td colspan="13"><strong>DESPESAS</strong></td></tr>
                ${rowsDespesas || '<tr><td colspan="13" class="text-center text-muted">Sem dados</td></tr>'}
                
                <tr class="table-dark border-top" style="position: sticky; bottom: 0;">
                    <td><strong>SALDO LÍQUIDO</strong></td>
                    ${rowSaldo}
                </tr>
            </tbody>
        </table>
    `;
};

// =========================================================================
// === DASHBOARDS E GRÁFICOS (MENSAL/ANUAL/SAÚDE) ===
// =========================================================================

export const renderVisaoMensal = () => {
    const container = document.getElementById('dashboard-monthly-container');
    if (!container) return;
    
    const metrics = calculateFinancialHealthMetrics(getState());

    container.innerHTML = `
        <h5 class="mb-3">Resumo do Mês (Previsão)</h5>
        <div class="row text-center mb-3">
            <div class="col-4">
                <h6>Receitas</h6>
                <p class="h4 income-text mb-0">${formatarMoeda(metrics.rendaPrevistaTotal)}</p>
                <small class="text-body-secondary" style="font-size:0.7rem">(Real: ${formatarMoeda(metrics.rendaRealizada)})</small>
            </div>
            <div class="col-4">
                <h6>Despesas</h6>
                <p class="h4 expense-text mb-0">${formatarMoeda(metrics.despesaPrevistaTotal)}</p>
                <small class="text-body-secondary" style="font-size:0.7rem">(Real: ${formatarMoeda(metrics.despesaRealizada)})</small>
            </div>
            <div class="col-4">
                <h6>Saldo</h6>
                <p class="h4 ${metrics.saldoPrevisto >= 0 ? 'income-text':'expense-text'} mb-0">${formatarMoeda(metrics.saldoPrevisto)}</p>
            </div>
        </div>
        <div style="height: 250px;"><canvas id="summary-chart-monthly"></canvas></div>`;
    
    if (summaryChart) summaryChart.destroy();
    const ctx = document.getElementById('summary-chart-monthly')?.getContext('2d');
    
    const { transacoes, lancamentosFuturos } = getState();
    const mesAtual = new Date().toISOString().slice(0, 7);
    const despesasMap = {};
    
    // Realizadas
    transacoes.filter(t => t.data.startsWith(mesAtual) && t.tipo === 'despesa').forEach(t => {
        despesasMap[t.categoria] = (despesasMap[t.categoria] || 0) + t.valor;
    });
    // Pendentes
    lancamentosFuturos.filter(l => l.data_vencimento.startsWith(mesAtual) && l.tipo === 'a_pagar' && l.status === 'pendente').forEach(l => {
        despesasMap[l.categoria] = (despesasMap[l.categoria] || 0) + l.valor;
    });

    if(ctx && Object.keys(despesasMap).length > 0) {
        summaryChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(despesasMap),
                datasets: [{
                    data: Object.values(despesasMap),
                    backgroundColor: CHART_COLORS
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } }
            }
        });
    }
};

export const renderVisaoAnual = () => {
    const container = document.getElementById('dashboard-yearly-container');
    if (!container) return;
    const ano = new Date().getFullYear();
    const transacoesAno = [...getState().transacoes, ...gerarTransacoesVirtuais()].filter(t => t.data?.startsWith(ano));
    
    let receitasPorMes = Array(12).fill(0);
    let despesasPorMes = Array(12).fill(0);
    
    transacoesAno.forEach(t => {
        const mes = new Date(t.data + 'T12:00:00').getMonth();
        if(t.tipo === 'receita') receitasPorMes[mes] += t.valor;
        else despesasPorMes[mes] += t.valor;
    });

    container.innerHTML = `<h5 class="mb-3">Fluxo de Caixa Anual (Realizado)</h5><div style="height: 300px;"><canvas id="annual-chart"></canvas></div>`;
    
    if(annualChart) annualChart.destroy();
    const ctx = document.getElementById('annual-chart')?.getContext('2d');
    
    if(ctx) {
        annualChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'],
                datasets: [
                    { label: 'Receitas', data: receitasPorMes, backgroundColor: 'rgba(25,135,84,0.7)' },
                    { label: 'Despesas', data: despesasPorMes, backgroundColor: 'rgba(220,53,69,0.7)' }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true } }
            }
        });
    }
};

export const renderFinancialHealth = () => {
    const container = document.getElementById('health-tab-pane');
    if (!container) return;
    
    const metrics = calculateFinancialHealthMetrics(getState());
    const scoreColor = metrics.financialScore >= 75 ? 'success' : metrics.financialScore >= 40 ? 'warning' : 'danger';

    container.innerHTML = `
        <div class="row">
            <div class="col-12">
                <div class="card mb-3">
                    <div class="card-body text-center">
                        <h5 class="card-title">Score de Saúde Financeira</h5>
                        <div class="progress mx-auto my-3" style="height: 25px; max-width: 400px;">
                            <div class="progress-bar bg-${scoreColor}" role="progressbar" style="width: ${metrics.financialScore.toFixed(0)}%;">
                                ${metrics.financialScore.toFixed(0)} / 100
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div class="row">
            <div class="col-lg-6 mb-3">
                <div class="card h-100">
                    <div class="card-header"><h6 class="mb-0">Patrimônio Líquido</h6></div>
                    <ul class="list-group list-group-flush">
                        <li class="list-group-item d-flex justify-content-between">
                            <span>Ativos</span> <span class="text-success">${formatarMoeda(metrics.totalAtivos)}</span>
                        </li>
                        <li class="list-group-item d-flex justify-content-between">
                            <span>Passivos</span> <span class="text-danger">${formatarMoeda(metrics.totalPassivos)}</span>
                        </li>
                        <li class="list-group-item d-flex justify-content-between">
                            <strong>Total</strong> <strong>${formatarMoeda(metrics.patrimonioLiquido)}</strong>
                        </li>
                    </ul>
                </div>
            </div>
            <div class="col-lg-6 mb-3">
                <div class="card h-100">
                    <div class="card-header"><h6 class="mb-0">Evolução do Patrimônio</h6></div>
                    <div class="card-body"><canvas id="net-worth-chart"></canvas></div>
                </div>
            </div>
        </div>
    `;

    if (netWorthChart) netWorthChart.destroy();
    const nwCtx = document.getElementById('net-worth-chart')?.getContext('2d');
    
    if (nwCtx && metrics.historicoPatrimonio.length) {
        netWorthChart = new Chart(nwCtx, {
            type: 'line',
            data: {
                labels: metrics.historicoPatrimonio.map(h => h.mes),
                datasets: [{
                    label: 'Patrimônio',
                    data: metrics.historicoPatrimonio.map(h => h.valor),
                    borderColor: '#4A5568',
                    tension: 0.1,
                    fill: false
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }
};

// =========================================================================
// === RENDERIZADORES DE LISTAS (FILTROS, CARDS, EXTRATOS) ===
// =========================================================================

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

    container.innerHTML = `
        <div class="alert alert-light py-2">
            <div class="d-flex justify-content-around flex-wrap small text-center">
                <span>Itens: <strong>${items.length}</strong></span>
                <span class="income-text">${isHistory ? 'Receitas' : 'A Receber'}: <strong>${formatarMoeda(totalReceitas)}</strong></span>
                <span class="expense-text">${isHistory ? 'Despesas' : 'A Pagar'}: <strong>${formatarMoeda(totalDespesas)}</strong></span>
                ${isHistory ? `<span>Saldo: <strong class="${saldo >= 0 ? 'income-text' : 'expense-text'}">${formatarMoeda(saldo)}</strong></span>` : ''}
            </div>
        </div>`;
};

const renderTransactionCard = (t) => {
    const conta = getContaPorId(t.conta_id);
    const icon = CATEGORY_ICONS[t.categoria] || CATEGORY_ICONS['Outros'];
    const isPendente = t.isPending === true; 
    const dataExibicao = t.data || t.data_vencimento; 
    const collapseId = `collapse-trans-${t.id || Math.random().toString(36).substr(2, 9)}`;
    const statusBadge = isPendente ? '<span class="badge bg-warning text-dark me-2">Pendente</span>' : '<span class="badge bg-success me-2">Realizado</span>';
    const opacityClass = isPendente ? 'opacity-75' : '';
    
    // Botão de Engrenagem (Se tiver vínculo de série)
    const extraBtn = (t.compra_parcelada_id) 
        ? `<button class="btn btn-outline-secondary btn-sm" data-action="recriar-compra-parcelada" data-id="${t.compra_parcelada_id}" title="Configurar Série"><i class="fas fa-cog"></i></button>` 
        : '';

    let actions = '';
    if (isPendente) {
        const isReceita = t.tipo === 'a_receber';
        const btnClass = isReceita ? 'btn-primary' : 'btn-success';
        const btnIcon = isReceita ? 'fas fa-hand-holding-usd' : 'fas fa-check';
        const btnTitle = isReceita ? 'Confirmar Recebimento' : 'Pagar';
        
        actions = `
            <div class="btn-group">
                <button class="btn ${btnClass} btn-sm" data-action="pagar-conta" data-id="${t.id}" title="${btnTitle}"><i class="${btnIcon}"></i></button>
                <button class="btn btn-outline-secondary btn-sm" data-action="editar-lancamento" data-id="${t.id}"><i class="fas fa-edit"></i></button>
                ${extraBtn}
                <button class="btn btn-outline-danger btn-sm" data-action="deletar-lancamento" data-id="${t.id}" title="Apagar"><i class="fas fa-trash"></i></button>
            </div>`;
    } else {
        actions = `
            <div class="btn-group">
                <button class="btn btn-outline-secondary btn-sm" data-action="editar-transacao" data-id="${t.id}"><i class="fas fa-edit"></i></button>
                ${extraBtn}
                <button class="btn btn-outline-danger btn-sm" data-action="deletar-transacao" data-id="${t.id}"><i class="fas fa-trash"></i></button>
            </div>`;
    }

    const tipo = t.tipo === 'despesa' || t.tipo === 'a_pagar' ? 'despesa' : 'receita';
    const sinal = tipo === 'despesa' ? '-' : '+';
    const corValor = tipo === 'despesa' ? 'expense-text' : 'income-text';

    return `
        <div class="accordion-item ${opacityClass}">
            <h2 class="accordion-header">
                <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}">
                    <div class="d-flex w-100 align-items-center">
                        <span class="transaction-icon-wrapper me-3" style="background-color:${icon.color};"><i class="${icon.icon}"></i></span>
                        <div class="flex-grow-1">
                            <span>${t.descricao}</span>
                            <div class="small">${statusBadge}</div>
                        </div>
                        <span class="ms-auto fw-bold ${corValor}">${sinal} ${formatarMoeda(t.valor)}</span>
                    </div>
                </button>
            </h2>
            <div id="${collapseId}" class="accordion-collapse collapse">
                <div class="accordion-body d-flex justify-content-between align-items-center">
                    <div>
                        <small class="text-body-secondary">
                            <i class="fas fa-calendar-alt"></i> ${new Date(dataExibicao + 'T12:00:00').toLocaleDateString('pt-BR')} | 
                            <i class="fas fa-tag"></i> ${t.categoria} | 
                            <i class="fas fa-wallet"></i> ${conta ? conta.nome : 'N/A'}
                        </small>
                    </div>
                    ${actions}
                </div>
            </div>
        </div>`;
};

const renderBillItem = (bill, compras) => {
    const isParcela = !!bill.compra_parcelada_id;
    let cat = bill.categoria;
    let isSerie = false;

    if (isParcela) {
        const c = compras.find(compra => compra.id === bill.compra_parcelada_id);
        if(c) {
            cat = c.categoria;
            if (c.descricao && c.descricao.includes('(Série)')) {
                isSerie = true;
            }
        }
    }
    const icon = CATEGORY_ICONS[cat] || CATEGORY_ICONS['Outros'];
    const collapseId = `collapse-bill-${bill.id}`;
    
    const extraButton = isParcela 
        ? `<button class="btn btn-outline-secondary btn-sm" data-action="recriar-compra-parcelada" data-id="${bill.compra_parcelada_id}" title="Configurar Série"><i class="fas fa-cog"></i></button>` 
        : '';

    let linkText = '';
    if (isParcela) {
        linkText = isSerie 
            ? '<br><small class="text-success"><i class="fas fa-sync-alt"></i> Série Recorrente</small>' 
            : '<br><small class="text-info"><i class="fas fa-credit-card"></i> Compra Parcelada</small>';
    }

    const isReceita = bill.tipo === 'a_receber';
    const payButtonClass = isReceita ? 'btn-primary' : 'btn-success';
    const payButtonIcon = isReceita ? 'fas fa-hand-holding-usd' : 'fas fa-check';
    const payButtonTitle = isReceita ? 'Confirmar Recebimento' : 'Pagar';

    return `
        <div class="accordion-item">
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
                        ${linkText}
                    </div>
                    <div class="btn-group">
                        <button class="btn ${payButtonClass} btn-sm" data-action="pagar-conta" data-id="${bill.id}" title="${payButtonTitle}"><i class="${payButtonIcon}"></i></button>
                        <button class="btn btn-outline-secondary btn-sm" data-action="editar-lancamento" data-id="${bill.id}"><i class="fas fa-edit"></i></button>
                        ${extraButton}
                        <button class="btn btn-outline-danger btn-sm" data-action="deletar-lancamento" data-id="${bill.id}" data-compra-id="${bill.compra_parcelada_id || ''}"><i class="fas fa-trash"></i></button>
                    </div>
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

// --- MODAIS ---

export const getAccountModalContent = (id = null) => {
    const conta = id ? getContaPorId(id) : {};
    const title = id ? 'Editar Conta' : 'Nova Conta';
    const tipos = getTiposContas();
    
    const options = tipos.map(t => 
        `<option value="${t.nome}" data-is-card="${t.e_cartao}" ${conta.tipo === t.nome ? 'selected' : ''}>${t.nome}</option>`
    ).join('');
    
    const currentIsCard = conta.tipo ? isTipoCartao(conta.tipo) : (tipos[0] ? tipos[0].e_cartao : false);

    const body = `
        <form id="form-conta" data-id="${id || ''}">
            <div class="mb-3"><label class="form-label">Nome da Conta</label><input name="nome" class="form-control" value="${conta.nome || ''}" required></div>
            <div class="mb-3">
                <label class="form-label d-flex justify-content-between">
                    Tipo de Conta
                    <a href="#" id="link-manage-types" class="small text-decoration-none">Gerenciar Tipos</a>
                </label>
                <select name="tipo" id="conta-tipo" class="form-select">
                    ${options}
                </select>
            </div>
            <div class="mb-3"><label class="form-label">Saldo Inicial</label><input name="saldo_inicial" type="number" step="0.01" class="form-control" value="${conta.saldo_inicial || 0}" ${id ? 'disabled' : ''}></div>
            <div id="cartao-credito-fields" style="display: ${currentIsCard ? 'block' : 'none'};">
                 <div class="mb-3"><label class="form-label">Dia do Fechamento</label><input name="dia_fechamento_cartao" type="number" min="1" max="31" class="form-control" value="${conta.dia_fechamento_cartao || ''}" placeholder="Ex: 20"></div>
                 <div class="mb-3"><label class="form-label">Dia do Vencimento</label><input name="dia_vencimento_cartao" type="number" min="1" max="31" class="form-control" value="${conta.dia_vencimento_cartao || ''}" placeholder="Ex: 28"></div>
            </div>
            <div class="text-end"><button type="submit" class="btn btn-primary">Salvar</button></div>
        </form>`;
    return { title, body };
};

export const getCategoriesModalContent = () => {
    const categorias = getCategorias();
    const listaHtml = categorias.map(c => `
        <li class="list-group-item d-flex justify-content-between align-items-center">
            <span>${c.nome}</span>
            <div class="btn-group">
                <button class="btn btn-sm btn-outline-secondary" data-action="editar-categoria" data-id="${c.id}" data-nome="${c.nome}"><i class="fas fa-pen"></i></button>
                <button class="btn btn-sm btn-outline-danger" data-action="deletar-categoria" data-id="${c.id}"><i class="fas fa-trash"></i></button>
            </div>
        </li>`).join('');

    const body = `
        <form id="form-nova-categoria" class="mb-4 d-flex gap-2">
            <input type="text" name="nome" class="form-control" placeholder="Nova Categoria..." required>
            <button type="submit" class="btn btn-success"><i class="fas fa-plus"></i></button>
        </form>
        <div style="max-height: 300px; overflow-y: auto;">
            <ul class="list-group list-group-flush" id="lista-categorias-modal">
                ${listaHtml}
            </ul>
        </div>`;
    return { title: 'Gerenciar Categorias', body };
};

export const getEditCategoryModalContent = (id, nomeAtual) => {
    const body = `
        <div class="alert alert-warning small">
            <i class="fas fa-exclamation-triangle"></i> Alterar o nome atualizará todo o histórico.
        </div>
        <form id="form-editar-categoria" data-id="${id}" data-nome-antigo="${nomeAtual}">
            <div class="mb-3"><label class="form-label">Nome da Categoria</label><input type="text" name="nome" class="form-control" value="${nomeAtual}" required></div>
            <div class="text-end"><button type="submit" class="btn btn-primary">Salvar</button></div>
        </form>`;
    return { title: 'Editar Categoria', body };
};

export const getAccountTypesModalContent = () => {
    const tipos = getTiposContas();
    const listaHtml = tipos.map(t => `
        <li class="list-group-item d-flex justify-content-between align-items-center">
            <div>
                <span>${t.nome}</span>
                ${t.e_cartao ? '<span class="badge bg-info text-dark ms-2" style="font-size:0.6rem">Cartão</span>' : ''}
            </div>
            <button class="btn btn-sm btn-outline-danger" data-action="deletar-tipo-conta" data-id="${t.id}"><i class="fas fa-trash"></i></button>
        </li>
    `).join('');

    const body = `
        <form id="form-novo-tipo-conta" class="mb-4">
            <div class="input-group mb-2">
                <input type="text" name="nome" class="form-control" placeholder="Novo Tipo..." required>
                <button type="submit" class="btn btn-success"><i class="fas fa-plus"></i></button>
            </div>
            <div class="form-check">
                <input class="form-check-input" type="checkbox" name="e_cartao" id="check-e-cartao">
                <label class="form-check-label small" for="check-e-cartao">
                    Funciona como Cartão de Crédito? (Pede fatura)
                </label>
            </div>
        </form>
        <div style="max-height: 300px; overflow-y: auto;">
            <ul class="list-group list-group-flush">
                ${listaHtml}
            </ul>
        </div>
    `;
    return { title: 'Gerenciar Tipos de Conta', body };
};

export const getBillModalContent = (id = null) => {
    const bill = id ? getState().lancamentosFuturos.find(l => l.id === id) : {};
    const title = id ? 'Editar Parcela' : 'Novo Lançamento';
    const isParcela = !!bill.compra_parcelada_id;
    const categoriasOptions = getCategoriaOptionsHTML(bill.categoria);
    
    const warning = isParcela 
        ? `<div class="alert alert-info small"><i class="fas fa-info-circle"></i> Você está editando apenas esta parcela. Para mudar todas, use o botão de Engrenagem na lista.</div>` 
        : '';

    const body = `
        <form id="form-lancamento" data-id="${id || ''}">
            ${warning}
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
    const categoriasOptions = getCategoriaOptionsHTML(transacao.categoria);

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
    if (!compra) return { title: 'Erro', body: '<p>Série não encontrada.</p>' };
    
    const conta = getContaPorId(compra.conta_id);
    const isCartao = conta && isTipoCartao(conta.tipo);
    const title = isCartao ? 'Reconfigurar Parcelamento' : 'Editar Série Recorrente';
    const contasOptions = getContas().map(c => `<option value="${c.id}" ${compra.conta_id === c.id ? 'selected' : ''}>${c.nome}</option>`).join('');
    const categoriasOptions = getCategoriaOptionsHTML(compra.categoria);

    let camposEspecificos = '';
    
    if (isCartao) {
        camposEspecificos = `
            <div class="mb-3"><label class="form-label">Número de Parcelas</label><input name="numero_parcelas" type="number" min="1" value="${compra.numero_parcelas}" class="form-control" required></div>
            <div class="mb-3"><label class="form-label">Data da Compra Original</label><input name="data_inicio" type="date" value="${compra.data_compra}" class="form-control" required></div>
            <input type="hidden" name="tipo_serie" value="parcelada">
        `;
    } else {
        camposEspecificos = `
            <div class="row">
                <div class="col-6 mb-3">
                    <label class="form-label">Frequência</label>
                    <select name="frequencia" class="form-select">
                        <option value="mensal">Mensal</option>
                        <option value="quinzenal">Quinzenal</option>
                        <option value="semestral">Semestral</option>
                        <option value="anual">Anual</option>
                    </select>
                </div>
                <div class="col-6 mb-3">
                    <label class="form-label">Qtde Restante</label>
                    <input name="quantidade" type="number" value="12" class="form-control" title="Quantos lançamentos criar a partir de agora?">
                </div>
            </div>
            <div class="mb-3">
                <label class="form-label">Data do Próximo Recebimento</label>
                <input name="data_inicio" type="date" value="${toISODateString(new Date())}" class="form-control" required>
                <div class="form-text">A partir desta data, a nova regra será aplicada.</div>
            </div>
            <input type="hidden" name="tipo_serie" value="recorrente">
        `;
    }

    const body = `
        <div class="alert alert-info small">
            <i class="fas fa-info-circle"></i> 
            Ao salvar, os lançamentos <strong>pendentes (futuros)</strong> serão recriados com os novos dados. 
            O histórico de itens já pagos/recebidos será <strong>mantido</strong>.
        </div>
        <form id="form-compra-parcelada" data-compra-antiga-id="${compra.id}">
            <div class="mb-3"><label class="form-label">Descrição da Série</label><input name="descricao" value="${compra.descricao}" class="form-control" required></div>
            <div class="mb-3"><label class="form-label">Valor (Novo Padrão)</label><input name="valor_total" type="number" step="0.01" value="${(compra.valor_total / (compra.numero_parcelas || 1)).toFixed(2)}" class="form-control" required></div>
            
            ${camposEspecificos}

            <div class="mb-3"><label class="form-label">Conta Vinculada</label><select name="conta_id" class="form-select" required>${contasOptions}</select></div>
            <div class="mb-3"><label class="form-label">Categoria</label><select name="categoria" class="form-select" required>${categoriasOptions}</select></div>
            
            <div class="text-end">
                <button type="submit" class="btn btn-primary">Atualizar Série Futura</button>
            </div>
        </form>`;
    return { title, body };
};

export const getPayBillModalContent = (billId) => {
    const bill = getState().lancamentosFuturos.find(b=>b.id===billId);
    if (!bill) return { title: 'Erro', body: 'Lançamento não encontrado.' };
    
    // Modal Inteligente (Pagar vs Receber)
    const isReceita = bill.tipo === 'a_receber';
    const title = isReceita ? 'Confirmar Recebimento' : 'Pagar Lançamento';
    const textoAcao = isReceita ? 'recebendo' : 'pagando';
    const btnClass = isReceita ? 'btn-primary' : 'btn-success';
    const btnText = isReceita ? 'Confirmar Recebimento' : 'Confirmar Pagamento';

    const body = `
        <form id="form-pagamento" data-bill-id="${bill.id}" data-valor="${bill.valor}" data-desc="${bill.descricao}" data-cat="${bill.categoria || 'Contas'}">
            <p>Você está ${textoAcao} <strong>${bill.descricao}</strong> no valor de:</p>
            <p class="h3 text-center my-3 ${isReceita ? 'income-text' : 'expense-text'}">${formatarMoeda(bill.valor)}</p>
            <div class="mb-3"><label class="form-label">Data da Transação</label><input type="date" name="data" value="${toISODateString(new Date())}" class="form-control"></div>
            <div class="mb-3"><label class="form-label">Conta</label><select name="conta_id" class="form-select">${getContas().filter(c=>c.tipo!=='Cartão de Crédito').map(c=>`<option value="${c.id}">${c.nome}</option>`).join('')}</select></div>
            <div class="text-end"><button type="submit" class="btn ${btnClass}">${btnText}</button></div>
        </form>`;
    return { title, body };
};

export const getStatementModalContent = (contaId) => {
    const conta = getContaPorId(contaId);
    if (!conta) return { title: 'Erro', body: 'Conta não encontrada.' };

    const title = `Fatura - ${conta.nome}`;
    const { transacoes, lancamentosFuturos, comprasParceladas } = getState();

    const mesesDeTransacoes = transacoes
        .filter(t => t.conta_id === contaId)
        .map(t => t.data.substring(0, 7));

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
        <div class="mb-3">
            <label for="statement-month-select" class="form-label">Selecione a Fatura:</label>
            <select id="statement-month-select" class="form-select" data-conta-id="${contaId}">
                <option value="">Selecione...</option>
                ${options}
            </select>
        </div>
        <div id="statement-details-container" class="mt-4">
            <p class="text-center text-body-secondary">Selecione um mês para ver os detalhes da fatura.</p>
        </div>`;

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
        return t.conta_id === contaId &&
               dataTransacao > inicioCiclo &&
               dataTransacao <= fimCiclo &&
               t.tipo === 'despesa';
    }).sort((a, b) => new Date(a.data) - new Date(b.data));

    const totalFatura = transacoesFatura.reduce((acc, t) => acc + t.valor, 0);

    const itemsHtml = transacoesFatura.length ?
        transacoesFatura.map(renderTransactionCard).join('') :
        '<p class="text-center text-body-secondary p-3">Nenhuma despesa nesta fatura.</p>';

    container.innerHTML = `
        <div>
            <h5 class="d-flex justify-content-between">
                <span>Total da Fatura:</span>
                <span class="expense-text">${formatarMoeda(totalFatura)}</span>
            </h5>
            <p class="text-body-secondary small">
                Período de ${inicioCiclo.toLocaleDateString('pt-BR')} a ${fimCiclo.toLocaleDateString('pt-BR')}
            </p>
        </div>
        <div class="accordion mt-3">
            ${itemsHtml}
        </div>`;
};

export const getAccountStatementModalContent = (contaId) => {
    const conta = getContaPorId(contaId);
    if (!conta) return { title: 'Erro', body: 'Conta não encontrada.' };

    const title = `Extrato - ${conta.nome}`;
    const { transacoes } = getState();

    const mesesDisponiveis = [...new Set(
        transacoes
            .filter(t => t.conta_id === contaId)
            .map(t => t.data.substring(0, 7))
    )].sort().reverse();

    const options = mesesDisponiveis.map(mes => {
        const [ano, mesNum] = mes.split('-');
        const data = new Date(ano, mesNum - 1);
        const nomeMes = data.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
        return `<option value="${mes}">${nomeMes}</option>`;
    }).join('');

    const body = `
        <div class="mb-3">
            <label for="account-statement-month-select" class="form-label">Selecione o Mês:</label>
            <select id="account-statement-month-select" class="form-select" data-conta-id="${contaId}">
                <option value="">Selecione...</option>
                ${options}
            </select>
        </div>
        <div id="account-statement-details-container" class="mt-4">
            <p class="text-center text-body-secondary">Selecione um mês para ver os detalhes do extrato.</p>
        </div>`;

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

// --- FUNÇÃO PARA A TAB DE EXTRATO MENSAL NO DASHBOARD ---

export const renderMonthlyStatementTab = () => {
    const container = document.getElementById('statement-tab-pane');
    if (!container) return;

    const { transacoes } = getState();
    
    // Pega os meses disponíveis nas transações
    const months = [...new Set(transacoes.map(t => t.data.substring(0, 7)))].sort().reverse();
    
    // Define o mês atual como padrão, ou o primeiro disponível
    const currentMonth = new Date().toISOString().slice(0, 7);
    const selectedMonth = months.includes(currentMonth) ? currentMonth : (months[0] || currentMonth);

    const options = months.map(m => {
        const [ano, mes] = m.split('-');
        const date = new Date(ano, mes - 1);
        const label = date.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
        // Letra maiúscula na primeira letra do mês
        const labelCapitalized = label.charAt(0).toUpperCase() + label.slice(1);
        return `<option value="${m}" ${m === selectedMonth ? 'selected' : ''}>${labelCapitalized}</option>`;
    }).join('');

    container.innerHTML = `
        <div class="card mb-3 shadow-sm border-0">
            <div class="card-body py-3">
                <div class="row align-items-center justify-content-center justify-content-md-start">
                    <div class="col-auto"><label class="col-form-label fw-bold text-body-secondary">Mês de Referência:</label></div>
                    <div class="col-auto flex-grow-1 flex-md-grow-0" style="min-width: 200px;">
                        <select id="tab-statement-month-select" class="form-select">
                            ${options || '<option>Sem transações registradas</option>'}
                        </select>
                    </div>
                </div>
            </div>
        </div>
        <div id="tab-statement-content"></div>
    `;

    // Renderiza o conteúdo do mês selecionado inicialmente
    // Nota: Mesmo que não haja "transacoes" (histórico), pode haver "pendentes", então chamamos a função.
    renderMonthlyStatementDetails(selectedMonth || currentMonth);
};

export const renderMonthlyStatementDetails = (mes) => {
    const container = document.getElementById('tab-statement-content');
    if (!container || !mes) return;

    const { transacoes, lancamentosFuturos } = getState();
    
    // 1. Busca Transações Realizadas (Histórico)
    const realizados = transacoes
        .filter(t => t.data.startsWith(mes))
        .map(t => ({ ...t, isPending: false })); // Marca como realizado

    // 2. Busca Lançamentos Pendentes (Futuro/Recorrente)
    const pendentes = lancamentosFuturos
        .filter(l => l.data_vencimento.startsWith(mes) && l.status === 'pendente')
        .map(l => ({ 
            ...l, 
            data: l.data_vencimento, // Unifica nome do campo de data para ordenação
            tipo: l.tipo === 'a_pagar' ? 'despesa' : 'receita', // Unifica tipos para cálculo
            isPending: true // Marca como pendente
        }));

    // 3. Combina tudo
    const todasMovimentacoes = [...realizados, ...pendentes].sort((a, b) => new Date(b.data) - new Date(a.data));

    if (todasMovimentacoes.length === 0) {
        container.innerHTML = '<div class="alert alert-info text-center">Nenhuma movimentação (realizada ou prevista) neste mês.</div>';
        return;
    }

    // Cálculos de totais
    const entradas = todasMovimentacoes.filter(t => t.tipo === 'receita').reduce((acc, t) => acc + t.valor, 0);
    const saidas = todasMovimentacoes.filter(t => t.tipo === 'despesa').reduce((acc, t) => acc + t.valor, 0);
    const resultado = entradas - saidas;

    const listHtml = todasMovimentacoes.map(t => renderTransactionCard(t)).join('');

    container.innerHTML = `
        <div class="row mb-4 g-3 text-center">
            <div class="col-md-4">
                <div class="card h-100 border-success shadow-sm">
                    <div class="card-header bg-success text-white py-2 fw-bold">Entradas (Previsto)</div>
                    <div class="card-body">
                        <h4 class="card-title text-success mb-0">${formatarMoeda(entradas)}</h4>
                    </div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="card h-100 border-danger shadow-sm">
                    <div class="card-header bg-danger text-white py-2 fw-bold">Saídas (Previsto)</div>
                    <div class="card-body">
                        <h4 class="card-title text-danger mb-0">${formatarMoeda(saidas)}</h4>
                    </div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="card h-100 border-${resultado >= 0 ? 'success' : 'danger'} shadow-sm">
                    <div class="card-header bg-${resultado >= 0 ? 'success' : 'danger'} text-white py-2 fw-bold">Balanço Final</div>
                    <div class="card-body">
                        <h4 class="card-title text-${resultado >= 0 ? 'success' : 'danger'} mb-0">${formatarMoeda(resultado)}</h4>
                    </div>
                </div>
            </div>
        </div>
        
        <h6 class="border-bottom pb-2 mb-3 text-body-secondary d-flex justify-content-between align-items-center">
            <span>Detalhamento das Movimentações</span>
            <small class="text-muted fw-normal"><span class="badge bg-warning text-dark">Pendente</span> = Agendado</small>
        </h6>
        <div class="accordion" id="statement-accordion">
            ${listHtml}
        </div>
    `;
};

// =========================================================================
// === MASTER RENDERER - NO FINAL PARA EVITAR ERROS DE ORDEM ===
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
