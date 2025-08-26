// js/utils.js

export const CATEGORIAS_PADRAO = ['Alimentação', 'Transporte', 'Moradia', 'Saúde', 'Lazer', 'Educação', 'Salário', 'Investimentos', 'Contas', 'Ajustes', 'Pagamento de Fatura', 'Outros', 'Compras'];

export const CATEGORY_ICONS = {
    'Alimentação': { icon: 'fas fa-utensils', color: '#f97316' },
    'Transporte': { icon: 'fas fa-car', color: '#3b82f6' },
    'Moradia': { icon: 'fas fa-home', color: '#10b981' },
    'Saúde': { icon: 'fas fa-heartbeat', color: '#ef4444' },
    'Lazer': { icon: 'fas fa-film', color: '#8b5cf6' },
    'Educação': { icon: 'fas fa-graduation-cap', color: '#14b8a6' },
    'Salário': { icon: 'fas fa-dollar-sign', color: '#22c55e' },
    'Investimentos': { icon: 'fas fa-chart-line', color: '#eab308' },
    'Contas': { icon: 'fas fa-file-invoice', color: '#64748b' },
    'Compras': { icon: 'fas fa-shopping-bag', color: '#d946ef' },
    'Ajustes': { icon: 'fas fa-sliders-h', color: '#78716c' },
    'Pagamento de Fatura': { icon: 'fas fa-receipt', color: '#0ea5e9' },
    'Outros': { icon: 'fas fa-ellipsis-h', color: '#94a3b8' }
};

export const formatarMoeda = (valor) => (valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const toISODateString = (date) => new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

export const HOJE = new Date();
HOJE.setHours(0, 0, 0, 0);

export const applyTheme = (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('confin-theme', theme);
};