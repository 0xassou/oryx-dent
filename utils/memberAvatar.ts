/**
 * Initiale et couleur stable par membre (avatar équipe).
 */

const AVATAR_PALETTE = [
  "#7c3aed", // violet
  "#059669", // vert
  "#2563eb", // bleu
  "#d97706", // ambre
  "#db2777", // rose
  "#0891b2", // cyan
  "#4f46e5", // indigo
  "#ca8a04", // jaune-or
  "#0d9488", // teal
  "#9333ea", // violet foncé
] as const;

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function memberAvatarColor(userId: string): string {
  const idx = hashString(userId) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[idx]!;
}

export function memberAvatarInitial(displayName: string): string {
  const t = displayName.trim();
  if (!t) return "?";
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0]!.charAt(0);
    const b = parts[parts.length - 1]!.charAt(0);
    if (a && b) return (a + b).toUpperCase();
  }
  return t.charAt(0).toUpperCase();
}
