// ARQUIVO: js/main.js
import * as UI from './ui.js';
import * as API from './api.js';
import * as State from './state.js';
import { applyTheme, toISODateString } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {

    let historyFilters = { mes: new Date().toISOString().slice(0, 7), pesquisa: '', contaId: 'todas' };
    let billsFilters = { mes: 'todos', pesquisa: '', contaId: 'todas' };

    async function carregarDadosOtimizados() {
        try {
            const anoAtual = new Date().getFullYear();
            const dataCorte = `${anoAtual}-01-01`;

            const [auxiliares, transacoesAntigas, transacoesRecentes] = await Promise.all([
                API.fetchDadosAuxiliares(),
                API.fetchResumoTransacoesAntigas(dataCorte),
                API.fetchTransacoesRecentes(dataCorte)
            ]);

            const saldosAcumulados = {}; 
            transacoesAntigas.forEach(t => {
                const valor = t.tipo === 'receita' ? t.valor : -t.valor;
                saldosAcumulados[t.conta_id] = (saldosAcumulados[t.conta_id] || 0) + valor;
            });

            const contasAjustadas = auxiliares.contas.map(conta => {
                const acumuladoAntigo = saldosAcumulados[conta.id] || 0;
                return {
                    ...conta,
                    saldo_inicial: conta.saldo_inicial + acumuladoAntigo
                };
            });

            State.setState({
                contas: contasAjustadas.sort((a, b) => a.nome.localeCompare(b.nome)),
                lancamentosFuturos: auxiliares.lancamentosFuturos,
                comprasParceladas: auxiliares.comprasParceladas,
                transacoes: transacoesRecentes
            });

            UI.renderAllComponents({ history: historyFilters, bills: billsFilters });
            
        } catch (error) {
            UI.showToast(`Erro ao carregar: ${error.message}`, 'error');
            console.error(error);
        }
    }

    async function reloadStateAndRender() {
        await carregarDadosOtimizados();
    }

    // --- AÇÕES DO SISTEMA ---

    async function criarLancamentosParcelados(dadosCompra) {
        const conta = State.getContaPorId(dadosCompra.conta_id);
        if (!conta || !conta.dia_fechamento_cartao || !conta.dia_vencimento_cartao) {
            throw new Error("Para compras parceladas, o cartão precisa ter dados de fatura.");
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
            
            await API.salvarDados('contas', data, id);
            UI.closeModal();
            UI.showToast('Conta salva!');
            await reloadStateAndRender();
        } catch (err) { UI.showToast(err.message, 'error'); } finally { UI.setLoadingState(btn, false, 'Salvar'); }
    }

    async function deletarConta(id) {
        if (!confirm('Apagar conta?')) return;
        try { await API.deletarDados('contas', id); UI.showToast('Conta deletada.'); await reloadStateAndRender(); } catch (err) { UI.showToast(err.message, 'error'); }
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
                categoria: form.dataset.cat, tipo: 'despesa', // Default, ajustado abaixo
                lancamento_futuro_id: parseInt(form.dataset.billId)
            };
            
            // Ajusta o tipo baseado na categoria ou lógica visual (se veio do botão verde/azul)
            // Mas o mais seguro é pegar do próprio lançamento se possível, ou inferir.
            // Para simplificar: se o form tem classe income-text no titulo, é receita. 
            // Melhor: vamos confiar que 'Pagar' é despesa, mas se o usuário usou o botão de receita...
            // O jeito mais seguro é verificar o tipo do lancamento original no state
            const lancamentoOriginal = State.getState().lancamentosFuturos.find(l => l.id == form.dataset.billId);
            if (lancamentoOriginal) {
                transacao.tipo = lancamentoOriginal.tipo === 'a_receber' ? 'receita' : 'despesa';
            }

            await API.salvarDados('transacoes', transacao);
            await API.salvarDados('lancamentos_futuros', { status: 'pago' }, form.dataset.billId);
            
            UI.closeModal();
            UI.showToast('Registrado com sucesso!');
            await reloadStateAndRender();
        } catch (err) { UI.showToast(err.message, 'error'); } finally { UI.setLoadingState(btn, false, 'Confirmar'); }
    }

    async function salvarTransacaoUnificada(e) {
        const form = e.target;
        const btn = form.querySelector('button[type="submit"]');
        UI.setLoadingState(btn, true, "Salvando...");
        try {
            const data = Object.fromEntries(new FormData(form));
            const tipoLancamentoFuturo = data.tipo === 'receita' ? 'a_receber' : 'a_pagar';

            if (data.tipo_compra === 'vista') {
                await API.salvarDados('transacoes', {
                    descricao: data.descricao, valor: Math.abs(parseFloat(data.valor)),
                    data: data.data, conta_id: parseInt(data.conta_id),
                    categoria: data.categoria, tipo: data.tipo
                });
                UI.showToast('Transação salva!');

            } else if (data.tipo_compra === 'parcelada') {
                await criarLancamentosParcelados({
                    descricao: data.descricao, valor_total: parseFloat(data.valor),
                    numero_parcelas: parseInt(data.numero_parcelas), data_compra: data.data,
                    conta_id: parseInt(data.conta_id), categoria: data.categoria,
                });
                UI.showToast('Compra parcelada lançada!');

            } else if (data.tipo_compra === 'recorrente') {
                const valor = parseFloat(data.valor);
                const quantidade = parseInt(data.quantidade);
                const dataInicio = new Date(data.data + 'T12:00:00');
                const diaVencimento = parseInt(data.dia_vencimento);
                const frequencia = data.frequencia;

                const dadosSerie = {
                    descricao: `${data.descricao} (Série)`, valor_total: valor * quantidade,
                    numero_parcelas: quantidade, data_compra: data.data,
                    conta_id: parseInt(data.conta_id), categoria: data.categoria
                };
                const serieSalva = await API.salvarDados('compras_parceladas', dadosSerie);
                const lancamentos = [];
                
                for (let i = 0; i < quantidade; i++) {
                    let proximaData = new Date(dataInicio); // Clone
                    if (frequencia === 'mensal') {
                        proximaData.setMonth(dataInicio.getMonth() + i);
                        proximaData.setDate(Math.min(diaVencimento, new Date(proximaData.getFullYear(), proximaData.getMonth() + 1, 0).getDate()));
                    } else if (frequencia === 'anual') {
                        proximaData.setFullYear(dataInicio.getFullYear() + i);
                    } else if (frequencia === 'quinzenal') {
                        proximaData.setDate(dataInicio.getDate() + (i * 15));
                    } else { // diaria
                        proximaData.setDate(dataInicio.getDate() + i);
                    }

                    lancamentos.push({
                        descricao: `${data.descricao} (${i + 1}/${quantidade})`, valor: Math.abs(valor),
                        data_vencimento: toISODateString(proximaData), tipo: tipoLancamentoFuturo,
                        status: 'pendente', categoria: data.categoria, compra_parcelada_id: serieSalva.id
                    });
                }
                if (lancamentos.length > 0) await API.salvarMultiplosLancamentos(lancamentos);
                UI.showToast(`Série criada!`);
            }
            form.reset();
            form.querySelector('#tipo-compra')?.dispatchEvent(new Event('change'));
            await reloadStateAndRender();
        } catch (err) { UI.showToast(err.message, 'error'); } finally { UI.setLoadingState(btn, false, 'Salvar'); }
    }
    
    async function salvarEdicaoTransacao(e) { /* Lógica padrão de edição */ 
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
            UI.showToast('Atualizado!');
            await reloadStateAndRender();
        } catch (err) { UI.showToast(err.message, 'error'); } finally { UI.setLoadingState(btn, false, 'Salvar'); }
    }

    async function salvarLancamentoFuturo(e) { /* Lógica padrão de edição */
        const form = e.target;
        const btn = form.querySelector('button[type="submit"]');
        const id = form.dataset.id;
        UI.setLoadingState(btn, true);
        try {
            const data = Object.fromEntries(new FormData(form));
            data.valor = parseFloat(data.valor);
            await API.salvarDados('lancamentos_futuros', data, id);
            UI.closeModal();
            UI.showToast('Atualizado!');
            await reloadStateAndRender();
        } catch (err) { UI.showToast(err.message, 'error'); } finally { UI.setLoadingState(btn, false, 'Salvar'); }
    }

    // --- FUNÇÃO INTELIGENTE DE ATUALIZAÇÃO DE SÉRIE ---
    async function salvarCompraParcelada(e) {
        const form = e.target;
        const btn = form.querySelector('button[type="submit"]');
        const idSerie = form.dataset.compraAntigaId ? parseInt(form.dataset.compraAntigaId) : null;
        
        UI.setLoadingState(btn, true, 'Atualizando...');
        
        try {
            const data = Object.fromEntries(new FormData(form));
            const tipoSerie = data.tipo_serie;
            const valorUnitario = parseFloat(data.valor_total);
            
            // 1. Atualiza Pai
            await API.salvarDados('compras_parceladas', {
                descricao: data.descricao, conta_id: parseInt(data.conta_id),
                categoria: data.categoria, data_compra: data.data_inicio
            }, idSerie);

            // 2. Apaga FUTUROS PENDENTES
            await API.deletarLancamentosPendentesPorCompraId(idSerie);

            // 3. Verifica HISTÓRICO PAGO para evitar duplicidade no mês
            const itensPagos = State.getState().lancamentosFuturos.filter(l => 
                l.compra_parcelada_id === idSerie && l.status === 'pago'
            );
            const mesesPagos = new Set(itensPagos.map(l => l.data_vencimento.substring(0, 7)));

            // 4. Recria
            const lancamentos = [];
            const dataInicio = new Date(data.data_inicio + 'T12:00:00');
            const lancamentosAntigos = State.getState().lancamentosFuturos.filter(l => l.compra_parcelada_id === idSerie);
            const tipoOriginal = lancamentosAntigos.length > 0 ? lancamentosAntigos[0].tipo : 'a_pagar'; 

            if (tipoSerie === 'parcelada') {
                for (let i = 0; i < parseInt(data.numero_parcelas); i++) {
                     let dataVenc = new Date(dataInicio);
                     dataVenc.setMonth(dataInicio.getMonth() + i);
                     lancamentos.push({
                        descricao: `${data.descricao} (${i + 1}/${data.numero_parcelas})`,
                        valor: valorUnitario / parseInt(data.numero_parcelas),
                        data_vencimento: toISODateString(dataVenc),
                        tipo: 'a_pagar', status: 'pendente', compra_parcelada_id: idSerie, categoria: data.categoria
                    });
                }
            } else {
                // RECORRENTE
                const quantidade = parseInt(data.quantidade);
                const frequencia = data.frequencia;
                
                for (let i = 0; i < quantidade; i++) {
                    let proximaData = new Date(dataInicio);
                    
                    if (frequencia === 'mensal') {
                        proximaData.setMonth(dataInicio.getMonth() + i);
                        
                        // CHECK ANTI-DUPLICIDADE:
                        // Se já existe um pagamento para este mês nesta série, não cria o pendente.
                        const mesCheck = toISODateString(proximaData).substring(0, 7);
                        if (mesesPagos.has(mesCheck)) {
                            continue; // Pula a criação deste mês pois já está pago
                        }

                    } else if (frequencia === 'semestral') {
                        proximaData.setMonth(dataInicio.getMonth() + (i * 6));
                    } else if (frequencia === 'anual') {
                        proximaData.setFullYear(dataInicio.getFullYear() + i);
                    } else if (frequencia === 'quinzenal') {
                        proximaData.setDate(dataInicio.getDate() + (i * 15));
                    }

                    lancamentos.push({
                        descricao: `${data.descricao} (Renovado ${i + 1})`,
                        valor: valorUnitario,
                        data_vencimento: toISODateString(proximaData),
                        tipo: tipoOriginal,
                        status: 'pendente', compra_parcelada_id: idSerie, categoria: data.categoria
                    });
                }
            }

            if (lancamentos.length > 0) await API.salvarMultiplosLancamentos(lancamentos);
            UI.closeModal();
            UI.showToast('Série atualizada com sucesso!');
            await reloadStateAndRender();

        } catch (err) { UI.showToast(err.message, 'error'); console.error(err); } finally { UI.setLoadingState(btn, false, 'Salvar Alterações'); }
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
            if (!confirm('Esta é uma série recorrente.\n\n[OK] Apagar SÉRIE COMPLETA (todos os itens)\n[Cancelar] Apagar APENAS ESTE item')) {
                 try { await API.deletarDados('lancamentos_futuros', id); UI.showToast('Item único deletado.'); await reloadStateAndRender(); } catch(err) { UI.showToast(err.message, 'error'); }
                 return;
            }
            try { await deletarCompraParceladaCompleta(compraId); UI.showToast('Série deletada!'); await reloadStateAndRender(); } catch (err) { UI.showToast(err.message, 'error'); }
        } else {
            if (!confirm('Apagar?')) return;
            try { await API.deletarDados('lancamentos_futuros', id); UI.showToast('Deletado.'); await reloadStateAndRender(); } catch (err) { UI.showToast(err.message, 'error'); }
        }
    }

    async function deletarTransacao(id) { 
        if (!confirm('Apagar transação?')) return;
        try { await API.deletarDados('transacoes', id); UI.showToast('Deletada.'); await reloadStateAndRender(); } catch (err) { UI.showToast(err.message, 'error'); }
    }

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
            if(action === 'recriar-compra-parcelada') {
                 const compra = State.getState().comprasParceladas.find(c => c.id === id);
                 if (compra) UI.openModal(UI.getInstallmentPurchaseModalContent(compra));
            }
            if(action === 'deletar-lancamento') deletarLancamento(id, compraId);
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
                if(parceladaFields) parceladaFields.style.display = 'none';
                if(recorrenteFields) recorrenteFields.style.display = 'none';
                if (selectConta.dataset.allOptions) selectConta.innerHTML = selectConta.dataset.allOptions;

                if (tipo === 'parcelada') {
                    if(parceladaFields) parceladaFields.style.display = 'block';
                    labelValor.textContent = 'Valor Total';
                    if (selectConta.dataset.creditCardOptions) selectConta.innerHTML = selectConta.dataset.creditCardOptions;
                } else if (tipo === 'recorrente') {
                    if(recorrenteFields) recorrenteFields.style.display = 'block';
                    labelValor.textContent = 'Valor da Recorrência';
                } else {
                    labelValor.textContent = 'Valor';
                }
            }
            
            if (e.target.id.includes('filter')) {
                if(e.target.id.includes('history')) {
                    historyFilters[e.target.id.includes('month') ? 'mes' : 'contaId'] = e.target.value;
                    UI.renderHistoricoTransacoes(1, historyFilters);
                } else {
                    billsFilters[e.target.id.includes('month') ? 'mes' : 'contaId'] = e.target.value;
                    UI.renderLancamentosFuturos(1, billsFilters);
                }
            }
        });
        
        document.body.addEventListener('input', e => {
            if (e.target.id === 'history-search-input') { historyFilters.pesquisa = e.target.value; UI.renderHistoricoTransacoes(1, historyFilters); }
            if (e.target.id === 'bills-search-input') { billsFilters.pesquisa = e.target.value; UI.renderLancamentosFuturos(1, billsFilters); }
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
