// js/ui.js
import { formatarMoeda, CATEGORIAS_PADRAO, toISODateString, CATEGORY_ICONS, HOJE, CHART_COLORS } from './utils.js';
import { getState, getContaPorId, getContas } from './state.js';

let summaryChart = null;
let annualChart = null;
const ITEMS_PER_PAGE = 10;

// --- GERAL ---
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
    button.innerHTML = isLoading ? `<i class="fas fa-spinner fa-spin"></i>` : originalText;
};
export const openModal = (content) => {
    const modalContent = `<button class="modal-close-btn" id="modal-close-btn">&times;</button>${content}`;
    document.getElementById('modal-content-area').innerHTML = modalContent;
    document.getElementById('modal-container').classList.add('active');
    document.getElementById('modal-close-btn').addEventListener('click', closeModal);
};
export const closeModal = () => document.getElementById('modal-container').classList.remove('active');
export const switchTab = (button, parentSelector) => {
    const parent = document.querySelector(parentSelector);
    if (!parent) return;
    parent.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    parent.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    button.classList.add('active');
    const tabContent = parent.querySelector(`#${button.dataset.tab}`);
    if (tabContent) {
        tabContent.classList.add('active');
    }
};

// --- FUNÇÃO AUXILIAR PARA TRANSAÇÕES VIRTUAIS ---
const gerarTransacoesVirtuais = () => {
    try {
        const { comprasParceladas, lancamentosFuturos } = getState();
        const transacoesVirtuais = [];

        comprasParceladas.forEach(compra => {
            const parcelas = lancamentosFuturos.filter(l => l.compra_parcelada_id === compra.id);
            const dataCompra = new Date(compra.data_compra + 'T12:00:00');

            parcelas.forEach(parcela => {
                const numeroParcelaMatch = parcela.descricao.match(/\((\d+)\/\d+\)/);
                if (!numeroParcelaMatch) return;

                const numeroParcela = parseInt(numeroParcelaMatch[1]);
                const dataVirtual = new Date(dataCompra.getFullYear(), dataCompra.getMonth() + numeroParcela - 1, dataCompra.getDate());

                transacoesVirtuais.push({
                    id: `v_${parcela.id}`,
                    descricao: parcela.descricao,
                    valor: parcela.valor,
                    data: toISODateString(dataVirtual),
                    categoria: compra.categoria,
                    conta_id: compra.conta_id,
                    tipo: 'despesa',
                    isVirtual: true
                });
            });
        });
        return transacoesVirtuais;
    } catch (error) {
        console.error("Erro ao gerar transações virtuais:", error);
        return [];
    }
};


// --- RENDERIZAÇÃO ---
export const renderAllComponents = () => {
    renderContas();
    renderVisaoMensal();
    renderVisaoAnual();
    renderFilters('bills');
    renderLancamentosFuturos();
    renderFilters('history');
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
                    <div class="account-details">
                        <div class="account-name">${conta.nome}</div>
                        <div class="account-type">${conta.tipo}</div>
                    </div>
                    <div class="account-balance-actions">
                        <span class="account-balance ${saldo >= 0 ? 'income-text' : 'expense-text'}">${formatarMoeda(saldo)}</span>
                        <div class="account-actions">
                            ${botoesEspecificos}
                            <button class="btn-icon" data-action="editar-conta" data-id="${conta.id}" title="Editar"><i class="fas fa-edit"></i></button>
                            <button class="btn-icon" data-action="deletar-conta" data-id="${conta.id}" title="Deletar"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>
                </div>`;
    }).join('');
};
export const renderVisaoMensal = () => {
    const container = document.getElementById('dashboard-monthly');
    if (!container) return;
    const mes = document.getElementById('dashboard-month-filter')?.value || new Date().toISOString().slice(0, 7);
    const { transacoes } = getState();
    const transacoesVirtuais = gerarTransacoesVirtuais();
    const transacoesCompletas = [...transacoes, ...transacoesVirtuais];
    const transacoesMes = transacoesCompletas.filter(t => t.data?.startsWith(mes));
    const receitas = transacoesMes.filter(t => t.tipo === 'receita').reduce((s, t) => s + t.valor, 0);
    const despesas = transacoesMes.filter(t => t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0);
    container.innerHTML = `
        <input type="month" id="dashboard-month-filter" value="${mes}" style="margin-bottom: 1rem;">
        <div class="dashboard-kpis">
            <div class="kpi-item"><h4>Receitas</h4><p class="income-text">${formatarMoeda(receitas)}</p></div>
            <div class="kpi-item"><h4>Despesas</h4><p class="expense-text">${formatarMoeda(despesas)}</p></div>
            <div class="kpi-item"><h4>Saldo</h4><p class="${(receitas - despesas) >= 0 ? 'income-text' : 'expense-text'}">${formatarMoeda(receitas - despesas)}</p></div>
        </div>
        <div class="dashboard-chart-container"><canvas id="summary-chart-monthly"></canvas></div>`;
    document.getElementById('dashboard-month-filter').addEventListener('change', renderVisaoMensal);
    if (summaryChart) summaryChart.destroy();
    const ctx = document.getElementById('summary-chart-monthly')?.getContext('2d');
    const despesasPorCat = transacoesMes.filter(t => t.tipo === 'despesa').reduce((acc, t) => { acc[t.categoria] = (acc[t.categoria] || 0) + t.valor; return acc; }, {});
    if(ctx && Object.keys(despesasPorCat).length > 0) {
        summaryChart = new Chart(ctx, {
            type: 'doughnut', data: { labels: Object.keys(despesasPorCat), datasets: [{ data: Object.values(despesasPorCat), backgroundColor: CHART_COLORS }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: 'right' } } }
        });
    }
};
export const renderVisaoAnual = () => {
    const container = document.getElementById('dashboard-yearly');
    if (!container) return;
    const ano = parseInt(document.getElementById('dashboard-year-filter')?.value) || new Date().getFullYear();
    const { transacoes } = getState();
    const transacoesVirtuais = gerarTransacoesVirtuais();
    const transacoesCompletas = [...transacoes, ...transacoesVirtuais];
    const transacoesAno = transacoesCompletas.filter(t => t.data?.startsWith(ano));
    let receitasPorMes = Array(12).fill(0); let despesasPorMes = Array(12).fill(0);
    transacoesAno.forEach(t => {
        const mes = new Date(t.data + 'T12:00:00').getMonth();
        if (t.tipo === 'receita') receitasPorMes[mes] += t.valor; else despesasPorMes[mes] += t.valor;
    });
    container.innerHTML = `<input type="number" id="dashboard-year-filter" value="${ano}" min="2020" max="2050" style="margin-bottom: 1rem; width: 100px;"><div class="dashboard-chart-container"><canvas id="annual-chart"></canvas></div>`;
    document.getElementById('dashboard-year-filter').addEventListener('change', renderVisaoAnual);
    if (annualChart) annualChart.destroy();
    const ctx = document.getElementById('annual-chart')?.getContext('2d');
    if (ctx) {
        annualChart = new Chart(ctx, {
            type: 'bar', data: { labels: ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'], datasets: [{ label: 'Receitas', data: receitasPorMes, backgroundColor: 'rgba(0, 135, 90, 0.7)' },{ label: 'Despesas', data: despesasPorMes, backgroundColor: 'rgba(222, 53, 11, 0.7)' }] },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
        });
    }
};
export const renderFilters = (type, filters = { mes: 'todos', pesquisa: '' }) => {
    const isBills = type === 'bills';
    const containerId = isBills ? 'bills-filters-container' : 'history-filters-container';
    const container = document.getElementById(containerId);
    if (!container) return;
    
    let data, dateKey;
    if (isBills) {
        data = getState().lancamentosFuturos.filter(l => l.status === 'pendente');
        dateKey = 'data_vencimento';
    } else {
        const transacoesVirtuais = gerarTransacoesVirtuais();
        data = [...getState().transacoes, ...transacoesVirtuais];
        dateKey = 'data';
    }

    const mesesDisponiveis = [...new Set(
        data
            .map(item => item[dateKey] ? item[dateKey].substring(0, 7) : null)
            .filter(Boolean)
    )].sort().reverse();

    const mesOptions = mesesDisponiveis.map(mes => {
        const [ano, mesNum] = mes.split('-');
        const nomeMes = new Date(ano, mesNum - 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
        return `<option value="${mes}" ${filters.mes === mes ? 'selected' : ''}>${nomeMes}</option>`;
    }).join('');
    container.innerHTML = `
        <div class="filters-container">
            <div class="form-group"><label>Mês</label><select id="${isBills ? 'bills' : 'history'}-month-filter"><option value="todos">Todos</option>${mesOptions}</select></div>
            <div class="form-group"><label>Pesquisar</label><input type="search" id="${isBills ? 'bills' : 'history'}-search-input" value="${filters.pesquisa}"></div>
        </div>`;
};
export const renderLancamentosFuturos = (page = 1, filters = { mes: 'todos', pesquisa: '' }) => {
    const container = document.getElementById('bills-list-container');
    if (!container) return;
    try {
        const { lancamentosFuturos, comprasParceladas } = getState();
        const pendentes = lancamentosFuturos.filter(l => l.status === 'pendente');
        const pesquisaLower = filters.pesquisa.toLowerCase();
        const filtrados = pendentes.filter(l => (filters.mes === 'todos' || l.data_vencimento.startsWith(filters.mes)) && (filters.pesquisa === '' || l.descricao.toLowerCase().includes(pesquisaLower)));
        
        renderBillsSummary(filtrados);

        const totalPages = Math.ceil(filtrados.length / ITEMS_PER_PAGE);
        const itensPaginados = filtrados.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
        const itensHTML = itensPaginados.length ? itensPaginados.map(l => renderBillItem(l, comprasParceladas)).join('') : '<p class="placeholder">Nenhum lançamento encontrado.</p>';
        const paginacaoHTML = totalPages > 1 ? `<div class="pagination-container"><button class="btn" data-action="prev-page-bills" ${page === 1 ? 'disabled' : ''}>&lt;</button><span class="pagination-info">${page} / ${totalPages}</span><button class="btn" data-action="next-page-bills" ${page >= totalPages ? 'disabled' : ''}>&gt;</button></div>` : '';
        container.innerHTML = itensHTML + paginacaoHTML;
    } catch (error) {
        console.error("Erro ao renderizar lançamentos futuros:", error);
        container.innerHTML = '<p class="placeholder" style="color: var(--expense-color);">Ocorreu um erro ao carregar os lançamentos.</p>';
    }
};
const renderBillsSummary = (bills) => {
    const container = document.getElementById('bills-summary-panel');
    if (!container) return;
    const totalPagar = bills.filter(l => l.tipo === 'a_pagar').reduce((sum, l) => sum + l.valor, 0);
    const totalReceber = bills.filter(l => l.tipo === 'a_receber').reduce((sum, l) => sum + l.valor, 0);
    
    container.innerHTML = `
        <div class="summary-panel">
            <div class="summary-panel-item"><span class="label">Lançamentos na Tela</span><span class="value">${bills.length}</span></div>
            <div class="summary-panel-item"><span class="label">Total a Pagar (Visível)</span><span class="value expense-text">${formatarMoeda(totalPagar)}</span></div>
            <div class="summary-panel-item"><span class="label">Total a Receber (Visível)</span><span class="value income-text">${formatarMoeda(totalReceber)}</span></div>
        </div>`;
};
const renderBillItem = (bill, compras) => {
    const isParcela = !!bill.compra_parcelada_id; let cat = bill.categoria;
    if (isParcela) { const c = compras.find(compra => compra.id === bill.compra_parcelada_id); if(c) cat = c.categoria; }
    const icon = CATEGORY_ICONS[cat] || CATEGORY_ICONS['Outros'];
    const editAction = isParcela ? 'recriar-compra-parcelada' : 'editar-lancamento';
    const editId = isParcela ? bill.compra_parcelada_id : bill.id;
    return `<div class="bill-item">
                <div class="transaction-icon-wrapper" style="background-color:${icon.color};"><i class="${icon.icon}"></i></div>
                <div><div class="transaction-description">${bill.descricao}</div><div class="transaction-meta">Vence em: ${new Date(bill.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR')}</div></div>
                <span class="transaction-value ${bill.tipo === 'a_pagar' ? 'expense-text' : 'income-text'}">${formatarMoeda(bill.valor)}</span>
                <div class="bill-actions"><button class="btn btn-small" data-action="pagar-conta" data-id="${bill.id}">Pagar</button><button class="btn-icon" data-action="${editAction}" data-id="${editId}" title="Editar"><i class="fas fa-edit"></i></button><button class="btn-icon" data-action="deletar-lancamento" data-id="${bill.id}" data-compra-id="${bill.compra_parcelada_id}"><i class="fas fa-trash"></i></button></div>
            </div>`;
};
export const renderHistoricoTransacoes = (page = 1, filters = { mes: 'todos', pesquisa: '' }) => {
    const container = document.getElementById('history-list-container');
    if (!container) return;
    try {
        const transacoesVirtuais = gerarTransacoesVirtuais();
        const transacoesCompletas = [...getState().transacoes, ...transacoesVirtuais].sort((a,b) => new Date(b.data) - new Date(a.data));
        
        const pesquisaLower = filters.pesquisa.toLowerCase();
        const filtrados = transacoesCompletas.filter(t => (filters.mes === 'todos' || t.data.startsWith(filters.mes)) && (filters.pesquisa === '' || t.descricao.toLowerCase().includes(pesquisaLower) || t.categoria.toLowerCase().includes(pesquisaLower) || getContaPorId(t.conta_id)?.nome.toLowerCase().includes(pesquisaLower)));
        
        renderHistorySummary(filtrados);

        const totalPages = Math.ceil(filtrados.length / ITEMS_PER_PAGE);
        const itensPaginados = filtrados.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
        const itensHTML = itensPaginados.length ? itensPaginados.map(renderTransactionCard).join('') : '<p class="placeholder">Nenhuma transação encontrada.</p>';
        const paginacaoHTML = totalPages > 1 ? `<div class="pagination-container"><button class="btn" data-action="prev-page-history" ${page === 1 ? 'disabled' : ''}>&lt;</button><span class="pagination-info">${page} / ${totalPages}</span><button class="btn" data-action="next-page-history" ${page >= totalPages ? 'disabled' : ''}>&gt;</button></div>` : '';
        container.innerHTML = itensHTML + paginacaoHTML;
    } catch (error) {
        console.error("Erro ao renderizar histórico de transações:", error);
        container.innerHTML = '<p class="placeholder" style="color: var(--expense-color);">Ocorreu um erro ao carregar o histórico.</p>';
    }
};
const renderHistorySummary = (transactions) => {
    const container = document.getElementById('history-summary-panel');
    if (!container) return;
    const totalReceitas = transactions.filter(t => t.tipo === 'receita').reduce((sum, t) => sum + t.valor, 0);
    const totalDespesas = transactions.filter(t => t.tipo === 'despesa').reduce((sum, t) => sum + t.valor, 0);
    const saldo = totalReceitas - totalDespesas;
    container.innerHTML = `
        <div class="summary-panel">
            <div class="summary-panel-item"><span class="label">Transações na Tela</span><span class="value">${transactions.length}</span></div>
            <div class="summary-panel-item"><span class="label">Receitas (Visível)</span><span class="value income-text">${formatarMoeda(totalReceitas)}</span></div>
            <div class="summary-panel-item"><span class="label">Despesas (Visível)</span><span class="value expense-text">${formatarMoeda(totalDespesas)}</span></div>
            <div class="summary-panel-item"><span class="label">Saldo (Visível)</span><span class="value ${saldo >= 0 ? 'income-text' : 'expense-text'}">${formatarMoeda(saldo)}</span></div>
        </div>`;
};
const renderTransactionCard = (t) => {
    const conta = getContaPorId(t.conta_id); const icon = CATEGORY_ICONS[t.categoria] || CATEGORY_ICONS['Outros'];
    const editButton = t.isVirtual ? '' : `<button class="btn-icon" data-action="editar-transacao" data-id="${t.id}" title="Editar"><i class="fas fa-edit"></i></button>`;
    const deleteButton = t.isVirtual ? '' : `<button class="btn-icon" data-action="deletar-transacao" data-id="${t.id}" title="Deletar"><i class="fas fa-trash"></i></button>`;
    
    return `<div class="transaction-card">
            <div class="transaction-icon-wrapper" style="background-color:${icon.color};"><i class="${icon.icon}"></i></div>
            <div><div class="transaction-description">${t.descricao}</div><div class="transaction-meta">${t.categoria} | ${conta ? conta.nome : ''}</div></div>
            <span class="transaction-value ${t.tipo === 'despesa' ? 'expense-text' : 'income-text'}">${t.tipo === 'despesa' ? '-' : ''} ${formatarMoeda(t.valor)}</span>
            <div class="transaction-actions">${editButton}${deleteButton}</div>
        </div>`;
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
        <div class="form-group">
            <label for="tipo-compra">Tipo de Compra</label>
            <select id="tipo-compra" name="tipo_compra">
                <option value="vista">À Vista</option>
                <option value="parcelada">Parcelada</option>
                <option value="recorrente">Recorrente (Assinatura)</option>
            </select>
        </div>
        <div class="form-group"><label>Descrição</label><input type="text" name="descricao" required></div>
        <div class="form-group"><label id="label-valor">Valor</label><input type="number" name="valor" step="0.01" required></div>
        <div class="form-group" id="group-data"><label id="label-data">Data</label><input type="date" name="data" value="${toISODateString(new Date())}" required></div>
        <div class="form-group" id="group-conta"><label id="label-conta">Conta</label><select name="conta_id" required>${contasOptions}</select></div>
        <div id="parcelada-fields" style="display: none;"><div class="form-group"><label>Nº de Parcelas</label><input name="numero_parcelas" type="number" min="2"></div></div>
        <div id="recorrente-fields" style="display: none;">
            <div class="form-group"><label>Frequência</label><select name="frequencia"><option value="15d">A cada 15 dias</option><option value="30d">A cada 30 dias</option><option value="mensal">Mensal (dia fixo)</option><option value="anual">Anual</option></select></div>
            <div class="form-group" id="group-dia-vencimento"><label>Dia do Vencimento no Mês</label><input name="dia_vencimento" type="number" min="1" max="31" value="10"></div>
            <div class="form-group"><label>Quantidade de Lançamentos</label><input name="quantidade" type="number" min="1" value="12"></div>
        </div>
        <div class="form-group"><label>Categoria</label><select name="categoria" required>${categoriasOptions}</select></div>
        <button type="submit" class="btn">Salvar Transação</button>
    `;

    const contaSelect = container.querySelector('select[name="conta_id"]');
    if (contaSelect) {
        contaSelect.dataset.allOptions = contasOptions;
        contaSelect.dataset.creditCardOptions = contasCartaoOptions;
    }
};
export const getAccountModalContent = (id=null) => {
    const conta = id ? getContaPorId(id) : {};
    const isCreditCard = conta?.tipo === 'Cartão de Crédito';
    return `<h2>${id ? 'Editar' : 'Nova'} Conta</h2>
        <form id="form-conta" data-id="${id || ''}">
            <div class="form-group"><label>Nome</label><input name="nome" value="${conta.nome || ''}" required></div>
            <div class="form-group"><label>Tipo</label><select name="tipo" id="conta-tipo">
                <option ${conta.tipo === 'Conta Corrente' ? 'selected' : ''}>Conta Corrente</option>
                <option ${conta.tipo === 'Cartão de Crédito' ? 'selected' : ''}>Cartão de Crédito</option>
                <option ${conta.tipo === 'Dinheiro' ? 'selected' : ''}>Dinheiro</option>
                <option ${conta.tipo === 'Poupança' ? 'selected' : ''}>Poupança</option>
            </select></div>
            <div class="form-group" id="saldo-inicial-group" style="${isCreditCard ? 'display: none;' : ''}"><label>Saldo Inicial</label><input name="saldo_inicial" type="number" step="0.01" value="${conta.saldo_inicial || 0}" ${id ? 'disabled' : ''}></div>
            <div id="cartao-credito-fields" style="${isCreditCard ? '' : 'display: none;'}""><div class="form-group"><label>Dia do Fechamento da Fatura</label><input name="dia_fechamento_cartao" type="number" min="1" max="31" value="${conta.dia_fechamento_cartao || ''}"></div></div>
            <div style="text-align: right; margin-top: 1.5rem;"><button type="submit" class="btn">Salvar</button></div>
        </form>`;
};
export const getBillModalContent = (id = null) => {
    const { lancamentosFuturos } = getState();
    const bill = id ? lancamentosFuturos.find(l => l.id === id) : {};
    const categoriasOptions = CATEGORIAS_PADRAO.map(c => `<option value="${c}" ${bill.categoria === c ? 'selected' : ''}>${c}</option>`).join('');
    return `<h2>${id ? 'Editar' : 'Novo'} Lançamento</h2>
        <form id="form-lancamento" data-id="${id || ''}">
            <div class="form-group"><label>Descrição</label><input name="descricao" value="${bill.descricao || ''}" required></div>
            <div class="form-group"><label>Valor</label><input name="valor" type="number" step="0.01" value="${bill.valor || ''}" required></div>
            <div class="form-group"><label>Data Vencimento</label><input name="data_vencimento" type="date" value="${bill.data_vencimento || toISODateString(new Date())}" required></div>
            <div class="form-group"><label>Categoria</label><select name="categoria">${categoriasOptions}</select></div>
            <div class="form-group"><label>Tipo</label><select name="tipo"><option value="a_pagar" ${bill.tipo==='a_pagar'?'selected':''}>A Pagar</option><option value="a_receber" ${bill.tipo==='a_receber'?'selected':''}>A Receber</option></select></div>
            <div style="text-align: right;"><button type="submit" class="btn">Salvar</button></div>
        </form>`;
};
export const getTransactionModalContent = (id) => {
    const { transacoes } = getState();
    const transacao = transacoes.find(t => t.id === id);
    if (!transacao) return `<p>Transação não encontrada.</p>`;
    const contasOptions = getContas().map(c => `<option value="${c.id}" ${transacao.conta_id === c.id ? 'selected' : ''}>${c.nome}</option>`).join('');
    const categoriasOptions = CATEGORIAS_PADRAO.map(c => `<option value="${c}" ${transacao.categoria === c ? 'selected' : ''}>${c}</option>`).join('');
    return `<h2>Editar Transação</h2>
        <form id="form-edicao-transacao" data-id="${id}">
            <div class="form-group"><label>Descrição</label><input name="descricao" value="${transacao.descricao}" required></div>
            <div class="form-group"><label>Valor</label><input name="valor" type="number" step="0.01" value="${transacao.valor}" required></div>
            <div class="form-group"><label>Data</label><input name="data" type="date" value="${transacao.data}" required></div>
            <div class="form-group"><label>Conta</label><select name="conta_id">${contasOptions}</select></div>
            <div class="form-group"><label>Categoria</label><select name="categoria">${categoriasOptions}</select></div>
            <div class="form-group"><label>Tipo</label><select name="tipo"><option value="despesa" ${transacao.tipo==='despesa'?'selected':''}>Despesa</option><option value="receita" ${transacao.tipo==='receita'?'selected':''}>Receita</option></select></div>
            <div style="text-align: right;"><button type="submit" class="btn">Salvar Alterações</button></div>
        </form>`;
};
export const getInstallmentPurchaseEditModalContent = (compraId) => {
    const { comprasParceladas } = getState();
    const compra = comprasParceladas.find(c => c.id === compraId);
    if (!compra) return `<p>Compra não encontrada.</p>`;
    const categoriasOptions = CATEGORIAS_PADRAO.map(c => `<option value="${c}" ${compra.categoria === c ? 'selected' : ''}>${c}</option>`).join('');
    return `<h2>Editar Compra Parcelada</h2>
        <p style="color: var(--text-secondary); font-size: 0.9rem;">A alteração na descrição e categoria será aplicada a todas as parcelas futuras.</p>
        <form id="form-edicao-compra-parcelada" data-id="${compraId}">
            <div class="form-group"><label>Descrição</label><input name="descricao" value="${compra.descricao}" required></div>
            <div class="form-group"><label>Categoria</label><select name="categoria">${categoriasOptions}</select></div>
            <div style="text-align: right;"><button type="submit" class="btn">Salvar Alterações</button></div>
        </form>`;
};
export const getPayBillModalContent = (billId) => {
    const bill = getState().lancamentosFuturos.find(b=>b.id===billId);
    return `<h2>Pagar ${bill.descricao}</h2>
        <form id="form-pagamento" data-bill-id="${bill.id}" data-valor="${bill.valor}" data-desc="${bill.descricao}" data-cat="${bill.categoria || 'Contas'}">
            <p style="font-size: 1.5rem; font-weight: 600;">${formatarMoeda(bill.valor)}</p>
            <div class="form-group"><label>Data Pgto.</label><input type="date" name="data" value="${toISODateString(new Date())}"></div>
            <div class="form-group"><label>Pagar com</label><select name="conta_id">${getContas().filter(c=>c.tipo!=='Cartão de Crédito').map(c=>`<option value="${c.id}">${c.nome}</option>`).join('')}</select></div>
            <button class="btn" type="submit">Confirmar</button>
        </form>`;
};
export const getInstallmentPurchaseModalContent = (compraAEditar = null) => {
    const contasCartao = getContas().filter(c => c.tipo === 'Cartão de Crédito');
    const contasOptions = contasCartao.map(c => `<option value="${c.id}" ${compraAEditar?.conta_id === c.id ? 'selected' : ''}>${c.nome}</option>`).join('');
    const categoriasOptions = CATEGORIAS_PADRAO.map(c => `<option value="${c}" ${compraAEditar?.categoria === c ? 'selected' : ''}>${c}</option>`).join('');
    return `<h2>${compraAEditar ? 'Recriar' : 'Nova'} Compra Parcelada</h2>
        ${compraAEditar ? '<p class="placeholder" style="margin-bottom:1rem;">Ajuste os dados e salve. A compra antiga será substituída.</p>' : ''}
        <form id="form-compra-parcelada" data-compra-antiga-id="${compraAEditar?.id || ''}">
            <div class="form-group"><label>Descrição</label><input name="descricao" value="${compraAEditar?.descricao || ''}" required></div>
            <div class="form-group"><label>Valor Total</label><input name="valor_total" type="number" step="0.01" value="${compraAEditar?.valor_total || ''}" required></div>
            <div class="form-group"><label>Número de Parcelas</label><input name="numero_parcelas" type="number" min="1" value="${compraAEditar?.numero_parcelas || ''}" required></div>
            <div class="form-group"><label>Data da Compra</label><input name="data_compra" type="date" value="${compraAEditar?.data_compra || toISODateString(new Date())}" required></div>
            <div class="form-group"><label>Cartão de Crédito</label><select name="conta_id" required>${contasOptions}</select></div>
            <div class="form-group"><label>Categoria</label><select name="categoria" required>${categoriasOptions}</select></div>
            <div style="text-align: right;"><button type="submit" class="btn">${compraAEditar ? 'Salvar e Substituir' : 'Salvar Compra'}</button></div>
        </form>`;
};
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
export const renderStatementDetails = (contaId, mesSelecionado) => {
    const container = document.getElementById('statement-details-container');
    if (!mesSelecionado) { container.innerHTML = '<p class="placeholder">Selecione um mês para ver os detalhes.</p>'; return; }
    const conta = getContaPorId(contaId);
    const { transacoes } = getState();
    const diaFechamento = conta.dia_fechamento_cartao || 28;
    const [ano, mes] = mesSelecionado.split('-').map(Number);
    const fimCiclo = new Date(ano, mes - 1, diaFechamento);
    const inicioCiclo = new Date(fimCiclo);
    inicioCiclo.setMonth(inicioCiclo.getMonth() - 1);
    const transacoesFatura = transacoes.filter(t => {
        const dataTransacao = new Date(t.data + 'T12:00:00');
        return t.conta_id === contaId && dataTransacao > inicioCiclo && dataTransacao <= fimCiclo && t.tipo === 'despesa';
    });
    const totalFatura = transacoesFatura.reduce((acc, t) => acc + t.valor, 0);
    container.innerHTML = `
        <div>
            <h4>Total: <span class="expense-text">${formatarMoeda(totalFatura)}</span></h4>
            <p class="transaction-meta">Período de ${inicioCiclo.toLocaleDateString('pt-BR')} a ${fimCiclo.toLocaleDateString('pt-BR')}</p>
        </div>
        <div>
            ${transacoesFatura.length ? transacoesFatura.map(renderTransactionCard).join('') : '<p class="placeholder">Nenhuma despesa nesta fatura.</p>'}
        </div>`;
};
