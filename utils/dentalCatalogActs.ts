/** Catalogue d'actes dentaires (JSONB cabinet `dental_catalog_acts`). */

"use client";

import { getCabinetValue, persistCabinetPartial } from "@/lib/client/cabinetBlob";

export const DENTAL_CATALOG_ACTS_KEY = "dental_catalog_acts";

export type DentalCatalogCategory = "Chirurgie" | "Soins" | "Prothèse";

export type DentalCatalogAct = {
  id: string;
  nom: string;
  categorie: DentalCatalogCategory;
  prix_par_defaut: number;
};

const CATEGORIES: DentalCatalogCategory[] = ["Chirurgie", "Soins", "Prothèse"];

function isCategory(x: string): x is DentalCatalogCategory {
  return CATEGORIES.includes(x as DentalCatalogCategory);
}

export const DEFAULT_CATALOG_SEED: DentalCatalogAct[] = [
  {
    id: "cat-consultation",
    nom: "Consultation",
    categorie: "Soins",
    prix_par_defaut: 2000,
  },
  {
    id: "cat-detartrage",
    nom: "Détartrage",
    categorie: "Soins",
    prix_par_defaut: 4500,
  },
  {
    id: "cat-extraction",
    nom: "Extraction",
    categorie: "Chirurgie",
    prix_par_defaut: 3000,
  },
  {
    id: "cat-composite",
    nom: "Composite",
    categorie: "Soins",
    prix_par_defaut: 6000,
  },
];

function normalizeAct(raw: unknown): DentalCatalogAct | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : "";
  const nom = typeof o.nom === "string" ? o.nom.trim() : "";
  const cat = typeof o.categorie === "string" ? o.categorie : "";
  const prix =
    typeof o.prix_par_defaut === "number" && Number.isFinite(o.prix_par_defaut)
      ? o.prix_par_defaut
      : Number.NaN;
  if (!id || !nom || !isCategory(cat) || !Number.isFinite(prix) || prix < 0) {
    return null;
  }
  return { id, nom, categorie: cat, prix_par_defaut: Math.round(prix) };
}

export function readCatalogFromStorage(): DentalCatalogAct[] {
  if (typeof window === "undefined") return [...DEFAULT_CATALOG_SEED];
  try {
    const parsed = getCabinetValue<unknown>(DENTAL_CATALOG_ACTS_KEY);
    if (parsed == null) return [...DEFAULT_CATALOG_SEED];
    if (!Array.isArray(parsed)) return [...DEFAULT_CATALOG_SEED];
    const out = parsed
      .map(normalizeAct)
      .filter((x): x is DentalCatalogAct => x !== null);
    return out.length > 0 ? out : [...DEFAULT_CATALOG_SEED];
  } catch {
    return [...DEFAULT_CATALOG_SEED];
  }
}

export function writeCatalogToStorage(acts: DentalCatalogAct[]): void {
  if (typeof window === "undefined") return;
  void persistCabinetPartial({ [DENTAL_CATALOG_ACTS_KEY]: acts });
}

/** Initialise le stockage avec les tarifs de référence si la clé est absente ou vide. */
export function ensureCatalogSeeded(): DentalCatalogAct[] {
  if (typeof window === "undefined") return [...DEFAULT_CATALOG_SEED];
  const parsed = getCabinetValue<unknown>(DENTAL_CATALOG_ACTS_KEY);
  if (parsed == null || (Array.isArray(parsed) && parsed.length === 0)) {
    const seed = [...DEFAULT_CATALOG_SEED];
    writeCatalogToStorage(seed);
    return seed;
  }
  const acts = readCatalogFromStorage();
  if (acts.length === 0) {
    const seed = [...DEFAULT_CATALOG_SEED];
    writeCatalogToStorage(seed);
    return seed;
  }
  return acts;
}

export function newCatalogActId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `act-${crypto.randomUUID()}`;
  }
  return `act-${Math.random().toString(16).slice(2)}`;
}
