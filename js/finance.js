// ARQUIVO: js/finance.js

// 1. Métricas Gerais (Mantém foco no mês atual/hoje)
export const calculateFinancialHealthMetrics = (state) => {
    const { contas, transacoes, lancamentosFuturos } = state;
    const hoje = new Date();
    const mesAtual = hoje.toISOString().slice(0, 7);

    // Patrimônio
    let totalAtivos = 0;
    let totalPassivos = 0;

    contas.forEach(conta => {
        const saldoConta = transacoes
            .filter(t => t.conta_id === conta.id)
            .reduce((acc, t) => t.tipo === 'receita' ? acc + t.valor : acc - t.valor, conta.saldo_inicial);

        // Considera ativo se não for cartão
        // Nota: A função isTipoCartao deve ser importada ou a lógica mantida aqui. 
        // Assumindo 'Cartão de Crédito' string por segurança caso state não tenha a função helper importada aqui
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

    // Diagnóstico Mês Atual
    const transacoesMes = transacoes.filter(t => t.data?.startsWith(mesAtual));
    const rendaRealizada = transacoesMes.filter(t => t.tipo === 'receita').reduce((acc, t) => acc + t.valor, 0);
    const despesaRealizada = transacoesMes.filter(t => t.tipo === 'despesa').reduce((acc, t) => acc + t.valor, 0);

    const receitasPendentes = lancamentosFuturos.filter(l => l.status === 'pendente' && l.tipo === 'a_receber' && l.data_vencimento.startsWith(mesAtual)).reduce((acc, l) => acc + l.valor, 0);
    const despesasPendentes = lancamentosFuturos.filter(l => l.status === 'pendente' && l.tipo === 'a_pagar' && l.data_vencimento.startsWith(mesAtual)).reduce((acc, l) => acc + l.valor, 0);

    const rendaPrevistaTotal = rendaRealizada + receitasPendentes;
    const despesaPrevistaTotal = despesaRealizada + despesasPendentes;
    const saldoPrevisto = rendaPrevistaTotal - despesaPrevistaTotal;

    // Indicadores
    const despesasFixas = transacoesMes.filter(t => t.tipo === 'despesa' && ['Moradia','Contas','Educação','Saúde','Transporte'].includes(t.categoria)).reduce((acc, t) => acc + t.valor, 0);
    const reservaEmergenciaMeses = despesasFixas > 0 ? (totalAtivos / despesasFixas) : 0;
    const saldoRealizado = rendaRealizada - despesaRealizada;
    const taxaPoupanca = rendaRealizada > 0 ? (saldoRealizado / rendaRealizada) * 100 : 0;
    
    // Score
    const scorePoupanca = Math.min(100, Math.max(0, (taxaPoupanca / 20) * 100));
    const scoreEndividamento = Math.min(100, Math.max(0, (1 - (indiceEndividamento = totalAtivos > 0 ? (totalPassivos / totalAtivos) * 100 : 0 / 50)) * 100));
    const financialScore = (scorePoupanca * 0.5) + (scoreEndividamento * 0.5);

    // Dados Históricos (Gráfico Patrimonio)
    let meses = new Set();
    transacoes.forEach(t => meses.add(t.data.substring(0, 7)));
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
    
    // Categorias (Top 5)
    let gastosPorCategoria = {};
    transacoes.filter(t => t.tipo === 'despesa').forEach(t => gastosPorCategoria[t.categoria] = (gastosPorCategoria[t.categoria] || 0) + t.valor);
    const mediaGastosCategoria = Object.entries(gastosPorCategoria).map(([k,v]) => ({categoria: k, media: v})).sort((a,b) => b.media - a.media);

    return {
        rendaRealizada, despesaRealizada, saldoRealizado,
        receitasPendentes, despesasPendentes, rendaPrevistaTotal, despesaPrevistaTotal, saldoPrevisto,
        totalAtivos, totalPassivos, patrimonioLiquido,
        indiceEndividamento, reservaEmergenciaMeses, taxaPoupanca, financialScore,
        mediaGastosCategoria, historicoPatrimonio
    };
};

// 2. Planejamento Anual (Gráfico) - Aceita ANO como parâmetro
export const calculateAnnualTimeline = (state, anoSelecionado) => {
    const { contas, transacoes, lancamentosFuturos } = state;
    const ano = anoSelecionado || new Date().getFullYear();
    const meses = Array.from({ length: 12 }, (_, i) => i); 

    // Identifica cartões para separar (opcional, mas bom para visualização)
    const idsCartao = contas.filter(c => c.tipo === 'Cartão de Crédito').map(c => c.id);

    let saldoAcumulado = 0;
    // O Saldo Inicial do ano deve considerar tudo que aconteceu ANTES desse ano
    // Se for o ano atual, pega o saldo das contas. Se for futuro, projeta.
    // Simplificação: Pega saldo atual das contas e ajusta conforme avança ou recua. 
    // Para simplificar muito: O acumulado começa do zero no gráfico ou pega o saldo atual das contas se for ano atual.
    
    const saldoInicialContas = contas.filter(c => c.tipo !== 'Cartão de Crédito').reduce((acc, c) => acc + c.saldo_inicial, 0);
    // Nota: O cálculo exato de saldo acumulado histórico retroativo é complexo. 
    // Aqui vamos focar no fluxo de caixa do ano selecionado.
    
    return meses.map(mesIndex => {
        const mesStr = `${ano}-${String(mesIndex + 1).padStart(2, '0')}`;
        
        // SOMA = (O que já aconteceu) + (O que vai acontecer)
        
        // Receitas
        const recReal = transacoes.filter(t => t.data.startsWith(mesStr) && t.tipo === 'receita').reduce((s, t) => s + t.valor, 0);
        const recPrev = lancamentosFuturos.filter(l => l.data_vencimento.startsWith(mesStr) && l.tipo === 'a_receber' && l.status === 'pendente').reduce((s, l) => s + l.valor, 0);
        const totalReceitas = recReal + recPrev;

        // Despesas (excluindo pagamentos de fatura interna para não duplicar, se houver lógica disso)
        const despReal = transacoes.filter(t => t.data.startsWith(mesStr) && t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0);
        const despPrev = lancamentosFuturos.filter(l => l.data_vencimento.startsWith(mesStr) && l.tipo === 'a_pagar' && l.status === 'pendente').reduce((s, l) => s + l.valor, 0);
        
        // Separação visual de cartão (opcional, aqui somamos tudo como despesa para o saldo)
        const totalDespesas = despReal + despPrev;

        const saldoMensal = totalReceitas - totalDespesas;
        
        // Acumulado simples para o gráfico (soma mês a mês)
        if (mesIndex === 0) saldoAcumulado = saldoInicialAno(state, ano) + saldoMensal;
        else saldoAcumulado += saldoMensal;

        return {
            mes: new Date(ano, mesIndex).toLocaleString('pt-BR', { month: 'long' }),
            receitas: totalReceitas,
            despesas: totalDespesas,
            cartoes: 0, // Simplificado dentro de despesas
            saldo: saldoMensal,
            acumulado: saldoAcumulado
        };
    });
};

// Helper para estimar saldo inicial de um ano específico
const saldoInicialAno = (state, anoAlvo) => {
    // Pega saldo atual real
    let saldo = state.contas.filter(c => c.tipo !== 'Cartão de Crédito').reduce((acc, c) => acc + c.saldo_inicial, 0);
    // Se anoAlvo > ano atual, soma previsões até lá? (Complexo). 
    // Vamos manter simples: Saldo inicial do gráfico começa com o saldo atual das contas se for ano atual.
    if (anoAlvo === new Date().getFullYear()) return saldo;
    return 0; // Para anos futuros/passados, o gráfico mostra variação do período
};

// 3. Tabela Detalhada (Grid) - Aceita ANO
export const calculateCategoryGrid = (state, anoSelecionado) => {
    const { transacoes, lancamentosFuturos } = state;
    const ano = anoSelecionado || new Date().getFullYear();
    
    const gridReceitas = {};
    const gridDespesas = {};
    const totaisMensais = Array(12).fill(0);

    const add = (tipo, cat, mes, val) => {
        const target = (tipo === 'receita' || tipo === 'a_receber') ? gridReceitas : gridDespesas;
        const catNome = cat || 'Outros';
        if (!target[catNome]) target[catNome] = Array(12).fill(0);
        target[catNome][mes] += val;
        
        if (tipo === 'receita' || tipo === 'a_receber') totaisMensais[mes] += val;
        else totaisMensais[mes] -= val;
    };

    // 1. Processa Realizado (Transações)
    transacoes.forEach(t => {
        if (t.data.startsWith(`${ano}-`)) {
            const mes = parseInt(t.data.split('-')[1]) - 1;
            add(t.tipo, t.categoria, mes, t.valor);
        }
    });

    // 2. Processa Previsto (Futuro Pendente)
    lancamentosFuturos.forEach(l => {
        if (l.status === 'pendente' && l.data_vencimento.startsWith(`${ano}-`)) {
            const mes = parseInt(l.data_vencimento.split('-')[1]) - 1;
            const tipo = l.tipo === 'a_receber' ? 'receita' : 'despesa';
            add(tipo, l.categoria, mes, l.valor);
        }
    });

    return { receitas: gridReceitas, despesas: gridDespesas, saldos: totaisMensais };
};
