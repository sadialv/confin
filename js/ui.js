// js/ui.js - ADICIONE/SUBSTITUA ESTAS FUNÇÕES

// Substitua esta função para adicionar o botão de fatura
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
                    <div>
                        <div class="account-name">${conta.nome}</div>
                        <div class="account-type">${conta.tipo}</div>
                    </div>
                    <span class="account-balance ${saldo >= 0 ? 'income-text' : 'expense-text'}">${formatarMoeda(saldo)}</span>
                    <div class="account-actions">
                        ${botoesEspecificos}
                        <button class="btn-icon" data-action="editar-conta" data-id="${conta.id}" title="Editar"><i class="fas fa-edit"></i></button>
                        <button class="btn-icon" data-action="deletar-conta" data-id="${conta.id}" title="Deletar"><i class="fas fa-trash"></i></button>
                    </div>
                </div>`;
    }).join('');
};

// Substitua esta função para adicionar os campos do cartão de crédito
export const getAccountModalContent = (id = null) => {
    const conta = id ? getContaPorId(id) : {};
    const isCreditCard = conta?.tipo === 'Cartão de Crédito';

    return `<h2>${id ? 'Editar' : 'Nova'} Conta</h2>
        <form id="form-conta" data-id="${id || ''}">
            <div class="form-group">
                <label>Nome da Conta</label>
                <input name="nome" value="${conta.nome || ''}" required>
            </div>
            <div class="form-group">
                <label>Tipo</label>
                <select name="tipo" id="conta-tipo">
                    <option ${conta.tipo === 'Conta Corrente' ? 'selected' : ''}>Conta Corrente</option>
                    <option ${conta.tipo === 'Cartão de Crédito' ? 'selected' : ''}>Cartão de Crédito</option>
                    <option ${conta.tipo === 'Dinheiro' ? 'selected' : ''}>Dinheiro</option>
                    <option ${conta.tipo === 'Poupança' ? 'selected' : ''}>Poupança</option>
                </select>
            </div>
            <div class="form-group" id="saldo-inicial-group" style="${isCreditCard ? 'display: none;' : ''}">
                <label>Saldo Inicial</label>
                <input name="saldo_inicial" type="number" step="0.01" value="${conta.saldo_inicial || 0}" ${id ? 'disabled' : ''}>
            </div>
            <div id="cartao-credito-fields" style="${isCreditCard ? '' : 'display: none;'}">
                <div class="form-group">
                    <label>Dia do Fechamento da Fatura</label>
                    <input name="dia_fechamento_cartao" type="number" min="1" max="31" value="${conta.dia_fechamento_cartao || ''}">
                </div>
            </div>
            <div style="text-align: right; margin-top: 1.5rem;">
                <button type="submit" class="btn">Salvar</button>
            </div>
        </form>`;
};

// Adicione esta nova função para criar o modal da fatura
export const getStatementModalContent = (contaId) => {
    const conta = getContaPorId(contaId);
    const { transacoes } = getState();
    
    // Pega todos os meses (formato YYYY-MM) onde houve transações para este cartão
    const mesesDisponiveis = [...new Set(
        transacoes
            .filter(t => t.conta_id === contaId)
            .map(t => t.data.substring(0, 7)) // Extrai 'YYYY-MM'
    )].sort().reverse(); // Ordena do mais recente para o mais antigo

    // Cria as opções para o <select>
    const options = mesesDisponiveis.map(mes => {
        const [ano, mesNum] = mes.split('-');
        const data = new Date(ano, mesNum - 1);
        const nomeMes = data.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
        return `<option value="${mes}">${nomeMes}</option>`;
    }).join('');

    return `
        <h2>Fatura - ${conta.nome}</h2>
        <div class="form-group">
            <label for="statement-month-select">Selecione o Mês:</label>
            <select id="statement-month-select" data-conta-id="${contaId}">
                <option value="">Selecione...</option>
                ${options}
            </select>
        </div>
        <hr style="border: 0; border-top: 1px solid var(--border-color); margin: 1.5rem 0;">
        <div id="statement-details-container">
            <p class="placeholder">Selecione um mês para ver os detalhes da fatura.</p>
        </div>
    `;
};

// Adicione esta nova função para renderizar os detalhes da fatura
export const renderStatementDetails = (contaId, mesSelecionado) => {
    const container = document.getElementById('statement-details-container');
    if (!mesSelecionado) {
        container.innerHTML = '<p class="placeholder">Selecione um mês para ver os detalhes da fatura.</p>';
        return;
    }

    const conta = getContaPorId(contaId);
    const { transacoes } = getState();
    
    // Lógica para calcular o início e fim do ciclo da fatura
    const diaFechamento = conta.dia_fechamento_cartao || 28; // Dia padrão caso não haja
    const [ano, mes] = mesSelecionado.split('-').map(Number);

    const fimCiclo = new Date(ano, mes - 1, diaFechamento);
    const inicioCiclo = new Date(fimCiclo);
    inicioCiclo.setMonth(inicioCiclo.getMonth() - 1);
    
    // Filtra as transações que pertencem a este ciclo
    const transacoesFatura = transacoes.filter(t => {
        const dataTransacao = new Date(t.data + 'T12:00:00');
        return t.conta_id === contaId && dataTransacao > inicioCiclo && dataTransacao <= fimCiclo && t.tipo === 'despesa';
    });

    const totalFatura = transacoesFatura.reduce((acc, t) => acc + t.valor, 0);

    container.innerHTML = `
        <div style="margin-bottom: 1rem;">
            <h4>Total da Fatura: <span class="expense-text">${formatarMoeda(totalFatura)}</span></h4>
            <p style="font-size: 0.9rem; color: var(--text-secondary);">Período de ${inicioCiclo.toLocaleDateString('pt-BR')} a ${fimCiclo.toLocaleDateString('pt-BR')}</p>
        </div>
        <div>
            ${transacoesFatura.length ? transacoesFatura.map(renderTransactionCard).join('') : '<p class="placeholder">Nenhuma despesa nesta fatura.</p>'}
        </div>
    `;
};
