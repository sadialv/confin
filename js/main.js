// ARQUIVO: js/main.js
import * as UI from './ui.js';
import * as API from './api.js';
import * as State from './state.js';
import { applyTheme, toISODateString } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {

    // Define filtros iniciais
    let historyFilters = { mes: new Date().toISOString().slice(0, 7), pesquisa: '', contaId: 'todas' };
    let billsFilters = { mes: 'todos', pesquisa: '', contaId: 'todas' };

    // --- LÓGICA DE CARREGAMENTO INTELIGENTE (FASE 3) ---
    async function carregarDadosOtimizados() {
        try {
            // 1. Define Data de Corte: 1º de Janeiro do ano atual
            const anoAtual = new Date().getFullYear();
            const dataCorte = `${anoAtual}-01-01`;

            // 2. Carrega dados auxiliares e o resumo antigo em paralelo
            const [auxiliares, transacoesAntigas, transacoesRecentes] = await Promise.all([
                API.fetchDadosAuxiliares(),
                API.fetchResumoTransacoesAntigas(dataCorte),
                API.fetchTransacoesRecentes(dataCorte)
            ]);

            // 3. Calcula o "Saldo Acumulado" dos anos anteriores
            // Isso evita que o saldo das contas fique errado ao ignorarmos transações antigas
            const saldosAcumulados = {}; 
            transacoesAntigas.forEach(t => {
                const valor = t.tipo === 'receita' ? t.valor : -t.valor;
                saldosAcumulados[t.conta_id] = (saldosAcumulados[t.conta_id] || 0) + valor;
            });

            // 4. Atualiza o saldo inicial das contas na memória (sem alterar o banco)
            const contasAjustadas = auxiliares.contas.map(conta => {
                const acumuladoAntigo = saldosAcumulados[conta.id] || 0;
                return {
                    ...conta,
                    saldo_inicial: conta.saldo_inicial + acumuladoAntigo
                };
            });

            // 5. Salva no Estado Global
            State.setState({
                contas: contasAjustadas.sort((a, b) => a.nome.localeCompare(b.nome)),
                lancamentosFuturos: auxiliares.lancamentosFuturos,
                comprasParceladas: auxiliares.comprasParceladas,
                transacoes: transacoesRecentes // O sistema só "vê" transações deste ano
            });

            // 6. Renderiza a tela
            UI.renderAllComponents({ history: historyFilters, bills: billsFilters });
            
            // Feedback visual se for o primeiro load
            console.log(`Sistema carregado. Transações visíveis: ${transacoesRecentes.length}. Data de corte: ${dataCorte}`);

        } catch (error) {
            UI.showToast(`Erro ao carregar: ${error.message}`, 'error');
            console.error(error);
        }
    }

    // Função wrapper para compatibilidade com o resto do código
    async function reloadStateAndRender() {
        await carregarDadosOtimizados();
    }

    // --- AÇÕES DO SISTEMA (Idênticas à Fase anterior, apenas usando reloadStateAndRender) ---

    async function criarLancamentosParcelados(dadosCompra) {
        const conta = State.getContaPorId(dadosCompra.conta_id);
        if (!conta || !conta.dia_fechamento_cartao || !conta.dia_vencimento_cartao) {
            throw new Error("Para compras parceladas, o cartão precisa ter Dia de Fechamento e Vencimento.");
        }
        const compraSalva = await API.salvarDados('compras_parceladas', dadosCompra);
        const valorParcela = parseFloat((dadosCompra.valor_total / dadosCompra.numero_parcelas).toFixed(2));
        const lancamentos = [];
        const dataCompra = new Date(dadosCompra.data_compra + 'T12:00:00');
        const diaFechamento = conta.dia_fechamento_cartao;
        const diaVencimento = conta.dia_vencimento_cartao;
        let dataPrimeiroFechamento = new Date(dataCompra.getFullYear(), dataCompra.getMonth(), diaFechamento, 12);
        if (dataCompra.getDate() >= diaFechamento) dataPrimeiroFechamento.setMonth(dataPrimeiroFechamento.getMonth() + 1);
        let dataPrimeiroVencimento = new Date(dataPrimeiroFechamento.getFullYear(), dataPrimeiroFechamento.getMonth(), diaVencimento, 12);
        if (diaVencimento < diaFechamento) dataPrimeiroVencimento.setMonth(dataPrimeiroVencimento.getMonth() + 1);
        
        for (let i = 0; i < dadosCompra.numero_parcelas; i++) {
            const dataVencimentoFinal = new Date(dataPrimeiroVencimento.getFullYear(), dataPrimeiroVencimento.getMonth() + i, diaVencimento, 12);
            lancamentos.push({
                descricao: `${dadosCompra.descricao} (${i + 1}/${dadosCompra.numero_parcelas})`, valor: valorParcela,
                data_vencimento: toISODateString(dataVencimentoFinal), tipo: 'a_pagar',
                status: 'pendente', compra_parcelada_id: compraSalva.id, categoria: dadosCompra.categoria
            });
        }
        if (lancamentos.length > 0) await API.salvarMultiplosLancamentos(lancamentos);
    }

    async function salvarConta(e) {
        const form = e.target;
        const btn = form.querySelector('button[type="submit"]');
        UI.setLoadingState(btn, true, 'Salvando...');
        try {
            const id = form.dataset.id;
            const data = Object.fromEntries(new FormData(form));
            data.saldo_inicial = parseFloat(data.saldo_inicial) || 0;
            if (data.dia_fechamento_cartao) data.dia_fechamento_cartao = parseInt(data.dia_fechamento_cartao);
            if (data.dia_vencimento_cartao) data.dia_vencimento_cartao = parseInt(data.dia_vencimento_cartao);
            
            const saved = await API.salvarDados('contas', data, id);
            // Ao salvar conta, recarregamos tudo para garantir consistência
            UI.closeModal();
            UI.showToast('Conta salva!');
            await reloadStateAndRender();
        } catch (err) { UI.showToast(err.message, 'error'); } finally { UI.setLoadingState(btn, false, 'Salvar'); }
    }

    async function deletarConta(id) {
        if (!confirm('Apagar conta?')) return;
        try { await API.deletarDados('contas', id); UI.showToast('Conta deletada.'); await reloadStateAndRender(); } 
        catch (err) { UI.showToast(err.message, 'error'); }
    }
    
    async function confirmarPagamento(e) {
        const form = e.target;
        const btn = form.querySelector('button[type="submit"]');
        UI.setLoadingState(btn, true);
        try {
            const data = Object.fromEntries(new FormData(form));
            const transacao = {
                descricao: form.dataset.desc, valor: parseFloat(form.dataset.valor),
                data: data.data, conta_id: parseInt(data.conta_id),
                categoria: form.dataset.cat, tipo: 'despesa',
                lancamento_futuro_id: parseInt(form.dataset.billId)
            };
            await API.salvarDados('transacoes', transacao);
            await API.salvarDados('lancamentos_futuros', { status: 'pago' }, form.dataset.billId);
            UI.closeModal();
            UI.showToast('Conta paga!');
            await reloadStateAndRender();
        } catch (err) { UI.showToast(err.message, 'error'); } finally { UI.setLoadingState(btn, false, 'Confirmar'); }
    }

    async function salvarTransacaoUnificada(e) {
        const form = e.target;
        const btn = form.querySelector('button[type="submit"]');
        UI.setLoadingState(btn, true, "Salvando...");
        try {
            const data = Object.fromEntries(new FormData(form));
            if (data.tipo_compra === 'vista') {
                await API.salvarDados('transacoes', {
                    descricao: data.descricao, valor: Math.abs(parseFloat(data.valor)),
                    data: data.data, conta_id: parseInt(data.conta_id), categoria: data.categoria, tipo: data.tipo
                });
                UI.showToast('Transação salva!');
            } else if (data.tipo_compra === 'parcelada') {
                await criarLancamentosParcelados({
                    descricao: data.descricao, valor_total: parseFloat(data.valor),
                    numero_parcelas: parseInt(data.numero_parcelas), data_compra: data.data,
                    conta_id: parseInt(data.conta_id), categoria: data.categoria,
                });
                UI.showToast('Compra parcelada lançada!');
            }
            form.reset();
            // Reseta eventos visuais do form
            form.querySelector('#tipo-compra')?.dispatchEvent(new Event('change'));
            await reloadStateAndRender();
        } catch (err) { UI.showToast(err.message, 'error'); } finally { UI.setLoadingState(btn, false, 'Salvar Transação'); }
    }

    async function salvarEdicaoTransacao(e) {
        const form = e.target;
        const btn = form.querySelector('button[type="submit"]');
        const id = form.dataset.id;
        UI.setLoadingState(btn, true);
        try {
            const data = Object.fromEntries(new FormData(form));
            data.valor = parseFloat(data.valor);
            data.conta_id = parseInt(data.conta_id);
            await API.salvarDados('transacoes', data, id);
            UI.closeModal();
            UI.showToast('Transação atualizada!');
            await reloadStateAndRender();
        } catch (err) { UI.showToast(err.message, 'error'); } finally { UI.setLoadingState(btn, false, 'Salvar Alterações'); }
    }

    async function salvarLancamentoFuturo(e) {
        const form = e.target;
        const btn = form.querySelector('button[type="submit"]');
        const id = form.dataset.id;
        UI.setLoadingState(btn, true);
        try {
            const data = Object.fromEntries(new FormData(form));
            data.valor = parseFloat(data.valor);
            await API.salvarDados('lancamentos_futuros', data, id);
            UI.closeModal();
            UI.showToast(`Lançamento ${id ? 'atualizado' : 'salvo'}!`);
            await reloadStateAndRender();
        } catch (err) { UI.showToast(err.message, 'error'); } finally { UI.setLoadingState(btn, false, 'Salvar'); }
    }

    async function salvarCompraParcelada(e) {
        const form = e.target;
        const btn = form.querySelector('button[type="submit"]');
        const idCompraAntiga = form.dataset.compraAntigaId ? parseInt(form.dataset.compraAntigaId) : null;
        UI.setLoadingState(btn, true);
        try {
            if (idCompraAntiga) await deletarCompraParceladaCompleta(idCompraAntiga);
            const data = Object.fromEntries(new FormData(form));
            await criarLancamentosParcelados({
                descricao: data.descricao, valor_total: parseFloat(data.valor_total),
                numero_parcelas: parseInt(data.numero_parcelas), data_compra: data.data_compra,
                conta_id: parseInt(data.conta_id), categoria: data.categoria,
            });
            UI.closeModal();
            UI.showToast(`Compra parcelada ${idCompraAntiga ? 'recriada' : 'salva'}!`);
            await reloadStateAndRender();
        } catch (err) { UI.showToast(err.message, 'error'); } finally { UI.setLoadingState(btn, false, idCompraAntiga ? 'Salvar e Substituir' : 'Salvar Compra'); }
    }
    
    async function deletarCompraParceladaCompleta(compraId) {
        if (!compraId) return;
        try {
            await API.deletarLancamentosPorCompraId(compraId);
            await API.deletarDados('compras_parceladas', compraId);
        } catch (error) { throw error; }
    }
    
    async function deletarLancamento(id, compraId) { 
        if (compraId) {
            if (!confirm('Este é um lançamento parcelado. Deseja apagar a compra inteira e todas as suas parcelas?')) return;
            try { await deletarCompraParceladaCompleta(compraId); UI.showToast('Compra deletada!'); await reloadStateAndRender(); } catch (err) { UI.showToast(err.message, 'error'); }
        } else {
            if (!confirm('Apagar este lançamento?')) return;
            try { await API.deletarDados('lancamentos_futuros', id); UI.showToast('Lançamento deletado.'); await reloadStateAndRender(); } catch (err) { UI.showToast(err.message, 'error'); }
        }
    }

    async function deletarTransacao(id) { 
        if (!confirm('Apagar transação?')) return;
        try { await API.deletarDados('transacoes', id); UI.showToast('Transação deletada.'); await reloadStateAndRender(); } catch (err) { UI.showToast(err.message, 'error'); }
    }

    // --- SETUP LISTENERS ---
    function setupEventListeners() {
        document.getElementById('theme-switcher').addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            applyTheme(current === 'light' ? 'dark' : 'light');
        });
        document.getElementById('btn-add-account').addEventListener('click', () => UI.openModal(UI.getAccountModalContent()));
        
        document.body.addEventListener('click', e => {
            if (e.target.matches('#modal-container, #modal-close-btn, .btn-close')) UI.closeModal();
            const target = e.target.closest('[data-action]');
            if (!target) return;
            const action = target.dataset.action;
            const id = parseInt(target.dataset.id);
            const compraId = parseInt(target.dataset.compraId);
            
            if(action === 'editar-conta') UI.openModal(UI.getAccountModalContent(id));
            if(action === 'deletar-conta') deletarConta(id);
            if(action === 'ver-fatura') {
                UI.openModal(UI.getStatementModalContent(id));
                document.getElementById('statement-month-select')?.addEventListener('change', (e) => UI.renderStatementDetails(parseInt(e.target.dataset.contaId), e.target.value));
            }
            if(action === 'ver-extrato') {
                UI.openModal(UI.getAccountStatementModalContent(id));
                document.getElementById('account-statement-month-select')?.addEventListener('change', (e) => UI.renderAccountStatementDetails(parseInt(e.target.dataset.contaId), e.target.value));
            }
            if(action === 'pagar-conta') UI.openModal(UI.getPayBillModalContent(id));
            if(action === 'editar-lancamento') UI.openModal(UI.getBillModalContent(id));
            if(action === 'deletar-lancamento') deletarLancamento(id, compraId);
            if(action === 'recriar-compra-parcelada') {
                 const compra = State.getState().comprasParceladas.find(c => c.id === id);
                 if (compra) UI.openModal(UI.getInstallmentPurchaseModalContent(compra));
            }
            if(action === 'editar-transacao') UI.openModal(UI.getTransactionModalContent(id));
            if(action === 'deletar-transacao') deletarTransacao(id);
        });

        document.body.addEventListener('change', e => {
            if (e.target.id === 'tab-statement-month-select') UI.renderMonthlyStatementDetails(e.target.value);
            if (e.target.id === 'conta-tipo') {
                const isCard = e.target.value === 'Cartão de Crédito';
                const div = document.getElementById('cartao-credito-fields');
                if(div) div.style.display = isCard ? 'block' : 'none';
            }
            if (e.target.id === 'tipo-compra') {
                const tipo = e.target.value;
                const form = e.target.closest('form');
                const parceladaFields = form.querySelector('#parcelada-fields');
                const recorrenteFields = form.querySelector('#recorrente-fields');
                const labelValor = form.querySelector('#label-valor');
                const selectConta = form.querySelector('select[name="conta_id"]');
                if (parceladaFields) parceladaFields.style.display = 'none';
                if (recorrenteFields) recorrenteFields.style.display = 'none';
                
                if (selectConta.dataset.allOptions) selectConta.innerHTML = selectConta.dataset.allOptions;

                if (tipo === 'parcelada') {
                    if (parceladaFields) parceladaFields.style.display = 'block';
                    labelValor.textContent = 'Valor Total';
                    if (selectConta.dataset.creditCardOptions) selectConta.innerHTML = selectConta.dataset.creditCardOptions;
                } else if (tipo === 'recorrente') {
                    if (recorrenteFields) recorrenteFields.style.display = 'block';
                    labelValor.textContent = 'Valor da Recorrência';
                } else {
                    labelValor.textContent = 'Valor';
                }
            }
            if (e.target.id === 'history-month-filter') {
                historyFilters.mes = e.target.value;
                UI.renderHistoricoTransacoes(1, historyFilters);
            }
            if (e.target.id === 'bills-month-filter') {
                billsFilters.mes = e.target.value;
                UI.renderLancamentosFuturos(1, billsFilters);
            }
            if (e.target.id === 'history-account-filter') {
                historyFilters.contaId = e.target.value;
                UI.renderHistoricoTransacoes(1, historyFilters);
            }
            if (e.target.id === 'bills-account-filter') {
                billsFilters.contaId = e.target.value;
                UI.renderLancamentosFuturos(1, billsFilters);
            }
        });
        
        document.body.addEventListener('input', e => {
            if (e.target.id === 'history-search-input') {
                historyFilters.pesquisa = e.target.value;
                UI.renderHistoricoTransacoes(1, historyFilters);
            }
            if (e.target.id === 'bills-search-input') {
                billsFilters.pesquisa = e.target.value;
                UI.renderLancamentosFuturos(1, billsFilters);
            }
        });

        document.body.addEventListener('submit', e => {
            e.preventDefault();
            if (e.target.id === 'form-conta') salvarConta(e);
            if (e.target.id === 'form-transacao-unificada') salvarTransacaoUnificada(e);
            if (e.target.id === 'form-pagamento') confirmarPagamento(e);
            if (e.target.id === 'form-edicao-transacao') salvarEdicaoTransacao(e);
            if (e.target.id === 'form-lancamento') salvarLancamentoFuturo(e);
            if (e.target.id === 'form-compra-parcelada') salvarCompraParcelada(e);
        });
    }

    async function initializeApp() {
        UI.showToast('Iniciando...');
        await carregarDadosOtimizados();
    }
    
    applyTheme(localStorage.getItem('confin-theme') || 'light');
    setupEventListeners();
    initializeApp();
});
