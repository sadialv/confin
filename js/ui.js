import { formatarMoeda, CATEGORIAS_PADRAO, toISODateString, CATEGORY_ICONS, CHART_COLORS } from './utils.js';
import { getState, getContaPorId, getContas } from './state.js';

let summaryChart = null;
let annualChart = null;
let netWorthChart = null;
let avgSpendingChart = null;
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
    renderFinancialHealth();
    renderFilters('bills', initialFilters.bills);
    renderLancamentosFuturos(1, initialFilters.bills);
    renderMonthlyStatementTab(initialFilters.statement);
};

// --- CÁLCULOS E RENDERIZAÇÃO DA SAÚDE FINANCEIRA ---
const calculateFinancialHealthMetrics = () => {
    const { contas, transacoes, lancamentosFuturos } = getState();
    const hoje = new Date();
    const mesAtual = hoje.toISOString().slice(0, 7);

    // 1. CÁLCULO DE PATRIMÔNIO LÍQUIDO
    let totalAtivos = 0;
    let totalPassivos = 0;

    contas.forEach(conta => {
        const saldoConta = transacoes
            .filter(t => t.conta_id === conta.id)
            .reduce((acc, t) => t.tipo === 'receita' ? acc + t.valor : acc - t.valor, conta.saldo_inicial);

        if (conta.tipo !== 'Cartão de Crédito') {
            totalAtivos += saldoConta > 0 ? saldoConta : 0;
        } else {
            if (saldoConta < 0) totalPassivos += Math.abs(saldoConta);
        }
    });
    totalPassivos += lancamentosFuturos
        .filter(l => l.status === 'pendente' && l.tipo === 'a_pagar')
        .reduce((acc, l) => acc + l.valor, 0);

    const patrimonioLiquido = totalAtivos - totalPassivos;

    // 2. DIAGNÓSTICO DO MÊS ATUAL
    const transacoesMes = transacoes.filter(t => t.data?.startsWith(mesAtual));
    const rendaMensal = transacoesMes.filter(t => t.tipo === 'receita').reduce((acc, t) => acc + t.valor, 0);

    const catsFixas = ['Moradia', 'Contas', 'Educação', 'Saúde', 'Transporte'];
    const catsVariaveis = ['Alimentação', 'Lazer', 'Compras', 'Outros'];

    const despesasFixas = transacoesMes.filter(t => t.tipo === 'despesa' && catsFixas.includes(t.categoria)).reduce((acc, t) => acc + t.valor, 0);
    const despesasVariaveis = transacoesMes.filter(t => t.tipo === 'despesa' && catsVariaveis.includes(t.categoria)).reduce((acc, t) => acc + t.valor, 0);
    const pagamentoFaturas = transacoesMes.filter(t => t.tipo === 'despesa' && t.categoria === 'Pagamento de Fatura').reduce((acc, t) => acc + t.valor, 0);
    const totalDespesas = despesasFixas + despesasVariaveis + pagamentoFaturas;
    const saldoMensal = rendaMensal - totalDespesas;

    // 3. INDICADORES
    const indiceEndividamento = totalAtivos > 0 ? (totalPassivos / totalAtivos) * 100 : 0;
    const comprometimentoRenda = rendaMensal > 0 ? (pagamentoFaturas / rendaMensal) * 100 : 0;
    const reservaEmergenciaMeses = despesasFixas > 0 ? (totalAtivos / despesasFixas) : Infinity;
    const taxaPoupanca = rendaMensal > 0 ? (saldoMensal / rendaMensal) * 100 : 0;

    // 4. REGRA 50-30-20
    const catsNecessidades = ['Moradia', 'Contas', 'Educação', 'Saúde', 'Transporte', 'Alimentação'];
    const catsDesejos = ['Lazer', 'Compras', 'Outros'];
    const gastosNecessidades = transacoesMes.filter(t => t.tipo === 'despesa' && catsNecessidades.includes(t.categoria)).reduce((acc, t) => acc + t.valor, 0);
    const gastosDesejos = transacoesMes.filter(t => t.tipo === 'despesa' && catsDesejos.includes(t.categoria)).reduce((acc, t) => acc + t.valor, 0);

    const percNecessidades = rendaMensal > 0 ? (gastosNecessidades / rendaMensal) * 100 : 0;
    const percDesejos = rendaMensal > 0 ? (gastosDesejos / rendaMensal) * 100 : 0;
    const percPoupanca = taxaPoupanca;

    // 5. SCORE DE SAÚDE FINANCEIRA (Modelo Simples)
    const scorePoupanca = Math.min(100, Math.max(0, (taxaPoupanca / 20) * 100)); // 20% = nota 100
    const scoreEndividamento = Math.min(100, Math.max(0, (1 - (indiceEndividamento / 50)) * 100)); // 50% = nota 0
    const scoreReserva = Math.min(100, Math.max(0, (reservaEmergenciaMeses / 6) * 100)); // 6 meses = nota 100
    const financialScore = (scorePoupanca * 0.4) + (scoreEndividamento * 0.4) + (scoreReserva * 0.2);

    // 6. DADOS HISTÓRICOS PARA GRÁFICOS
    let gastosPorCategoria = {};
    let meses = new Set();

    transacoes.forEach(t => {
        const mes = t.data.substring(0, 7);
        meses.add(mes);
        if (t.tipo === 'despesa') {
            gastosPorCategoria[t.categoria] = (gastosPorCategoria[t.categoria] || 0) + t.valor;
        }
    });
    const numMeses = meses.size || 1;
    const mediaGastosCategoria = Object.entries(gastosPorCategoria)
        .map(([categoria, total]) => ({ categoria, media: total / numMeses }))
        .sort((a,b) => b.media - a.media);

    const historicoPatrimonio = Array.from(meses).sort().slice(-12).map(mes => {
        const transacoesAteMes = transacoes.filter(t => t.data.substring(0,7) <= mes);
        let ativos = 0, passivos = 0;
        contas.forEach(c => {
            const saldo = transacoesAteMes.filter(t => t.conta_id === c.id).reduce((acc, t) => t.tipo === 'receita' ? acc + t.valor : acc - t.valor, c.saldo_inicial);
            if (c.tipo !== 'Cartão de Crédito') ativos += saldo > 0 ? saldo : 0;
            else if (saldo < 0) passivos += Math.abs(saldo);
        });
        return { mes, valor: ativos - passivos };
    });

    return {
        rendaMensal, despesasFixas, despesasVariaveis, saldoMensal, totalDespesas,
        totalAtivos, totalPassivos, patrimonioLiquido,
        indiceEndividamento, comprometimentoRenda, reservaEmergenciaMeses, taxaPoupanca,
        percNecessidades, percDesejos, percPoupanca,
        financialScore,
        mediaGastosCategoria,
        historicoPatrimonio
    };
};

export const renderFinancialHealth = () => {
    const container = document.getElementById('health-tab-pane');
    if (!container) return;

    const metrics = calculateFinancialHealthMetrics();

    const scoreColor = metrics.financialScore >= 75 ? 'success' : metrics.financialScore >= 40 ? 'warning' : 'danger';

    container.innerHTML = `
        <div class="row">
            <div class="col-12">
                <div class="card mb-3">
                    <div class="card-body text-center">
                        <h5 class="card-title">Score de Saúde Financeira</h5>
                        <div class="progress mx-auto my-3" style="height: 25px; max-width: 400px;">
                            <div class="progress-bar bg-${scoreColor}" role="progressbar" style="width: ${metrics.financialScore.toFixed(0)}%;" aria-valuenow="${metrics.financialScore.toFixed(0)}">${metrics.financialScore.toFixed(0)} / 100</div>
                        </div>
                        <p class="small text-body-secondary">Uma nota geral baseada na sua poupança, dívidas e reservas.</p>
                    </div>
                </div>
            </div>
        </div>

        <div class="row">
            <div class="col-lg-4 mb-3">
                <div class="card h-100">
                    <div class="card-header"><h6 class="mb-0">Diagnóstico do Mês</h6></div>
                    <ul class="list-group list-group-flush">
                        <li class="list-group-item d-flex justify-content-between"><span>Renda Total</span> <strong class="income-text">${formatarMoeda(metrics.rendaMensal)}</strong></li>
                        <li class="list-group-item d-flex justify-content-between"><span>Despesas Fixas</span> <span>${formatarMoeda(metrics.despesasFixas)}</span></li>
                        <li class="list-group-item d-flex justify-content-between"><span>Despesas Variáveis</span> <span>${formatarMoeda(metrics.despesasVariaveis)}</span></li>
                        <li class="list-group-item d-flex justify-content-between"><span>Total Despesas</span> <strong class="expense-text">${formatarMoeda(metrics.totalDespesas)}</strong></li>
                        <li class="list-group-item d-flex justify-content-between"><span>Saldo Mensal</span> <strong class="${metrics.saldoMensal >= 0 ? 'income-text' : 'expense-text'}">${formatarMoeda(metrics.saldoMensal)}</strong></li>
                    </ul>
                </div>
            </div>

            <div class="col-lg-4 mb-3">
                 <div class="card h-100">
                    <div class="card-header"><h6 class="mb-0">Patrimônio Líquido</h6></div>
                    <ul class="list-group list-group-flush">
                        <li class="list-group-item d-flex justify-content-between"><span>Ativos</span> <span class="text-success">${formatarMoeda(metrics.totalAtivos)}</span></li>
                        <li class="list-group-item d-flex justify-content-between"><span>Passivos (Dívidas)</span> <span class="text-danger">${formatarMoeda(metrics.totalPassivos)}</span></li>
                        <li class="list-group-item d-flex justify-content-between"><strong>Patrimônio Líquido</strong> <strong>${formatarMoeda(metrics.patrimonioLiquido)}</strong></li>
                    </ul>
                    <div class="card-body">
                        <h6 class="small">Índice de Endividamento</h6>
                        <div class="progress"><div class="progress-bar bg-danger" role="progressbar" style="width: ${metrics.indiceEndividamento.toFixed(0)}%">${metrics.indiceEndividamento.toFixed(0)}%</div></div>
                    </div>
                </div>
            </div>

            <div class="col-lg-4 mb-3">
                <div class="card h-100">
                    <div class="card-header"><h6 class="mb-0">Indicadores Chave</h6></div>
                    <div class="card-body text-center">
                        <h6>Reserva de Emergência</h6>
                        <p class="h3 ${metrics.reservaEmergenciaMeses >= 6 ? 'text-success' : 'text-warning'}">${isFinite(metrics.reservaEmergenciaMeses) ? metrics.reservaEmergenciaMeses.toFixed(1) : '∞'} meses</p>
                        <hr>
                        <h6>Taxa de Poupança</h6>
                        <p class="h4 ${metrics.taxaPoupanca >= 20 ? 'text-success' : 'text-warning'}">${metrics.taxaPoupanca.toFixed(1)}%</p>
                    </div>
                </div>
            </div>
        </div>

        <div class="card mb-3">
            <div class="card-header"><h6 class="mb-0">Equilíbrio de Gastos (Regra 50-30-20)</h6></div>
            <div class="card-body">
                <div class="mb-2">
                    <label class="form-label small d-flex justify-content-between">Necessidades (Ideal: 50%) <span>${metrics.percNecessidades.toFixed(0)}%</span></label>
                    <div class="progress"><div class="progress-bar" role="progressbar" style="width: ${metrics.percNecessidades.toFixed(0)}%"></div></div>
                </div>
                <div class="mb-2">
                    <label class="form-label small d-flex justify-content-between">Desejos (Ideal: 30%) <span>${metrics.percDesejos.toFixed(0)}%</span></label>
                    <div class="progress"><div class="progress-bar bg-warning" role="progressbar" style="width: ${metrics.percDesejos.toFixed(0)}%"></div></div>
                </div>
                <div>
                    <label class="form-label small d-flex justify-content-between">Poupança (Ideal: 20%) <span>${metrics.percPoupanca.toFixed(0)}%</span></label>
                    <div class="progress"><div class="progress-bar bg-success" role="progressbar" style="width: ${metrics.percPoupanca.toFixed(0)}%"></div></div>
                </div>
            </div>
        </div>

        <div class="row">
            <div class="col-lg-6 mb-3">
                <div class="card h-100">
                    <div class="card-header"><h6 class="mb-0">Evolução do Patrimônio</h6></div>
                    <div class="card-body"><canvas id="net-worth-chart"></canvas></div>
                </div>
            </div>
            <div class="col-lg-6 mb-3">
                <div class="card h-100">
                    <div class="card-header"><h6 class="mb-0">Média de Gastos por Categoria</h6></div>
                    <div class="card-body"><canvas id="avg-spending-chart"></canvas></div>
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
                    label: 'Patrimônio Líquido',
                    data: metrics.historicoPatrimonio.map(h => h.valor),
                    borderColor: '#4A5568',
                    tension: 0.1,
                    fill: false
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    if (avgSpendingChart) avgSpendingChart.destroy();
    const asCtx = document.getElementById('avg-spending-chart')?.getContext('2d');
    if (asCtx && metrics.mediaGastosCategoria.length) {
        const top5 = metrics.mediaGastosCategoria.slice(0, 5);
        avgSpendingChart = new Chart(asCtx, {
            type: 'bar',
            data: {
                labels: top5.map(item => item.categoria),
                datasets: [{
                    label: 'Média Mensal',
                    data: top5.map(item => item.media),
                    backgroundColor: CHART_COLORS
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y' }
        });
    }
};

export const renderVisaoMensal = () => {
    const container = document.getElementById('dashboard-monthly-container');
    if (!container) return;
    const mes = new Date().toISOString().slice(0, 7);
    const transacoesMes = [...getState().transacoes, ...gerarTransacoesVirtuais()].filter(t => t.data?.startsWith(mes));
    const receitas = transacoesMes.filter(t => t.tipo === 'receita').reduce((s, t) => s + t.valor, 0);
    const despesas = transacoesMes.filter(t => t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0);

    container.innerHTML = `
        <h5 class="mb-3">Resumo do Mês</h5>
        <div class="row text-center mb-3">
            <div class="col-4"><h6>Receitas</h6><p class="h4 income-text mb-0">${formatarMoeda(receitas)}</p></div>
            <div class="col-4"><h6>Despesas</h6><p class="h4 expense-text mb-0">${formatarMoeda(despesas)}</p></div>
            <div class="col-4"><h6>Saldo</h6><p class="h4 ${(receitas-despesas) >= 0 ? 'income-text':'expense-text'} mb-0">${formatarMoeda(receitas-despesas)}</p></div>
        </div>
        <div style="height: 250px;"><canvas id="summary-chart-monthly"></canvas></div>
    `;

    if (summaryChart) summaryChart.destroy();
    const ctx = document.getElementById('summary-chart-monthly')?.getContext('2d');
    const despesasPorCat = transacoesMes.filter(t=>t.tipo==='despesa').reduce((acc,t)=>{acc[t.categoria]=(acc[t.categoria]||0)+t.valor;return acc;},{});
    if(ctx && Object.keys(despesasPorCat).length > 0) {
        summaryChart = new Chart(ctx, {type:'doughnut',data:{labels:Object.keys(despesasPorCat),datasets:[{data:Object.values(despesasPorCat),backgroundColor:CHART_COLORS}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}}}});
    }
};

export const renderVisaoAnual = () => {
    const container = document.getElementById('dashboard-yearly-container');
    if (!container) return;
    const ano = new Date().getFullYear();
    const transacoesAno = [...getState().transacoes,...gerarTransacoesVirtuais()].filter(t => t.data?.startsWith(ano));
    let receitasPorMes = Array(12).fill(0), despesasPorMes = Array(12).fill(0);
    transacoesAno.forEach(t => {const mes = new Date(t.data+'T12:00:00').getMonth(); if(t.tipo==='receita') receitasPorMes[mes]+=t.valor; else despesasPorMes[mes]+=t.valor;});
    container.innerHTML = `<h5 class="mb-3">Fluxo de Caixa Anual</h5><div style="height: 300px;"><canvas id="annual-chart"></canvas></div>`;
    if(annualChart) annualChart.destroy();
    const ctx = document.getElementById('annual-chart')?.getContext('2d');
    if(ctx) {
        annualChart = new Chart(ctx, {type:'bar',data:{labels:['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'],datasets:[{label:'Receitas',data:receitasPorMes,backgroundColor:'rgba(25,135,84,0.7)'},{label:'Despesas',data:despesasPorMes,backgroundColor:'rgba(220,53,69,0.7)'}]},options:{responsive:true,maintainAspectRatio:false,scales:{y:{beginAtZero:true}}}});
    }
};

export const renderContas = () => {
    const container = document.getElementById('accounts-container');
    const { contas, transacoes } = getState();

    if (!contas || !contas.length) {
        container.innerHTML = '<p class="text-center text-body-secondary p-3">Nenhuma conta cadastrada.</p>';
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
        if (conta.tipo === 'Cartão de Crédito') {
            acoesEspecificas = `<button class="btn btn-outline-secondary btn-sm" data-action="ver-fatura" data-id="${conta.id}" title="Ver Fatura"><i class="fas fa-receipt fa-fw"></i></button>`;
        } else if (['Conta Corrente', 'Dinheiro', 'Poupança'].includes(conta.tipo)) {
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

    container.classList.remove('p-0');
    container.innerHTML = `<div class="p-2">${cardsHtml}</div>`;
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
        <div class="accordion-item">
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

// ======================================================
// ========= ATUALIZAÇÃO ABA EXTRATO MENSAL =============
// ======================================================

export const renderMonthlyStatementTab = (initialFilters = {}) => {
    const container = document.getElementById('statement-tab-pane');
    if (!container) return;

    const { transacoes } = getState();
    const contas = getContas();

    const accountOptions = contas.map(conta =>
        `<option value="${conta.id}" ${initialFilters.contaId == conta.id ? 'selected' : ''}>${conta.nome}</option>`
    ).join('');

    const availableMonths = [...new Set(transacoes.map(t => t.data.substring(0, 7)))].sort().reverse();
    const monthOptions = availableMonths.map(mes => {
        const [ano, mesNum] = mes.split('-');
        const nomeMes = new Date(ano, mesNum - 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
        return `<option value="${mes}" ${initialFilters.mes === mes ? 'selected' : ''}>${nomeMes}</option>`;
    }).join('');

    container.innerHTML = `
        <div class="row g-2 mb-3">
            <div class="col-md-4">
                <select class="form-select form-select-sm" id="tab-statement-month-select">
                    ${monthOptions}
                </select>
            </div>
            <div class="col-md-4">
                <select class="form-select form-select-sm" id="tab-statement-account-filter">
                    <option value="todas" ${!initialFilters.contaId || initialFilters.contaId === 'todas' ? 'selected' : ''}>Todas as Contas</option>
                    ${accountOptions}
                </select>
            </div>
            <div class="col-md-4">
                <input type="search" class="form-control form-control-sm" id="tab-statement-search-input" placeholder="Pesquisar..." value="${initialFilters.pesquisa || ''}">
            </div>
        </div>
        <div id="tab-statement-details-container" class="mt-2">
            </div>
    `;

    renderMonthlyStatementDetails(initialFilters);
};

export const renderMonthlyStatementDetails = (filters = {}) => {
    const container = document.getElementById('tab-statement-details-container');
    if (!container) return;

    const mesSelecionado = filters.mes;
    if (!mesSelecionado) {
        container.innerHTML = '<p class="text-center text-body-secondary p-3">Nenhuma transação encontrada para gerar extratos.</p>';
        return;
    }

    const transacoesCompletas = [...getState().transacoes, ...gerarTransacoesVirtuais()];
    
    const transacoesFiltradas = transacoesCompletas
        .filter(t => t.data.startsWith(mesSelecionado))
        .filter(t => (filters.contaId === 'todas' || !filters.contaId) || t.conta_id == filters.contaId)
        .filter(t => t.descricao.toLowerCase().includes((filters.pesquisa || '').toLowerCase()));

    const receitas = transacoesFiltradas.filter(t => t.tipo === 'receita').reduce((s, t) => s + t.valor, 0);
    const despesas = transacoesFiltradas.filter(t => t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0);
    const saldo = receitas - despesas;

    const itemsHtml = transacoesFiltradas.length ?
        transacoesFiltradas.sort((a,b) => new Date(b.data) - new Date(a.data)).map(renderTransactionCard).join('') :
        '<p class="text-center text-body-secondary p-3">Nenhuma transação encontrada para os filtros selecionados.</p>';

    container.innerHTML = `
        <div class="card mb-3">
            <div class="card-body py-2">
                <div class="d-flex justify-content-around flex-wrap small text-center">
                    <span>Resultados: <strong class="d-block">${transacoesFiltradas.length}</strong></span>
                    <span class="income-text">Receitas: <strong class="d-block">${formatarMoeda(receitas)}</strong></span>
                    <span class="expense-text">Despesas: <strong class="d-block">${formatarMoeda(despesas)}</strong></span>
                    <span>Saldo: <strong class="d-block ${saldo >= 0 ? 'income-text' : 'expense-text'}">${formatarMoeda(saldo)}</strong></span>
                </div>
            </div>
        </div>
        <div class="accordion">
            ${itemsHtml}
        </div>
    `;
};
