// ARQUIVO: js/finance.js
import { isTipoCartao } from './state.js';

// 1. Métricas Principais + Evolução Longa (Passado + Futuro)
export const calculateFinancialHealthMetrics = (state) => {
    const { contas, transacoes, lancamentosFuturos, comprasParceladas } = state;
    const hoje = new Date();
    const mesAtual = hoje.toISOString().slice(0, 7);

    // --- A. PATRIMÔNIO ATUAL ---
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

    // --- B. INDICADORES DO MÊS ---
    const transacoesMes = transacoes.filter(t => t.data?.startsWith(mesAtual));
    const rendaRealizada = transacoesMes.filter(t => t.tipo === 'receita').reduce((acc, t) => acc + t.valor, 0);
    const despesaRealizada = transacoesMes.filter(t => t.tipo === 'despesa').reduce((acc, t) => acc + t.valor, 0);

    const receitasPendentes = lancamentosFuturos.filter(l => l.status === 'pendente' && l.tipo === 'a_receber' && l.data_vencimento.startsWith(mesAtual)).reduce((acc, l) => acc + l.valor, 0);
    const despesasPendentes = lancamentosFuturos.filter(l => l.status === 'pendente' && l.tipo === 'a_pagar' && l.data_vencimento.startsWith(mesAtual)).reduce((acc, l) => acc + l.valor, 0);

    const rendaPrevistaTotal = rendaRealizada + receitasPendentes;
    const despesaPrevistaTotal = despesaRealizada + despesasPendentes;
    const saldoPrevisto = rendaPrevistaTotal - despesaPrevistaTotal;

    // Scores
    const saldoRealizado = rendaRealizada - despesaRealizada;
    const taxaPoupanca = rendaRealizada > 0 ? (saldoRealizado / rendaRealizada) * 100 : 0;
    const indiceEndividamento = totalAtivos > 0 ? (totalPassivos / totalAtivos) * 100 : 0;
    const scorePoupanca = Math.min(100, Math.max(0, (taxaPoupanca / 20) * 100));
    const scoreEndividamento = Math.min(100, Math.max(0, (1 - (indiceEndividamento / 50)) * 100));
    const financialScore = (scorePoupanca * 0.5) + (scoreEndividamento * 0.5);

    // --- C. EVOLUÇÃO PATRIMONIAL LONGA (Histórico + Projeção) ---
    // 1. Histórico (Passado)
    let mesesSet = new Set();
    transacoes.forEach(t => mesesSet.add(t.data.substring(0, 7)));
    let historico = Array.from(mesesSet).sort().slice(-12).map(mes => {
        const trsAteMes = transacoes.filter(t => t.data.substring(0,7) <= mes);
        let val = 0;
        contas.forEach(c => {
            // Ignora cartões no saldo patrimonial histórico para simplificar fluxo
            if (!isTipoCartao(c.tipo)) {
                val += trsAteMes.filter(t => t.conta_id === c.id).reduce((acc, t) => t.tipo === 'receita' ? acc + t.valor : acc - t.valor, c.saldo_inicial);
            }
        });
        return { mes, valor: val, tipo: 'realizado' };
    });

    // 2. Projeção (Próximos 12 meses)
    let saldoProjetado = historico.length > 0 ? historico[historico.length - 1].valor : patrimonioLiquido;
    const idsCartao = contas.filter(c => isTipoCartao(c.tipo)).map(c => c.id);
    
    const projecao = [];
    for (let i = 1; i <= 12; i++) {
        const d = new Date();
        d.setMonth(d.getMonth() + i);
        const mesStr = d.toISOString().slice(0, 7);
        
        // Calcula delta do mês futuro
        const rec = lancamentosFuturos.filter(l => l.status === 'pendente' && l.tipo === 'a_receber' && l.data_vencimento.startsWith(mesStr)).reduce((s, l) => s + l.valor, 0);
        
        // Despesa futura (exclui parcelas internas de cartão para não duplicar se ja abateu saldo)
        // Aqui simplificamos: tudo que é 'a_pagar' reduz o patrimônio
        const desp = lancamentosFuturos.filter(l => l.status === 'pendente' && l.tipo === 'a_pagar' && l.data_vencimento.startsWith(mesStr))
            .reduce((s, l) => {
                const compraPai = l.compra_parcelada_id ? comprasParceladas.find(c => c.id === l.compra_parcelada_id) : null;
                if ((compraPai && idsCartao.includes(compraPai.conta_id)) || (l.conta_id && idsCartao.includes(l.conta_id))) return s; 
                return s + l.valor;
            }, 0);

        saldoProjetado = saldoProjetado + rec - desp;
        projecao.push({ mes: mesStr, valor: saldoProjetado, tipo: 'previsto' });
    }

    const evolucaoCombinada = [...historico, ...projecao];

    // Dados de Categoria (Apenas realizado para precisão)
    let gastosPorCategoria = {};
    transacoes.filter(t => t.tipo === 'despesa').forEach(t => gastosPorCategoria[t.categoria] = (gastosPorCategoria[t.categoria] || 0) + t.valor);
    const mediaGastosCategoria = Object.entries(gastosPorCategoria).map(([k,v]) => ({categoria: k, media: v / (mesesSet.size||1)})).sort((a,b) => b.media - a.media);

    return {
        rendaPrevistaTotal, despesaPrevistaTotal, saldoPrevisto, rendaRealizada, despesaRealizada,
        totalAtivos, totalPassivos, patrimonioLiquido, financialScore,
        mediaGastosCategoria, 
        historicoPatrimonio: evolucaoCombinada // Agora contem passado E futuro
    };
};

// 2. Planejamento Anual (Mesma lógica robusta anterior)
export const calculateAnnualTimeline = (state, anoSelecionado) => {
    const { contas, transacoes, lancamentosFuturos, comprasParceladas } = state;
    const ano = anoSelecionado || new Date().getFullYear();
    const meses = Array.from({ length: 12 }, (_, i) => i); 
    const idsCartao = contas.filter(c => isTipoCartao(c.tipo)).map(c => c.id);

    const saldoInicialContas = contas.filter(c => !isTipoCartao(c.tipo)).reduce((acc, c) => acc + c.saldo_inicial, 0);
    const dataCorte = `${ano}-01-01`;
    
    const histReal = transacoes.filter(t => t.data < dataCorte).reduce((acc, t) => {
        if (idsCartao.includes(t.conta_id)) return acc; 
        return t.tipo === 'receita' ? acc + t.valor : acc - t.valor;
    }, 0);
    
    const histPend = lancamentosFuturos.filter(l => l.status === 'pendente' && l.data_vencimento < dataCorte).reduce((acc, l) => {
        const compraPai = l.compra_parcelada_id ? comprasParceladas.find(c => c.id === l.compra_parcelada_id) : null;
        if ((compraPai && idsCartao.includes(compraPai.conta_id)) || (l.conta_id && idsCartao.includes(l.conta_id))) return acc;
        return l.tipo === 'a_receber' ? acc + l.valor : acc - l.valor;
    }, 0);

    let saldoAcumulado = saldoInicialContas + histReal + histPend;

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

        saldoAcumulado += (rec - desp);

        return {
            mes: new Date(ano, mesIndex).toLocaleString('pt-BR', { month: 'long' }),
            receitas: rec, despesas: desp, cartoes, saldo: rec - desp, acumulado: saldoAcumulado
        };
    });
};

// 3. Tabela Detalhada
export const calculateCategoryGrid = (state, anoSelecionado) => {
    // (Mesma lógica do finance.js anterior - mantida para brevidade pois funciona bem com a correção do saldo inicial acima)
    const { contas, transacoes, lancamentosFuturos, comprasParceladas } = state;
    const ano = anoSelecionado || new Date().getFullYear();
    const gridReceitas = {}, gridDespesas = {}, totaisMensais = Array(12).fill(0);
    const idsCartao = contas.filter(c => isTipoCartao(c.tipo)).map(c => c.id);

    // Saldo Inicial
    const saldoInicialContas = contas.filter(c => !isTipoCartao(c.tipo)).reduce((acc, c) => acc + c.saldo_inicial, 0);
    const dataCorte = `${ano}-01-01`;
    const histReal = transacoes.filter(t => t.data < dataCorte && !idsCartao.includes(t.conta_id)).reduce((acc, t) => t.tipo === 'receita' ? acc + t.valor : acc - t.valor, 0);
    const histPend = lancamentosFuturos.filter(l => l.status === 'pendente' && l.data_vencimento < dataCorte).reduce((acc, l) => {
        const compraPai = l.compra_parcelada_id ? comprasParceladas.find(c => c.id === l.compra_parcelada_id) : null;
        if ((compraPai && idsCartao.includes(compraPai.conta_id)) || (l.conta_id && idsCartao.includes(l.conta_id))) return acc;
        return l.tipo === 'a_receber' ? acc + l.valor : acc - l.valor;
    }, 0);
    
    let saldoCorrente = saldoInicialContas + histReal + histPend;
    const acumulados = [];

    const add = (tipo, cat, mes, val) => {
        const target = (tipo === 'receita' || tipo === 'a_receber') ? gridReceitas : gridDespesas;
        const catNome = cat || 'Outros';
        if (!target[catNome]) target[catNome] = Array(12).fill(0);
        target[catNome][mes] += val;
        if (tipo === 'receita' || tipo === 'a_receber') totaisMensais[mes] += val; else totaisMensais[mes] -= val;
    };

    transacoes.forEach(t => { if (t.data.startsWith(`${ano}-`) && !idsCartao.includes(t.conta_id)) add(t.tipo, t.categoria, parseInt(t.data.split('-')[1]) - 1, t.valor); });
    lancamentosFuturos.forEach(l => { 
        if (l.status === 'pendente' && l.data_vencimento.startsWith(`${ano}-`)) {
            const compraPai = l.compra_parcelada_id ? comprasParceladas.find(c => c.id === l.compra_parcelada_id) : null;
            if ((compraPai && idsCartao.includes(compraPai.conta_id)) || (l.conta_id && idsCartao.includes(l.conta_id))) return;
            const tipo = l.tipo === 'a_receber' ? 'receita' : 'despesa';
            add(tipo, l.categoria, parseInt(l.data_vencimento.split('-')[1]) - 1, l.valor);
        }
    });

    for(let i=0; i<12; i++) { saldoCorrente += totaisMensais[i]; acumulados.push(saldoCorrente); }
    return { receitas: gridReceitas, despesas: gridDespesas, saldos: totaisMensais, acumulados };
};
