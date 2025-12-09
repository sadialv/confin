// ARQUIVO: js/finance.js
import { isTipoCartao } from './state.js';

// 1. Métricas Principais (Dashboard, Saúde Financeira e Visão Mensal)
export const calculateFinancialHealthMetrics = (state) => {
    const { contas, transacoes, lancamentosFuturos } = state;
    const hoje = new Date();
    const mesAtual = hoje.toISOString().slice(0, 7); // Ex: "2025-12"

    // --- CÁLCULO DE PATRIMÔNIO (Ativos vs Passivos) ---
    let totalAtivos = 0;
    let totalPassivos = 0;

    contas.forEach(conta => {
        // Calcula o saldo atual da conta somando/subtraindo transações do saldo inicial
        const saldoConta = transacoes
            .filter(t => t.conta_id === conta.id)
            .reduce((acc, t) => t.tipo === 'receita' ? acc + t.valor : acc - t.valor, conta.saldo_inicial);

        // Se NÃO for cartão, é Ativo (dinheiro). Se for cartão, é Passivo (dívida) se negativo.
        if (!isTipoCartao(conta.tipo)) {
            totalAtivos += saldoConta > 0 ? saldoConta : 0;
        } else {
            if (saldoConta < 0) totalPassivos += Math.abs(saldoConta);
        }
    });

    // Soma dívidas futuras pendentes (Lançamentos 'a_pagar')
    totalPassivos += lancamentosFuturos
        .filter(l => l.status === 'pendente' && l.tipo === 'a_pagar')
        .reduce((acc, l) => acc + l.valor, 0);

    const patrimonioLiquido = totalAtivos - totalPassivos;

    // --- DIAGNÓSTICO DO MÊS ATUAL (Previsão vs Realizado) ---
    const transacoesMes = transacoes.filter(t => t.data?.startsWith(mesAtual));
    
    // A. Realizado (O que já aconteceu de fato)
    const rendaRealizada = transacoesMes
        .filter(t => t.tipo === 'receita')
        .reduce((acc, t) => acc + t.valor, 0);

    const despesaRealizada = transacoesMes
        .filter(t => t.tipo === 'despesa')
        .reduce((acc, t) => acc + t.valor, 0);

    // B. Pendente (O que está agendado para acontecer)
    const receitasPendentes = lancamentosFuturos
        .filter(l => l.status === 'pendente' && l.tipo === 'a_receber' && l.data_vencimento.startsWith(mesAtual))
        .reduce((acc, l) => acc + l.valor, 0);

    const despesasPendentes = lancamentosFuturos
        .filter(l => l.status === 'pendente' && l.tipo === 'a_pagar' && l.data_vencimento.startsWith(mesAtual))
        .reduce((acc, l) => acc + l.valor, 0);

    // C. Totais Previstos (Realizado + Pendente)
    const rendaPrevistaTotal = rendaRealizada + receitasPendentes;
    const despesaPrevistaTotal = despesaRealizada + despesasPendentes;
    const saldoPrevisto = rendaPrevistaTotal - despesaPrevistaTotal;

    // --- CATEGORIZAÇÃO E INDICADORES ---
    const catsFixas = ['Moradia', 'Contas', 'Educação', 'Saúde', 'Transporte'];
    const catsNecessidades = ['Moradia', 'Contas', 'Educação', 'Saúde', 'Transporte', 'Alimentação'];
    const catsDesejos = ['Lazer', 'Compras', 'Outros'];

    // Despesas Fixas (apenas realizadas no mês para cálculo de reserva)
    const despesasFixas = transacoesMes
        .filter(t => t.tipo === 'despesa' && catsFixas.includes(t.categoria))
        .reduce((acc, t) => acc + t.valor, 0);
    
    // Indicadores de Saúde Financeira
    const indiceEndividamento = totalAtivos > 0 ? (totalPassivos / totalAtivos) * 100 : 0;
    const reservaEmergenciaMeses = despesasFixas > 0 ? (totalAtivos / despesasFixas) : (totalAtivos > 0 ? 99 : 0);
    
    const saldoRealizado = rendaRealizada - despesaRealizada;
    const taxaPoupanca = rendaRealizada > 0 ? (saldoRealizado / rendaRealizada) * 100 : 0;

    // Métricas 50-30-20
    const gastosNecessidades = transacoesMes.filter(t => t.tipo === 'despesa' && catsNecessidades.includes(t.categoria)).reduce((acc, t) => acc + t.valor, 0);
    const gastosDesejos = transacoesMes.filter(t => t.tipo === 'despesa' && catsDesejos.includes(t.categoria)).reduce((acc, t) => acc + t.valor, 0);

    const percNecessidades = rendaRealizada > 0 ? (gastosNecessidades / rendaRealizada) * 100 : 0;
    const percDesejos = rendaRealizada > 0 ? (gastosDesejos / rendaRealizada) * 100 : 0;
    const percPoupanca = taxaPoupanca;

    // Cálculo do Score (0 a 100)
    const scorePoupanca = Math.min(100, Math.max(0, (taxaPoupanca / 20) * 100));
    const scoreEndividamento = Math.min(100, Math.max(0, (1 - (indiceEndividamento / 50)) * 100));
    const financialScore = (scorePoupanca * 0.5) + (scoreEndividamento * 0.5);

    // --- DADOS PARA GRÁFICOS (Histórico) ---
    
    // 1. Média de Gastos por Categoria
    let gastosPorCategoria = {};
    let meses = new Set();
    transacoes.forEach(t => {
        const mes = t.data.substring(0, 7);
        meses.add(mes);
        if (t.tipo === 'despesa') {
            gastosPorCategoria[t.categoria] = (gastosPorCategoria[t.categoria] || 0) + t.valor;
        }
    });

    const numMeses = meses.size || 1;
    const mediaGastosCategoria = Object.entries(gastosPorCategoria)
        .map(([categoria, total]) => ({ categoria, media: total / numMeses }))
        .sort((a,b) => b.media - a.media);

    // 2. Evolução do Patrimônio (Últimos 12 meses)
    const historicoPatrimonio = Array.from(meses).sort().slice(-12).map(mes => {
        const transacoesAteMes = transacoes.filter(t => t.data.substring(0,7) <= mes);
        let ativos = 0, passivos = 0;
        
        contas.forEach(c => {
            const saldo = transacoesAteMes
                .filter(t => t.conta_id === c.id)
                .reduce((acc, t) => t.tipo === 'receita' ? acc + t.valor : acc - t.valor, c.saldo_inicial);
            
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

// 2. Planejamento Anual: Gráfico Misto (Timeline)
// Essa função calcula o fluxo de caixa para um ano específico, considerando o passado.
export const calculateAnnualTimeline = (state, anoSelecionado) => {
    const { contas, transacoes, lancamentosFuturos } = state;
    const ano = anoSelecionado || new Date().getFullYear();
    const meses = Array.from({ length: 12 }, (_, i) => i); 

    // Identifica contas de Cartão para separar visualmente se necessário
    const idsCartao = contas.filter(c => isTipoCartao(c.tipo)).map(c => c.id);

    // --- CÁLCULO DO SALDO INICIAL DO ANO (ACUMULADO HISTÓRICO) ---
    // Precisamos saber quanto dinheiro existia no dia 31/12 do ano anterior.
    
    // 1. Soma dos Saldos Iniciais Cadastrados nas contas (Dinheiro/Investimentos)
    let saldoInicialAbsoluto = contas
        .filter(c => !isTipoCartao(c.tipo))
        .reduce((acc, c) => acc + c.saldo_inicial, 0);

    // 2. Soma todas as movimentações realizadas ANTES do ano selecionado
    const dataCorteInicioAno = `${ano}-01-01`;

    const historicoRealizado = transacoes
        .filter(t => t.data < dataCorteInicioAno)
        .reduce((acc, t) => {
            if (t.tipo === 'receita') return acc + t.valor;
            if (t.tipo === 'despesa') return acc - t.valor;
            return acc;
        }, 0);

    // Saldo Acumulado começa com: Saldo Inicial das Contas + Histórico de Transações Passadas
    let saldoAcumulado = saldoInicialAbsoluto + historicoRealizado;

    // --- LOOP PELOS MESES DO ANO SELECIONADO ---
    return meses.map(mesIndex => {
        const mesStr = `${ano}-${String(mesIndex + 1).padStart(2, '0')}`;
        
        // 1. Receitas: Soma o que já entrou (Real) + o que vai entrar (Previsto)
        const recReal = transacoes
            .filter(t => t.data.startsWith(mesStr) && t.tipo === 'receita')
            .reduce((s, t) => s + t.valor, 0);
            
        const recPrev = lancamentosFuturos
            .filter(l => l.data_vencimento.startsWith(mesStr) && l.tipo === 'a_receber' && l.status === 'pendente')
            .reduce((s, l) => s + l.valor, 0);
            
        const totalReceitas = recReal + recPrev;

        // 2. Despesas: Soma o que já saiu (Real) + o que vai sair (Previsto)
        // Nota: Filtramos fora as despesas "internas" de cartão se a lógica for separar, 
        // mas para fluxo de caixa simples, somamos tudo que saiu da conta.
        const despReal = transacoes
            .filter(t => t.data.startsWith(mesStr) && t.tipo === 'despesa' && !idsCartao.includes(t.conta_id))
            .reduce((s, t) => s + t.valor, 0);
            
        const despPrev = lancamentosFuturos
            .filter(l => l.data_vencimento.startsWith(mesStr) && l.tipo === 'a_pagar' && l.status === 'pendente' && (!l.compra_parcelada_id || !idsCartao.includes(l.conta_id))) 
            .reduce((s, l) => s + l.valor, 0);

        // 3. Gastos de Cartão (Visualização separada ou somada)
        // Aqui somamos os gastos feitos com cartão para dar a visão de consumo
        const gastosCartaoReal = transacoes
            .filter(t => t.data.startsWith(mesStr) && t.tipo === 'despesa' && idsCartao.includes(t.conta_id))
            .reduce((s, t) => s + t.valor, 0);
            
        // Nota: Para o saldo financeiro estrito, o gasto no cartão não sai da conta bancária no ato (sai no vencimento).
        // Porém, para planejamento pessoal, é melhor considerar o gasto no mês de competência para não se iludir.
        // Aqui estamos somando tudo (Despesa Conta + Despesa Cartão) como saída.
        
        const totalDespesas = despReal + despPrev + gastosCartaoReal; 
        
        const saldoMensal = totalReceitas - totalDespesas;
        
        // Atualiza o acumulado para o próximo mês
        saldoAcumulado += saldoMensal;

        return {
            mes: new Date(ano, mesIndex).toLocaleString('pt-BR', { month: 'long' }),
            receitas: totalReceitas,
            despesas: totalDespesas,
            cartoes: gastosCartaoReal, // Apenas informativo, já somado em despesas
            saldo: saldoMensal,
            acumulado: saldoAcumulado
        };
    });
};

// 3. Tabela Detalhada (Grid Categoria x Mês)
export const calculateCategoryGrid = (state, anoSelecionado) => {
    const { transacoes, lancamentosFuturos } = state;
    const ano = anoSelecionado || new Date().getFullYear();
    
    const gridReceitas = {};
    const gridDespesas = {};
    const totaisMensais = Array(12).fill(0);

    const adicionarAoGrid = (tipo, categoria, mesIndex, valor) => {
        const target = (tipo === 'receita' || tipo === 'a_receber') ? gridReceitas : gridDespesas;
        const catNome = categoria || 'Outros';
        
        if (!target[catNome]) {
            target[catNome] = Array(12).fill(0);
        }
        
        target[catNome][mesIndex] += valor;
        
        if (tipo === 'receita' || tipo === 'a_receber') {
            totaisMensais[mesIndex] += valor;
        } else {
            totaisMensais[mesIndex] -= valor;
        }
    };

    // 1. Processar Realizado
    transacoes.forEach(t => {
        if (t.data.startsWith(`${ano}-`)) {
            const mes = parseInt(t.data.split('-')[1]) - 1;
            adicionarAoGrid(t.tipo, t.categoria, mes, t.valor);
        }
    });

    // 2. Processar Previsto (Futuro Pendente)
    lancamentosFuturos.forEach(l => {
        if (l.status === 'pendente' && l.data_vencimento.startsWith(`${ano}-`)) {
            const mes = parseInt(l.data_vencimento.split('-')[1]) - 1;
            // Normaliza o tipo
            const tipo = l.tipo === 'a_receber' ? 'receita' : 'despesa';
            adicionarAoGrid(tipo, l.categoria, mes, l.valor);
        }
    });

    return {
        receitas: gridReceitas,
        despesas: gridDespesas,
        saldos: totaisMensais
    };
};
