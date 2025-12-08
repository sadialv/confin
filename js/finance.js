// ARQUIVO: js/finance.js

// 1. Função Principal de Métricas do Dashboard e Saúde Financeira
export const calculateFinancialHealthMetrics = (state) => {
    const { contas, transacoes, lancamentosFuturos } = state;
    const hoje = new Date();
    const mesAtual = hoje.toISOString().slice(0, 7); // Ex: "2025-12"

    // --- CÁLCULO DE PATRIMÔNIO ---
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

    // Dívidas futuras pendentes (Passivo)
    totalPassivos += lancamentosFuturos
        .filter(l => l.status === 'pendente' && l.tipo === 'a_pagar')
        .reduce((acc, l) => acc + l.valor, 0);

    const patrimonioLiquido = totalAtivos - totalPassivos;

    // --- DIAGNÓSTICO DO MÊS ATUAL (PREVISÃO VS REALIZADO) ---
    const transacoesMes = transacoes.filter(t => t.data?.startsWith(mesAtual));
    
    // A. Realizado
    const rendaRealizada = transacoesMes
        .filter(t => t.tipo === 'receita')
        .reduce((acc, t) => acc + t.valor, 0);

    const despesaRealizada = transacoesMes
        .filter(t => t.tipo === 'despesa')
        .reduce((acc, t) => acc + t.valor, 0);

    // B. Pendente (Futuro)
    const receitasPendentes = lancamentosFuturos
        .filter(l => l.status === 'pendente' && l.tipo === 'a_receber' && l.data_vencimento.startsWith(mesAtual))
        .reduce((acc, l) => acc + l.valor, 0);

    const despesasPendentes = lancamentosFuturos
        .filter(l => l.status === 'pendente' && l.tipo === 'a_pagar' && l.data_vencimento.startsWith(mesAtual))
        .reduce((acc, l) => acc + l.valor, 0);

    // C. Totais Previstos
    const rendaPrevistaTotal = rendaRealizada + receitasPendentes;
    const despesaPrevistaTotal = despesaRealizada + despesasPendentes;
    const saldoPrevisto = rendaPrevistaTotal - despesaPrevistaTotal;

    // --- CATEGORIZAÇÃO ---
    const catsFixas = ['Moradia', 'Contas', 'Educação', 'Saúde', 'Transporte'];
    const catsNecessidades = ['Moradia', 'Contas', 'Educação', 'Saúde', 'Transporte', 'Alimentação'];
    const catsDesejos = ['Lazer', 'Compras', 'Outros'];

    const despesasFixas = transacoesMes.filter(t => t.tipo === 'despesa' && catsFixas.includes(t.categoria)).reduce((acc, t) => acc + t.valor, 0);
    
    // --- INDICADORES ---
    const indiceEndividamento = totalAtivos > 0 ? (totalPassivos / totalAtivos) * 100 : 0;
    const reservaEmergenciaMeses = despesasFixas > 0 ? (totalAtivos / despesasFixas) : (totalAtivos > 0 ? 99 : 0);
    
    const saldoRealizado = rendaRealizada - despesaRealizada;
    const taxaPoupanca = rendaRealizada > 0 ? (saldoRealizado / rendaRealizada) * 100 : 0;

    const gastosNecessidades = transacoesMes.filter(t => t.tipo === 'despesa' && catsNecessidades.includes(t.categoria)).reduce((acc, t) => acc + t.valor, 0);
    const gastosDesejos = transacoesMes.filter(t => t.tipo === 'despesa' && catsDesejos.includes(t.categoria)).reduce((acc, t) => acc + t.valor, 0);

    const percNecessidades = rendaRealizada > 0 ? (gastosNecessidades / rendaRealizada) * 100 : 0;
    const percDesejos = rendaRealizada > 0 ? (gastosDesejos / rendaRealizada) * 100 : 0;
    const percPoupanca = taxaPoupanca;

    const scorePoupanca = Math.min(100, Math.max(0, (taxaPoupanca / 20) * 100));
    const scoreEndividamento = Math.min(100, Math.max(0, (1 - (indiceEndividamento / 50)) * 100));
    const financialScore = (scorePoupanca * 0.5) + (scoreEndividamento * 0.5);

    // Dados Históricos para Gráficos (Patrimônio e Categorias)
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
        rendaRealizada, despesaRealizada, saldoRealizado,
        receitasPendentes, despesasPendentes, rendaPrevistaTotal, despesaPrevistaTotal, saldoPrevisto,
        totalAtivos, totalPassivos, patrimonioLiquido,
        indiceEndividamento, reservaEmergenciaMeses, taxaPoupanca,
        percNecessidades, percDesejos, percPoupanca,
        financialScore, mediaGastosCategoria, historicoPatrimonio
    };
};

// 2. NOVA FUNÇÃO: Planejamento Anual (Linha do Tempo)
export const calculateAnnualTimeline = (state) => {
    const { contas, transacoes, lancamentosFuturos } = state;
    const anoAtual = new Date().getFullYear();
    const meses = Array.from({ length: 12 }, (_, i) => i); // 0 a 11

    // Identifica contas de Cartão de Crédito
    const idsCartao = contas.filter(c => c.tipo === 'Cartão de Crédito').map(c => c.id);

    let saldoAcumulado = 0;
    // Saldo inicial do ano (dinheiro vivo apenas)
    const saldoInicialAno = contas
        .filter(c => c.tipo !== 'Cartão de Crédito')
        .reduce((acc, c) => acc + c.saldo_inicial, 0);
    
    saldoAcumulado = saldoInicialAno;

    return meses.map(mesIndex => {
        const mesStr = `${anoAtual}-${String(mesIndex + 1).padStart(2, '0')}`;
        
        // --- RECEITAS ---
        const receitasReais = transacoes
            .filter(t => t.data.startsWith(mesStr) && t.tipo === 'receita')
            .reduce((sum, t) => sum + t.valor, 0);
        
        const receitasFuturas = lancamentosFuturos
            .filter(l => l.data_vencimento.startsWith(mesStr) && l.tipo === 'a_receber' && l.status === 'pendente')
            .reduce((sum, l) => sum + l.valor, 0);

        const totalReceitas = receitasReais + receitasFuturas;

        // --- DESPESAS GERAIS ---
        const despesasReais = transacoes
            .filter(t => t.data.startsWith(mesStr) && t.tipo === 'despesa' && !idsCartao.includes(t.conta_id))
            .reduce((sum, t) => sum + t.valor, 0);

        const despesasFuturas = lancamentosFuturos
            .filter(l => l.data_vencimento.startsWith(mesStr) && l.tipo === 'a_pagar' && l.status === 'pendente' && (!l.compra_parcelada_id || !idsCartao.includes(l.conta_id))) 
            .reduce((sum, l) => sum + l.valor, 0);

        // --- GASTOS CARTÃO (Simplificado) ---
        const gastosCartaoReais = transacoes
            .filter(t => t.data.startsWith(mesStr) && t.tipo === 'despesa' && idsCartao.includes(t.conta_id))
            .reduce((sum, t) => sum + t.valor, 0);
            
        // Nota: Futuros de cartão (parcelas) geralmente já caem como 'a_pagar' se vierem da lógica de compras_parceladas.
        // Para evitar dupla contagem ou complexidade, vamos somar tudo que é 'a_pagar' pendente como despesa futura geral.
        // O ajuste fino seria checar se a compra pai é cartão, mas para saldo final dá no mesmo.
        
        const totalDespesas = despesasReais + despesasFuturas; 
        
        const saldoMensal = totalReceitas - (totalDespesas + gastosCartaoReais);
        saldoAcumulado += saldoMensal;

        return {
            mes: new Date(anoAtual, mesIndex).toLocaleString('pt-BR', { month: 'long' }),
            receitas: totalReceitas,
            despesas: totalDespesas,
            cartoes: gastosCartaoReais,
            saldo: saldoMensal,
            acumulado: saldoAcumulado
        };
    });
};
