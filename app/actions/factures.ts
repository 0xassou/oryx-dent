"use server";

import { randomUUID } from "crypto";
import { getPostgresPool } from "@/lib/server/db/pool";
import { requireBetterAuthSession } from "@/lib/server/auth/require-session";
import { resolveCabinetActorSnapshot } from "@/lib/server/cabinet-actor";
import { logCabinetAuditSafe } from "@/lib/server/cabinet-audit";
import { logServerError } from "@/lib/server/logger";
import type { FactureInput, FactureRowJoined } from "@/lib/types/factures-db";
import { montantsToStatutPostgreSQL } from "@/utils/factureDbMapping";

const SELECT_JOIN = `
  SELECT
    f.id,
    f.patient_id,
    f.date::text AS date,
    f.montant::text AS montant,
    f.montant_paye::text AS montant_paye,
    f.statut,
    f.actes,
    f.notes,
    f.created_at::text AS created_at,
    f.updated_at::text AS updated_at,
    p.nom AS nom,
    p.prenom AS prenom
  FROM factures f
  LEFT JOIN patients p ON f.patient_id = p.id
`;

export type FacturesOk<T> = { ok: true; data: T } | { ok: false; error: string };

function mapRow(row: Record<string, unknown>): FactureRowJoined {
  return {
    id: String(row.id ?? ""),
    patient_id: row.patient_id != null ? String(row.patient_id) : null,
    date: String(row.date ?? "").slice(0, 10),
    montant: String(row.montant ?? "0"),
    montant_paye: String(row.montant_paye ?? "0"),
    statut: row.statut != null ? String(row.statut) : null,
    actes: row.actes,
    notes: row.notes != null ? String(row.notes) : null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
    nom: row.nom != null ? String(row.nom) : null,
    prenom: row.prenom != null ? String(row.prenom) : null,
  };
}

export async function getFacturesAction(): Promise<
  FacturesOk<FactureRowJoined[]>
> {
  const auth = await requireBetterAuthSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  try {
    const pool = getPostgresPool();
    const { rows } = await pool.query(
      `${SELECT_JOIN} ORDER BY f.date DESC, f.created_at DESC`,
    );
    return {
      ok: true,
      data: rows.map((r) => mapRow(r as Record<string, unknown>)),
    };
  } catch (e) {
    logServerError("[getFacturesAction]", e);
    console.error(e);
    return {
      ok: false,
      error: "Une erreur est survenue.",
    };
  }
}

export async function getFacturesByPatientAction(
  patientId: string,
): Promise<FacturesOk<FactureRowJoined[]>> {
  const auth = await requireBetterAuthSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const pid = patientId.trim();
  if (!pid) return { ok: false, error: "patientId requis" };
  try {
    const pool = getPostgresPool();
    const { rows } = await pool.query(
      `${SELECT_JOIN} WHERE f.patient_id = $1 ORDER BY f.date DESC`,
      [pid],
    );
    return {
      ok: true,
      data: rows.map((r) => mapRow(r as Record<string, unknown>)),
    };
  } catch (e) {
    logServerError("[getFacturesByPatientAction]", e);
    console.error(e);
    return {
      ok: false,
      error: "Une erreur est survenue.",
    };
  }
}

export async function getFacturesByDateAction(
  date: string,
): Promise<FacturesOk<FactureRowJoined[]>> {
  const auth = await requireBetterAuthSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const day = date.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return { ok: false, error: "Date invalide" };
  }
  try {
    const pool = getPostgresPool();
    const { rows } = await pool.query(
      `${SELECT_JOIN} WHERE f.date = $1::date ORDER BY f.created_at DESC`,
      [day],
    );
    return {
      ok: true,
      data: rows.map((r) => mapRow(r as Record<string, unknown>)),
    };
  } catch (e) {
    logServerError("[getFacturesByDateAction]", e);
    console.error(e);
    return {
      ok: false,
      error: "Une erreur est survenue.",
    };
  }
}

export async function createFactureAction(
  data: FactureInput & { id?: string },
): Promise<FacturesOk<FactureRowJoined>> {
  const auth = await requireBetterAuthSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  try {
    const actor = await resolveCabinetActorSnapshot({
      userId: auth.userId,
      email: auth.email,
    });
    const id = data.id?.trim() || randomUUID();
    const day = data.date.trim().slice(0, 10);
    const montant = Math.max(0, data.montant);
    const montantPaye = Math.max(
      0,
      Math.min(data.montant_paye ?? 0, montant),
    );
    const statut =
      data.statut?.trim() || montantsToStatutPostgreSQL(montant, montantPaye);
    const pool = getPostgresPool();
    await pool.query(
      `INSERT INTO factures (
          id, patient_id, date, montant, montant_paye, statut, actes, notes
        ) VALUES ($1,$2,$3::date,$4,$5,$6,$7::jsonb,$8)`,
      [
        id,
        data.patient_id?.trim() || null,
        day,
        montant,
        montantPaye,
        statut,
        data.actes === undefined || data.actes === null ? null : data.actes,
        data.notes ?? null,
      ],
    );
    const one = await pool.query(`${SELECT_JOIN} WHERE f.id = $1`, [id]);
    const r = one.rows[0];
    if (!r) return { ok: false, error: "Insertion facture sans retour JOIN" };
    const mapped = mapRow(r as Record<string, unknown>);
    const pname = [mapped.prenom, mapped.nom].filter(Boolean).join(" ").trim();
    logCabinetAuditSafe({
      userId: actor.userId,
      displayName: actor.displayName,
      role: actor.role,
      actionType: "facture_creee",
      entityType: "facture",
      entityId: mapped.id,
      patientId: mapped.patient_id,
      summary: pname
        ? `Facture créée · ${pname}`
        : `Facture créée · ${mapped.montant} DA`,
      metadata: { montant: mapped.montant, date: mapped.date },
    });
    return { ok: true, data: mapped };
  } catch (e) {
    logServerError("[createFactureAction]", e);
    console.error(e);
    return {
      ok: false,
      error: "Une erreur est survenue.",
    };
  }
}

export async function updateFactureAction(
  id: string,
  data: Partial<FactureInput>,
): Promise<FacturesOk<FactureRowJoined>> {
  const auth = await requireBetterAuthSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const rid = id.trim();
  if (!rid) return { ok: false, error: "id requis" };
  try {
    const actor = await resolveCabinetActorSnapshot({
      userId: auth.userId,
      email: auth.email,
    });
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
    if (data.montant !== undefined) add("montant", Math.max(0, data.montant));
    if (data.montant_paye !== undefined)
      add("montant_paye", Math.max(0, data.montant_paye));
    if (data.statut !== undefined) add("statut", data.statut ?? "en_attente");
    if (data.actes !== undefined) {
      patches.push(`actes = $${i++}::jsonb`);
      vals.push(data.actes === null ? null : data.actes);
    }
    if (data.notes !== undefined) add("notes", data.notes);

    if (patches.length === 0) {
      const { rows } = await pool.query(`${SELECT_JOIN} WHERE f.id = $1`, [
        rid,
      ]);
      const r = rows[0];
      if (!r) return { ok: false, error: "Facture introuvable" };
      return { ok: true, data: mapRow(r as Record<string, unknown>) };
    }

    patches.push("updated_at = NOW()");
    vals.push(rid);

    const up = await pool.query(
      `UPDATE factures SET ${patches.join(", ")} WHERE id = $${i}`,
      vals,
    );
    if (up.rowCount === 0) return { ok: false, error: "Facture introuvable" };

    const { rows } = await pool.query(`${SELECT_JOIN} WHERE f.id = $1`, [
      rid,
    ]);
    const r = rows[0];
    if (!r) return { ok: false, error: "Facture introuvable après MAJ" };
    const mapped = mapRow(r as Record<string, unknown>);
    const pname = [mapped.prenom, mapped.nom].filter(Boolean).join(" ").trim();
    logCabinetAuditSafe({
      userId: actor.userId,
      displayName: actor.displayName,
      role: actor.role,
      actionType: "facture_modifiee",
      entityType: "facture",
      entityId: mapped.id,
      patientId: mapped.patient_id,
      summary: pname
        ? `Facture modifiée · ${pname}`
        : "Facture modifiée",
      metadata: {},
    });
    return { ok: true, data: mapped };
  } catch (e) {
    logServerError("[updateFactureAction]", e);
    console.error(e);
    return {
      ok: false,
      error: "Une erreur est survenue.",
    };
  }
}

/** Recalcule le statut à partir des montants (cohérence UI). */
export async function reconcileFactureStatutAfterAmountsAction(
  id: string,
): Promise<FacturesOk<FactureRowJoined>> {
  const auth = await requireBetterAuthSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const rid = id.trim();
  if (!rid) return { ok: false, error: "id requis" };
  try {
    const pool = getPostgresPool();
    const cur = await pool.query(
      `SELECT montant::text AS montant, montant_paye::text AS montant_paye FROM factures WHERE id = $1`,
      [rid],
    );
    const row0 = cur.rows[0] as
      | { montant?: string; montant_paye?: string }
      | undefined;
    if (!row0) return { ok: false, error: "Facture introuvable" };
    const montant =
      Number.parseFloat(String(row0.montant ?? "0")) || 0;
    const montantPaye =
      Number.parseFloat(String(row0.montant_paye ?? "0")) || 0;
    const st = montantsToStatutPostgreSQL(montant, montantPaye);
    return updateFactureAction(rid, { statut: st });
  } catch (e) {
    logServerError("[reconcileFactureStatutAfterAmountsAction]", e);
    console.error(e);
    return {
      ok: false,
      error: "Une erreur est survenue.",
    };
  }
}

export async function deleteFactureAction(
  id: string,
): Promise<FacturesOk<void>> {
  const auth = await requireBetterAuthSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const rid = id.trim();
  if (!rid) return { ok: false, error: "id requis" };
  try {
    const pool = getPostgresPool();
    await pool.query(`DELETE FROM factures WHERE id = $1`, [rid]);
    return { ok: true, data: undefined };
  } catch (e) {
    logServerError("[deleteFactureAction]", e);
    console.error(e);
    return {
      ok: false,
      error: "Une erreur est survenue.",
    };
  }
}

/** Supprime la facture globale liée à une ligne finance fiche patient. */
export async function deleteFactureByFinanceLineIdAction(
  financeLineId: string,
): Promise<FacturesOk<number>> {
  const auth = await requireBetterAuthSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const fid = financeLineId.trim();
  if (!fid) return { ok: false, error: "financeLineId requis" };
  try {
    const pool = getPostgresPool();
    const r = await pool.query(
      `DELETE FROM factures WHERE actes->>'financeLineId' = $1`,
      [fid],
    );
    return { ok: true, data: r.rowCount ?? 0 };
  } catch (e) {
    logServerError("[deleteFactureByFinanceLineIdAction]", e);
    console.error(e);
    return {
      ok: false,
      error: "Une erreur est survenue.",
    };
  }
}
