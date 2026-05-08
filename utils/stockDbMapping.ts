import type { StockRow } from "@/lib/types/stocks-db";
import type { StockLine } from "@/utils/stockLogic";

type StockNotesMeta = {
  v?: number;
  gestion?: string;
  peremption?: string;
  quantiteMax?: number;
};

export function parseStockMeta(notes: string | null): {
  gestion: "unitaire" | "multidose";
  peremption: string;
  quantiteMax: number;
} {
  const fallback = {
    gestion: "unitaire" as const,
    peremption: "—",
    quantiteMax: 0,
  };
  if (!notes?.trim()) return fallback;
  try {
    const o = JSON.parse(notes) as StockNotesMeta;
    const gestion =
      o.gestion === "multidose"
        ? ("multidose" as const)
        : ("unitaire" as const);
    const peremption =
      typeof o.peremption === "string" && o.peremption.trim()
        ? o.peremption.trim()
        : "—";
    const quantiteMax =
      typeof o.quantiteMax === "number" && o.quantiteMax > 0
        ? Math.floor(o.quantiteMax)
        : 0;
    return { gestion, peremption, quantiteMax };
  } catch {
    return fallback;
  }
}

/** Ligne PostgreSQL → `StockLine` (UI / protocoles). */
export function stockRowToStockLine(row: StockRow): StockLine {
  const meta = parseStockMeta(row.notes);
  let quantiteMax = meta.quantiteMax;
  if (quantiteMax <= 0 && row.quantite_min > 0) {
    quantiteMax = Math.max(row.quantite_min * 2, row.quantite);
  }
  if (quantiteMax <= 0) {
    quantiteMax = Math.max(100, row.quantite || 100);
  }
  return {
    id: row.id,
    nom: row.nom,
    quantite: row.quantite,
    quantiteMax,
    categorie: row.categorie ?? "",
    peremption: (() => {
      let per = meta.peremption;
      if (!per || per === "—") return "—";
      if (/^\d{4}-\d{2}-\d{2}$/.test(per))
        return `${per}T00:00:00.000Z`;
      return per;
    })(),
    gestion: meta.gestion,
  };
}

/** Champs métier Stocks + JSON `notes` pour péremption / seuil UI / multidose. */
export function stockLineMetaToNotes(line: StockLine): string {
  const per =
    line.peremption === "—" || !line.peremption.trim()
      ? "—"
      : line.peremption;
  const payload = {
    v: 1,
    gestion: line.gestion === "multidose" ? "multidose" : "unitaire",
    peremption: per,
    quantiteMax: line.quantiteMax,
  };
  return JSON.stringify(payload);
}

export function stockLineToStockInput(line: StockLine): {
  nom: string;
  categorie: string | null;
  quantite: number;
  quantite_min: number;
  unite: string | null;
  prix_unitaire: number | null;
  fournisseur: string | null;
  notes: string;
} {
  return {
    nom: line.nom,
    categorie: line.categorie?.trim() || null,
    quantite: line.quantite,
    quantite_min:
      line.quantiteMax > 0
        ? Math.max(0, Math.floor(line.quantiteMax / 2))
        : 0,
    unite: "unité",
    prix_unitaire: null,
    fournisseur: null,
    notes: stockLineMetaToNotes(line),
  };
}
