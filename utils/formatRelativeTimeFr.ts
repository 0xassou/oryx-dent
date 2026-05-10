/**
 * Heure relative courte en français (ex. « il y a 3 min »).
 */

export function formatRelativeTimeFr(
  iso: string | Date,
  nowMs: number = Date.now(),
): string {
  const t =
    typeof iso === "string" ? new Date(iso).getTime() : iso.getTime();
  if (Number.isNaN(t)) return "—";
  const diff = Math.max(0, nowMs - t);
  const sec = Math.floor(diff / 1000);
  if (sec < 45) return "à l’instant";
  const min = Math.floor(diff / 60_000);
  if (min < 60) {
    return min <= 1 ? "il y a 1 min" : `il y a ${min} min`;
  }
  const h = Math.floor(diff / 3_600_000);
  if (h < 24) {
    return h === 1 ? "il y a 1 h" : `il y a ${h} h`;
  }
  const d = Math.floor(diff / 86_400_000);
  if (d < 7) {
    return d === 1 ? "il y a 1 jour" : `il y a ${d} jours`;
  }
  const w = Math.floor(diff / 604_800_000);
  return w === 1 ? "il y a 1 semaine" : `il y a ${w} semaines`;
}
