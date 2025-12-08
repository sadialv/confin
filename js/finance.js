// ARQUIVO: js/finance.js
import { isTipoCartao } from './state.js'; // <--- Importação necessária

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

        // MUDANÇA: Verifica se é cartão usando a função do state
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

export const calculateAnnualTimeline = (state) => {
    const { contas, transacoes, lancamentosFuturos } = state;
    const anoAtual = new Date().getFullYear();
    const meses = Array.from({ length: 12 }, (_, i) => i); 

    // MUDANÇA: Filtra IDs de cartões dinamicamente
    const idsCartao = contas.filter(c => isTipoCartao(c.tipo)).map(c => c.id);

    let saldoAcumulado = 0;
    const saldoInicialAno = contas.filter(c => !isTipoCartao(c.tipo)).reduce((acc, c) => acc + c.saldo_inicial, 0);
    saldoAcumulado = saldoInicialAno;

    return meses.map(mesIndex => {
        const mesStr = `${anoAtual}-${String(mesIndex + 1).padStart(2, '0')}`;
        const receitasReais = transacoes.filter(t => t.data.startsWith(mesStr) && t.tipo === 'receita').reduce((sum, t) => sum + t.valor, 0);
        const receitasFuturas = lancamentosFuturos.filter(l => l.data_vencimento.startsWith(mesStr) && l.tipo === 'a_receber' && l.status === 'pendente').reduce((sum, l) => sum + l.valor, 0);
        const totalReceitas = receitasReais + receitasFuturas;

        const despesasReais = transacoes.filter(t => t.data.startsWith(mesStr) && t.tipo === 'despesa' && !idsCartao.includes(t.conta_id)).reduce((sum, t) => sum + t.valor, 0);
        const despesasFuturas = lancamentosFuturos.filter(l => l.data_vencimento.startsWith(mesStr) && l.tipo === 'a_pagar' && l.status === 'pendente' && (!l.compra_parcelada_id || !idsCartao.includes(l.conta_id))).reduce((sum, l) => sum + l.valor, 0);

        const gastosCartaoReais = transacoes.filter(t => t.data.startsWith(mesStr) && t.tipo === 'despesa' && idsCartao.includes(t.conta_id)).reduce((sum, t) => sum + t.valor, 0);
        
        const totalDespesas = despesasReais + despesasFuturas; 
        const saldoMensal = totalReceitas - (totalDespesas + gastosCartaoReais);
        saldoAcumulado += saldoMensal;

        return {
            mes: new Date(anoAtual, mesIndex).toLocaleString('pt-BR', { month: 'long' }),
            receitas: totalReceitas, despesas: totalDespesas, cartoes: gastosCartaoReais, saldo: saldoMensal, acumulado: saldoAcumulado
        };
    });
};

export const calculateCategoryGrid = (state) => {
    const { transacoes, lancamentosFuturos } = state;
    const anoAtual = new Date().getFullYear();
    const gridReceitas = {}, gridDespesas = {}, totaisMensais = Array(12).fill(0);

    const adicionarAoGrid = (tipo, categoria, mesIndex, valor) => {
        const target = tipo === 'receita' || tipo === 'a_receber' ? gridReceitas : gridDespesas;
        if (!categoria) categoria = 'Outros';
        if (!target[categoria]) target[categoria] = Array(12).fill(0);
        target[categoria][mesIndex] += valor;
        if (tipo === 'receita' || tipo === 'a_receber') totaisMensais[mesIndex] += valor;
        else totaisMensais[mesIndex] -= valor;
    };

    transacoes.forEach(t => {
        const d = new Date(t.data + 'T12:00:00');
        if (d.getFullYear() === anoAtual) adicionarAoGrid(t.tipo, t.categoria, d.getMonth(), t.valor);
    });

    lancamentosFuturos.forEach(l => {
        if (l.status === 'pendente') {
            const d = new Date(l.data_vencimento + 'T12:00:00');
            if (d.getFullYear() === anoAtual) {
                const tipo = l.tipo === 'a_receber' ? 'receita' : 'despesa';
                adicionarAoGrid(tipo, l.categoria, d.getMonth(), l.valor);
            }
        }
    });

    return { receitas: gridReceitas, despesas: gridDespesas, saldos: totaisMensais };
};
