export const formatDZD = (amount: number) => { return new Intl.NumberFormat('fr-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount) + ' DA'; };

export const formatDate = (isoString: string) => { const date = new Date(isoString); return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(date); };

export const formatDateShort = (isoString: string) => { const date = new Date(isoString); return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(date); };
