// ARQUIVO: js/api.js

// --- 1. CONFIGURAÇÃO E INICIALIZAÇÃO ---
// Recuperei a URL dos seus logs, mas VERIFIQUE A CHAVE!
const SUPABASE_URL = 'https://fjrpiikhbsvauzbdugtd.supabase.co';
const SUPABASE_KEY = 'sb_secret_kMQ40hbvRrhzT4GASSoWWw_0IadbjYh'; // <--- OBRIGATÓRIO: Cole sua chave 'anon public' aqui

// Inicializa o cliente usando a biblioteca carregada no index.html
if (!window.supabase) {
    console.error("A biblioteca do Supabase não foi carregada. Verifique o index.html.");
}
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- 2. FUNÇÕES DE AUTENTICAÇÃO (LOGIN) ---

export const login = async (email, password) => {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: email,
        password: password,
    });
    if (error) throw error;
    return data;
};

export const logout = async () => {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;
};

export const getSession = async () => {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) {
        console.error("Erro ao verificar sessão:", error);
        return null;
    }
    return data.session;
};

// --- 3. FUNÇÕES DE DADOS (BANCO DE DADOS) ---

// Função genérica para buscar dados
async function fetchCallImpl(table, queryParams = {}) {
    let query = supabaseClient.from(table).select(queryParams.select || '*');
    
    if (queryParams.order) {
        query = query.order(queryParams.order.column, { ascending: queryParams.order.ascending });
    }
    // Adicione mais filtros aqui se necessário
    
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data;
}

// Carrega todos os dados necessários de uma vez
export const fetchDadosAuxiliares = async () => {
    try {
        const [contas, lancamentos, compras, categorias, tipos] = await Promise.all([
            fetchCallImpl('contas', { order: { column: 'nome', ascending: true } }),
            fetchCallImpl('lancamentos_futuros'), // Traz tudo para filtrar no JS
            fetchCallImpl('compras_parceladas'),
            fetchCallImpl('categorias', { order: { column: 'nome', ascending: true } }),
            fetchCallImpl('tipos_contas', { order: { column: 'nome', ascending: true } })
        ]);
        
        return {
            contas: contas || [],
            lancamentosFuturos: lancamentos || [],
            comprasParceladas: compras || [],
            categorias: categorias || [],
            tiposContas: tipos || []
        };
    } catch (error) {
        console.error("Erro ao buscar dados auxiliares:", error);
        throw error;
    }
};

export const fetchResumoTransacoesAntigas = async (dataCorte) => {
    // Busca transações ANTERIORES a data de corte para calcular saldo acumulado
    const { data, error } = await supabaseClient
        .from('transacoes')
        .select('conta_id, valor, tipo')
        .lt('data', dataCorte);

    if (error) throw new Error(error.message);
    return data || [];
};

export const fetchTransacoesRecentes = async (dataCorte) => {
    // Busca transações A PARTIR da data de corte (ano atual)
    const { data, error } = await supabaseClient
        .from('transacoes')
        .select('*')
        .gte('data', dataCorte)
        .order('data', { ascending: false });

    if (error) throw new Error(error.message);
    return data || [];
};

// Salvar (Insert ou Update)
export const salvarDados = async (tabela, dados, id = null) => {
    let query;
    if (id) {
        query = supabaseClient.from(tabela).update(dados).eq('id', id);
    } else {
        query = supabaseClient.from(tabela).insert([dados]);
    }
    
    const { data, error } = await query.select();
    if (error) throw new Error(error.message);
    return data ? data[0] : null;
};

// Salvar Múltiplos (Batch Insert)
export const salvarMultiplosLancamentos = async (listaLancamentos) => {
    const { data, error } = await supabaseClient
        .from('lancamentos_futuros')
        .insert(listaLancamentos)
        .select();
        
    if (error) throw new Error(error.message);
    return data;
};

// Deletar
export const deletarDados = async (tabela, id) => {
    const { error } = await supabaseClient.from(tabela).delete().eq('id', id);
    if (error) throw new Error(error.message);
    return true;
};

// Funções Específicas de Deleção em Massa
export const deletarLancamentosPorCompraId = async (compraId) => {
    const { error } = await supabaseClient
        .from('lancamentos_futuros')
        .delete()
        .eq('compra_parcelada_id', compraId);
    if (error) throw new Error(error.message);
};

export const deletarLancamentosPendentesPorCompraId = async (compraId) => {
    const { error } = await supabaseClient
        .from('lancamentos_futuros')
        .delete()
        .eq('compra_parcelada_id', compraId)
        .eq('status', 'pendente'); // Só apaga o que ainda não foi pago
    if (error) throw new Error(error.message);
};

export const atualizarNomeCategoriaEmMassa = async (nomeAntigo, nomeNovo) => {
    // Atualiza transações
    await supabaseClient.from('transacoes').update({ categoria: nomeNovo }).eq('categoria', nomeAntigo);
    // Atualiza lançamentos futuros
    await supabaseClient.from('lancamentos_futuros').update({ categoria: nomeNovo }).eq('categoria', nomeAntigo);
    // Atualiza compras parceladas
    await supabaseClient.from('compras_parceladas').update({ categoria: nomeNovo }).eq('categoria', nomeAntigo);
    return true;
};

