// ARQUIVO: js/main.js
import { SUPABASE_URL, SUPABASE_KEY } from './api.js';
import * as State from './state.js';
import * as UI from './ui.js';
import { toISODateString, exportToCSV, applyTheme } from './utils.js';

// --- INICIALIZAÇÃO DO SUPABASE ---
// Usa o objeto global para evitar erros de importação via URL
const { createClient } = window.supabase;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- ESTADO LOCAL (FILTROS) ---
let activeFilters = {
    bills: { mes: 'todos', contaId: 'todas', pesquisa: '' },
    history: { mes: 'todos', contaId: 'todas', pesquisa: '' }
};

// =========================================================================
// === 1. INICIALIZAÇÃO DA APP ===
// =========================================================================

const initApp = async () => {
    // 1. Aplica o tema salvo (Dark/Light)
    const savedTheme = localStorage.getItem('confin_theme') || 'light';
    applyTheme(savedTheme);

    // 2. Verifica se usuário está logado
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
        UI.toggleAppView(false); // Mostra tela de Login
        setupLoginListener();
    } else {
        UI.toggleAppView(true); // Mostra Dashboard
        UI.renderLogoutButton();
        await loadData(); // Carrega dados do banco
    }
};

const setupLoginListener = () => {
    const form = document.getElementById('form-login');
    if(form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = form.email.value;
            const password = form.password.value;
            
            // Tenta logar
            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            
            if (error) {
                alert('Erro ao entrar: ' + error.message);
            } else {
                UI.toggleAppView(true);
                await loadData();
            }
        });
    }
};

// =========================================================================
// === 2. GERENCIAMENTO DE DADOS (CARREGAMENTO) ===
// =========================================================================

const loadData = async () => {
    try {
        // Busca tudo em paralelo para ser rápido
        const [resContas, resCats, resTrans, resLanc, resCompras] = await Promise.all([
            supabase.from('contas').select('*'),
            supabase.from('categorias').select('*').order('nome', { ascending: true }),
            supabase.from('transacoes').select('*'),
            supabase.from('lancamentos_futuros').select('*'),
            supabase.from('compras_parceladas').select('*')
        ]);

        if (resContas.error) throw resContas.error;

        // Salva no Estado Global (Memória)
        State.setContas(resContas.data);
        State.setCategorias(resCats.data);
        State.setTransacoes(resTrans.data);
        State.setLancamentosFuturos(resLanc.data);
        State.setComprasParceladas(resCompras.data);

        // Renderiza a Tela
        UI.renderAllComponents(activeFilters);

    } catch (error) {
        console.error("Erro ao carregar dados:", error);
        UI.showToast("Erro de conexão com o banco de dados.", "error");
    }
};

// =========================================================================
// === 3. CONFIGURAÇÃO DE LISTENERS (EVENTOS DE CLIQUE) ===
// =========================================================================

const setupEventListeners = () => {
    
    // --- NAVEGAÇÃO E SISTEMA ---
    
    // Logout
    document.getElementById('btn-logout')?.addEventListener('click', async () => {
        await supabase.auth.signOut();
        window.location.reload();
    });

    // Alternar Tema (Dark/Light)
    document.getElementById('theme-switcher')?.addEventListener('click', () => {
        const html = document.documentElement;
        const currentTheme = html.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        applyTheme(newTheme);
    });

    // Modo Privacidade (Blur nos valores)
    document.getElementById('btn-privacy-toggle')?.addEventListener('click', () => {
        document.body.classList.toggle('privacy-mode');
        const icon = document.querySelector('#btn-privacy-toggle i');
        if (document.body.classList.contains('privacy-mode')) {
            icon.classList.replace('fa-eye', 'fa-eye-slash');
        } else {
            icon.classList.replace('fa-eye-slash', 'fa-eye');
        }
    });

    // --- FILTROS E EXPORTAÇÃO ---

    // Filtros da aba Agendamentos
    document.getElementById('bills-filters-container')?.addEventListener('input', (e) => {
        if(e.target.id === 'bills-month-filter') activeFilters.bills.mes = e.target.value;
        if(e.target.id === 'bills-account-filter') activeFilters.bills.contaId = e.target.value;
        if(e.target.id === 'bills-search-input') activeFilters.bills.pesquisa = e.target.value;
        UI.renderLancamentosFuturos(1, activeFilters.bills);
    });

    // Filtros da aba Histórico
    document.getElementById('history-filters-container')?.addEventListener('input', (e) => {
        if(e.target.id === 'history-month-filter') activeFilters.history.mes = e.target.value;
        if(e.target.id === 'history-account-filter') activeFilters.history.contaId = e.target.value;
        if(e.target.id === 'history-search-input') activeFilters.history.pesquisa = e.target.value;
        UI.renderHistoricoTransacoes(1, activeFilters.history);
    });

    // Botão Exportar CSV
    document.getElementById('btn-export-csv')?.addEventListener('click', () => {
        const { transacoes } = State.getState();
        const dadosLimpos = transacoes.map(t => ({
            Data: t.data,
            Descricao: t.descricao,
            Valor: t.valor,
            Tipo: t.tipo,
            Categoria: t.categoria,
            Conta: State.getContaPorId(t.conta_id)?.nome || 'N/A'
        }));
        exportToCSV(dadosLimpos, `ConFin_Relatorio_${toISODateString(new Date())}`);
    });

    // --- BOTÕES DE ABERTURA DE MODAL ---

    // Nova Conta
    document.getElementById('btn-add-account')?.addEventListener('click', () => {
        UI.openModal(UI.getAccountModalContent());
    });

    // Gerenciar Categorias
    document.getElementById('btn-manage-categories')?.addEventListener('click', () => {
        UI.openModal(UI.getCategoriesModalContent());
    });

    // --- DELEGAÇÃO DE EVENTOS (Para botões dentro de listas dinâmicas) ---

    // 1. Ações nas Contas (Extrato, Fatura, Editar, Deletar)
    document.getElementById('accounts-container')?.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const action = btn.dataset.action;
        const id = btn.dataset.id;

        if (action === 'ver-extrato') {
            UI.openModal(UI.getAccountStatementModalContent(id));
            setupStatementListeners('account');
        } else if (action === 'ver-fatura') {
            UI.openModal(UI.getStatementModalContent(id));
            setupStatementListeners('statement');
        } else if (action === 'editar-conta') {
            UI.openModal(UI.getAccountModalContent(id));
        } else if (action === 'deletar-conta') {
            UI.showConfirmModal('Tem certeza que deseja excluir esta conta? O histórico será mantido, mas ela sumirá da lista.', async () => {
                await supabase.from('contas').delete().eq('id', id);
                await loadData();
                UI.showToast('Conta excluída.');
            });
        }
    });

    // 2. Ações Globais (Listas de Histórico e Agendamentos)
    document.body.addEventListener('click', async (e) => {
        const btn = e.target.closest('button');
        if (!btn || !btn.dataset.action) return;

        const action = btn.dataset.action;
        const id = btn.dataset.id; 

        // Deletar Agendamento
        if (action === 'deletar-lancamento') {
            const compraId = btn.dataset.compraId;
            let msg = 'Excluir este agendamento?';
            if(compraId) msg = 'Esta é uma parcela. Deseja excluir apenas este lançamento específico?';
            
            UI.showConfirmModal(msg, async () => {
                await supabase.from('lancamentos_futuros').delete().eq('id', id);
                await loadData();
                UI.showToast('Agendamento removido.');
            });
        }
        
        // Deletar Transação Realizada
        else if (action === 'deletar-transacao') {
            UI.showConfirmModal('Deseja excluir permanentemente esta transação do histórico?', async () => {
                await supabase.from('transacoes').delete().eq('id', id);
                await loadData();
                UI.showToast('Transação removida.');
            });
        }

        // Deletar Categoria
        else if (action === 'deletar-categoria') {
            UI.showConfirmModal('Excluir categoria?', async () => {
                await supabase.from('categorias').delete().eq('id', id);
                const { data: cats } = await supabase.from('categorias').select('*').order('nome');
                State.setCategorias(cats);
                UI.openModal(UI.getCategoriesModalContent()); // Recarrega modal
            });
        }

        // Editar Categoria (Abre form de edição)
        else if (action === 'editar-categoria') {
            const nomeAtual = btn.dataset.nome;
            UI.openModal(UI.getEditCategoryModalContent(id, nomeAtual));
        }

        // Ações de Pagamento e Edição de Itens
        else if (action === 'pagar-conta') {
            UI.openModal(UI.getPayBillModalContent(id));
        } else if (action === 'editar-lancamento') {
            UI.openModal(UI.getBillModalContent(id));
        } 
        
        // CORREÇÃO: Edição Inteligente (Real vs Virtual)
        else if (action === 'editar-transacao') {
            // Verifica se é uma transação virtual (previsão futura no histórico)
            if (String(id).startsWith('v_')) {
                // É Virtual! Remove o prefixo 'v_' e abre o modal de Agendamento
                const realId = id.substring(2); 
                UI.openModal(UI.getBillModalContent(realId));
            } else {
                // É Real! Abre o modal de Transação normal
                UI.openModal(UI.getTransactionModalContent(id));
            }
        } 
        
        else if (action === 'recriar-compra-parcelada') {
            const compra = State.getState().comprasParceladas.find(c => c.id == id);
            if(compra) UI.openModal(UI.getInstallmentPurchaseModalContent(compra));
        }
    });

    // --- 4. SUBMISSÃO DE FORMULÁRIOS (SALVAR DADOS) ---
    // Captura o submit de qualquer formulário dentro do body
    document.body.addEventListener('submit', async (e) => {
        if (!e.target.matches('form')) return;
        e.preventDefault();
        
        const form = e.target;
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        const btnSubmit = form.querySelector('button[type="submit"]');

        UI.setLoadingState(btnSubmit, true); // Mostra spinner

        try {
            // A. Lançamento Rápido (Aba Lançar)
            if (form.id === 'form-transacao-unificada') {
                await processarLancamentoUnificado(data);
                form.reset(); 
                // Esconde campos condicionais
                const divParcelada = document.getElementById('parcelada-fields');
                const divRecorrente = document.getElementById('recorrente-fields');
                if (divParcelada) divParcelada.style.display = 'none';
                if (divRecorrente) divRecorrente.style.display = 'none';
                
                UI.showToast('Lançamento realizado com sucesso!');
            }
            
            // B. Nova/Editar Conta
            else if (form.id === 'form-conta') {
                const id = form.dataset.id;
                const payload = {
                    nome: data.nome,
                    tipo: data.tipo,
                    saldo_inicial: parseFloat(data.saldo_inicial),
                    dia_fechamento_cartao: data.dia_fechamento_cartao ? parseInt(data.dia_fechamento_cartao) : null,
                    dia_vencimento_cartao: data.dia_vencimento_cartao ? parseInt(data.dia_vencimento_cartao) : null
                };
                
                if (id) await supabase.from('contas').update(payload).eq('id', id);
                else await supabase.from('contas').insert([payload]);
                
                UI.closeModal();
                await loadData();
            }

            // C. Pagar Conta (Baixar Lançamento)
            else if (form.id === 'form-pagamento') {
                const billId = form.dataset.billId;
                const valor = parseFloat(form.dataset.valor);
                const desc = form.dataset.desc;
                const cat = form.dataset.cat;
                const billData = State.getState().lancamentosFuturos.find(b => b.id == billId);

                // 1. Cria transação real
                await supabase.from('transacoes').insert([{
                    descricao: desc,
                    valor: valor,
                    tipo: billData.tipo === 'a_pagar' ? 'despesa' : 'receita',
                    categoria: cat,
                    conta_id: data.conta_id,
                    data: data.data
                }]);

                // 2. Atualiza status do futuro para pago
                await supabase.from('lancamentos_futuros').update({ status: 'pago' }).eq('id', billId);

                UI.closeModal();
                await loadData();
                UI.showToast('Lançamento baixado!');
            }

            // D. Editar Transação Realizada
            else if (form.id === 'form-edicao-transacao') {
                const id = form.dataset.id;
                await supabase.from('transacoes').update({
                    descricao: data.descricao,
                    valor: parseFloat(data.valor),
                    data: data.data,
                    conta_id: data.conta_id,
                    categoria: data.categoria,
                    tipo: data.tipo
                }).eq('id', id);
                UI.closeModal();
                await loadData();
            }

            // E. Editar Série (Parcelamento/Recorrente)
            else if (form.id === 'form-compra-parcelada') {
                const oldId = form.dataset.compraAntigaId;
                
                // Apaga a série antiga e recria
                await supabase.from('compras_parceladas').delete().eq('id', oldId); 
                await supabase.from('lancamentos_futuros').delete().eq('compra_parcelada_id', oldId).eq('status', 'pendente');

                await processarLancamentoUnificado({
                    ...data,
                    tipo_compra: data.tipo_serie, 
                    valor: data.valor_total,
                    data: data.data_inicio,
                    tipo: 'despesa' // Assumindo despesa ao editar parcelamento
                });
                
                UI.closeModal();
                await loadData();
            }

            // F. Nova Categoria
            else if (form.id === 'form-nova-categoria') {
                await supabase.from('categorias').insert([{ nome: data.nome }]);
                // Recarrega lista
                const { data: cats } = await supabase.from('categorias').select('*').order('nome');
                State.setCategorias(cats);
                UI.openModal(UI.getCategoriesModalContent()); 
            }
            
            // G. Editar Categoria
            else if (form.id === 'form-editar-categoria') {
                const id = form.dataset.id;
                const nomeAntigo = form.dataset.nomeAntigo;
                const novoNome = data.nome;
                
                // Atualiza a categoria
                await supabase.from('categorias').update({ nome: novoNome }).eq('id', id);
                
                // Opcional: Atualizar histórico para manter consistência
                await supabase.from('transacoes').update({ categoria: novoNome }).eq('categoria', nomeAntigo);
                await supabase.from('lancamentos_futuros').update({ categoria: novoNome }).eq('categoria', nomeAntigo);
                await supabase.from('compras_parceladas').update({ categoria: novoNome }).eq('categoria', nomeAntigo);

                const { data: cats } = await supabase.from('categorias').select('*').order('nome');
                State.setCategorias(cats);
                UI.openModal(UI.getCategoriesModalContent());
            }

        } catch (err) {
            console.error(err);
            UI.showToast('Erro ao salvar: ' + err.message, 'error');
        } finally {
            UI.setLoadingState(btnSubmit, false);
        }
    });
};

// =========================================================================
// === 4. LÓGICA DE NEGÓCIO (PROCESSAMENTO DE DADOS) ===
// =========================================================================

const processarLancamentoUnificado = async (data) => {
    const valor = parseFloat(data.valor);
    const dateObj = new Date(data.data);
    
    // CASO 1: Transação Simples (À Vista)
    if (data.tipo_compra === 'vista') {
        const { error } = await supabase.from('transacoes').insert([{
            descricao: data.descricao,
            valor: valor,
            data: data.data,
            conta_id: data.conta_id,
            categoria: data.categoria,
            tipo: data.tipo
        }]);
        
        if (error) throw error;
        await loadData();
        return;
    }

    // CASO 2: Parcelado ou Recorrente (Gera Múltiplos)
    
    // A. Cria o registro "Pai" (Agrupador)
    const { data: compra, error } = await supabase.from('compras_parceladas').insert([{
        descricao: data.descricao + (data.tipo_compra==='recorrente' ? ' (Série)' : ''),
        valor_total: data.tipo_compra === 'parcelada' ? valor : 0,
        
        // CORREÇÃO CRÍTICA DO ERRO "NOT NULL":
        // Se for Recorrente, usamos a quantidade (duração) no campo numero_parcelas
        // para satisfazer a regra do banco de dados.
        numero_parcelas: data.tipo_compra === 'parcelada' 
            ? parseInt(data.numero_parcelas) 
            : parseInt(data.quantidade),
            
        conta_id: data.conta_id,
        categoria: data.categoria,
        data_compra: data.data
    }]).select().single();

    if (error) throw error;

    // B. Gera os Filhos (Lançamentos Futuros)
    const lancamentos = [];
    const qtd = data.tipo_compra === 'parcelada' ? parseInt(data.numero_parcelas) : parseInt(data.quantidade);
    const valorParcela = data.tipo_compra === 'parcelada' ? (valor / qtd) : valor;

    for (let i = 0; i < qtd; i++) {
        let vencimento = new Date(dateObj);
        
        // Lógica de Data
        if (data.tipo_compra === 'parcelada') {
            vencimento.setMonth(vencimento.getMonth() + i); 
        } else {
            // Recorrência
            if (data.frequencia === 'diaria') vencimento.setDate(vencimento.getDate() + i);
            else if (data.frequencia === 'quinzenal') vencimento.setDate(vencimento.getDate() + (i * 15));
            else if (data.frequencia === 'anual') vencimento.setFullYear(vencimento.getFullYear() + i);
            else { // mensal (padrão)
                vencimento.setMonth(vencimento.getMonth() + i);
                // Ajusta o dia se o usuário escolheu um dia específico de vencimento
                if(data.dia_vencimento) {
                    const diaAlvo = parseInt(data.dia_vencimento);
                    const ultimoDiaMes = new Date(vencimento.getFullYear(), vencimento.getMonth() + 1, 0).getDate();
                    vencimento.setDate(Math.min(diaAlvo, ultimoDiaMes));
                }
            }
        }

        lancamentos.push({
            compra_parcelada_id: compra.id,
            descricao: data.tipo_compra === 'parcelada' 
                ? `${data.descricao} (${i+1}/${qtd})` 
                : `${data.descricao} (Renovado ${i+1})`,
            valor: valorParcela,
            data_vencimento: toISODateString(vencimento),
            tipo: data.tipo === 'receita' ? 'a_receber' : 'a_pagar',
            categoria: data.categoria,
            status: 'pendente'
        });
    }

    const { error: errFilhos } = await supabase.from('lancamentos_futuros').insert(lancamentos);
    if (errFilhos) throw errFilhos;
    
    await loadData();
};

// Listener para o select dentro do modal de extrato/fatura
const setupStatementListeners = (type) => {
    const idSelect = type === 'account' ? 'account-statement-month-select' : 'statement-month-select';
    const select = document.getElementById(idSelect);
    if(select) {
        select.addEventListener('change', (e) => {
            const contaId = e.target.dataset.contaId;
            const mes = e.target.value;
            if(type === 'account') UI.renderAccountStatementDetails(contaId, mes);
            else UI.renderStatementDetails(contaId, mes);
        });
    }
};

// Inicia tudo ao carregar a página
document.addEventListener('DOMContentLoaded', initApp);
setupEventListeners();
