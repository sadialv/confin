// js/main.js

import { fetchData, salvarDados, deletarDados, salvarMultiplosLancamentos, deletarLancamentosPorCompraId } from './api.js';
import { setState, getState } from './state.js';
import { applyTheme, toISODateString } from './utils.js';
import * as UI from './ui.js';

// --- LÓGICA DE AÇÕES ---

async function salvarConta(event) {
    event.preventDefault();
    const form = event.target;
    const button = form.querySelector('button[type="submit"]');
    UI.setLoadingState(button, true);

    try {
        const id = form.dataset.id;
        const formData = new FormData(form);
        const dados = Object.fromEntries(formData.entries());
        
        // Converte para números
        dados.saldo_inicial = parseFloat(dados.saldo_inicial || 0);
        if (dados.limite_cartao) dados.limite_cartao = parseFloat(dados.limite_cartao);
        if (dados.dia_fechamento_cartao) dados.dia_fechamento_cartao = parseInt(dados.dia_fechamento_cartao);
        if (dados.dia_vencimento_cartao) dados.dia_vencimento_cartao = parseInt(dados.dia_vencimento_cartao);
        
        const savedAccount = await salvarDados('contas', dados, id);
        
        // Atualiza o estado local
        const { contas } = getState();
        const newContas = id ? contas.map(c => c.id === id ? savedAccount : c) : [...contas, savedAccount];
        setState({ contas: newContas });

        UI.renderContas();
        UI.renderFormTransacaoRapida(); // Atualiza a lista de contas no form rápido
        UI.closeModal();
        UI.showToast(`Conta ${id ? 'atualizada' : 'criada'} com sucesso!`);
    } catch (error) {
        console.error('Erro ao salvar conta:', error);
        UI.showToast(`Erro: ${error.message}`, 'error');
    } finally {
        UI.setLoadingState(button, false);
    }
}

async function deletarConta(id) {
    if (!confirm('Tem certeza que deseja deletar esta conta? Todas as transações associadas também serão perdidas.')) return;
    try {
        await deletarDados('contas', id);
        const { contas } = getState();
        setState({ contas: contas.filter(c => c.id !== id) });
        UI.renderContas();
        UI.showToast('Conta deletada com sucesso!');
    } catch (error) {
        console.error('Erro ao deletar conta:', error);
        UI.showToast(`Erro: ${error.message}`, 'error');
    }
}

async function salvarLancamentoFuturo(event) {
    event.preventDefault();
    const form = event.target;
    const button = form.querySelector('button[type="submit"]');
    UI.setLoadingState(button, true);

    try {
        const id = form.dataset.id;
        const formData = new FormData(form);
        const dados = Object.fromEntries(formData.entries());
        dados.valor = parseFloat(dados.valor);
        dados.status = 'pendente';

        const savedBill = await salvarDados('lancamentos_futuros', dados, id);

        const { lancamentosFuturos } = getState();
        const newBills = id ? lancamentosFuturos.map(b => b.id === id ? savedBill : b) : [...lancamentosFuturos, savedBill];
        setState({ lancamentosFuturos: newBills });

        UI.renderLancamentosFuturos();
        UI.closeModal();
        UI.showToast('Lançamento salvo com sucesso!');
    } catch (error) {
        console.error('Erro ao salvar lançamento:', error);
        UI.showToast(`Erro: ${error.message}`, 'error');
    } finally {
        UI.setLoadingState(button, false);
    }
}

async function deletarLancamento(id, compraId) {
    if (compraId) {
        if (!confirm('Este é um lançamento parcelado. Deseja apagar a compra inteira e todas as suas parcelas?')) return;
        try {
            await deletarLancamentosPorCompraId(compraId);
            await deletarDados('compras_parceladas', compraId);
            const { lancamentosFuturos, comprasParceladas } = getState();
            setState({ 
                lancamentosFuturos: lancamentosFuturos.filter(l => l.compra_parcelada_id !== compraId),
                comprasParceladas: comprasParceladas.filter(c => c.id !== compraId)
            });
            UI.showToast('Compra e parcelas deletadas com sucesso!');
        } catch (error) {
            console.error('Erro ao deletar compra parcelada:', error);
            UI.showToast(`Erro: ${error.message}`, 'error');
        }
    } else {
        if (!confirm('Tem certeza que deseja deletar este lançamento?')) return;
        try {
            await deletarDados('lancamentos_futuros', id);
            const { lancamentosFuturos } = getState();
            setState({ lancamentosFuturos: lancamentosFuturos.filter(l => l.id !== id) });
            UI.showToast('Lançamento deletado com sucesso!');
        } catch (error) {
            console.error('Erro ao deletar lançamento:', error);
            UI.showToast(`Erro: ${error.message}`, 'error');
        }
    }
    UI.renderLancamentosFuturos();
}


async function confirmarPagamento(event) {
    event.preventDefault();
    const form = event.target;
    const button = form.querySelector('button[type="submit"]');
    UI.setLoadingState(button, true, 'Confirmar Pagamento');

    try {
        const billId = parseInt(form.dataset.billId);
        const formData = new FormData(form);
        const dadosPagamento = Object.fromEntries(formData.entries());

        // 1. Criar a transação de despesa
        const novaTransacao = {
            descricao: form.dataset.descricao,
            valor: parseFloat(form.dataset.valor),
            data: dadosPagamento.data,
            conta_id: parseInt(dadosPagamento.conta_id),
            categoria: form.dataset.categoria,
            tipo: 'despesa'
        };
        const transacaoSalva = await salvarDados('transacoes', novaTransacao);

        // 2. Atualizar o status do lançamento futuro
        const lancamentoAtualizado = await salvarDados('lancamentos_futuros', { status: 'pago' }, billId);

        // 3. Atualizar estado local
        const { transacoes, lancamentosFuturos } = getState();
        setState({
            transacoes: [...transacoes, transacaoSalva].sort((a,b) => new Date(b.data) - new Date(a.data)),
            lancamentosFuturos: lancamentosFuturos.map(l => l.id === billId ? lancamentoAtualizado : l)
        });

        UI.renderAllComponents();
        UI.closeModal();
        UI.showToast('Pagamento confirmado com sucesso!');

    } catch (error) {
        console.error('Erro ao confirmar pagamento:', error);
        UI.showToast(`Erro: ${error.message}`, 'error');
    } finally {
        UI.setLoadingState(button, false, 'Confirmar Pagamento');
    }
}

async function salvarTransacaoRapida(event) {
    event.preventDefault();
    const form = event.target;
    const button = form.querySelector('button[type="submit"]');
    UI.setLoadingState(button, true, 'Salvar Transação');
    try {
        const formData = new FormData(form);
        const dados = Object.fromEntries(formData.entries());
        dados.valor = parseFloat(dados.valor);
        dados.conta_id = parseInt(dados.conta_id);

        const transacaoSalva = await salvarDados('transacoes', dados);

        const { transacoes } = getState();
        setState({ transacoes: [...transacoes, transacaoSalva].sort((a,b) => new Date(b.data) - new Date(a.data)) });

        UI.renderAllComponents();
        form.reset();
        document.getElementById('transacao-data').value = toISODateString(new Date()); // Reseta data para hoje
        UI.showToast('Transação salva com sucesso!');

    } catch (error) {
        console.error('Erro ao salvar transação:', error);
        UI.showToast(`Erro: ${error.message}`, 'error');
    } finally {
        UI.setLoadingState(button, false, 'Salvar Transação');
    }
}

async function deletarTransacao(id) {
     if (!confirm('Tem certeza que deseja deletar esta transação?')) return;
    try {
        await deletarDados('transacoes', id);
        const { transacoes } = getState();
        setState({ transacoes: transacoes.filter(t => t.id !== id) });
        UI.renderAllComponents();
        UI.showToast('Transação deletada com sucesso!');
    } catch (error) {
        console.error('Erro ao deletar transação:', error);
        UI.showToast(`Erro: ${error.message}`, 'error');
    }
}

async function salvarCompraParcelada(event) {
    event.preventDefault();
    const form = event.target;
    const button = form.querySelector('button[type="submit"]');
    UI.setLoadingState(button, true);

    try {
        const formData = new FormData(form);
        const dadosCompra = {
            descricao: formData.get('descricao'),
            valor_total: parseFloat(formData.get('valor_total')),
            numero_parcelas: parseInt(formData.get('numero_parcelas')),
            data_compra: formData.get('data_compra'),
            conta_id: parseInt(formData.get('conta_id')),
            categoria: formData.get('categoria'),
        };

        const compraSalva = await salvarDados('compras_parceladas', dadosCompra);
        
        const valorParcela = parseFloat((dadosCompra.valor_total / dadosCompra.numero_parcelas).toFixed(2));
        const dataCompraObj = new Date(dadosCompra.data_compra + 'T12:00:00');
        
        const lancamentos = [];
        for (let i = 1; i <= dadosCompra.numero_parcelas; i++) {
            const dataVencimento = new Date(dataCompraObj);
            dataVencimento.setMonth(dataVencimento.getMonth() + i);

            lancamentos.push({
                descricao: `${dadosCompra.descricao} (${i}/${dadosCompra.numero_parcelas})`,
                valor: valorParcela,
                data_vencimento: toISODateString(dataVencimento),
                tipo: 'a_pagar',
                status: 'pendente',
                categoria: dadosCompra.categoria, // Mantém a categoria para consistência
                compra_parcelada_id: compraSalva.id
            });
        }
        
        const lancamentosSalvos = await salvarMultiplosLancamentos(lancamentos);

        const { comprasParceladas, lancamentosFuturos } = getState();
        setState({
            comprasParceladas: [...comprasParceladas, compraSalva],
            lancamentosFuturos: [...lancamentosFuturos, ...lancamentosSalvos]
        });

        UI.renderLancamentosFuturos();
        UI.closeModal();
        UI.showToast('Compra parcelada salva com sucesso!');

    } catch (error) {
        console.error('Erro ao salvar compra parcelada:', error);
        UI.showToast(`Erro: ${error.message}`, 'error');
    } finally {
        UI.setLoadingState(button, false);
    }
}


// --- EVENT LISTENERS ---

function setupEventListeners() {
    // Theme Switcher
    document.getElementById('theme-switcher').addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        applyTheme(currentTheme === 'light' ? 'dark' : 'light');
    });

    // Main Tab Buttons
    document.getElementById('main-tab-buttons').addEventListener('click', (e) => {
        if (e.target.classList.contains('tab-button')) {
            UI.switchTab(e.target, '.card:has(#main-tab-buttons)');
        }
    });

     // Dashboard Tab Buttons
    document.getElementById('dashboard-tab-buttons').addEventListener('click', (e) => {
        if (e.target.classList.contains('tab-button')) {
             UI.switchTab(e.target, '.card:has(#dashboard-tab-buttons)');
        }
    });

    // Forms
    document.getElementById('form-transacao-rapida').addEventListener('submit', salvarTransacaoRapida);
    
    // Add Buttons
    document.getElementById('btn-add-account').addEventListener('click', () => {
        UI.openModal(UI.getAccountModalContent());
        document.getElementById('form-conta').addEventListener('submit', salvarConta);
    });
    
    document.getElementById('btn-open-bill').addEventListener('click', () => {
        UI.openModal(UI.getBillModalContent());
        document.getElementById('form-lancamento').addEventListener('submit', salvarLancamentoFuturo);
    });

    document.getElementById('btn-open-installment').addEventListener('click', () => {
        UI.openModal(UI.getInstallmentPurchaseModalContent());
        document.getElementById('form-compra-parcelada').addEventListener('submit', salvarCompraParcelada);
    });

    // Event Delegation for dynamic content
    document.body.addEventListener('click', (e) => {
        const target = e.target.closest('[data-action]');
        if (!target) return;

        const action = target.dataset.action;
        const id = parseInt(target.dataset.id);
        const compraId = parseInt(target.dataset.compraId);

        switch(action) {
            case 'editar-conta':
                UI.openModal(UI.getAccountModalContent(id));
                document.getElementById('form-conta').addEventListener('submit', salvarConta);
                break;
            case 'deletar-conta':
                deletarConta(id);
                break;
            case 'pagar-conta':
                UI.openModal(UI.getPayBillModalContent(id));
                document.getElementById('form-pagamento').addEventListener('submit', confirmarPagamento);
                break;
            case 'editar-lancamento':
                UI.openModal(UI.getBillModalContent(id));
                document.getElementById('form-lancamento').addEventListener('submit', salvarLancamentoFuturo);
                break;
            case 'deletar-lancamento':
                deletarLancamento(id, compraId);
                break;
             case 'deletar-transacao':
                deletarTransacao(id);
                break;
            case 'toggle-lancamentos':
                const group = target.closest('.monthly-group');
                group.classList.toggle('open');
                const content = group.querySelector('.monthly-content');
                if (group.classList.contains('open')) {
                    content.style.maxHeight = content.scrollHeight + "px";
                } else {
                    content.style.maxHeight = null;
                }
                break;
        }
    });

    document.body.addEventListener('change', (e) => {
         if (e.target.id === 'conta-tipo') {
             const isCreditCard = e.target.value === 'Cartão de Crédito';
             document.getElementById('cartao-credito-fields').style.display = isCreditCard ? '' : 'none';
             document.getElementById('saldo-inicial-group').style.display = isCreditCard ? 'none' : '';
         }
    });

}

// --- INICIALIZAÇÃO ---

async function initializeApp() {
    applyTheme(localStorage.getItem('confin-theme') || 'light');
    setupEventListeners();
    try {
        const initialData = await fetchData();
        setState(initialData);
        UI.renderAllComponents();
    } catch (error) {
        UI.showToast(`Erro fatal ao carregar dados: ${error.message}`, 'error');
    }
}

initializeApp();