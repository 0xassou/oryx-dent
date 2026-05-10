/**
 * Dépenses cabinet : affichage mappé depuis PostgreSQL (`depenses`).
 */

import type { DepenseRow } from "@/app/actions/depenses";

export const DENTAL_EXPENSES_STORAGE_KEY = "dental_expenses_data";

/** Anciennes catégories UI (données historiques) ; préférer EXPENSE_BUCKETS + getExpenseBucket. */
export const EXPENSE_CATEGORIES = [
  "Produits & Stock",
  "Prothésiste / Labo",
  "Stock",
  "Labo",
  "Frais",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

const CATEGORY_SET: ReadonlySet<string> = new Set(EXPENSE_CATEGORIES);

/** Libellés des parts du camembert « Dépenses » sur le tableau de bord Finances. */
export const EXPENSE_BUCKETS = [
  "Charges fixes",
  "Personnel",
  "Matériel & consommables",
  "Laboratoire & prothèses",
  "Autres",
] as const;

export type ExpenseBucket = (typeof EXPENSE_BUCKETS)[number];

export type DentalExpense = {
  id: string;
  /** ISO 8601 (date du jour de la dépense) */
  date: string;
  libelle: string;
  montant: number;
  categorie: ExpenseCategory;
  justificatif_url: string;
};

/**
 * Regroupe une catégorie brute (DB ou legacy) pour les graphiques dashboard.
 */
export function getExpenseBucket(categorie: string): ExpenseBucket {
  const c = String(categorie ?? "").trim();

  if (c === "Produits & Stock" || c === "Stock") {
    return "Matériel & consommables";
  }
  if (c === "Prothésiste / Labo" || c === "Labo") {
    return "Laboratoire & prothèses";
  }
  if (c === "Frais") {
    return "Autres";
  }

  if (
    c === "Loyer" ||
    c === "Electricité/Eau/Gaz" ||
    c === "Maintenance"
  ) {
    return "Charges fixes";
  }
  if (c === "Salaires" || c === "Charges sociales") {
    return "Personnel";
  }
  if (c === "Matériel médical" || c === "Consommables") {
    return "Matériel & consommables";
  }
  if (c === "Laboratoire") {
    return "Laboratoire & prothèses";
  }
  if (c === "Formation" || c === "Autre") {
    return "Autres";
  }

  return "Autres";
}

export function sumExpensesByBucket(
  items: Array<{ categorie: string; montant: number }>,
): Record<ExpenseBucket, number> {
  const acc = {} as Record<ExpenseBucket, number>;
  for (const b of EXPENSE_BUCKETS) {
    acc[b] = 0;
  }
  for (const e of items) {
    const bucket = getExpenseBucket(e.categorie);
    acc[bucket] += e.montant;
  }
  return acc;
}

/**
 * @deprecated Préférer les lignes `DepenseRow` + getExpenseBucket / sumExpensesByBucket
 * pour les graphiques ; ce mapping forçait les catégories hors inventaire vers "Frais".
 */
export function depenseRowToDentalExpense(row: DepenseRow): DentalExpense {
  const montant = Math.round(parseFloat(String(row.montant)) || 0);
  const desc = (row.description ?? "").trim();
  const catRaw = String(row.categorie ?? "").trim();
  const categorie: ExpenseCategory = CATEGORY_SET.has(catRaw)
    ? (catRaw as ExpenseCategory)
    : "Frais";
  const day =
    row.date.length >= 10
      ? row.date.slice(0, 10)
      : new Date().toISOString().slice(0, 10);
  return {
    id: row.id,
    date: `${day}T12:00:00.000Z`,
    libelle: desc || "Dépense",
    montant,
    categorie,
    justificatif_url: row.justificatif ?? "",
  };
}
