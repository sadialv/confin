// js/state.js
let state = {
    contas: [], transacoes: [], lancamentosFuturos: [], comprasParceladas: []
};
export const getState = () => state;
export const setState = (newState) => {
    state = { ...state, ...newState };
};
export const getContas = () => state.contas;
export const getContaPorId = (id) => state.contas.find(c => c.id === id);
