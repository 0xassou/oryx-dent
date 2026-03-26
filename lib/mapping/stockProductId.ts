/**
 * Identifiant stable de ligne stock à partir du libellé consommable (UI + PostgreSQL).
 * Pure JS — doit rester identique au script `scripts/seed-test-clinic.cjs`.
 */
export function stockProductIdFromLabel(label: string): string {
  const t = label.trim();
  let h = BigInt(2166136261);
  const mask = BigInt("0xffffffffffffffff");
  const mul = BigInt(16777619);
  for (let i = 0; i < t.length; i++) {
    h ^= BigInt(t.charCodeAt(i));
    h = (h * mul) & mask;
  }
  return "s" + h.toString(16).padStart(16, "0").slice(0, 15);
}
