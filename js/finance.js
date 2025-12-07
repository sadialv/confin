// ARQUIVO: js/finance.js
export const calculateFinancialHealthMetrics = (state) => {
    const { contas, transacoes, lancamentosFuturos } = state;
    const hoje = new Date();
    const mesAtual = hoje.toISOString().slice(0, 7);

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

    // Diagnóstico do Mês
    const transacoesMes = transacoes.filter(t => t.data?.startsWith(mesAtual));
    const rendaMensal = transacoesMes.filter(t => t.tipo === 'receita').reduce((acc, t) => acc + t.valor, 0);

    const catsFixas = ['Moradia', 'Contas', 'Educação', 'Saúde', 'Transporte'];
    const catsVariaveis = ['Alimentação', 'Lazer', 'Compras', 'Outros'];
    const catsNecessidades = ['Moradia', 'Contas', 'Educação', 'Saúde', 'Transporte', 'Alimentação'];
    const catsDesejos = ['Lazer', 'Compras', 'Outros'];

    const despesasFixas = transacoesMes.filter(t => t.tipo === 'despesa' && catsFixas.includes(t.categoria)).reduce((acc, t) => acc + t.valor, 0);
    const despesasVariaveis = transacoesMes.filter(t => t.tipo === 'despesa' && catsVariaveis.includes(t.categoria)).reduce((acc, t) => acc + t.valor, 0);
    const pagamentoFaturas = transacoesMes.filter(t => t.tipo === 'despesa' && t.categoria === 'Pagamento de Fatura').reduce((acc, t) => acc + t.valor, 0);
    const totalDespesas = despesasFixas + despesasVariaveis + pagamentoFaturas;
    const saldoMensal = rendaMensal - totalDespesas;

    // Indicadores
    const indiceEndividamento = totalAtivos > 0 ? (totalPassivos / totalAtivos) * 100 : 0;
    const comprometimentoRenda = rendaMensal > 0 ? (pagamentoFaturas / rendaMensal) * 100 : 0;
    const reservaEmergenciaMeses = despesasFixas > 0 ? (totalAtivos / despesasFixas) : Infinity;
    const taxaPoupanca = rendaMensal > 0 ? (saldoMensal / rendaMensal) * 100 : 0;

    // Regra 50-30-20
    const gastosNecessidades = transacoesMes.filter(t => t.tipo === 'despesa' && catsNecessidades.includes(t.categoria)).reduce((acc, t) => acc + t.valor, 0);
    const gastosDesejos = transacoesMes.filter(t => t.tipo === 'despesa' && catsDesejos.includes(t.categoria)).reduce((acc, t) => acc + t.valor, 0);

    const percNecessidades = rendaMensal > 0 ? (gastosNecessidades / rendaMensal) * 100 : 0;
    const percDesejos = rendaMensal > 0 ? (gastosDesejos / rendaMensal) * 100 : 0;
    const percPoupanca = taxaPoupanca;

    // Score
    const scorePoupanca = Math.min(100, Math.max(0, (taxaPoupanca / 20) * 100));
    const scoreEndividamento = Math.min(100, Math.max(0, (1 - (indiceEndividamento / 50)) * 100));
    const scoreReserva = Math.min(100, Math.max(0, (reservaEmergenciaMeses / 6) * 100));
    const financialScore = (scorePoupanca * 0.4) + (scoreEndividamento * 0.4) + (scoreReserva * 0.2);

    // Gráficos
    let gastosPorCategoria = {};
    let meses = new Set();
    transacoes.forEach(t => {
        const mes = t.data.substring(0, 7);
        meses.add(mes);
        if (t.tipo === 'despesa') gastosPorCategoria[t.categoria] = (gastosPorCategoria[t.categoria] || 0) + t.valor;
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
        financialScore, mediaGastosCategoria, historicoPatrimonio
    };
};
