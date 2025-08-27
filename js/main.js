// js/main.js

import * as UI from './ui.js';
import * as API from './api.js';
import * as State from './state.js';
import { applyTheme } from './utils.js';

// --- AÇÕES ---
async function salvarConta(e){ e.preventDefault(); const form=e.target; const btn=form.querySelector('button'); UI.setLoadingState(btn,true); try { const id=form.dataset.id; const data=Object.fromEntries(new FormData(form)); const saved=await API.salvarDados('contas',data,id); const state=State.getState(); const newContas=id?state.contas.map(c=>c.id==saved.id?saved:c):[...state.contas,saved]; State.setState({contas:newContas.sort((a, b) => a.nome.localeCompare(b.nome))}); UI.renderAllComponents(); UI.closeModal(); UI.showToast('Conta salva!'); } catch(err){UI.showToast(err.message,'error')} finally {UI.setLoadingState(btn,false,'Salvar')} }
async function deletarConta(id){ if(!confirm('Apagar conta?'))return; try{ await API.deletarDados('contas',id); const state=State.getState(); State.setState({contas:state.contas.filter(c=>c.id!==id)}); UI.renderAllComponents(); UI.showToast('Conta deletada.'); } catch(err){UI.showToast(err.message,'error')} }
async function salvarTransacaoRapida(e){ e.preventDefault(); const form=e.target; const btn=form.querySelector('button'); UI.setLoadingState(btn,true); try { const data=Object.fromEntries(new FormData(form)); data.valor=parseFloat(data.valor); data.conta_id=parseInt(data.conta_id); const saved=await API.salvarDados('transacoes',data); const state=State.getState(); State.setState({transacoes:[...state.transacoes,saved].sort((a,b) => new Date(b.data) - new Date(a.data))}); UI.renderAllComponents(); form.reset(); UI.showToast('Transação salva!'); } catch(err){UI.showToast(err.message,'error')} finally {UI.setLoadingState(btn,false,'Salvar Transação')} }
async function confirmarPagamento(e){ e.preventDefault(); const form=e.target; const btn=form.querySelector('button'); UI.setLoadingState(btn,true); try { const data=Object.fromEntries(new FormData(form)); const transacao = { descricao:form.dataset.desc, valor:parseFloat(form.dataset.valor), data:data.data, conta_id:parseInt(data.conta_id), categoria:form.dataset.cat, tipo:'despesa' }; const savedT=await API.salvarDados('transacoes',transacao); const savedL=await API.salvarDados('lancamentos_futuros',{status:'pago'},form.dataset.billId); const state=State.getState(); State.setState({ transacoes:[...state.transacoes, savedT].sort((a,b)=>new Date(b.data)-new Date(a.data)), lancamentosFuturos:state.lancamentosFuturos.map(l=>l.id===savedL.id?savedL:l) }); UI.renderAllComponents(); UI.closeModal(); UI.showToast('Conta paga!'); } catch(err){UI.showToast(err.message,'error')} finally {UI.setLoadingState(btn,false,'Confirmar')} }

// --- FUNÇÃO PRINCIPAL QUE RODA QUANDO O HTML ESTÁ PRONTO ---
document.addEventListener('DOMContentLoaded', () => {

    // --- EVENT LISTENERS ---
    function setupEventListeners() {
        document.getElementById('theme-switcher').addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            applyTheme(current === 'light' ? 'dark' : 'light');
        });

        document.getElementById('modal-container').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                UI.closeModal();
            }
        });

        document.getElementById('dashboard-tab-buttons').addEventListener('click', e => e.target.matches('.tab-button') && UI.switchTab(e.target, '.card:has(#dashboard-tab-buttons)'));
        document.getElementById('main-tab-buttons').addEventListener('click', e => e.target.matches('.tab-button') && UI.switchTab(e.target, '.card:has(#main-tab-buttons)'));
        document.getElementById('form-transacao-rapida').addEventListener('submit', salvarTransacaoRapida);
        document.getElementById('btn-add-account').addEventListener('click', () => {
            UI.openModal(UI.getAccountModalContent());
            document.getElementById('form-conta').addEventListener('submit', salvarConta);
        });
        document.getElementById('btn-open-bill').addEventListener('click',()=>UI.openModal(UI.getBillModalContent()));
        document.getElementById('btn-open-installment').addEventListener('click',()=>UI.openModal(UI.getInstallmentPurchaseModalContent()));
        
        document.body.addEventListener('click', e => {
            const target = e.target.closest('[data-action]');
            if(!target) return;
            const id = parseInt(target.dataset.id);
            switch(target.dataset.action){
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
            }
        });

        document.body.addEventListener('change', e => {
            if (e.target.id === 'conta-tipo') {
                const isCreditCard = e.target.value === 'Cartão de Crédito';
                const cartaoFields = document.getElementById('cartao-credito-fields');
                const saldoField = document.getElementById('saldo-inicial-group');
                if(cartaoFields) cartaoFields.style.display = isCreditCard ? '' : 'none';
                if(saldoField) saldoField.style.display = isCreditCard ? 'none' : 'block';
            }
        });
    }

    // --- INICIALIZAÇÃO ---
    async function initializeApp() {
        UI.showToast('Carregando dados...');
        try {
            const data = await API.fetchData();
            State.setState(data);
            UI.renderAllComponents();
        } catch (error) {
            UI.showToast(error.message, 'error');
        }
    }

    // Iniciar a aplicação
    applyTheme(localStorage.getItem('confin-theme') || 'light');
    setupEventListeners();
    initializeApp();
});
