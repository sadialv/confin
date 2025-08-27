// js/ui.js - APENAS SUBSTITUA ESTA FUNÇÃO

export const getStatementModalContent = (contaId) => {
    const conta = getContaPorId(contaId);
    const { transacoes } = getState();
    
    const mesesDisponiveis = [...new Set(
        transacoes.filter(t => t.conta_id === contaId).map(t => t.data.substring(0, 7))
    )].sort().reverse();

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
            <p class="placeholder">Selecione um mês para ver os detalhes da fatura.</p>
        </div>
        <div style="text-align: right; margin-top: 1.5rem;">
            <button class="btn btn-secondary" id="modal-close-btn-custom">Fechar</button>
        </div>
    `;
};
