// ARQUIVO: js/main.js
import * as UI from './ui.js';
import * as API from './api.js';
import * as State from './state.js';
import { applyTheme, toISODateString } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {

    // Filtros de estado global
    let historyFilters = { 
        mes: new Date().toISOString().slice(0, 7),
        pesquisa: '',
        contaId: 'todas'
    };
    let billsFilters = { 
        mes: 'todos', 
        pesquisa: '',
        contaId: 'todas'
    };

    // =========================================================================
    // === AUTENTICAÇÃO E CONTROLE DE SESSÃO ===
    // =========================================================================

    async function checkAuthAndInit() {
        try {
            const session = await API.getSession();
            if (!session) {
                // Sem sessão: Mostra Login
                UI.renderLoginScreen();
                setupLoginListener();
            } else {
                // Com sessão: Mostra App e carrega dados
                UI.toggleAppView(true);
                UI.renderLogoutButton(); 
                await initializeApp();
            }
        } catch (err) {
            console.error("Erro de autenticação:", err);
            UI.showToast("Erro ao verificar sessão.", "error");
        }
    }

    function setupLoginListener() {
        const form = document.getElementById('form-login');
        if (!form) return;

        // Remove listeners antigos para evitar duplicidade se renderizar varias vezes
        const newForm = form.cloneNode(true);
        form.parentNode.replaceChild(newForm, form);

        newForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = newForm.querySelector('button');
            const email = newForm.querySelector('input[name="email"]').value;
            const password = newForm.querySelector('input[name="password"]').value;

            UI.setLoadingState(btn, true, 'Entrando...');
            try {
                await API.login(email, password);
                UI.showToast('Login realizado com sucesso!');
                // Recarrega para limpar memória e iniciar app limpo
                window.location.reload(); 
            } catch (err) {
                console.error(err);
                UI.showToast('Falha no login. Verifique seus dados.', 'error');
                UI.setLoadingState(btn, false, 'Entrar');
            }
        });
    }

    // Listener Global de Logout
    document.body.addEventListener('click', async (e) => {
        if (e.target.id === 'btn-logout' || e.target.closest('#btn-logout')) {
            if(confirm('Deseja realmente sair?')) {
                try {
                    await API.logout();
                    window.location.reload();
                } catch(err) {
                    UI.showToast("Erro ao sair.", "error");
                }
            }
        }
    });

    // =========================================================================
    // === CARREGAMENTO DE DADOS ===
    // =========================================================================

    async function carregarDadosOtimizados() {
        try {
            // 1. Define Data de Corte: 1º de Janeiro do ano atual
            const anoAtual = new Date().getFullYear();
            const dataCorte = `${anoAtual}-01-01`;

            // 2. Carrega dados auxiliares e o resumo antigo em paralelo
            const [auxiliares, transacoesAntigas, transacoesRecentes] = await Promise.all([
                API.fetchDadosAuxiliares(),
                API.fetchResumoTransacoesAntigas(dataCorte),
                API.fetchTransacoesRecentes(dataCorte)
            ]);

            // 3. Calcula o "Saldo Acumulado" dos anos anteriores
            const saldosAcumulados = {}; 
            transacoesAntigas.forEach(t => {
                const valor = t.tipo === 'receita' ? t.valor : -t.valor;
                saldosAcumulados[t.conta_id] = (saldosAcumulados[t.conta_id] || 0) + valor;
            });

            // 4. Atualiza o saldo inicial das contas na memória
            const contasAjustadas = auxiliares.contas.map(conta => {
                const acumuladoAntigo = saldosAcumulados[conta.id] || 0;
                return {
                    ...conta,
                    saldo_inicial: conta.saldo_inicial + acumuladoAntigo
                };
            });

            // 5. Salva no Estado Global
            State.setState({
                contas: contasAjustadas.sort((a, b) => a.nome.localeCompare(b.nome)),
                lancamentosFuturos: auxiliares.lancamentosFuturos,
                comprasParceladas: auxiliares.comprasParceladas,
                transacoes: transacoesRecentes, // Apenas transações deste ano
                categorias: auxiliares.categorias,
                tiposContas: auxiliares.tiposContas
            });

            // 6. Renderiza a tela
            UI.renderAllComponents({ history: historyFilters, bills: billsFilters });
            
        } catch (error) {
            UI.showToast(`Erro ao carregar dados: ${error.message}`, 'error');
            console.error(error);
        }
    }

    // Wrapper para recarregar a tela após ações
    async function reloadStateAndRender() {
        await carregarDadosOtimizados();
    }

    // =========================================================================
    // === LÓGICA DE NEGÓCIO (TRANSAÇÕES, SÉRIES, CONTAS) ===
    // =========================================================================

    async function criarLancamentosParcelados(dadosCompra) {
        const conta = State.getContaPorId(dadosCompra.conta_id);
        const isCartao = State.isTipoCartao(conta.tipo);
        
        // Se for cartão, exige datas.
        if (isCartao && (!conta.dia_fechamento_cartao || !conta.dia_vencimento_cartao)) {
            throw new Error("Para compras no Cartão de Crédito, configure o Dia de Fechamento e Vencimento no cadastro da conta.");
        }

        const compraSalva = await API.salvarDados('compras_parceladas', dadosCompra);
        const valorParcela = parseFloat((dadosCompra.valor_total / dadosCompra.numero_parcelas).toFixed(2));
        const lancamentos = [];

        const dataCompra = new Date(dadosCompra.data_compra + 'T12:00:00');
        
        let diaVencimento = dataCompra.getDate();
        let dataBase = new Date(dataCompra);

        // Lógica específica de cartão
        if (isCartao) {
            const diaFechamento = conta.dia_fechamento_cartao;
            diaVencimento = conta.dia_vencimento_cartao;
            
            // Se comprou depois do fechamento, joga pro próximo mês
            if (dataCompra.getDate() >= diaFechamento) {
                dataBase.setMonth(dataBase.getMonth() + 1);
            }
            // Se o vencimento é menor que o fechamento, já é no mês seguinte
            if (diaVencimento < diaFechamento) {
                dataBase.setMonth(dataBase.getMonth() + 1);
            }
        } 

        for (let i = 0; i < dadosCompra.numero_parcelas; i++) {
            const dataVenc = new Date(dataBase.getFullYear(), dataBase.getMonth() + i, diaVencimento, 12);
            
            lancamentos.push({
                descricao: `${dadosCompra.descricao} (${i + 1}/${dadosCompra.numero_parcelas})`, 
                valor: valorParcela,
                data_vencimento: toISODateString(dataVenc), 
                tipo: 'a_pagar',
                status: 'pendente', 
                compra_parcelada_id: compraSalva.id, 
                categoria: dadosCompra.categoria
            });
        }
        if (lancamentos.length > 0) await API.salvarMultiplosLancamentos(lancamentos);
    }

    async function salvarConta(e) {
        const form = e.target;
        const btn = form.querySelector('button[type="submit"]');
        UI.setLoadingState(btn, true, 'Salvando...');
        try {
            const id = form.dataset.id;
            const data = Object.fromEntries(new FormData(form));
            data.saldo_inicial = parseFloat(data.saldo_inicial) || 0;
            
            // CORREÇÃO: Trata campos vazios de cartão como NULL
            const isCartao = State.isTipoCartao(data.tipo);
            
            data.dia_fechamento_cartao = (isCartao && data.dia_fechamento_cartao) 
                ? parseInt(data.dia_fechamento_cartao) 
                : null;
                
            data.dia_vencimento_cartao = (isCartao && data.dia_vencimento_cartao) 
                ? parseInt(data.dia_vencimento_cartao) 
                : null;
            
            await API.salvarDados('contas', data, id);
            UI.closeModal();
            UI.showToast('Conta salva!');
            await reloadStateAndRender();
        } catch (err) {
            UI.showToast(err.message, 'error');
            console.error(err);
        } finally {
            UI.setLoadingState(btn, false, 'Salvar');
        }
    }

    async function deletarConta(id) {
        if (!confirm('Apagar conta? As transações associadas não serão apagadas.')) return;
        try {
            await API.deletarDados('contas', id);
            UI.showToast('Conta deletada.');
            await reloadStateAndRender();
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
            
            const lancamentoOriginal = State.getState().lancamentosFuturos.find(l => l.id == form.dataset.billId);
            const tipoFinal = lancamentoOriginal && lancamentoOriginal.tipo === 'a_receber' ? 'receita' : 'despesa';

            const transacao = {
                descricao: form.dataset.desc, 
                valor: parseFloat(form.dataset.valor),
                data: data.data, 
                conta_id: parseInt(data.conta_id),
                categoria: form.dataset.cat, 
                tipo: tipoFinal,
                lancamento_futuro_id: parseInt(form.dataset.billId)
            };

            await API.salvarDados('transacoes', transacao);
            await API.salvarDados('lancamentos_futuros', { status: 'pago' }, form.dataset.billId);
            
            UI.closeModal();
            UI.showToast('Registrado com sucesso!');
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
            const tipoLancamentoFuturo = data.tipo === 'receita' ? 'a_receber' : 'a_pagar';

            if (data.tipo_compra === 'vista') {
                await API.salvarDados('transacoes', {
                    descricao: data.descricao,
                    valor: Math.abs(parseFloat(data.valor)),
                    data: data.data,
                    conta_id: parseInt(data.conta_id),
                    categoria: data.categoria,
                    tipo: data.tipo
                });
                UI.showToast('Transação salva!');

            } else if (data.tipo_compra === 'parcelada') {
                await criarLancamentosParcelados({
                    descricao: data.descricao, valor_total: parseFloat(data.valor),
                    numero_parcelas: parseInt(data.numero_parcelas), data_compra: data.data,
                    conta_id: parseInt(data.conta_id), categoria: data.categoria,
                });
                UI.showToast('Compra parcelada lançada!');

            } else if (data.tipo_compra === 'recorrente') {
                const valor = parseFloat(data.valor);
                const quantidade = parseInt(data.quantidade);
                const dataInicio = new Date(data.data + 'T12:00:00');
                const diaVencimento = parseInt(data.dia_vencimento);
                const frequencia = data.frequencia;

                // 1. Cria série PAI
                const dadosSerie = {
                    descricao: `${data.descricao} (Série)`,
                    valor_total: valor * quantidade,
                    numero_parcelas: quantidade,
                    data_compra: data.data,
                    conta_id: parseInt(data.conta_id),
                    categoria: data.categoria
                };
                
                const serieSalva = await API.salvarDados('compras_parceladas', dadosSerie);

                // 2. Gera lançamentos
                const lancamentos = [];
                for (let i = 0; i < quantidade; i++) {
                    let proximaData = new Date(dataInicio); 
                    if (frequencia === 'mensal') {
                        proximaData.setMonth(dataInicio.getMonth() + i);
                        proximaData.setDate(Math.min(diaVencimento, new Date(proximaData.getFullYear(), proximaData.getMonth() + 1, 0).getDate()));
                    } else if (frequencia === 'anual') {
                        proximaData.setFullYear(dataInicio.getFullYear() + i);
                    } else if (frequencia === 'quinzenal') {
                        proximaData.setDate(dataInicio.getDate() + (i * 15));
                    } else { 
                        proximaData.setDate(dataInicio.getDate() + i);
                    }

                    lancamentos.push({
                        descricao: `${data.descricao} (${i + 1}/${quantidade})`, 
                        valor: Math.abs(valor),
                        data_vencimento: toISODateString(proximaData), 
                        tipo: tipoLancamentoFuturo, 
                        status: 'pendente', 
                        categoria: data.categoria,
                        compra_parcelada_id: serieSalva.id
                    });
                }
                
                if (lancamentos.length > 0) await API.salvarMultiplosLancamentos(lancamentos);
                UI.showToast(`Série recorrente criada!`);
            }
            
            form.reset();
            form.querySelector('#tipo-compra')?.dispatchEvent(new Event('change'));
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
            UI.showToast(`Lançamento atualizado!`);
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
        const idSerie = form.dataset.compraAntigaId ? parseInt(form.dataset.compraAntigaId) : null;
        
        UI.setLoadingState(btn, true, 'Atualizando...');
        
        try {
            const data = Object.fromEntries(new FormData(form));
            const tipoSerie = data.tipo_serie; 
            const valorUnitario = parseFloat(data.valor_total);
            
            // 1. Atualiza dados do Pai
            await API.salvarDados('compras_parceladas', {
                descricao: data.descricao, 
                conta_id: parseInt(data.conta_id),
                categoria: data.categoria, 
                data_compra: data.data_inicio
            }, idSerie);

            // 2. Apaga FUTUROS PENDENTES
            await API.deletarLancamentosPendentesPorCompraId(idSerie);

            // 3. Verifica HISTÓRICO PAGO
            const itensPagos = State.getState().lancamentosFuturos.filter(l => 
                l.compra_parcelada_id === idSerie && l.status === 'pago'
            );
            const mesesPagos = new Set(itensPagos.map(l => l.data_vencimento.substring(0, 7)));

            // 4. Recria
            const lancamentos = [];
            const dataInicio = new Date(data.data_inicio + 'T12:00:00');
            const lancamentosAntigos = State.getState().lancamentosFuturos.filter(l => l.compra_parcelada_id === idSerie);
            const tipoOriginal = lancamentosAntigos.length > 0 ? lancamentosAntigos[0].tipo : 'a_pagar'; 

            if (tipoSerie === 'parcelada') {
                for (let i = 0; i < parseInt(data.numero_parcelas); i++) {
                     let dataVenc = new Date(dataInicio);
                     dataVenc.setMonth(dataInicio.getMonth() + i);
                     lancamentos.push({
                        descricao: `${data.descricao} (${i + 1}/${data.numero_parcelas})`,
                        valor: valorUnitario / parseInt(data.numero_parcelas),
                        data_vencimento: toISODateString(dataVenc),
                        tipo: 'a_pagar', status: 'pendente', compra_parcelada_id: idSerie, categoria: data.categoria
                    });
                }
            } else {
                const quantidade = parseInt(data.quantidade);
                const frequencia = data.frequencia;
                
                for (let i = 0; i < quantidade; i++) {
                    let proximaData = new Date(dataInicio);
                    
                    if (frequencia === 'mensal') {
                        proximaData.setMonth(dataInicio.getMonth() + i);
                        if (mesesPagos.has(toISODateString(proximaData).substring(0, 7))) continue;
                    } else if (frequencia === 'semestral') {
                        proximaData.setMonth(dataInicio.getMonth() + (i * 6));
                    } else if (frequencia === 'anual') {
                        proximaData.setFullYear(dataInicio.getFullYear() + i);
                    } else if (frequencia === 'quinzenal') {
                        proximaData.setDate(dataInicio.getDate() + (i * 15));
                    }

                    lancamentos.push({
                        descricao: `${data.descricao} (Renovado ${i + 1})`,
                        valor: valorUnitario,
                        data_vencimento: toISODateString(proximaData),
                        tipo: tipoOriginal,
                        status: 'pendente', compra_parcelada_id: idSerie, categoria: data.categoria
                    });
                }
            }

            if (lancamentos.length > 0) await API.salvarMultiplosLancamentos(lancamentos);
            UI.closeModal();
            UI.showToast('Série atualizada!');
            await reloadStateAndRender();

        } catch (err) {
            UI.showToast(err.message, 'error');
            console.error(err);
        } finally {
            UI.setLoadingState(btn, false, 'Salvar Alterações');
        }
    }
    
    async function deletarCompraParceladaCompleta(compraId) {
        if (!compraId) return;
        try {
            await API.deletarLancamentosPorCompraId(compraId);
            await API.deletarDados('compras_parceladas', compraId);
        } catch (error) {
            console.error("Erro ao deletar:", error);
            throw error;
        }
    }
    
    async function deletarLancamento(id, compraId) { 
        if (compraId) {
            if (!confirm('Esta é uma série/parcelamento.\n\n[OK] Apagar SÉRIE COMPLETA (todos os itens)\n[Cancelar] Apagar APENAS ESTE item')) {
                 try { await API.deletarDados('lancamentos_futuros', id); UI.showToast('Item removido.'); await reloadStateAndRender(); } catch(err) { UI.showToast(err.message, 'error'); }
                 return;
            }
            try { await deletarCompraParceladaCompleta(compraId); UI.showToast('Série deletada!'); await reloadStateAndRender(); } catch (err) { UI.showToast(err.message, 'error'); }
        } else {
            if (!confirm('Apagar?')) return;
            try { await API.deletarDados('lancamentos_futuros', id); UI.showToast('Deletado.'); await reloadStateAndRender(); } catch (err) { UI.showToast(err.message, 'error'); }
        }
    }

    async function deletarTransacao(id) { 
        if (!confirm('Apagar transação?')) return;
        try { await API.deletarDados('transacoes', id); UI.showToast('Deletada.'); await reloadStateAndRender(); } catch (err) { UI.showToast(err.message, 'error'); }
    }

    // =========================================================================
    // === LISTENERS E EVENTOS GLOBAIS ===
    // =========================================================================

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
            
            if (e.target.id === 'btn-manage-categories' || e.target.closest('#btn-manage-categories')) {
                UI.openModal(UI.getCategoriesModalContent());
            }
            if (e.target.id === 'link-manage-types') {
                e.preventDefault();
                UI.openModal(UI.getAccountTypesModalContent());
            }

            // Delegated Actions
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
                    document.getElementById('statement-month-select')?.addEventListener('change', (e) => UI.renderStatementDetails(parseInt(e.target.dataset.contaId), e.target.value));
                    break;
                case 'ver-extrato':
                    UI.openModal(UI.getAccountStatementModalContent(id));
                    document.getElementById('account-statement-month-select')?.addEventListener('change', (e) => UI.renderAccountStatementDetails(parseInt(e.target.dataset.contaId), e.target.value));
                    break;
                case 'pagar-conta': UI.openModal(UI.getPayBillModalContent(id)); break;
                case 'editar-lancamento': UI.openModal(UI.getBillModalContent(id)); break;
                case 'recriar-compra-parcelada':
                     const compra = State.getState().comprasParceladas.find(c => c.id === id);
                     if (compra) UI.openModal(UI.getInstallmentPurchaseModalContent(compra));
                     break;
                case 'deletar-lancamento': deletarLancamento(id, compraId); break;
                case 'editar-transacao': UI.openModal(UI.getTransactionModalContent(id)); break;
                case 'deletar-transacao': deletarTransacao(id); break;
                
                case 'deletar-categoria':
                    if(confirm('Remover esta categoria?')) {
                        API.deletarDados('categorias', id).then(() => {
                            UI.showToast('Categoria removida.');
                            reloadStateAndRender().then(() => UI.openModal(UI.getCategoriesModalContent()));
                        }).catch(err => UI.showToast(err.message, 'error'));
                    }
                    break;
                case 'editar-categoria':
                    UI.openModal(UI.getEditCategoryModalContent(id, target.dataset.nome));
                    break;
                case 'deletar-tipo-conta':
                    if(confirm('Remover este tipo?')) {
                        API.deletarDados('tipos_contas', id).then(() => {
                            UI.showToast('Tipo removido.');
                            reloadStateAndRender().then(() => UI.openModal(UI.getAccountTypesModalContent()));
                        }).catch(err => UI.showToast(err.message, 'error'));
                    }
                    break;
            }
        });

        document.body.addEventListener('change', e => {
            if (e.target.id === 'tab-statement-month-select') {
                UI.renderMonthlyStatementDetails(e.target.value);
            }
            if (e.target.id === 'conta-tipo') {
                const selectedOption = e.target.options[e.target.selectedIndex];
                const isCard = selectedOption.dataset.isCard === 'true';
                const div = document.getElementById('cartao-credito-fields');
                if (div) div.style.display = isCard ? 'block' : 'none';
            }
            if (e.target.id === 'tipo-compra') {
                const tipo = e.target.value;
                const form = e.target.closest('form');
                const parceladaFields = form.querySelector('#parcelada-fields');
                const recorrenteFields = form.querySelector('#recorrente-fields');
                const labelValor = form.querySelector('#label-valor');
                const selectConta = form.querySelector('select[name="conta_id"]');
                
                if(parceladaFields) parceladaFields.style.display = 'none';
                if(recorrenteFields) recorrenteFields.style.display = 'none';
                if (selectConta.dataset.allOptions) selectConta.innerHTML = selectConta.dataset.allOptions;

                if (tipo === 'parcelada') {
                    if(parceladaFields) parceladaFields.style.display = 'block';
                    labelValor.textContent = 'Valor Total';
                    if (selectConta.dataset.creditCardOptions) selectConta.innerHTML = selectConta.dataset.creditCardOptions;
                } else if (tipo === 'recorrente') {
                    if(recorrenteFields) recorrenteFields.style.display = 'block';
                    labelValor.textContent = 'Valor da Recorrência';
                } else {
                    labelValor.textContent = 'Valor';
                }
            }
            
            if (e.target.id.includes('filter')) {
                if(e.target.id.includes('history')) {
                    historyFilters[e.target.id.includes('month') ? 'mes' : 'contaId'] = e.target.value;
                    UI.renderHistoricoTransacoes(1, historyFilters);
                } else {
                    billsFilters[e.target.id.includes('month') ? 'mes' : 'contaId'] = e.target.value;
                    UI.renderLancamentosFuturos(1, billsFilters);
                }
            }
        });
        
        document.body.addEventListener('input', e => {
            if (e.target.id === 'history-search-input') {
                historyFilters.pesquisa = e.target.value;
                UI.renderHistoricoTransacoes(1, historyFilters);
            }
            if (e.target.id === 'bills-search-input') {
                billsFilters.pesquisa = e.target.value;
                UI.renderLancamentosFuturos(1, billsFilters);
            }
        });

        // Submit de formulários
        document.body.addEventListener('submit', e => {
            if (e.target.id === 'form-login') return; // Login tratado separadamente

            e.preventDefault();
            switch (e.target.id) {
                case 'form-conta': salvarConta(e); break;
                case 'form-transacao-unificada': salvarTransacaoUnificada(e); break;
                case 'form-pagamento': confirmarPagamento(e); break;
                case 'form-edicao-transacao': salvarEdicaoTransacao(e); break;
                case 'form-lancamento': salvarLancamentoFuturo(e); break;
                case 'form-compra-parcelada': salvarCompraParcelada(e); break;
                
                case 'form-nova-categoria':
                    const inputCat = e.target.querySelector('input[name="nome"]');
                    if(inputCat.value.trim()) {
                        API.salvarDados('categorias', { nome: inputCat.value.trim() }).then(() => {
                            UI.showToast('Categoria criada!');
                            reloadStateAndRender().then(() => UI.openModal(UI.getCategoriesModalContent()));
                        });
                    }
                    break;
                case 'form-editar-categoria':
                    const idCat = e.target.dataset.id;
                    const nomeAntigo = e.target.dataset.nomeAntigo;
                    const nomeNovo = e.target.querySelector('input[name="nome"]').value.trim();
                    if(nomeNovo && nomeNovo !== nomeAntigo) {
                        API.salvarDados('categorias', { nome: nomeNovo }, idCat).then(() => {
                            return API.atualizarNomeCategoriaEmMassa(nomeAntigo, nomeNovo);
                        }).then(() => {
                            UI.showToast('Atualizado!');
                            UI.closeModal();
                            reloadStateAndRender();
                        });
                    }
                    break;
                case 'form-novo-tipo-conta':
                    const dataTipo = Object.fromEntries(new FormData(e.target));
                    API.salvarDados('tipos_contas', { nome: dataTipo.nome, e_cartao: !!dataTipo.e_cartao }).then(() => {
                        UI.showToast('Tipo criado!');
                        reloadStateAndRender().then(() => UI.openModal(UI.getAccountTypesModalContent()));
                    });
                    break;
            }
        });
    }

    async function initializeApp() {
        UI.showToast('Iniciando sistema...');
        // await carregarDadosOtimizados(); // Dados carregados no checkAuthAndInit
    }

    applyTheme(localStorage.getItem('confin-theme') || 'light');
    setupEventListeners();
    checkAuthAndInit(); // Chama verificação de login
});
