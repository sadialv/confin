// ARQUIVO: js/ui.js
import { formatarMoeda, toISODateString, CATEGORY_ICONS, CHART_COLORS, escapeHTML } from './utils.js';
import { getState, getContaPorId, getContas, getCategorias, getTiposContas, isTipoCartao } from './state.js';
import { calculateFinancialHealthMetrics, calculateAnnualTimeline, calculateCategoryGrid, calculateDailyEvolution } from './finance.js';

// --- VARIÁVEIS GLOBAIS ---
let summaryChart = null;
let dailyChart = null;
let annualChart = null;
let netWorthChart = null;
let annualMixedChart = null;

let currentPlanningYear = new Date().getFullYear();
let currentDashboardMonth = new Date().toISOString().slice(0, 7);

const ITEMS_PER_PAGE = 10;

// --- HELPERS E CORE ---

const getCategoriaOptionsHTML = (selecionada = null) => {
    const categorias = getCategorias();
    if (!categorias || !categorias.length) {
        return '<option disabled>Nenhuma categoria cadastrada</option>';
    }
    return categorias.map(c => 
        `<option value="${escapeHTML(c.nome)}" ${c.nome === selecionada ? 'selected' : ''}>${escapeHTML(c.nome)}</option>`
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

// --- MODAL DE CONFIRMAÇÃO ---
export const showConfirmModal = (message, onConfirm) => {
    const modalEl = document.getElementById('confirmModal');
    if(!modalEl) {
        if(confirm(message)) onConfirm();
        return;
    }
    
    const bodyEl = document.getElementById('confirmModalBody');
    const btnEl = document.getElementById('confirmModalBtn');
    
    bodyEl.textContent = message;
    
    const newBtn = btnEl.cloneNode(true);
    btnEl.parentNode.replaceChild(newBtn, btnEl);
    
    const bsModal = new bootstrap.Modal(modalEl);
    
    newBtn.addEventListener('click', () => {
        onConfirm();
        bsModal.hide();
    });
    
    bsModal.show();
};

// --- MODAL GENÉRICO ---
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

    // Listener para fechar o modal
    document.getElementById('modal-close-btn')?.addEventListener('click', closeModal);
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

    if (!container) return;

    if (!contas || !contas.length) {
        container.innerHTML = '<div class="col-12 text-center text-muted p-5">Nenhuma conta cadastrada. Clique em "Nova Conta" para começar.</div>';
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
        const isCartao = isTipoCartao(conta.tipo);

        let acoesEspecificas = '';
        if (isCartao) {
            acoesEspecificas = `
                <button class="btn btn-sm btn-outline-info w-100 mb-1" data-action="ver-fatura" data-id="${conta.id}" title="Ver Fatura">
                    <i class="fas fa-receipt me-1"></i> Fatura
                </button>`;
        } else {
            acoesEspecificas = `
                <button class="btn btn-sm btn-outline-secondary w-100 mb-1" data-action="ver-extrato" data-id="${conta.id}" title="Ver Extrato">
                    <i class="fas fa-list me-1"></i> Extrato
                </button>`;
        }

        return `
            <div class="col-md-6 col-lg-4">
                <div class="card h-100 shadow-sm border-0">
                    <div class="card-body">
                        <div class="d-flex align-items-center mb-3">
                            <div class="rounded-circle bg-primary bg-opacity-10 p-3 text-primary me-3 fs-4">
                                <i class="${iconClass}"></i>
                            </div>
                            <div>
                                <h6 class="fw-bold mb-0 text-dark">${escapeHTML(conta.nome)}</h6>
                                <small class="text-muted">${escapeHTML(conta.tipo)}</small>
                            </div>
                        </div>
                        
                        <h4 class="mb-3 ${saldo >= 0 ? 'text-success' : 'text-danger'} fw-bold">
                            ${formatarMoeda(saldo)}
                        </h4>
                        
                        <div class="row g-2">
                            <div class="col-6">
                                ${acoesEspecificas}
                            </div>
                            <div class="col-6">
                                <button class="btn btn-sm btn-outline-dark w-100" data-action="editar-conta" data-id="${conta.id}">
                                    <i class="fas fa-cog me-1"></i> Config
                                </button>
                            </div>
                        </div>
                        
                         <div class="mt-2 text-end">
                            <button class="btn btn-link btn-sm text-danger p-0 text-decoration-none" data-action="deletar-conta" data-id="${conta.id}" style="font-size: 0.8rem;">
                                Excluir Conta
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = cardsHtml;
};

// 2. Renderiza Formulário de Transação Rápida
export const renderFormTransacaoRapida = () => {
    const container = document.getElementById('form-transacao-unificada');
    if (!container) return;
    
    const contas = getContas();
    const contasOptions = contas.map(c => `<option value="${c.id}">${escapeHTML(c.nome)}</option>`).join('');
    const categoriasOptions = getCategoriaOptionsHTML();

    container.innerHTML = `
        <div class="row g-3">
            <div class="col-md-6">
                <label class="form-label fw-bold">O que é?</label>
                <select id="tipo-compra" name="tipo_compra" class="form-select">
                    <option value="vista">Transação Simples (Agora)</option>
                    <option value="parcelada">Compra Parcelada (Cartão/Crediário)</option>
                    <option value="recorrente">Assinatura / Fixo (Netflix, Aluguel...)</option>
                </select>
            </div>
            
            <div class="col-md-6">
                <label class="form-label fw-bold">Tipo</label>
                <div class="btn-group w-100" role="group">
                    <input type="radio" class="btn-check" name="tipo" id="tipo-despesa" value="despesa" checked>
                    <label class="btn btn-outline-danger" for="tipo-despesa">Despesa (Saída)</label>

                    <input type="radio" class="btn-check" name="tipo" id="tipo-receita" value="receita">
                    <label class="btn btn-outline-success" for="tipo-receita">Receita (Entrada)</label>
                </div>
            </div>

            <div class="col-12">
                <label class="form-label">Descrição</label>
                <input type="text" name="descricao" class="form-control" placeholder="Ex: Supermercado, Salário, Uber..." required>
            </div>
            
            <div class="col-md-6">
                <label id="label-valor" class="form-label">Valor</label>
                <div class="input-group">
                    <span class="input-group-text">R$</span>
                    <input type="number" name="valor" min="0" step="0.01" class="form-control" required>
                </div>
            </div>
            
            <div class="col-md-6" id="group-data">
                <label id="label-data" class="form-label">Data</label>
                <input type="date" name="data" value="${toISODateString(new Date())}" class="form-control" required>
            </div>
            
            <div class="col-md-6" id="group-conta">
                <label id="label-conta" class="form-label">Conta / Cartão</label>
                <select name="conta_id" class="form-select" required>${contasOptions}</select>
            </div>
            
            <div class="col-md-6">
                <label class="form-label">Categoria</label>
                <select name="categoria" class="form-select" required>${categoriasOptions}</select>
            </div>

            <div id="parcelada-fields" class="col-12 extra-fields" style="display:none; background-color: #f8f9fa; padding: 15px; border-radius: 8px; border: 1px dashed #dee2e6;">
                <h6 class="fw-bold text-muted mb-3"><i class="fas fa-credit-card me-2"></i>Detalhes do Parcelamento</h6>
                <div class="mb-3">
                    <label class="form-label">Número de Parcelas</label>
                    <input name="numero_parcelas" type="number" min="2" class="form-control" placeholder="Ex: 10">
                </div>
                <small class="text-muted">* O valor informado acima será o <strong>VALOR TOTAL</strong> da compra.</small>
            </div>

            <div id="recorrente-fields" class="col-12 extra-fields" style="display:none; background-color: #f8f9fa; padding: 15px; border-radius: 8px; border: 1px dashed #dee2e6;">
                <h6 class="fw-bold text-muted mb-3"><i class="fas fa-sync-alt me-2"></i>Detalhes da Recorrência</h6>
                <div class="row g-2">
                    <div class="col-md-6">
                        <label class="form-label">Frequência</label>
                        <select name="frequencia" class="form-select">
                            <option value="diaria">Diária</option>
                            <option value="quinzenal">Quinzenal</option>
                            <option value="mensal" selected>Mensal</option>
                            <option value="anual">Anual</option>
                        </select>
                    </div>
                    <div class="col-md-6" id="group-dia-vencimento">
                        <label class="form-label">Dia do Vencimento</label>
                        <input name="dia_vencimento" type="number" min="1" max="31" value="10" class="form-control">
                    </div>
                    <div class="col-12">
                        <label class="form-label">Duração (Repetições)</label>
                        <input name="quantidade" type="number" min="1" value="12" class="form-control">
                        <div class="form-text">Quantas vezes isso vai se repetir?</div>
                    </div>
                </div>
            </div>
            
            <div class="col-12 mt-4">
                <button type="submit" class="btn btn-primary w-100 py-2 fw-bold shadow-sm">
                    <i class="fas fa-check me-2"></i> Confirmar Lançamento
                </button>
            </div>
        </div>
    `;

    const selectTipo = document.getElementById('tipo-compra');
    if (selectTipo) {
        selectTipo.addEventListener('change', (e) => {
             const tipo = e.target.value;
             const parceladaFields = document.getElementById('parcelada-fields');
             const recorrenteFields = document.getElementById('recorrente-fields');
             const labelValor = document.getElementById('label-valor');
             
             parceladaFields.style.display = 'none';
             recorrenteFields.style.display = 'none';
             
             if (tipo === 'parcelada') {
                 parceladaFields.style.display = 'block';
                 labelValor.innerText = 'Valor Total da Compra';
             } else if (tipo === 'recorrente') {
                 recorrenteFields.style.display = 'block';
                 labelValor.innerText = 'Valor da Parcela/Mensalidade';
             } else {
                 labelValor.innerText = 'Valor';
             }
        });
    }

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
                <div class="d-flex align-items-center bg-white border rounded px-2 py-1 shadow-sm">
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
                <div class="card shadow-sm border-0">
                    <div class="card-body">
                        <div style="height: 400px; position: relative;">
                            <canvas id="annual-mixed-chart"></canvas>
                        </div>
                        <div class="row text-center mt-4" id="chart-summary-footer"></div>
                    </div>
                </div>
            </div>

            <div id="panel-table-view" class="table-responsive" style="display: none;"></div>
        </div>
    `;

    renderMixedChart();

    document.getElementById('btn-prev-year').addEventListener('click', () => {
        currentPlanningYear--;
        updatePlanningView();
    });
    document.getElementById('btn-next-year').addEventListener('click', () => {
        currentPlanningYear++;
        updatePlanningView();
    });

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

    const elFooter = document.getElementById('chart-summary-footer');
    if(elFooter) {
        elFooter.innerHTML = `
            <div class="col-4"><small class="text-body-secondary">Receitas</small><h5 class="income-text">${formatarMoeda(totalRec)}</h5></div>
            <div class="col-4"><small class="text-body-secondary">Despesas</small><h5 class="expense-text">${formatarMoeda(totalDesp)}</h5></div>
            <div class="col-4"><small class="text-body-secondary">Resultado do Ano</small><h5 class="${saldoAno >= 0 ? 'income-text' : 'expense-text'}">${formatarMoeda(saldoAno)}</h5></div>
        `;
    }

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
    
    const styleStickyHeader = 'position: sticky; top: 0; z-index: 10; box-shadow: 0 2px 2px -1px rgba(0,0,0,0.1);';
    const styleStickyCol = 'position: sticky; left: 0; z-index: 5; border-right: 1px solid #dee2e6;';
    
    // Cores
    const bgHeader = '#f8f9fa';
    const bgReceitasHeader = '#e6fffa'; const textReceitas = '#047857';
    const bgDespesasHeader = '#fff5f5'; const textDespesas = '#c53030';
    const bgResumo = '#edf2f7';
    const bgSaldoLiquido = '#ebf8ff';
    
    const headerCols = meses.map(m => `
        <th class="text-center py-2 text-secondary text-uppercase" 
            style="min-width: 90px; background-color: ${bgHeader}; font-size: 0.75rem;">${m}</th>`).join('');

    const createRows = (objData) => Object.keys(objData).sort().map(cat => {
        const cols = objData[cat].map(v => 
            `<td class="text-end border-light px-2" style="font-size: 0.85rem; color: #4a5568;">
                ${v === 0 ? '<span class="text-muted opacity-25">-</span>' : formatarMoeda(v).replace('R$', '')}
            </td>`
        ).join('');
        return `<tr class="bg-white hover-row"><td class="fw-normal ps-3 bg-white" style="${styleStickyCol} font-size: 0.85rem;">${escapeHTML(cat)}</td>${cols}</tr>`;
    }).join('');

    const renderSumRow = (label, values, bgColor, textColor, isBold = false) => {
        const weight = isBold ? 'fw-bold' : 'fw-normal';
        const cols = values.map(v => 
            `<td class="text-end ${weight} px-2" style="color: ${textColor}; font-size: 0.85rem;">
                ${formatarMoeda(v).replace('R$', '')}
            </td>`
        ).join('');
        return `<tr style="background-color: ${bgColor};"><td class="${weight} ps-3" style="${styleStickyCol} background-color: ${bgColor}; color: ${textColor}; font-size: 0.85rem;">${label}</td>${cols}</tr>`;
    };

    // Montagem das Linhas
    const rowsReceitasDetails = createRows(data.receitas);
    const rowsDespesasDetails = createRows(data.despesas);

    // Linha de Saldo do Mês (Operacional)
    const arrSaldoMes = data.totalReceitas.map((rec, i) => rec - data.totalDespesas[i]);
    const colsSaldoMes = arrSaldoMes.map(v => {
        const color = v >= 0 ? '#047857' : '#c53030'; // Verde ou Vermelho
        return `<td class="text-end fw-bold px-2" style="color: ${color}; font-size: 0.85rem;">
            ${formatarMoeda(v).replace('R$', '')}
        </td>`;
    }).join('');
    
    const rowSaldoMes = `
        <tr style="background-color: #f8f9fa;">
            <td class="fw-bold ps-3" style="${styleStickyCol} background-color: #f8f9fa; color: #1f2937; font-size: 0.85rem;">
                Saldo do Mês (R - D)
            </td>
            ${colsSaldoMes}
        </tr>`;

    // Linha de Resgate Automático (Nova)
    // Mostra apenas se houver resgate (> 0) em algum mês
    const hasResgate = data.resgates.some(v => v > 0);
    let rowResgates = '';
    if (hasResgate) {
        const colsResgate = data.resgates.map(v => 
            `<td class="text-end px-2 fw-bold" style="color: #c53030; font-size: 0.8rem;">
                ${v > 0 ? `(- ${formatarMoeda(v).replace('R$', '')})` : '-'}
            </td>`
        ).join('');
        
        rowResgates = `
            <tr style="background-color: #fff5f5;">
                <td class="fw-bold ps-3 text-danger" style="${styleStickyCol} background-color: #fff5f5; font-size: 0.8rem;">
                    ⚠ Cobertura Automática
                </td>
                ${colsResgate}
            </tr>`;
    }

    container.innerHTML = `
        <div class="table-responsive border rounded" style="max-height: 600px; border-color: #e2e8f0;">
            <table class="table table-sm mb-0" style="border-collapse: separate; border-spacing: 0;">
                <thead style="${styleStickyHeader}">
                    <tr><th class="ps-3 text-secondary text-uppercase border-bottom" style="${styleStickyCol} min-width: 180px; background-color: ${bgHeader}; z-index: 11;">Categoria</th>${headerCols}</tr>
                </thead>
                <tbody>
                    <tr><td colspan="13" class="py-1 ps-3 fw-bold text-uppercase" style="background-color: #f0fdf4; color: ${textReceitas}; letter-spacing: 1px;">Receitas</td></tr>
                    ${rowsReceitasDetails}
                    ${renderSumRow('Total Entradas', data.totalReceitas, bgReceitasHeader, textReceitas, true)}

                    <tr><td colspan="13" class="py-1 ps-3 fw-bold text-uppercase border-top" style="background-color: #fff5f5; color: ${textDespesas}; letter-spacing: 1px;">Despesas</td></tr>
                    ${rowsDespesasDetails}
                    ${renderSumRow('Total Saídas', data.totalDespesas, bgDespesasHeader, textDespesas, true)}

                    ${rowSaldoMes}

                    <tr><td colspan="13" class="py-2 ps-3 fw-bold text-uppercase border-top border-2" style="background-color: ${bgResumo}; color: #4a5568; letter-spacing: 1px;">Simulação de Caixa</td></tr>
                    ${renderSumRow('Saldo Disponível (Conta)', data.saldosConta, '#fff', '#2d3748')}
                    ${rowResgates}
                    ${renderSumRow('Investimentos Restantes', data.saldosInvestimento, '#fff', '#2d3748')}
                    
                    ${renderSumRow('Patrimônio Líquido Final', data.saldoLiquido, bgSaldoLiquido, '#2b6cb0', true)}
                </tbody>
            </table>
        </div>
        <div class="mt-2 text-end text-muted fst-italic" style="font-size: 0.75rem;">
            * Se o saldo em conta faltar, o sistema simula retirada automática dos investimentos.
        </div>
    `;
};

// =========================================================================
// === DASHBOARDS E GRÁFICOS ===
// =========================================================================

export const renderVisaoMensal = () => {
    const container = document.getElementById('dashboard-monthly-container');
    if (!container) return;
    
    const metrics = calculateFinancialHealthMetrics(getState(), currentDashboardMonth);

    container.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-4">
            <h5 class="mb-0 fw-bold">Resumo do Mês</h5>
            <input type="month" id="dashboard-month-picker" class="form-control form-control-sm w-auto" value="${currentDashboardMonth}">
        </div>

        <div class="row text-center mb-4 g-3">
            <div class="col-md-4">
                <div class="card border-0 shadow-sm h-100 bg-success-subtle">
                    <div class="card-body py-3">
                        <small class="text-success-emphasis fw-bold text-uppercase">Receitas Previstas</small>
                        <h3 class="mb-1 text-success fw-bold income-text">${formatarMoeda(metrics.rendaPrevistaTotal)}</h3>
                        <small style="font-size: 0.8rem" class="text-muted">Realizado: ${formatarMoeda(metrics.rendaRealizada)}</small>
                    </div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="card border-0 shadow-sm h-100 bg-danger-subtle">
                    <div class="card-body py-3">
                        <small class="text-danger-emphasis fw-bold text-uppercase">Despesas Previstas</small>
                        <h3 class="mb-1 text-danger fw-bold expense-text">${formatarMoeda(metrics.despesaPrevistaTotal)}</h3>
                        <small style="font-size: 0.8rem" class="text-muted">Realizado: ${formatarMoeda(metrics.despesaRealizada)}</small>
                    </div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="card border-0 shadow-sm h-100 ${metrics.saldoPrevisto >= 0 ? 'bg-primary-subtle' : 'bg-warning-subtle'}">
                    <div class="card-body py-3">
                        <small class="text-primary-emphasis fw-bold text-uppercase">Saldo Previsto</small>
                        <h3 class="mb-1 ${metrics.saldoPrevisto >= 0 ? 'text-primary' : 'text-danger'} fw-bold">${formatarMoeda(metrics.saldoPrevisto)}</h3>
                        <small style="font-size: 0.8rem" class="text-muted">Líquido do Mês</small>
                    </div>
                </div>
            </div>
        </div>

        <div class="row g-3">
            <div class="col-lg-7 mb-3">
                <div class="card shadow-sm h-100 border-0">
                    <div class="card-header bg-white border-bottom"><h6 class="mb-0 fw-bold">Fluxo de Caixa Diário</h6></div>
                    <div class="card-body">
                        <div style="height: 280px;"><canvas id="daily-evolution-chart"></canvas></div>
                    </div>
                </div>
            </div>
            <div class="col-lg-5 mb-3">
                <div class="card shadow-sm h-100 border-0">
                    <div class="card-header bg-white border-bottom"><h6 class="mb-0 fw-bold">Despesas por Categoria</h6></div>
                    <div class="card-body">
                        <div style="height: 280px;"><canvas id="summary-chart-monthly"></canvas></div>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('dashboard-month-picker').addEventListener('change', (e) => {
        currentDashboardMonth = e.target.value;
        renderVisaoMensal(); 
        renderVisaoAnual(); // Atualiza também o gráfico anual
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
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Saldo Acumulado',
                    data: dataAcumulado,
                    borderColor: '#0d6efd',
                    backgroundColor: 'rgba(13, 110, 253, 0.1)',
                    fill: true,
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { grid: { display: false } }
            }
        }
    });
};

const renderCategoryChart = () => {
    const ctx = document.getElementById('summary-chart-monthly')?.getContext('2d');
    if (!ctx) return;

    if (summaryChart) summaryChart.destroy();
    
    const { transacoes, lancamentosFuturos } = getState();
    const despesasMap = {};
    
    transacoes.filter(t => t.data.startsWith(currentDashboardMonth) && t.tipo === 'despesa').forEach(t => {
        despesasMap[t.categoria] = (despesasMap[t.categoria] || 0) + t.valor;
    });
    lancamentosFuturos.filter(l => l.data_vencimento.startsWith(currentDashboardMonth) && l.tipo === 'a_pagar' && l.status === 'pendente').forEach(l => {
        despesasMap[l.categoria] = (despesasMap[l.categoria] || 0) + l.valor;
    });

    if (Object.keys(despesasMap).length > 0) {
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
                plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } } }
            }
        });
    }
};

export const renderVisaoAnual = () => {
    const container = document.getElementById('dashboard-yearly-container');
    if (!container) return;
    
    // Mostra o gráfico do ano do mês selecionado
    const anoSelecionado = parseInt(currentDashboardMonth.split('-')[0]);
    const timelineData = calculateAnnualTimeline(getState(), anoSelecionado);
    const labels = timelineData.map(d => d.mes.substring(5, 7)); // Apenas o mês

    container.innerHTML = `<h5 class="mb-3">Fluxo de Caixa (${anoSelecionado})</h5><div style="height: 300px;"><canvas id="annual-chart"></canvas></div>`;
    
    if(annualChart) annualChart.destroy();
    const ctx = document.getElementById('annual-chart')?.getContext('2d');
    
    if(ctx) {
        annualChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    { label: 'Receitas', data: timelineData.map(d => d.receitas), backgroundColor: 'rgba(25,135,84,0.7)' },
                    { label: 'Despesas', data: timelineData.map(d => d.despesas), backgroundColor: 'rgba(220,53,69,0.7)' }
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
        `<option value="${conta.id}" ${currentFilters.contaId == conta.id ? 'selected' : ''}>${escapeHTML(conta.nome)}</option>`
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

// --- PAINEL DE RESUMO MODERNO ---
const renderSummaryPanel = (containerId, items, type) => {
    const container = document.getElementById(containerId);
    if (!container) return;

    const isHistory = type === 'history';
    const totalReceitas = isHistory 
        ? items.filter(t => t.tipo === 'receita').reduce((s, t) => s + t.valor, 0) 
        : items.filter(t => t.tipo === 'a_receber').reduce((s, t) => s + t.valor, 0);
        
    const totalDespesas = isHistory 
        ? items.filter(t => t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0) 
        : items.filter(t => t.tipo === 'a_pagar').reduce((s, t) => s + t.valor, 0);
        
    const saldo = totalReceitas - totalDespesas;

    container.innerHTML = `
        <div class="summary-panel-modern">
            <div class="stat-item">
                <span class="stat-label">Total de Itens</span>
                <span class="stat-value">${items.length}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">${isHistory ? 'Entradas' : 'A Receber'}</span>
                <span class="stat-value income-text">${formatarMoeda(totalReceitas)}</span>
            </div>
            <div class="stat-item">
                <span class="stat-label">${isHistory ? 'Saídas' : 'A Pagar'}</span>
                <span class="stat-value expense-text">${formatarMoeda(totalDespesas)}</span>
            </div>
            ${isHistory ? `
            <div class="stat-item">
                <span class="stat-label">Saldo do Período</span>
                <span class="stat-value ${saldo >= 0 ? 'income-text' : 'expense-text'}">${formatarMoeda(saldo)}</span>
            </div>
            ` : ''}
        </div>`;
};

// --- HELPER PARA CARDS FLUTUANTES ---
// GERA ID ÚNICO E ATRIBUI CORRETAMENTE
const createCardHTML = (titulo, valor, data, categoria, contaNome, iconObj, type, actionsHTML, badgesHTML = '') => {
    const isDespesa = type === 'despesa' || type === 'a_pagar';
    const colorClass = isDespesa ? 'text-danger' : 'text-success';
    const symbol = isDespesa ? '-' : '+';
    
    // GERA ID ÚNICO PARA ESTE CARD
    const uniqueId = 'collapse-' + Math.random().toString(36).substr(2, 9);
    
    const dateObj = new Date(data + 'T12:00:00');
    const dateStr = dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

    return `
    <div class="accordion-item shadow-sm border-0 mb-2" style="border-radius: 12px; overflow:hidden;">
        <h2 class="accordion-header">
            <button class="accordion-button collapsed py-3" type="button" data-bs-toggle="collapse" data-bs-target="#${uniqueId}">
                <div class="d-flex w-100 align-items-center">
                    <div class="transaction-icon-wrapper me-3 flex-shrink-0" style="background-color: ${iconObj.color}; width:42px; height:42px; border-radius:12px; display:flex; align-items:center; justify-content:center; color:white;">
                        <i class="${iconObj.icon}"></i>
                    </div>
                    <div class="flex-grow-1" style="min-width: 0;">
                        <div class="d-flex align-items-center gap-2">
                            <span class="fw-bold text-truncate text-dark" style="font-size:0.95rem;">${escapeHTML(titulo)}</span>
                            ${badgesHTML}
                        </div>
                        <div class="small text-muted d-flex align-items-center gap-2">
                            <span><i class="far fa-calendar me-1"></i>${dateStr}</span>
                            <span class="d-none d-sm-inline">•</span>
                            <span class="d-none d-sm-inline text-truncate">${escapeHTML(contaNome)}</span>
                        </div>
                    </div>
                    <span class="fw-bold fs-6 ${colorClass} ms-2 text-nowrap">${symbol} ${formatarMoeda(valor).replace('R$', '')}</span>
                </div>
            </button>
        </h2>
        <div id="${uniqueId}" class="accordion-collapse collapse">
            <div class="accordion-body bg-light">
                <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
                    <small class="text-muted">
                        <strong>Categoria:</strong> ${escapeHTML(categoria)} <br>
                        <strong>Data Completa:</strong> ${dateObj.toLocaleDateString('pt-BR')}
                    </small>
                    <div class="btn-group btn-group-sm">
                        ${actionsHTML}
                    </div>
                </div>
            </div>
        </div>
    </div>`;
};

// --- RENDER CARD: TRANSAÇÕES (HISTÓRICO) ---
const renderTransactionCard = (t) => {
    const conta = getContaPorId(t.conta_id);
    const icon = CATEGORY_ICONS[t.categoria] || CATEGORY_ICONS['Outros'];
    const badge = t.isPending ? '<span class="badge bg-warning text-dark">Pendente</span>' : '';
    
    const extraBtn = (t.compra_parcelada_id) 
        ? `<button class="btn btn-outline-info" data-action="recriar-compra-parcelada" data-id="${t.compra_parcelada_id}" title="Configurar Série"><i class="fas fa-cog"></i></button>` 
        : '';

    let actions = '';
    if (t.isPending) {
         actions = `
            <button class="btn btn-success" data-action="pagar-conta" data-id="${t.id}" title="Confirmar"><i class="fas fa-check"></i></button>
            <button class="btn btn-outline-secondary" data-action="editar-lancamento" data-id="${t.id}"><i class="fas fa-pen"></i></button>
            ${extraBtn}
            <button class="btn btn-outline-danger" data-action="deletar-lancamento" data-id="${t.id}"><i class="fas fa-trash"></i></button>`;
    } else {
        actions = `
            <button class="btn btn-outline-secondary" data-action="editar-transacao" data-id="${t.id}"><i class="fas fa-pen"></i></button>
            ${extraBtn}
            <button class="btn btn-outline-danger" data-action="deletar-transacao" data-id="${t.id}"><i class="fas fa-trash"></i></button>`;
    }

    return createCardHTML(t.descricao, t.valor, (t.data || t.data_vencimento), t.categoria, (conta ? conta.nome : 'N/A'), icon, t.tipo, actions, badge);
};

// --- RENDER CARD: CONTAS A PAGAR ---
const renderBillItem = (bill, compras) => {
    let cat = bill.categoria;
    let badge = '';
    const isParcela = !!bill.compra_parcelada_id;

    if (isParcela) {
        const c = compras.find(k => k.id === bill.compra_parcelada_id);
        if(c) {
            cat = c.categoria;
            badge = c.descricao.includes('(Série)') 
                ? '<span class="badge bg-info text-dark" style="font-size:0.65rem;">Série</span>' 
                : '<span class="badge bg-secondary" style="font-size:0.65rem;">Parcela</span>';
        }
    }
    const icon = CATEGORY_ICONS[cat] || CATEGORY_ICONS['Outros'];
    
    const isReceita = bill.tipo === 'a_receber';
    const payBtnClass = isReceita ? 'btn-primary' : 'btn-success';
    const payIcon = isReceita ? 'fas fa-hand-holding-usd' : 'fas fa-check';

    const extraButton = isParcela 
        ? `<button class="btn btn-outline-info" data-action="recriar-compra-parcelada" data-id="${bill.compra_parcelada_id}" title="Configurar Série"><i class="fas fa-cog"></i></button>` 
        : '';

    const actions = `
        <button class="btn ${payBtnClass}" data-action="pagar-conta" data-id="${bill.id}" title="Baixar"><i class="${payIcon}"></i></button>
        <button class="btn btn-outline-secondary" data-action="editar-lancamento" data-id="${bill.id}"><i class="fas fa-pen"></i></button>
        ${extraButton}
        <button class="btn btn-outline-danger" data-action="deletar-lancamento" data-id="${bill.id}" data-compra-id="${bill.compra_parcelada_id || ''}"><i class="fas fa-trash"></i></button>
    `;

    return createCardHTML(bill.descricao, bill.valor, bill.data_vencimento, cat, 'Agendado', icon, bill.tipo, actions, badge);
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
        container.innerHTML = '<p class="text-center text-body-secondary p-3">Nenhuma transação encontrada para os filtros selecionados.</p>';
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
        `<option value="${t.nome}" data-is-card="${t.e_cartao}" ${conta.tipo === t.nome ? 'selected' : ''}>${escapeHTML(t.nome)}</option>`
    ).join('');
    
    const currentIsCard = conta.tipo ? isTipoCartao(conta.tipo) : (tipos[0] ? tipos[0].e_cartao : false);

    const body = `
        <form id="form-conta" data-id="${id || ''}">
            <div class="mb-3"><label class="form-label">Nome da Conta</label><input name="nome" class="form-control" value="${escapeHTML(conta.nome || '')}" required></div>
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
            <span>${escapeHTML(c.nome)}</span>
            <div class="btn-group">
                <button class="btn btn-sm btn-outline-secondary" data-action="editar-categoria" data-id="${c.id}" data-nome="${escapeHTML(c.nome)}"><i class="fas fa-pen"></i></button>
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
        <form id="form-editar-categoria" data-id="${id}" data-nome-antigo="${escapeHTML(nomeAtual)}">
            <div class="mb-3"><label class="form-label">Nome da Categoria</label><input type="text" name="nome" class="form-control" value="${escapeHTML(nomeAtual)}" required></div>
            <div class="text-end"><button type="submit" class="btn btn-primary">Salvar</button></div>
        </form>`;
    return { title: 'Editar Categoria', body };
};

export const getAccountTypesModalContent = () => {
    const tipos = getTiposContas();
    const listaHtml = tipos.map(t => `
        <li class="list-group-item d-flex justify-content-between align-items-center">
            <div>
                <span>${escapeHTML(t.nome)}</span>
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
    // CORREÇÃO: Usar '==' para comparar ID string com número
    const bill = id ? getState().lancamentosFuturos.find(l => l.id == id) : {};
    const title = id ? 'Editar Parcela' : 'Novo Lançamento';
    const isParcela = !!bill.compra_parcelada_id;
    const categoriasOptions = getCategoriaOptionsHTML(bill.categoria);
    
    const warning = isParcela 
        ? `<div class="alert alert-info small"><i class="fas fa-info-circle"></i> Você está editando apenas esta parcela. Para mudar todas, use o botão de Engrenagem na lista.</div>` 
        : '';

    const body = `
        <form id="form-lancamento" data-id="${id || ''}">
            ${warning}
            <div class="mb-3"><label class="form-label">Descrição</label><input name="descricao" value="${escapeHTML(bill.descricao || '')}" class="form-control" required></div>
            <div class="mb-3"><label class="form-label">Valor</label><input name="valor" type="number" step="0.01" value="${bill.valor || ''}" class="form-control" required></div>
            <div class="mb-3"><label class="form-label">Data Vencimento</label><input name="data_vencimento" type="date" value="${bill.data_vencimento || toISODateString(new Date())}" class="form-control" required></div>
            <div class="mb-3"><label class="form-label">Categoria</label><select name="categoria" class="form-select">${categoriasOptions}</select></div>
            <div class="mb-3"><label class="form-label">Tipo</label><select name="tipo" class="form-select"><option value="a_pagar" ${bill.tipo==='a_pagar'?'selected':''}>A Pagar</option><option value="a_receber" ${bill.tipo==='a_receber'?'selected':''}>A Receber</option></select></div>
            <div class="text-end"><button type="submit" class="btn btn-primary">Salvar</button></div>
        </form>`;
    return { title, body };
};

export const getTransactionModalContent = (id) => {
    // CORREÇÃO: Usar '==' para comparar ID string com número
    const transacao = getState().transacoes.find(t => t.id == id);
    if (!transacao) return { title: 'Erro', body: '<p>Transação não encontrada.</p>' };

    const title = 'Editar Transação';
    const contasOptions = getContas().map(c => `<option value="${c.id}" ${transacao.conta_id === c.id ? 'selected' : ''}>${escapeHTML(c.nome)}</option>`).join('');
    const categoriasOptions = getCategoriaOptionsHTML(transacao.categoria);

    const body = `
        <form id="form-edicao-transacao" data-id="${id}">
            <div class="mb-3"><label class="form-label">Descrição</label><input name="descricao" value="${escapeHTML(transacao.descricao)}" class="form-control" required></div>
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
    const contasOptions = getContas().map(c => `<option value="${c.id}" ${compra.conta_id === c.id ? 'selected' : ''}>${escapeHTML(c.nome)}</option>`).join('');
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
            <div class="mb-3"><label class="form-label">Descrição da Série</label><input name="descricao" value="${escapeHTML(compra.descricao)}" class="form-control" required></div>
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
    // CORREÇÃO: Usar '==' para comparar ID string com número
    const bill = getState().lancamentosFuturos.find(b => b.id == billId);
    if (!bill) return { title: 'Erro', body: 'Lançamento não encontrado.' };
    
    // Modal Inteligente (Pagar vs Receber)
    const isReceita = bill.tipo === 'a_receber';
    const title = isReceita ? 'Confirmar Recebimento' : 'Pagar Lançamento';
    const textoAcao = isReceita ? 'recebendo' : 'pagando';
    const btnClass = isReceita ? 'btn-primary' : 'btn-success';
    const btnText = isReceita ? 'Confirmar Recebimento' : 'Confirmar Pagamento';

    const body = `
        <form id="form-pagamento" data-bill-id="${bill.id}" data-valor="${bill.valor}" data-desc="${escapeHTML(bill.descricao)}" data-cat="${escapeHTML(bill.categoria || 'Contas')}">
            <p>Você está ${textoAcao} <strong>${escapeHTML(bill.descricao)}</strong> no valor de:</p>
            <p class="h3 text-center my-3 ${isReceita ? 'income-text' : 'expense-text'}">${formatarMoeda(bill.valor)}</p>
            <div class="mb-3"><label class="form-label">Data da Transação</label><input type="date" name="data" value="${toISODateString(new Date())}" class="form-control"></div>
            <div class="mb-3"><label class="form-label">Conta</label><select name="conta_id" class="form-select">${getContas().filter(c=>c.tipo!=='Cartão de Crédito').map(c=>`<option value="${c.id}">${escapeHTML(c.nome)}</option>`).join('')}</select></div>
            <div class="text-end"><button type="submit" class="btn ${btnClass}">${btnText}</button></div>
        </form>`;
    return { title, body };
};

export const getStatementModalContent = (contaId) => {
    const conta = getContaPorId(contaId);
    if (!conta) return { title: 'Erro', body: 'Conta não encontrada.' };

    const title = `Fatura - ${escapeHTML(conta.nome)}`;
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

    const title = `Extrato - ${escapeHTML(conta.nome)}`;
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
    // Agora usando o novo layout de abas
    renderContas(); // Renderiza na aba "Carteira"
    renderFormTransacaoRapida(); // Renderiza na aba "Lançar"
    
    renderVisaoMensal();
    renderVisaoAnual();
    renderFinancialHealth();
    renderFilters('bills', initialFilters?.bills || {});
    renderLancamentosFuturos(1, initialFilters?.bills || {});
    renderFilters('history', initialFilters?.history || {});
    renderHistoricoTransacoes(1, initialFilters?.history || {});
    renderMonthlyStatementTab();
    renderAnnualPlanningTab();
};

// --- AUTENTICAÇÃO UI ---

export const renderLoginScreen = () => {
    const container = document.getElementById('login-container');
    const app = document.getElementById('app-container');
    
    if(app) app.style.display = 'none'; // Esconde o app
    if(!container) return;

    container.style.display = 'flex';
    container.innerHTML = `
        <div class="card shadow-lg p-4" style="width: 100%; max-width: 400px;">
            <div class="text-center mb-4">
                <h3 class="text-primary fw-bold"><i class="fas fa-wallet me-2"></i>ConFin</h3>
                <p class="text-muted">Gestão Financeira Pessoal</p>
            </div>
            <form id="form-login">
                <div class="mb-3">
                    <label class="form-label">Email</label>
                    <input type="email" name="email" class="form-control" placeholder="seu@email.com" required>
                </div>
                <div class="mb-3">
                    <label class="form-label">Senha</label>
                    <input type="password" name="password" class="form-control" placeholder="******" required>
                </div>
                <button type="submit" class="btn btn-primary w-100 py-2">Entrar</button>
            </form>
        </div>
    `;
};

export const toggleAppView = (showApp) => {
    const loginDiv = document.getElementById('login-container');
    const appDiv = document.getElementById('app-container');
    
    if (showApp) {
        if(loginDiv) loginDiv.style.display = 'none';
        if(appDiv) appDiv.style.display = 'block';
    } else {
        renderLoginScreen();
    }
};

export const renderLogoutButton = () => {
    // A função é mantida para compatibilidade, mas o botão já está no HTML estático
};
