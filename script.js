document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIGURAÇÃO E ESTADO GLOBAL ---
    const SUPABASE_URL = 'https://fjrpiikhbsvauzbdugtd.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqcnBpaWtoYnN2YXV6YmR1Z3RkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQwODUwNjcsImV4cCI6MjA2OTY2MTA2N30.htvLwyMRQcJhB4GgkromHejZ2f8aHPWxCCxA3mAQCcM';
    const clienteSupabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    const HOJE = new Date();
    HOJE.setHours(0, 0, 0, 0);

    let contasCache = [], transacoesCache = [], lancamentosFuturosCache = [], comprasParceladasCache = [], summaryChart = null;
    let mesesVisiveis = 3; 
    
    const CATEGORIAS_PADRAO = ['Alimentação', 'Transporte', 'Moradia', 'Saúde', 'Lazer', 'Educação', 'Salário', 'Investimentos', 'Contas', 'Ajustes', 'Pagamento de Fatura', 'Outros', 'Compras'];
    
    const CATEGORY_ICONS = {
        'Alimentação': { icon: 'fas fa-utensils', color: '#f97316' }, 'Transporte': { icon: 'fas fa-car', color: '#3b82f6' },
        'Moradia': { icon: 'fas fa-home', color: '#10b981' }, 'Saúde': { icon: 'fas fa-heartbeat', color: '#ef4444' },
        'Lazer': { icon: 'fas fa-film', color: '#8b5cf6' }, 'Educação': { icon: 'fas fa-graduation-cap', color: '#14b8a6' },
        'Salário': { icon: 'fas fa-dollar-sign', color: '#22c55e' }, 'Investimentos': { icon: 'fas fa-chart-line', color: '#eab308' },
        'Contas': { icon: 'fas fa-file-invoice', color: '#64748b' }, 'Compras': { icon: 'fas fa-shopping-bag', color: '#d946ef' },
        'Ajustes': { icon: 'fas fa-sliders-h', color: '#78716c' },
        'Pagamento de Fatura': { icon: 'fas fa-receipt', color: '#0ea5e9' },
        'Outros': { icon: 'fas fa-ellipsis-h', color: '#94a3b8' }
    };
    
    // --- FUNÇÕES UTILITÁRIAS ---
    const formatarMoeda = (valor) => (valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    
    const applyTheme = (theme) => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('confin-theme', theme);
    };

    const showToast = (message, type = 'success') => {
        const toastContainer = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        toastContainer.appendChild(toast);
        setTimeout(() => { toast.classList.add('show'); }, 10);
        setTimeout(() => {
            toast.classList.remove('show');
            toast.addEventListener('transitionend', () => toast.remove());
        }, 3000);
    };

    const setLoadingState = (button, isLoading, originalText = 'Salvar') => {
        if (!button) return;
        if (isLoading) {
            button.disabled = true;
            button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Salvando...`;
        } else {
            button.disabled = false;
            button.innerHTML = originalText;
        }
    };

    const toISODateString = (date) => new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

    // --- LÓGICA DE MODAL & TABS ---
    const openModal = (content) => {
        const modalHTML = `<button class="modal-close-btn" id="modal-close-btn">×</button>${content}`;
        const modalContentArea = document.getElementById('modal-content-area');
        modalContentArea.innerHTML = modalHTML;
        document.getElementById('modal-container').classList.add('active');
        document.getElementById('modal-close-btn').addEventListener('click', closeModal);
    };
    const closeModal = () => {
        document.getElementById('modal-container').classList.remove('active');
        document.getElementById('modal-content-area').innerHTML = '';
    };
    const switchTab = (clickedButton, parentContainer) => {
        const tabName = clickedButton.dataset.tab;
        parentContainer.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
        parentContainer.querySelectorAll('.tab-button').forEach(tb => tb.classList.remove('active'));
        const tabContent = parentContainer.querySelector(`#${tabName}`);
        if (tabContent) {
            tabContent.classList.add('active');
        }
        clickedButton.classList.add('active');
    };
    
    // --- CARREGAMENTO DE DADOS ---
    const carregarDadosIniciais = async () => {
        try {
            const [contasRes, transacoesRes, lancamentosRes, comprasParceladasRes] = await Promise.all([
                clienteSupabase.from('contas').select('*').order('nome'),
                clienteSupabase.from('transacoes').select('*').order('data', { ascending: false, nullsFirst: false }),
                clienteSupabase.from('lancamentos_futuros').select('*').order('data_vencimento'),
                clienteSupabase.from('compras_parceladas').select('*')
            ]);
            if(contasRes.error) throw contasRes.error;
            if(transacoesRes.error) throw transacoesRes.error;
            if(lancamentosRes.error) throw lancamentosRes.error;
            if(comprasParceladasRes.error) throw comprasParceladasRes.error;
            
            contasCache = contasRes.data || [];
            transacoesCache = transacoesRes.data || [];
            lancamentosFuturosCache = lancamentosRes.data || [];
            comprasParceladasCache = comprasParceladasRes.data || [];
        } catch (error) {
            console.error("Erro ao carregar dados iniciais:", error);
            showToast(`Erro ao carregar dados: ${error.message}`, 'error');
        }
    };

    // --- FUNÇÃO HELPER ---
    const gerarTransacoesVirtuaisDeParcelas = () => {
        const transacoesVirtuais = [];
        comprasParceladasCache.forEach(compra => {
            const cartao = contasCache.find(c => c.id === compra.conta_id);
            if (!cartao || !cartao.dia_fechamento_cartao) return;

            const parcelas = lancamentosFuturosCache.filter(l => l.compra_parcelada_id === compra.id && l.status === 'pendente');
            const dataOriginalCompra = new Date(compra.data_compra + 'T12:00:00');

            parcelas.forEach(parcela => {
                const numeroDaParcelaMatch = parcela.descricao.match(/\((\d+)\/\d+\)/);
                if (!numeroDaParcelaMatch) return;

                const numeroDaParcela = parseInt(numeroDaParcelaMatch[1]);
                let dataDaParcela;

                if (numeroDaParcela === 1) {
                    dataDaParcela = dataOriginalCompra;
                } else {
                    dataDaParcela = new Date(dataOriginalCompra.getFullYear(), dataOriginalCompra.getMonth() + (numeroDaParcela - 1), dataOriginalCompra.getDate());
                }

                transacoesVirtuais.push({
                    id: `v_${parcela.id}`,
                    descricao: parcela.descricao,
                    valor: parcela.valor,
                    data: toISODateString(dataDaParcela),
                    categoria: compra.categoria,
                    tipo: 'despesa',
                    conta_id: compra.conta_id,
                    isVirtual: true,
                    compraParceladaId: compra.id
                });
            });
        });
        return transacoesVirtuais;
    };
    
    // --- FUNÇÕES DE RENDERIZAÇÃO ---
    const renderAllComponents = () => {
        renderContas();
        renderSummary(); 
        renderLancamentosFuturos();
        aplicarFiltrosHistorico();
        renderFormTransacaoRapida();
    };

    const renderContas = () => {
        const container = document.getElementById('accounts-container');
        if (!contasCache || contasCache.length === 0) {
            container.innerHTML = '<p style="text-align:center; color: var(--text-secondary);">Nenhuma conta cadastrada.</p>';
            return;
        }
        container.innerHTML = contasCache.map(conta => {
            const transacoesDaConta = transacoesCache.filter(t => t.conta_id === conta.id);
            const saldo = transacoesDaConta.reduce((acc, t) => t.tipo === 'receita' ? acc + t.valor : acc - t.valor, conta.saldo_inicial);
            const corSaldo = saldo >= 0 ? 'var(--income-color)' : 'var(--expense-color)';
            
            let botoesEspecificos = '';
            if (conta.tipo === 'Conta Corrente' || conta.tipo === 'Poupança') {
                botoesEspecificos = `<button class="btn-icon" title="Ajustar Saldo" onclick="window.app.openBalanceAdjustmentModal(${conta.id})"><i class="fas fa-calculator"></i></button>`;
            } else if (conta.tipo === 'Cartão de Crédito') {
                botoesEspecificos = `<button class="btn-icon" title="Ver Fatura" onclick="window.app.openStatementView(${conta.id})"><i class="fas fa-file-invoice"></i></button>`;
            }
    
            return `<div class="account-item">
                        <div class="account-details">
                            <span class="account-name">${conta.nome}</span>
                            <span class="account-type">${conta.tipo}</span>
                        </div>
                        <div class="account-actions">
                            <span class="account-balance" style="color: ${corSaldo}; margin-right: 0.5rem;">${formatarMoeda(saldo)}</span>
                            ${botoesEspecificos}
                            <button class="btn-icon" title="Editar Conta" onclick="window.app.openAccountModal(${conta.id})"><i class="fas fa-pencil-alt"></i></button>
                            <button class="btn-icon" title="Deletar Conta" onclick="window.app.deletarConta(${conta.id})"><i class="fas fa-trash-alt"></i></button>
                        </div>
                    </div>`;
        }).join('');
    };

    const renderSummary = () => {
        const tabContainer = document.getElementById('dashboard-tab-buttons');
        if (!tabContainer.dataset.initialized) {
            renderVisaoMensal();
            renderVisaoAnual();
            tabContainer.dataset.initialized = true;
        }
    
        tabContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('tab-button')) {
                const dashboardCard = document.querySelector('.card:has(#dashboard-tab-buttons)');
                switchTab(e.target, dashboardCard);
            }
        });
    };
    
    const renderVisaoMensal = () => {
        const container = document.getElementById('dashboard-monthly');
        const mesSelecionado = document.getElementById('dashboard-month-filter')?.value || new Date().toISOString().slice(0, 7);
        
        const transacoesVirtuais = gerarTransacoesVirtuaisDeParcelas();
        const transacoesCompletas = [...transacoesCache, ...transacoesVirtuais];
        const transacoesDoMes = transacoesCompletas.filter(t => t.data && t.data.startsWith(mesSelecionado));
        
        const receitas = transacoesDoMes.filter(t => t.tipo === 'receita').reduce((sum, t) => sum + t.valor, 0);
        const despesas = transacoesDoMes.filter(t => t.tipo === 'despesa').reduce((sum, t) => sum + t.valor, 0);
        const saldo = receitas - despesas;
        const comprometimento = receitas > 0 ? ((despesas / receitas) * 100).toFixed(0) : 0;

        container.innerHTML = `
            <div class="dashboard-controls">
                <input type="month" id="dashboard-month-filter" value="${mesSelecionado}">
            </div>
            <div class="dashboard-kpis">
                <div class="kpi-item"><h4>Receitas</h4><p class="income-text">${formatarMoeda(receitas)}</p></div>
                <div class="kpi-item"><h4>Despesas</h4><p class="expense-text">${formatarMoeda(despesas)}</p></div>
                <div class="kpi-item"><h4>Saldo do Mês</h4><p style="color: ${saldo >= 0 ? 'var(--income-color)' : 'var(--expense-color)'}">${formatarMoeda(saldo)}</p></div>
                <div class="kpi-item"><h4>Comprometimento</h4><p>${comprometimento}%</p></div>
            </div>
            <div class="dashboard-chart-container"><canvas id="summary-chart-monthly"></canvas></div>`;
        
        document.getElementById('dashboard-month-filter').addEventListener('change', renderVisaoMensal);
        
        const ctx = document.getElementById('summary-chart-monthly')?.getContext('2d');
        if (summaryChart) {
            summaryChart.destroy();
            summaryChart = null;
        }
        
        const despesasPorCategoria = transacoesDoMes
            .filter(t => t.tipo === 'despesa')
            .reduce((acc, t) => {
                acc[t.categoria] = (acc[t.categoria] || 0) + t.valor;
                return acc;
            }, {});

        summaryChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(despesasPorCategoria),
                datasets: [{ data: Object.values(despesasPorCategoria), backgroundColor: Object.keys(despesasPorCategoria).map(cat => CATEGORY_ICONS[cat]?.color || '#cccccc') }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: 'right' } } }
        });
    };

    const renderVisaoAnual = () => {
        const container = document.getElementById('dashboard-yearly');
        const anoSelecionado = parseInt(document.getElementById('dashboard-year-filter')?.value) || new Date().getFullYear();

        const transacoesVirtuais = gerarTransacoesVirtuaisDeParcelas();
        const transacoesCompletas = [...transacoesCache, ...transacoesVirtuais];
        const transacoesDoAno = transacoesCompletas.filter(t => t.data && t.data.startsWith(anoSelecionado));

        let receitasPorMes = Array(12).fill(0);
        let despesasPorMes = Array(12).fill(0);
        let mesesComReceita = new Set();

        transacoesDoAno.forEach(t => {
            const mes = new Date(t.data + 'T12:00:00').getMonth(); // 0-11
            if (t.tipo === 'receita') {
                receitasPorMes[mes] += t.valor;
                mesesComReceita.add(mes);
            } else if (t.tipo === 'despesa') {
                despesasPorMes[mes] += t.valor;
            }
        });
        
        const totalReceitasAno = receitasPorMes.reduce((a, b) => a + b, 0);
        const totalDespesasAno = despesasPorMes.reduce((a, b) => a + b, 0);
        const balancoAnual = totalReceitasAno - totalDespesasAno;
        const mediaDespesas = totalDespesasAno / 12;
        const mediaReceitas = mesesComReceita.size > 0 ? totalReceitasAno / mesesComReceita.size : 0;
        
        const dividasFuturas = lancamentosFuturosCache.filter(l => l.status === 'pendente' && l.tipo === 'a_pagar').reduce((sum, l) => sum + l.valor, 0);
        const grauEndividamento = mediaReceitas > 0 ? (dividasFuturas / mediaReceitas).toFixed(1) : 'N/A';
        
        container.innerHTML = `
             <div class="dashboard-controls">
                <input type="number" id="dashboard-year-filter" value="${anoSelecionado}" min="2020" max="2050" style="width: 120px;">
            </div>
            <div class="dashboard-kpis">
                <div class="kpi-item"><h4>Balanço Anual</h4><p style="color: ${balancoAnual >= 0 ? 'var(--income-color)' : 'var(--expense-color)'}">${formatarMoeda(balancoAnual)}</p></div>
                <div class="kpi-item"><h4>Média/Mês (Despesas)</h4><p class="expense-text">${formatarMoeda(mediaDespesas)}</p></div>
                 <div class="kpi-item"><h4>Dívidas Futuras</h4><p>${formatarMoeda(dividasFuturas)}</p></div>
                <div class="kpi-item"><h4>Grau de Endividamento</h4><p>${grauEndividamento} meses</p></div>
            </div>
            <div class="dashboard-chart-container"><canvas id="summary-chart-yearly"></canvas></div>`;
        
        document.getElementById('dashboard-year-filter').addEventListener('change', renderVisaoAnual);

        const ctx = document.getElementById('summary-chart-yearly')?.getContext('2d');
        if (summaryChart) {
            summaryChart.destroy();
            summaryChart = null;
        }

        summaryChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
                datasets: [
                    { label: 'Receitas', data: receitasPorMes, backgroundColor: 'rgba(75, 192, 192, 0.5)', borderColor: 'rgb(75, 192, 192)', borderWidth: 1 },
                    { label: 'Despesas', data: despesasPorMes, backgroundColor: 'rgba(255, 99, 132, 0.5)', borderColor: 'rgb(255, 99, 132)', borderWidth: 1 }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
        });
    };

    const renderLancamentosFuturos = () => {
        // ... (código completo na próxima seção)
    };

    const aplicarFiltrosHistorico = () => {
        renderHistoricoTransacoes();
    };

    const renderHistoricoTransacoes = () => {
        // ... (código completo na próxima seção)
    };

    const renderTransactionCard = (t) => {
        // ... (código completo na próxima seção)
    };

    const renderFormTransacaoRapida = () => {
        // ... (código completo na próxima seção)
    };
    
    // --- LÓGICA DE AÇÕES ---
    const openAccountModal = (id = null) => {
        // ... (código completo na próxima seção)
    };

    const salvarConta = async (e) => {
        // ... (código completo na próxima seção)
    };
    
    const deletarConta = async (id) => {
        // ... (código completo na próxima seção)
    };

    const openBillModal = (id = null) => {
        // ... (código completo na próxima seção)
    };

    const salvarLancamentoFuturo = async (e) => {
        // ... (código completo na próxima seção)
    };

    const deletarLancamentoFuturo = async (id) => {
        // ... (código completo na próxima seção)
    };
    
    const openPayBillModal = (billId) => {
        // ... (código completo na próxima seção)
    };

    const confirmarPagamento = async (e) => {
        // ... (código completo na próxima seção)
    };
    
    const salvarTransacao = async (e) => {
        // ... (código completo na próxima seção)
    };

    const openTransactionModal = (id) => {
        // ... (código completo na próxima seção)
    };

    const deletarTransacao = async (id) => {
        // ... (código completo na próxima seção)
    };
    
    const deletarCompraParcelada = async (compraId) => {
        // ... (código completo na próxima seção)
    };

    const openEditInstallmentModal = (compraId) => {
        // ... (código completo na próxima seção)
    };

    const salvarEdicaoCompraParcelada = async (e) => {
        // ... (código completo na próxima seção)
    };
    
    const openInstallmentPurchaseModal = () => {
        // ... (código completo na próxima seção)
    };

    const salvarCompraParcelada = async (e) => {
        // ... (código completo na próxima seção)
    };
    
    const openStatementView = (accountId) => {
        // ... (código completo na próxima seção)
    };

    const renderStatementDetails = (accountId, faturaKey) => {
        // ... (código completo na próxima seção)
    };

    const hideStatementView = () => {
        // ... (código completo na próxima seção)
    };
    
    const openBalanceAdjustmentModal = (accountId) => {
        // ... (código completo na próxima seção)
    };

    const salvarAjusteDeSaldo = async (e) => {
        // ... (código completo na próxima seção)
    };

    // --- INICIALIZAÇÃO E EVENT LISTENERS ---
    const initializeApp = async () => {
        window.app = { 
            openAccountModal, deletarConta, 
            openBillModal, deletarLancamentoFuturo, openPayBillModal, 
            renderHistoricoTransacoes, openBalanceAdjustmentModal, 
            openTransactionModal, deletarTransacao, deletarCompraParcelada,
            openEditInstallmentModal,
            aplicarFiltrosHistorico, 
            closeModal, 
            openStatementView,
            hideStatementView 
        };

        document.getElementById('theme-switcher').addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            applyTheme(currentTheme === 'light' ? 'dark' : 'light');
        });
        
        document.getElementById('main-tab-buttons').addEventListener('click', (e) => {
            if (e.target.classList.contains('tab-button')) {
                const parent = e.target.closest('.card');
                switchTab(e.target, parent);
            }
        });

        document.getElementById('form-transacao-rapida').addEventListener('submit', salvarTransacao);
        
        document.getElementById('btn-add-account').addEventListener('click', () => openAccountModal());
        document.getElementById('btn-open-installment').addEventListener('click', openInstallmentPurchaseModal);
        document.getElementById('btn-open-bill').addEventListener('click', () => openBillModal());
        
        applyTheme(localStorage.getItem('confin-theme') || 'light');
        await carregarDadosIniciais();
        renderAllComponents();
    };

    initializeApp();
});