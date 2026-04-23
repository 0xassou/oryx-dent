/**
 * Dépenses cabinet (localStorage `dental_expenses_data`).
 */

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

function parseExpense(raw: unknown): DentalExpense | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.date !== "string") return null;
  if (typeof o.libelle !== "string") return null;
  const montant =
    typeof o.montant === "number"
      ? o.montant
      : Number(o.montant);
  if (!Number.isFinite(montant) || montant < 0) return null;
  const cat = o.categorie;
  if (typeof cat !== "string" || !CATEGORY_SET.has(cat)) return null;
  const just =
    typeof o.justificatif_url === "string" ? o.justificatif_url : "";
  return {
    id: o.id,
    date: o.date,
    libelle: o.libelle,
    montant,
    categorie: cat as ExpenseCategory,
    justificatif_url: just,
  };
}

export function readExpensesFromStorage(): DentalExpense[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(DENTAL_EXPENSES_STORAGE_KEY);
    if (raw == null || raw === "") return [];
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    const out: DentalExpense[] = [];
    for (const item of data) {
      const e = parseExpense(item);
      if (e) out.push(e);
    }
    return out;
  } catch (e) {
    console.error("Storage error:", e);
    return [];
  }
}

export function writeExpensesToStorage(items: DentalExpense[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DENTAL_EXPENSES_STORAGE_KEY, JSON.stringify(items));
  } catch (e) {
    console.error("Storage error:", e);
  }
}

export function addExpenseToStorage(
  partial: Omit<DentalExpense, "id">,
): DentalExpense {
  const id = `exp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const row: DentalExpense = { id, ...partial };
  const list = readExpensesFromStorage();
  list.unshift(row);
  writeExpensesToStorage(list);
  return row;
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
