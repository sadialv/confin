// js/utils.js
export const CATEGORIAS_PADRAO = ['Alimentação', 'Transporte', 'Moradia', 'Saúde', 'Lazer', 'Educação', 'Salário', 'Investimentos', 'Contas', 'Ajustes', 'Pagamento de Fatura', 'Compras', 'Outros'];

// PALETA DE ÍCONES ATUALIZADA PARA COMBINAR COM O TEMA NORDIC
export const CATEGORY_ICONS = {
    'Alimentação': { icon: 'fas fa-utensils', color: '#D08770' }, // Laranja
    'Transporte': { icon: 'fas fa-car', color: '#8FBCBB' }, // Turquesa
    'Moradia': { icon: 'fas fa-home', color: '#A3BE8C' }, // Verde
    'Saúde': { icon: 'fas fa-heartbeat', color: '#BF616A' }, // Vermelho
    'Lazer': { icon: 'fas fa-film', color: '#B48EAD' }, // Roxo
    'Educação': { icon: 'fas fa-graduation-cap', color: '#88C0D0' }, // Azul Gelo
    'Salário': { icon: 'fas fa-dollar-sign', color: '#A3BE8C' },
    'Investimentos': { icon: 'fas fa-chart-line', color: '#81A1C1' }, // Azul
    'Contas': { icon: 'fas fa-file-invoice-dollar', color: '#EBCB8B' }, // Amarelo
    'Ajustes': { icon: 'fas fa-sliders-h', color: '#D8DEE9' }, // Cinza
    'Pagamento de Fatura': { icon: 'fas fa-credit-card', color: '#88C0D0' },
    'Compras': { icon: 'fas fa-shopping-bag', color: '#D08770' },
    'Outros': { icon: 'fas fa-question-circle', color: '#4C566A' } 
};

// NOVA PALETA DE CORES PARA OS GRÁFICOS (NORDIC)
export const CHART_COLORS = [
    '#BF616A', // Vermelho
    '#D08770', // Laranja
    '#EBCB8B', // Amarelo
    '#A3BE8C', // Verde
    '#8FBCBB', // Turquesa
    '#88C0D0', // Azul Gelo
    '#81A1C1', // Azul
    '#B48EAD', // Roxo
    '#4C566A', // Cinza
];

export const formatarMoeda = (valor) => (valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const toISODateString = (date) => new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

export const HOJE = new Date();
HOJE.setHours(0, 0, 0, 0);

export const applyTheme = (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('confin-theme', theme);
};
