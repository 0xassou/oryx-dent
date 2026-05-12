"use server";

import { getPostgresPool } from "@/lib/server/db/pool";
import { requireBetterAuthSession } from "@/lib/server/auth/require-session";
import { logServerError } from "@/lib/server/logger";
import { revalidateTag } from "next/cache";
import {
  dataUrlApproxBytes,
  isAcceptedRadioMime,
  parseRadio,
  RADIO_MAX_BYTES,
  sortRadios,
  type PatientRadio,
} from "@/utils/patientRadios.shared";

// ---------------------------------------------------------------------------
// Constantes partagées avec cabinet-settings.ts
// ---------------------------------------------------------------------------
const CABINET_ROW_ID = "default";
const CABINET_SETTINGS_CACHE_TAG = "cabinet-settings";
const DENTAL_PATIENT_RADIOS_KEY = "dental_patient_radios";

type ActionOk<T> = { ok: true; data: T } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Lecture / écriture du store radios en DB
// ---------------------------------------------------------------------------

async function loadRadiosStore(): Promise<Record<string, unknown>> {
  const pool = getPostgresPool();
  const { rows } = await pool.query<{ settings: unknown }>(
    `SELECT settings FROM cabinet_settings WHERE id = $1`,
    [CABINET_ROW_ID],
  );
  if (rows.length === 0) return {};
  const raw = rows[0]!.settings;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const settings = raw as Record<string, unknown>;
  const store = settings[DENTAL_PATIENT_RADIOS_KEY];
  if (!store || typeof store !== "object" || Array.isArray(store)) return {};
  return store as Record<string, unknown>;
}

async function persistRadiosForPatient(
  patientId: string,
  radios: PatientRadio[],
): Promise<void> {
  const pool = getPostgresPool();
  // Fusion JSONB : met à jour uniquement la clé dental_patient_radios,
  // en préservant tout le reste du settings JSONB.
  await pool.query(
    `
    INSERT INTO cabinet_settings (id, settings, updated_at)
    VALUES ($1, jsonb_build_object($2::text, jsonb_build_object($3::text, $4::jsonb)), NOW())
    ON CONFLICT (id) DO UPDATE SET
      settings = cabinet_settings.settings
                 || jsonb_build_object($2::text,
                      COALESCE((cabinet_settings.settings -> $2::text), '{}'::jsonb)
                      || jsonb_build_object($3::text, $4::jsonb)),
      updated_at = NOW()
    `,
    [
      CABINET_ROW_ID,
      DENTAL_PATIENT_RADIOS_KEY,
      patientId,
      JSON.stringify(radios),
    ],
  );
  revalidateTag(CABINET_SETTINGS_CACHE_TAG, "max");
}

// ---------------------------------------------------------------------------
// Actions publiques
// ---------------------------------------------------------------------------

/**
 * Retourne la liste des radios d'un patient, triée par date décroissante.
 */
export async function getRadiosAction(
  patientId: string,
): Promise<ActionOk<PatientRadio[]>> {
  const auth = await requireBetterAuthSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const pid = patientId.trim();
  if (!pid) return { ok: false, error: "patientId requis." };
  try {
    const store = await loadRadiosStore();
    const raw = store[pid];
    if (!Array.isArray(raw)) return { ok: true, data: [] };
    const parsed: PatientRadio[] = [];
    for (const item of raw) {
      const r = parseRadio(item);
      if (r) parsed.push(r);
    }
    return { ok: true, data: sortRadios(parsed) };
  } catch (e) {
    logServerError("getRadiosAction", e);
    return { ok: false, error: "Une erreur est survenue." };
  }
}

export type CreateRadioInput = {
  /** data URL base64 */
  url: string;
  mimeType: string;
  fileName: string;
  /** YYYY-MM-DD */
  date: string;
  tooth: string | null;
  note: string | null;
};

/**
 * Ajoute une radio pour un patient.
 * Valide le MIME, la taille (~10 Mo) et l'authentification.
 */
export async function createRadioAction(
  patientId: string,
  input: CreateRadioInput,
): Promise<ActionOk<PatientRadio>> {
  const auth = await requireBetterAuthSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const pid = patientId.trim();
  if (!pid) return { ok: false, error: "patientId requis." };

  if (!isAcceptedRadioMime(input.mimeType)) {
    return {
      ok: false,
      error: "Format non accepté. Utilisez JPG, PNG, WEBP ou PDF.",
    };
  }
  if (!input.url.startsWith("data:")) {
    return { ok: false, error: "URL invalide (data URL attendu)." };
  }
  const approxBytes = dataUrlApproxBytes(input.url);
  if (approxBytes > RADIO_MAX_BYTES) {
    return { ok: false, error: "Fichier trop volumineux (max 10 Mo)." };
  }
  if (!input.fileName.trim()) {
    return { ok: false, error: "Nom de fichier requis." };
  }
  if (!input.date || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    return { ok: false, error: "Date invalide (YYYY-MM-DD attendu)." };
  }

  try {
    const store = await loadRadiosStore();
    const existing = store[pid];
    const prev: PatientRadio[] = Array.isArray(existing)
      ? (existing
          .map((x) => parseRadio(x))
          .filter((r): r is PatientRadio => r !== null))
      : [];

    const radio: PatientRadio = {
      id: `radio-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      url: input.url,
      mimeType: input.mimeType,
      fileName: input.fileName.trim(),
      date: input.date,
      tooth: input.tooth?.trim() || null,
      note: input.note?.trim() || null,
      createdAt: new Date().toISOString(),
    };

    await persistRadiosForPatient(pid, [...prev, radio]);
    return { ok: true, data: radio };
  } catch (e) {
    logServerError("createRadioAction", e);
    return { ok: false, error: "Une erreur est survenue." };
  }
}

/**
 * Supprime une radio d'un patient.
 */
export async function deleteRadioAction(
  patientId: string,
  radioId: string,
): Promise<ActionOk<void>> {
  const auth = await requireBetterAuthSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const pid = patientId.trim();
  const rid = radioId.trim();
  if (!pid || !rid) return { ok: false, error: "patientId et radioId requis." };
  try {
    const store = await loadRadiosStore();
    const existing = store[pid];
    const prev: PatientRadio[] = Array.isArray(existing)
      ? (existing
          .map((x) => parseRadio(x))
          .filter((r): r is PatientRadio => r !== null))
      : [];

    const next = prev.filter((r) => r.id !== rid);
    await persistRadiosForPatient(pid, next);
    return { ok: true, data: undefined };
  } catch (e) {
    logServerError("deleteRadioAction", e);
    return { ok: false, error: "Une erreur est survenue." };
  }
}
