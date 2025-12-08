// ARQUIVO: js/state.js
let state = {
    contas: [], 
    transacoes: [], 
    lancamentosFuturos: [], 
    comprasParceladas: [],
    categorias: [],
    tiposContas: [] // <--- Novo
};

export const getState = () => state;
export const setState = (newState) => {
    state = { ...state, ...newState };
};

// Getters
export const getContas = () => state.contas;
export const getContaPorId = (id) => state.contas.find(c => c.id === id);
export const getCategorias = () => state.categorias.sort((a,b) => a.nome.localeCompare(b.nome));
export const getTiposContas = () => state.tiposContas.sort((a,b) => a.nome.localeCompare(b.nome));

// Helper essencial: Verifica se um nome de tipo (string) é cartão de crédito
export const isTipoCartao = (nomeTipo) => {
    const tipo = state.tiposContas.find(t => t.nome === nomeTipo);
    return tipo ? tipo.e_cartao : false;
};
