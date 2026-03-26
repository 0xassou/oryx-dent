/**
 * Onboarding : injection des 20 protocoles standards (données + stockage).
 * À appeler une seule fois après inscription (ex. callback post-signup côté client ou API).
 *
 * Ne modifie pas les pages : branchez `seedProtocolsOnFirstSignup` dans votre flux d’auth.
 */

import { v5 as uuidv5 } from "uuid";
import protocolsSeed from "@/data/protocols_seed.json";
import { CLINIC_NAMESPACE_UUID } from "@/lib/clinical/clinicNamespace";

export type SeedConsumable = { item: string; qte: number };

export type SeedProtocolRow = {
  nom: string;
  categorie: string;
  consommables_par_defaut: SeedConsumable[];
};

export type ProtocolForSettings = {
  id: string;
  nom: string;
  categorie: string;
  consommables: { id: string; nom: string; quantite: number }[];
};

/** Clé localStorage (ou équivalent) pour persister les protocoles « Réglages > Clinique ». */
export const PROTOCOLS_STORAGE_KEY = "dental_clinic_protocoles";

/** Empêche de réécraser les protocoles personnalisés à chaque connexion. */
export const PROTOCOLS_FIRST_SEED_FLAG_KEY =
  "dental_clinic_protocols_seed_applied_v3";

/** Format UUID RFC 4122 attendu par PostgreSQL (`clinical_protocols.id`, lignes consommables UI). */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidPostgresProtocolUuid(id: string): boolean {
  return UUID_REGEX.test(id.trim());
}

/**
 * Ancien format localStorage (`proto-…`, `p-…`, `c-…`) ou IDs non UUID → re-seed nécessaire.
 */
export function protocolsNeedRepair(protocols: ProtocolForSettings[]): boolean {
  for (const p of protocols) {
    if (!isValidPostgresProtocolUuid(p.id)) return true;
    for (const c of p.consommables) {
      if (!isValidPostgresProtocolUuid(c.id)) return true;
    }
  }
  return false;
}

/**
 * Transforme le JSON seed en objets prêts pour l’UI / PostgreSQL.
 * - Protocoles : UUID v5 (déterministe, aligné sur `scripts/seed-test-clinic.cjs` / Neon).
 *   On n’utilise pas `crypto.randomUUID()` ici : les IDs doivent rester stables entre appareils et
 *   correspondre aux lignes `clinical_protocols` en base.
 * - Lignes consommables (UI) : UUID v5 par (protocole + article + index) — les `stock_product_id`
 *   envoyés au serveur viennent toujours de `stockProductIdFromLabel` (TEXT en base, pas UUID).
 */
export function buildProtocolesFromSeed(): ProtocolForSettings[] {
  const rows = protocolsSeed.protocols as SeedProtocolRow[];
  return rows.map((p) => ({
    id: uuidv5(p.nom, CLINIC_NAMESPACE_UUID),
    nom: p.nom,
    categorie: p.categorie,
    consommables: p.consommables_par_defaut.map((c, i) => ({
      id: uuidv5(`${p.nom}|${c.item}|${i}`, CLINIC_NAMESPACE_UUID),
      nom: c.item,
      quantite: c.qte,
    })),
  }));
}

/**
 * Retourne le nombre de protocoles définis dans le fichier seed (20 attendus).
 */
export function getSeedProtocolCount(): number {
  return (protocolsSeed.protocols as SeedProtocolRow[]).length;
}

/**
 * Lit les protocoles déjà stockés (après seed ou édition utilisateur).
 */
export function loadProtocolsFromStorage(
  storage: Pick<Storage, "getItem">,
): ProtocolForSettings[] | null {
  try {
    const raw = storage.getItem(PROTOCOLS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    const list = Array.isArray(parsed)
      ? (parsed as ProtocolForSettings[])
      : null;
    if (!list || list.length === 0) return null;
    if (protocolsNeedRepair(list)) return null;
    return list;
  } catch {
    return null;
  }
}

export function saveProtocolsToStorage(
  storage: Pick<Storage, "setItem">,
  protocols: ProtocolForSettings[],
): void {
  try {
    storage.setItem(PROTOCOLS_STORAGE_KEY, JSON.stringify(protocols));
  } catch {
    // quota / mode privé
  }
}

/**
 * À appeler une fois après la première inscription réussie.
 * - Si le flag existe déjà, ne fait rien (retourne false).
 * - Sinon écrit les 20 protocoles + pose le flag (retourne true).
 */
export function seedProtocolsOnFirstSignup(
  storage: Pick<Storage, "getItem" | "setItem">,
): boolean {
  if (storage.getItem(PROTOCOLS_FIRST_SEED_FLAG_KEY) === "1") {
    return false;
  }
  const protocoles = buildProtocolesFromSeed();
  storage.setItem(PROTOCOLS_STORAGE_KEY, JSON.stringify(protocoles));
  storage.setItem(PROTOCOLS_FIRST_SEED_FLAG_KEY, "1");
  return true;
}

/**
 * Variante pour API Route / serveur : retourne le payload sans toucher au Storage.
 * Utile pour `INSERT` en base lors du `user.created`.
 */
export function getDefaultProtocolsPayloadForDatabase(): ProtocolForSettings[] {
  return buildProtocolesFromSeed();
}
