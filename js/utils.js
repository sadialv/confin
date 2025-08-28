// js/utils.js
export const CATEGORIAS_PADRAO = ['Alimentação', 'Transporte', 'Moradia', 'Saúde', 'Lazer', 'Educação', 'Salário', 'Investimentos', 'Contas', 'Ajustes', 'Pagamento de Fatura', 'Outros', 'Compras'];
export const CATEGORY_ICONS = { /* ...código completo do objeto... */ };
export const CHART_COLORS = ['#f97316', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6', '#eab308', '#64748b', '#d946ef', '#14b8a6'];
export const formatarMoeda = (valor) => (valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const toISODateString = (date) => new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
export const HOJE = new Date();
HOJE.setHours(0, 0, 0, 0);
export const applyTheme = (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('confin-theme', theme);
};
