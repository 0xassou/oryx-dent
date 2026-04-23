/**
 * Logique métier : déduction de stock à partir d'un acte clinique et de protocoles.
 */

import protocolsSeed from "@/data/protocols_seed.json";

export const STOCK_UPDATED_EVENT = "dental-stock-updated";

export type StockLine = {
  id: string;
  nom: string;
  quantite: number;
  quantiteMax: number;
  categorie: string;
  peremption: string;
  /** Multidose : pas de déduction auto dans `consumeStockForAct` (tubes, flacons, etc.). */
  gestion?: "unitaire" | "multidose";
};

export type ProtocolItem = { productId: string; quantity: number };

/** Carte acte clinique → consommations par id produit (alignés sur les mocks stocks). */
export type ActProtocolMap = Record<string, ProtocolItem[]>;

/** Même clé que dans app/(dashboard)/stocks/page.tsx */
export const DENTAL_STOCK_LS_KEY = "dental_stock";

/** Carte acte → consommations (protocoles « fauteuil ») persistée côté client. */
export const DENTAL_PROTOCOLS_LS_KEY = "dental_protocols";

/**
 * Protocoles par libellé d'acte : chaque clé DOIT être identique au champ `nom`
 * du même protocole dans `data/protocols_seed.json` (car `consumeStockForAct` reçoit
 * `protocol.nom` depuis le cockpit patient). Ex. vernis : « Application de vernis fluoré »
 * (et non « fluorité »).
 */
export const DEFAULT_ACT_PROTOCOLS: ActProtocolMap = {
  "Consultation Initiale / Bilan complet": [
    { productId: "5", quantity: 2 },
    { productId: "6", quantity: 1 },
    { productId: "10", quantity: 1 },
  ],
  "Détartrage & Polissage": [
    { productId: "10", quantity: 3 },
    { productId: "5", quantity: 2 },
    { productId: "6", quantity: 1 },
  ],
  "Scellement de sillons (Sealants)": [
    { productId: "9", quantity: 1 },
    { productId: "1", quantity: 1 },
    { productId: "5", quantity: 2 },
    { productId: "10", quantity: 2 },
  ],
  "Application de vernis fluoré": [
    { productId: "11", quantity: 1 },
    { productId: "10", quantity: 2 },
    { productId: "5", quantity: 1 },
  ],
  "Restauration Composite 1 face": [
    { productId: "1", quantity: 1 },
    { productId: "3", quantity: 1 },
    { productId: "5", quantity: 2 },
  ],
  "Restauration Composite 2 faces ou +": [
    { productId: "1", quantity: 1 },
    { productId: "3", quantity: 1 },
    { productId: "5", quantity: 2 },
  ],
  "Composite Antérieur / Stratification esthétique": [
    { productId: "1", quantity: 1 },
    { productId: "3", quantity: 1 },
    { productId: "5", quantity: 2 },
  ],
  "Reconstitution au Verre Ionomère (CVI)": [
    { productId: "9", quantity: 1 },
    { productId: "3", quantity: 1 },
    { productId: "5", quantity: 2 },
  ],
  "Coiffage pulpaire (Biodentine ou Hydroxyde de calcium)": [
    { productId: "3", quantity: 1 },
    { productId: "9", quantity: 1 },
    { productId: "10", quantity: 2 },
    { productId: "5", quantity: 2 },
  ],
  "Traitement d'urgence (pansement provisoire)": [
    { productId: "9", quantity: 1 },
    { productId: "10", quantity: 2 },
    { productId: "3", quantity: 1 },
  ],
  "Biopulpectomie Mono-radiculaire": [
    { productId: "3", quantity: 1 },
    { productId: "5", quantity: 2 },
    { productId: "10", quantity: 2 },
    { productId: "11", quantity: 1 },
  ],
  "Biopulpectomie Pluri-radiculaire": [
    { productId: "3", quantity: 2 },
    { productId: "5", quantity: 2 },
    { productId: "10", quantity: 2 },
  ],
  "Empreinte Primaire": [
    { productId: "10", quantity: 2 },
    { productId: "5", quantity: 1 },
    { productId: "6", quantity: 1 },
  ],
  "Empreinte Secondaire Silicone": [
    { productId: "10", quantity: 2 },
    { productId: "5", quantity: 1 },
    { productId: "6", quantity: 1 },
  ],
  "Préparation pour Couronne & Couronne Provisoire": [
    { productId: "1", quantity: 1 },
    { productId: "9", quantity: 1 },
    { productId: "3", quantity: 1 },
    { productId: "5", quantity: 2 },
  ],
  "Scellement définitif": [
    { productId: "9", quantity: 1 },
    { productId: "10", quantity: 2 },
    { productId: "5", quantity: 1 },
  ],
  "Extraction Simple": [
    { productId: "3", quantity: 1 },
    { productId: "5", quantity: 2 },
    { productId: "11", quantity: 1 },
  ],
  "Extraction Chirurgicale": [
    { productId: "3", quantity: 2 },
    { productId: "5", quantity: 2 },
    { productId: "10", quantity: 2 },
    { productId: "6", quantity: 1 },
  ],
  "Pose d'implant - 1er temps": [
    { productId: "7", quantity: 1 },
    { productId: "3", quantity: 1 },
    { productId: "5", quantity: 2 },
  ],
  "Contrôle post-opératoire / Dépose de fils": [
    { productId: "5", quantity: 1 },
    { productId: "10", quantity: 2 },
    { productId: "11", quantity: 1 },
  ],
};

if (process.env.NODE_ENV !== "production") {
  const seedNoms = (protocolsSeed.protocols as { nom: string }[]).map(
    (p) => p.nom,
  );
  const mapKeys = Object.keys(DEFAULT_ACT_PROTOCOLS);
  for (const n of seedNoms) {
    if (!mapKeys.includes(n)) {
      console.error(
        "[stockLogic] DEFAULT_ACT_PROTOCOLS manque la clé alignée sur le seed :",
        n,
      );
    }
  }
  for (const k of mapKeys) {
    if (!seedNoms.includes(k)) {
      console.error(
        "[stockLogic] DEFAULT_ACT_PROTOCOLS contient une clé absente du seed :",
        k,
      );
    }
  }
}

/** Copie initiale si aucun stock en localStorage (cohérent avec la page Stocks). */
export const INITIAL_STOCK_FALLBACK: StockLine[] = [
  {
    id: "1",
    nom: "Résine Composite A2 - Filtek",
    categorie: "Composites",
    gestion: "multidose",
    quantite: 34,
    quantiteMax: 50,
    peremption: "2026-10-12T00:00:00.000Z",
  },
  {
    id: "2",
    nom: "Résine Composite B1 - Filtek",
    categorie: "Composites",
    gestion: "multidose",
    quantite: 8,
    quantiteMax: 50,
    peremption: "2026-08-05T00:00:00.000Z",
  },
  {
    id: "3",
    nom: "Articaïne 4% - Septanest",
    categorie: "Anesthésiques",
    gestion: "unitaire",
    quantite: 120,
    quantiteMax: 200,
    peremption: "2027-01-22T00:00:00.000Z",
  },
  {
    id: "4",
    nom: "Lidocaïne 2% - Xylocaïne",
    categorie: "Anesthésiques",
    gestion: "unitaire",
    quantite: 0,
    quantiteMax: 100,
    peremption: "—",
  },
  {
    id: "5",
    nom: "Gants nitrile (M) - Medicom",
    categorie: "Consommables",
    gestion: "unitaire",
    quantite: 450,
    quantiteMax: 500,
    peremption: "2027-06-30T00:00:00.000Z",
  },
  {
    id: "6",
    nom: "Masques chirurgicaux - Kolmi",
    categorie: "Consommables",
    gestion: "unitaire",
    quantite: 15,
    quantiteMax: 200,
    peremption: "2026-04-15T00:00:00.000Z",
  },
  {
    id: "7",
    nom: "Implant Straumann BLT Ø4.1",
    categorie: "Implants",
    gestion: "unitaire",
    quantite: 6,
    quantiteMax: 20,
    peremption: "2027-12-18T00:00:00.000Z",
  },
  {
    id: "8",
    nom: "Implant Nobel Active Ø3.5",
    categorie: "Implants",
    gestion: "unitaire",
    quantite: 0,
    quantiteMax: 15,
    peremption: "—",
  },
  {
    id: "9",
    nom: "Ciment verre-ionomère - GC Fuji",
    categorie: "Composites",
    gestion: "multidose",
    quantite: 22,
    quantiteMax: 40,
    peremption: "2026-09-09T00:00:00.000Z",
  },
  {
    id: "10",
    nom: "Rouleaux de coton salivaire",
    categorie: "Consommables",
    gestion: "unitaire",
    quantite: 3,
    quantiteMax: 300,
    peremption: "2026-05-01T00:00:00.000Z",
  },
  {
    id: "11",
    nom: "Anesthésique topique - Hurricaine",
    categorie: "Anesthésiques",
    gestion: "multidose",
    quantite: 18,
    quantiteMax: 30,
    peremption: "2026-11-20T00:00:00.000Z",
  },
  {
    id: "12",
    nom: "Pilier implantaire Ø4.1",
    categorie: "Implants",
    gestion: "unitaire",
    quantite: 0,
    quantiteMax: 10,
    peremption: "—",
  },
];

export function loadDentalStock(): StockLine[] {
  if (typeof window === "undefined") return INITIAL_STOCK_FALLBACK.map((p) => ({ ...p }));
  try {
    const raw = localStorage.getItem(DENTAL_STOCK_LS_KEY);
    if (!raw) return INITIAL_STOCK_FALLBACK.map((p) => ({ ...p }));
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return INITIAL_STOCK_FALLBACK.map((p) => ({ ...p }));
    return parsed as StockLine[];
  } catch (e) {
    console.error("Storage error:", e);
    return INITIAL_STOCK_FALLBACK.map((p) => ({ ...p }));
  }
}

export function saveDentalStock(stock: StockLine[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DENTAL_STOCK_LS_KEY, JSON.stringify(stock));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(STOCK_UPDATED_EVENT));
    }
  } catch (e) {
    console.error("Storage error:", e);
  }
}

/**
 * Charge la carte acte → consommations depuis le localStorage, ou le modèle par défaut.
 */
export function loadProtocols(): ActProtocolMap {
  if (typeof window === "undefined") return { ...DEFAULT_ACT_PROTOCOLS };
  try {
    const raw = localStorage.getItem(DENTAL_PROTOCOLS_LS_KEY);
    if (!raw) return { ...DEFAULT_ACT_PROTOCOLS };
    const parsed = JSON.parse(raw) as unknown;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return { ...DEFAULT_ACT_PROTOCOLS };
    }
    return parsed as ActProtocolMap;
  } catch (e) {
    console.error("Storage error:", e);
    return { ...DEFAULT_ACT_PROTOCOLS };
  }
}

/** Indique si un produit apparaît dans au moins un protocole d’acte (consommations fauteuil). */
export function isProductLinkedToProtocol(
  productId: string,
  protocols: ActProtocolMap,
): boolean {
  for (const items of Object.values(protocols)) {
    if (!Array.isArray(items)) continue;
    if (items.some((i) => i.productId === productId)) return true;
  }
  return false;
}

export function saveProtocols(protocols: ActProtocolMap): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      DENTAL_PROTOCOLS_LS_KEY,
      JSON.stringify(protocols),
    );
  } catch (e) {
    console.error("Storage error:", e);
  }
}

/**
 * Applique le protocole de l'acte : décrémente les quantités (plancher à 0).
 * Retourne un nouveau tableau (immuabilité).
 */
export function consumeStockForAct(
  actName: string,
  currentStock: StockLine[],
  protocols: ActProtocolMap
): StockLine[] {
  const items = protocols[actName];
  if (!items?.length) {
    return currentStock.map((p) => ({ ...p }));
  }

  const byId = new Map(currentStock.map((p) => [p.id, { ...p }]));

  for (const { productId, quantity } of items) {
    const row = byId.get(productId);
    if (!row) continue;
    if (row.gestion === "multidose") continue;
    row.quantite = Math.max(0, row.quantite - quantity);
  }

  return currentStock.map((p) => {
    const updated = byId.get(p.id);
    return updated ? { ...updated } : { ...p };
  });
}
