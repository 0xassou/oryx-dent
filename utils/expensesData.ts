/**
 * Dépenses cabinet (localStorage `dental_expenses_data`).
 */

export const DENTAL_EXPENSES_STORAGE_KEY = "dental_expenses_data";

export const EXPENSE_CATEGORIES = ["Stock", "Labo", "Frais"] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

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
  if (cat !== "Stock" && cat !== "Labo" && cat !== "Frais") return null;
  const just =
    typeof o.justificatif_url === "string" ? o.justificatif_url : "";
  return {
    id: o.id,
    date: o.date,
    libelle: o.libelle,
    montant,
    categorie: cat,
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
  const acc: Record<ExpenseCategory, number> = {
    Stock: 0,
    Labo: 0,
    Frais: 0,
  };
  for (const e of items) {
    acc[e.categorie] += e.montant;
  }
  return acc;
}
