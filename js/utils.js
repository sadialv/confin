// js/utils.js
export const CATEGORIAS_PADRAO = ['Alimentação', 'Transporte', 'Moradia', 'Saúde', 'Lazer', 'Educação', 'Salário', 'Investimentos', 'Contas', 'Ajustes', 'Pagamento de Fatura', 'Compras', 'Outros'];

export const CATEGORY_ICONS = {
    'Alimentação': { icon: 'fas fa-utensils', color: '#EF4444' }, // Red
    'Transporte': { icon: 'fas fa-car', color: '#3B82F6' },     // Blue
    'Moradia': { icon: 'fas fa-home', color: '#10B981' },      // Green
    'Saúde': { icon: 'fas fa-heartbeat', color: '#EC4899' },    // Pink
    'Lazer': { icon: 'fas fa-film', color: '#8B5CF6' },      // Purple
    'Educação': { icon: 'fas fa-graduation-cap', color: '#14B8A6' }, // Teal
    'Salário': { icon: 'fas fa-dollar-sign', color: '#22C55E' },
    'Investimentos': { icon: 'fas fa-chart-line', color: '#06B6D4' },
    'Contas': { icon: 'fas fa-file-invoice-dollar', color: '#F97316' }, // Orange
    'Ajustes': { icon: 'fas fa-sliders-h', color: '#64748B' },
    'Pagamento de Fatura': { icon: 'fas fa-credit-card', color: '#A855F7' },
    'Compras': { icon: 'fas fa-shopping-bag', color: '#D946EF' },
    'Outros': { icon: 'fas fa-question-circle', color: '#6B7280' } 
};

export const CHART_COLORS = [
    '#EF4444', '#F97316', '#10B981', '#3B82F6', '#8B5CF6', 
    '#EC4899', '#14B8A6', '#D946EF', '#64748B'
];

export const formatarMoeda = (valor) => (valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const toISODateString = (date) => new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

export const HOJE = new Date();
HOJE.setHours(0, 0, 0, 0);

export const applyTheme = (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('confin-theme', theme);
};
