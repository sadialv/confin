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
        e.preventDefault();
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
            UI.renderContas(); // Renderiza apenas o componente afetado
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
            const state = State.getState();
            State.setState({ contas: state.contas.filter(c => c.id !== id) });
            UI.renderContas(); // Apenas atualiza a lista de contas
            UI.showToast('Conta deletada.');
        } catch (err) {
            UI.showToast(err.message, 'error');
        }
    }
    
    async function confirmarPagamento(e) {
        e.preventDefault();
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
            await reloadStateAndRender(); // Recarrega tudo pois afeta múltiplos painéis
        } catch (err) {
            UI.showToast(err.message, 'error');
        } finally {
            UI.setLoadingState(btn, false, 'Confirmar');
        }
    }

    async function salvarTransacaoUnificada(e) {
        e.preventDefault();
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
                // Lógica para parcelada e recorrente (cria múltiplos lançamentos)
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
                        } else { // anual
                            proximaData = new Date(dataInicio.getFullYear() + i, dataInicio.getMonth(), diaVencimento);
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
    
    // ... (outras funções de salvar/deletar podem ser adicionadas aqui)

    function setupEventListeners() {
        document.getElementById('theme-switcher').addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            applyTheme(current === 'light' ? 'dark' : 'light');
        });
        
        document.body.addEventListener('click', e => {
            if (e.target.matches('#modal-container, #modal-close-btn, .btn-close')) {
                UI.closeModal();
            }

            const target = e.target.closest('[data-action]');
            if (!target) return;
            
            const action = target.dataset.action;
            const id = parseInt(target.dataset.id);

            switch (action) {
                case 'editar-conta':
                    UI.openModal(UI.getAccountModalContent(id));
                    break;
                case 'deletar-conta':
                    deletarConta(id);
                    break;
                 case 'pagar-conta': 
                    UI.openModal(UI.getPayBillModalContent(id)); 
                    break;
                // Adicione outros 'cases' para editar/deletar transações etc.
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
                // Adicione outros formulários se necessário
            }
        });

        document.getElementById('btn-add-account').addEventListener('click', () => {
            UI.openModal(UI.getAccountModalContent());
        });

        // ... (Listeners para filtros de pesquisa e mês)
    }

    async function initializeApp(showToast = true) {
        if (showToast) UI.showToast('Carregando dados...');
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
