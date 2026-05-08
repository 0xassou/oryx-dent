"use server";

import { randomUUID } from "node:crypto";
import { getPostgresPool } from "@/lib/server/db/pool";
import type {
  CreatePatientInput,
  PatientInput,
  PatientRow,
} from "@/lib/types/patients-db";

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

function mapRow(r: Record<string, unknown>): PatientRow {
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

export async function getPatientsAction(): Promise<
  { ok: true; data: PatientRow[] } | { ok: false; error: string }
> {
  try {
    const pool = getPostgresPool();
    const { rows } = await pool.query(
      `SELECT * FROM patients ORDER BY nom ASC, prenom ASC`,
    );
    return {
      ok: true,
      data: rows.map((row) => mapRow(row as Record<string, unknown>)),
    };
  } catch (e) {
    console.error("[getPatientsAction]", e);
    const message =
      e instanceof Error ? e.message : "Impossible de charger les patients.";
    return { ok: false, error: message };
  }
}

export async function getPatientByIdAction(
  id: string,
): Promise<
  { ok: true; data: PatientRow | null } | { ok: false; error: string }
> {
  try {
    const pool = getPostgresPool();
    const { rows } = await pool.query(
      `SELECT * FROM patients WHERE id = $1`,
      [id],
    );
    if (rows.length === 0) return { ok: true, data: null };
    return { ok: true, data: mapRow(rows[0] as Record<string, unknown>) };
  } catch (e) {
    console.error("[getPatientByIdAction]", e);
    const message =
      e instanceof Error ? e.message : "Impossible de charger le patient.";
    return { ok: false, error: message };
  }
}

export async function createPatientAction(
  data: CreatePatientInput,
): Promise<{ ok: true; data: PatientRow } | { ok: false; error: string }> {
  try {
    const explicitId = data.id?.trim();
    const id = explicitId || randomUUID();
    const pool = getPostgresPool();
    const cols = [
      id,
      data.nom,
      data.prenom,
      data.telephone ?? null,
      data.telephone2 ?? null,
      data.email ?? null,
      data.date_naissance?.trim() || null,
      data.groupe_sanguin ?? null,
      data.sexe ?? null,
      data.adresse ?? null,
      data.mutuelle ?? null,
      data.mutuelle_nom ?? null,
      data.mutuelle_numero ?? null,
      data.antecedents ?? null,
      data.notes ?? null,
    ];
    const { rows } = explicitId
      ? await pool.query(
          `INSERT INTO patients (
             id, nom, prenom, telephone, telephone2, email, date_naissance,
             groupe_sanguin, sexe, adresse, mutuelle, mutuelle_nom, mutuelle_numero,
             antecedents, notes
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
           ON CONFLICT (id) DO UPDATE SET
             nom = EXCLUDED.nom,
             prenom = EXCLUDED.prenom,
             telephone = EXCLUDED.telephone,
             telephone2 = EXCLUDED.telephone2,
             email = EXCLUDED.email,
             date_naissance = EXCLUDED.date_naissance,
             groupe_sanguin = EXCLUDED.groupe_sanguin,
             sexe = EXCLUDED.sexe,
             adresse = EXCLUDED.adresse,
             mutuelle = EXCLUDED.mutuelle,
             mutuelle_nom = EXCLUDED.mutuelle_nom,
             mutuelle_numero = EXCLUDED.mutuelle_numero,
             antecedents = EXCLUDED.antecedents,
             notes = EXCLUDED.notes,
             updated_at = NOW()
           RETURNING *`,
          cols,
        )
      : await pool.query(
          `INSERT INTO patients (
             id, nom, prenom, telephone, telephone2, email, date_naissance,
             groupe_sanguin, sexe, adresse, mutuelle, mutuelle_nom, mutuelle_numero,
             antecedents, notes
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
           RETURNING *`,
          cols,
        );
    return { ok: true, data: mapRow(rows[0] as Record<string, unknown>) };
  } catch (e) {
    console.error("[createPatientAction]", e);
    const message =
      e instanceof Error ? e.message : "Impossible de créer le patient.";
    return { ok: false, error: message };
  }
}

type PatientInputKey = keyof PatientInput;

export async function updatePatientAction(
  id: string,
  data: Partial<PatientInput>,
): Promise<{ ok: true; data: PatientRow } | { ok: false; error: string }> {
  try {
    const pool = getPostgresPool();
    const keys = (Object.keys(data) as PatientInputKey[]).filter(
      (k) => data[k] !== undefined,
    );

    if (keys.length === 0) {
      const { rows } = await pool.query(
        `UPDATE patients SET updated_at = NOW() WHERE id = $1 RETURNING *`,
        [id],
      );
      if (rows.length === 0) {
        return { ok: false, error: "Patient introuvable." };
      }
      return { ok: true, data: mapRow(rows[0] as Record<string, unknown>) };
    }

    const fragments: string[] = [];
    const values: unknown[] = [id];
    let i = 2;
    for (const key of keys) {
      fragments.push(`${key} = $${i}`);
      let v: unknown = data[key];
      if (key === "date_naissance" && typeof v === "string") {
        v = v.trim() || null;
      }
      values.push(v ?? null);
      i += 1;
    }

    const { rows } = await pool.query(
      `UPDATE patients SET ${fragments.join(", ")}, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      values,
    );
    if (rows.length === 0) {
      return { ok: false, error: "Patient introuvable." };
    }
    return { ok: true, data: mapRow(rows[0] as Record<string, unknown>) };
  } catch (e) {
    console.error("[updatePatientAction]", e);
    const message =
      e instanceof Error ? e.message : "Impossible de mettre à jour le patient.";
    return { ok: false, error: message };
  }
}

export async function deletePatientAction(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const pool = getPostgresPool();
    const { rowCount } = await pool.query(
      `DELETE FROM patients WHERE id = $1`,
      [id],
    );
    if (!rowCount) {
      return { ok: false, error: "Patient introuvable." };
    }
    return { ok: true };
  } catch (e) {
    console.error("[deletePatientAction]", e);
    const message =
      e instanceof Error ? e.message : "Impossible de supprimer le patient.";
    return { ok: false, error: message };
  }
}
