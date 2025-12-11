// ARQUIVO: js/api.js
const SUPABASE_URL = 'https://fjrpiikhbsvauzbdugtd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqcnBpaWtoYnN2YXV6YmR1Z3RkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQwODUwNjcsImV4cCI6MjA2OTY2MTA2N30.htvLwyMRQcJhB4GgkromHejZ2f8aHPWxCCxA3mAQCcM';
const clienteSupabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 1. Busca tabelas auxiliares completas (geralmente pequenas)
export const fetchDadosAuxiliares = async () => {
    const [contas, lancamentos, compras, categorias, tipos] = await Promise.all([
        clienteSupabase.from('contas').select('*').order('nome'),
        clienteSupabase.from('lancamentos_futuros').select('*').order('data_vencimento'), 
        clienteSupabase.from('compras_parceladas').select('*'),
        clienteSupabase.from('categorias').select('*').order('nome'),
        clienteSupabase.from('tipos_contas').select('*').order('nome')
    ]);
    
    if (contas.error) throw contas.error;
    if (lancamentos.error) throw lancamentos.error;
    if (compras.error) throw compras.error;
    if (categorias.error) throw categorias.error;
    if (tipos.error) throw tipos.error;

    return {
        contas: contas.data || [],
        lancamentosFuturos: lancamentos.data || [],
        comprasParceladas: compras.data || [],
        categorias: categorias.data || [],
        tiposContas: tipos.data || []
    };
};

// 2. Busca LEVE: Apenas valores antigos para ajustar o saldo inicial (sem trazer o histórico detalhado)
export const fetchResumoTransacoesAntigas = async (dataCorte) => {
    const { data, error } = await clienteSupabase
        .from('transacoes')
        .select('conta_id, valor, tipo')
        .lt('data', dataCorte); // Menor que a data de corte
    
    if (error) throw error;
    return data || [];
};

// 3. Busca PESADA: Transações completas apenas do período atual (Performance)
export const fetchTransacoesRecentes = async (dataCorte) => {
    const { data, error } = await clienteSupabase
        .from('transacoes')
        .select('*')
        .gte('data', dataCorte) // Maior ou igual a data de corte
        .order('data', { ascending: false });

    if (error) throw error;
    return data || [];
};

// --- FUNÇÕES DE ESCRITA GENÉRICAS (Salvar/Editar/Deletar) ---

export const salvarDados = async (tabela, dados, id = null) => {
    let response = id
        ? await clienteSupabase.from(tabela).update(dados).eq('id', id).select()
        : await clienteSupabase.from(tabela).insert(dados).select();
    
    if (response.error) throw response.error;
    return response.data[0];
};

export const deletarDados = async (tabela, id) => {
    const { error } = await clienteSupabase.from(tabela).delete().eq('id', id);
    if (error) throw error;
};

// --- FUNÇÕES ESPECÍFICAS PARA LÓGICA DE NEGÓCIO ---

export const salvarMultiplosLancamentos = async (lancamentos) => {
    const { data, error } = await clienteSupabase.from('lancamentos_futuros').insert(lancamentos).select();
    if (error) throw error;
    return data;
};

// Usada quando apagamos uma compra inteira (ex: erro no lançamento)
export const deletarLancamentosPorCompraId = async (compraId) => {
    const { error } = await clienteSupabase.from('lancamentos_futuros').delete().eq('compra_parcelada_id', compraId);
    if (error) throw error;
};

// Usada na edição inteligente de série (apaga o futuro, mantem o passado pago)
export const deletarLancamentosPendentesPorCompraId = async (compraId) => {
    const { error } = await clienteSupabase
        .from('lancamentos_futuros')
        .delete()
        .eq('compra_parcelada_id', compraId)
        .eq('status', 'pendente'); // Só apaga o que não foi pago ainda
    if (error) throw error;
};

// Helper para renomear categorias em massa (histórico + futuro)
export const atualizarNomeCategoriaEmMassa = async (nomeAntigo, nomeNovo) => {
    const updates = [
        clienteSupabase.from('transacoes').update({ categoria: nomeNovo }).eq('categoria', nomeAntigo),
        clienteSupabase.from('lancamentos_futuros').update({ categoria: nomeNovo }).eq('categoria', nomeAntigo),
        clienteSupabase.from('compras_parceladas').update({ categoria: nomeNovo }).eq('categoria', nomeAntigo)
    ];
    await Promise.all(updates);
};
// Adicione/Atualize no js/api.js

// ... (sua inicialização do supabaseClient existente) ...

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
    const { data } = await supabaseClient.auth.getSession();
    return data.session;
};

// ... (o resto das suas funções de fetch/salvar/deletar continuam iguais)
