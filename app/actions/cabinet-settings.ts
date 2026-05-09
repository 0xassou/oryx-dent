"use server";

import { unstable_cache, revalidateTag } from "next/cache";
import { getPostgresPool } from "@/lib/server/db/pool";
import { requireBetterAuthSession } from "@/lib/server/auth/require-session";
import { logServerError } from "@/lib/server/logger";

const CABINET_ROW_ID = "default";
const CABINET_SETTINGS_CACHE_TAG = "cabinet-settings";

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
    return { ok: true, data };
  } catch (e) {
    logServerError("getCabinetSettingsAction", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Impossible de charger les réglages.",
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
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Impossible d’enregistrer les réglages.",
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
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Impossible d’enregistrer les réglages.",
    };
  }
}
