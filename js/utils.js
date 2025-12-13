// ARQUIVO: js/utils.js

export const formatarMoeda = (valor) => {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(valor);
};

export const toISODateString = (date) => {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().split('T')[0];
};

export const escapeHTML = (str) => {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
};

export const exportToCSV = (data, filename) => {
    if (!data || !data.length) {
        alert("Não há dados para exportar.");
        return;
    }
    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(obj => 
        Object.values(obj).map(val => 
            `"${String(val).replace(/"/g, '""')}"` 
        ).join(',')
    ).join('\n');
    
    const csvContent = headers + '\n' + rows;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}.csv`);
    link.click();
};

// --- NOVA FUNÇÃO: Gerenciar Tema (Correção do Erro) ---
export const applyTheme = (theme) => {
    const html = document.documentElement;
    
    // Define o atributo no HTML
    html.setAttribute('data-theme', theme);
    
    // Atualiza o ícone do botão
    const icon = document.querySelector('#theme-switcher i');
    if (icon) {
        icon.className = theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
    }
    
    // Salva no navegador para não perder ao atualizar a página
    localStorage.setItem('confin_theme', theme);
};

export const CATEGORIAS_PADRAO = [
    'Alimentação', 'Moradia', 'Transporte', 'Saúde', 'Educação', 
    'Lazer', 'Contas', 'Salário', 'Investimentos', 'Outros'
];

export const CATEGORY_ICONS = {
    'Alimentação': { icon: 'fas fa-utensils', color: '#ff6b6b' },
    'Moradia': { icon: 'fas fa-home', color: '#4ecdc4' },
    'Transporte': { icon: 'fas fa-bus', color: '#45b7d1' },
    'Saúde': { icon: 'fas fa-heartbeat', color: '#ff9f43' },
    'Educação': { icon: 'fas fa-graduation-cap', color: '#a55eea' },
    'Lazer': { icon: 'fas fa-gamepad', color: '#2bcbba' },
    'Contas': { icon: 'fas fa-file-invoice-dollar', color: '#778ca3' },
    'Salário': { icon: 'fas fa-money-bill-wave', color: '#20bf6b' },
    'Investimentos': { icon: 'fas fa-chart-line', color: '#2d98da' },
    'Outros': { icon: 'fas fa-tag', color: '#a5b1c2' }
};

export const CHART_COLORS = [
    '#4ecdc4', '#ff6b6b', '#45b7d1', '#ff9f43', '#a55eea', 
    '#2bcbba', '#778ca3', '#20bf6b', '#2d98da', '#fc5c65', 
    '#fed330', '#eb3b5a', '#fa8231', '#0fb9b1', '#4b7bec'
];
