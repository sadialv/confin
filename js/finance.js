// ARQUIVO: js/finance.js
import { isTipoCartao } from './state.js';

// --- MÉTODOS AUXILIARES ---
const isContaInvestimento = (tipoConta) => {
    if (!tipoConta) return false;
    const tiposInvestimento = ['Investimentos', 'Poupança', 'Aplicação', 'CDB', 'Tesouro', 'Ações', 'Fundos'];
    return tiposInvestimento.some(t => tipoConta.includes(t));
};

// Converte qualquer valor para número de forma segura
const toNum = (val) => parseFloat(val) || 0;

// 1. Métricas Principais (Dashboard)
export const calculateFinancialHealthMetrics = (state, mesSelecionado = null) => {
    const { contas, transacoes, lancamentosFuturos } = state;
    const hoje = new Date();
    const mesAtual = mesSelecionado || hoje.toISOString().slice(0, 7);

    let totalAtivos = 0;
    let totalPassivos = 0;
    let totalInvestido = 0;

    contas.forEach(conta => {
        const saldoConta = transacoes
            .filter(t => t.conta_id === conta.id)
            .reduce((acc, t) => t.tipo === 'receita' ? acc + toNum(t.valor) : acc - toNum(t.valor), toNum(conta.saldo_inicial));

        if (isTipoCartao(conta.tipo)) {
            if (saldoConta < 0) totalPassivos += Math.abs(saldoConta);
        } else {
            if (saldoConta > 0) {
                totalAtivos += saldoConta;
                if (isContaInvestimento(conta.tipo)) totalInvestido += saldoConta;
            }
        }
    });

    totalPassivos += lancamentosFuturos
        .filter(l => l.status === 'pendente' && l.tipo === 'a_pagar')
        .reduce((acc, l) => acc + toNum(l.valor), 0);

    const patrimonioLiquido = totalAtivos - totalPassivos;

    const transacoesMes = transacoes.filter(t => t.data?.startsWith(mesAtual));
    const rendaRealizada = transacoesMes.filter(t => t.tipo === 'receita').reduce((acc, t) => acc + toNum(t.valor), 0);
    const despesaRealizada = transacoesMes.filter(t => t.tipo === 'despesa').reduce((acc, t) => acc + toNum(t.valor), 0);

    const receitasPendentes = lancamentosFuturos
        .filter(l => l.status === 'pendente' && l.tipo === 'a_receber' && l.data_vencimento.startsWith(mesAtual))
        .reduce((acc, l) => acc + toNum(l.valor), 0);
    const despesasPendentes = lancamentosFuturos
        .filter(l => l.status === 'pendente' && l.tipo === 'a_pagar' && l.data_vencimento.startsWith(mesAtual))
        .reduce((acc, l) => acc + toNum(l.valor), 0);

    const rendaPrevistaTotal = rendaRealizada + receitasPendentes;
    const despesaPrevistaTotal = despesaRealizada + despesasPendentes;
    const saldoPrevisto = rendaPrevistaTotal - despesaPrevistaTotal;

    const saldoRealizado = rendaRealizada - despesaRealizada;
    const taxaPoupanca = rendaRealizada > 0 ? (saldoRealizado / rendaRealizada) * 100 : 0;
    const financialScore = Math.min(100, Math.max(0, (taxaPoupanca / 20) * 100));

    // Histórico Patrimonial
    let mesesSet = new Set();
    transacoes.forEach(t => mesesSet.add(t.data.substring(0, 7)));
    const historicoPatrimonio = Array.from(mesesSet).sort().slice(-12).map(mes => {
        const transacoesAteMes = transacoes.filter(t => t.data.substring(0,7) <= mes);
        let ativos = 0, passivos = 0;
        contas.forEach(c => {
            const saldo = transacoesAteMes.filter(t => t.conta_id === c.id).reduce((acc, t) => t.tipo === 'receita' ? acc + toNum(t.valor) : acc - toNum(t.valor), toNum(c.saldo_inicial));
            if(!isTipoCartao(c.tipo)) ativos += saldo > 0 ? saldo : 0;
            else if (saldo < 0) passivos += Math.abs(saldo);
        });
        return { mes, valor: ativos - passivos };
    });

    return { 
        rendaRealizada, despesaRealizada, saldoRealizado, 
        receitasPendentes, despesasPendentes, 
        rendaPrevistaTotal, despesaPrevistaTotal, saldoPrevisto, 
        totalAtivos, totalPassivos, patrimonioLiquido, totalInvestido,
        financialScore, historicoPatrimonio 
    };
};

// 2. Evolução Diária
export const calculateDailyEvolution = (state, mesISO) => {
    const { transacoes, lancamentosFuturos } = state;
    const [ano, mes] = mesISO.split('-').map(Number);
    const diasNoMes = new Date(ano, mes, 0).getDate();
    let saldoDia = 0;
    const evolution = [];

    for (let d = 1; d <= diasNoMes; d++) {
        const diaStr = `${mesISO}-${String(d).padStart(2, '0')}`;
        
        const rec = transacoes.filter(t => t.data === diaStr && t.tipo === 'receita').reduce((s,t) => s+toNum(t.valor), 0) + 
                    lancamentosFuturos.filter(l => l.status === 'pendente' && l.data_vencimento === diaStr && l.tipo === 'a_receber').reduce((s,l) => s+toNum(l.valor), 0);
        
        const desp = transacoes.filter(t => t.data === diaStr && t.tipo === 'despesa').reduce((s,t) => s+toNum(t.valor), 0) + 
                     lancamentosFuturos.filter(l => l.status === 'pendente' && l.data_vencimento === diaStr && l.tipo === 'a_pagar').reduce((s,l) => s+toNum(l.valor), 0);
        
        const liq = rec - desp;
        saldoDia += liq;
        evolution.push({ dia: d, saldoDoDia: liq, acumulado: saldoDia });
    }
    return evolution;
};

// 3. Timeline Anual (AQUI ESTAVA O PROBLEMA - RESTAURADO)
export const calculateAnnualTimeline = (state, anoSelecionado) => {
    const { contas, transacoes, lancamentosFuturos, comprasParceladas } = state;
    const ano = anoSelecionado || new Date().getFullYear();
    const meses = Array.from({ length: 12 }, (_, i) => i); 
    const idsCartao = contas.filter(c => isTipoCartao(c.tipo)).map(c => c.id);

    // Saldo Inicial do Ano
    let saldoAcumulado = contas.filter(c => !isTipoCartao(c.tipo)).reduce((acc, c) => acc + toNum(c.saldo_inicial), 0);
    const dataCorte = `${ano}-01-01`;
    
    // Ajuste histórico
    const deltaRealizado = transacoes.filter(t => t.data < dataCorte).reduce((acc, t) => {
        if (idsCartao.includes(t.conta_id)) return acc; 
        return t.tipo === 'receita' ? acc + toNum(t.valor) : acc - toNum(t.valor);
    }, 0);
    
    saldoAcumulado += deltaRealizado;

    return meses.map(mesIndex => {
        const mesStr = `${ano}-${String(mesIndex + 1).padStart(2, '0')}`;
        
        const rec = transacoes.filter(t => t.data.startsWith(mesStr) && t.tipo === 'receita').reduce((s,t)=>s+toNum(t.valor),0) + 
                    lancamentosFuturos.filter(l => l.data_vencimento.startsWith(mesStr) && l.tipo === 'a_receber' && l.status === 'pendente').reduce((s,l)=>s+toNum(l.valor),0);
        
        const desp = transacoes.filter(t => t.data.startsWith(mesStr) && t.tipo === 'despesa' && !idsCartao.includes(t.conta_id)).reduce((s,t)=>s+toNum(t.valor),0) +
                     lancamentosFuturos.filter(l => l.data_vencimento.startsWith(mesStr) && l.tipo === 'a_pagar' && l.status === 'pendente').reduce((s, l) => {
                        const compraPai = l.compra_parcelada_id ? comprasParceladas.find(c => c.id === l.compra_parcelada_id) : null;
                        if ((compraPai && idsCartao.includes(compraPai.conta_id)) || (l.conta_id && idsCartao.includes(l.conta_id))) return s;
                        return s + toNum(l.valor);
                     }, 0);
        
        const saldo = rec - desp;
        saldoAcumulado += saldo;

        return { mes: mesStr, receitas: rec, despesas: desp, saldo, acumulado: saldoAcumulado };
    });
};

// 4. Tabela de Planejamento (Lógica de Resgate Real)
export const calculateCategoryGrid = (state, anoSelecionado) => {
    const { contas, transacoes, lancamentosFuturos, comprasParceladas } = state;
    const ano = anoSelecionado || new Date().getFullYear();

    const idsInvest = contas.filter(c => isContaInvestimento(c.tipo)).map(c => c.id);
    const idsCartao = contas.filter(c => isTipoCartao(c.tipo)).map(c => c.id);
    const idsContaReal = contas.filter(c => !idsInvest.includes(c.id) && !idsCartao.includes(c.id)).map(c => c.id);

    const dataCorte = `${ano}-01-01`;

    const getSaldoAbertura = (ids) => {
        let saldo = contas.filter(c => ids.includes(c.id)).reduce((a, c) => a + toNum(c.saldo_inicial), 0);
        saldo += transacoes.filter(t => t.data < dataCorte && ids.includes(t.conta_id))
            .reduce((a, t) => t.tipo === 'receita' ? a + toNum(t.valor) : a - toNum(t.valor), 0);
        saldo += lancamentosFuturos.filter(l => l.status === 'pendente' && l.data_vencimento < dataCorte && ids.includes(l.conta_id))
            .reduce((a, l) => l.tipo === 'a_receber' ? a + toNum(l.valor) : a - toNum(l.valor), 0);
        return saldo;
    };

    let saldoInvestAtual = getSaldoAbertura(idsInvest);
    let saldoCaixaAtual = getSaldoAbertura(idsContaReal);

    const gridReceitas = {};
    const gridDespesas = {};
    const arrReceitas = Array(12).fill(0);
    const arrDespesas = Array(12).fill(0);
    const arrSaldosInvestimento = Array(12).fill(0);
    const arrSaldosConta = Array(12).fill(0);
    const arrResgates = Array(12).fill(0);
    const arrSaldoLiquido = Array(12).fill(0);

    for (let i = 0; i < 12; i++) {
        const mesStr = `${ano}-${String(i + 1).padStart(2, '0')}`;
        
        arrSaldosInvestimento[i] = saldoInvestAtual;
        arrSaldosConta[i] = saldoCaixaAtual;

        let recMes = 0;
        let despMes = 0;
        let fluxoInvest = 0;
        let fluxoCaixa = 0;

        const processar = (valorRaw, tipo, contaId, cat) => {
            const valor = toNum(valorRaw);
            const c = cat || 'Outros';
            const isDestinoInvest = idsInvest.includes(contaId);
            const isImpactoCaixa = !isDestinoInvest;

            if (tipo === 'receita') {
                recMes += valor;
                if (!gridReceitas[c]) gridReceitas[c] = Array(12).fill(0);
                gridReceitas[c][i] += valor;
                
                if (isDestinoInvest) fluxoInvest += valor;
                else if (isImpactoCaixa) fluxoCaixa += valor;

            } else { 
                despMes += valor;
                if (!gridDespesas[c]) gridDespesas[c] = Array(12).fill(0);
                gridDespesas[c][i] += valor;

                if (isDestinoInvest) fluxoInvest -= valor;
                else if (isImpactoCaixa) fluxoCaixa -= valor; 
            }
        };

        transacoes.filter(t => t.data.startsWith(mesStr)).forEach(t => processar(t.valor, t.tipo, t.conta_id, t.categoria));
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

        // Lógica de Resgate
        let caixaPrevisorio = saldoCaixaAtual + fluxoCaixa;
        let investPrevisorio = saldoInvestAtual + fluxoInvest;
        let resgateNecessario = 0;

        if (caixaPrevisorio < 0) {
            const deficit = Math.abs(caixaPrevisorio);
            if (investPrevisorio >= deficit) {
                resgateNecessario = deficit;
                investPrevisorio -= deficit; 
                caixaPrevisorio = 0;
            } else {
                resgateNecessario = investPrevisorio;
                caixaPrevisorio += investPrevisorio;
                investPrevisorio = 0;
            }
        }

        arrResgates[i] = resgateNecessario;
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
