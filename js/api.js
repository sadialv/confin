// js/api.js

const SUPABASE_URL = 'https://fjrpiikhbsvauzbdugtd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqcnBpaWtoYnN2YXV6YmR1Z3RkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQwODUwNjcsImV4cCI6MjA2OTY2MTA2N30.htvLwyMRQcJhB4GgkromHejZ2f8aHPWxCCxA3mAQCcM';
const clienteSupabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const fetchData = async () => {
    try {
        const [contasRes, transacoesRes, lancamentosRes, comprasParceladasRes] = await Promise.all([
            clienteSupabase.from('contas').select('*').order('nome'),
            clienteSupabase.from('transacoes').select('*').order('data', { ascending: false }),
            clienteSupabase.from('lancamentos_futuros').select('*').order('data_vencimento'),
            clienteSupabase.from('compras_parceladas').select('*')
        ]);

        if (contasRes.error) throw contasRes.error;
        if (transacoesRes.error) throw transacoesRes.error;
        if (lancamentosRes.error) throw lancamentosRes.error;
        if (comprasParceladasRes.error) throw comprasParceladasRes.error;

        return {
            contas: contasRes.data || [],
            transacoes: transacoesRes.data || [],
            lancamentosFuturos: lancamentosRes.data || [],
            comprasParceladas: comprasParceladasRes.data || [],
        };
    } catch (error) {
        console.error("Erro ao carregar dados iniciais:", error);
        throw error;
    }
};

export const salvarDados = async (tabela, dados, id = null) => {
    let response;
    if (id) {
        response = await clienteSupabase.from(tabela).update(dados).eq('id', id).select();
    } else {
        response = await clienteSupabase.from(tabela).insert(dados).select();
    }
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