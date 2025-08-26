// js/ui.js

import { formatarMoeda, CATEGORIAS_PADRAO, toISODateString, CATEGORY_ICONS, HOJE } from './utils.js';
import { getState, getContaPorId, getContas } from './state.js';

// --- GERAL UI ---

export const showToast = (message, type = 'success') => {
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => toast.remove());
    }, 3000);
};

export const setLoadingState = (button, isLoading, originalText = 'Salvar') => {
    if (!button) return;
    if (isLoading) {
        button.disabled = true;
        button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Salvando...`;
    } else {
        button.disabled = false;
        button.innerHTML = originalText;
    }
};

export const openModal = (content) => {
    const modalHTML = `<button class="modal-close-btn" id="modal-close-btn">×</button>${content}`;
    const modalContentArea = document.getElementById('modal-content-area');
    modalContentArea.innerHTML = modalHTML;
    document.getElementById('modal-container').classList.add('active');
    document.getElementById('modal-close-btn').addEventListener('click', closeModal);
};

export const closeModal = () => {
    document.getElementById('modal-container').classList.remove('active');
    document.getElementById('modal-content-area').innerHTML = '';
};

export const switchTab = (clickedButton, parentContainerSelector) => {
    const tabName = clickedButton.dataset.tab;
    const parentContainer = document.querySelector(parentContainerSelector);
    if (!parentContainer) return;

    parentContainer.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
    parentContainer.querySelectorAll('.tab-button').forEach(tb => tb.classList.remove('active'));

    const tabContent = parentContainer.querySelector(`#${tabName}`);
    if (tabContent) {
        tabContent.classList.add('active');
    }
    clickedButton.classList.add('active');
};


// --- RENDERIZAÇÃO ---
export const renderAllComponents = () => {
    renderContas();
    renderVisaoMensal(); // Inicia com a visão mensal
    renderVisaoAnual();
    renderLancamentosFuturos();
    renderHistoricoTransacoes();
    renderFormTransacaoRapida();
};


export const renderContas = () => {
    const container = document.getElementById('accounts-container');
    const { contas, transacoes } = getState();

    if (!contas || contas.length === 0) {
        container.innerHTML = '<p style="text-align:center; color: var(--text-secondary);">Nenhuma conta cadastrada.</p>';
        return;
    }

    container.innerHTML = contas.map(conta => {
        const transacoesDaConta = transacoes.filter(t => t.conta_id === conta.id);
        const saldo = transacoesDaConta.reduce((acc, t) => t.tipo === 'receita' ? acc + t.valor : acc - t.valor, conta.saldo_inicial);
        const corSaldo = saldo >= 0 ? 'var(--income-color)' : 'var(--expense-color)';
        
        let botoesEspecificos = '';
        if (conta.tipo === 'Conta Corrente' || conta.tipo === 'Poupança') {
             botoesEspecificos = `<button class="btn-icon" data-action="ajustar-saldo" data-id="${conta.id}" title="Ajustar Saldo"><i class="fas fa-calculator"></i></button>`;
        } else if (conta.tipo === 'Cartão de Crédito') {
            botoesEspecificos = `<button class="btn-icon" data-action="ver-fatura" data-id="${conta.id}" title="Ver Fatura"><i class="fas fa-file-invoice"></i></button>`;
        }

        return `<div class="account-item">
                    <div class="account-details">
                        <span class="account-name">${conta.nome}</span>
                        <span class="account-type">${conta.tipo}</span>
                    </div>
                    <div class="account-actions">
                        <span class="account-balance" style="color: ${corSaldo}; margin-right: 0.5rem;">${formatarMoeda(saldo)}</span>
                        ${botoesEspecificos}
                        <button class="btn-icon" data-action="editar-conta" data-id="${conta.id}" title="Editar Conta"><i class="fas fa-pencil-alt"></i></button>
                        <button class="btn-icon" data-action="deletar-conta" data-id="${conta.id}" title="Deletar Conta"><i class="fas fa-trash-alt"></i></button>
                    </div>
                </div>`;
    }).join('');
};

let summaryChart = null;
export const renderVisaoMensal = () => {
    const container = document.getElementById('dashboard-monthly');
    const mesSelecionado = document.getElementById('dashboard-month-filter')?.value || new Date().toISOString().slice(0, 7);
    
    const { transacoes } = getState();
    const transacoesDoMes = transacoes.filter(t => t.data && t.data.startsWith(mesSelecionado));
    
    const receitas = transacoesDoMes.filter(t => t.tipo === 'receita').reduce((sum, t) => sum + t.valor, 0);
    const despesas = transacoesDoMes.filter(t => t.tipo === 'despesa').reduce((sum, t) => sum + t.valor, 0);
    const saldo = receitas - despesas;
    const comprometimento = receitas > 0 ? ((despesas / receitas) * 100).toFixed(0) : 0;

    container.innerHTML = `
        <div class="dashboard-controls">
            <input type="month" id="dashboard-month-filter" value="${mesSelecionado}">
        </div>
        <div class="dashboard-kpis">
            <div class="kpi-item"><h4>Receitas</h4><p class="income-text">${formatarMoeda(receitas)}</p></div>
            <div class="kpi-item"><h4>Despesas</h4><p class="expense-text">${formatarMoeda(despesas)}</p></div>
            <div class="kpi-item"><h4>Saldo do Mês</h4><p style="color: ${saldo >= 0 ? 'var(--income-color)' : 'var(--expense-color)'}">${formatarMoeda(saldo)}</p></div>
            <div class="kpi-item"><h4>Comprometimento</h4><p>${comprometimento}%</p></div>
        </div>
        <div class="dashboard-chart-container"><canvas id="summary-chart-monthly"></canvas></div>`;
    
    document.getElementById('dashboard-month-filter').addEventListener('change', renderVisaoMensal);
    
    const ctx = document.getElementById('summary-chart-monthly')?.getContext('2d');
    if (summaryChart && summaryChart.canvas.id === 'summary-chart-monthly') {
        summaryChart.destroy();
    }
    
    const despesasPorCategoria = transacoesDoMes
        .filter(t => t.tipo === 'despesa')
        .reduce((acc, t) => {
            acc[t.categoria] = (acc[t.categoria] || 0) + t.valor;
            return acc;
        }, {});

    if (ctx) {
        summaryChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(despesasPorCategoria),
                datasets: [{ 
                    data: Object.values(despesasPorCategoria), 
                    backgroundColor: Object.keys(despesasPorCategoria).map(cat => CATEGORY_ICONS[cat]?.color || '#cccccc'),
                    borderColor: 'var(--bg-card)',
                    borderWidth: 2
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
    }
};

export const renderVisaoAnual = () => {
    const container = document.getElementById('dashboard-yearly');
    const anoSelecionado = parseInt(document.getElementById('dashboard-year-filter')?.value) || new Date().getFullYear();

    const { transacoes, lancamentosFuturos } = getState();
    const transacoesDoAno = transacoes.filter(t => t.data && t.data.startsWith(anoSelecionado));

    let receitasPorMes = Array(12).fill(0);
    let despesasPorMes = Array(12).fill(0);

    transacoesDoAno.forEach(t => {
        const mes = new Date(t.data + 'T12:00:00').getMonth(); // 0-11
        if (t.tipo === 'receita') receitasPorMes[mes] += t.valor;
        else if (t.tipo === 'despesa') despesasPorMes[mes] += t.valor;
    });
    
    const totalReceitasAno = receitasPorMes.reduce((a, b) => a + b, 0);
    const totalDespesasAno = despesasPorMes.reduce((a, b) => a + b, 0);
    const balancoAnual = totalReceitasAno - totalDespesasAno;
    const mediaDespesas = totalDespesasAno / 12;
    
    const dividasFuturas = lancamentosFuturos.filter(l => l.status === 'pendente' && l.tipo === 'a_pagar').reduce((sum, l) => sum + l.valor, 0);
    
    container.innerHTML = `
         <div class="dashboard-controls">
            <input type="number" id="dashboard-year-filter" value="${anoSelecionado}" min="2020" max="2050" style="width: 120px;">
        </div>
        <div class="dashboard-kpis">
            <div class="kpi-item"><h4>Balanço Anual</h4><p style="color: ${balancoAnual >= 0 ? 'var(--income-color)' : 'var(--expense-color)'}">${formatarMoeda(balancoAnual)}</p></div>
            <div class="kpi-item"><h4>Média/Mês (Despesas)</h4><p class="expense-text">${formatarMoeda(mediaDespesas)}</p></div>
             <div class="kpi-item"><h4>Dívidas Futuras</h4><p>${formatarMoeda(dividasFuturas)}</p></div>
        </div>
        <div class="dashboard-chart-container"><canvas id="summary-chart-yearly"></canvas></div>`;
    
    document.getElementById('dashboard-year-filter').addEventListener('change', renderVisaoAnual);

    const ctx = document.getElementById('summary-chart-yearly')?.getContext('2d');
     if (summaryChart && summaryChart.canvas.id === 'summary-chart-yearly') {
        summaryChart.destroy();
    }
    
    if(ctx) {
        summaryChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
                datasets: [
                    { label: 'Receitas', data: receitasPorMes, backgroundColor: 'rgba(16, 185, 129, 0.6)' },
                    { label: 'Despesas', data: despesasPorMes, backgroundColor: 'rgba(239, 68, 68, 0.6)' }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
        });
    }
};

export const renderLancamentosFuturos = () => {
    const container = document.getElementById('tab-bills');
    const { lancamentosFuturos, comprasParceladas } = getState();

    const lancamentosAgrupados = lancamentosFuturos
        .filter(l => l.status === 'pendente')
        .reduce((acc, l) => {
            const mes = new Date(l.data_vencimento + 'T12:00:00').toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
            if (!acc[mes]) acc[mes] = [];
            acc[mes].push(l);
            return acc;
        }, {});

    if (Object.keys(lancamentosAgrupados).length === 0) {
        container.innerHTML = '<p style="text-align:center; color: var(--text-secondary);">Nenhum lançamento futuro pendente.</p>';
        return;
    }

    container.innerHTML = Object.entries(lancamentosAgrupados).map(([mes, lancamentos]) => {
        const totalPagar = lancamentos.filter(l => l.tipo === 'a_pagar').reduce((s, l) => s + l.valor, 0);
        const totalReceber = lancamentos.filter(l => l.tipo === 'a_receber').reduce((s, l) => s + l.valor, 0);

        return `
            <div class="monthly-group">
                <div class="monthly-header" data-action="toggle-lancamentos">
                    <h3>${mes}</h3>
                    <div class="monthly-summary">
                        <span>A Pagar: <strong class="expense-text">${formatarMoeda(totalPagar)}</strong></span>
                        <span>A Receber: <strong class="income-text">${formatarMoeda(totalReceber)}</strong></span>
                    </div>
                    <i class="fas fa-chevron-down chevron-icon"></i>
                </div>
                <div class="monthly-content">
                    ${lancamentos.map(l => renderBillItem(l, comprasParceladas)).join('')}
                </div>
            </div>`;
    }).join('');
};

const renderBillItem = (bill, comprasParceladas) => {
    const isOverdue = new Date(bill.data_vencimento) < HOJE && bill.status === 'pendente';
    const isParcela = !!bill.compra_parcelada_id;
    const compra = isParcela ? comprasParceladas.find(c => c.id === bill.compra_parcelada_id) : null;
    const categoria = compra ? compra.categoria : bill.categoria;
    const iconInfo = CATEGORY_ICONS[categoria] || CATEGORY_ICONS['Outros'];

    return `
        <div class="bill-item" style="${isOverdue ? 'background-color: var(--overdue-color);' : ''}">
            <div class="transaction-icon" style="background-color: ${iconInfo.color};">
                <i class="${iconInfo.icon}"></i>
            </div>
            <div class="bill-details">
                <p class="transaction-description">${bill.descricao}</p>
                <p class="transaction-meta">Vence em: ${new Date(bill.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR')}
                    ${isOverdue ? `<strong style="color: var(--overdue-text); margin-left: 8px;">(Vencido)</strong>` : ''}
                </p>
            </div>
            <p class="transaction-amount ${bill.tipo === 'a_pagar' ? 'expense-text' : 'income-text'}">${formatarMoeda(bill.valor)}</p>
            <div class="bill-actions">
                ${bill.tipo === 'a_pagar' ? `<button class="btn" data-action="pagar-conta" data-id="${bill.id}" style="padding: 0.5rem 1rem; font-size: 0.8rem;">Pagar</button>`: ''}
                ${isParcela 
                    ? `<button class="btn-icon" data-action="editar-parcela" data-id="${bill.compra_parcelada_id}" title="Editar Compra"><i class="fas fa-edit"></i></button>`
                    : `<button class="btn-icon" data-action="editar-lancamento" data-id="${bill.id}" title="Editar Lançamento"><i class="fas fa-edit"></i></button>`
                }
                <button class="btn-icon" data-action="deletar-lancamento" data-id="${bill.id}" data-compra-id="${bill.compra_parcelada_id}" title="Deletar"><i class="fas fa-trash"></i></button>
            </div>
        </div>
    `;
};


export const renderHistoricoTransacoes = () => {
    const container = document.getElementById('tab-history');
    const { transacoes } = getState();
    // Adicionar filtros aqui no futuro se necessário
    
    if (transacoes.length === 0) {
        container.innerHTML = '<p style="text-align:center; color: var(--text-secondary);">Nenhuma transação encontrada.</p>';
        return;
    }

    const transacoesAgrupadas = transacoes.reduce((acc, t) => {
        const data = new Date(t.data + 'T12:00:00').toLocaleDateString('pt-BR', { year: 'numeric', month: 'long', day: 'numeric' });
        if (!acc[data]) acc[data] = [];
        acc[data].push(t);
        return acc;
    }, {});

    container.innerHTML = Object.entries(transacoesAgrupadas).map(([data, transacoesDoDia]) => `
        <div class="date-header">${data}</div>
        ${transacoesDoDia.map(renderTransactionCard).join('')}
    `).join('');
};

const renderTransactionCard = (t) => {
    const iconInfo = CATEGORY_ICONS[t.categoria] || CATEGORY_ICONS['Outros'];
    const conta = getContaPorId(t.conta_id);

    return `
        <div class="transaction-card">
            <div class="transaction-icon" style="background-color: ${iconInfo.color};">
                <i class="${iconInfo.icon}"></i>
            </div>
            <div class="transaction-details">
                <span class="transaction-description">${t.descricao}</span>
                <span class="transaction-meta">${t.categoria} | ${conta ? conta.nome : 'Conta não encontrada'}</span>
            </div>
            <span class="transaction-amount ${t.tipo === 'despesa' ? 'expense-text' : 'income-text'}">
                ${t.tipo === 'despesa' ? '-' : '+'} ${formatarMoeda(t.valor)}
            </span>
            <div class="transaction-actions">
                 <button class="btn-icon" data-action="deletar-transacao" data-id="${t.id}" title="Deletar Transação"><i class="fas fa-trash-alt"></i></button>
            </div>
        </div>
    `;
};

export const renderFormTransacaoRapida = () => {
    const container = document.getElementById('form-transacao-rapida');
    const contas = getContas();
    
    const contasOptions = contas.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
    const categoriasOptions = CATEGORIAS_PADRAO.map(c => `<option value="${c}">${c}</option>`).join('');

    container.innerHTML = `
        <div class="form-group">
            <label for="transacao-descricao">Descrição</label>
            <input type="text" id="transacao-descricao" name="descricao" required>
        </div>
        <div class="form-group">
            <label for="transacao-valor">Valor</label>
            <input type="number" id="transacao-valor" name="valor" step="0.01" required>
        </div>
         <div class="form-group">
            <label for="transacao-tipo">Tipo</label>
            <select id="transacao-tipo" name="tipo" required>
                <option value="despesa">Despesa</option>
                <option value="receita">Receita</option>
            </select>
        </div>
        <div class="form-group">
            <label for="transacao-conta">Conta</label>
            <select id="transacao-conta" name="conta_id" required>
                ${contasOptions}
            </select>
        </div>
        <div class="form-group">
            <label for="transacao-categoria">Categoria</label>
            <select id="transacao-categoria" name="categoria" required>
                 ${categoriasOptions}
            </select>
        </div>
         <div class="form-group">
            <label for="transacao-data">Data</label>
            <input type="date" id="transacao-data" name="data" value="${toISODateString(new Date())}" required>
        </div>
        <button type="submit" class="btn">Salvar Transação</button>
    `;
};


// --- MODAIS ---

export const getAccountModalContent = (id = null) => {
    const conta = id ? getContaPorId(id) : {};
    const isCreditCard = conta?.tipo === 'Cartão de Crédito';

    return `
        <h2>${id ? 'Editar' : 'Nova'} Conta</h2>
        <form id="form-conta" data-id="${id || ''}">
            <div class="form-group">
                <label for="conta-nome">Nome da Conta</label>
                <input type="text" id="conta-nome" name="nome" value="${conta.nome || ''}" required>
            </div>
            <div class="form-group">
                <label for="conta-tipo">Tipo</label>
                <select id="conta-tipo" name="tipo" required>
                    <option value="Conta Corrente" ${conta.tipo === 'Conta Corrente' ? 'selected' : ''}>Conta Corrente</option>
                    <option value="Poupança" ${conta.tipo === 'Poupança' ? 'selected' : ''}>Poupança</option>
                    <option value="Cartão de Crédito" ${conta.tipo === 'Cartão de Crédito' ? 'selected' : ''}>Cartão de Crédito</option>
                    <option value="Outros" ${conta.tipo === 'Outros' ? 'selected' : ''}>Outros</option>
                </select>
            </div>
             <div class="form-group" id="saldo-inicial-group" style="${isCreditCard ? 'display: none;' : ''}">
                <label for="conta-saldo">Saldo Inicial</label>
                <input type="number" id="conta-saldo" name="saldo_inicial" value="${conta.saldo_inicial || 0}" step="0.01" ${id ? 'disabled' : ''}>
             </div>
             <div id="cartao-credito-fields" style="${isCreditCard ? '' : 'display: none;'}">
                <div class="form-group">
                    <label for="conta-limite">Limite do Cartão</label>
                    <input type="number" id="conta-limite" name="limite_cartao" value="${conta.limite_cartao || ''}" step="0.01">
                </div>
                <div class="form-group">
                    <label for="conta-dia-fechamento">Dia do Fechamento da Fatura</label>
                    <input type="number" id="conta-dia-fechamento" name="dia_fechamento_cartao" value="${conta.dia_fechamento_cartao || ''}" min="1" max="31">
                </div>
                 <div class="form-group">
                    <label for="conta-dia-vencimento">Dia do Vencimento da Fatura</label>
                    <input type="number" id="conta-dia-vencimento" name="dia_vencimento_cartao" value="${conta.dia_vencimento_cartao || ''}" min="1" max="31">
                </div>
             </div>
            <div class="form-actions">
                <button type="submit" class="btn">Salvar</button>
            </div>
        </form>
    `;
};

export const getBillModalContent = (id = null) => {
    const { lancamentosFuturos } = getState();
    const bill = id ? lancamentosFuturos.find(b => b.id === id) : {};

    const categoriasOptions = CATEGORIAS_PADRAO.map(c => `<option value="${c}" ${bill.categoria === c ? 'selected' : ''}>${c}</option>`).join('');

    return `
        <h2>${id ? 'Editar' : 'Novo'} Lançamento</h2>
        <form id="form-lancamento" data-id="${id || ''}">
            <div class="form-group">
                <label for="lancamento-descricao">Descrição</label>
                <input type="text" id="lancamento-descricao" name="descricao" value="${bill.descricao || ''}" required>
            </div>
            <div class="form-group">
                <label for="lancamento-valor">Valor</label>
                <input type="number" id="lancamento-valor" name="valor" step="0.01" value="${bill.valor || ''}" required>
            </div>
            <div class="form-group">
                <label for="lancamento-data">Data de Vencimento</label>
                <input type="date" id="lancamento-data" name="data_vencimento" value="${bill.data_vencimento || toISODateString(new Date())}" required>
            </div>
            <div class="form-group">
                <label for="lancamento-tipo">Tipo</label>
                <select name="tipo" id="lancamento-tipo" required>
                    <option value="a_pagar" ${bill.tipo === 'a_pagar' ? 'selected' : ''}>A Pagar</option>
                    <option value="a_receber" ${bill.tipo === 'a_receber' ? 'selected' : ''}>A Receber</option>
                </select>
            </div>
            <div class="form-group">
                <label for="lancamento-categoria">Categoria</label>
                <select name="categoria" id="lancamento-categoria" required>${categoriasOptions}</select>
            </div>
            <div class="form-actions">
                <button type="submit" class="btn">Salvar</button>
            </div>
        </form>
    `;
};

export const getPayBillModalContent = (billId) => {
    const { lancamentosFuturos, contas } = getState();
    const bill = lancamentosFuturos.find(b => b.id === billId);
    
    // Sugere apenas contas que não são de crédito
    const contasOptions = contas
        .filter(c => c.tipo !== 'Cartão de Crédito')
        .map(c => `<option value="${c.id}">${c.nome}</option>`).join('');

    return `
        <h2>Pagar Conta: ${bill.descricao}</h2>
        <form id="form-pagamento" data-bill-id="${billId}" data-valor="${bill.valor}" data-descricao="${bill.descricao}" data-categoria="${bill.categoria}">
            <div class="form-group">
                <label>Valor a Pagar</label>
                <p style="font-size: 1.5rem; font-weight: 600;">${formatarMoeda(bill.valor)}</p>
            </div>
            <div class="form-group">
                <label for="pagamento-data">Data do Pagamento</label>
                <input type="date" id="pagamento-data" name="data" value="${toISODateString(new Date())}" required>
            </div>
            <div class="form-group">
                <label for="pagamento-conta">Pagar com</label>
                <select name="conta_id" id="pagamento-conta" required>${contasOptions}</select>
            </div>
            <div class="form-actions">
                <button type="submit" class="btn">Confirmar Pagamento</button>
            </div>
        </form>
    `;
};


export const getInstallmentPurchaseModalContent = () => {
    const contasCartao = getContas().filter(c => c.tipo === 'Cartão de Crédito');
    const contasOptions = contasCartao.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
    const categoriasOptions = CATEGORIAS_PADRAO.map(c => `<option value="${c}">${c}</option>`).join('');

    return `
        <h2>Nova Compra Parcelada</h2>
        <form id="form-compra-parcelada">
            <div class="form-group">
                <label for="compra-descricao">Descrição da Compra</label>
                <input type="text" id="compra-descricao" name="descricao" required placeholder="Ex: Notebook Dell">
            </div>
             <div class="form-group">
                <label for="compra-valor">Valor Total</label>
                <input type="number" id="compra-valor" name="valor_total" step="0.01" required>
            </div>
            <div class="form-group">
                <label for="compra-parcelas">Número de Parcelas</label>
                <input type="number" id="compra-parcelas" name="numero_parcelas" min="2" required>
            </div>
            <div class="form-group">
                <label for="compra-data">Data da Compra</label>
                <input type="date" id="compra-data" name="data_compra" value="${toISODateString(new Date())}" required>
            </div>
            <div class="form-group">
                <label for="compra-conta">Cartão de Crédito</label>
                <select id="compra-conta" name="conta_id" required>${contasOptions}</select>
            </div>
             <div class="form-group">
                <label for="compra-categoria">Categoria</label>
                <select id="compra-categoria" name="categoria" required>${categoriasOptions}</select>
            </div>
            <div class="form-actions">
                <button type="submit" class="btn">Salvar Compra</button>
            </div>
        </form>
    `;
};