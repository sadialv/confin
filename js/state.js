// js/state.js

let state = {
    contas: [],
    transacoes: [],
    lancamentosFuturos: [],
    comprasParceladas: []
};

export const getState = () => state;

export const setState = (newState) => {
    state = { ...state, ...newState };
};

export const adicionarItem = (tipo, item) => {
    state[tipo] = [...state[tipo], item];
};

export const atualizarItem = (tipo, id, itemAtualizado) => {
    state[tipo] = state[tipo].map(item => (item.id === id ? { ...item, ...itemAtualizado } : item));
};

export const removerItem = (tipo, id) => {
    state[tipo] = state[tipo].filter(item => item.id !== id);
};

// Funções "getter" específicas para facilitar o acesso
export const getContas = () => state.contas;
export const getTransacoes = () => state.transacoes;
export const getLancamentosFuturos = () => state.lancamentosFuturos;
export const getComprasParceladas = () => state.comprasParceladas;

export const getContaPorId = (id) => state.contas.find(c => c.id === id);