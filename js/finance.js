// ARQUIVO: js/finance.js
import { isTipoCartao } from './state.js';

// 1. Métricas Principais (Dashboard, Saúde Financeira)
export const calculateFinancialHealthMetrics = (state) => {
    const { contas, transacoes, lancamentosFuturos } = state;
    const mesAtual = new Date().toISOString().slice(0, 7);

    let totalAtivos = 0;
    let totalPassivos = 0;

    // Calcula Patrimônio Atual (Saldo das Contas)
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
    const despesasFixas = transacoesMes.filter(t => t.tipo === 'despesa' && catsFixas.includes(t.categoria)).reduce((acc, t) => acc + t.valor, 0);
    const indiceEndividamento = totalAtivos > 0 ? (totalPassivos / totalAtivos) * 100 : 0;
    const reservaEmergenciaMeses = despesasFixas > 0 ? (totalAtivos / despesasFixas) : 99;
    const saldoRealizado = rendaRealizada - despesaRealizada;
    const taxaPoupanca = rendaRealizada > 0 ? (saldoRealizado / rendaRealizada) * 100 : 0;

    const scorePoupanca = Math.min(100, Math.max(0, (taxaPoupanca / 20) * 100));
    const scoreEndividamento = Math.min(100, Math.max(0, (1 - (indiceEndividamento / 50)) * 100));
    const financialScore = (scorePoupanca * 0.5) + (scoreEndividamento * 0.5);

    // Histórico Patrimonial
    let meses = new Set();
    transacoes.forEach(t => meses.add(t.data.substring(0, 7)));
    let gastosPorCategoria = {};
    transacoes.filter(t => t.tipo === 'despesa').forEach(t => gastosPorCategoria[t.categoria] = (gastosPorCategoria[t.categoria] || 0) + t.valor);
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

    return { rendaRealizada, despesaRealizada, saldoRealizado, receitasPendentes, despesasPendentes, rendaPrevistaTotal, despesaPrevistaTotal, saldoPrevisto, totalAtivos, totalPassivos, patrimonioLiquido, indiceEndividamento, reservaEmergenciaMeses, taxaPoupanca, financialScore, mediaGastosCategoria, historicoPatrimonio };
};

// 2. Evolução Diária (ESSA ESTAVA FALTANDO E CAUSOU O ERRO)
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

// 3. Timeline Anual (Gráfico)
export const calculateAnnualTimeline = (state, anoSelecionado) => {
    const { contas, transacoes, lancamentosFuturos, comprasParceladas } = state;
    const ano = anoSelecionado || new Date().getFullYear();
    const meses = Array.from({ length: 12 }, (_, i) => i);
    const idsCartao = contas.filter(c => isTipoCartao(c.tipo)).map(c => c.id);

    let saldoAcumulado = contas.filter(c => !isTipoCartao(c.tipo)).reduce((acc, c) => acc + c.saldo_inicial, 0);
    const dataCorte = `${ano}-01-01`;
    
    const deltaHist = transacoes.filter(t => t.data < dataCorte && !idsCartao.includes(t.conta_id)).reduce((a, t) => t.tipo === 'receita' ? a+t.valor : a-t.valor, 0);
    const deltaPend = lancamentosFuturos.filter(l => l.status === 'pendente' && l.data_vencimento < dataCorte).reduce((a, l) => {
         const compraPai = l.compra_parcelada_id ? comprasParceladas.find(c => c.id === l.compra_parcelada_id) : null;
         if ((compraPai && idsCartao.includes(compraPai.conta_id)) || (l.conta_id && idsCartao.includes(l.conta_id))) return a;
         return l.tipo === 'a_receber' ? a+l.valor : a-l.valor;
    }, 0);

    saldoAcumulado += (deltaHist + deltaPend);

    return meses.map(mesIndex => {
        const mesStr = `${ano}-${String(mesIndex + 1).padStart(2, '0')}`;
        const rec = transacoes.filter(t => t.data.startsWith(mesStr) && t.tipo === 'receita').reduce((s,t)=>s+t.valor,0) + 
                    lancamentosFuturos.filter(l => l.data_vencimento.startsWith(mesStr) && l.tipo === 'a_receber' && l.status === 'pendente').reduce((s,l)=>s+l.valor,0);
        
        const desp = transacoes.filter(t => t.data.startsWith(mesStr) && t.tipo === 'despesa' && !idsCartao.includes(t.conta_id)).reduce((s,t)=>s+t.valor,0) +
                     lancamentosFuturos.filter(l => l.data_vencimento.startsWith(mesStr) && l.tipo === 'a_pagar' && l.status === 'pendente').reduce((s, l) => {
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

// 4. Tabela Detalhada (Lógica para bater com a planilha)
export const calculateCategoryGrid = (state, anoSelecionado) => {
    const { contas, transacoes, lancamentosFuturos } = state;
    const ano = anoSelecionado || new Date().getFullYear();
    const idsCartao = contas.filter(c => isTipoCartao(c.tipo)).map(c => c.id);
    const idsInvest = contas.filter(c => ['Investimentos', 'Poupança', 'Aplicação'].includes(c.tipo)).map(c => c.id);
    const idsConta = contas.filter(c => !isTipoCartao(c.tipo) && !idsInvest.includes(c.id)).map(c => c.id);

    const dataCorte = `${ano}-01-01`;
    const getSaldoAbertura = (ids) => {
        let saldo = contas.filter(c => ids.includes(c.id)).reduce((a, c) => a + c.saldo_inicial, 0);
        saldo += transacoes.filter(t => t.data < dataCorte && ids.includes(t.conta_id)).reduce((a, t) => t.tipo === 'receita' ? a + t.valor : a - t.valor, 0);
        saldo += lancamentosFuturos.filter(l => l.status === 'pendente' && l.data_vencimento < dataCorte && ids.includes(l.conta_id)).reduce((a, l) => l.tipo === 'a_receber' ? a + l.valor : a - l.valor, 0);
        return saldo;
    };

    let saldoInvest = getSaldoAbertura(idsInvest);
    let saldoCaixa = getSaldoAbertura(idsConta);

    const gridReceitas = {}, gridDespesas = {};
    const arrReceitas = Array(12).fill(0), arrDespesas = Array(12).fill(0);
    const arrInvest = Array(12).fill(0), arrCaixa = Array(12).fill(0), arrLiquido = Array(12).fill(0);

    for (let i = 0; i < 12; i++) {
        const mesStr = `${ano}-${String(i + 1).padStart(2, '0')}`;
        
        // Registra abertura
        arrInvest[i] = saldoInvest;
        arrCaixa[i] = saldoCaixa;

        let recMes = 0, despMes = 0;
        let deltaInvest = 0, deltaCaixa = 0;

        const proc = (val, tipo, contaId, cat) => {
            const c = cat || 'Outros';
            if (tipo === 'receita') {
                recMes += val;
                if (!gridReceitas[c]) gridReceitas[c] = Array(12).fill(0);
                gridReceitas[c][i] += val;
                if (idsInvest.includes(contaId)) deltaInvest += val;
                else if (!idsCartao.includes(contaId)) deltaCaixa += val;
                else if (!contaId) deltaCaixa += val; 
            } else {
                despMes += val;
                if (!gridDespesas[c]) gridDespesas[c] = Array(12).fill(0);
                gridDespesas[c][i] += val;
                if (idsInvest.includes(contaId)) deltaInvest -= val;
                else if (!idsCartao.includes(contaId)) deltaCaixa -= val;
                else if (!contaId) deltaCaixa -= val;
            }
        };

        transacoes.filter(t => t.data.startsWith(mesStr)).forEach(t => proc(t.valor, t.tipo, t.conta_id, t.categoria));
        lancamentosFuturos.filter(l => l.status === 'pendente' && l.data_vencimento.startsWith(mesStr)).forEach(l => {
             const tipo = l.tipo === 'a_receber' ? 'receita' : 'despesa';
             proc(l.valor, tipo, l.conta_id, l.categoria);
        });

        arrReceitas[i] = recMes;
        arrDespesas[i] = despMes;
        // Saldo Liquido = Receitas + Saldo Inv (Inicio) + Saldo Conta (Inicio) - Despesas
        arrLiquido[i] = (recMes + saldoInvest + saldoCaixa) - despMes;

        saldoInvest += deltaInvest;
        saldoCaixa += deltaCaixa;
    }

    return { receitas: gridReceitas, despesas: gridDespesas, totalReceitas: arrReceitas, totalDespesas: arrDespesas, totalInvestimentos: arrInvest, totalSaldosConta: arrCaixa, saldoLiquido: arrLiquido };
};
