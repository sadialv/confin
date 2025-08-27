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
        return `<div class="account-item">
                    <div>
                        <div class="account-name">${conta.nome}</div>
                        <div class="account-type">${conta.tipo}</div>
                    </div>
                    <span class="account-balance ${saldo >= 0 ? 'income-text' : 'expense-text'}">${formatarMoeda(saldo)}</span>
                    <div class="account-actions">
                        <button class="btn-icon" data-action="editar-conta" data-id="${conta.id}" title="Editar"><i class="fas fa-edit"></i></button>
                        <button class="btn-icon" data-action="deletar-conta" data-id="${conta.id}" title="Deletar"><i class="fas fa-trash"></i></button>
                    </div>
                </div>`;
    }).join('');
};

export const renderVisaoMensal = () => {
    const container = document.getElementById('dashboard-monthly');
    const mes = document.getElementById('dashboard-month-filter')?.value || new Date().toISOString().slice(0, 7);
    const { transacoes } = getState();
    const transacoesMes = transacoes.filter(t => t.data?.startsWith(mes));
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
    const despesasPorCat = transacoesMes.filter(t => t.tipo === 'despesa').reduce((acc, t) => {
        acc[t.categoria] = (acc[t.categoria] || 0) + t.valor;
        return acc;
    }, {});
    if(ctx) {
        summaryChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(despesasPorCat),
                datasets: [{ data: Object.values(despesasPorCat), backgroundColor: CHART_COLORS }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: 'right' } } }
        });
    }
};

export const renderVisaoAnual = () => {
    const container = document.getElementById('dashboard-yearly');
    const ano = parseInt(document.getElementById('dashboard-year-filter')?.value) || new Date().getFullYear();
    const { transacoes } = getState();
    const transacoesAno = transacoes.filter(t => t.data?.startsWith(ano));

    let receitasPorMes = Array(12).fill(0);
    let despesasPorMes = Array(12).fill(0);
    transacoesAno.forEach(t => {
        const mes = new Date(t.data + 'T12:00:00').getMonth();
        if (t.tipo === 'receita') receitasPorMes[mes] += t.valor;
        else despesasPorMes[mes] += t.valor;
    });

    container.innerHTML = `<input type="number" id="dashboard-year-filter" value="${ano}" min="2020" max="2050" style="margin-bottom: 1rem; width: 100px;"><div class="dashboard-chart-container"><canvas id="annual-chart"></canvas></div>`;
    document.getElementById('dashboard-year-filter').addEventListener('change', renderVisaoAnual);

    if (annualChart) annualChart.destroy();
    const ctx = document.getElementById('annual-chart')?.getContext('2d');
    if (ctx) {
        annualChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
                datasets: [
                    { label: 'Receitas', data: receitasPorMes, backgroundColor: 'rgba(0, 135, 90, 0.7)' },
                    { label: 'Despesas', data: despesasPorMes, backgroundColor: 'rgba(222, 53, 11, 0.7)' }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
        });
    }
};

export const renderLancamentosFuturos = () => {
    const container = document.getElementById('tab-bills');
    const { lancamentosFuturos, comprasParceladas } = getState();
    const pendentes = lancamentosFuturos.filter(l => l.status === 'pendente');
    if (!pendentes.length) { container.innerHTML = '<p class="placeholder">Nenhum lançamento futuro.</p>'; return; }
    const agrupados = pendentes.reduce((acc, l) => {
        const mes = new Date(l.data_vencimento + 'T12:00:00').toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
        if (!acc[mes]) acc[mes] = [];
        acc[mes].push(l);
        return acc;
    }, {});
    container.innerHTML = Object.entries(agrupados).map(([mes, lancamentos]) => `
        <div class="monthly-header">${mes}</div>
        ${lancamentos.map(l => renderBillItem(l, comprasParceladas)).join('')}`
    ).join('');
};

const renderBillItem = (bill, compras) => {
    let cat = bill.categoria;
    if (bill.compra_parcelada_id) {
        const c = compras.find(c => c.id === bill.compra_parcelada_id);
        if(c) cat = c.categoria;
    }
    const icon = CATEGORY_ICONS[cat] || CATEGORY_ICONS['Outros'];
    return `<div class="bill-item">
                <div class="transaction-icon-wrapper" style="background-color:${icon.color};"><i class="${icon.icon}"></i></div>
                <div>
                    <div class="transaction-description">${bill.descricao}</div>
                    <div class="transaction-meta">Vence em: ${new Date(bill.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR')}</div>
                </div>
                <span class="transaction-value ${bill.tipo === 'a_pagar' ? 'expense-text' : 'income-text'}">${formatarMoeda(bill.valor)}</span>
                <div class="bill-actions">
                    <button class="btn btn-small" data-action="pagar-conta" data-id="${bill.id}">Pagar</button>
                    <button class="btn-icon" data-action="deletar-lancamento" data-id="${bill.id}" title="Deletar"><i class="fas fa-trash"></i></button>
                </div>
            </div>`;
};

export const renderHistoricoTransacoes = () => {
    const container = document.getElementById('tab-history');
    const { transacoes } = getState();
    if (!transacoes.length) { container.innerHTML = '<p class="placeholder">Nenhuma transação.</p>'; return; }

    const agrupados = transacoes.reduce((acc, t) => {
        const data = new Date(t.data + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
        if (!acc[data]) acc[data] = [];
        acc[data].push(t);
        return acc;
    }, {});

    container.innerHTML = Object.entries(agrupados).map(([data, transacoesDoDia]) => `
        <div class="monthly-header">${data}</div>
        ${transacoesDoDia.map(renderTransactionCard).join('')}
    `).join('');
};

const renderTransactionCard = (t) => {
    const conta = getContaPorId(t.conta_id);
    const icon = CATEGORY_ICONS[t.categoria] || CATEGORY_ICONS['Outros'];
    return `
        <div class="transaction-card">
            <div class="transaction-icon-wrapper" style="background-color:${icon.color};"><i class="${icon.icon}"></i></div>
            <div>
                <div class="transaction-description">${t.descricao}</div>
                <div class="transaction-meta">${t.categoria} | ${conta ? conta.nome : ''}</div>
            </div>
            <span class="transaction-value ${t.tipo === 'despesa' ? 'expense-text' : 'income-text'}">
                ${t.tipo === 'despesa' ? '-' : ''} ${formatarMoeda(t.valor)}
            </span>
            <div class="transaction-actions">
                <button class="btn-icon" data-action="deletar-transacao" data-id="${t.id}" title="Deletar"><i class="fas fa-trash"></i></button>
            </div>
        </div>
    `;
};

export const renderFormTransacaoRapida = () => {
    document.getElementById('form-transacao-rapida').innerHTML = `
        <div class="form-group"><label for="t-desc">Descrição</label><input type="text" id="t-desc" name="descricao" required></div>
        <div class="form-group"><label for="t-valor">Valor</label><input type="number" id="t-valor" name="valor" step="0.01" required></div>
        <div class="form-group"><label for="t-tipo">Tipo</label><select id="t-tipo" name="tipo"><option value="despesa">Despesa</option><option value="receita">Receita</option></select></div>
        <div class="form-group"><label for="t-conta">Conta</label><select id="t-conta" name="conta_id">${getContas().map(c=>`<option value="${c.id}">${c.nome}</option>`).join('')}</select></div>
        <div class="form-group"><label for="t-cat">Categoria</label><select id="t-cat" name="categoria">${CATEGORIAS_PADRAO.map(c=>`<option value="${c}">${c}</option>`).join('')}</select></div>
        <div class="form-group"><label for="t-data">Data</label><input type="date" id="t-data" name="data" value="${toISODateString(new Date())}" required></div>
        <button type="submit" class="btn">Salvar Transação</button>`;
};

// --- MODAIS ---
export const getAccountModalContent = (id=null) => { const c = id ? getContaPorId(id) : {}; return `<h2>${id?'Editar':'Nova'} Conta</h2><form id="form-conta" data-id="${id||''}"><div class="form-group"><label>Nome</label><input name="nome" value="${c.nome||''}" required></div><div class="form-group"><label>Tipo</label><select name="tipo" id="conta-tipo"><option>Conta Corrente</option><option>Cartão de Crédito</option></select></div><div class="form-group"><label>Saldo Inicial</label><input name="saldo_inicial" type="number" step="0.01" value="${c.saldo_inicial||0}" ${id?'disabled':''}></div><button type="submit" class="btn">Salvar</button></form>`; };
export const getBillModalContent = (id=null) => { return `<h2>${id?'Editar':'Novo'} Lançamento Futuro</h2><form id="form-lancamento" data-id="${id||''}"></form>`; };
export const getPayBillModalContent = (billId) => { const bill = getState().lancamentosFuturos.find(b=>b.id===billId); return `<h2>Pagar ${bill.descricao}</h2><form id="form-pagamento" data-bill-id="${bill.id}" data-valor="${bill.valor}" data-desc="${bill.descricao}" data-cat="${bill.categoria}"><p>${formatarMoeda(bill.valor)}</p><div class="form-group"><label>Data Pgto.</label><input type="date" name="data" value="${toISODateString(new Date())}"></div><div class="form-group"><label>Pagar com</label><select name="conta_id">${getContas().filter(c=>c.tipo!=='Cartão de Crédito').map(c=>`<option value="${c.id}">${c.nome}</option>`).join('')}</select></div><button class="btn" type="submit">Confirmar</button></form>`; };
export const getInstallmentPurchaseModalContent = () => { return `<h2>Nova Compra Parcelada</h2><form id="form-compra-parcelada"></form>`; };
