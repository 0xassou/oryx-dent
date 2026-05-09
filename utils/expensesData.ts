/**
 * Dépenses cabinet : affichage mappé depuis PostgreSQL (`depenses`).
 */

import type { DepenseRow } from "@/app/actions/depenses";

export const DENTAL_EXPENSES_STORAGE_KEY = "dental_expenses_data";

/** Affichage dans le select : en tête, puis catégories historiques. */
export const EXPENSE_CATEGORIES = [
  "Produits & Stock",
  "Prothésiste / Labo",
  "Stock",
  "Labo",
  "Frais",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

const CATEGORY_SET: ReadonlySet<string> = new Set(EXPENSE_CATEGORIES);

export type DentalExpense = {
  id: string;
  /** ISO 8601 (date du jour de la dépense) */
  date: string;
  libelle: string;
  montant: number;
  categorie: ExpenseCategory;
  justificatif_url: string;
};

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

export function sumExpensesByCategory(
  items: DentalExpense[],
): Record<ExpenseCategory, number> {
  const acc = {} as Record<ExpenseCategory, number>;
  for (const c of EXPENSE_CATEGORIES) {
    acc[c] = 0;
  }
  for (const e of items) {
    if (e.categorie in acc) {
      acc[e.categorie] += e.montant;
    }
  }
  return acc;
}
