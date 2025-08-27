import * as UI from './ui.js';
import * as API from './api.js';
import * as State from './state.js';
import { applyTheme, toISODateString } from './utils.js';

// Estado dos filtros e paginação
let historyCurrentPage = 1;
let historyFilters = { mes: 'todos', pesquisa: '' };
let billsCurrentPage = 1;
let billsFilters = { mes: 'todos', pesquisa: '' };

// --- AÇÕES ---
async function salvarConta(e){
    e.preventDefault();
    const form = e.target;
    const btn = form.querySelector('button');
    UI.setLoadingState(btn, true);
    try {
        const id = form.dataset.id;
        const data = Object.fromEntries(new FormData(form));
        const saved = await API.salvarDados('contas', data, id);
        const state = State.getState();
        const newContas = id ? state.contas.map(c => c.id == saved.id ? saved : c) : [...state.contas, saved];
        State.setState({ contas: newContas.sort((a, b) => a.nome.localeCompare(b.nome)) });
        UI.renderAllComponents();
        UI.closeModal();
        UI.showToast('Conta salva!');
    } catch(err) {
        UI.showToast(err.message, 'error');
    } finally {
        UI.setLoadingState(btn, false, 'Salvar');
    }
}

async function deletarConta(id){
    if(!confirm('Apagar conta?')) return;
    try {
        await API.deletarDados('contas', id);
        const state = State.getState();
        State.setState({ contas: state.contas.filter(c => c.id !== id) });
        UI.renderAllComponents();
        UI.showToast('Conta deletada.');
    } catch(err) {
        UI.showToast(err.message, 'error');
    }
}

async function salvarTransacaoRapida(e){
    e.preventDefault();
    const form = e.target;
    const btn = form.querySelector('button');
    UI.setLoadingState(btn, true);
    try {
        const data = Object.fromEntries(new FormData(form));
        data.valor = parseFloat(data.valor);
        data.conta_id = parseInt(data.conta_id);
        const saved = await API.salvarDados('transacoes', data);
        const state = State.getState();
        State.setState({ transacoes: [...state.transacoes, saved].sort((a,b) => new Date(b.data) - new Date(a.data)) });
        UI.renderAllComponents();
        form.reset();
        UI.showToast('Transação salva!');
    } catch(err) {
        UI.showToast(err.message, 'error');
    } finally {
        UI.setLoadingState(btn, false, 'Salvar Transação');
    }
}

async function confirmarPagamento(e){
    e.preventDefault();
    const form = e.target;
    const btn = form.querySelector('button');
    UI.setLoadingState(btn, true);
    try {
        const data = Object.fromEntries(new FormData(form));
        const transacao = {
            descricao: form.dataset.desc,
            valor: parseFloat(form.dataset.valor),
            data: data.data,
            conta_id: parseInt(data.conta_id),
            categoria: form.dataset.cat,
            tipo: 'despesa'
        };
        const savedT = await API.salvarDados('transacoes', transacao);
        const savedL = await API.salvarDados('lancamentos_futuros', { status: 'pago' }, form.dataset.billId);
        const state = State.getState();
        State.setState({
            transacoes: [...state.transacoes, savedT].sort((a,b) => new Date(b.data) - new Date(a.data)),
            lancamentosFuturos: state.lancamentosFuturos.map(l => l.id == savedL.id ? savedL : l)
        });
        UI.renderAllComponents();
        UI.closeModal();
        UI.showToast('Conta paga!');
    } catch(err) {
        UI.showToast(err.message, 'error');
    } finally {
        UI.setLoadingState(btn, false, 'Confirmar');
    }
}

async function deletarTransacao(id){
    if(!confirm('Apagar transação?')) return;
    try {
        await API.deletarDados('transacoes', id);
        const state = State.getState();
        State.setState({ transacoes: state.transacoes.filter(t => t.id !== id) });
        UI.renderAllComponents();
        UI.showToast('Transação deletada.');
    } catch(err) {
        UI.showToast(err.message, 'error');
    }
}

async function deletarCompraParceladaCompleta(compraId) {
    if (!compraId) return;
    try {
        await API.deletarLancamentosPorCompraId(compraId);
        await API.deletarDados('compras_parceladas', compraId);
    } catch (error) {
        console.error("Erro ao deletar compra parcelada antiga:", error);
        UI.showToast(`Erro ao deletar compra antiga: ${error.message}`, 'error');
        throw error;
    }
}

async function deletarLancamento(id, compraId) {
    if (compraId) {
        if (!confirm('Este é um lançamento parcelado. Deseja apagar a compra inteira e todas as suas parcelas?')) return;
        try {
            await deletarCompraParceladaCompleta(compraId);
            UI.showToast('Compra e parcelas deletadas com sucesso!');
        } catch(err) {
            UI.showToast(err.message, 'error');
            return;
        }
    } else {
        if (!confirm('Apagar este lançamento?')) return;
        try {
            await API.deletarDados('lancamentos_futuros', id);
            UI.showToast('Lançamento deletado.');
        } catch (err) {
            UI.showToast(err.message, 'error');
            return;
        }
    }
    await initializeApp(false);
}

async function salvarLancamentoFuturo(e) {
    e.preventDefault();
    const form = e.target;
    const btn = form.querySelector('button');
    const id = form.dataset.id;
    UI.setLoadingState(btn, true);
    try {
        const data = Object.fromEntries(new FormData(form));
        data.valor = parseFloat(data.valor);
        const saved = await API.salvarDados('lancamentos_futuros', data, id);
        const state = State.getState();
        const newList = id ? state.lancamentosFuturos.map(l => l.id == saved.id ? saved : l) : [...state.lancamentosFuturos, saved];
        State.setState({ lancamentosFuturos: newList.sort((a,b) => new Date(a.data_vencimento) - new Date(b.data_vencimento)) });
        UI.renderAllComponents();
        UI.closeModal();
        UI.showToast(`Lançamento ${id ? 'atualizado' : 'salvo'}!`);
    } catch(err) {
        UI.showToast(err.message, 'error');
    } finally {
        UI.setLoadingState(btn, false, 'Salvar');
    }
}

async function salvarEdicaoTransacao(e) {
    e.preventDefault();
    const form = e.target;
    const btn = form.querySelector('button');
    const id = form.dataset.id;
    UI.setLoadingState(btn, true);
    try {
        const data = Object.fromEntries(new FormData(form));
        data.valor = parseFloat(data.valor);
        data.conta_id = parseInt(data.conta_id);
        const saved = await API.salvarDados('transacoes', data, id);
        const state = State.getState();
        const newList = state.transacoes.map(t => t.id == saved.id ? saved : t);
        State.setState({ transacoes: newList.sort((a,b) => new Date(b.data) - new Date(a.data)) });
        UI.renderAllComponents();
        UI.closeModal();
        UI.showToast('Transação atualizada!');
    } catch(err) {
        UI.showToast(err.message, 'error');
    } finally {
        UI.setLoadingState(btn, false, 'Salvar Alterações');
    }
}

async function salvarCompraParcelada(e) {
    e.preventDefault();
    const form = e.target;
    const btn = form.querySelector('button');
    const idCompraAntiga = form.dataset.compraAntigaId ? parseInt(form.dataset.compraAntigaId) : null;
    UI.setLoadingState(btn, true);
    try {
        const data = Object.fromEntries(new FormData(form));
        const dadosCompra = {
            descricao: data.descricao, valor_total: parseFloat(data.valor_total),
            numero_parcelas: parseInt(data.numero_parcelas), data_compra: data.data_compra,
            conta_id: parseInt(data.conta_id), categoria: data.categoria,
        };
        const compraSalva = await API.salvarDados('compras_parceladas', dadosCompra);
        const valorParcela = parseFloat((dadosCompra.valor_total / dadosCompra.numero_parcelas).toFixed(2));
        const dataCompraObj = new Date(dadosCompra.data_compra + 'T12:00:00');
        const lancamentos = [];
        for (let i = 1; i <= dadosCompra.numero_parcelas; i++) {
            const dataVencimento = new Date(dataCompraObj);
            dataVencimento.setMonth(dataVencimento.getMonth() + i);
            lancamentos.push({
                descricao: `${dadosCompra.descricao} (${i}/${dadosCompra.numero_parcelas})`, valor: valorParcela,
                data_vencimento: toISODateString(dataVencimento), tipo: 'a_pagar',
                status: 'pendente', compra_parcelada_id: compraSalva.id
            });
        }
        await API.salvarMultiplosLancamentos(lancamentos);
        if (idCompraAntiga) {
            await deletarCompraParceladaCompleta(idCompraAntiga);
        }
        await initializeApp(false);
        UI.closeModal();
        UI.showToast(`Compra parcelada ${idCompraAntiga ? 'recriada' : 'salva'} com sucesso!`);
    } catch(err) {
        UI.showToast(err.message, 'error');
    } finally {
        UI.setLoadingState(btn, false, idCompraAntiga ? 'Salvar e Substituir' : 'Salvar Compra');
    }
}

// --- FUNÇÃO PRINCIPAL ---
document.addEventListener('DOMContentLoaded', () => {
    function setupEventListeners() {
        document.getElementById('theme-switcher').addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            applyTheme(current === 'light' ? 'dark' : 'light');
        });
        document.getElementById('modal-container').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) UI.closeModal();
        });
        document.getElementById('dashboard-tab-buttons').addEventListener('click', e => {
            if (e.target.matches('.tab-button')) {
                UI.switchTab(e.target, '.card:has(#dashboard-tab-buttons)');
                if (e.target.dataset.tab === 'dashboard-monthly') UI.renderVisaoMensal();
                else UI.renderVisaoAnual();
            }
        });
        document.getElementById('main-tab-buttons').addEventListener('click', e => {
            if (e.target.matches('.tab-button')) {
                UI.switchTab(e.target, '.card:has(#main-tab-buttons)');
                const tabId = e.target.dataset.tab;
                if (tabId === 'tab-bills') {
                    UI.renderFilters('bills', billsFilters);
                    UI.renderLancamentosFuturos(billsCurrentPage, billsFilters);
                } else if (tabId === 'tab-history') {
                    UI.renderFilters('history', historyFilters);
                    UI.renderHistoricoTransacoes(historyCurrentPage, historyFilters);
                }
            }
        });
        document.getElementById('form-transacao-rapida').addEventListener('submit', salvarTransacaoRapida);
        document.getElementById('btn-add-account').addEventListener('click', () => {
            UI.openModal(UI.getAccountModalContent());
            document.getElementById('form-conta').addEventListener('submit', salvarConta);
        });
        document.getElementById('btn-open-bill').addEventListener('click',() => {
            UI.openModal(UI.getBillModalContent());
            document.getElementById('form-lancamento').addEventListener('submit', salvarLancamentoFuturo);
        });
        document.getElementById('btn-open-installment').addEventListener('click',() => {
            UI.openModal(UI.getInstallmentPurchaseModalContent());
            document.getElementById('form-compra-parcelada').addEventListener('submit', salvarCompraParcelada);
        });
        
        document.body.addEventListener('click', e => {
            const target = e.target.closest('[data-action]');
            if(!target) return;
            const action = target.dataset.action;
            const id = parseInt(target.dataset.id);
            const compraId = parseInt(target.dataset.compraId);

            if (action === 'next-page-history') UI.renderHistoricoTransacoes(++historyCurrentPage, historyFilters);
            if (action === 'prev-page-history') UI.renderHistoricoTransacoes(--historyCurrentPage, historyFilters);
            if (action === 'next-page-bills') UI.renderLancamentosFuturos(++billsCurrentPage, billsFilters);
            if (action === 'prev-page-bills') UI.renderLancamentosFuturos(--billsCurrentPage, billsFilters);

            switch(action){
                case 'editar-conta': 
                    UI.openModal(UI.getAccountModalContent(id)); 
                    document.getElementById('form-conta').addEventListener('submit',salvarConta); 
                    break;
                case 'deletar-conta': 
                    deletarConta(id); 
                    break;
                case 'pagar-conta': 
                    UI.openModal(UI.getPayBillModalContent(id)); 
                    document.getElementById('form-pagamento').addEventListener('submit',confirmarPagamento); 
                    break;
                case 'ver-fatura':
                    UI.openModal(UI.getStatementModalContent(id));
                    document.getElementById('statement-month-select').addEventListener('change', (e) => {
                        UI.renderStatementDetails(parseInt(e.target.dataset.contaId), e.target.value);
                    });
                    break;
                case 'deletar-lancamento':
                    deletarLancamento(id, compraId);
                    break;
                case 'deletar-transacao':
                    deletarTransacao(id);
                    break;
                case 'editar-lancamento':
                    UI.openModal(UI.getBillModalContent(id));
                    document.getElementById('form-lancamento').addEventListener('submit', salvarLancamentoFuturo);
                    break;
                case 'editar-transacao':
                    UI.openModal(UI.getTransactionModalContent(id));
                    document.getElementById('form-edicao-transacao').addEventListener('submit', salvarEdicaoTransacao);
                    break;
                case 'recriar-compra-parcelada':
                    const compraOriginal = State.getState().comprasParceladas.find(c => c.id === id);
                    if (compraOriginal) {
                        UI.openModal(UI.getInstallmentPurchaseModalContent(compraOriginal));
                        document.getElementById('form-compra-parcelada').addEventListener('submit', salvarCompraParcelada);
                    }
                    break;
            }
        });

        document.body.addEventListener('input', e => {
            if (e.target.id === 'history-search-input') { historyFilters.pesquisa = e.target.value; historyCurrentPage = 1; UI.renderHistoricoTransacoes(historyCurrentPage, historyFilters); }
            if (e.target.id === 'bills-search-input') { billsFilters.pesquisa = e.target.value; billsCurrentPage = 1; UI.renderLancamentosFuturos(billsCurrentPage, billsFilters); }
        });

        document.body.addEventListener('change', e => {
            if (e.target.id === 'history-month-filter') { historyFilters.mes = e.target.value; historyCurrentPage = 1; UI.renderHistoricoTransacoes(historyCurrentPage, historyFilters); }
            if (e.target.id === 'bills-month-filter') { billsFilters.mes = e.target.value; billsCurrentPage = 1; UI.renderLancamentosFuturos(billsCurrentPage, billsFilters); }
            if (e.target.id === 'conta-tipo') {
                const isCreditCard = e.target.value === 'Cartão de Crédito';
                const cartaoFields = document.getElementById('cartao-credito-fields');
                const saldoField = document.getElementById('saldo-inicial-group');
                if(cartaoFields) cartaoFields.style.display = isCreditCard ? '' : 'none';
                if(saldoField) saldoField.style.display = isCreditCard ? 'none' : 'block';
            }
        });
    }

    async function initializeApp(showToast = true) {
        if(showToast) UI.showToast('Carregando dados...');
        try {
            const data = await API.fetchData();
            State.setState(data);
            UI.renderAllComponents();
        } catch (error) {
            UI.showToast(error.message, 'error');
        }
    }

    applyTheme(localStorage.getItem('confin-theme') || 'light');
    setupEventListeners();
    initializeApp();
});
