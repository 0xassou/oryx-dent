"use server";

import { randomUUID } from "crypto";
import { getPostgresPool } from "@/lib/server/db/pool";
import type {
  AppointmentInput,
  AppointmentRowJoined,
} from "@/lib/types/appointments-db";

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
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
    nom: row.nom != null ? String(row.nom) : null,
    prenom: row.prenom != null ? String(row.prenom) : null,
  };
}

export async function getAppointmentsAction(): Promise<
  AppointmentsOk<AppointmentRowJoined[]>
> {
  try {
    const pool = getPostgresPool();
    const { rows } = await pool.query(
      `${SELECT_JOIN}
       ORDER BY a.date ASC NULLS LAST, a.heure ASC`,
    );
    return { ok: true, data: rows.map((r) => mapRow(r as Record<string, unknown>)) };
  } catch (e) {
    console.error("[getAppointmentsAction]", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function getAppointmentsByDateAction(
  date: string,
): Promise<AppointmentsOk<AppointmentRowJoined[]>> {
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
    console.error("[getAppointmentsByDateAction]", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function getAppointmentsByPatientAction(
  patientId: string,
): Promise<AppointmentsOk<AppointmentRowJoined[]>> {
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
    console.error("[getAppointmentsByPatientAction]", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function createAppointmentAction(
  data: AppointmentInput & { id?: string },
): Promise<AppointmentsOk<AppointmentRowJoined>> {
  try {
    const id = data.id?.trim() || randomUUID();
    const pool = getPostgresPool();
    const { rows } = await pool.query(
      `INSERT INTO appointments (
          id, patient_id, date, heure, duree,
          type_acte, statut, notes, praticien, salle
        )
       VALUES (
          $1, $2, $3::date, $4, $5,
          $6, COALESCE($7, 'confirme'), $8, $9, $10
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
      ],
    );
    const insertedId = String((rows[0] as { id: string }).id);
    const one = await pool.query(`${SELECT_JOIN} WHERE a.id = $1`, [
      insertedId,
    ]);
    const r = one.rows[0];
    if (!r) return { ok: false, error: "Insertion RDV sans retour JOIN" };
    return { ok: true, data: mapRow(r as Record<string, unknown>) };
  } catch (e) {
    console.error("[createAppointmentAction]", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function updateAppointmentAction(
  id: string,
  data: Partial<AppointmentInput>,
): Promise<AppointmentsOk<AppointmentRowJoined>> {
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
    return { ok: true, data: mapRow(r as Record<string, unknown>) };
  } catch (e) {
    console.error("[updateAppointmentAction]", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function deleteAppointmentAction(
  id: string,
): Promise<AppointmentsOk<void>> {
  const rid = id.trim();
  if (!rid) return { ok: false, error: "id requis" };
  try {
    const pool = getPostgresPool();
    await pool.query(`DELETE FROM appointments WHERE id = $1`, [rid]);
    return { ok: true, data: undefined };
  } catch (e) {
    console.error("[deleteAppointmentAction]", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
