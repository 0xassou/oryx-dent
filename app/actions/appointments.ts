"use server";

import { randomUUID } from "crypto";
import { getPostgresPool } from "@/lib/server/db/pool";
import { requireBetterAuthSession } from "@/lib/server/auth/require-session";
import { resolveCabinetActorSnapshot } from "@/lib/server/cabinet-actor";
import { logCabinetAuditSafe } from "@/lib/server/cabinet-audit";
import { logServerError } from "@/lib/server/logger";
import type {
  AppointmentInput,
  AppointmentRowJoined,
} from "@/lib/types/appointments-db";
import type { PatientRow } from "@/lib/types/patients-db";

const SELECT_JOIN = `
  SELECT
    a.id,
    a.patient_id,
    a.date::text AS date,
    a.heure,
    a.duree,
    a.type_acte,
    a.statut,
    a.notes,
    a.praticien,
    a.salle,
    a.created_by_user_id,
    a.created_by_display_name,
    a.created_by_role,
    a.updated_by_user_id,
    a.updated_by_display_name,
    a.updated_by_role,
    a.created_at::text AS created_at,
    a.updated_at::text AS updated_at,
    p.nom AS nom,
    p.prenom AS prenom
  FROM appointments a
  LEFT JOIN patients p ON a.patient_id = p.id
`;

function normalizeDate(raw: unknown): string {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString().slice(0, 10);
  }
  if (typeof raw === "string") return raw.slice(0, 10);
  return String(raw ?? "").slice(0, 10);
}

export type AppointmentsOk<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function mapRow(row: Record<string, unknown>): AppointmentRowJoined {
  return {
    id: String(row.id ?? ""),
    patient_id: row.patient_id != null ? String(row.patient_id) : null,
    date: normalizeDate(row.date),
    heure: String(row.heure ?? "").slice(0, 5),
    duree: Number(row.duree) || 30,
    type_acte: row.type_acte != null ? String(row.type_acte) : null,
    statut: row.statut != null ? String(row.statut) : null,
    notes: row.notes != null ? String(row.notes) : null,
    praticien: row.praticien != null ? String(row.praticien) : null,
    salle: row.salle != null ? String(row.salle) : null,
    created_by_user_id:
      row.created_by_user_id != null ? String(row.created_by_user_id) : null,
    created_by_display_name:
      row.created_by_display_name != null
        ? String(row.created_by_display_name)
        : null,
    created_by_role:
      row.created_by_role != null ? String(row.created_by_role) : null,
    updated_by_user_id:
      row.updated_by_user_id != null ? String(row.updated_by_user_id) : null,
    updated_by_display_name:
      row.updated_by_display_name != null
        ? String(row.updated_by_display_name)
        : null,
    updated_by_role:
      row.updated_by_role != null ? String(row.updated_by_role) : null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
    nom: row.nom != null ? String(row.nom) : null,
    prenom: row.prenom != null ? String(row.prenom) : null,
  };
}

function toIsoTimestamp(v: unknown): string {
  if (v == null) return new Date(0).toISOString();
  if (v instanceof Date) return v.toISOString();
  const s = String(v);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString();
}

function toDateStringOrNull(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : s || null;
}

function mapPatientRow(r: Record<string, unknown>): PatientRow {
  return {
    id: String(r.id),
    nom: String(r.nom ?? ""),
    prenom: String(r.prenom ?? ""),
    telephone: r.telephone == null ? null : String(r.telephone),
    telephone2: r.telephone2 == null ? null : String(r.telephone2),
    email: r.email == null ? null : String(r.email),
    date_naissance: toDateStringOrNull(r.date_naissance),
    groupe_sanguin: r.groupe_sanguin == null ? null : String(r.groupe_sanguin),
    sexe: r.sexe == null ? null : String(r.sexe),
    adresse: r.adresse == null ? null : String(r.adresse),
    mutuelle: r.mutuelle == null ? null : String(r.mutuelle),
    mutuelle_nom: r.mutuelle_nom == null ? null : String(r.mutuelle_nom),
    mutuelle_numero:
      r.mutuelle_numero == null ? null : String(r.mutuelle_numero),
    antecedents: r.antecedents == null ? null : String(r.antecedents),
    notes: r.notes == null ? null : String(r.notes),
    created_at: toIsoTimestamp(r.created_at),
    updated_at: toIsoTimestamp(r.updated_at),
  };
}

export async function getAppointmentsAction(): Promise<
  AppointmentsOk<AppointmentRowJoined[]>
> {
  const auth = await requireBetterAuthSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  try {
    const pool = getPostgresPool();
    const { rows } = await pool.query(
      `${SELECT_JOIN}
       ORDER BY a.date ASC NULLS LAST, a.heure ASC`,
    );
    return { ok: true, data: rows.map((r) => mapRow(r as Record<string, unknown>)) };
  } catch (e) {
    logServerError("[getAppointmentsAction]", e);
    console.error(e);
    return {
      ok: false,
      error: "Une erreur est survenue.",
    };
  }
}

export async function getInactivePatientsAction(
  daysSince: number,
): Promise<AppointmentsOk<PatientRow[]>> {
  const auth = await requireBetterAuthSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const days = Math.max(1, Math.floor(Number(daysSince) || 90));
  try {
    const pool = getPostgresPool();
    const { rows } = await pool.query(
      `
      SELECT p.*
      FROM patients p
      WHERE p.id NOT IN (
        SELECT DISTINCT a.patient_id
        FROM appointments a
        WHERE a.patient_id IS NOT NULL
          AND a.date >= (CURRENT_DATE - $1::int)
      )
      ORDER BY p.nom ASC
      `,
      [days],
    );
    return { ok: true, data: rows.map((r) => mapPatientRow(r as Record<string, unknown>)) };
  } catch (e) {
    logServerError("[getInactivePatientsAction]", e);
    console.error(e);
    return {
      ok: false,
      error: "Une erreur est survenue.",
    };
  }
}

export async function getAppointmentsByDateAction(
  date: string,
): Promise<AppointmentsOk<AppointmentRowJoined[]>> {
  const auth = await requireBetterAuthSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const day = date.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return { ok: false, error: "Date invalide" };
  }
  try {
    const pool = getPostgresPool();
    const { rows } = await pool.query(
      `${SELECT_JOIN}
       WHERE a.date = $1::date
       ORDER BY a.heure ASC`,
      [day],
    );
    return { ok: true, data: rows.map((r) => mapRow(r as Record<string, unknown>)) };
  } catch (e) {
    logServerError("[getAppointmentsByDateAction]", e);
    console.error(e);
    return {
      ok: false,
      error: "Une erreur est survenue.",
    };
  }
}

export async function getAppointmentsByPatientAction(
  patientId: string,
): Promise<AppointmentsOk<AppointmentRowJoined[]>> {
  const auth = await requireBetterAuthSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const pid = patientId.trim();
  if (!pid) return { ok: false, error: "patientId requis" };
  try {
    const pool = getPostgresPool();
    const { rows } = await pool.query(
      `${SELECT_JOIN}
       WHERE a.patient_id = $1
       ORDER BY a.date ASC, a.heure ASC`,
      [pid],
    );
    return { ok: true, data: rows.map((r) => mapRow(r as Record<string, unknown>)) };
  } catch (e) {
    logServerError("[getAppointmentsByPatientAction]", e);
    console.error(e);
    return {
      ok: false,
      error: "Une erreur est survenue.",
    };
  }
}

export async function createAppointmentAction(
  data: AppointmentInput & { id?: string },
): Promise<AppointmentsOk<AppointmentRowJoined>> {
  const auth = await requireBetterAuthSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  try {
    const actor = await resolveCabinetActorSnapshot({
      userId: auth.userId,
      email: auth.email,
    });
    const id = data.id?.trim() || randomUUID();
    const pool = getPostgresPool();
    const { rows } = await pool.query(
      `INSERT INTO appointments (
          id, patient_id, date, heure, duree,
          type_acte, statut, notes, praticien, salle,
          created_by_user_id, created_by_display_name, created_by_role,
          updated_by_user_id, updated_by_display_name, updated_by_role
        )
       VALUES (
          $1, $2, $3::date, $4, $5,
          $6, COALESCE($7, 'confirme'), $8, $9, $10,
          $11, $12, $13, $11, $12, $13
        )
       RETURNING id`,
      [
        id,
        data.patient_id?.trim() || null,
        data.date.trim().slice(0, 10),
        String(data.heure).trim().slice(0, 5),
        data.duree ?? 30,
        data.type_acte ?? "",
        data.statut ?? null,
        data.notes ?? null,
        data.praticien ?? null,
        data.salle ?? null,
        actor.userId,
        actor.displayName,
        actor.role,
      ],
    );
    const insertedId = String((rows[0] as { id: string }).id);
    const one = await pool.query(`${SELECT_JOIN} WHERE a.id = $1`, [
      insertedId,
    ]);
    const r = one.rows[0];
    if (!r) return { ok: false, error: "Insertion RDV sans retour JOIN" };
    const mapped = mapRow(r as Record<string, unknown>);
    const pname = [mapped.prenom, mapped.nom].filter(Boolean).join(" ").trim();
    logCabinetAuditSafe({
      userId: actor.userId,
      displayName: actor.displayName,
      role: actor.role,
      actionType: "rdv_cree",
      entityType: "appointment",
      entityId: mapped.id,
      patientId: mapped.patient_id,
      summary: pname ? `RDV · ${pname}` : "RDV créé",
      metadata: { date: mapped.date, heure: mapped.heure },
    });
    return { ok: true, data: mapped };
  } catch (e) {
    logServerError("[createAppointmentAction]", e);
    console.error(e);
    return {
      ok: false,
      error: "Une erreur est survenue.",
    };
  }
}

export async function updateAppointmentAction(
  id: string,
  data: Partial<AppointmentInput>,
): Promise<AppointmentsOk<AppointmentRowJoined>> {
  const auth = await requireBetterAuthSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const rid = id.trim();
  if (!rid) return { ok: false, error: "id requis" };
  try {
    const pool = getPostgresPool();
    const patches: string[] = [];
    const vals: unknown[] = [];
    let i = 1;

    function add(col: string, v: unknown) {
      patches.push(`${col} = $${i++}`);
      vals.push(v);
    }

    if (data.patient_id !== undefined) {
      add("patient_id", data.patient_id?.trim() || null);
    }
    if (data.date !== undefined) {
      patches.push(`date = $${i++}::date`);
      vals.push(data.date.trim().slice(0, 10));
    }
    if (data.heure !== undefined) {
      add("heure", String(data.heure).trim().slice(0, 5));
    }
    if (data.duree !== undefined) {
      add("duree", data.duree);
    }
    if (data.type_acte !== undefined) {
      add("type_acte", data.type_acte ?? "");
    }
    if (data.statut !== undefined) {
      add("statut", data.statut ?? "confirme");
    }
    if (data.notes !== undefined) {
      add("notes", data.notes);
    }
    if (data.praticien !== undefined) {
      add("praticien", data.praticien);
    }
    if (data.salle !== undefined) {
      add("salle", data.salle);
    }

    if (patches.length === 0) {
      const { rows } = await pool.query(`${SELECT_JOIN} WHERE a.id = $1`, [
        rid,
      ]);
      const r = rows[0];
      if (!r) return { ok: false, error: "RDV introuvable" };
      return { ok: true, data: mapRow(r as Record<string, unknown>) };
    }

    const actor = await resolveCabinetActorSnapshot({
      userId: auth.userId,
      email: auth.email,
    });
    patches.push(`updated_by_user_id = $${i++}`);
    vals.push(actor.userId);
    patches.push(`updated_by_display_name = $${i++}`);
    vals.push(actor.displayName);
    patches.push(`updated_by_role = $${i++}`);
    vals.push(actor.role);
    patches.push(`updated_at = NOW()`);
    vals.push(rid);

    const q = `UPDATE appointments SET ${patches.join(", ")} WHERE id = $${i}`;
    const up = await pool.query(q, vals);
    if (up.rowCount === 0) return { ok: false, error: "RDV introuvable" };

    const { rows } = await pool.query(`${SELECT_JOIN} WHERE a.id = $1`, [
      rid,
    ]);
    const r = rows[0];
    if (!r) return { ok: false, error: "RDV introuvable après mise à jour" };
    const mapped = mapRow(r as Record<string, unknown>);
    const pname = [mapped.prenom, mapped.nom].filter(Boolean).join(" ").trim();
    logCabinetAuditSafe({
      userId: actor.userId,
      displayName: actor.displayName,
      role: actor.role,
      actionType: "rdv_modifie",
      entityType: "appointment",
      entityId: mapped.id,
      patientId: mapped.patient_id,
      summary: pname ? `RDV modifié · ${pname}` : "RDV modifié",
      metadata: { date: mapped.date, heure: mapped.heure },
    });
    return { ok: true, data: mapped };
  } catch (e) {
    logServerError("[updateAppointmentAction]", e);
    console.error(e);
    return {
      ok: false,
      error: "Une erreur est survenue.",
    };
  }
}

export async function deleteAppointmentAction(
  id: string,
): Promise<AppointmentsOk<void>> {
  const auth = await requireBetterAuthSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const rid = id.trim();
  if (!rid) return { ok: false, error: "id requis" };
  try {
    const pool = getPostgresPool();
    await pool.query(`DELETE FROM appointments WHERE id = $1`, [rid]);
    return { ok: true, data: undefined };
  } catch (e) {
    logServerError("[deleteAppointmentAction]", e);
    console.error(e);
    return {
      ok: false,
      error: "Une erreur est survenue.",
    };
  }
}
