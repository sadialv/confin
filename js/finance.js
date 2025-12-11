// ARQUIVO: js/finance.js
import { isTipoCartao } from './state.js';

// 1. Métricas Principais (Dashboard, Saúde Financeira)
export const calculateFinancialHealthMetrics = (state) => {
    const { contas, transacoes, lancamentosFuturos } = state;
    const mesAtual = new Date().toISOString().slice(0, 7);

    let totalAtivos = 0;
    let totalPassivos = 0;

    // Calcula Patrimônio Atual (Saldo das Contas + Histórico)
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

    // Dados Históricos
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
            if (!isTipoCartao(c.tipo)) ativos += saldo > 0 ? saldo : 0;
            else if (saldo < 0) passivos += Math.abs(saldo);
        });
        return { mes, valor: ativos - passivos };
    });

    return {
        rendaRealizada, despesaRealizada, saldoRealizado,
        receitasPendentes, despesasPendentes, rendaPrevistaTotal, despesaPrevistaTotal, saldoPrevisto,
        totalAtivos, totalPassivos, patrimonioLiquido,
        indiceEndividamento, reservaEmergenciaMeses, taxaPoupanca, financialScore,
        mediaGastosCategoria, historicoPatrimonio
    };
};

// 2. Evolução Diária (Dashboard)
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
    // Reutiliza o grid detalhado para garantir consistência
    const grid = calculateCategoryGrid(state, anoSelecionado);
    const meses = Array.from({ length: 12 }, (_, i) => i); 
    const ano = anoSelecionado || new Date().getFullYear();

    return meses.map(i => ({
        mes: new Date(ano, i).toLocaleString('pt-BR', { month: 'long' }),
        receitas: grid.totalReceitas[i],
        despesas: grid.totalDespesas[i],
        saldo: grid.totalReceitas[i] - grid.totalDespesas[i],
        acumulado: grid.saldoLiquido[i] // Usa o saldo líquido final calculado na tabela
    }));
};

// 4. Tabela Detalhada (Lógica Complexa de Saldo)
export const calculateCategoryGrid = (state, anoSelecionado) => {
    const { contas, transacoes, lancamentosFuturos, comprasParceladas } = state;
    const ano = anoSelecionado || new Date().getFullYear();
    
    // --- SEPARAÇÃO DE CONTAS ---
    const idsInvest = contas.filter(c => ['Investimentos', 'Poupança', 'Aplicação'].includes(c.tipo)).map(c => c.id);
    const idsCartao = contas.filter(c => isTipoCartao(c.tipo)).map(c => c.id);
    // Caixa = Tudo que não é cartão nem investimento
    const idsCaixa = contas.filter(c => !idsCartao.includes(c.id) && !idsInvest.includes(c.id)).map(c => c.id);

    // --- CÁLCULO DE SALDOS INICIAIS (HISTÓRICO ATÉ 31/DEZ ANTERIOR) ---
    const dataCorte = `${ano}-01-01`;

    const getSaldoHistorico = (idsGrupo) => {
        // 1. Saldo Inicial do Cadastro
        let saldo = contas.filter(c => idsGrupo.includes(c.id)).reduce((a, c) => a + c.saldo_inicial, 0);
        
        // 2. Transações Realizadas Anteriores
        saldo += transacoes
            .filter(t => t.data < dataCorte && idsGrupo.includes(t.conta_id))
            .reduce((a, t) => t.tipo === 'receita' ? a + t.valor : a - t.valor, 0);

        // 3. Pendências Anteriores (Opcional, mas mantém consistência do planejado)
        saldo += lancamentosFuturos
            .filter(l => l.status === 'pendente' && l.data_vencimento < dataCorte && idsGrupo.includes(l.conta_id))
            .reduce((a, l) => l.tipo === 'a_receber' ? a + l.valor : a - l.valor, 0);
            
        return saldo;
    };

    let saldoInvestAtual = getSaldoHistorico(idsInvest);
    let saldoCaixaAtual = getSaldoHistorico(idsCaixa);

    // --- ESTRUTURAS DE DADOS ---
    const gridReceitas = {};
    const gridDespesas = {};
    const arrReceitas = Array(12).fill(0);
    const arrDespesas = Array(12).fill(0);
    const arrInvest = Array(12).fill(0);
    const arrCaixa = Array(12).fill(0);
    const arrLiquido = Array(12).fill(0); // Este será o "Saldo Líquido" final da tabela

    // --- LOOP MÊS A MÊS ---
    for (let i = 0; i < 12; i++) {
        const mesStr = `${ano}-${String(i + 1).padStart(2, '0')}`;
        
        // Armazena saldo de abertura para exibição
        arrInvest[i] = saldoInvestAtual;
        arrCaixa[i] = saldoCaixaAtual;

        let recMes = 0;
        let despMes = 0;
        
        // Deltas para atualizar o saldo para o próximo mês
        let deltaInvest = 0;
        let deltaCaixa = 0;

        const processarItem = (item, valor, tipo) => {
            const cat = item.categoria || 'Outros';
            const contaId = item.conta_id;
            
            // Verifica a qual grupo pertence a movimentação para atualizar saldo
            const isInvest = idsInvest.includes(contaId);
            const isCaixa = idsCaixa.includes(contaId) || (!contaId && !isInvest); // Sem conta = Caixa (Padrão)

            if (tipo === 'receita') {
                recMes += valor;
                if (!gridReceitas[cat]) gridReceitas[cat] = Array(12).fill(0);
                gridReceitas[cat][i] += valor;
                
                if (isInvest) deltaInvest += valor;
                if (isCaixa) deltaCaixa += valor;

            } else { // despesa
                despMes += valor;
                if (!gridDespesas[cat]) gridDespesas[cat] = Array(12).fill(0);
                gridDespesas[cat][i] += valor;

                if (isInvest) deltaInvest -= valor;
                if (isCaixa) deltaCaixa -= valor;
                // Se for cartão, não afeta deltaCaixa nem deltaInvest agora (afeta só Despesa Total)
            }
        };

        // 1. Processa Realizado
        transacoes.filter(t => t.data.startsWith(mesStr)).forEach(t => processarItem(t, t.valor, t.tipo));
        
        // 2. Processa Previsto
        lancamentosFuturos.filter(l => l.status === 'pendente' && l.data_vencimento.startsWith(mesStr)).forEach(l => {
            // Verifica se é parcela de cartão (para não duplicar se já lançou fatura, mas aqui assumimos fluxo simples)
            const compraPai = l.compra_parcelada_id ? comprasParceladas.find(c => c.id === l.compra_parcelada_id) : null;
            // Se for cartão, entra na despesa visual, mas não no deltaCaixa (já tratado no processarItem)
            
            const tipo = l.tipo === 'a_receber' ? 'receita' : 'despesa';
            processarItem(l, l.valor, tipo);
        });

        // Totais do mês
        arrReceitas[i] = recMes;
        arrDespesas[i] = despMes;

        // FÓRMULA FINAL SOLICITADA:
        // Saldo Liquido = Receitas + Saldo Inv + Saldo Conta - Despesas
        // (Nota: Usamos os saldos de abertura do mês + receitas do mês - despesas totais do mês)
        arrLiquido[i] = (recMes + saldoInvestAtual + saldoCaixaAtual) - despMes;

        // Atualiza saldos para o próximo loop
        saldoInvestAtual += deltaInvest;
        saldoCaixaAtual += deltaCaixa;
    }

    return { 
        receitas: gridReceitas, 
        despesas: gridDespesas, 
        totalReceitas: arrReceitas, 
        totalDespesas: arrDespesas, 
        totalInvestimentos: arrInvest, 
        totalSaldosConta: arrCaixa, 
        saldoLiquido: arrLiquido 
    };
};
