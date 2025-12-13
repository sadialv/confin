// ARQUIVO: js/state.js

// Estado Global da Aplicação (Memória)
const state = {
    contas: [],
    categorias: [],
    transacoes: [],
    lancamentosFuturos: [],
    comprasParceladas: []
};

// =========================================================================
// === SETTERS (Gravação de Dados) - O erro acontecia pela falta destes ===
// =========================================================================

export const setContas = (data) => {
    state.contas = data || [];
};

export const setCategorias = (data) => {
    state.categorias = data || [];
};

export const setTransacoes = (data) => {
    state.transacoes = data || [];
};

export const setLancamentosFuturos = (data) => {
    state.lancamentosFuturos = data || [];
};

export const setComprasParceladas = (data) => {
    state.comprasParceladas = data || [];
};

// =========================================================================
// === GETTERS (Leitura de Dados) ===
// =========================================================================

export const getState = () => state;

export const getContas = () => state.contas;

export const getCategorias = () => state.categorias;

export const getContaPorId = (id) => {
    return state.contas.find(c => c.id == id);
};

// =========================================================================
// === HELPERS DE LÓGICA (Tipos de Conta) ===
// =========================================================================

// Define quais tipos existem e suas propriedades
export const getTiposContas = () => [
    { id: 'cc', nome: 'Conta Corrente', e_cartao: false },
    { id: 'din', nome: 'Dinheiro', e_cartao: false },
    { id: 'poup', nome: 'Poupança', e_cartao: false },
    { id: 'inv', nome: 'Investimentos', e_cartao: false },
    { id: 'cred', nome: 'Cartão de Crédito', e_cartao: true }
];

// Verifica se um tipo (string) é cartão de crédito
export const isTipoCartao = (tipoNome) => {
    if (!tipoNome) return false;
    // Verifica se o nome contém "Cartão" ou "Crédito"
    // Ou compara com a lista oficial
    const tipos = getTiposContas();
    const tipoObj = tipos.find(t => t.nome === tipoNome);
    
    if (tipoObj) return tipoObj.e_cartao;
    
    // Fallback genérico caso o nome tenha sido editado manualmente no banco
    return tipoNome.toLowerCase().includes('cartão') || tipoNome.toLowerCase().includes('credito');
};
