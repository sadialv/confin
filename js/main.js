import * as UI from './ui.js';
import * as API from './api.js';
import * as State from './state.js';
import { applyTheme, toISODateString } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {

    // Estado dos filtros e paginação
    let historyCurrentPage = 1;
    let historyFilters = { 
        mes: new Date().toISOString().slice(0, 7), // Padrão para o mês atual
        pesquisa: '',
        contaId: 'todas'
    };
    let billsCurrentPage = 1;
    let billsFilters = { 
        mes: 'todos', 
        pesquisa: '',
        contaId: 'todas'
    };

    async function reloadStateAndRender() {
        try {
            const data = await API.fetchData();
            State.setState(data);
            UI.renderAllComponents({ history: historyFilters, bills: billsFilters });
        } catch (error) {
            UI.showToast(error.message, 'error');
        }
    }

    // --- AÇÕES (Salvar, Deletar, etc.) ---

    async function salvarConta(e) {
        const form = e.target;
        const btn = form.querySelector('button[type="submit"]');
        UI.setLoadingState(btn, true, 'Salvando...');
        try {
            const id = form.dataset.id;
            const data = Object.fromEntries(new FormData(form));
            data.saldo_inicial = parseFloat(data.saldo_inicial) || 0;
            if (data.dia_fechamento_cartao) {
                data.dia_fechamento_cartao = parseInt(data.dia_fechamento_cartao);
            }
            if (data.dia_vencimento_fatura) {
                data.dia_vencimento_fatura = parseInt(data.dia_vencimento_fatura);
            }
            const saved = await API.salvarDados('contas', data, id);
            const state = State.getState();
            const newContas = id ? state.contas.map(c => c.id == saved.id ? saved : c) : [...state.contas, saved];
            State.setState({ contas: newContas.sort((a, b) => a.nome.localeCompare(b.nome)) });
            UI.renderContas();
            UI.closeModal();
            UI.showToast('Conta salva!');
        } catch (err) {
            UI.showToast(err.message, 'error');
        } finally {
            UI.setLoadingState(btn, false, 'Salvar');
        }
    }

    async function deletarConta(id) {
        if (!confirm('Apagar conta? As transações associadas não serão apagadas.')) return;
        try {
            await API.deletarDados('contas', id);
            State.setState({ contas: State.getState().contas.filter(c => c.id !== id) });
            UI.renderContas();
            UI.showToast('Conta deletada.');
        } catch (err) {
            UI.showToast(err.message, 'error');
        }
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
                categoria: form.dataset.cat, tipo: 'despesa'
            };
            await API.salvarDados('transacoes', transacao);
            await API.salvarDados('lancamentos_futuros', { status: 'pago' }, form.dataset.billId);
            UI.closeModal();
            UI.showToast('Conta paga!');
            await reloadStateAndRender();
        } catch (err) {
            UI.showToast(err.message, 'error');
        } finally {
            UI.setLoadingState(btn, false, 'Confirmar');
        }
    }

    async function salvarTransacaoUnificada(e) {
        const form = e.target;
        const btn = form.querySelector('button[type="submit"]');
        UI.setLoadingState(btn, true, "Salvando...");
        try {
            const data = Object.fromEntries(new FormData(form));
            const tipoCompra = data.tipo_compra;
            let toastMessage = '';

            if (tipoCompra === 'vista') {
                const transacao = {
                    descricao: data.descricao,
                    valor: Math.abs(parseFloat(data.valor)),
                    data: data.data,
                    conta_id: parseInt(data.conta_id),
                    categoria: data.categoria,
                    tipo: data.tipo
                };
                await API.salvarDados('transacoes', transacao);
                toastMessage = 'Transação salva!';

            } else if (tipoCompra === 'parcelada') {
                const dadosCompra = {
                    descricao: data.descricao, valor_total: parseFloat(data.valor),
                    numero_parcelas: parseInt(data.numero_parcelas), data_compra: data.data,
                    conta_id: parseInt(data.conta_id), categoria: data.categoria,
                };
                const conta = State.getContaPorId(dadosCompra.conta_id);
                if (!conta || !conta.dia_fechamento_cartao || !conta.dia_vencimento_fatura) {
                    throw new Error("Para compras parceladas, o cartão de crédito precisa ter 'Dia de Fechamento' e 'Dia de Vencimento' cadastrados.");
                }
                const compraSalva = await API.salvarDados('compras_parceladas', dadosCompra);
                const valorParcela = parseFloat((dadosCompra.valor_total / dadosCompra.numero_parcelas).toFixed(2));
                const lancamentos = [];
                const dataCompra = new Date(dadosCompra.data_compra + 'T12:00:00');
                const diaFechamento = conta.dia_fechamento_cartao;
                const diaVencimento = conta.dia_vencimento_fatura;
                
                let anoFechamento = dataCompra.getFullYear();
                let mesFechamento = dataCompra.getMonth();

                if (dataCompra.getDate() > diaFechamento) {
                    mesFechamento += 1;
                }
                
                for (let i = 1; i <= dadosCompra.numero_parcelas; i++) {
                    const dataFechamentoAtual = new Date(anoFechamento, mesFechamento + (i - 1), diaFechamento);
                    let anoVencimento = dataFechamentoAtual.getFullYear();
                    let mesVencimento = dataFechamentoAtual.getMonth();

                    if (diaVencimento < diaFechamento) {
                        mesVencimento += 1;
                    }

                    const dataVencimentoFinal = new Date(anoVencimento, mesVencimento, diaVencimento);
                    
                    lancamentos.push({
                        descricao: `${dadosCompra.descricao} (${i}/${dadosCompra.numero_parcelas})`, valor: valorParcela,
                        data_vencimento: toISODateString(dataVencimentoFinal), tipo: 'a_pagar',
                        status: 'pendente', compra_parcelada_id: compraSalva.id, categoria: dadosCompra.categoria
                    });
                }
                if (lancamentos.length > 0) await API.salvarMultiplosLancamentos(lancamentos);
                toastMessage = 'Compra parcelada lançada!';

            } else if (tipoCompra === 'recorrente') {
                const valor = parseFloat(data.valor);
                const dataInicio = new Date(data.data + 'T12:00:00');
                const lancamentos = [];
                const quantidade = parseInt(data.quantidade);
                const diaVencimento = parseInt(data.dia_vencimento);
                const frequencia = data.frequencia;
                for (let i = 0; i < quantidade; i++) {
                    let proximaData;
                    if (frequencia === 'mensal') {
                        proximaData = new Date(dataInicio.getFullYear(), dataInicio.getMonth() + i, 1);
                        proximaData.setDate(Math.min(diaVencimento, new Date(proximaData.getFullYear(), proximaData.getMonth() + 1, 0).getDate()));
                    } else if (frequencia === 'anual') {
                        proximaData = new Date(dataInicio.getFullYear() + i, dataInicio.getMonth(), diaVencimento);
                    } else if (frequencia === 'quinzenal') {
                        proximaData = new Date(dataInicio.getTime() + (15 * i * 24 * 60 * 60 * 1000));
                    } else { // diaria
                        proximaData = new Date(dataInicio.getTime() + (i * 24 * 60 * 60 * 1000));
                    }
                    lancamentos.push({
                        descricao: data.descricao, valor: Math.abs(valor),
                        data_vencimento: toISODateString(proximaData), tipo: 'a_pagar',
                        status: 'pendente', categoria: data.categoria
                    });
                }
                if (lancamentos.length > 0) await API.salvarMultiplosLancamentos(lancamentos);
                toastMessage = `${lancamentos.length} lançamentos recorrentes criados!`;
            }
            
            form.reset();
            form.querySelector('#tipo-compra')?.dispatchEvent(new Event('change'));
            UI.showToast(toastMessage);
            await reloadStateAndRender();
        } catch (err) {
            UI.showToast(err.message, 'error');
        } finally {
            UI.setLoadingState(btn, false, 'Salvar Transação');
        }
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
        } catch (err) {
            UI.showToast(err.message, 'error');
        } finally {
            UI.setLoadingState(btn, false, 'Salvar Alterações');
        }
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
        } catch (err) {
            UI.showToast(err.message, 'error');
        } finally {
            UI.setLoadingState(btn, false, 'Salvar');
        }
    }

    async function salvarCompraParcelada(e) {
        const form = e.target;
        const btn = form.querySelector('button[type="submit"]');
        const idCompraAntiga = form.dataset.compraAntigaId ? parseInt(form.dataset.compraAntigaId) : null;
        UI.setLoadingState(btn, true);
        try {
            if (idCompraAntiga) {
                await deletarCompraParceladaCompleta(idCompraAntiga);
            }
            
            const data = Object.fromEntries(new FormData(form));
            // Simula um evento de formulário para reutilizar a lógica principal
            const fakeForm = document.createElement('form');
            const formData = new FormData(fakeForm);
            formData.set('tipo_compra', 'parcelada');
            formData.set('descricao', data.descricao);
            formData.set('valor', data.valor_total);
            formData.set('numero_parcelas', data.numero_parcelas);
            formData.set('data', data.data_compra);
            formData.set('conta_id', data.conta_id);
            formData.set('categoria', data.categoria);
            
            const fakeEvent = { target: fakeForm, preventDefault: () => {} };
            await salvarTransacaoUnificada(fakeEvent);
            
            UI.closeModal();
            // A mensagem de toast já é mostrada pela salvarTransacaoUnificada
        } catch (err) {
            UI.showToast(err.message, 'error');
        } finally {
            UI.setLoadingState(btn, false, idCompraAntiga ? 'Salvar e Substituir' : 'Salvar Compra');
        }
    }
    
    async function deletarCompraParceladaCompleta(compraId) {
        if (!compraId) return;
        try {
            await API.deletarLancamentosPorCompraId(compraId);
            await API.deletarDados('compras_parceladas', compraId);
        } catch (error) {
            console.error("Erro ao deletar compra parcelada:", error);
            UI.showToast(`Erro ao deletar compra: ${error.message}`, 'error');
            throw error;
        }
    }
    
    async function deletarLancamento(id, compraId) { 
        if (compraId) {
            if (!confirm('Este é um lançamento parcelado. Deseja apagar a compra inteira e todas as suas parcelas?')) return;
            try {
                await deletarCompraParceladaCompleta(compraId);
                UI.showToast('Compra e parcelas deletadas!');
                await reloadStateAndRender();
            } catch (err) {
                UI.showToast(err.message, 'error');
            }
        } else {
            if (!confirm('Apagar este lançamento?')) return;
            try {
                await API.deletarDados('lancamentos_futuros', id);
                UI.showToast('Lançamento deletado.');
                await reloadStateAndRender();
            } catch (err) {
                UI.showToast(err.message, 'error');
            }
        }
    }

    async function deletarTransacao(id) { 
        if (!confirm('Apagar transação?')) return;
        try {
            await API.deletarDados('transacoes', id);
            UI.showToast('Transação deletada.');
            await reloadStateAndRender();
        } catch (err) {
            UI.showToast(err.message, 'error');
        }
    }

    // --- LISTENERS DE EVENTOS ---
    function setupEventListeners() {
        document.getElementById('theme-switcher').addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            applyTheme(current === 'light' ? 'dark' : 'light');
        });

        document.getElementById('btn-add-account').addEventListener('click', () => {
            UI.openModal(UI.getAccountModalContent());
        });

        document.body.addEventListener('click', e => {
            if (e.target.matches('#modal-container, #modal-close-btn, .btn-close')) {
                UI.closeModal();
            }
            const target = e.target.closest('[data-action]');
            if (!target) return;
            
            const action = target.dataset.action;
            const id = parseInt(target.dataset.id);
            const compraId = parseInt(target.dataset.compraId);

            switch (action) {
                case 'editar-conta': UI.openModal(UI.getAccountModalContent(id)); break;
                case 'deletar-conta': deletarConta(id); break;
                case 'ver-fatura':
                    UI.openModal(UI.getStatementModalContent(id));
                    document.getElementById('statement-month-select')?.addEventListener('change', (e) => {
                        const contaId = parseInt(e.target.dataset.contaId);
                        const mesSelecionado = e.target.value;
                        UI.renderStatementDetails(contaId, mesSelecionado);
                    });
                    break;
                case 'pagar-conta': UI.openModal(UI.getPayBillModalContent(id)); break;
                case 'editar-lancamento': UI.openModal(UI.getBillModalContent(id)); break;
                case 'deletar-lancamento': deletarLancamento(id, compraId); break;
                case 'recriar-compra-parcelada':
                    const compra = State.getState().comprasParceladas.find(c => c.id === id);
                    if (compra) UI.openModal(UI.getInstallmentPurchaseModalContent(compra));
                    break;
                case 'editar-transacao': UI.openModal(UI.getTransactionModalContent(id)); break;
                case 'deletar-transacao': deletarTransacao(id); break;
            }
        });

        document.body.addEventListener('change', e => {
            if (e.target.id === 'conta-tipo') {
                const isCreditCard = e.target.value === 'Cartão de Crédito';
                const cartaoFields = document.getElementById('cartao-credito-fields');
                if (cartaoFields) {
                    cartaoFields.style.display = isCreditCard ? 'block' : 'none';
                }
            }
            if (e.target.id === 'tipo-compra') {
                const tipo = e.target.value;
                const form = e.target.closest('form');
                const parceladaFields = form.querySelector('#parcelada-fields');
                const recorrenteFields = form.querySelector('#recorrente-fields');
                const labelValor = form.querySelector('#label-valor');
                const selectConta = form.querySelector('select[name="conta_id"]');
                parceladaFields.style.display = 'none';
                recorrenteFields.style.display = 'none';
                if (selectConta.dataset.allOptions) {
                    selectConta.innerHTML = selectConta.dataset.allOptions;
                }
                if (tipo === 'parcelada') {
                    parceladaFields.style.display = 'block';
                    labelValor.textContent = 'Valor Total';
                    if (selectConta.dataset.creditCardOptions) {
                        selectConta.innerHTML = selectConta.dataset.creditCardOptions;
                    }
                } else if (tipo === 'recorrente') {
                    recorrenteFields.style.display = 'block';
                    labelValor.textContent = 'Valor da Recorrência';
                } else {
                    labelValor.textContent = 'Valor';
                }
            }
            if (e.target.id === 'history-month-filter') {
                historyFilters.mes = e.target.value;
                historyCurrentPage = 1;
                UI.renderHistoricoTransacoes(historyCurrentPage, historyFilters);
            }
            if (e.target.id === 'bills-month-filter') {
                billsFilters.mes = e.target.value;
                billsCurrentPage = 1;
                UI.renderLancamentosFuturos(billsCurrentPage, billsFilters);
            }
            if (e.target.id === 'history-account-filter') {
                historyFilters.contaId = e.target.value;
                historyCurrentPage = 1;
                UI.renderHistoricoTransacoes(historyCurrentPage, historyFilters);
            }
            if (e.target.id === 'bills-account-filter') {
                billsFilters.contaId = e.target.value;
                billsCurrentPage = 1;
                UI.renderLancamentosFuturos(billsCurrentPage, billsFilters);
            }
        });
        
        document.body.addEventListener('input', e => {
            if (e.target.id === 'history-search-input') {
                historyFilters.pesquisa = e.target.value;
                historyCurrentPage = 1;
                UI.renderHistoricoTransacoes(historyCurrentPage, historyFilters);
            }
            if (e.target.id === 'bills-search-input') {
                billsFilters.pesquisa = e.target.value;
                billsCurrentPage = 1;
                UI.renderLancamentosFuturos(billsCurrentPage, billsFilters);
            }
        });

        document.body.addEventListener('submit', e => {
            e.preventDefault();
            switch (e.target.id) {
                case 'form-conta': salvarConta(e); break;
                case 'form-transacao-unificada': salvarTransacaoUnificada(e); break;
                case 'form-pagamento': confirmarPagamento(e); break;
                case 'form-edicao-transacao': salvarEdicaoTransacao(e); break;
                case 'form-lancamento': salvarLancamentoFuturo(e); break;
                case 'form-compra-parcelada': salvarCompraParcelada(e); break;
            }
        });
    }

    async function initializeApp() {
        UI.showToast('Carregando dados...');
        try {
            const data = await API.fetchData();
            State.setState(data);
            UI.renderAllComponents({ history: historyFilters, bills: billsFilters });
        } catch (error) {
            UI.showToast(error.message, 'error');
            console.error("Falha na inicialização:", error);
        }
    }

    applyTheme(localStorage.getItem('confin-theme') || 'light');
    setupEventListeners();
    initializeApp();
});
