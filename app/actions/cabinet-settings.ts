"use server";

import { unstable_cache, revalidateTag } from "next/cache";
import { getPostgresPool } from "@/lib/server/db/pool";
import { requireBetterAuthSession } from "@/lib/server/auth/require-session";
import { logServerError } from "@/lib/server/logger";

const CABINET_ROW_ID = "default";
const CABINET_SETTINGS_CACHE_TAG = "cabinet-settings";

/**
 * Protocoles dentaires standards algériens - tarifs par défaut
 * Chargés automatiquement si la liste est vide (premier démarrage)
 */
export const DEFAULT_ACTES_TARIFS = [
  // Omnipratique
  { categorie: "Omnipratique", acte: "Consultation/Examen", prix: 500 },
  { categorie: "Omnipratique", acte: "Détartrage", prix: 1500 },
  { categorie: "Omnipratique", acte: "Extraction simple", prix: 2000 },
  { categorie: "Omnipratique", acte: "Extraction chirurgicale", prix: 4000 },
  { categorie: "Omnipratique", acte: "Traitement canalaire (monoradiculé)", prix: 4000 },
  { categorie: "Omnipratique", acte: "Traitement canalaire (pluriradiculé)", prix: 6000 },
  { categorie: "Omnipratique", acte: "Obturation composite (1 face)", prix: 2500 },
  { categorie: "Omnipratique", acte: "Obturation composite (2 faces)", prix: 3500 },
  { categorie: "Omnipratique", acte: "Obturation composite (3 faces)", prix: 4500 },
  { categorie: "Omnipratique", acte: "Scellement de sillon", prix: 1000 },
  // Prothèse
  { categorie: "Prothèse", acte: "Couronne céramo-métallique", prix: 15000 },
  { categorie: "Prothèse", acte: "Couronne zircone", prix: 25000 },
  { categorie: "Prothèse", acte: "Bridge 3 éléments", prix: 35000 },
  { categorie: "Prothèse", acte: "Prothèse amovible partielle", prix: 20000 },
  { categorie: "Prothèse", acte: "Prothèse amovible totale", prix: 25000 },
  // Orthodontie
  { categorie: "Orthodontie", acte: "Bilan orthodontique", prix: 2000 },
  { categorie: "Orthodontie", acte: "Appareil fixe (arcade)", prix: 45000 },
  { categorie: "Orthodontie", acte: "Gouttière transparente", prix: 35000 },
  { categorie: "Orthodontie", acte: "Contention", prix: 5000 },
  // Parodontologie
  { categorie: "Parodontologie", acte: "Détartrage + surfaçage radiculaire", prix: 3000 },
  { categorie: "Parodontologie", acte: "Chirurgie parodontale", prix: 8000 },
  // Implantologie
  { categorie: "Implantologie", acte: "Implant dentaire", prix: 60000 },
  { categorie: "Implantologie", acte: "Couronne sur implant", prix: 20000 },
] as const;

async function loadCabinetSettingsPayload(): Promise<Record<string, unknown>> {
  const pool = getPostgresPool();
  const { rows } = await pool.query<{ settings: unknown }>(
    `SELECT settings FROM cabinet_settings WHERE id = $1`,
    [CABINET_ROW_ID],
  );
  if (rows.length === 0) return {};
  const raw = rows[0]!.settings;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return { ...(raw as Record<string, unknown>) };
  }
  return {};
}

const getCabinetSettingsCached = unstable_cache(loadCabinetSettingsPayload, ["cabinet-settings-v1"], {
  revalidate: 60,
  tags: [CABINET_SETTINGS_CACHE_TAG],
});

export type CabinetSettingsOk<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Lit le JSON des réglages cabinet (équivalent historique `dental_settings` + clés UI).
 */
export async function getCabinetSettingsAction(): Promise<
  CabinetSettingsOk<Record<string, unknown>>
> {
  const auth = await requireBetterAuthSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  try {
    const data = await getCabinetSettingsCached();

    // Si actesTarifs est vide ou undefined, injecter les protocoles par défaut
    const actesTarifs = data.actesTarifs;
    const hasActes = Array.isArray(actesTarifs) && actesTarifs.length > 0;
    if (!hasActes) {
      return {
        ok: true,
        data: { ...data, actesTarifs: [...DEFAULT_ACTES_TARIFS] },
      };
    }

    return { ok: true, data };
  } catch (e) {
    logServerError("getCabinetSettingsAction", e);
    console.error(e);
    return {
      ok: false,
      error: "Une erreur est survenue.",
    };
  }
}

/**
 * Fusion superficielle des clés (jsonb || en base).
 */
export async function mergeCabinetSettingsAction(
  partial: Record<string, unknown>,
): Promise<CabinetSettingsOk<Record<string, unknown>>> {
  const auth = await requireBetterAuthSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  try {
    const pool = getPostgresPool();
    await pool.query(
      `
      INSERT INTO cabinet_settings (id, settings, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (id) DO UPDATE SET
        settings = cabinet_settings.settings || EXCLUDED.settings,
        updated_at = NOW()
      `,
      [CABINET_ROW_ID, JSON.stringify(partial)],
    );
    revalidateTag(CABINET_SETTINGS_CACHE_TAG, "max");
    const r = await getCabinetSettingsAction();
    return r.ok ? r : { ok: false, error: r.error };
  } catch (e) {
    logServerError("mergeCabinetSettingsAction", e);
    console.error(e);
    return {
      ok: false,
      error: "Une erreur est survenue.",
    };
  }
}

/**
 * Remplace entièrement le document (ex. sauvegarde depuis l’écran Réglages).
 */
export async function replaceCabinetSettingsAction(
  settings: Record<string, unknown>,
): Promise<CabinetSettingsOk<void>> {
  const auth = await requireBetterAuthSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  try {
    const pool = getPostgresPool();
    await pool.query(
      `
      INSERT INTO cabinet_settings (id, settings, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (id) DO UPDATE SET
        settings = EXCLUDED.settings,
        updated_at = NOW()
      `,
      [CABINET_ROW_ID, JSON.stringify(settings)],
    );
    revalidateTag(CABINET_SETTINGS_CACHE_TAG, "max");
    return { ok: true, data: undefined };
  } catch (e) {
    logServerError("replaceCabinetSettingsAction", e);
    console.error(e);
    return {
      ok: false,
      error: "Une erreur est survenue.",
    };
  }
}
