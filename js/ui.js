// ARQUIVO: js/ui.js (Substitua estas duas funções)

const renderTransactionCard = (t) => {
    const conta = getContaPorId(t.conta_id);
    const icon = CATEGORY_ICONS[t.categoria] || CATEGORY_ICONS['Outros'];
    
    // Identifica se é um item pendente (futuro) ou realizado (transacao)
    const isPendente = t.isPending === true; 
    const dataExibicao = t.data || t.data_vencimento; // Transação usa 'data', Lançamento usa 'data_vencimento'
    
    const collapseId = `collapse-trans-${t.id || Math.random().toString(36).substr(2, 9)}`;

    // Define estilos baseados no status
    const statusBadge = isPendente 
        ? '<span class="badge bg-warning text-dark me-2">Pendente</span>' 
        : '<span class="badge bg-success me-2">Realizado</span>';
    
    const opacityClass = isPendente ? 'opacity-75' : ''; // Itens pendentes ficam levemente transparentes

    // Ações disponíveis (Se for pendente, mostramos botão de pagar/receber)
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
            </div>`;
    } else {
        actions = `
            <div class="btn-group">
                <button class="btn btn-outline-secondary btn-sm" data-action="editar-transacao" data-id="${t.id}"><i class="fas fa-edit"></i></button>
                <button class="btn btn-outline-danger btn-sm" data-action="deletar-transacao" data-id="${t.id}"><i class="fas fa-trash"></i></button>
            </div>`;
    }

    // Formata valor com sinal
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
