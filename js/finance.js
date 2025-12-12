// ARQUIVO: js/finance.js
import { isTipoCartao } from './state.js';

// --- MÉTODOS AUXILIARES ---
const isContaInvestimento = (tipoConta) => {
    if (!tipoConta) return false;
    const tiposInvestimento = ['Investimentos', 'Poupança', 'Aplicação', 'CDB', 'Tesouro', 'Ações', 'Fundos'];
    return tiposInvestimento.some(t => tipoConta.includes(t));
};

export const calculateFinancialHealthMetrics = (state, mesSelecionado = null) => {
    // (Mantenha a função calculateFinancialHealthMetrics IGUAL à versão anterior para economizar espaço aqui,
    // pois a mudança principal é na calculateCategoryGrid. Se precisar dela completa, avise).
    // ... Código das métricas ...
    // Vou incluir um return básico para não quebrar caso copie e cole tudo, 
    // mas o ideal é manter a lógica que passei na resposta anterior para esta função específica.
    return { financialScore: 0, historicoPatrimonio: [] }; 
};

// Mantenha calculateDailyEvolution e calculateAnnualTimeline iguais...
export const calculateDailyEvolution = (state, mesISO) => { return []; }; 
export const calculateAnnualTimeline = (state, ano) => { return []; };


// === AQUI ESTÁ A NOVA LÓGICA DE FLUXO DE CAIXA REAL ===
export const calculateCategoryGrid = (state, anoSelecionado) => {
    const { contas, transacoes, lancamentosFuturos, comprasParceladas } = state;
    const ano = anoSelecionado || new Date().getFullYear();

    // 1. Classificação
    const idsInvest = contas.filter(c => isContaInvestimento(c.tipo)).map(c => c.id);
    const idsCartao = contas.filter(c => isTipoCartao(c.tipo)).map(c => c.id);
    const idsConta = contas.filter(c => !idsInvest.includes(c.id) && !idsCartao.includes(c.id)).map(c => c.id);

    // 2. Saldos Iniciais (Até 31/Dez anterior)
    const dataCorte = `${ano}-01-01`;

    const getSaldoAbertura = (ids) => {
        let saldo = contas.filter(c => ids.includes(c.id)).reduce((a, c) => a + c.saldo_inicial, 0);
        
        saldo += transacoes.filter(t => t.data < dataCorte && ids.includes(t.conta_id))
            .reduce((a, t) => t.tipo === 'receita' ? a + t.valor : a - t.valor, 0);
        
        saldo += lancamentosFuturos.filter(l => l.status === 'pendente' && l.data_vencimento < dataCorte && ids.includes(l.conta_id))
            .reduce((a, l) => l.tipo === 'a_receber' ? a + l.valor : a - l.valor, 0);
            
        return saldo;
    };

    // Saldos Dinâmicos (Vão mudar mês a mês no loop)
    let saldoInvestAtual = getSaldoAbertura(idsInvest);
    let saldoCaixaAtual = getSaldoAbertura(idsConta);

    // Arrays para a Tabela
    const gridReceitas = {};
    const gridDespesas = {};
    const arrReceitas = Array(12).fill(0);
    const arrDespesas = Array(12).fill(0);
    
    const arrSaldosInvestimento = Array(12).fill(0);
    const arrSaldosConta = Array(12).fill(0);
    const arrResgates = Array(12).fill(0); // Novo: Valor retirado do investimento
    const arrSaldoLiquido = Array(12).fill(0);

    // 3. Loop Mensal (Simulação da Realidade)
    for (let i = 0; i < 12; i++) {
        const mesStr = `${ano}-${String(i + 1).padStart(2, '0')}`;
        
        // Registra o saldo de abertura deste mês
        arrSaldosInvestimento[i] = saldoInvestAtual;
        arrSaldosConta[i] = saldoCaixaAtual;

        let recMes = 0;
        let despMes = 0;
        
        // Movimentação Operacional do Mês
        let fluxoInvest = 0; // Aportes ou Resgates manuais
        let fluxoCaixa = 0;  // Contas pagas e recebidas

        const processar = (valor, tipo, contaId, cat) => {
            const c = cat || 'Outros';
            const isDestinoInvest = idsInvest.includes(contaId);
            const isDestinoCaixa = idsConta.includes(contaId);
            const isFallbackCaixa = !contaId && !isDestinoInvest && !idsCartao.includes(contaId);

            if (tipo === 'receita') {
                recMes += valor;
                if (!gridReceitas[c]) gridReceitas[c] = Array(12).fill(0);
                gridReceitas[c][i] += valor;
                
                if (isDestinoInvest) fluxoInvest += valor;
                else if (isDestinoCaixa || isFallbackCaixa) fluxoCaixa += valor;

            } else { // Despesa
                despMes += valor;
                if (!gridDespesas[c]) gridDespesas[c] = Array(12).fill(0);
                gridDespesas[c][i] += valor;

                if (isDestinoInvest) fluxoInvest -= valor;
                else if (isDestinoCaixa || isFallbackCaixa) fluxoCaixa -= valor;
            }
        };

        // Processa Dados
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

        // === LÓGICA DE RESGATE AUTOMÁTICO ===
        
        // 1. Aplica o fluxo do mês
        let caixaPrevisorio = saldoCaixaAtual + fluxoCaixa;
        let investPrevisorio = saldoInvestAtual + fluxoInvest;
        let resgateNecessario = 0;

        // 2. Se o caixa ficou negativo, tenta cobrir com investimento
        if (caixaPrevisorio < 0) {
            const deficit = Math.abs(caixaPrevisorio);
            
            if (investPrevisorio >= deficit) {
                // Tem dinheiro suficiente investido
                resgateNecessario = deficit;
                investPrevisorio -= deficit; // Tira do investimento
                caixaPrevisorio = 0;         // Zera o caixa (dívida paga)
            } else {
                // Não tem dinheiro suficiente, usa tudo que tem
                resgateNecessario = investPrevisorio; // Resgata tudo
                caixaPrevisorio += investPrevisorio;  // Abate a dívida, mas continua negativo
                investPrevisorio = 0;                 // Investimento zerou
            }
        }

        arrResgates[i] = resgateNecessario;

        // 3. Atualiza os saldos finais para o próximo mês
        saldoCaixaAtual = caixaPrevisorio;
        saldoInvestAtual = investPrevisorio;

        // 4. Saldo Líquido Total
        arrSaldoLiquido[i] = saldoCaixaAtual + saldoInvestAtual;
    }

    return { 
        receitas: gridReceitas, 
        despesas: gridDespesas, 
        totalReceitas: arrReceitas, 
        totalDespesas: arrDespesas, 
        saldosInvestimento: arrSaldosInvestimento, 
        saldosConta: arrSaldosConta, 
        resgates: arrResgates, // Novo Array
        saldoLiquido: arrSaldoLiquido
    };
};
