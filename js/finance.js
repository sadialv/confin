// ARQUIVO: js/finance.js
import { isTipoCartao } from './state.js';

// 1. Métricas Principais (Dashboard, Saúde Financeira)
export const calculateFinancialHealthMetrics = (state) => {
    // ... (MANTENHA ESTA FUNÇÃO IGUAL, POIS ELA ESTÁ FUNCIONANDO PARA O DASHBOARD)
    // Para economizar espaço e foco, estou omitindo aqui, mas MANTENHA a versão completa anterior dela.
    // Se precisar, eu posto novamente.
    const { contas, transacoes, lancamentosFuturos } = state;
    const mesAtual = new Date().toISOString().slice(0, 7);
    let totalAtivos = 0, totalPassivos = 0;
    contas.forEach(c => {
        const s = transacoes.filter(t => t.conta_id === c.id).reduce((a, t) => t.tipo === 'receita' ? a + t.valor : a - t.valor, c.saldo_inicial);
        if(!isTipoCartao(c.tipo)) totalAtivos += s>0?s:0; else if(s<0) totalPassivos+=Math.abs(s);
    });
    totalPassivos += lancamentosFuturos.filter(l => l.status === 'pendente' && l.tipo === 'a_pagar').reduce((acc, l) => acc + l.valor, 0);
    const patrimonioLiquido = totalAtivos - totalPassivos;
    const transacoesMes = transacoes.filter(t => t.data?.startsWith(mesAtual));
    const rendaRealizada = transacoesMes.filter(t => t.tipo === 'receita').reduce((acc, t) => acc + t.valor, 0);
    const despesaRealizada = transacoesMes.filter(t => t.tipo === 'despesa').reduce((acc, t) => acc + t.valor, 0);
    const receitasPendentes = lancamentosFuturos.filter(l => l.status === 'pendente' && l.tipo === 'a_receber' && l.data_vencimento.startsWith(mesAtual)).reduce((acc, l) => acc + l.valor, 0);
    const despesasPendentes = lancamentosFuturos.filter(l => l.status === 'pendente' && l.tipo === 'a_pagar' && l.data_vencimento.startsWith(mesAtual)).reduce((acc, l) => acc + l.valor, 0);
    const rendaPrevistaTotal = rendaRealizada + receitasPendentes;
    const despesaPrevistaTotal = despesaRealizada + despesasPendentes;
    const saldoPrevisto = rendaPrevistaTotal - despesaPrevistaTotal;
    // ... Indicadores e Gráficos ...
    // (Retorne o objeto completo como antes)
    return {
        rendaRealizada, despesaRealizada,
        rendaPrevistaTotal, despesaPrevistaTotal, saldoPrevisto,
        totalAtivos, totalPassivos, patrimonioLiquido,
        financialScore: 80, // Simplificado para brevidade
        mediaGastosCategoria: [], historicoPatrimonio: []
    };
};

// 2. Planejamento Anual (Gráfico)
export const calculateAnnualTimeline = (state, anoSelecionado) => {
    // ... (MANTENHA IGUAL A ANTERIOR)
    const { contas, transacoes, lancamentosFuturos, comprasParceladas } = state;
    const ano = anoSelecionado || new Date().getFullYear();
    const meses = Array.from({ length: 12 }, (_, i) => i); 
    const idsCartao = contas.filter(c => isTipoCartao(c.tipo)).map(c => c.id);
    let saldoAcumulado = contas.filter(c => !isTipoCartao(c.tipo)).reduce((acc, c) => acc + c.saldo_inicial, 0);
    const dataCorte = `${ano}-01-01`;
    const deltaHist = transacoes.filter(t => t.data < dataCorte).reduce((acc, t) => { if (idsCartao.includes(t.conta_id)) return acc; return t.tipo === 'receita' ? acc + t.valor : acc - t.valor; }, 0);
    const deltaPend = lancamentosFuturos.filter(l => l.status === 'pendente' && l.data_vencimento < dataCorte).reduce((acc, l) => {
         const compraPai = l.compra_parcelada_id ? comprasParceladas.find(c => c.id === l.compra_parcelada_id) : null;
         if ((compraPai && idsCartao.includes(compraPai.conta_id)) || (l.conta_id && idsCartao.includes(l.conta_id))) return acc;
         return l.tipo === 'a_receber' ? acc + l.valor : acc - l.valor;
    }, 0);
    saldoAcumulado += (deltaHist + deltaPend);
    return meses.map(mesIndex => {
        const mesStr = `${ano}-${String(mesIndex + 1).padStart(2, '0')}`;
        const rec = transacoes.filter(t => t.data.startsWith(mesStr) && t.tipo === 'receita').reduce((s,t)=>s+t.valor,0) + lancamentosFuturos.filter(l => l.data_vencimento.startsWith(mesStr) && l.tipo === 'a_receber' && l.status === 'pendente').reduce((s,l)=>s+l.valor,0);
        const desp = transacoes.filter(t => t.data.startsWith(mesStr) && t.tipo === 'despesa' && !idsCartao.includes(t.conta_id)).reduce((s,t)=>s+t.valor,0) + lancamentosFuturos.filter(l => l.data_vencimento.startsWith(mesStr) && l.tipo === 'a_pagar' && l.status === 'pendente').reduce((s, l) => {
            const compraPai = l.compra_parcelada_id ? comprasParceladas.find(c => c.id === l.compra_parcelada_id) : null;
            if ((compraPai && idsCartao.includes(compraPai.conta_id)) || (l.conta_id && idsCartao.includes(l.conta_id))) return s;
            return s + l.valor;
        }, 0);
        const cartoes = transacoes.filter(t => t.data.startsWith(mesStr) && t.tipo === 'despesa' && idsCartao.includes(t.conta_id)).reduce((s,t)=>s+t.valor,0);
        const saldo = rec - desp;
        saldoAcumulado += saldo;
        return { mes: mesStr, receitas: rec, despesas: desp, cartoes, saldo, acumulado: saldoAcumulado };
    });
};

// 3. Tabela Detalhada (AQUI ESTÁ A MÁGICA PARA BATER COM A PLANILHA)
export const calculateCategoryGrid = (state, anoSelecionado) => {
    // Usa a timeline para garantir que o saldo acumulado seja o mesmo do gráfico
    const timeline = calculateAnnualTimeline(state, anoSelecionado);
    const acumulados = timeline.map(t => t.acumulado);
    const saldoMensalLiquido = timeline.map(t => t.saldo); // Resultado do Mês

    const { transacoes, lancamentosFuturos } = state;
    const ano = anoSelecionado || new Date().getFullYear();
    
    // Matrizes para guardar os valores [Categoria][Mês 0-11]
    const gridReceitas = {};
    const gridDespesas = {};
    
    const add = (tipo, cat, mes, val) => {
        const isRec = (tipo === 'receita' || tipo === 'a_receber');
        const target = isRec ? gridReceitas : gridDespesas;
        const catNome = cat || 'Outros';
        
        if (!target[catNome]) target[catNome] = Array(12).fill(0);
        target[catNome][mes] += val;
    };

    // Preenche com Transações Realizadas
    transacoes.forEach(t => {
        if (t.data.startsWith(`${ano}-`)) {
            const mes = parseInt(t.data.split('-')[1]) - 1;
            add(t.tipo, t.categoria, mes, t.valor);
        }
    });

    // Preenche com Lançamentos Futuros
    lancamentosFuturos.forEach(l => {
        if (l.status === 'pendente' && l.data_vencimento.startsWith(`${ano}-`)) {
            const mes = parseInt(l.data_vencimento.split('-')[1]) - 1;
            const tipo = l.tipo === 'a_receber' ? 'receita' : 'despesa';
            add(tipo, l.categoria, mes, l.valor);
        }
    });

    return { 
        receitas: gridReceitas, 
        despesas: gridDespesas, 
        saldoMensal: saldoMensalLiquido, // Array [Jan, Fev...] com o lucro/prejuizo do mes
        saldoAcumulado: acumulados       // Array [Jan, Fev...] com o saldo real do banco
    };
};

// 4. Função Nova para Evolução Diária (Dashboard)
export const calculateDailyEvolution = (state, mesISO) => {
    const { transacoes, lancamentosFuturos } = state;
    const [ano, mes] = mesISO.split('-').map(Number);
    const diasNoMes = new Date(ano, mes, 0).getDate();
    
    let saldoDia = 0;
    const evolution = [];

    for (let d = 1; d <= diasNoMes; d++) {
        const diaStr = `${mesISO}-${String(d).padStart(2, '0')}`;
        
        const rec = transacoes.filter(t => t.data === diaStr && t.tipo === 'receita').reduce((s,t) => s+t.valor, 0) + 
                    lancamentosFuturos.filter(l => l.status === 'pendente' && l.data_vencimento === diaStr && l.tipo === 'a_receber').reduce((s,l) => s+l.valor, 0);

        const desp = transacoes.filter(t => t.data === diaStr && t.tipo === 'despesa').reduce((s,t) => s+t.valor, 0) + 
                     lancamentosFuturos.filter(l => l.status === 'pendente' && l.data_vencimento === diaStr && l.tipo === 'a_pagar').reduce((s,l) => s+l.valor, 0);

        const liq = rec - desp;
        saldoDia += liq;
        evolution.push({ dia: d, saldoDoDia: liq, acumulado: saldoDia });
    }
    return evolution;
};
