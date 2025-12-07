// ARQUIVO: js/api.js
const SUPABASE_URL = 'https://fjrpiikhbsvauzbdugtd.supabase.co';
// ATENÇÃO: Em produção, ative o RLS no Supabase para proteger esta chave.
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqcnBpaWtoYnN2YXV6YmR1Z3RkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQwODUwNjcsImV4cCI6MjA2OTY2MTA2N30.htvLwyMRQcJhB4GgkromHejZ2f8aHPWxCCxA3mAQCcM';
const clienteSupabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Busca tabelas auxiliares completas (geralmente são pequenas)
export const fetchDadosAuxiliares = async () => {
    const [contas, lancamentos, compras] = await Promise.all([
        clienteSupabase.from('contas').select('*').order('nome'),
        // Trazemos todos os lançamentos futuros pendentes, ou pagos recentemente
        clienteSupabase.from('lancamentos_futuros').select('*').order('data_vencimento'), 
        clienteSupabase.from('compras_parceladas').select('*')
    ]);
    if (contas.error) throw contas.error;
    if (lancamentos.error) throw lancamentos.error;
    if (compras.error) throw compras.error;

    return {
        contas: contas.data || [],
        lancamentosFuturos: lancamentos.data || [],
        comprasParceladas: compras.data || []
    };
};

// 1. Busca LEVE: Apenas valores antigos para ajustar o saldo (sem descrição, sem categoria)
export const fetchResumoTransacoesAntigas = async (dataCorte) => {
    const { data, error } = await clienteSupabase
        .from('transacoes')
        .select('conta_id, valor, tipo') // Trazemos apenas o necessário para somar
        .lt('data', dataCorte); // Menor que a data de corte
    
    if (error) throw error;
    return data || [];
};

// 2. Busca PESADA: Transações completas do período atual
export const fetchTransacoesRecentes = async (dataCorte) => {
    const { data, error } = await clienteSupabase
        .from('transacoes')
        .select('*')
        .gte('data', dataCorte) // Maior ou igual a data de corte
        .order('data', { ascending: false });

    if (error) throw error;
    return data || [];
};

// Funções de Escrita (CRUD) continuam iguais
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

export const salvarMultiplosLancamentos = async (lancamentos) => {
    const { data, error } = await clienteSupabase.from('lancamentos_futuros').insert(lancamentos).select();
    if (error) throw error;
    return data;
};

export const deletarLancamentosPorCompraId = async (compraId) => {
    const { error } = await clienteSupabase.from('lancamentos_futuros').delete().eq('compra_parcelada_id', compraId);
    if (error) throw error;
};
