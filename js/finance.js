// ARQUIVO: js/finance.js
import { isTipoCartao } from './state.js';

// 1. Métricas Principais (Dashboard)
export const calculateFinancialHealthMetrics = (state) => {
    const { contas, transacoes, lancamentosFuturos } = state;
    const mesAtual = new Date().toISOString().slice(0, 7);

    let totalAtivos = 0, totalPassivos = 0;

    contas.forEach(conta => {
        const saldo = transacoes.filter(t => t.conta_id === conta.id).reduce((acc, t) => t.tipo === 'receita' ? acc + t.valor : acc - t.valor, conta.saldo_inicial);
        if (!isTipoCartao(conta.tipo)) totalAtivos += saldo > 0 ? saldo : 0;
        else if (saldo < 0) totalPassivos += Math.abs(saldo);
    });

    totalPassivos += lancamentosFuturos.filter(l => l.status === 'pendente' && l.tipo === 'a_pagar').reduce((acc, l) => acc + l.valor, 0);
    const patrimonioLiquido = totalAtivos - totalPassivos;

    // Métricas Mês
    const transacoesMes = transacoes.filter(t => t.data?.startsWith(mesAtual));
    const rendaRealizada = transacoesMes.filter(t => t.tipo === 'receita').reduce((a, t) => a + t.valor, 0);
    const despesaRealizada = transacoesMes.filter(t => t.tipo === 'despesa').reduce((a, t) => a + t.valor, 0);
    const receitasPendentes = lancamentosFuturos.filter(l => l.status === 'pendente' && l.tipo === 'a_receber' && l.data_vencimento.startsWith(mesAtual)).reduce((a, l) => a + l.valor, 0);
    const despesasPendentes = lancamentosFuturos.filter(l => l.status === 'pendente' && l.tipo === 'a_pagar' && l.data_vencimento.startsWith(mesAtual)).reduce((a, l) => a + l.valor, 0);

    const rendaPrevistaTotal = rendaRealizada + receitasPendentes;
    const despesaPrevistaTotal = despesaRealizada + despesasPendentes;
    const saldoPrevisto = rendaPrevistaTotal - despesaPrevistaTotal;

    // Indicadores e Gráficos Históricos
    const despesasFixas = transacoesMes.filter(t => t.tipo === 'despesa' && ['Moradia','Contas','Educação'].includes(t.categoria)).reduce((a, t) => a + t.valor, 0);
    const reservaEmergenciaMeses = despesasFixas > 0 ? (totalAtivos / despesasFixas) : 99;
    const saldoRealizado = rendaRealizada - despesaRealizada;
    const taxaPoupanca = rendaRealizada > 0 ? (saldoRealizado / rendaRealizada) * 100 : 0;
    const financialScore = 80; // Placeholder simples para score

    let meses = new Set();
    transacoes.forEach(t => meses.add(t.data.substring(0, 7)));
    const historicoPatrimonio = Array.from(meses).sort().slice(-12).map(mes => {
        const trs = transacoes.filter(t => t.data.substring(0,7) <= mes);
        let val = 0;
        contas.forEach(c => {
            const s = trs.filter(t => t.conta_id === c.id).reduce((a, t) => t.tipo === 'receita' ? a + t.valor : a - t.valor, c.saldo_inicial);
            if(!isTipoCartao(c.tipo)) val += s; else if(s<0) val -= Math.abs(s);
        });
        return { mes, valor: val };
    });
    
    // Categorias
    let gastosPorCategoria = {};
    transacoes.filter(t => t.tipo === 'despesa').forEach(t => gastosPorCategoria[t.categoria] = (gastosPorCategoria[t.categoria] || 0) + t.valor);
    const mediaGastosCategoria = Object.entries(gastosPorCategoria).map(([k,v]) => ({categoria: k, media: v / (meses.size||1)})).sort((a,b) => b.media - a.media);

    return { rendaRealizada, despesaRealizada, saldoRealizado, receitasPendentes, despesasPendentes, rendaPrevistaTotal, despesaPrevistaTotal, saldoPrevisto, totalAtivos, totalPassivos, patrimonioLiquido, reservaEmergenciaMeses, taxaPoupanca, financialScore, mediaGastosCategoria, historicoPatrimonio };
};

// 2. Timeline Anual (Gráfico)
export const calculateAnnualTimeline = (state, anoSelecionado) => {
    const grid = calculateCategoryGrid(state, anoSelecionado);
    const meses = Array.from({ length: 12 }, (_, i) => i);
    const ano = anoSelecionado || new Date().getFullYear();

    return meses.map(i => ({
        mes: new Date(ano, i).toLocaleString('pt-BR', { month: 'long' }),
        receitas: grid.totalReceitas[i],
        despesas: grid.totalDespesas[i],
        acumulado: grid.saldoLiquido[i] // Usa o saldo líquido calculado na tabela
    }));
};

// 3. Tabela Detalhada (Lógica Exata da Imagem)
export const calculateCategoryGrid = (state, anoSelecionado) => {
    const { contas, transacoes, lancamentosFuturos } = state;
    const ano = anoSelecionado || new Date().getFullYear();

    // 1. Separar Contas por Grupo
    const idsInvest = contas.filter(c => ['Investimentos', 'Poupança', 'Aplicação'].includes(c.tipo)).map(c => c.id);
    const idsCartao = contas.filter(c => isTipoCartao(c.tipo)).map(c => c.id);
    // Contas de "Caixa" são todas que não são cartão nem investimento
    const idsCaixa = contas.filter(c => !idsCartao.includes(c.id) && !idsInvest.includes(c.id)).map(c => c.id);

    // 2. Calcular Saldos de Abertura (Até 31/Dez do ano anterior)
    const dataCorte = `${ano}-01-01`;

    const getSaldoAbertura = (ids) => {
        let saldo = contas.filter(c => ids.includes(c.id)).reduce((a, c) => a + c.saldo_inicial, 0);
        // Soma histórico realizado
        saldo += transacoes.filter(t => t.data < dataCorte && ids.includes(t.conta_id))
            .reduce((a, t) => t.tipo === 'receita' ? a + t.valor : a - t.valor, 0);
        // Soma histórico pendente (opcional, mas bom para precisão)
        saldo += lancamentosFuturos.filter(l => l.status === 'pendente' && l.data_vencimento < dataCorte && ids.includes(l.conta_id))
            .reduce((a, l) => l.tipo === 'a_receber' ? a + l.valor : a - l.valor, 0);
        return saldo;
    };

    let saldoInvestAtual = getSaldoAbertura(idsInvest);
    let saldoCaixaAtual = getSaldoAbertura(idsCaixa);

    // 3. Arrays de Resultados
    const gridReceitas = {};
    const gridDespesas = {};
    
    const arrReceitas = Array(12).fill(0);
    const arrDespesas = Array(12).fill(0);
    const arrSaldoInvestAbertura = Array(12).fill(0);
    const arrSaldoCaixaAbertura = Array(12).fill(0);
    const arrSaldoLiquidoFinal = Array(12).fill(0);

    // 4. Loop Mês a Mês
    for (let i = 0; i < 12; i++) {
        const mesStr = `${ano}-${String(i + 1).padStart(2, '0')}`;
        
        // Registra o saldo de ABERTURA do mês (antes das movimentações)
        arrSaldoInvestAbertura[i] = saldoInvestAtual;
        arrSaldoCaixaAbertura[i] = saldoCaixaAtual;

        // -- Calcular Movimentações do Mês --
        let recMes = 0;
        let despMes = 0;
        let deltaInvest = 0; // Variação específica de investimento
        let deltaCaixa = 0;  // Variação específica de caixa

        // Função Helper para processar item
        const processItem = (item, valor, tipo) => {
            const cat = item.categoria || 'Outros';
            
            if (tipo === 'receita') {
                recMes += valor;
                if (!gridReceitas[cat]) gridReceitas[cat] = Array(12).fill(0);
                gridReceitas[cat][i] += valor;
                
                // Onde entrou o dinheiro?
                if (idsInvest.includes(item.conta_id)) deltaInvest += valor;
                else if (!idsCartao.includes(item.conta_id)) deltaCaixa += valor; 
                // Se não tem conta definida (previsão genérica), assume caixa
                else if (!item.conta_id) deltaCaixa += valor;

            } else { // Despesa
                despMes += valor;
                if (!gridDespesas[cat]) gridDespesas[cat] = Array(12).fill(0);
                gridDespesas[cat][i] += valor;

                // De onde saiu o dinheiro?
                if (idsInvest.includes(item.conta_id)) deltaInvest -= valor;
                // Cartão não sai do caixa agora, mas entra na DESPESA TOTAL do demonstrativo
                else if (!idsCartao.includes(item.conta_id)) deltaCaixa -= valor;
                else if (!item.conta_id) deltaCaixa -= valor;
            }
        };

        // Processa Realizado
        transacoes.filter(t => t.data.startsWith(mesStr)).forEach(t => processItem(t, t.valor, t.tipo));
        
        // Processa Previsto
        lancamentosFuturos.filter(l => l.status === 'pendente' && l.data_vencimento.startsWith(mesStr)).forEach(l => {
             const tipo = l.tipo === 'a_receber' ? 'receita' : 'despesa';
             processItem(l, l.valor, tipo);
        });

        arrReceitas[i] = recMes;
        arrDespesas[i] = despMes;

        // -- Cálculo do Saldo Líquido Final (Fórmula do Usuário) --
        // Saldo Liquido = Receitas + Saldo Inv + Saldo Conta - Despesas
        // Nota: O "Saldo Inv" e "Saldo Conta" aqui são os de ABERTURA
        const saldoFinalCalculado = (recMes + arrSaldoInvestAbertura[i] + arrSaldoCaixaAbertura[i]) - despMes;
        arrSaldoLiquidoFinal[i] = saldoFinalCalculado;

        // -- Atualiza Saldos para o próximo mês (Fechamento) --
        // A lógica de atualização real dos saldos deve considerar apenas o fluxo de caixa efetivo
        // (Ex: Gasto de cartão não reduz saldo de caixa, mas entra na linha Despesas da tabela visual)
        // Por isso usamos deltaInvest e deltaCaixa calculados acima, que ignoram cartão.
        saldoInvestAtual += deltaInvest;
        saldoCaixaAtual += deltaCaixa;
    }

    return {
        receitas: gridReceitas,
        despesas: gridDespesas,
        totalReceitas: arrReceitas,
        totalDespesas: arrDespesas,
        saldosInvestimento: arrSaldoInvestAbertura,
        saldosConta: arrSaldoCaixaAbertura,
        saldoLiquido: arrSaldoLiquidoFinal
    };
};
