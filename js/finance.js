// ARQUIVO: js/finance.js
import { isTipoCartao } from './state.js';

// 1. Métricas Principais
export const calculateFinancialHealthMetrics = (state) => {
    // ... (MANTENHA O CÓDIGO IGUAL AO DA RESPOSTA ANTERIOR) ...
    // Para economizar espaço, não vou repetir esta função pois ela não mudou.
    // Se precisar dela completa novamente, avise.
    // O foco da mudança é na calculateCategoryGrid abaixo.
    
    // Vou incluir um placeholder para não quebrar seu copy-paste, 
    // mas o ideal é manter a versão completa que você já tem desta função.
    const { contas, transacoes, lancamentosFuturos } = state;
    const mesAtual = new Date().toISOString().slice(0, 7);
    let totalAtivos = 0, totalPassivos = 0;
    contas.forEach(c => {
        const s = transacoes.filter(t => t.conta_id === c.id).reduce((a, t) => t.tipo === 'receita' ? a + t.valor : a - t.valor, c.saldo_inicial);
        if(!isTipoCartao(c.tipo)) totalAtivos += s>0?s:0; else if(s<0) totalPassivos+=Math.abs(s);
    });
    totalPassivos += lancamentosFuturos.filter(l => l.status==='pendente' && l.tipo==='a_pagar').reduce((a,l)=>a+l.valor,0);
    const pl = totalAtivos - totalPassivos;
    // ... (retorne o objeto completo como antes)
    return { totalAtivos, totalPassivos, patrimonioLiquido: pl, rendaPrevistaTotal: 0, despesaPrevistaTotal: 0, saldoPrevisto: 0, rendaRealizada: 0, despesaRealizada: 0, historicoPatrimonio: [], mediaGastosCategoria: [], financialScore: 0 };
};

// 2. Planejamento Anual (Gráfico)
export const calculateAnnualTimeline = (state, anoSelecionado) => {
    // ... (MANTENHA IGUAL AO DA RESPOSTA ANTERIOR) ...
    // Esta função alimenta o gráfico e não precisa mudar para a tabela.
    const { contas, transacoes, lancamentosFuturos, comprasParceladas } = state;
    const ano = anoSelecionado || new Date().getFullYear();
    const meses = Array.from({ length: 12 }, (_, i) => i); 
    const idsCartao = contas.filter(c => isTipoCartao(c.tipo)).map(c => c.id);
    let saldoAcumulado = contas.filter(c => !isTipoCartao(c.tipo)).reduce((acc, c) => acc + c.saldo_inicial, 0);
    const dataCorte = `${ano}-01-01`;
    
    const deltaHist = transacoes.filter(t => t.data < dataCorte).reduce((acc, t) => {
        if (idsCartao.includes(t.conta_id)) return acc;
        return t.tipo === 'receita' ? acc + t.valor : acc - t.valor;
    }, 0);
    
    const deltaPend = lancamentosFuturos.filter(l => l.status === 'pendente' && l.data_vencimento < dataCorte).reduce((acc, l) => {
         const compraPai = l.compra_parcelada_id ? comprasParceladas.find(c => c.id === l.compra_parcelada_id) : null;
         if ((compraPai && idsCartao.includes(compraPai.conta_id)) || (l.conta_id && idsCartao.includes(l.conta_id))) return acc;
         return l.tipo === 'a_receber' ? acc + l.valor : acc - l.valor;
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
        saldoAcumulado += (rec - desp);
        return { mes: mesStr, receitas: rec, despesas: desp, acumulado: saldoAcumulado };
    });
};

// 3. Tabela Detalhada (ATUALIZADA)
export const calculateCategoryGrid = (state, anoSelecionado) => {
    const timeline = calculateAnnualTimeline(state, anoSelecionado);
    // Extrai o acumulado calculado corretamente na timeline
    const acumulados = timeline.map(t => t.acumulado);

    const { transacoes, lancamentosFuturos } = state;
    const ano = anoSelecionado || new Date().getFullYear();
    
    const gridReceitas = {};
    const gridDespesas = {};
    
    // Arrays para guardar as SOMAS mensais
    const totaisReceitas = Array(12).fill(0);
    const totaisDespesas = Array(12).fill(0);
    const totaisLiquido = Array(12).fill(0);

    const add = (tipo, cat, mes, val) => {
        const isRec = (tipo === 'receita' || tipo === 'a_receber');
        const target = isRec ? gridReceitas : gridDespesas;
        const catNome = cat || 'Outros';
        
        if (!target[catNome]) target[catNome] = Array(12).fill(0);
        target[catNome][mes] += val;
        
        if (isRec) {
            totaisReceitas[mes] += val;
            totaisLiquido[mes] += val;
        } else {
            totaisDespesas[mes] += val;
            totaisLiquido[mes] -= val;
        }
    };

    transacoes.forEach(t => {
        if (t.data.startsWith(`${ano}-`)) add(t.tipo, t.categoria, parseInt(t.data.split('-')[1]) - 1, t.valor);
    });
    lancamentosFuturos.forEach(l => {
        if (l.status === 'pendente' && l.data_vencimento.startsWith(`${ano}-`)) {
            const tipo = l.tipo === 'a_receber' ? 'receita' : 'despesa';
            add(tipo, l.categoria, parseInt(l.data_vencimento.split('-')[1]) - 1, l.valor);
        }
    });

    return { 
        receitas: gridReceitas, 
        despesas: gridDespesas, 
        totalReceitas: totaisReceitas, // Novo
        totalDespesas: totaisDespesas, // Novo
        saldoMensal: totaisLiquido,    // Fluxo do mês
        saldoAcumulado: acumulados     // Saldo em conta
    };
};
