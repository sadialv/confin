// js/ui.js - Substituir a função renderBillItem por esta versão

const renderBillItem = (bill, comprasParceladas) => {
    const isOverdue = new Date(bill.data_vencimento + 'T12:00:00') < HOJE && bill.status === 'pendente';
    const isParcela = !!bill.compra_parcelada_id;
    
    // Lógica corrigida para buscar a categoria correta da conta
    let categoria = bill.categoria;
    if (isParcela) {
        const compra = comprasParceladas.find(c => c.id === bill.compra_parcelada_id);
        if (compra) {
            categoria = compra.categoria;
        }
    }

    // Busca o ícone e a cor com base na categoria encontrada
    const iconInfo = CATEGORY_ICONS[categoria] || CATEGORY_ICONS['Outros'];

    return `
        <div class="bill-item ${isOverdue ? 'overdue' : ''}">
            <div class="transaction-icon-wrapper" style="background-color: ${iconInfo.color};">
                <i class="${iconInfo.icon}"></i>
            </div>
            <div class="transaction-details">
                <p class="transaction-description">${bill.descricao}</p>
                <p class="transaction-meta">
                    Vence em: ${new Date(bill.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR')}
                    ${isOverdue ? `<strong class="warning-text" style="margin-left: 8px;">(Vencido)</strong>` : ''}
                </p>
            </div>
            <p class="transaction-value ${bill.tipo === 'a_pagar' ? 'expense-text' : 'income-text'}">${formatarMoeda(bill.valor)}</p>
            <div class="bill-actions">
                ${bill.tipo === 'a_pagar' ? `<button class="btn btn-small" data-action="pagar-conta" data-id="${bill.id}">Pagar</button>` : ''}
                <button class="btn-icon" data-action="${isParcela ? 'editar-parcela' : 'editar-lancamento'}" data-id="${isParcela ? bill.compra_parcelada_id : bill.id}" title="Editar"><i class="fas fa-edit"></i></button>
                <button class="btn-icon" data-action="deletar-lancamento" data-id="${bill.id}" data-compra-id="${bill.compra_parcelada_id}" title="Deletar"><i class="fas fa-trash"></i></button>
            </div>
        </div>
    `;
};
