export const colors = {
    background: '#0a1f16',
    surface: '#12291f',
    surfaceAlt: '#183628',
    border: '#234636',
    primary: '#12b76a',
    primaryDark: '#0d8f52',
    text: '#f0fdf4',
    textMuted: '#8fb5a4',
    textFaint: '#5c8271',
    danger: '#f04438',
    warning: '#f79009',
    info: '#3b82f6',
    success: '#12b76a',
    white: '#ffffff',
};

export const pillarColorForScore = (score: number): string => {
    if (score >= 80) return colors.success;
    if (score >= 60) return colors.warning;
    return colors.danger;
};

export const bandColor = (band: string): string => {
    switch (band) {
        case 'Excellent':
            return colors.success;
        case 'Good':
            return '#84cc16';
        case 'Fair':
            return colors.warning;
        case 'Needs Work':
            return '#fb923c';
        default:
            return colors.danger;
    }
};
