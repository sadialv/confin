// ARQUIVO: js/finance.js

// 1. Métricas Principais (Dashboard, Saúde Financeira e Visão Mensal)
export const calculateFinancialHealthMetrics = (state) => {
    const { contas, transacoes, lancamentosFuturos } = state;
    const hoje = new Date();
    const mesAtual = hoje.toISOString().slice(0, 7); // Ex: "2025-12"

    // --- CÁLCULO DE PATRIMÔNIO ---
    let totalAtivos = 0;
    let totalPassivos = 0;

    // Helper simples para checar cartão se não tiver sido importado
    // (Garante que funcione mesmo sem a dependência do state.js aqui)
    const isCartao = (tipo) => tipo === 'Cartão de Crédito';

    contas.forEach(conta => {
        const saldoConta = transacoes
            .filter(t => t.conta_id === conta.id)
            .reduce((acc, t) => t.tipo === 'receita' ? acc + t.valor : acc - t.valor, conta.saldo_inicial);

        if (!isCartao(conta.tipo)) {
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

    // --- DIAGNÓSTICO DO MÊS ATUAL ---
    const transacoesMes = transacoes.filter(t => t.data?.startsWith(mesAtual));
    
    // A. Realizado
    const rendaRealizada = transacoesMes
        .filter(t => t.tipo === 'receita')
        .reduce((acc, t) => acc + t.valor, 0);

    const despesaRealizada = transacoesMes
        .filter(t => t.tipo === 'despesa')
        .reduce((acc, t) => acc + t.valor, 0);

    // B. Pendente
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

    // --- INDICADORES E SCORES (CORREÇÃO AQUI) ---
    
    // 1. Calcula Despesas Fixas para Reserva de Emergência
    const catsFixas = ['Moradia', 'Contas', 'Educação', 'Saúde', 'Transporte'];
    const despesasFixas = transacoesMes
        .filter(t => t.tipo === 'despesa' && catsFixas.includes(t.categoria))
        .reduce((acc, t) => acc + t.valor, 0);

    // 2. Calcula Índice de Endividamento (CORRIGIDO: Declarado explicitamente)
    const indiceEndividamento = totalAtivos > 0 ? (totalPassivos / totalAtivos) * 100 : 0;
    
    // 3. Reserva de Emergência
    const reservaEmergenciaMeses = despesasFixas > 0 ? (totalAtivos / despesasFixas) : (totalAtivos > 0 ? 99 : 0);
    
    // 4. Taxa de Poupança
    const saldoRealizado = rendaRealizada - despesaRealizada;
    const taxaPoupanca = rendaRealizada > 0 ? (saldoRealizado / rendaRealizada) * 100 : 0;

    // 5. Regra 50-30-20 (Apenas visualização)
    const catsNecessidades = ['Moradia', 'Contas', 'Educação', 'Saúde', 'Transporte', 'Alimentação'];
    const catsDesejos = ['Lazer', 'Compras', 'Outros'];
    const gastosNecessidades = transacoesMes.filter(t => t.tipo === 'despesa' && catsNecessidades.includes(t.categoria)).reduce((acc, t) => acc + t.valor, 0);
    const gastosDesejos = transacoesMes.filter(t => t.tipo === 'despesa' && catsDesejos.includes(t.categoria)).reduce((acc, t) => acc + t.valor, 0);

    const percNecessidades = rendaRealizada > 0 ? (gastosNecessidades / rendaRealizada) * 100 : 0;
    const percDesejos = rendaRealizada > 0 ? (gastosDesejos / rendaRealizada) * 100 : 0;
    const percPoupanca = taxaPoupanca;

    // 6. Cálculo do Score Final
    const scorePoupanca = Math.min(100, Math.max(0, (taxaPoupanca / 20) * 100));
    // Agora usa a variável indiceEndividamento que foi declarada corretamente acima
    const scoreEndividamento = Math.min(100, Math.max(0, (1 - (indiceEndividamento / 50)) * 100));
    const financialScore = (scorePoupanca * 0.5) + (scoreEndividamento * 0.5);

    // --- DADOS PARA GRÁFICOS ---
    let gastosPorCategoria = {};
    let meses = new Set();
    transacoes.forEach(t => {
        const mes = t.data.substring(0, 7);
        meses.add(mes);
        if (t.tipo === 'despesa') gastosPorCategoria[t.categoria] = (gastosPorCategoria[t.categoria] || 0) + t.valor;
    });

    const mediaGastosCategoria = Object.entries(gastosPorCategoria)
        .map(([categoria, total]) => ({ categoria, media: total / (meses.size || 1) }))
        .sort((a,b) => b.media - a.media);

    const historicoPatrimonio = Array.from(meses).sort().slice(-12).map(mes => {
        const transacoesAteMes = transacoes.filter(t => t.data.substring(0,7) <= mes);
        let ativos = 0, passivos = 0;
        contas.forEach(c => {
            const saldo = transacoesAteMes.filter(t => t.conta_id === c.id).reduce((acc, t) => t.tipo === 'receita' ? acc + t.valor : acc - t.valor, c.saldo_inicial);
            if (!isCartao(c.tipo)) ativos += saldo > 0 ? saldo : 0;
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

// 2. Planejamento Anual: Gráfico Misto (Timeline)
export const calculateAnnualTimeline = (state, anoSelecionado) => {
    const { contas, transacoes, lancamentosFuturos } = state;
    const anoAtual = new Date().getFullYear();
    // Usa o ano selecionado ou o atual como fallback
    const ano = anoSelecionado || anoAtual;
    const meses = Array.from({ length: 12 }, (_, i) => i); 

    // Identifica contas de Cartão de Crédito (Hardcoded fallback ou lógica do tipo)
    const idsCartao = contas.filter(c => c.tipo === 'Cartão de Crédito').map(c => c.id);

    let saldoAcumulado = 0;
    // Saldo inicial do ano (apenas dinheiro vivo)
    const saldoInicialAno = contas
        .filter(c => c.tipo !== 'Cartão de Crédito')
        .reduce((acc, c) => acc + c.saldo_inicial, 0);
    
    // Se estivermos vendo o ano atual, começamos com o saldo real. 
    // Para anos futuros/passados, o ideal seria recalcular, mas vamos simplificar mantendo a base.
    saldoAcumulado = saldoInicialAno;

    return meses.map(mesIndex => {
        const mesStr = `${ano}-${String(mesIndex + 1).padStart(2, '0')}`;
        
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

        // --- GASTOS CARTÃO ---
        const gastosCartaoReais = transacoes
            .filter(t => t.data.startsWith(mesStr) && t.tipo === 'despesa' && idsCartao.includes(t.conta_id))
            .reduce((sum, t) => sum + t.valor, 0);
            
        const totalDespesas = despesasReais + despesasFuturas; 
        
        const saldoMensal = totalReceitas - (totalDespesas + gastosCartaoReais);
        saldoAcumulado += saldoMensal;

        return {
            mes: new Date(ano, mesIndex).toLocaleString('pt-BR', { month: 'long' }),
            receitas: totalReceitas,
            despesas: totalDespesas,
            cartoes: gastosCartaoReais,
            saldo: saldoMensal,
            acumulado: saldoAcumulado
        };
    });
};

// 3. Planejamento Anual: Tabela Detalhada (Grid Categoria x Mês)
export const calculateCategoryGrid = (state, anoSelecionado) => {
    const { transacoes, lancamentosFuturos } = state;
    const anoAtual = new Date().getFullYear();
    const ano = anoSelecionado || anoAtual;
    
    const gridReceitas = {};
    const gridDespesas = {};
    const totaisMensais = Array(12).fill(0);

    const adicionarAoGrid = (tipo, categoria, mesIndex, valor) => {
        const target = tipo === 'receita' || tipo === 'a_receber' ? gridReceitas : gridDespesas;
        if (!categoria) categoria = 'Outros';
        
        if (!target[categoria]) {
            target[categoria] = Array(12).fill(0);
        }
        
        target[categoria][mesIndex] += valor;
        
        if (tipo === 'receita' || tipo === 'a_receber') {
            totaisMensais[mesIndex] += valor;
        } else {
            totaisMensais[mesIndex] -= valor;
        }
    };

    // 1. Processar Realizado
    transacoes.forEach(t => {
        const d = new Date(t.data + 'T12:00:00');
        if (d.getFullYear() === ano) {
            adicionarAoGrid(t.tipo, t.categoria, d.getMonth(), t.valor);
        }
    });

    // 2. Processar Previsto
    lancamentosFuturos.forEach(l => {
        if (l.status === 'pendente') {
            const d = new Date(l.data_vencimento + 'T12:00:00');
            if (d.getFullYear() === ano) {
                const tipo = l.tipo === 'a_receber' ? 'receita' : 'despesa';
                adicionarAoGrid(tipo, l.categoria, d.getMonth(), l.valor);
            }
        }
    });

    return {
        receitas: gridReceitas,
        despesas: gridDespesas,
        saldos: totaisMensais
    };
};
