import type { CabinetAuditLogRow } from "@/lib/types/cabinet-audit-db";

function metaName(m: Record<string, unknown> | null): string {
  if (!m) return "";
  const p = String(m.prenom ?? "").trim();
  const n = String(m.nom ?? "").trim();
  return [p, n].filter(Boolean).join(" ").trim();
}

/**
 * Phrase lisible pour le fil d’activité (sans heure relative).
 */
export function cabinetAuditSentenceFr(row: CabinetAuditLogRow): string {
  const who = row.display_name.trim() || "Un membre";
  const m = (row.metadata ?? {}) as Record<string, unknown>;

  switch (row.action_type) {
    case "patient_cree": {
      const n = metaName(m);
      return `${who} a ajouté ${n || "un patient"}`;
    }
    case "patient_mis_a_jour": {
      const n = metaName(m);
      return `${who} a modifié la fiche patient${n ? ` · ${n}` : ""}`;
    }
    case "patient_profil_etendu_mis_a_jour":
      return `${who} a mis à jour le profil étendu / cockpit`;
    case "patient_acte_ajoute": {
      const tooth = m.tooth != null ? String(m.tooth) : "";
      const acte = m.acte != null ? String(m.acte) : "acte";
      return `${who} a ajouté un acte${tooth ? ` dent ${tooth}` : ""} — ${acte}`;
    }
    case "patient_acte_modifie": {
      const tooth = m.tooth != null ? String(m.tooth) : "";
      const acte = m.acte != null ? String(m.acte) : "acte";
      return `${who} a modifié un acte${tooth ? ` dent ${tooth}` : ""} — ${acte}`;
    }
    case "rdv_cree": {
      const tail = row.summary?.replace(/^RDV\s*·\s*/i, "").trim();
      return tail ? `${who} a créé un RDV · ${tail}` : `${who} a créé un rendez-vous`;
    }
    case "rdv_modifie": {
      const tail = row.summary?.replace(/^RDV modifié\s*·\s*/i, "").trim();
      return tail
        ? `${who} a modifié un RDV · ${tail}`
        : `${who} a modifié un rendez-vous`;
    }
    case "facture_creee": {
      const tail = row.summary?.replace(/^Facture créée\s*·\s*/i, "").trim();
      return tail
        ? `${who} a créé une facture · ${tail}`
        : `${who} a créé une facture`;
    }
    case "facture_modifiee": {
      const tail = row.summary?.replace(/^Facture modifiée\s*·\s*/i, "").trim();
      return tail
        ? `${who} a modifié une facture · ${tail}`
        : `${who} a modifié une facture`;
    }
    case "stock_cree": {
      const tail = row.summary?.replace(/^Stock ajouté\s*·\s*/i, "").trim();
      return tail
        ? `${who} a ajouté au stock · ${tail}`
        : `${who} a ajouté un article au stock`;
    }
    case "stock_modifie": {
      const tail = row.summary?.replace(/^Stock modifié\s*·\s*/i, "").trim();
      return tail
        ? `${who} a modifié le stock · ${tail}`
        : `${who} a modifié le stock`;
    }
    case "commande_labo_creee":
      return row.summary
        ? row.summary.replace(/^Commande labo/, `${who} a créé une commande labo`)
        : `${who} a créé une commande laboratoire`;
    case "commande_labo_modifiee":
      return `${who} a mis à jour une commande laboratoire`;
    default:
      return row.summary ?? `${who} (${row.action_type})`;
  }
}
