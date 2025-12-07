// ARQUIVO: js/main.js
import * as UI from './ui.js';
import * as API from './api.js';
import * as State from './state.js';
import { applyTheme, toISODateString } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {

    let historyFilters = { mes: new Date().toISOString().slice(0, 7), pesquisa: '', contaId: 'todas' };
    let billsFilters = { mes: 'todos', pesquisa: '', contaId: 'todas' };

    async function reloadStateAndRender() {
        try {
            const data = await API.fetchData();
            State.setState(data);
            UI.renderAllComponents({ history: historyFilters, bills: billsFilters });
        } catch (error) {
            UI.showToast(error.message, 'error');
        }
    }

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

    // --- FUNÇÕES DE FORMULÁRIO ---
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
            const state = State.getState();
            const newContas = id ? state.contas.map(c => c.id == saved.id ? saved : c) : [...state.contas, saved];
            State.setState({ contas: newContas.sort((a, b) => a.nome.localeCompare(b.nome)) });
            UI.renderContas();
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
                lancamento_futuro_id: parseInt(form.dataset.billId) // Vínculo com Boleto
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
            // Recorrente simplificado (opcional expandir depois)
            form.reset();
            await reloadStateAndRender();
        } catch (err) { UI.showToast(err.message, 'error'); } finally { UI.setLoadingState(btn, false, 'Salvar Transação'); }
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
            if(action === 'editar-transacao') UI.openModal(UI.getTransactionModalContent(id));
            
            // Deletar simples para resumir
            if(action === 'deletar-transacao') { if(confirm('Apagar?')) API.deletarDados('transacoes', id).then(() => { UI.showToast('Apagado'); reloadStateAndRender(); }); }
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
                form.querySelector('#parcelada-fields').style.display = tipo === 'parcelada' ? 'block' : 'none';
            }
        });

        document.body.addEventListener('submit', e => {
            e.preventDefault();
            if (e.target.id === 'form-conta') salvarConta(e);
            if (e.target.id === 'form-transacao-unificada') salvarTransacaoUnificada(e);
            if (e.target.id === 'form-pagamento') confirmarPagamento(e);
            if (e.target.id === 'form-edicao-transacao') { /* logica de editar transacao */ }
            if (e.target.id === 'form-lancamento') { /* logica de editar lancamento */ }
        });
    }

    async function initializeApp() {
        UI.showToast('Iniciando...');
        try {
            const data = await API.fetchData();
            State.setState(data);
            UI.renderAllComponents({ history: historyFilters, bills: billsFilters });
        } catch (error) {
            UI.showToast(error.message, 'error');
            console.error(error);
        }
    }
    applyTheme(localStorage.getItem('confin-theme') || 'light');
    setupEventListeners();
    initializeApp();
});
