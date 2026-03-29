export const formatDZD = (amount: number) => { return new Intl.NumberFormat('fr-DZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount) + ' DA'; };

export const formatDate = (isoString: string) => { const date = new Date(isoString); return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(date); };

export const formatDateShort = (isoString: string) => { const date = new Date(isoString); return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(date); };

/** Affichage type 06 00 00 00 00 (paquets de 2 chiffres, max 10 pour mobile DZ). */
export function formatPhoneNumber(raw: string): string {
  if (raw == null || raw === "") return "—";
  const trimmed = raw.trim();
  if (trimmed === "—") return "—";
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 0) return trimmed;
  const core = digits.slice(0, 12);
  const pairs = core.match(/.{1,2}/g);
  return pairs ? pairs.join(" ") : trimmed;
}
