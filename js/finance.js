// ARQUIVO: js/finance.js
import { isTipoCartao } from './state.js';

// --- MÉTODOS AUXILIARES ---
const isContaInvestimento = (tipoConta) => {
    if (!tipoConta) return false;
    const tiposInvestimento = ['Investimentos', 'Poupança', 'Aplicação', 'CDB', 'Tesouro', 'Ações', 'Fundos'];
    return tiposInvestimento.some(t => tipoConta.includes(t));
};

// 1. Métricas Principais (Dashboard)
export const calculateFinancialHealthMetrics = (state, mesSelecionado = null) => {
    const { contas, transacoes, lancamentosFuturos } = state;
    const hoje = new Date();
    const mesAtual = mesSelecionado || hoje.toISOString().slice(0, 7);

    let totalAtivos = 0;
    let totalPassivos = 0;
    let totalInvestido = 0;

    // Calcula saldos acumulados
    contas.forEach(conta => {
        const saldoConta = transacoes
            .filter(t => t.conta_id === conta.id)
            .reduce((acc, t) => t.tipo === 'receita' ? acc + t.valor : acc - t.valor, conta.saldo_inicial);

        if (isTipoCartao(conta.tipo)) {
            if (saldoConta < 0) totalPassivos += Math.abs(saldoConta);
        } else {
            if (saldoConta > 0) {
                totalAtivos += saldoConta;
                if (isContaInvestimento(conta.tipo)) totalInvestido += saldoConta;
            }
        }
    });

    // Passivos Futuros do Mês
    totalPassivos += lancamentosFuturos
        .filter(l => l.status === 'pendente' && l.tipo === 'a_pagar' && l.data_vencimento.startsWith(mesAtual))
        .reduce((acc, l) => acc + l.valor, 0);

    const patrimonioLiquido = totalAtivos - totalPassivos;

    // Métricas do Mês
    const transacoesMes = transacoes.filter(t => t.data?.startsWith(mesAtual));
    const rendaRealizada = transacoesMes.filter(t => t.tipo === 'receita').reduce((acc, t) => acc + t.valor, 0);
    const despesaRealizada = transacoesMes.filter(t => t.tipo === 'despesa').reduce((acc, t) => acc + t.valor, 0);

    const receitasPendentes = lancamentosFuturos
        .filter(l => l.status === 'pendente' && l.tipo === 'a_receber' && l.data_vencimento.startsWith(mesAtual))
        .reduce((acc, l) => acc + l.valor, 0);
    const despesasPendentes = lancamentosFuturos
        .filter(l => l.status === 'pendente' && l.tipo === 'a_pagar' && l.data_vencimento.startsWith(mesAtual))
        .reduce((acc, l) => acc + l.valor, 0);

    const rendaPrevistaTotal = rendaRealizada + receitasPendentes;
    const despesaPrevistaTotal = despesaRealizada + despesasPendentes;
    const saldoPrevisto = rendaPrevistaTotal - despesaPrevistaTotal;

    // Scores Simplificados
    const saldoRealizado = rendaRealizada - despesaRealizada;
    const taxaPoupanca = rendaRealizada > 0 ? (saldoRealizado / rendaRealizada) * 100 : 0;
    const financialScore = Math.min(100, Math.max(0, (taxaPoupanca / 20) * 100)); // Lógica simplificada para focar no fluxo

    // Histórico (Simplificado para o gráfico)
    let mesesSet = new Set();
    transacoes.forEach(t => mesesSet.add(t.data.substring(0, 7)));
    const historicoPatrimonio = Array.from(mesesSet).sort().slice(-12).map(mes => {
        return { mes, valor: 0 }; // Placeholder se não for usar o gráfico detalhado agora
    });

    return { 
        rendaRealizada, despesaRealizada, saldoRealizado, 
        receitasPendentes, despesasPendentes, 
        rendaPrevistaTotal, despesaPrevistaTotal, saldoPrevisto, 
        totalAtivos, totalPassivos, patrimonioLiquido, totalInvestido,
        financialScore, historicoPatrimonio 
    };
};

// 2. Tabela de Planejamento (Lógica de Resgate Automático Ajustada)
export const calculateCategoryGrid = (state, anoSelecionado) => {
    const { contas, transacoes, lancamentosFuturos, comprasParceladas } = state;
    const ano = anoSelecionado || new Date().getFullYear();

    // 1. Separação de Contas
    const idsInvest = contas.filter(c => isContaInvestimento(c.tipo)).map(c => c.id);
    const idsCartao = contas.filter(c => isTipoCartao(c.tipo)).map(c => c.id);
    // Caixa = Tudo que NÃO é investimento (inclui Cartão aqui apenas para exclusão da lista de Invest)
    // Mas o saldoCaixaInicial considera apenas contas reais (não crédito)
    const idsContaReal = contas.filter(c => !idsInvest.includes(c.id) && !idsCartao.includes(c.id)).map(c => c.id);

    // 2. Saldos Iniciais
    const dataCorte = `${ano}-01-01`;

    const getSaldoAbertura = (ids) => {
        let saldo = contas.filter(c => ids.includes(c.id)).reduce((a, c) => a + c.saldo_inicial, 0);
        saldo += transacoes.filter(t => t.data < dataCorte && ids.includes(t.conta_id))
            .reduce((a, t) => t.tipo === 'receita' ? a + t.valor : a - t.valor, 0);
        return saldo;
    };

    let saldoInvestAtual = getSaldoAbertura(idsInvest);
    let saldoCaixaAtual = getSaldoAbertura(idsContaReal);

    // Arrays de Retorno
    const gridReceitas = {};
    const gridDespesas = {};
    const arrReceitas = Array(12).fill(0);
    const arrDespesas = Array(12).fill(0);
    
    const arrSaldosInvestimento = Array(12).fill(0);
    const arrSaldosConta = Array(12).fill(0);
    const arrResgates = Array(12).fill(0);
    const arrSaldoLiquido = Array(12).fill(0);

    // 3. Loop Mensal
    for (let i = 0; i < 12; i++) {
        const mesStr = `${ano}-${String(i + 1).padStart(2, '0')}`;
        
        arrSaldosInvestimento[i] = saldoInvestAtual;
        arrSaldosConta[i] = saldoCaixaAtual;

        let recMes = 0;
        let despMes = 0;
        
        // Fluxos do Mês
        let fluxoInvest = 0;
        let fluxoCaixa = 0;

        const processar = (valor, tipo, contaId, cat) => {
            const c = cat || 'Outros';
            const isDestinoInvest = idsInvest.includes(contaId);
            
            // AJUSTE CRÍTICO: 
            // Se NÃO é investimento, consideramos impacto no CAIXA.
            // Isso força o sistema a tratar despesas de cartão como saída de dinheiro da conta corrente
            // simulando o pagamento da fatura naquele mês.
            const isImpactoCaixa = !isDestinoInvest;

            if (tipo === 'receita') {
                recMes += valor;
                if (!gridReceitas[c]) gridReceitas[c] = Array(12).fill(0);
                gridReceitas[c][i] += valor;
                
                if (isDestinoInvest) fluxoInvest += valor;
                else if (isImpactoCaixa) fluxoCaixa += valor;

            } else { // Despesa
                despMes += valor;
                if (!gridDespesas[c]) gridDespesas[c] = Array(12).fill(0);
                gridDespesas[c][i] += valor;

                if (isDestinoInvest) fluxoInvest -= valor;
                else if (isImpactoCaixa) fluxoCaixa -= valor; 
            }
        };

        // Processa Transações
        transacoes.filter(t => t.data.startsWith(mesStr)).forEach(t => processar(t.valor, t.tipo, t.conta_id, t.categoria));
        
        // Processa Futuros
        lancamentosFuturos.filter(l => l.status === 'pendente' && l.data_vencimento.startsWith(mesStr)).forEach(l => {
            let contaAlvo = l.conta_id;
            if (l.compra_parcelada_id) {
                const compra = comprasParceladas.find(c => c.id === l.compra_parcelada_id);
                if (compra) contaAlvo = compra.conta_id;
            }
            const tipo = l.tipo === 'a_receber' ? 'receita' : 'despesa';
            processar(l.valor, tipo, contaAlvo, l.categoria);
        });

        arrReceitas[i] = recMes;
        arrDespesas[i] = despMes;

        // === LÓGICA DE RESGATE (IGUAL A SUA CONTA MANUAL) ===
        
        let caixaPrevisorio = saldoCaixaAtual + fluxoCaixa;
        let investPrevisorio = saldoInvestAtual + fluxoInvest;
        let resgateNecessario = 0;

        // Se faltou dinheiro no caixa (ex: 559 - 3552 = -2993)
        if (caixaPrevisorio < 0) {
            const deficit = Math.abs(caixaPrevisorio); // 2993
            
            if (investPrevisorio >= deficit) {
                // Tira do investimento (5526 - 2993 = 2533)
                resgateNecessario = deficit;
                investPrevisorio -= deficit; 
                caixaPrevisorio = 0; // Caixa fica zerado, dívida paga
            } else {
                resgateNecessario = investPrevisorio;
                caixaPrevisorio += investPrevisorio;
                investPrevisorio = 0;
            }
        }

        arrResgates[i] = resgateNecessario;

        // Atualiza para o próximo mês
        saldoCaixaAtual = caixaPrevisorio;
        saldoInvestAtual = investPrevisorio;

        arrSaldoLiquido[i] = saldoCaixaAtual + saldoInvestAtual;
    }

    return { 
        receitas: gridReceitas, despesas: gridDespesas, 
        totalReceitas: arrReceitas, totalDespesas: arrDespesas, 
        saldosInvestimento: arrSaldosInvestimento, saldosConta: arrSaldosConta, 
        resgates: arrResgates, saldoLiquido: arrSaldoLiquido
    };
};

// Funções dummy para manter compatibilidade se não usadas
export const calculateDailyEvolution = (state, mesISO) => { 
    // ... (Mantenha a lógica original se usar o gráfico diário)
    return []; 
};
export const calculateAnnualTimeline = (state, ano) => { 
    // ... (Mantenha a lógica original se usar o gráfico de barras)
    return []; 
};
