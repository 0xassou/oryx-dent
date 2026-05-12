"use server";

/* ARCHITECTURE : Une instance Oryx = un cabinet dentaire.
   L'isolation multi-tenant est assurée par infrastructure
   (instance dédiée par cabinet), pas par colonne cabinet_id.

   TODO v2 : Si migration vers modèle multi-tenant partagé,
   réintroduire cabinet_id sur toutes les tables et filtrer
   toutes les requêtes par session.cabinetId.
*/

import { randomUUID } from "node:crypto";
import { getPostgresPool } from "@/lib/server/db/pool";
import { requireBetterAuthSession } from "@/lib/server/auth/require-session";
import { resolveCabinetActorSnapshot } from "@/lib/server/cabinet-actor";
import { logCabinetAuditSafe } from "@/lib/server/cabinet-audit";
import { logServerError } from "@/lib/server/logger";
import type {
  CreatePatientInput,
  PatientInput,
  PatientRow,
} from "@/lib/types/patients-db";

/** Colonnes réelles de `patients` — jamais de fragments SQL depuis les clés client brutes. */
const PATIENT_UPDATE_COLUMN_WHITELIST = new Set<string>([
  "nom",
  "prenom",
  "telephone",
  "telephone2",
  "email",
  "date_naissance",
  "groupe_sanguin",
  "sexe",
  "adresse",
  "mutuelle",
  "mutuelle_nom",
  "mutuelle_numero",
  "antecedents",
  "notes",
]);

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

/** Convertit une date JJ/MM/AAAA en YYYY-MM-DD (format PostgreSQL) */
function parseDateToISO(date: string): string {
  if (!date) return date;
  if (date.includes("/")) {
    const [day, month, year] = date.split("/");
    return `${year}-${month}-${day}`;
  }
  return date;
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
    ...(r.rdv_count != null
      ? { rdv_count: Number(r.rdv_count) || 0 }
      : {}),
  };
}

/** Recherche rapide (autocomplete) — sans caractères génériques côté SQL. */
export async function searchPatientsAutocompleteAction(
  query: string,
  limit = 15,
): Promise<{ ok: true; data: PatientRow[] } | { ok: false; error: string }> {
  const auth = await requireBetterAuthSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const q = query.trim().toLowerCase();
  if (q.length < 1) return { ok: true, data: [] };
  const lim = Math.min(Math.max(1, limit), 50);
  try {
    const pool = getPostgresPool();
    const { rows } = await pool.query(
      `SELECT * FROM patients
       WHERE position($1 IN lower(
         coalesce(nom, '') || ' ' || coalesce(prenom, '') || ' ' || coalesce(telephone, '')
       )) > 0
       ORDER BY nom ASC, prenom ASC
       LIMIT $2`,
      [q, lim],
    );
    return {
      ok: true,
      data: rows.map((row) => mapRow(row as Record<string, unknown>)),
    };
  } catch (e) {
    logServerError("searchPatientsAutocompleteAction", e);
    console.error(e);
    return { ok: false, error: "Une erreur est survenue." };
  }
}

export async function getPatientsAction(): Promise<
  { ok: true; data: PatientRow[] } | { ok: false; error: string }
> {
  const auth = await requireBetterAuthSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  try {
    const pool = getPostgresPool();
    try {
      const { rows } = await pool.query(
        `SELECT p.*, COALESCE((
            SELECT COUNT(*)::int FROM appointments a WHERE a.patient_id = p.id
          ), 0) AS rdv_count
         FROM patients p
         ORDER BY p.nom ASC, p.prenom ASC`,
      );
      return {
        ok: true,
        data: rows.map((row) => mapRow(row as Record<string, unknown>)),
      };
    } catch (inner) {
      const msg = inner instanceof Error ? inner.message : String(inner);
      const isMissingAppointments =
        /relation ["']?appointments["']? does not exist/i.test(msg) ||
        /la relation.*appointments.*n'existe pas/i.test(msg) ||
        /relation.*appointments.*existe pas/i.test(msg);
      if (!isMissingAppointments) throw inner;
      logServerError(
        "getPatientsAction",
        inner,
        { fallback: "liste patients sans comptage RDV (table appointments absente)" },
      );
      const { rows } = await pool.query(
        `SELECT * FROM patients p ORDER BY p.nom ASC, p.prenom ASC`,
      );
      return {
        ok: true,
        data: rows.map((row) => mapRow(row as Record<string, unknown>)),
      };
    }
  } catch (e) {
    logServerError("getPatientsAction", e);
    console.error(e);
    return { ok: false, error: "Une erreur est survenue." };
  }
}

export async function getPatientByIdAction(
  id: string,
): Promise<
  { ok: true; data: PatientRow | null } | { ok: false; error: string }
> {
  const auth = await requireBetterAuthSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  try {
    const pool = getPostgresPool();
    const { rows } = await pool.query(
      `SELECT * FROM patients WHERE id = $1`,
      [id],
    );
    if (rows.length === 0) return { ok: true, data: null };
    return { ok: true, data: mapRow(rows[0] as Record<string, unknown>) };
  } catch (e) {
    logServerError("getPatientByIdAction", e);
    console.error(e);
    return { ok: false, error: "Une erreur est survenue." };
  }
}

export async function createPatientAction(
  data: CreatePatientInput,
): Promise<{ ok: true; data: PatientRow } | { ok: false; error: string }> {
  const auth = await requireBetterAuthSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  try {
    const actor = await resolveCabinetActorSnapshot({
      userId: auth.userId,
      email: auth.email,
    });
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
      data.date_naissance?.trim()
        ? parseDateToISO(data.date_naissance.trim())
        : null,
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
    const row = mapRow(rows[0] as Record<string, unknown>);
    const label = `${row.prenom} ${row.nom}`.trim();
    logCabinetAuditSafe({
      userId: actor.userId,
      displayName: actor.displayName,
      role: actor.role,
      actionType: explicitId ? "patient_mis_a_jour" : "patient_cree",
      entityType: "patient",
      entityId: row.id,
      patientId: row.id,
      summary: explicitId
        ? `Fiche patient mise à jour · ${label}`
        : `Patient ajouté · ${label}`,
      metadata: { nom: row.nom, prenom: row.prenom },
    });
    return { ok: true, data: row };
  } catch (e) {
    logServerError("createPatientAction", e);
    console.error(e);
    return { ok: false, error: "Une erreur est survenue." };
  }
}

type PatientInputKey = keyof PatientInput;

export async function updatePatientAction(
  id: string,
  data: Partial<PatientInput>,
): Promise<{ ok: true; data: PatientRow } | { ok: false; error: string }> {
  const auth = await requireBetterAuthSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  try {
    const actor = await resolveCabinetActorSnapshot({
      userId: auth.userId,
      email: auth.email,
    });
    const pool = getPostgresPool();
    const keys = (Object.keys(data) as PatientInputKey[]).filter(
      (k) =>
        data[k] !== undefined && PATIENT_UPDATE_COLUMN_WHITELIST.has(String(k)),
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
        const trimmed = v.trim();
        v = trimmed ? parseDateToISO(trimmed) : null;
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
    const row = mapRow(rows[0] as Record<string, unknown>);
    const label = `${row.prenom} ${row.nom}`.trim();
    logCabinetAuditSafe({
      userId: actor.userId,
      displayName: actor.displayName,
      role: actor.role,
      actionType: "patient_mis_a_jour",
      entityType: "patient",
      entityId: row.id,
      patientId: row.id,
      summary: `Fiche patient modifiée · ${label}`,
      metadata: { champs: keys },
    });
    return { ok: true, data: row };
  } catch (e) {
    logServerError("updatePatientAction", e);
    console.error(e);
    return { ok: false, error: "Une erreur est survenue." };
  }
}

export async function deletePatientAction(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await requireBetterAuthSession();
  if (!auth.ok) return { ok: false, error: auth.error };
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
    logServerError("deletePatientAction", e);
    console.error(e);
    return { ok: false, error: "Une erreur est survenue." };
  }
}
