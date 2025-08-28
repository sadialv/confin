import * as UI from './ui.js';
import * as API from './api.js';
import * as State from './state.js';
import { applyTheme, toISODateString } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {

    let historyCurrentPage = 1;
    let historyFilters = { mes: 'todos', pesquisa: '' };
    let billsCurrentPage = 1;
    let billsFilters = { mes: 'todos', pesquisa: '' };

    async function reloadStateAndRender() {
        try {
            const data = await API.fetchData();
            State.setState(data);
            UI.renderAllComponents();
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
                    descricao: data.descricao, valor: Math.abs(parseFloat(data.valor)), data: data.data,
                    conta_id: parseInt(data.conta_id), categoria: data.categoria,
                    tipo: parseFloat(data.valor) >= 0 ? 'receita' : 'despesa'
                };
                await API.salvarDados('transacoes', transacao);
                toastMessage = 'Transação salva!';
            } else if (tipoCompra === 'parcelada' || tipoCompra === 'recorrente') {
                const valor = parseFloat(data.valor);
                const dataInicio = new Date(data.data + 'T12:00:00');
                const lancamentos = [];
                
                if (tipoCompra === 'parcelada') {
                    const dadosCompra = {
                        descricao: data.descricao, valor_total: valor,
                        numero_parcelas: parseInt(data.numero_parcelas), data_compra: data.data,
                        conta_id: parseInt(data.conta_id), categoria: data.categoria,
                    };
                    const compraSalva = await API.salvarDados('compras_parceladas', dadosCompra);
                    const valorParcela = parseFloat((dadosCompra.valor_total / dadosCompra.numero_parcelas).toFixed(2));
                    for (let i = 1; i <= dadosCompra.numero_parcelas; i++) {
                        const dataVencimento = new Date(dataInicio);
                        dataVencimento.setMonth(dataVencimento.getMonth() + i);
                        lancamentos.push({
                            descricao: `${dadosCompra.descricao} (${i}/${dadosCompra.numero_parcelas})`, valor: valorParcela,
                            data_vencimento: toISODateString(dataVencimento), tipo: 'a_pagar',
                            status: 'pendente', compra_parcelada_id: compraSalva.id, categoria: dadosCompra.categoria
                        });
                    }
                    toastMessage = 'Compra parcelada lançada!';
                } else { // Recorrente
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
                    toastMessage = `${lancamentos.length} lançamentos recorrentes criados!`;
                }
                if (lancamentos.length > 0) await API.salvarMultiplosLancamentos(lancamentos);
            }
            
            form.reset();
            form.querySelector('#tipo-compra').dispatchEvent(new Event('change'));
            UI.showToast(toastMessage);
            await reloadStateAndRender();
        } catch (err) {
            UI.showToast(err.message, 'error');
        } finally {
            UI.setLoadingState(btn, false, 'Salvar Transação');
        }
    }
    
    async function deletarLancamento(id, compraId) { /* ... Lógica de deleção ... */ }
    async function deletarTransacao(id) { /* ... Lógica de deleção ... */ }

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
                case 'editar-conta':
                    UI.openModal(UI.getAccountModalContent(id));
                    break;
                case 'deletar-conta':
                    deletarConta(id);
                    break;
                case 'ver-fatura':
                    UI.showToast('Função "Ver Fatura" não implementada.', 'error');
                    break;
                case 'pagar-conta':
                    UI.openModal(UI.getPayBillModalContent(id));
                    break;
                case 'editar-lancamento':
                    UI.openModal(UI.getBillModalContent(id));
                    break;
                case 'deletar-lancamento':
                    deletarLancamento(id, compraId);
                    break;
                case 'recriar-compra-parcelada':
                    const compra = State.getState().comprasParceladas.find(c => c.id === id);
                    if (compra) UI.openModal(UI.getInstallmentPurchaseModalContent(compra));
                    break;
                case 'editar-transacao':
                    UI.openModal(UI.getTransactionModalContent(id));
                    break;
                case 'deletar-transacao':
                    deletarTransacao(id);
                    break;
            }
        });

        document.body.addEventListener('change', e => {
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
        });
        
        document.body.addEventListener('submit', e => {
            e.preventDefault();
            switch (e.target.id) {
                case 'form-conta':
                    salvarConta(e);
                    break;
                case 'form-transacao-unificada':
                    salvarTransacaoUnificada(e);
                    break;
                case 'form-pagamento':
                    confirmarPagamento(e);
                    break;
            }
        });
    }

    async function initializeApp() {
        UI.showToast('Carregando dados...');
        try {
            const data = await API.fetchData();
            State.setState(data);
            UI.renderAllComponents();
        } catch (error) {
            UI.showToast(error.message, 'error');
            console.error("Falha na inicialização:", error);
        }
    }

    applyTheme(localStorage.getItem('confin-theme') || 'light');
    setupEventListeners();
    initializeApp();
});
