// js/state.js
let state = {
    contas: [], transacoes: [], lancamentosFuturos: [], comprasParceladas: [],
    historyCurrentPage: 1, historyFilters: { mes: 'todos', pesquisa: '' },
    billsCurrentPage: 1, billsFilters: { mes: 'todos', pesquisa: '' }
};
export const getState = () => state;
export const setState = (newState) => {
    state = { ...state, ...newState };
};
export const getContas = () => state.contas;
export const getContaPorId = (id) => state.contas.find(c => c.id === id);

// Funções para gerenciar o estado de histórico
export const getHistoryPage = () => state.historyCurrentPage;
export const setHistoryPage = (page) => { state.historyCurrentPage = page; };
export const incrementHistoryPage = () => { state.historyCurrentPage++; };
export const decrementHistoryPage = () => { state.historyCurrentPage--; };
export const getHistoryFilters = () => state.historyFilters;
export const setHistoryFilter = (key, value) => { state.historyFilters = { ...state.historyFilters, [key]: value }; };

// Funções para gerenciar o estado de lançamentos futuros
export const getBillsPage = () => state.billsCurrentPage;
export const setBillsPage = (page) => { state.billsCurrentPage = page; };
export const incrementBillsPage = () => { state.billsCurrentPage++; };
export const decrementBillsPage = () => { state.billsCurrentPage--; };
export const getBillsFilters = () => state.billsFilters;
export const setBillsFilter = (key, value) => { state.billsFilters = { ...state.billsFilters, [key]: value }; };
