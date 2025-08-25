// A função 'renderHistoricoTransacoes' foi totalmente reescrita para corrigir a exibição de datas vazias.
// As demais funções permanecem como na versão anterior.
document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIGURAÇÃO E ESTADO GLOBAL ---
    const SUPABASE_URL = 'https://fjrpiikhbsvauzbdugtd.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqcnBpaWtoYnN2YXV6YmR1Z3RkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQwODUwNjcsImV4cCI6MjA2OTY2MTA2N30.htvLwyMRQcJhB4GgkromHejZ2f8aHPWxCCxA3mAQCcM';
    const clienteSupabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    const HOJE = new Date();
    HOJE.setHours(0, 0, 0, 0);

    let contasCache = [], transacoesCache = [], lancamentosFuturosCache = [], comprasParceladasCache = [], expenseChart = null;
    let mesesVisiveis = 3; 
    let transacoesVisiveisCount = 20;
    const ITENS_POR_PAGINA = 20;
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
    const getSelectedMonth = () => document.getElementById('filtroMes')?.value || new Date(HOJE).toISOString().slice(0, 7);
    
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
    const switchTab = (clickedButton) => {
        const tabName = clickedButton.dataset.tab;
        document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
        document.querySelectorAll('.tab-button').forEach(tb => tb.classList.remove('active'));
        document.getElementById(tabName).classList.add('active');
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

            const parcelas = lancamentosFuturosCache.filter(l => l.compra_parcelada_id === compra.id);
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
                botoesEspecificos = `<button class="btn-icon" title="Ver Fatura" onclick="window.app.openCreditCardStatementModal(${conta.id})"><i class="fas fa-file-invoice"></i></button>`;
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
        const mesSelecionado = getSelectedMonth();
        const transacoesDoMes = transacoesCache.filter(t => t.data && t.data.startsWith(mesSelecionado));
        const totalReceitas = transacoesDoMes.filter(t => t.tipo === 'receita').reduce((s, t) => s + t.valor, 0);
        const totalDespesas = transacoesDoMes.filter(t => t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0);
        
        const summaryContainer = document.getElementById('summary-container');
        summaryContainer.innerHTML = `
            <div class="form-group">
                <label>Mês de Referência</label>
                <input type="month" id="filtroMes" value="${mesSelecionado}">
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                <div><h4><i class="fas fa-arrow-up income-text"></i> Receitas</h4><p class="income-text" style="font-size:1.25rem; font-weight:600;">${formatarMoeda(totalReceitas)}</p></div>
                <div><h4><i class="fas fa-arrow-down expense-text"></i> Despesas</h4><p class="expense-text" style="font-size:1.25rem; font-weight:600;">${formatarMoeda(totalDespesas)}</p></div>
            </div>
            <div style="height: 200px; margin-top: 1.5rem;"><canvas id="expenseChart"></canvas></div>`;
        
        document.getElementById('filtroMes').addEventListener('change', renderSummary);
        renderExpenseChart(transacoesDoMes);
    };

    const renderExpenseChart = (transactions) => {
        const ctx = document.getElementById('expenseChart')?.getContext('2d');
        if (!ctx) return;
        if (expenseChart) expenseChart.destroy();
        
        const expensesByCategory = transactions
            .filter(t => t.tipo === 'despesa' && t.categoria !== 'Pagamento de Fatura')
            .reduce((acc, t) => {
                acc[t.categoria] = (acc[t.categoria] || 0) + t.valor;
                return acc;
            }, {});
        
        const labels = Object.keys(expensesByCategory);
        const data = Object.values(expensesByCategory);
        
        if (labels.length === 0) return;
        
        expenseChart = new Chart(ctx, { type: 'doughnut', data: { labels: labels, datasets: [{ data: data, backgroundColor: ['#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#8b5cf6'], hoverOffset: 4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { boxWidth: 12 } } } } });
    };

    const renderLancamentosFuturos = () => {
        const container = document.getElementById('tab-bills');
        const pendentes = lancamentosFuturosCache.filter(l => l.status === 'pendente');

        if (pendentes.length === 0) {
            container.innerHTML = '<p style="text-align:center; color: var(--text-secondary);">Nenhum lançamento futuro pendente.</p>';
            return;
        }

        const groupedByMonth = pendentes.reduce((acc, item) => {
            const monthKey = item.data_vencimento.substring(0, 7);
            if (!acc[monthKey]) acc[monthKey] = [];
            acc[monthKey].push(item);
            return acc;
        }, {});

        const todosOsMeses = Object.keys(groupedByMonth).sort();
        const mesesParaRenderizar = todosOsMeses.slice(0, mesesVisiveis);

        let accordionHTML = '';
        for (const monthKey of mesesParaRenderizar) {
            const items = groupedByMonth[monthKey];
            const [year, month] = monthKey.split('-');
            const monthName = new Date(year, month - 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
            
            const totalAPagar = items.filter(l => l.tipo === 'a_pagar').reduce((acc, l) => acc + l.valor, 0);
            const totalAReceber = items.filter(l => l.tipo === 'a_receber').reduce((acc, l) => acc + l.valor, 0);
            const saldoMes = totalAReceber - totalAPagar;
            const corSaldo = saldoMes >= 0 ? 'income-text' : 'expense-text';
            
            const summaryHTML = `
                <div class="monthly-summary">
                    ${totalAReceber > 0 ? `<span>A receber: <strong class="income-text">${formatarMoeda(totalAReceber)}</strong></span>` : ''}
                    ${totalAPagar > 0 ? `<span>A pagar: <strong class="expense-text">${formatarMoeda(totalAPagar)}</strong></span>` : ''}
                    <span>Saldo: <strong class="${corSaldo}">${formatarMoeda(saldoMes)}</strong></span>
                </div>`;

            let contentHTML = items.map(l => {
                const isVencido = new Date(l.data_vencimento) < HOJE;
                const corValor = l.tipo === 'a_receber' ? 'income-text' : 'expense-text';
                const categoriaInfo = CATEGORY_ICONS[l.categoria] || CATEGORY_ICONS['Outros'];
                return `<div class="bill-item ${isVencido ? 'overdue' : ''}"><div class="transaction-icon" style="background-color: ${categoriaInfo.color};"><i class="${categoriaInfo.icon}"></i></div><div class="bill-details"><div>${l.descricao}</div><div class="transaction-meta">Vence em: ${new Date(l.data_vencimento + 'T03:00:00Z').toLocaleDateString('pt-BR')}</div></div><div class="transaction-amount ${corValor}">${formatarMoeda(l.valor)}</div><div class="bill-actions"><button class="btn" style="width:auto; font-size: 0.8rem; padding: 0.25rem 0.5rem;" onclick="window.app.openPayBillModal(${l.id})">${l.tipo === 'a_pagar' ? 'Pagar' : 'Receber'}</button><button class="btn-icon" title="Editar Lançamento" onclick="window.app.openBillModal(${l.id})"><i class="fas fa-pencil-alt"></i></button><button class="btn-icon" title="Deletar Lançamento" onclick="window.app.deletarLancamentoFuturo(${l.id})"><i class="fas fa-trash-alt"></i></button></div></div>`;
            }).join('');
            
            const isOpen = monthKey === getSelectedMonth() ? 'open' : '';
            const clickHandler = `this.parentElement.classList.toggle('open'); const content = this.nextElementSibling; content.style.maxHeight = this.parentElement.classList.contains('open') ? content.scrollHeight + 'px' : null;`;
            
            accordionHTML += `<div class="monthly-group ${isOpen}">
                                <div class="monthly-header" onclick="${clickHandler}">
                                    <h3>${monthName}</h3>
                                    ${summaryHTML}
                                    <i class="fas fa-chevron-down chevron-icon"></i>
                                </div>
                                <div class="monthly-content">${contentHTML}</div>
                              </div>`;
        }
        
        container.innerHTML = accordionHTML;

        const openGroupContent = container.querySelector('.monthly-group.open .monthly-content');
        if (openGroupContent) {
            openGroupContent.style.maxHeight = openGroupContent.scrollHeight + "px";
        }

        if (mesesVisiveis < todosOsMeses.length) {
            const loadMoreButton = document.createElement('button');
            loadMoreButton.textContent = 'Carregar Mais Meses';
            loadMoreButton.className = 'btn btn-secondary';
            loadMoreButton.style.marginTop = '1.5rem';
            loadMoreButton.onclick = () => {
                mesesVisiveis += 3;
                renderLancamentosFuturos();
            };
            container.appendChild(loadMoreButton);
        }
    };

    const aplicarFiltrosHistorico = () => {
        renderHistoricoTransacoes();
    };

    // FUNÇÃO ATUALIZADA - Lógica de renderização corrigida para não criar cabeçalhos de data vazios
    const renderHistoricoTransacoes = () => {
        const container = document.getElementById('tab-history');
        const filtroConta = document.getElementById('filtroConta')?.value;
        const filtroCategoria = document.getElementById('filtroCategoria')?.value;
        const filtroDataInicio = document.getElementById('filtroDataInicio')?.value;
        const filtroDataFim = document.getElementById('filtroDataFim')?.value;
        const filtroDescricao = document.getElementById('filtroDescricao')?.value.toLowerCase() || '';

        const contasOptions = contasCache.map(c => `<option value="${c.id}" ${filtroConta == c.id ? 'selected' : ''}>${c.nome}</option>`).join('');
        
        const transacoesVirtuais = gerarTransacoesVirtuaisDeParcelas();
        const transacoesCompletas = [...transacoesCache, ...transacoesVirtuais]
            .sort((a, b) => new Date(b.data) - new Date(a.data));

        const uniqueCategories = [...new Set(transacoesCompletas.map(t => t.categoria).filter(Boolean))].sort();
        const categoriasOptions = uniqueCategories.map(c => `<option value="${c}" ${filtroCategoria == c ? 'selected' : ''}>${c}</option>`).join('');
        
        const filtersHTML = `<div class="filters-container"><div class="form-group"><label>Buscar Descrição</label><input type="search" id="filtroDescricao" oninput="window.app.aplicarFiltrosHistorico()" value="${filtroDescricao}"></div><div class="form-group"><label>Conta</label><select id="filtroConta" onchange="window.app.aplicarFiltrosHistorico()"><option value="">Todas</option>${contasOptions}</select></div><div class="form-group"><label>Categoria</label><select id="filtroCategoria" onchange="window.app.aplicarFiltrosHistorico()"><option value="">Todas</option>${categoriasOptions}</select></div><div class="form-group"><label>De:</label><input type="date" id="filtroDataInicio" onchange="window.app.aplicarFiltrosHistorico()" value="${filtroDataInicio || ''}"></div><div class="form-group"><label>Até:</label><input type="date" id="filtroDataFim" onchange="window.app.aplicarFiltrosHistorico()" value="${filtroDataFim || ''}"></div></div>`;

        let transacoesFiltradas = transacoesCompletas;
        if (filtroConta) transacoesFiltradas = transacoesFiltradas.filter(t => t.conta_id == filtroConta);
        if (filtroCategoria) transacoesFiltradas = transacoesFiltradas.filter(t => t.categoria === filtroCategoria);
        if (filtroDataInicio) transacoesFiltradas = transacoesFiltradas.filter(t => t.data >= filtroDataInicio);
        if (filtroDataFim) transacoesFiltradas = transacoesFiltradas.filter(t => t.data <= filtroDataFim);
        if (filtroDescricao) {
            const comprasParceladasFiltradas = comprasParceladasCache
                .filter(c => c.descricao.toLowerCase().includes(filtroDescricao))
                .map(c => c.id);

            transacoesFiltradas = transacoesFiltradas.filter(t => 
                t.descricao.toLowerCase().includes(filtroDescricao) || 
                (t.isVirtual && comprasParceladasFiltradas.includes(t.compraParceladaId))
            );
        }
        
        const totalReceitasFiltradas = transacoesFiltradas.filter(t => t.tipo === 'receita').reduce((acc, t) => acc + t.valor, 0);
        const totalDespesasFiltradas = transacoesFiltradas.filter(t => t.tipo === 'despesa').reduce((acc, t) => acc + t.valor, 0);
        const saldoFiltrado = totalReceitasFiltradas - totalDespesasFiltradas;
        const corSaldo = saldoFiltrado >= 0 ? 'income-text' : 'expense-text';

        let summaryHTML = '';
        if (transacoesFiltradas.length > 0) {
            summaryHTML = `
                <div class="filtered-summary">
                    <span>Receitas: <strong class="income-text">${formatarMoeda(totalReceitasFiltradas)}</strong></span>
                    <span>Despesas: <strong class="expense-text">${formatarMoeda(totalDespesasFiltradas)}</strong></span>
                    <span>Saldo: <strong class="${corSaldo}">${formatarMoeda(saldoFiltrado)}</strong></span>
                </div>`;
        }

        let listHTML = '';
        if (transacoesFiltradas.length === 0) {
            listHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 2rem 0;">Nenhuma transação encontrada.</p>';
        } else {
            let diaAtual = null;
            const comprasProcessadas = new Set();

            for(const t of transacoesFiltradas) {
                let itemHTML = '';
                let itemDate = t.data;
                let deveRenderizar = false;

                if (t.isVirtual) {
                    if (!comprasProcessadas.has(t.compraParceladaId)) {
                        deveRenderizar = true;
                        comprasProcessadas.add(t.compraParceladaId);
                        
                        const compraMae = comprasParceladasCache.find(c => c.id === t.compraParceladaId);
                        const todasAsParcelasVirtuais = transacoesCompletas.filter(item => item.isVirtual && item.compraParceladaId === t.compraParceladaId);
                        const conta = contasCache.find(c => c.id === compraMae.conta_id);
                        const categoriaInfo = CATEGORY_ICONS[compraMae.categoria] || CATEGORY_ICONS['Outros'];

                        const parcelasHTML = todasAsParcelasVirtuais.map(parcela => {
                            return `<div class="transaction-card" style="padding-left: 2.5rem; border-top: 1px solid var(--border-color);">
                                        <div class="transaction-details" style="gap: 1rem;">
                                            <span style="font-size: 0.8rem; color: var(--text-secondary);">${new Date(parcela.data + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                                            <div class="transaction-description">${parcela.descricao}</div>
                                        </div>
                                        <div class="transaction-amount expense-text">${formatarMoeda(parcela.valor)}</div>
                                    </div>`;
                        }).join('');

                        const clickHandler = `this.parentElement.classList.toggle('open'); const content = this.nextElementSibling; content.style.maxHeight = this.parentElement.classList.contains('open') ? content.scrollHeight + 'px' : null;`;

                        itemHTML = `
                        <div class="monthly-group" style="margin-bottom: 0; border-radius: 0; border-left: none; border-right: none; border-top: none;">
                            <div class="monthly-header transaction-card" onclick="${clickHandler}" style="padding: 1rem 0; margin:0; background: none; border-bottom: none;">
                                <div class="transaction-icon" style="background-color: ${categoriaInfo.color};"><i class="${categoriaInfo.icon}"></i></div>
                                <div class="transaction-details">
                                    <div class="transaction-description">${compraMae.descricao}</div>
                                    <div class="transaction-meta">${conta?.nome || 'N/A'} • ${compraMae.categoria}</div>
                                </div>
                                <div class="transaction-amount">
                                    ${compraMae.numero_parcelas}x ${formatarMoeda(compraMae.valor_total / compraMae.numero_parcelas)}
                                </div>
                                <div class="transaction-actions">
                                    <button class="btn-icon" title="Editar Compra Parcelada" onclick="event.stopPropagation(); window.app.openEditInstallmentModal(${compraMae.id})"><i class="fas fa-pencil-alt"></i></button>
                                    <button class="btn-icon" title="Deletar Compra Parcelada Completa" onclick="event.stopPropagation(); window.app.deletarCompraParcelada(${compraMae.id})"><i class="fas fa-trash-alt"></i></button>
                                </div>
                                 <i class="fas fa-chevron-down chevron-icon"></i>
                            </div>
                            <div class="monthly-content">${parcelasHTML}</div>
                        </div>`;
                    }
                } else {
                    deveRenderizar = true;
                    itemHTML = renderTransactionCard(t);
                }

                if (deveRenderizar) {
                    if (itemDate !== diaAtual) {
                        diaAtual = itemDate;
                        const dataFormatada = new Date(diaAtual + 'T03:00:00Z').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
                        listHTML += `<div class="date-header">${dataFormatada}</div>`;
                    }
                    listHTML += itemHTML;
                }
            }
        }
        
        container.innerHTML = filtersHTML + summaryHTML + `<div class="transaction-list-container">${listHTML}</div>`;
    };

    const renderTransactionCard = (t) => {
        const conta = contasCache.find(c => c.id === t.conta_id);
        const categoriaInfo = CATEGORY_ICONS[t.categoria] || CATEGORY_ICONS['Outros'];
        const valorSinal = t.tipo === 'receita' ? '+' : '-';
        const actionsHTML = `<div class="transaction-actions">
                                <button class="btn-icon" title="Editar Transação" onclick="window.app.openTransactionModal(${t.id})"><i class="fas fa-pencil-alt"></i></button>
                                <button class="btn-icon" title="Deletar Transação" onclick="window.app.deletarTransacao(${t.id})"><i class="fas fa-trash-alt"></i></button>
                            </div>`;
        return `<div class="transaction-card">
                    <div class="transaction-icon" style="background-color: ${categoriaInfo.color};"><i class="${categoriaInfo.icon}"></i></div>
                    <div class="transaction-details">
                        <div class="transaction-description">${t.descricao}</div>
                        <div class="transaction-meta">${conta?.nome || 'N/A'} • ${t.categoria || ''}</div>
                    </div>
                    <div class="transaction-amount ${t.tipo === 'receita' ? 'income-text' : 'expense-text'}">${valorSinal} ${formatarMoeda(t.valor)}</div>
                    ${actionsHTML}
                </div>`;
    };

    const renderFormTransacaoRapida = () => {
        const form = document.getElementById('form-transacao-rapida');
        if (contasCache.length === 0) {
            form.innerHTML = `<p class="text-secondary" style="text-align:center;">Crie uma conta para poder adicionar transações.</p>`;
            return;
        }
        const contasOptions = contasCache.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
        const categoriasOptions = CATEGORIAS_PADRAO.map(c => `<option>${c}</option>`).join('');
        form.innerHTML = `<div class="form-group"><label>Descrição</label><input type="text" id="t_descricao_main" required></div><div class="form-group"><label>Valor</label><input type="number" id="t_valor_main" step="0.01" required></div><div class="form-group"><label>Conta</label><select id="t_conta_id_main" required>${contasOptions}</select></div><div class="form-group"><label>Categoria</label><select id="t_categoria_main" required>${categoriasOptions}</select></div><div class="form-group"><label>Data</label><input type="date" id="t_data_main" value="${toISODateString(HOJE)}" required></div><div class="form-group"><label>Tipo</label><select id="t_tipo_main"><option value="despesa">Despesa</option><option value="receita">Receita</option></select></div><button type="submit" class="btn">Adicionar</button>`;
    };
    
    // --- LÓGICA DE AÇÕES ---
    
    // O restante das funções permanece o mesmo
    const openAccountModal = (id = null) => {
        const isEditing = id !== null;
        const conta = isEditing ? contasCache.find(c => c.id == id) : {};
        const isBalanceEditable = true;
        const balanceDisabledAttr = isBalanceEditable ? '' : 'disabled';
        
        const content = `<div class="card-header"><div class="card-header-title"><h2>${isEditing ? 'Editar' : 'Nova'} Conta</h2></div></div><form id="formConta"><input type="hidden" id="c_id" value="${conta.id || ''}"><div class="form-group"><label>Nome da Conta</label><input id="c_nome" type="text" value="${conta.nome || ''}" required></div><div class="form-group"><label>Tipo de Conta</label><select id="c_tipo"></select></div><div class="form-group"><label>Saldo Inicial</label><input id="c_saldo_inicial" type="number" step="0.01" value="${conta.saldo_inicial || 0}" ${balanceDisabledAttr}></div><div id="creditCardFields" style="display:none;"><div class="form-group"><label>Limite do Cartão</label><input id="c_limite" type="number" step="0.01" value="${conta.limite_cartao || ''}"></div><div class="form-group"><label>Dia do Fechamento</label><input id="c_fechamento" type="number" min="1" max="31" value="${conta.dia_fechamento_cartao || ''}"></div><div class="form-group"><label>Dia do Vencimento</label><input id="c_vencimento" type="number" min="1" max="31" value="${conta.dia_vencimento_cartao || ''}"></div></div><div class="form-actions"><button type="button" class="btn btn-secondary" onclick="window.app.closeModal()">Cancelar</button><button type="submit" class="btn">${isEditing ? 'Salvar Alterações' : 'Criar Conta'}</button></div></form>`;
        
        openModal(content);
        const tipoSelect = document.getElementById('c_tipo');
        ['Conta Corrente', 'Poupança', 'Cartão de Crédito', 'Dinheiro', 'Investimentos'].forEach(opt => tipoSelect.add(new Option(opt, opt)));
        tipoSelect.value = conta.tipo || 'Conta Corrente';
        const toggleFields = () => { document.getElementById('creditCardFields').style.display = tipoSelect.value === 'Cartão de Crédito' ? 'block' : 'none'; };
        tipoSelect.onchange = toggleFields;
        toggleFields();
        document.getElementById('formConta').addEventListener('submit', salvarConta);
    };

    const salvarConta = async (e) => {
        e.preventDefault();
        const form = e.target;
        const submitButton = form.querySelector('button[type="submit"]');
        const originalText = submitButton.textContent;
        setLoadingState(submitButton, true, 'Salvando...');
        try {
            const id = document.getElementById('c_id').value;
            const dadosConta = {
                nome: document.getElementById('c_nome').value,
                tipo: document.getElementById('c_tipo').value,
                saldo_inicial: parseFloat(document.getElementById('c_saldo_inicial').value || 0),
                limite_cartao: document.getElementById('c_limite').value ? parseFloat(document.getElementById('c_limite').value) : null,
                dia_fechamento_cartao: document.getElementById('c_fechamento').value ? parseInt(document.getElementById('c_fechamento').value) : null,
                dia_vencimento_cartao: document.getElementById('c_vencimento').value ? parseInt(document.getElementById('c_vencimento').value) : null,
            };
            if (id) {
                await clienteSupabase.from('contas').update(dadosConta).eq('id', id);
            } else {
                await clienteSupabase.from('contas').insert(dadosConta);
            }
            await carregarDadosIniciais();
            closeModal();
            showToast(`Conta ${id ? 'atualizada' : 'criada'} com sucesso!`);
            renderAllComponents();
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            setLoadingState(submitButton, false, originalText);
        }
    };
    
    const deletarConta = async (id) => {
        if (confirm('ATENÇÃO: Deletar esta conta também irá deletar TODAS as suas transações e lançamentos futuros associados. Deseja continuar?')) {
            const { error } = await clienteSupabase.from('contas').delete().eq('id', id);
            if (error) {
                showToast(error.message, 'error');
            } else {
                await carregarDadosIniciais();
                showToast('Conta deletada com sucesso!');
                renderAllComponents();
            }
        }
    };

    const openBillModal = (id = null) => {
        const isEditing = id !== null;
        const bill = isEditing ? lancamentosFuturosCache.find(l => l.id == id) : {};
        const content = `<div class="card-header"><div class="card-header-title"><h2>${isEditing ? 'Editar' : 'Novo'} Lançamento</h2></div></div><form id="formBill"><input type="hidden" id="b_id" value="${bill.id || ''}"><div class="form-group"><label>Descrição</label><input id="b_descricao" type="text" value="${bill.descricao || ''}" required></div><div class="form-group"><label>Valor</label><input type="number" step="0.01" value="${bill.valor || ''}" required></div><div class="form-group"><label>Data de Vencimento</label><input id="b_vencimento" type="date" value="${bill.data_vencimento || toISODateString(new Date())}" required></div><div class="form-group"><label>Categoria</label><select id="b_categoria">${CATEGORIAS_PADRAO.map(c => `<option value="${c}" ${bill.categoria === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div><div class="form-group"><label>Tipo</label><select id="b_tipo"><option value="a_pagar" ${bill.tipo === 'a_pagar' ? 'selected' : ''}>Conta a Pagar</option><option value="a_receber" ${bill.tipo === 'a_receber' ? 'selected' : ''}>Conta a Receber</option></select></div><div class="form-actions"><button type="button" class="btn btn-secondary" onclick="window.app.closeModal()">Cancelar</button><button type="submit" class="btn">${isEditing ? 'Salvar' : 'Adicionar'}</button></div></form>`;
        openModal(content);
        document.getElementById('formBill').addEventListener('submit', salvarLancamentoFuturo);
    };

    const salvarLancamentoFuturo = async (e) => {
        e.preventDefault();
        const form = e.target;
        const submitButton = form.querySelector('button[type="submit"]');
        const originalText = submitButton.textContent;
        setLoadingState(submitButton, true, "Salvando...");
        try {
            const id = form.querySelector('#b_id').value;
            const dados = {
                descricao: form.querySelector('#b_descricao').value,
                valor: parseFloat(form.querySelector('#b_valor').value),
                data_vencimento: form.querySelector('#b_vencimento').value,
                tipo: form.querySelector('#b_tipo').value,
                categoria: form.querySelector('#b_categoria').value,
                status: 'pendente'
            };
            if(id) {
                await clienteSupabase.from('lancamentos_futuros').update(dados).eq('id', id);
            } else {
                await clienteSupabase.from('lancamentos_futuros').insert(dados);
            }
            await carregarDadosIniciais();
            closeModal();
            showToast(`Lançamento ${id ? 'atualizado' : 'salvo'}!`);
            renderLancamentosFuturos();
        } catch(error) {
            showToast(error.message, 'error');
        } finally {
            setLoadingState(submitButton, false, originalText);
        }
    };

    const deletarLancamentoFuturo = async (id) => {
        if (confirm('Deseja realmente deletar este lançamento futuro?')) {
            const { error } = await clienteSupabase.from('lancamentos_futuros').delete().eq('id', id);
            if (error) {
                showToast(error.message, 'error');
            } else {
                await carregarDadosIniciais();
                showToast('Lançamento deletado!');
                renderLancamentosFuturos();
            }
        }
    };
    
    const openPayBillModal = (billId) => {
        const bill = lancamentosFuturosCache.find(b => b.id === billId);
        const contasOptions = contasCache.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
        const title = bill.tipo === 'a_pagar' ? 'Pagar Conta' : 'Confirmar Recebimento';
        const content = `<div class="card-header"><div class="card-header-title"><h2>${title}</h2></div></div><p><strong>Descrição:</strong> ${bill.descricao}</p><p><strong>Valor:</strong> ${formatarMoeda(bill.valor)}</p><form id="formPagarConta"><input type="hidden" id="pay_bill_id" value="${bill.id}"><div class="form-group"><label>Confirmar com a conta:</label><select id="pc_conta_id">${contasOptions}</select></div><div class="form-group"><label>Data da Confirmação:</label><input type="date" id="pc_data" value="${toISODateString(HOJE)}" required></div><div class="form-actions"><button type="button" class="btn btn-secondary" onclick="window.app.closeModal()">Cancelar</button><button type="submit" class="btn">Confirmar</button></div></form>`;
        openModal(content);
        document.getElementById('formPagarConta').addEventListener('submit', confirmarPagamento);
    };

    const confirmarPagamento = async (e) => {
        e.preventDefault();
        const form = e.target;
        const submitButton = form.querySelector('button[type="submit"]');
        const originalText = submitButton.textContent;
        setLoadingState(submitButton, true, 'Confirmando...');
    
        try {
            const billId = form.querySelector('#pay_bill_id').value;
            const bill = lancamentosFuturosCache.find(b => b.id == billId);
            const contaId = form.querySelector('#pc_conta_id').value;
            const dataPagamento = form.querySelector('#pc_data').value;
            
            const isInstallmentPayment = !!bill.compra_parcelada_id;
            
            const novaTransacao = {
                descricao: isInstallmentPayment ? `Pagamento Fatura: ${bill.descricao}` : bill.descricao,
                valor: bill.valor,
                data: dataPagamento,
                tipo: bill.tipo === 'a_pagar' ? 'despesa' : 'receita',
                categoria: isInstallmentPayment ? 'Pagamento de Fatura' : bill.categoria,
                conta_id: contaId,
                lancamento_futuro_id: bill.id
            };
            
            await clienteSupabase.from('transacoes').insert(novaTransacao);
            await clienteSupabase.from('lancamentos_futuros').update({ status: 'pago' }).eq('id', bill.id);
    
            await carregarDadosIniciais();
            
            closeModal();
            showToast('Operação confirmada com sucesso!');
            renderAllComponents();
    
        } catch(error) {
            showToast('Erro ao processar operação: ' + error.message, 'error');
        } finally {
            setLoadingState(submitButton, false, originalText);
        }
    };
    
    const salvarTransacao = async (e) => {
        e.preventDefault();
        const form = e.target;
        const submitButton = form.querySelector('button[type="submit"]');
        const originalButtonText = submitButton.textContent;
        const isEditing = !!form.querySelector('#t_id')?.value;
        setLoadingState(submitButton, true, isEditing ? 'Salvando...' : 'Adicionando...');
        
        try {
            const id = form.querySelector('#t_id')?.value;
            const isMainForm = form.id === 'form-transacao-rapida';
            const prefix = isMainForm ? '_main' : '';

            const dadosTransacao = {
                descricao: form.querySelector(`#t_descricao${prefix}`).value,
                valor: parseFloat(form.querySelector(`#t_valor${prefix}`).value),
                data: form.querySelector(`#t_data${prefix}`).value,
                tipo: form.querySelector(`#t_tipo${prefix}`).value,
                conta_id: parseInt(form.querySelector(`#t_conta_id${prefix}`).value),
                categoria: form.querySelector(`#t_categoria${prefix}`).value
            };
            
            if (isEditing) {
                await clienteSupabase.from('transacoes').update(dadosTransacao).eq('id', id);
            } else {
                if (!dadosTransacao.conta_id) throw new Error("Nenhuma conta selecionada.");
                await clienteSupabase.from('transacoes').insert(dadosTransacao);
                form.reset();
                form.querySelector(`#t_data${prefix}`).value = toISODateString(HOJE);
            }

            await carregarDadosIniciais();
            if(isEditing) closeModal();
            showToast(`Transação ${isEditing ? 'atualizada' : 'adicionada'} com sucesso!`);
            renderAllComponents();

        } catch (error) {
            console.error("Erro ao salvar transação:", error);
            showToast(error.message, 'error');
        } finally {
            setLoadingState(submitButton, false, originalButtonText);
        }
    };

    const openTransactionModal = (id) => {
        const t = transacoesCache.find(item => item.id === id);
        const contasOptions = contasCache.map(c => `<option value="${c.id}" ${t.conta_id === c.id ? 'selected' : ''}>${c.nome}</option>`).join('');
        const categoriasOptions = CATEGORIAS_PADRAO.map(c => `<option ${t.categoria === c ? 'selected' : ''}>${c}</option>`).join('');
        const content = `<div class="card-header"><div class="card-header-title"><h2>Editar Transação</h2></div></div><form id="formEditTransacao"><input type="hidden" id="t_id" value="${t.id}"><div class="form-group"><label>Descrição</label><input type="text" id="t_descricao" value="${t.descricao}" required></div><div class="form-group"><label>Valor</label><input type="number" id="t_valor" step="0.01" value="${t.valor}" required></div><div class="form-group"><label>Conta</label><select id="t_conta_id">${contasOptions}</select></div><div class="form-group"><label>Categoria</label><select id="t_categoria">${categoriasOptions}</select></div><div class="form-group"><label>Data</label><input type="date" id="t_data" value="${t.data}" required></div><div class="form-group"><label>Tipo</label><select id="t_tipo"><option value="despesa" ${t.tipo==='despesa'?'selected':''}>Despesa</option><option value="receita" ${t.tipo==='receita'?'selected':''}>Receita</option></select></div><div class="form-actions"><button type="button" class="btn btn-secondary" onclick="window.app.closeModal()">Cancelar</button><button type="submit" class="btn">Salvar Alterações</button></div></form>`;
        openModal(content);
        document.getElementById('formEditTransacao').addEventListener('submit', salvarTransacao);
    };

    const deletarTransacao = async (id) => {
        if (confirm('Tem certeza que deseja deletar esta transação?')) {
            const { error } = await clienteSupabase.from('transacoes').delete().eq('id', id);
            if (error) {
                showToast(error.message, 'error');
            } else {
                await carregarDadosIniciais();
                showToast('Transação deletada com sucesso!');
                renderAllComponents();
            }
        }
    };
    
    const deletarCompraParcelada = async (compraId) => {
        if (!compraId || typeof compraId !== 'number' || compraId <= 0) {
            console.error("ERRO CRÍTICO: ID da compra é inválido! Abortando exclusão.", compraId);
            showToast("Erro: ID da compra inválido. A exclusão foi abortada para sua segurança.", "error");
            return; 
        }

        const compra = comprasParceladasCache.find(c => c.id === compraId);
        if (!compra) {
            showToast('Compra parcelada não encontrada.', 'error');
            return;
        }

        if (confirm(`Deseja realmente deletar a compra '${compra.descricao}' e todas as suas parcelas?`)) {
            try {
                const { error: errorLancamentos } = await clienteSupabase.from('lancamentos_futuros').delete().eq('compra_parcelada_id', compraId);
                if (errorLancamentos) throw errorLancamentos;

                const { error: errorCompra } = await clienteSupabase.from('compras_parceladas').delete().eq('id', compraId);
                if (errorCompra) throw errorCompra;

                await carregarDadosIniciais();
                showToast('Compra parcelada deletada com sucesso!');
                renderAllComponents();

            } catch (error) {
                showToast(`Erro ao deletar compra: ${error.message}`, 'error');
            }
        }
    };

    const openEditInstallmentModal = (compraId) => {
        const compra = comprasParceladasCache.find(c => c.id === compraId);
        if (!compra) {
            showToast('Compra não encontrada para edição.', 'error');
            return;
        }

        const cartaoVinculado = contasCache.find(c => c.id === compra.conta_id);

        const content = `
            <div class="card-header"><div class="card-header-title"><h2>Editar Compra Parcelada</h2></div></div>
            <form id="formEditCompraParcelada">
                <input type="hidden" id="ecp_id" value="${compra.id}">
                <div class="form-group">
                    <label>Cartão de Crédito</label>
                    <input type="text" value="${cartaoVinculado ? cartaoVinculado.nome : 'N/A'}" disabled>
                </div>
                <div class="form-group">
                    <label for="ecp_descricao">Descrição</label>
                    <input type="text" id="ecp_descricao" value="${compra.descricao}" required>
                </div>
                <div class="form-group">
                    <label for="ecp_valor_total">Valor Total da Compra</label>
                    <input type="number" id="ecp_valor_total" step="0.01" min="0.01" value="${compra.valor_total}" required>
                </div>
                <div class="form-group">
                    <label for="ecp_num_parcelas">Número de Parcelas</label>
                    <input type="number" id="ecp_num_parcelas" step="1" min="1" value="${compra.numero_parcelas}" required>
                </div>
                <div class="form-group">
                    <label for="ecp_data_compra">Data da Compra</label>
                    <input type="date" id="ecp_data_compra" value="${compra.data_compra}" required>
                </div>
                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="window.app.closeModal()">Cancelar</button>
                    <button type="submit" class="btn">Salvar Alterações</button>
                </div>
            </form>`;
        openModal(content);
        document.getElementById('formEditCompraParcelada').addEventListener('submit', salvarEdicaoCompraParcelada);
    };

    const salvarEdicaoCompraParcelada = async (e) => {
        e.preventDefault();
        const form = e.target;
        const submitButton = form.querySelector('button[type="submit"]');
        const originalButtonText = submitButton.textContent;
        setLoadingState(submitButton, true, "Salvando...");

        try {
            const compraId = parseInt(form.querySelector('#ecp_id').value);
            const dadosAtualizados = {
                descricao: form.querySelector('#ecp_descricao').value,
                valor_total: parseFloat(form.querySelector('#ecp_valor_total').value),
                numero_parcelas: parseInt(form.querySelector('#ecp_num_parcelas').value),
                data_compra: form.querySelector('#ecp_data_compra').value,
            };

            const compraOriginal = comprasParceladasCache.find(c => c.id === compraId);
            const cartaoSelecionado = contasCache.find(c => c.id === compraOriginal.conta_id);

            const { error: deleteError } = await clienteSupabase.from('lancamentos_futuros').delete()
                .eq('compra_parcelada_id', compraId)
                .eq('status', 'pendente');
            if (deleteError) throw deleteError;

            const { error: updateError } = await clienteSupabase.from('compras_parceladas').update(dadosAtualizados).eq('id', compraId);
            if (updateError) throw updateError;
            
            const valorParcela = parseFloat((dadosAtualizados.valor_total / dadosAtualizados.numero_parcelas).toFixed(2));
            const dataCompra = new Date(dadosAtualizados.data_compra + 'T12:00:00');
            let lancamentos = [];
    
            for (let i = 1; i <= dadosAtualizados.numero_parcelas; i++) {
                let dataVencimento = new Date(dataCompra.getFullYear(), dataCompra.getMonth() + i, cartaoSelecionado.dia_vencimento_cartao);
                lancamentos.push({
                    descricao: `${dadosAtualizados.descricao} (${i}/${dadosAtualizados.numero_parcelas})`,
                    valor: valorParcela,
                    data_vencimento: toISODateString(dataVencimento),
                    tipo: 'a_pagar',
                    status: 'pendente',
                    categoria: compraOriginal.categoria,
                    compra_parcelada_id: compraId
                });
            }

            if(lancamentos.length > 0) {
                const { error: insertError } = await clienteSupabase.from('lancamentos_futuros').insert(lancamentos);
                if (insertError) throw insertError;
            }

            await carregarDadosIniciais();
            closeModal();
            showToast('Compra parcelada atualizada com sucesso!');
            renderAllComponents();

        } catch (error) {
            console.error("Erro ao editar compra parcelada:", error);
            showToast(`Erro ao editar: ${error.message}`, 'error');
            await carregarDadosIniciais();
            renderAllComponents();
        } finally {
            setLoadingState(submitButton, false, originalButtonText);
        }
    };
    
    const openInstallmentPurchaseModal = () => {
        const cartoesDeCredito = contasCache.filter(c => c.tipo === 'Cartão de Crédito');
        if (cartoesDeCredito.length === 0) {
            showToast('Você precisa cadastrar um Cartão de Crédito primeiro.', 'error');
            return;
        }
        const cartoesOptions = cartoesDeCredito.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
        const categoriasOptions = CATEGORIAS_PADRAO.filter(c => c !== 'Salário' && c !== 'Pagamento de Fatura').map(c => `<option value="${c}" ${c === 'Compras' ? 'selected' : ''}>${c}</option>`).join('');
        const content = `<div class="card-header"><div class="card-header-title"><h2>Registrar Compra Parcelada</h2></div></div><form id="formCompraParcelada"><div class="form-group"><label for="cp_descricao">Descrição</label><input type="text" id="cp_descricao" required></div><div class="form-group"><label for="cp_valor_total">Valor Total da Compra</label><input type="number" id="cp_valor_total" step="0.01" min="0.01" required></div><div class="form-group"><label for="cp_num_parcelas">Número de Parcelas</label><input type="number" id="cp_num_parcelas" step="1" min="1" value="1" required></div><div class="form-group"><label for="cp_data_compra">Data da Compra</label><input type="date" id="cp_data_compra" value="${toISODateString(new Date())}" required></div><div class="form-group"><label for="cp_conta_id">Cartão de Crédito</label><select id="cp_conta_id" required>${cartoesOptions}</select></div><div class="form-group"><label for="cp_categoria">Categoria</label><select id="cp_categoria" required>${categoriasOptions}</select></div><div class="form-actions"><button type="button" class="btn btn-secondary" onclick="window.app.closeModal()">Cancelar</button><button type="submit" class="btn">Salvar Compra</button></div></form>`;
        openModal(content);
        document.getElementById('formCompraParcelada').addEventListener('submit', salvarCompraParcelada);
    };

    const salvarCompraParcelada = async (e) => {
        e.preventDefault();
        const form = e.target;
        const submitButton = form.querySelector('button[type="submit"]');
        const originalButtonText = submitButton.textContent;
        setLoadingState(submitButton, true, "Salvando...");
        try {
            const descricao = document.getElementById('cp_descricao').value;
            const valorTotal = parseFloat(document.getElementById('cp_valor_total').value);
            const numParcelas = parseInt(document.getElementById('cp_num_parcelas').value);
            const dataCompraStr = document.getElementById('cp_data_compra').value;
            const contaId = parseInt(document.getElementById('cp_conta_id').value);
            const categoria = document.getElementById('cp_categoria').value;
            const cartaoSelecionado = contasCache.find(c => c.id === contaId);
    
            if (!cartaoSelecionado || !cartaoSelecionado.dia_vencimento_cartao) {
                throw new Error('O cartão de crédito selecionado não possui um dia de vencimento configurado.');
            }
    
            const { data: compraMae, error: erroCompra } = await clienteSupabase
                .from('compras_parceladas')
                .insert({
                    descricao,
                    valor_total: valorTotal,
                    numero_parcelas: numParcelas,
                    conta_id: contaId,
                    categoria,
                    data_compra: dataCompraStr
                })
                .select()
                .single();
            
            if (erroCompra) throw erroCompra;
    
            const valorParcela = parseFloat((valorTotal / numParcelas).toFixed(2));
            const dataCompra = new Date(dataCompraStr + 'T12:00:00');
            let lancamentos = [];
    
            for (let i = 1; i <= numParcelas; i++) {
                let dataVencimento = new Date(dataCompra.getFullYear(), dataCompra.getMonth() + i, cartaoSelecionado.dia_vencimento_cartao);
                lancamentos.push({
                    descricao: `${descricao} (${i}/${numParcelas})`,
                    valor: valorParcela,
                    data_vencimento: toISODateString(dataVencimento),
                    tipo: 'a_pagar',
                    status: 'pendente',
                    categoria,
                    compra_parcelada_id: compraMae.id
                });
            }
    
            const { error: erroLancamentos } = await clienteSupabase.from('lancamentos_futuros').insert(lancamentos);
            
            if (erroLancamentos) {
                await clienteSupabase.from('compras_parceladas').delete().eq('id', compraMae.id);
                throw erroLancamentos;
            }
    
            await carregarDadosIniciais();
    
            closeModal();
            showToast('Compra parcelada registrada com sucesso!');
            renderAllComponents();
    
        } catch (error) {
            console.error("Erro ao salvar compra parcelada:", error);
            showToast(error.message, 'error');
        } finally {
            setLoadingState(submitButton, false, originalButtonText);
        }
    };
    
    const openChoiceModal = () => {
        const content = `<div class="card-header"><div class="card-header-title"><h2>Extrato do Mês</h2></div></div><p>Como você gostaria de ver o extrato para o mês selecionado no resumo?</p><div class="form-actions" style="margin-top: 1.5rem; display: flex; flex-direction: column; gap: 0.75rem;"><button id="btn-choice-modal" class="btn">Ver Resumo Detalhado</button><button id="btn-choice-filter" class="btn btn-secondary">Filtrar Histórico de Transações</button></div>`;
        openModal(content);
        document.getElementById('btn-choice-modal').addEventListener('click', openStatementModal);
        document.getElementById('btn-choice-filter').addEventListener('click', filterHistoryByMonth);
    };

    const openStatementModal = () => {
        const month = getSelectedMonth();
        const transacoesDoMes = transacoesCache.filter(t => t.data && t.data.startsWith(month));
        const totalReceitas = transacoesDoMes.filter(t => t.tipo === 'receita').reduce((s, t) => s + t.valor, 0);
        const totalDespesas = transacoesDoMes.filter(t => t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0);
        const saldo = totalReceitas - totalDespesas;
        const corSaldo = saldo >= 0 ? 'income-text' : 'expense-text';
        let transactionsHTML = '<p>Nenhuma transação encontrada para este mês.</p>';
        if (transacoesDoMes.length > 0) {
            transactionsHTML = transacoesDoMes.sort((a, b) => new Date(a.data) - new Date(b.data)).map(t => {
                const conta = contasCache.find(c => c.id === t.conta_id);
                const dataFormatada = new Date(t.data + 'T03:00:00Z').toLocaleDateString('pt-BR');
                const corValor = t.tipo === 'receita' ? 'income-text' : 'expense-text';
                return `<div class="transaction-card" style="padding: 0.75rem 0;"><div class="transaction-details"><div class="transaction-description">${t.descricao}</div><div class="transaction-meta">${dataFormatada} • ${conta?.nome || ''}</div></div><div class="transaction-amount ${corValor}">${formatarMoeda(t.valor)}</div></div>`;
            }).join('');
        }
        const [ano, mesNum] = month.split('-');
        const nomeMes = new Date(ano, mesNum - 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
        const content = `<div class="card-header"><div class="card-header-title"><h2>Extrato de ${nomeMes}</h2></div></div><div class="filtered-summary"><span>Receitas: <strong class="income-text">${formatarMoeda(totalReceitas)}</strong></span><span>Despesas: <strong class="expense-text">${formatarMoeda(totalDespesas)}</strong></span><span>Saldo: <strong class="${corSaldo}">${formatarMoeda(saldo)}</strong></span></div><div style="max-height: 45vh; overflow-y: auto; padding-right: 1rem;">${transactionsHTML}</div>`;
        openModal(content);
    };

    const filterHistoryByMonth = () => {
        const monthStr = getSelectedMonth();
        const [year, month] = monthStr.split('-').map(Number);
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0);
        const tabButton = document.querySelector('.tab-button[data-tab="tab-history"]');
        switchTab(tabButton);
        const filtroInicio = document.getElementById('filtroDataInicio');
        const filtroFim = document.getElementById('filtroDataFim');
        const filtroConta = document.getElementById('filtroConta');
        const filtroCategoria = document.getElementById('filtroCategoria');
        const filtroDescricao = document.getElementById('filtroDescricao');
        if (filtroInicio) filtroInicio.value = toISODateString(startDate);
        if (filtroFim) filtroFim.value = toISODateString(endDate);
        if (filtroConta) filtroConta.value = '';
        if (filtroCategoria) filtroCategoria.value = '';
        if (filtroDescricao) filtroDescricao.value = '';
        aplicarFiltrosHistorico();
        closeModal();
        showToast(`Histórico filtrado para ${monthStr}.`, 'info');
    };

    const openBalanceAdjustmentModal = (accountId) => {
        const conta = contasCache.find(c => c.id === accountId);
        if (!conta) { showToast("Conta não encontrada.", "error"); return; }
        const transacoesDaConta = transacoesCache.filter(t => t.conta_id === conta.id);
        const saldoAtual = transacoesDaConta.reduce((acc, t) => t.tipo === 'receita' ? acc + t.valor : acc - t.valor, conta.saldo_inicial);
        const content = `<div class="card-header"><div class="card-header-title"><h2>Ajustar Saldo da Conta</h2></div></div><p style="margin-bottom: 1rem;"><strong>Conta:</strong> ${conta.nome}</p><div style="margin-bottom: 1.5rem;"><span style="font-size: 0.9rem; color: var(--text-secondary);">Saldo Atual Calculado</span><p style="font-size: 1.5rem; font-weight: 600; margin: 0;">${formatarMoeda(saldoAtual)}</p></div><form id="formAjusteSaldo"><input type="hidden" id="ajuste_conta_id" value="${accountId}"><input type="hidden" id="ajuste_saldo_atual" value="${saldoAtual}"><div class="form-group"><label for="ajuste_novo_saldo">Informe o Novo Saldo Correto</label><input type="number" step="0.01" id="ajuste_novo_saldo" value="${saldoAtual.toFixed(2)}" required></div><div class="form-actions"><button type="button" class="btn btn-secondary" onclick="window.app.closeModal()">Cancelar</button><button type="submit" class="btn">Salvar Ajuste</button></div></form>`;
        openModal(content);
        document.getElementById('formAjusteSaldo').addEventListener('submit', salvarAjusteDeSaldo);
    };

    const salvarAjusteDeSaldo = async (e) => {
        e.preventDefault();
        const form = e.target;
        const submitButton = form.querySelector('button[type="submit"]');
        const originalButtonText = submitButton.textContent;
        setLoadingState(submitButton, true, "Ajustando...");
        try {
            const accountId = parseInt(form.querySelector('#ajuste_conta_id').value);
            const saldoAtual = parseFloat(form.querySelector('#ajuste_saldo_atual').value);
            const novoSaldo = parseFloat(form.querySelector('#ajuste_novo_saldo').value);
            const diferenca = novoSaldo - saldoAtual;
            if (Math.abs(diferenca) < 0.01) {
                showToast("O novo saldo é igual ao atual. Nenhum ajuste necessário.", "info");
                closeModal();
                return;
            }
            const novaTransacao = { descricao: "Ajuste de Saldo", valor: Math.abs(diferenca), data: toISODateString(new Date()), tipo: diferenca > 0 ? 'receita' : 'despesa', categoria: 'Ajustes', conta_id: accountId, };
            await clienteSupabase.from('transacoes').insert(novaTransacao);
            await carregarDadosIniciais();
            closeModal();
            showToast("Saldo ajustado com sucesso através de uma nova transação!");
            renderAllComponents();
        } catch (error) {
            showToast(error.message, "error");
        } finally {
            setLoadingState(submitButton, false, originalButtonText);
        }
    };

    const openCreditCardStatementModal = (accountId) => {
        const conta = contasCache.find(c => c.id === accountId);
        if (!conta || conta.tipo !== 'Cartão de Crédito' || !conta.dia_fechamento_cartao || !conta.dia_vencimento_cartao) {
            showToast("Esta conta não é um cartão de crédito ou não possui dia de fechamento/vencimento configurado.", "error");
            return;
        }
    
        const transacoesReais = transacoesCache.filter(t => t.conta_id === accountId && t.tipo === 'despesa');
        const transacoesVirtuais = gerarTransacoesVirtuaisDeParcelas().filter(t => t.conta_id === accountId);
        const todasAsDespesasDoCartao = [...transacoesReais, ...transacoesVirtuais];
    
        if (todasAsDespesasDoCartao.length === 0) {
            showToast("Nenhuma despesa encontrada para este cartão.", "info");
            return;
        }
        
        const faturas = todasAsDespesasDoCartao.reduce((acc, t) => {
            const dataTransacao = new Date(t.data + 'T12:00:00');
            const diaTransacao = dataTransacao.getDate();
            
            let anoFatura = dataTransacao.getFullYear();
            let mesFatura = dataTransacao.getMonth();
    
            if (diaTransacao > conta.dia_fechamento_cartao) {
                mesFatura += 1;
            }
            
            const dataVencimento = new Date(anoFatura, mesFatura + 1, conta.dia_vencimento_cartao);
            const chaveFatura = `${dataVencimento.getFullYear()}-${(dataVencimento.getMonth() + 1).toString().padStart(2, '0')}`;
    
            if (!acc[chaveFatura]) {
                acc[chaveFatura] = {
                    transacoes: [],
                    dataVencimento: dataVencimento,
                };
            }
            acc[chaveFatura].transacoes.push(t);
            return acc;
        }, {});
        
        const chavesFaturasOrdenadas = Object.keys(faturas).sort().reverse();
        
        let tabsHTML = '';
        let contentsHTML = '';
        
        if (chavesFaturasOrdenadas.length === 0) {
            contentsHTML = '<p style="text-align:center; color: var(--text-secondary);">Nenhuma fatura para exibir.</p>';
        } else {
            chavesFaturasOrdenadas.forEach((chave, index) => {
                const fatura = faturas[chave];
                const nomeMes = fatura.dataVencimento.toLocaleString('pt-BR', { month: 'long' });
                const isActive = index === 0 ? 'active' : '';
        
                tabsHTML += `<button class="statement-tab-button ${isActive}" data-target="fatura-${chave}">${nomeMes}</button>`;
                
                const totalFatura = fatura.transacoes.reduce((sum, t) => sum + t.valor, 0);
                
                const transacoesHTML = fatura.transacoes
                    .sort((a, b) => new Date(a.data) - new Date(b.data))
                    .map(t => {
                        const dataFormatada = new Date(t.data + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
                        return `<div class="transaction-row">
                                    <span class="transaction-row-date">${dataFormatada}</span>
                                    <span class="transaction-row-desc">${t.descricao}</span>
                                    <span class="transaction-row-amount">${formatarMoeda(t.valor)}</span>
                                </div>`;
                    }).join('');
        
                contentsHTML += `<div class="statement-tab-content ${isActive}" id="fatura-${chave}">
                    <div class="invoice-summary">
                        <div>
                            <span>Total da Fatura</span>
                            <strong class="expense-text">${formatarMoeda(totalFatura)}</strong>
                        </div>
                        <div>
                            <span>Vencimento</span>
                            <strong>${fatura.dataVencimento.toLocaleDateString('pt-BR')}</strong>
                        </div>
                    </div>
                    <div class="transaction-list">${transacoesHTML}</div>
                </div>`;
            });
        }
    
        const modalContent = `
            <div class="statement-modal-header">
                <h3>${conta.nome}</h3>
                <p>Extrato de Faturas</p>
            </div>
            <div class="statement-tabs">${tabsHTML}</div>
            <div class="statement-content-wrapper">${contentsHTML}</div>
        `;
        
        openModal(modalContent);
        
        document.querySelectorAll('.statement-tab-button').forEach(button => {
            button.addEventListener('click', () => {
                document.querySelectorAll('.statement-tab-button').forEach(btn => btn.classList.remove('active'));
                document.querySelectorAll('.statement-tab-content').forEach(content => content.classList.remove('active'));
                button.classList.add('active');
                document.getElementById(button.dataset.target).classList.add('active');
            });
        });
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
            closeModal, openCreditCardStatementModal 
        };

        document.getElementById('theme-switcher').addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            applyTheme(currentTheme === 'light' ? 'dark' : 'light');
        });
        document.getElementById('tab-buttons-container').addEventListener('click', (e) => {
            if (e.target.classList.contains('tab-button')) switchTab(e.target);
        });
        document.getElementById('form-transacao-rapida').addEventListener('submit', salvarTransacao);
        
        document.getElementById('btn-add-account').addEventListener('click', () => openAccountModal());
        document.getElementById('btn-open-installment').addEventListener('click', openInstallmentPurchaseModal);
        document.getElementById('btn-open-bill').addEventListener('click', () => openBillModal());
        document.getElementById('btn-statement').addEventListener('click', openChoiceModal);
        
        applyTheme(localStorage.getItem('confin-theme') || 'light');
        await carregarDadosIniciais();
        renderAllComponents();
    };

    initializeApp();
});