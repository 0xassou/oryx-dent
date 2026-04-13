/** Modèle unique « facture » (localStorage `dental_dashboard_docs`). */

export type FactureStatut = "Payé" | "Partiellement Payé" | "En attente";

export type FactureDocument = {
  id: string;
  date: string;
  patient: string;
  patientId?: string;
  montantTotal: number;
  montantPaye: number;
  /** Lien vers `FinanceLine.id` côté fiche patient */
  financeLineId?: string;
};

const LS_KEY = "dental_dashboard_docs";

export function deriveFactureStatut(
  montantTotal: number,
  montantPaye: number,
): FactureStatut {
  const total = Math.max(0, montantTotal);
  const paye = Math.max(0, Math.min(montantPaye, total));
  if (total <= 0) return "En attente";
  if (paye >= total) return "Payé";
  if (paye > 0) return "Partiellement Payé";
  return "En attente";
}

export function formatMontantDANumber(n: number): string {
  return `${new Intl.NumberFormat("fr-DZ", { maximumFractionDigits: 0 }).format(Math.round(n))} DA`;
}

function parseMontantDaString(s: string): number {
  const digits = s.replace(/\s/g, "").replace(/[^\d]/g, "");
  if (!digits) return 0;
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) ? n : 0;
}

function migrateLegacyItem(item: Record<string, unknown>): FactureDocument | null {
  if (!item || typeof item.id !== "string" || typeof item.date !== "string") {
    return null;
  }
  const patient =
    typeof item.patient === "string" ? item.patient : "";
  if (
    typeof item.montantTotal === "number" &&
    typeof item.montantPaye === "number"
  ) {
    return {
      id: item.id,
      date: item.date,
      patient,
      patientId:
        typeof item.patientId === "string" ? item.patientId : undefined,
      montantTotal: Math.max(0, item.montantTotal),
      montantPaye: Math.max(0, item.montantPaye),
      financeLineId:
        typeof item.financeLineId === "string"
          ? item.financeLineId
          : undefined,
    };
  }

  const total = parseMontantDaString(
    typeof item.montant === "string" ? item.montant : "",
  );
  const st = typeof item.statut === "string" ? item.statut : "";
  let paye = 0;
  if (st === "Payé" || st === "Payée") paye = total;
  else if (st === "Partiellement Payé") {
    paye = Math.floor(total / 2);
  }

  return {
    id: item.id,
    date: item.date,
    patient,
    patientId:
      typeof item.patientId === "string" ? item.patientId : undefined,
    montantTotal: total,
    montantPaye: paye,
    financeLineId:
      typeof item.financeLineId === "string"
        ? item.financeLineId
        : undefined,
  };
}

export function parseFacturesFromLocalStorage(
  raw: string | null,
): FactureDocument[] {
  if (raw == null || raw === "") return [];
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    const out: FactureDocument[] = [];
    for (const item of data) {
      if (!item || typeof item !== "object") continue;
      const doc = migrateLegacyItem(item as Record<string, unknown>);
      if (doc) out.push(doc);
    }
    return out;
  } catch (e) {
    console.error("Storage error:", e);
    return [];
  }
}

export function readFacturesFromStorage(): FactureDocument[] {
  if (typeof window === "undefined") return [];
  try {
    return parseFacturesFromLocalStorage(localStorage.getItem(LS_KEY));
  } catch (e) {
    console.error("Storage error:", e);
    return [];
  }
}

export function writeFacturesToStorage(docs: FactureDocument[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(docs));
  } catch (e) {
    console.error("Storage error:", e);
  }
}

export function resteAPayer(doc: FactureDocument): number {
  return Math.max(0, doc.montantTotal - doc.montantPaye);
}

/** Parse une date facture au format JJ/MM/AAAA (stockage page Factures). */
export function parseFactureDateFr(input: string): Date | null {
  const m = input.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const y = Number(m[3]);
  const dt = new Date(y, mo, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}
