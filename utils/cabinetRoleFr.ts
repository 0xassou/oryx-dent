/** Libellé français du rôle cabinet (infobulle traçabilité). */
export function cabinetRoleLabelFr(role: string | null | undefined): string {
  const r = String(role ?? "")
    .trim()
    .toLowerCase();
  switch (r) {
    case "admin":
      return "Administrateur";
    case "praticien":
      return "Praticien";
    case "assistant":
      return "Assistante";
    case "remplacant":
      return "Remplaçant";
    default:
      return role?.trim() || "—";
  }
}
