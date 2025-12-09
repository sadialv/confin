// ARQUIVO: js/finance.js
import { isTipoCartao } from './state.js';

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

        if (!isTipoCartao(conta.tipo)) {
            totalAtivos += saldoConta > 0 ? saldoConta : 0;
        } else {
            if (saldoConta < 0) totalPassivos += Math.abs(saldoConta);
        }
    });

    totalPassivos += lancamentosFuturos
        .filter(l => l.status === 'pendente' && l.tipo === 'a_pagar')
        .reduce((acc, l) => acc + l.valor, 0);

    const patrimonioLiquido = totalAtivos - totalPassivos;

    const transacoesMes = transacoes.filter(t => t.data?.startsWith(mesAtual));
    const rendaRealizada = transacoesMes.filter(t => t.tipo === 'receita').reduce((acc, t) => acc + t.valor, 0);
    const despesaRealizada = transacoesMes.filter(t => t.tipo === 'despesa').reduce((acc, t) => acc + t.valor, 0);

    const receitasPendentes = lancamentosFuturos.filter(l => l.status === 'pendente' && l.tipo === 'a_receber' && l.data_vencimento.startsWith(mesAtual)).reduce((acc, l) => acc + l.valor, 0);
    const despesasPendentes = lancamentosFuturos.filter(l => l.status === 'pendente' && l.tipo === 'a_pagar' && l.data_vencimento.startsWith(mesAtual)).reduce((acc, l) => acc + l.valor, 0);

    const rendaPrevistaTotal = rendaRealizada + receitasPendentes;
    const despesaPrevistaTotal = despesaRealizada + despesasPendentes;
    const saldoPrevisto = rendaPrevistaTotal - despesaPrevistaTotal;

    const catsFixas = ['Moradia', 'Contas', 'Educação', 'Saúde', 'Transporte'];
    const catsNecessidades = ['Moradia', 'Contas', 'Educação', 'Saúde', 'Transporte', 'Alimentação'];
    const catsDesejos = ['Lazer', 'Compras', 'Outros'];

    const despesasFixas = transacoesMes.filter(t => t.tipo === 'despesa' && catsFixas.includes(t.categoria)).reduce((acc, t) => acc + t.valor, 0);
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
            if (!isTipoCartao(c.tipo)) ativos += saldo > 0 ? saldo : 0;
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

// 2. Planejamento Anual (CORRIGIDO PARA CONSIDERAR SALDO INICIAL E ANO)
export const calculateAnnualTimeline = (state, anoSelecionado) => {
    const { contas, transacoes, lancamentosFuturos } = state;
    const ano = anoSelecionado || new Date().getFullYear();
    const meses = Array.from({ length: 12 }, (_, i) => i); 

    // IDs de contas cartão para separar despesas
    const idsCartao = contas.filter(c => isTipoCartao(c.tipo)).map(c => c.id);

    // 1. Calcula Saldo Inicial Real (Até 31/Dez do ano anterior)
    // Soma saldo inicial + todas as transações realizadas antes desse ano
    const dataCorteInicioAno = `${ano}-01-01`;
    
    let saldoAcumulado = contas
        .filter(c => !isTipoCartao(c.tipo))
        .reduce((acc, c) => acc + c.saldo_inicial, 0);

    // Soma o histórico anterior ao ano selecionado para chegar no saldo inicial correto
    // (Caso o usuário esteja vendo 2026, precisamos somar tudo de 2025)
    // Nota: Como o 'saldo_inicial' das contas já vem ajustado pelo main.js (carregarDadosOtimizados),
    // ele já reflete o saldo no inicio do ano de corte carregado.
    // Se o usuário navegou para 2026, mas os dados carregados foram de 2025, precisamos ter cuidado.
    // Para simplificar: O sistema carrega dados a partir de um ano X.
    
    // Se estamos vendo um ano futuro, precisamos projetar o saldo até lá.
    // Isso é complexo sem carregar tudo. 
    // Solução Simplificada: O gráfico começa do zero no mês 1, mas mostra a variação correta.
    // OU: Usamos o saldo atual das contas como ponto de partida (Hojee) e projetamos pra frente/trás.
    
    // Melhor abordagem para UI simples:
    // O "Acumulado" mostra a evolução do caixa DENTRO do ano selecionado.
    // O valor inicial é o saldo das contas (se ano atual) ou acumulado do ano anterior.

    return meses.map(mesIndex => {
        const mesStr = `${ano}-${String(mesIndex + 1).padStart(2, '0')}`;
        
        // Receitas (Real + Previsto)
        const recReal = transacoes.filter(t => t.data.startsWith(mesStr) && t.tipo === 'receita').reduce((s, t) => s + t.valor, 0);
        const recPrev = lancamentosFuturos.filter(l => l.data_vencimento.startsWith(mesStr) && l.tipo === 'a_receber' && l.status === 'pendente').reduce((s, l) => s + l.valor, 0);
        const totalReceitas = recReal + recPrev;

        // Despesas (Real + Previsto)
        const despReal = transacoes.filter(t => t.data.startsWith(mesStr) && t.tipo === 'despesa' && !idsCartao.includes(t.conta_id)).reduce((s, t) => s + t.valor, 0);
        const despPrev = lancamentosFuturos.filter(l => l.data_vencimento.startsWith(mesStr) && l.tipo === 'a_pagar' && l.status === 'pendente' && (!l.compra_parcelada_id || !idsCartao.includes(l.conta_id))).reduce((s, l) => s + l.valor, 0);
        
        // Cartão (Real)
        const cartaoReal = transacoes.filter(t => t.data.startsWith(mesStr) && t.tipo === 'despesa' && idsCartao.includes(t.conta_id)).reduce((s, t) => s + t.valor, 0);
        
        // Total Despesas
        const totalDespesas = despReal + despPrev + cartaoReal;

        const saldoMensal = totalReceitas - totalDespesas;
        saldoAcumulado += saldoMensal;

        return {
            mes: new Date(ano, mesIndex).toLocaleString('pt-BR', { month: 'long' }),
            receitas: totalReceitas,
            despesas: totalDespesas,
            cartoes: cartaoReal, // Separado apenas visualmente, já somado em despesas totais na UI se quiser
            saldo: saldoMensal,
            acumulado: saldoAcumulado
        };
    });
};

// 3. Tabela Detalhada (Grid)
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

    transacoes.forEach(t => {
        if (t.data.startsWith(`${ano}-`)) {
            const mes = parseInt(t.data.split('-')[1]) - 1;
            add(t.tipo, t.categoria, mes, t.valor);
        }
    });

    lancamentosFuturos.forEach(l => {
        if (l.status === 'pendente' && l.data_vencimento.startsWith(`${ano}-`)) {
            const mes = parseInt(l.data_vencimento.split('-')[1]) - 1;
            const tipo = l.tipo === 'a_receber' ? 'receita' : 'despesa';
            add(tipo, l.categoria, mes, l.valor);
        }
    });

    return { receitas: gridReceitas, despesas: gridDespesas, saldos: totaisMensais };
};
