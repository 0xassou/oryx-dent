"use server";

import { getPostgresPool } from "@/lib/server/db/pool";
import { requireBetterAuthSession } from "@/lib/server/auth/require-session";
import { resolveCabinetActorSnapshot } from "@/lib/server/cabinet-actor";
import { logCabinetAuditSafe } from "@/lib/server/cabinet-audit";
import { mergeActsWithAuditTrail } from "@/lib/server/patient-ui-acts-audit";
import { logServerError } from "@/lib/server/logger";

export type PatientUiStateOk<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** État UI par patient (profil étendu, actes cockpit, finances locales, etc.) */
export async function getPatientUiStateAction(
  patientId: string,
): Promise<PatientUiStateOk<Record<string, unknown>>> {
  const auth = await requireBetterAuthSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const pid = patientId.trim();
  if (!pid) return { ok: false, error: "patientId requis." };
  try {
    const pool = getPostgresPool();
    const { rows } = await pool.query<{ state: unknown }>(
      `SELECT state FROM patient_ui_state WHERE patient_id = $1`,
      [pid],
    );
    if (rows.length === 0) return { ok: true, data: {} };
    const raw = rows[0]!.state;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      return { ok: true, data: { ...(raw as Record<string, unknown>) } };
    }
    return { ok: true, data: {} };
  } catch (e) {
    logServerError("getPatientUiStateAction", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Impossible de charger l’état patient.",
    };
  }
}

/**
 * Fusion superficielle des clés dans `state` (profile, acts, finances, watched, protocols, sterilization…).
 */
export async function mergePatientUiStateAction(
  patientId: string,
  partial: Record<string, unknown>,
): Promise<PatientUiStateOk<void>> {
  const auth = await requireBetterAuthSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const pid = patientId.trim();
  if (!pid) return { ok: false, error: "patientId requis." };
  try {
    const pool = getPostgresPool();
    const actor = await resolveCabinetActorSnapshot({
      userId: auth.userId,
      email: auth.email,
    });

    const { rows: prevRows } = await pool.query<{ state: unknown }>(
      `SELECT state FROM patient_ui_state WHERE patient_id = $1`,
      [pid],
    );
    const prevState =
      prevRows[0]?.state &&
      typeof prevRows[0].state === "object" &&
      !Array.isArray(prevRows[0].state)
        ? (prevRows[0].state as Record<string, unknown>)
        : {};

    const merged: Record<string, unknown> = { ...partial };
    if (Object.prototype.hasOwnProperty.call(partial, "acts")) {
      merged.acts = mergeActsWithAuditTrail(
        pid,
        partial.acts,
        prevState.acts,
        actor,
      );
    }

    await pool.query(
      `
      INSERT INTO patient_ui_state (patient_id, state, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (patient_id) DO UPDATE SET
        state = patient_ui_state.state || EXCLUDED.state,
        updated_at = NOW()
      `,
      [pid, JSON.stringify(merged)],
    );

    if (Object.prototype.hasOwnProperty.call(partial, "profile")) {
      logCabinetAuditSafe({
        userId: actor.userId,
        displayName: actor.displayName,
        role: actor.role,
        actionType: "patient_profil_etendu_mis_a_jour",
        entityType: "patient",
        entityId: null,
        patientId: pid,
        summary: "Profil étendu / fiche cockpit mis à jour",
        metadata: {},
      });
    }

    return { ok: true, data: undefined };
  } catch (e) {
    logServerError("mergePatientUiStateAction", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Impossible d’enregistrer l’état patient.",
    };
  }
}

export async function deletePatientUiStateAction(
  patientId: string,
): Promise<PatientUiStateOk<void>> {
  const auth = await requireBetterAuthSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const pid = patientId.trim();
  if (!pid) return { ok: false, error: "patientId requis." };
  try {
    const pool = getPostgresPool();
    await pool.query(`DELETE FROM patient_ui_state WHERE patient_id = $1`, [pid]);
    return { ok: true, data: undefined };
  } catch (e) {
    logServerError("deletePatientUiStateAction", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Impossible de supprimer l’état patient.",
    };
  }
}
