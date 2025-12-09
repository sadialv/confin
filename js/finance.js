// ARQUIVO: js/finance.js
import { isTipoCartao } from './state.js';

// 1. Métricas Principais (Dashboard, Saúde Financeira)
export const calculateFinancialHealthMetrics = (state) => {
    const { contas, transacoes, lancamentosFuturos } = state;
    const hoje = new Date();
    const mesAtual = hoje.toISOString().slice(0, 7); // Ex: "2025-12"

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

    // Soma passivos futuros (Dívidas pendentes)
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

    // Indicadores e Categorização
    const catsFixas = ['Moradia', 'Contas', 'Educação', 'Saúde', 'Transporte'];
    const catsNecessidades = ['Moradia', 'Contas', 'Educação', 'Saúde', 'Transporte', 'Alimentação'];
    const catsDesejos = ['Lazer', 'Compras', 'Outros'];

    const despesasFixas = transacoesMes.filter(t => t.tipo === 'despesa' && catsFixas.includes(t.categoria)).reduce((acc, t) => acc + t.valor, 0);
    const indiceEndividamento = totalAtivos > 0 ? (totalPassivos / totalAtivos) * 100 : 0;
    const reservaEmergenciaMeses = despesasFixas > 0 ? (totalAtivos / despesasFixas) : (totalAtivos > 0 ? 99 : 0);
    const saldoRealizado = rendaRealizada - despesaRealizada;
    const taxaPoupanca = rendaRealizada > 0 ? (saldoRealizado / rendaRealizada) * 100 : 0;

    const gastosNecessidades = transacoesMes.filter(t => t.tipo === 'despesa' && catsNecessidades.includes(t.categoria)).reduce((acc, t) => acc + t.valor, 0);
    const gastosDesejos = transacoesMes.filter(t => t.tipo === 'despesa' && catsDesejos.includes(t.categoria)).reduce((acc, t) => acc + t.valor, 0);

    const percNecessidades = rendaRealizada > 0 ? (gastosNecessidades / rendaRealizada) * 100 : 0;
    const percDesejos = rendaRealizada > 0 ? (gastosDesejos / rendaRealizada) * 100 : 0;
    const percPoupanca = taxaPoupanca;

    // Score
    const scorePoupanca = Math.min(100, Math.max(0, (taxaPoupanca / 20) * 100));
    const scoreEndividamento = Math.min(100, Math.max(0, (1 - (indiceEndividamento / 50)) * 100));
    const financialScore = (scorePoupanca * 0.5) + (scoreEndividamento * 0.5);

    // Dados Históricos para Gráficos
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
        indiceEndividamento, reservaEmergenciaMeses, taxaPoupanca,
        percNecessidades, percDesejos, percPoupanca,
        financialScore, mediaGastosCategoria, historicoPatrimonio
    };
};

// 2. Planejamento Anual (CORRIGIDO PARA INCLUIR SALDO ACUMULADO REAL + PREVISÃO FUTURA)
export const calculateAnnualTimeline = (state, anoSelecionado) => {
    const { contas, transacoes, lancamentosFuturos, comprasParceladas } = state;
    const ano = anoSelecionado || new Date().getFullYear();
    const meses = Array.from({ length: 12 }, (_, i) => i); 

    // --- PASSO 1: CALCULAR O "CAIXA INICIAL" (Tudo que você tem até o dia 01/Jan do ano selecionado) ---
    
    // A. Saldo Inicial Cadastrado nas Contas (Dinheiro + Investimentos)
    let saldoInicialAbsoluto = contas
        .filter(c => !isTipoCartao(c.tipo))
        .reduce((acc, c) => acc + c.saldo_inicial, 0);

    const dataCorteInicioAno = `${ano}-01-01`;

    // B. Histórico REALIZADO (Transações feitas antes desse ano)
    const deltaRealizado = transacoes
        .filter(t => t.data < dataCorteInicioAno)
        .reduce((acc, t) => {
            if (t.tipo === 'receita') return acc + t.valor;
            // Despesa: Se for cartão, tecnicamente não saiu da conta, mas impacta o patrimônio líquido.
            // Para visão de Fluxo de Caixa (Sobrou/Faltou), subtraímos.
            if (t.tipo === 'despesa') return acc - t.valor;
            return acc;
        }, 0);

    // C. Histórico PENDENTE (Contas Atrasadas ou Futuras anteriores a este ano que ainda não foram baixadas)
    // Ex: Se estou olhando 2026, preciso somar o que planejei ganhar em Dez/2025.
    const deltaPendente = lancamentosFuturos
        .filter(l => l.status === 'pendente' && l.data_vencimento < dataCorteInicioAno)
        .reduce((acc, l) => {
            if (l.tipo === 'a_receber') return acc + l.valor;
            if (l.tipo === 'a_pagar') return acc - l.valor;
            return acc;
        }, 0);

    // Saldo Acumulado no início do Ano Selecionado
    let saldoAcumulado = saldoInicialAbsoluto + deltaRealizado + deltaPendente;

    // --- PASSO 2: CALCULAR MÊS A MÊS ---
    
    // Identificar IDs de contas Cartão para separar visualmente
    const idsCartao = contas.filter(c => isTipoCartao(c.tipo)).map(c => c.id);

    return meses.map(mesIndex => {
        const mesStr = `${ano}-${String(mesIndex + 1).padStart(2, '0')}`;
        
        // 1. Receitas (Realizado + Previsto)
        const recReal = transacoes.filter(t => t.data.startsWith(mesStr) && t.tipo === 'receita').reduce((s, t) => s + t.valor, 0);
        const recPrev = lancamentosFuturos.filter(l => l.data_vencimento.startsWith(mesStr) && l.tipo === 'a_receber' && l.status === 'pendente').reduce((s, l) => s + l.valor, 0);
        const totalReceitas = recReal + recPrev;

        // 2. Despesas (Realizado + Previsto)
        // NOTA: Para bater com seu "Saldo em Conta", subtraímos tudo.
        // Se quiser separar cartão, precisaria checar o vínculo da conta.
        
        const despReal = transacoes.filter(t => t.data.startsWith(mesStr) && t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0);
        const despPrev = lancamentosFuturos.filter(l => l.data_vencimento.startsWith(mesStr) && l.tipo === 'a_pagar' && l.status === 'pendente').reduce((s, l) => s + l.valor, 0);
        
        // Separação visual de gastos EXCLUSIVOS de cartão (apenas estimativa visual)
        // Tentamos achar gastos ligados a contas do tipo cartão
        const gastosCartaoReal = transacoes
            .filter(t => t.data.startsWith(mesStr) && t.tipo === 'despesa' && idsCartao.includes(t.conta_id))
            .reduce((s, t) => s + t.valor, 0);
            
        // Para futuro, precisamos ver a 'compra_parcelada' pai
        const gastosCartaoPrev = lancamentosFuturos
            .filter(l => l.data_vencimento.startsWith(mesStr) && l.tipo === 'a_pagar' && l.status === 'pendente')
            .reduce((sum, l) => {
                // Tenta achar a compra pai para ver se é cartão
                const compraPai = comprasParceladas.find(c => c.id === l.compra_parcelada_id);
                if (compraPai && idsCartao.includes(compraPai.conta_id)) {
                    return sum + l.valor;
                }
                return sum;
            }, 0);

        const totalCartaoDisplay = gastosCartaoReal + gastosCartaoPrev;
        
        // Total Despesas Geral (inclui cartão para cálculo de saldo líquido)
        const totalDespesas = despReal + despPrev;

        const saldoMensal = totalReceitas - totalDespesas;
        
        // Acumula o saldo
        saldoAcumulado += saldoMensal;

        return {
            mes: new Date(ano, mesIndex).toLocaleString('pt-BR', { month: 'long' }),
            receitas: totalReceitas,
            despesas: totalDespesas,
            cartoes: totalCartaoDisplay, // Apenas para exibição na tabela
            saldo: saldoMensal,
            acumulado: saldoAcumulado // Agora inclui Saldo Inicial + Histórico + Mês Atual
        };
    });
};

// 3. Tabela Detalhada (Grid Categoria x Mês)
export const calculateCategoryGrid = (state, anoSelecionado) => {
    const { transacoes, lancamentosFuturos } = state;
    const ano = anoSelecionado || new Date().getFullYear();
    const gridReceitas = {}, gridDespesas = {}, totaisMensais = Array(12).fill(0);

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
            const mes = parseInt(t.data.split('-')[1]) - 1;
            add(t.tipo, t.categoria, mes, t.valor);
        }
    });

    lancamentosFuturos.forEach(l => {
        if (l.status === 'pendente' && l.data_vencimento.startsWith(`${ano}-`)) {
            const mes = parseInt(l.data_vencimento.split('-')[1]) - 1;
            const tipo = l.tipo === 'a_receber' ? 'receita' : 'despesa';
            add(tipo, l.categoria, mes, l.valor);
        }
    });

    return { receitas: gridReceitas, despesas: gridDespesas, saldos: totaisMensais };
};
