// ARQUIVO: js/finance.js
import { isTipoCartao } from './state.js';

// --- MÉTODOS AUXILIARES ---

// Verifica se uma conta é considerada "Investimento" baseada no Tipo
const isContaInvestimento = (tipoConta) => {
    if (!tipoConta) return false;
    const tiposInvestimento = ['Investimentos', 'Poupança', 'Aplicação', 'CDB', 'Tesouro', 'Ações', 'Fundos'];
    return tiposInvestimento.some(t => tipoConta.includes(t));
};

// 1. Métricas Principais (Dashboard, Saúde Financeira)
export const calculateFinancialHealthMetrics = (state, mesSelecionado = null) => {
    const { contas, transacoes, lancamentosFuturos } = state;
    
    // Se nenhum mês for passado, usa o mês atual
    const hoje = new Date();
    const mesAtual = mesSelecionado || hoje.toISOString().slice(0, 7);

    let totalAtivos = 0;
    let totalPassivos = 0;
    let totalInvestido = 0;

    // 1. Calcula Saldos Atuais das Contas (Ativos/Passivos acumulados até hoje)
    contas.forEach(conta => {
        const saldoConta = transacoes
            .filter(t => t.conta_id === conta.id)
            .reduce((acc, t) => t.tipo === 'receita' ? acc + t.valor : acc - t.valor, conta.saldo_inicial);

        if (isTipoCartao(conta.tipo)) {
            // Cartão: Se saldo negativo (deve), é passivo. Se positivo (crédito), ignora ou abate.
            if (saldoConta < 0) totalPassivos += Math.abs(saldoConta);
        } else {
            // Contas Normais e Investimentos
            if (saldoConta > 0) {
                totalAtivos += saldoConta;
                if (isContaInvestimento(conta.tipo)) {
                    totalInvestido += saldoConta;
                }
            }
        }
    });

    // 2. Adiciona Dívidas Futuras Imediatas (Passivos Pendentes)
    totalPassivos += lancamentosFuturos
        .filter(l => l.status === 'pendente' && l.tipo === 'a_pagar')
        .reduce((acc, l) => acc + l.valor, 0);

    const patrimonioLiquido = totalAtivos - totalPassivos;

    // 3. Métricas do Mês (Fluxo de Caixa)
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

    // 4. Indicadores de Saúde (Scores)
    const catsFixas = ['Moradia', 'Contas', 'Educação', 'Saúde', 'Transporte', 'Aluguel', 'Condomínio'];
    const despesasFixas = transacoesMes
        .filter(t => t.tipo === 'despesa' && catsFixas.includes(t.categoria))
        .reduce((acc, t) => acc + t.valor, 0);

    const indiceEndividamento = totalAtivos > 0 ? (totalPassivos / totalAtivos) * 100 : 0;
    // Reserva de emergência: Quantos meses eu sobrevivo com meu saldo atual?
    const reservaEmergenciaMeses = despesasFixas > 0 ? (totalAtivos / despesasFixas) : (totalAtivos > 0 ? 12 : 0);
    
    const saldoRealizado = rendaRealizada - despesaRealizada;
    const taxaPoupanca = rendaRealizada > 0 ? (saldoRealizado / rendaRealizada) * 100 : 0;

    // Algoritmo de Score (0 a 100)
    // - Poupou 20% da renda? Ganha até 50 pontos.
    // - Dívida é 0? Ganha até 50 pontos.
    const scorePoupanca = Math.min(100, Math.max(0, (taxaPoupanca / 20) * 100));
    const scoreEndividamento = Math.min(100, Math.max(0, (1 - (indiceEndividamento / 50)) * 100));
    const financialScore = (scorePoupanca * 0.5) + (scoreEndividamento * 0.5);

    // 5. Histórico Patrimonial (Últimos 12 meses)
    let mesesSet = new Set();
    transacoes.forEach(t => mesesSet.add(t.data.substring(0, 7)));
    const historicoPatrimonio = Array.from(mesesSet).sort().slice(-12).map(mes => {
        // Calcula o saldo acumulado até o final daquele mês
        const transacoesAteMes = transacoes.filter(t => t.data.substring(0,7) <= mes);
        let ativosM = 0, passivosM = 0;
        
        contas.forEach(c => {
            const saldo = transacoesAteMes
                .filter(t => t.conta_id === c.id)
                .reduce((acc, t) => t.tipo === 'receita' ? acc + t.valor : acc - t.valor, c.saldo_inicial);
            
            if (!isTipoCartao(c.tipo)) ativosM += saldo > 0 ? saldo : 0;
            else if (saldo < 0) passivosM += Math.abs(saldo);
        });
        return { mes, valor: ativosM - passivosM };
    });

    return { 
        rendaRealizada, despesaRealizada, saldoRealizado, 
        receitasPendentes, despesasPendentes, 
        rendaPrevistaTotal, despesaPrevistaTotal, saldoPrevisto, 
        totalAtivos, totalPassivos, patrimonioLiquido, totalInvestido,
        indiceEndividamento, reservaEmergenciaMeses, taxaPoupanca, financialScore, 
        historicoPatrimonio 
    };
};

// 2. Evolução Diária (Dashboard)
export const calculateDailyEvolution = (state, mesISO) => {
    const { transacoes, lancamentosFuturos } = state;
    const [ano, mes] = mesISO.split('-').map(Number);
    const diasNoMes = new Date(ano, mes, 0).getDate();
    
    // Calcula saldo acumulado ANTES do dia 1 do mês selecionado
    // Isso é importante para o gráfico começar do saldo real, não do zero.
    // (Simplificado para começar do zero no gráfico para focar no fluxo do mês, 
    // mas idealmente buscaria o saldo anterior).
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

// 3. Timeline Anual (Gráfico de Barras)
export const calculateAnnualTimeline = (state, anoSelecionado) => {
    const { contas, transacoes, lancamentosFuturos, comprasParceladas } = state;
    const ano = anoSelecionado || new Date().getFullYear();
    const meses = Array.from({ length: 12 }, (_, i) => i); 
    const idsCartao = contas.filter(c => isTipoCartao(c.tipo)).map(c => c.id);

    // Saldo Inicial do Ano (Caixa + Investimentos, exceto Cartão)
    let saldoAcumulado = contas.filter(c => !isTipoCartao(c.tipo)).reduce((acc, c) => acc + c.saldo_inicial, 0);
    const dataCorte = `${ano}-01-01`;
    
    // Soma movimentações anteriores ao ano para ajustar o saldo inicial
    const deltaRealizado = transacoes.filter(t => t.data < dataCorte).reduce((acc, t) => {
        if (idsCartao.includes(t.conta_id)) return acc; // Ignora cartão no saldo acumulado
        return t.tipo === 'receita' ? acc + t.valor : acc - t.valor;
    }, 0);
    
    saldoAcumulado += deltaRealizado;

    return meses.map(mesIndex => {
        const mesStr = `${ano}-${String(mesIndex + 1).padStart(2, '0')}`;
        
        // Receitas (Realizadas + Pendentes)
        const rec = transacoes.filter(t => t.data.startsWith(mesStr) && t.tipo === 'receita').reduce((s,t)=>s+t.valor,0) + 
                    lancamentosFuturos.filter(l => l.data_vencimento.startsWith(mesStr) && l.tipo === 'a_receber' && l.status === 'pendente').reduce((s,l)=>s+l.valor,0);
        
        // Despesas (Realizadas + Pendentes) - Ignora pagamentos feitos com cartão na hora da despesa (visualmente), 
        // mas considera para fluxo de caixa se quisermos ver "gasto". 
        // Aqui mantemos a lógica de caixa: saiu da conta = despesa.
        const desp = transacoes.filter(t => t.data.startsWith(mesStr) && t.tipo === 'despesa' && !idsCartao.includes(t.conta_id)).reduce((s,t)=>s+t.valor,0) +
                     lancamentosFuturos.filter(l => l.data_vencimento.startsWith(mesStr) && l.tipo === 'a_pagar' && l.status === 'pendente').reduce((s, l) => {
                        const compraPai = l.compra_parcelada_id ? comprasParceladas.find(c => c.id === l.compra_parcelada_id) : null;
                        // Se for parcela de cartão, não sai do caixa agora (será pago na fatura), então não abate do saldo acumulado imediato
                        if ((compraPai && idsCartao.includes(compraPai.conta_id)) || (l.conta_id && idsCartao.includes(l.conta_id))) return s;
                        return s + l.valor;
                     }, 0);
        
        const saldo = rec - desp;
        saldoAcumulado += saldo;

        return { mes: mesStr, receitas: rec, despesas: desp, saldo, acumulado: saldoAcumulado };
    });
};

// 4. Tabela Detalhada (Planejamento Anual) - AQUI ESTÁ A LÓGICA CRÍTICA
export const calculateCategoryGrid = (state, anoSelecionado) => {
    const { contas, transacoes, lancamentosFuturos, comprasParceladas } = state;
    const ano = anoSelecionado || new Date().getFullYear();

    // 1. Classificação de Contas (Fundamental para separar Investimento de Caixa)
    const idsInvest = contas.filter(c => isContaInvestimento(c.tipo)).map(c => c.id);
    const idsCartao = contas.filter(c => isTipoCartao(c.tipo)).map(c => c.id);
    // Tudo que não é cartão e não é investimento, é Caixa (Conta Corrente, Dinheiro, etc)
    const idsConta = contas.filter(c => !idsInvest.includes(c.id) && !idsCartao.includes(c.id)).map(c => c.id);

    // 2. Saldos Iniciais (Até 31/Dez anterior)
    const dataCorte = `${ano}-01-01`;

    const getSaldoAbertura = (ids) => {
        let saldo = contas.filter(c => ids.includes(c.id)).reduce((a, c) => a + c.saldo_inicial, 0);
        
        // Soma histórico realizado
        saldo += transacoes.filter(t => t.data < dataCorte && ids.includes(t.conta_id))
            .reduce((a, t) => t.tipo === 'receita' ? a + t.valor : a - t.valor, 0);
        
        // Soma pendências passadas (se houver, assumindo que já impactaram)
        saldo += lancamentosFuturos.filter(l => l.status === 'pendente' && l.data_vencimento < dataCorte && ids.includes(l.conta_id))
            .reduce((a, l) => l.tipo === 'a_receber' ? a + l.valor : a - l.valor, 0);
            
        return saldo;
    };

    let saldoInvestAtual = getSaldoAbertura(idsInvest);
    let saldoCaixaAtual = getSaldoAbertura(idsConta);

    // 3. Arrays para a Tabela
    const gridReceitas = {};
    const gridDespesas = {};
    const arrReceitas = Array(12).fill(0);
    const arrDespesas = Array(12).fill(0);
    
    const arrSaldosInvestimento = Array(12).fill(0);
    const arrSaldosConta = Array(12).fill(0);
    const arrSaldoLiquido = Array(12).fill(0);

    // 4. Loop Mensal (Projeção)
    for (let i = 0; i < 12; i++) {
        const mesStr = `${ano}-${String(i + 1).padStart(2, '0')}`;
        
        // O saldo exibido no topo da coluna é o saldo no INÍCIO do mês
        arrSaldosInvestimento[i] = saldoInvestAtual;
        arrSaldosConta[i] = saldoCaixaAtual;

        let recMes = 0;
        let despMes = 0;
        
        // Deltas para atualizar o saldo para o PRÓXIMO mês
        let deltaInvest = 0;
        let deltaCaixa = 0;

        const processarLancamento = (valor, tipo, contaId, cat) => {
            const c = cat || 'Outros';
            
            // Verifica destino real baseado no ID da conta
            const isDestinoInvest = idsInvest.includes(contaId);
            const isDestinoCaixa = idsConta.includes(contaId);
            // Se contaId for nulo ou não encontrado, assume Caixa por padrão (exceto se for cartão)
            const isFallbackCaixa = !contaId && !isDestinoInvest && !idsCartao.includes(contaId);

            if (tipo === 'receita') {
                recMes += valor;
                if (!gridReceitas[c]) gridReceitas[c] = Array(12).fill(0);
                gridReceitas[c][i] += valor;
                
                // LÓGICA CORRIGIDA: Só aumenta investimento se a conta destino for de investimento
                if (isDestinoInvest) {
                    deltaInvest += valor;
                } else if (isDestinoCaixa || isFallbackCaixa) {
                    deltaCaixa += valor;
                }

            } else { // Despesa
                despMes += valor;
                if (!gridDespesas[c]) gridDespesas[c] = Array(12).fill(0);
                gridDespesas[c][i] += valor;

                if (isDestinoInvest) {
                    deltaInvest -= valor;
                } else if (isDestinoCaixa || isFallbackCaixa) {
                    deltaCaixa -= valor;
                }
                // Se for cartão, não afeta deltaCaixa nem deltaInvest agora (só no pagamento da fatura, se houvesse lógica de fatura aqui)
            }
        };

        // A. Processa Realizado
        transacoes.filter(t => t.data.startsWith(mesStr)).forEach(t => 
            processarLancamento(t.valor, t.tipo, t.conta_id, t.categoria)
        );
        
        // B. Processa Previsto
        lancamentosFuturos.filter(l => l.status === 'pendente' && l.data_vencimento.startsWith(mesStr)).forEach(l => {
            const tipo = l.tipo === 'a_receber' ? 'receita' : 'despesa';
            
            // Verifica se é item de compra parcelada para pegar a conta correta
            let contaAlvo = l.conta_id;
            if (l.compra_parcelada_id) {
                const compra = comprasParceladas.find(c => c.id === l.compra_parcelada_id);
                if (compra) contaAlvo = compra.conta_id;
            }

            processarLancamento(l.valor, tipo, contaAlvo, l.categoria);
        });

        arrReceitas[i] = recMes;
        arrDespesas[i] = despMes;

        // Atualiza saldos acumulados para o loop do mês seguinte
        saldoInvestAtual += deltaInvest;
        saldoCaixaAtual += deltaCaixa;

        // FÓRMULA FINAL DO SALDO LÍQUIDO (Fim do Mês)
        // Saldo Liquido = (Saldo Inv Final) + (Saldo Caixa Final)
        // Onde Saldo Final = Saldo Inicial + Deltas
        arrSaldoLiquido[i] = (arrSaldosInvestimento[i] + deltaInvest) + (arrSaldosConta[i] + deltaCaixa);
    }

    return { 
        receitas: gridReceitas, 
        despesas: gridDespesas, 
        totalReceitas: arrReceitas, 
        totalDespesas: arrDespesas, 
        saldosInvestimento: arrSaldosInvestimento, 
        saldosConta: arrSaldosConta, 
        saldoLiquido: arrSaldoLiquido
    };
};
