// ARQUIVO: js/finance.js
import { isTipoCartao, getContaPorId, getState } from './state.js';

// 1. Métricas Principais (Dashboard, Saúde Financeira)
export const calculateFinancialHealthMetrics = (state) => {
    const { contas, transacoes, lancamentosFuturos } = state;
    const hoje = new Date();
    const mesAtual = hoje.toISOString().slice(0, 7);

    let totalAtivos = 0;
    let totalPassivos = 0;

    // Calcula Patrimônio (Saldo Real das Contas)
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

    // Passivos Futuros (Só considera o que falta pagar)
    totalPassivos += lancamentosFuturos
        .filter(l => l.status === 'pendente' && l.tipo === 'a_pagar')
        .reduce((acc, l) => acc + l.valor, 0);

    const patrimonioLiquido = totalAtivos - totalPassivos;

    // Métricas do Mês
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

    // Histórico de Patrimônio (Gráfico)
    let meses = new Set();
    transacoes.forEach(t => meses.add(t.data.substring(0, 7)));
    
    // Dados de Categorias
    let gastosPorCategoria = {};
    transacoes.filter(t => t.tipo === 'despesa').forEach(t => {
        gastosPorCategoria[t.categoria] = (gastosPorCategoria[t.categoria] || 0) + t.valor;
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

// 2. Planejamento Anual (CORRIGIDO: Separa CAIXA de COMPETÊNCIA)
export const calculateAnnualTimeline = (state, anoSelecionado) => {
    const { contas, transacoes, lancamentosFuturos, comprasParceladas } = state;
    const ano = anoSelecionado || new Date().getFullYear();
    const meses = Array.from({ length: 12 }, (_, i) => i); 

    // Mapeia quais contas são cartão para excluí-las do fluxo de caixa
    const idsCartao = contas.filter(c => isTipoCartao(c.tipo)).map(c => c.id);

    // --- 1. SALDO INICIAL DO ANO (CAIXA REAL) ---
    // Soma apenas contas que NÃO são cartão (Dinheiro + Investimentos)
    const saldoInicialContas = contas
        .filter(c => !isTipoCartao(c.tipo))
        .reduce((acc, c) => acc + c.saldo_inicial, 0);

    const dataCorteInicioAno = `${ano}-01-01`;

    // Histórico REALIZADO (Transações anteriores ao ano selecionado)
    const historicoRealizado = transacoes
        .filter(t => t.data < dataCorteInicioAno)
        .reduce((acc, t) => {
            // Ignora transações feitas em contas de cartão (elas não afetam o saldo da conta corrente diretamente)
            if (idsCartao.includes(t.conta_id)) return acc;

            if (t.tipo === 'receita') return acc + t.valor;
            if (t.tipo === 'despesa') return acc - t.valor;
            return acc;
        }, 0);

    // Histórico PENDENTE (Contas a receber/pagar atrasadas de anos anteriores)
    const historicoPendente = lancamentosFuturos
        .filter(l => l.status === 'pendente' && l.data_vencimento < dataCorteInicioAno)
        .reduce((acc, l) => {
            // Se for parcela de cartão, ignora no fluxo de caixa (só baixa quando paga fatura)
            const compraPai = l.compra_parcelada_id ? comprasParceladas.find(c => c.id === l.compra_parcelada_id) : null;
            if (compraPai && idsCartao.includes(compraPai.conta_id)) return acc;
            
            // Se tiver conta vinculada e for cartão, ignora
            if (l.conta_id && idsCartao.includes(l.conta_id)) return acc;

            if (l.tipo === 'a_receber') return acc + l.valor;
            if (l.tipo === 'a_pagar') return acc - l.valor;
            return acc;
        }, 0);

    // Ponto de partida para o Gráfico
    let saldoAcumulado = saldoInicialContas + historicoRealizado + historicoPendente;

    // --- 2. FLUXO MENSAL ---
    return meses.map(mesIndex => {
        const mesStr = `${ano}-${String(mesIndex + 1).padStart(2, '0')}`;
        
        // RECEITAS
        const recReal = transacoes.filter(t => t.data.startsWith(mesStr) && t.tipo === 'receita').reduce((s, t) => s + t.valor, 0);
        const recPrev = lancamentosFuturos.filter(l => l.data_vencimento.startsWith(mesStr) && l.tipo === 'a_receber' && l.status === 'pendente').reduce((s, l) => s + l.valor, 0);
        const totalReceitas = recReal + recPrev;

        // DESPESAS (CAIXA) - Exclui gastos de cartão
        const despReal = transacoes
            .filter(t => t.data.startsWith(mesStr) && t.tipo === 'despesa' && !idsCartao.includes(t.conta_id))
            .reduce((s, t) => s + t.valor, 0);
            
        const despPrev = lancamentosFuturos
            .filter(l => l.data_vencimento.startsWith(mesStr) && l.tipo === 'a_pagar' && l.status === 'pendente')
            .reduce((s, l) => {
                // Filtro avançado: se é fatura de cartão, não soma como despesa de caixa aqui
                const compraPai = l.compra_parcelada_id ? comprasParceladas.find(c => c.id === l.compra_parcelada_id) : null;
                // Se a compra original foi no cartão, a parcela não sai do caixa, sai da fatura.
                // O que sai do caixa é o "Pagamento de Fatura" (que deve ser lançado separadamente ou tratado aqui se houver)
                if (compraPai && idsCartao.includes(compraPai.conta_id)) return s;
                if (l.conta_id && idsCartao.includes(l.conta_id)) return s;
                
                return s + l.valor;
            }, 0);

        // GASTOS NO CARTÃO (Apenas para visualização, não afeta saldo de caixa até pagar fatura)
        const cartoes = transacoes
            .filter(t => t.data.startsWith(mesStr) && t.tipo === 'despesa' && idsCartao.includes(t.conta_id))
            .reduce((s, t) => s + t.valor, 0);

        // O Total de Despesas do gráfico deve mostrar O QUE SAIU DO BOLSO
        const totalDespesasCaixa = despReal + despPrev;

        const saldoMensal = totalReceitas - totalDespesasCaixa;
        saldoAcumulado += saldoMensal;

        return {
            mes: new Date(ano, mesIndex).toLocaleString('pt-BR', { month: 'long' }),
            receitas: totalReceitas,
            despesas: totalDespesasCaixa, // Mostra saída de caixa
            cartoes: cartoes, // Mostra uso do crédito (separado)
            saldo: saldoMensal,
            acumulado: saldoAcumulado
        };
    });
};

// 3. Tabela Detalhada (Grid)
export const calculateCategoryGrid = (state, anoSelecionado) => {
    const { contas, transacoes, lancamentosFuturos, comprasParceladas } = state; // Adicionado comprasParceladas
    const ano = anoSelecionado || new Date().getFullYear();
    const gridReceitas = {};
    const gridDespesas = {};
    const totaisMensais = Array(12).fill(0);
    const idsCartao = contas.filter(c => isTipoCartao(c.tipo)).map(c => c.id); // Identifica cartões

    // --- CÁLCULO DE SALDO ACUMULADO PARA A TABELA ---
    // (Mesma lógica do calculateAnnualTimeline para consistência)
    const saldoInicialContas = contas.filter(c => !isTipoCartao(c.tipo)).reduce((acc, c) => acc + c.saldo_inicial, 0);
    const dataCorte = `${ano}-01-01`;
    
    const historicoRealizado = transacoes
        .filter(t => t.data < dataCorte && !idsCartao.includes(t.conta_id)) // Ignora cartão
        .reduce((acc, t) => t.tipo === 'receita' ? acc + t.valor : acc - t.valor, 0);
        
    const historicoPendente = lancamentosFuturos
        .filter(l => l.status === 'pendente' && l.data_vencimento < dataCorte)
        .reduce((acc, l) => {
            const compraPai = l.compra_parcelada_id ? comprasParceladas.find(c => c.id === l.compra_parcelada_id) : null;
            if ((compraPai && idsCartao.includes(compraPai.conta_id)) || (l.conta_id && idsCartao.includes(l.conta_id))) return acc;
            return l.tipo === 'a_receber' ? acc + l.valor : acc - l.valor;
        }, 0);

    let saldoCorrente = saldoInicialContas + historicoRealizado + historicoPendente;
    const acumulados = [];

    // Função de adição
    const add = (tipo, cat, mes, val) => {
        const target = (tipo === 'receita' || tipo === 'a_receber') ? gridReceitas : gridDespesas;
        const catNome = cat || 'Outros';
        if (!target[catNome]) target[catNome] = Array(12).fill(0);
        target[catNome][mes] += val;
        
        if (tipo === 'receita' || tipo === 'a_receber') totaisMensais[mes] += val;
        else totaisMensais[mes] -= val;
    };

    // Processa Transações (Só Caixa)
    transacoes.forEach(t => {
        if (t.data.startsWith(`${ano}-`) && !idsCartao.includes(t.conta_id)) {
            add(t.tipo, t.categoria, parseInt(t.data.split('-')[1]) - 1, t.valor);
        }
    });

    // Processa Pendentes (Só Caixa)
    lancamentosFuturos.forEach(l => {
        if (l.status === 'pendente' && l.data_vencimento.startsWith(`${ano}-`)) {
            const compraPai = l.compra_parcelada_id ? comprasParceladas.find(c => c.id === l.compra_parcelada_id) : null;
            // Se for cartão, pula (não afeta caixa imediato)
            if ((compraPai && idsCartao.includes(compraPai.conta_id)) || (l.conta_id && idsCartao.includes(l.conta_id))) return;

            const tipo = l.tipo === 'a_receber' ? 'receita' : 'despesa';
            add(tipo, l.categoria, parseInt(l.data_vencimento.split('-')[1]) - 1, l.valor);
        }
    });

    // Gera linha de acumulado
    for(let i=0; i<12; i++) {
        saldoCorrente += totaisMensais[i];
        acumulados.push(saldoCorrente);
    }

    return { receitas: gridReceitas, despesas: gridDespesas, saldos: totaisMensais, acumulados };
};
