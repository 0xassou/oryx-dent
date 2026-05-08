import type { FactureRowJoined } from "@/lib/types/factures-db";
import {
  parseFactureDateFr,
  type FactureDocument,
} from "@/utils/factureDocuments";

/** Statut persistant PostgreSQL (`factures.statut`). */
export function montantsToStatutPostgreSQL(
  montant: number,
  montantPaye: number,
): string {
  const t = Math.max(0, montant);
  const p = Math.max(0, Math.min(montantPaye, t));
  if (t <= 0) return "en_attente";
  if (p >= t) return "paye";
  if (p > 0) return "partiel";
  return "en_attente";
}

export function extractFinanceLineIdFromActes(actes: unknown): string | undefined {
  if (
    actes &&
    typeof actes === "object" &&
    !Array.isArray(actes) &&
    typeof (actes as { financeLineId?: unknown }).financeLineId === "string"
  ) {
    return (actes as { financeLineId: string }).financeLineId;
  }
  return undefined;
}

/** Date SQL `YYYY-MM-DD` → affichage `JJ/MM/AAAA`. */
export function factureIsoDateToFr(isoDate: string): string {
  const d = isoDate.trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) return isoDate;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** `JJ/MM/AAAA` attendu UI → `YYYY-MM-DD` pour PostgreSQL (date locale). */
export function factureDateFrToIso(fr: string): string {
  const d = parseFactureDateFr(fr.trim());
  if (!d || Number.isNaN(d.getTime())) {
    const now = new Date();
    const y = now.getFullYear();
    const mo = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${y}-${mo}-${day}`;
  }
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

function joinPatientNom(prenom: string | null, nom: string | null): string {
  const p = `${(prenom ?? "").trim()} ${(nom ?? "").trim()}`.trim();
  return p || "(Patient)";
}

export function factureJoinedRowToDocument(row: FactureRowJoined): FactureDocument {
  const financeLineId = extractFinanceLineIdFromActes(row.actes);
  const montant = Number.parseFloat(String(row.montant ?? "0")) || 0;
  const paye =
    Number.parseFloat(String(row.montant_paye ?? "0")) ||
    0;
  return {
    id: row.id,
    date: factureIsoDateToFr(row.date),
    patient: joinPatientNom(row.prenom, row.nom),
    patientId: row.patient_id ?? undefined,
    montantTotal: montant,
    montantPaye: Math.min(Math.max(0, paye), Math.max(0, montant)),
    financeLineId,
  };
}
