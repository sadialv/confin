// js/utils.js
export const CATEGORIAS_PADRAO = ['Alimentação', 'Transporte', 'Moradia', 'Saúde', 'Lazer', 'Educação', 'Salário', 'Investimentos', 'Contas', 'Ajustes', 'Pagamento de Fatura', 'Compras', 'Outros'];

export const CATEGORY_ICONS = {
    'Alimentação': { icon: 'fas fa-utensils', color: '#F6AD55' }, // Laranja
    'Transporte': { icon: 'fas fa-car', color: '#4FD1C5' }, // Turquesa
    'Moradia': { icon: 'fas fa-home', color: '#48BB78' }, // Verde
    'Saúde': { icon: 'fas fa-heartbeat', color: '#F56565' }, // Vermelho
    'Lazer': { icon: 'fas fa-film', color: '#B794F4' }, // Roxo
    'Educação': { icon: 'fas fa-graduation-cap', color: '#63B3ED' }, // Azul
    'Salário': { icon: 'fas fa-dollar-sign', color: '#38A169' }, // Verde (Renda)
    'Investimentos': { icon: 'fas fa-chart-line', color: '#0BC5EA' }, // Ciano
    'Contas': { icon: 'fas fa-file-invoice-dollar', color: '#ECC94B' }, // Amarelo
    'Ajustes': { icon: 'fas fa-sliders-h', color: '#A0AEC0' }, // Cinza
    'Pagamento de Fatura': { icon: 'fas fa-credit-card', color: '#7f8daa' }, // Cinza-azulado
    'Compras': { icon: 'fas fa-shopping-bag', color: '#ED8936' }, // Laranja escuro
    'Outros': { icon: 'fas fa-question-circle', color: '#718096' } // Cinza escuro
};

// NOVA PALETA DE CORES PARA OS GRÁFICOS
export const CHART_COLORS = [
    '#ED8936', // Laranja
    '#4FD1C5', // Turquesa
    '#F56565', // Vermelho
    '#B794F4', // Roxo
    '#63B3ED', // Azul
    '#48BB78', // Verde
    '#ECC94B', // Amarelo
    '#F687B3', // Rosa
    '#718096', // Cinza
];

export const formatarMoeda = (valor) => (valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const toISODateString = (date) => new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

export const HOJE = new Date();
HOJE.setHours(0, 0, 0, 0);

export const applyTheme = (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('confin-theme', theme);
};
