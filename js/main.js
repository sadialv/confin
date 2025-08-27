// js/main.js - Adicionar/modificar na função setupEventListeners

function setupEventListeners() {
    // ... (outros listeners existentes) ...

    document.body.addEventListener('click', e => {
        const target = e.target.closest('[data-action]');
        if(!target) return;
        const id = parseInt(target.dataset.id);
        switch(target.dataset.action){
            case 'editar-conta': 
                UI.openModal(UI.getAccountModalContent(id)); 
                document.getElementById('form-conta').addEventListener('submit', salvarConta); 
                break;
            case 'deletar-conta': 
                deletarConta(id); 
                break;
            case 'pagar-conta': 
                UI.openModal(UI.getPayBillModalContent(id)); 
                document.getElementById('form-pagamento').addEventListener('submit', confirmarPagamento); 
                break;
            
            // Adicione este novo case
            case 'ver-fatura':
                UI.openModal(UI.getStatementModalContent(id));
                // Adiciona o listener para o seletor de mês DEPOIS que o modal foi criado
                document.getElementById('statement-month-select').addEventListener('change', (e) => {
                    const contaId = parseInt(e.target.dataset.contaId);
                    const mes = e.target.value;
                    UI.renderStatementDetails(contaId, mes);
                });
                break;
        }
    });

    // Adicione este novo listener para o tipo de conta (para mostrar/esconder campos do cartão)
    document.body.addEventListener('change', (e) => {
        if (e.target.id === 'conta-tipo') {
            const isCreditCard = e.target.value === 'Cartão de Crédito';
            document.getElementById('cartao-credito-fields').style.display = isCreditCard ? '' : 'none';
            document.getElementById('saldo-inicial-group').style.display = isCreditCard ? 'none' : 'block';
        }
    });
}
