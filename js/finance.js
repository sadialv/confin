// ARQUIVO: js/finance.js
import { isTipoCartao } from './state.js';

// 1. Métricas Principais
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

    // Métricas do Mês Atual
    const transacoesMes = transacoes.filter(t => t.data?.startsWith(mesAtual));
    const rendaRealizada = transacoesMes.filter(t => t.tipo === 'receita').reduce((acc, t) => acc + t.valor, 0);
    const despesaRealizada = transacoesMes.filter(t => t.tipo === 'despesa').reduce((acc, t) => acc + t.valor, 0);
    const receitasPendentes = lancamentosFuturos.filter(l => l.status === 'pendente' && l.tipo === 'a_receber' && l.data_vencimento.startsWith(mesAtual)).reduce((acc, l) => acc + l.valor, 0);
    const despesasPendentes = lancamentosFuturos.filter(l => l.status === 'pendente' && l.tipo === 'a_pagar' && l.data_vencimento.startsWith(mesAtual)).reduce((acc, l) => acc + l.valor, 0);

    const rendaPrevistaTotal = rendaRealizada + receitasPendentes;
    const despesaPrevistaTotal = despesaRealizada + despesasPendentes;
    const saldoPrevisto = rendaPrevistaTotal - despesaPrevistaTotal;

    // Indicadores
    const catsFixas = ['Moradia', 'Contas', 'Educação', 'Saúde', 'Transporte'];
    const catsNecessidades = ['Moradia', 'Contas', 'Educação', 'Saúde', 'Transporte', 'Alimentação'];
    const catsDesejos = ['Lazer', 'Compras', 'Outros'];

    const despesasFixas = transacoesMes.filter(t => t.tipo === 'despesa' && catsFixas.includes(t.categoria)).reduce((acc, t) => acc + t.valor, 0);
    const indiceEndividamento = totalAtivos > 0 ? (totalPassivos / totalAtivos) * 100 : 0;
    const reservaEmergenciaMeses = despesasFixas > 0 ? (totalAtivos / despesasFixas) : 99;
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

    const mediaGastosCategoria = Object.entries(gastosPorCategoria).map(([k,v]) => ({categoria: k, media: v / (meses.size||1)})).sort((a,b) => b.media - a.media);
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

// 2. Planejamento Anual (Gráfico Misto)
export const calculateAnnualTimeline = (state, anoSelecionado) => {
    const { contas, transacoes, lancamentosFuturos } = state;
    const ano = anoSelecionado || new Date().getFullYear();
    const meses = Array.from({ length: 12 }, (_, i) => i); 
    const idsCartao = contas.filter(c => isTipoCartao(c.tipo)).map(c => c.id);

    // 1. Saldo Inicial (Contas não-cartão)
    const saldoInicialContas = contas.filter(c => !isTipoCartao(c.tipo)).reduce((acc, c) => acc + c.saldo_inicial, 0);

    // 2. Histórico Passado (Até 31/12 do ano anterior)
    const dataCorte = `${ano}-01-01`;
    const historicoRealizado = transacoes.filter(t => t.data < dataCorte).reduce((acc, t) => t.tipo === 'receita' ? acc + t.valor : acc - t.valor, 0);
    const historicoPendente = lancamentosFuturos.filter(l => l.status === 'pendente' && l.data_vencimento < dataCorte).reduce((acc, l) => l.tipo === 'a_receber' ? acc + l.valor : acc - l.valor, 0);

    let saldoAcumulado = saldoInicialContas + historicoRealizado + historicoPendente;

    return meses.map(mesIndex => {
        const mesStr = `${ano}-${String(mesIndex + 1).padStart(2, '0')}`;
        
        const recReal = transacoes.filter(t => t.data.startsWith(mesStr) && t.tipo === 'receita').reduce((s, t) => s + t.valor, 0);
        const recPrev = lancamentosFuturos.filter(l => l.data_vencimento.startsWith(mesStr) && l.tipo === 'a_receber' && l.status === 'pendente').reduce((s, l) => s + l.valor, 0);
        const totalReceitas = recReal + recPrev;

        const despReal = transacoes.filter(t => t.data.startsWith(mesStr) && t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0);
        const despPrev = lancamentosFuturos.filter(l => l.data_vencimento.startsWith(mesStr) && l.tipo === 'a_pagar' && l.status === 'pendente').reduce((s, l) => s + l.valor, 0);
        const totalDespesas = despReal + despPrev;

        const saldoMensal = totalReceitas - totalDespesas;
        saldoAcumulado += saldoMensal;

        return {
            mes: new Date(ano, mesIndex).toLocaleString('pt-BR', { month: 'long' }),
            receitas: totalReceitas, despesas: totalDespesas, saldo: saldoMensal, acumulado: saldoAcumulado
        };
    });
};

// 3. Tabela Detalhada (CORRIGIDA: Inclui Saldo Acumulado)
export const calculateCategoryGrid = (state, anoSelecionado) => {
    const { contas, transacoes, lancamentosFuturos } = state;
    const ano = anoSelecionado || new Date().getFullYear();
    const gridReceitas = {};
    const gridDespesas = {};
    const totaisMensais = Array(12).fill(0);

    // --- CÁLCULO DO SALDO INICIAL PARA A TABELA ---
    const saldoInicialContas = contas.filter(c => !isTipoCartao(c.tipo)).reduce((acc, c) => acc + c.saldo_inicial, 0);
    const dataCorte = `${ano}-01-01`;
    const historicoRealizado = transacoes.filter(t => t.data < dataCorte).reduce((acc, t) => t.tipo === 'receita' ? acc + t.valor : acc - t.valor, 0);
    const historicoPendente = lancamentosFuturos.filter(l => l.status === 'pendente' && l.data_vencimento < dataCorte).reduce((acc, l) => l.tipo === 'a_receber' ? acc + l.valor : acc - l.valor, 0);
    
    let saldoCorrente = saldoInicialContas + historicoRealizado + historicoPendente;
    const acumuladoMensal = [];

    // Preenche categorias e saldo líquido
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
            add(t.tipo, t.categoria, parseInt(t.data.split('-')[1]) - 1, t.valor);
        }
    });

    lancamentosFuturos.forEach(l => {
        if (l.status === 'pendente' && l.data_vencimento.startsWith(`${ano}-`)) {
            const tipo = l.tipo === 'a_receber' ? 'receita' : 'despesa';
            add(tipo, l.categoria, parseInt(l.data_vencimento.split('-')[1]) - 1, l.valor);
        }
    });

    // Calcula a linha de acumulado mês a mês
    for (let i = 0; i < 12; i++) {
        saldoCorrente += totaisMensais[i];
        acumuladoMensal.push(saldoCorrente);
    }

    return { receitas: gridReceitas, despesas: gridDespesas, saldos: totaisMensais, acumulados: acumuladoMensal };
};
