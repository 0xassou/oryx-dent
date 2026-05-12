"use server";

import { randomUUID } from "crypto";
import { getPostgresPool } from "@/lib/server/db/pool";
import { requireBetterAuthSession } from "@/lib/server/auth/require-session";
import { logServerError } from "@/lib/server/logger";

export type ConsultationStatut =
  | "en_attente"
  | "arrive"
  | "en_consultation"
  | "termine"
  | "absent";

const STATUTS_VALIDES: readonly ConsultationStatut[] = [
  "en_attente",
  "arrive",
  "en_consultation",
  "termine",
  "absent",
] as const;

export type ConsultationRow = {
  id: string;
  appointment_id: string | null;
  patient_id: string | null;
  statut: ConsultationStatut;
  heure_arrivee: string | null;
  heure_debut: string | null;
  heure_fin: string | null;
  salle: string | null;
  notes_accueil: string | null;
  created_at: string;
  updated_at: string;
  /* Champs joints */
  heure: string | null;
  type_acte: string | null;
  nom: string | null;
  prenom: string | null;
  telephone: string | null;
};

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function toIso(v: unknown): string {
  if (v == null) return new Date(0).toISOString();
  if (v instanceof Date) return v.toISOString();
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString();
}

function toIsoOrNull(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function mapRow(r: Record<string, unknown>): ConsultationRow {
  return {
    id: String(r.id ?? ""),
    appointment_id: r.appointment_id == null ? null : String(r.appointment_id),
    patient_id: r.patient_id == null ? null : String(r.patient_id),
    statut: (STATUTS_VALIDES as readonly string[]).includes(String(r.statut))
      ? (String(r.statut) as ConsultationStatut)
      : "en_attente",
    heure_arrivee: toIsoOrNull(r.heure_arrivee),
    heure_debut: toIsoOrNull(r.heure_debut),
    heure_fin: toIsoOrNull(r.heure_fin),
    salle: r.salle == null ? null : String(r.salle),
    notes_accueil: r.notes_accueil == null ? null : String(r.notes_accueil),
    created_at: toIso(r.created_at),
    updated_at: toIso(r.updated_at),
    heure: r.heure == null ? null : String(r.heure).slice(0, 5),
    type_acte: r.type_acte == null ? null : String(r.type_acte),
    nom: r.nom == null ? null : String(r.nom),
    prenom: r.prenom == null ? null : String(r.prenom),
    telephone: r.telephone == null ? null : String(r.telephone),
  };
}

const SELECT_JOIN = `
  SELECT
    c.id,
    c.appointment_id,
    c.patient_id,
    c.statut,
    c.heure_arrivee,
    c.heure_debut,
    c.heure_fin,
    c.salle,
    c.notes_accueil,
    c.created_at,
    c.updated_at,
    COALESCE(a.heure, to_char(c.heure_arrivee, 'HH24:MI')) AS heure,
    COALESCE(a.type_acte, c.type_acte) AS type_acte,
    p.nom,
    p.prenom,
    p.telephone
  FROM consultations c
  JOIN patients p ON c.patient_id = p.id
  LEFT JOIN appointments a ON c.appointment_id = a.id
`;

export async function getConsultationsDuJourAction(): Promise<
  ActionResult<ConsultationRow[]>
> {
  const auth = await requireBetterAuthSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  try {
    const pool = getPostgresPool();
    const { rows } = await pool.query(
      `${SELECT_JOIN}
       WHERE (
         (c.appointment_id IS NOT NULL AND a.date = CURRENT_DATE)
         OR (
           c.appointment_id IS NULL
           AND COALESCE(c.heure_arrivee, c.created_at)::date = CURRENT_DATE
         )
       )
       ORDER BY COALESCE(c.heure_arrivee, c.created_at) ASC`,
    );
    return {
      ok: true,
      data: rows.map((r) => mapRow(r as Record<string, unknown>)),
    };
  } catch (e) {
    logServerError("[getConsultationsDuJourAction]", e);
    console.error(e);
    return { ok: false, error: "Une erreur est survenue." };
  }
}

export async function createConsultationAction(data: {
  appointment_id: string | null;
  patient_id: string;
  salle?: string | null;
  notes_accueil?: string | null;
  /** Motif / type d’acte si sans rendez-vous (appointment_id null). */
  type_acte?: string | null;
}): Promise<ActionResult<ConsultationRow>> {
  const auth = await requireBetterAuthSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const appointmentId = data.appointment_id?.trim() || null;
  const patientId = data.patient_id?.trim();
  const motif = data.type_acte?.trim() || null;

  if (!patientId) {
    return { ok: false, error: "patient_id requis." };
  }
  if (!appointmentId && !motif) {
    return { ok: false, error: "Motif de visite requis pour un patient sans RDV." };
  }

  try {
    const pool = getPostgresPool();

    if (appointmentId) {
      const dup = await pool.query(
        `SELECT id FROM consultations WHERE appointment_id = $1`,
        [appointmentId],
      );
      if (dup.rows.length > 0) {
        return { ok: false, error: "Ce RDV a déjà une consultation enregistrée." };
      }
    }

    const id = randomUUID();
    if (appointmentId) {
      await pool.query(
        `INSERT INTO consultations (
          id, appointment_id, patient_id, statut,
          heure_arrivee, salle, notes_accueil
        ) VALUES ($1, $2, $3, 'arrive', NOW(), $4, $5)`,
        [
          id,
          appointmentId,
          patientId,
          data.salle?.trim() || null,
          data.notes_accueil?.trim() || null,
        ],
      );
    } else {
      await pool.query(
        `INSERT INTO consultations (
          id, appointment_id, patient_id, statut,
          heure_arrivee, salle, notes_accueil, type_acte
        ) VALUES ($1, NULL, $2, 'arrive', NOW(), $3, $4, $5)`,
        [
          id,
          patientId,
          data.salle?.trim() || null,
          data.notes_accueil?.trim() || null,
          motif,
        ],
      );
    }

    const { rows } = await pool.query(
      `${SELECT_JOIN} WHERE c.id = $1`,
      [id],
    );
    const row = rows[0];
    if (!row) return { ok: false, error: "Insertion sans retour." };
    return { ok: true, data: mapRow(row as Record<string, unknown>) };
  } catch (e) {
    logServerError("[createConsultationAction]", e);
    console.error(e);
    return { ok: false, error: "Une erreur est survenue." };
  }
}

export async function updateStatutConsultationAction(
  id: string,
  statut: ConsultationStatut,
): Promise<ActionResult<ConsultationRow>> {
  const auth = await requireBetterAuthSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const cid = id?.trim();
  if (!cid) return { ok: false, error: "id requis." };
  if (!(STATUTS_VALIDES as readonly string[]).includes(statut)) {
    return { ok: false, error: "Statut invalide." };
  }

  try {
    const pool = getPostgresPool();

    const extras: string[] = ["statut = $1", "updated_at = NOW()"];
    const vals: unknown[] = [statut];

    if (statut === "arrive") {
      extras.push(`heure_arrivee = COALESCE(heure_arrivee, NOW())`);
    } else if (statut === "en_consultation") {
      extras.push(`heure_debut = NOW()`);
    } else if (statut === "termine") {
      extras.push(`heure_fin = NOW()`);
    }

    vals.push(cid);
    const up = await pool.query(
      `UPDATE consultations SET ${extras.join(", ")} WHERE id = $${vals.length} RETURNING id`,
      vals,
    );
    if (up.rowCount === 0) return { ok: false, error: "Consultation introuvable." };

    const { rows } = await pool.query(
      `${SELECT_JOIN} WHERE c.id = $1`,
      [cid],
    );
    const row = rows[0];
    if (!row) return { ok: false, error: "Consultation introuvable après update." };
    return { ok: true, data: mapRow(row as Record<string, unknown>) };
  } catch (e) {
    logServerError("[updateStatutConsultationAction]", e);
    console.error(e);
    return { ok: false, error: "Une erreur est survenue." };
  }
}

export async function getConsultationByAppointmentAction(
  appointmentId: string,
): Promise<ActionResult<ConsultationRow | null>> {
  const auth = await requireBetterAuthSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const aid = appointmentId?.trim();
  if (!aid) return { ok: false, error: "appointment_id requis." };
  try {
    const pool = getPostgresPool();
    const { rows } = await pool.query(
      `${SELECT_JOIN} WHERE c.appointment_id = $1 LIMIT 1`,
      [aid],
    );
    if (rows.length === 0) return { ok: true, data: null };
    return { ok: true, data: mapRow(rows[0] as Record<string, unknown>) };
  } catch (e) {
    logServerError("[getConsultationByAppointmentAction]", e);
    console.error(e);
    return { ok: false, error: "Une erreur est survenue." };
  }
}

export async function getConsultationsByPatientIdAction(
  patientId: string,
): Promise<ActionResult<ConsultationRow[]>> {
  const auth = await requireBetterAuthSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const pid = patientId?.trim();
  if (!pid) return { ok: false, error: "patient_id requis." };
  try {
    const pool = getPostgresPool();
    const { rows } = await pool.query(
      `${SELECT_JOIN} WHERE c.patient_id = $1 ORDER BY c.heure_arrivee DESC`,
      [pid],
    );
    return {
      ok: true,
      data: rows.map((r) => mapRow(r as Record<string, unknown>)),
    };
  } catch (e) {
    logServerError("[getConsultationsByPatientIdAction]", e);
    console.error(e);
    return { ok: false, error: "Une erreur est survenue." };
  }
}
