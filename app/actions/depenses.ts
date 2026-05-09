"use server";

import { randomUUID } from "node:crypto";
import { getPostgresPool } from "@/lib/server/db/pool";
import { requireDepensesAccessSession } from "@/lib/server/auth/require-session";
import { logServerError } from "@/lib/server/logger";

export type DepenseCategorie =
  | "Loyer"
  | "Matériel médical"
  | "Consommables"
  | "Salaires"
  | "Charges sociales"
  | "Electricité/Eau/Gaz"
  | "Maintenance"
  | "Laboratoire"
  | "Formation"
  | "Autre";

export type DepenseRow = {
  id: string;
  categorie: DepenseCategorie | string;
  description: string | null;
  montant: string; // NUMERIC → string
  date: string; // YYYY-MM-DD
  fournisseur: string | null;
  justificatif: string | null;
  created_at: string;
  updated_at: string;
};

export type DepenseInput = {
  categorie: DepenseCategorie | string;
  description?: string | null;
  montant: number;
  date: string; // YYYY-MM-DD
  fournisseur?: string | null;
  justificatif?: string | null;
};

export type DepensesOk<T> = { ok: true; data: T } | { ok: false; error: string };

function toIsoDateOnly(v: unknown): string {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(v ?? "");
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function toIsoTimestamp(v: unknown): string {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
  const s = String(v ?? "");
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString();
}

function mapRow(r: Record<string, unknown>): DepenseRow {
  return {
    id: String(r.id ?? ""),
    categorie: String(r.categorie ?? ""),
    description: r.description == null ? null : String(r.description),
    montant: String(r.montant ?? "0"),
    date: toIsoDateOnly(r.date),
    fournisseur: r.fournisseur == null ? null : String(r.fournisseur),
    justificatif: r.justificatif == null ? null : String(r.justificatif),
    created_at: toIsoTimestamp(r.created_at),
    updated_at: toIsoTimestamp(r.updated_at),
  };
}

export async function getDepensesAction(): Promise<DepensesOk<DepenseRow[]>> {
  const auth = await requireDepensesAccessSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  try {
    const pool = getPostgresPool();
    const { rows } = await pool.query(
      `SELECT * FROM depenses ORDER BY date DESC, created_at DESC`,
    );
    return { ok: true, data: rows.map((x) => mapRow(x as Record<string, unknown>)) };
  } catch (e) {
    logServerError("[getDepensesAction]", e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function createDepenseAction(
  data: DepenseInput & { id?: string },
): Promise<DepensesOk<DepenseRow>> {
  const auth = await requireDepensesAccessSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  try {
    const pool = getPostgresPool();
    const id = data.id?.trim() || randomUUID();
    const day = data.date.trim().slice(0, 10);
    await pool.query(
      `
      INSERT INTO depenses (
        id, categorie, description, montant, date, fournisseur, justificatif
      ) VALUES ($1,$2,$3,$4,$5::date,$6,$7)
      `,
      [
        id,
        String(data.categorie ?? "").trim(),
        data.description ?? null,
        Math.max(0, Number(data.montant) || 0),
        day,
        data.fournisseur ?? null,
        data.justificatif ?? null,
      ],
    );
    const one = await pool.query(`SELECT * FROM depenses WHERE id = $1`, [id]);
    const r = one.rows[0];
    if (!r) return { ok: false, error: "Insertion dépense sans retour" };
    return { ok: true, data: mapRow(r as Record<string, unknown>) };
  } catch (e) {
    logServerError("[createDepenseAction]", e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function updateDepenseAction(
  id: string,
  data: Partial<DepenseInput>,
): Promise<DepensesOk<DepenseRow>> {
  const auth = await requireDepensesAccessSession();
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

    if (data.categorie !== undefined) add("categorie", String(data.categorie ?? "").trim());
    if (data.description !== undefined) add("description", data.description ?? null);
    if (data.montant !== undefined) add("montant", Math.max(0, Number(data.montant) || 0));
    if (data.fournisseur !== undefined) add("fournisseur", data.fournisseur ?? null);
    if (data.justificatif !== undefined) add("justificatif", data.justificatif ?? null);
    if (data.date !== undefined) {
      patches.push(`date = $${i++}::date`);
      vals.push(String(data.date ?? "").trim().slice(0, 10));
    }

    if (patches.length === 0) {
      const { rows } = await pool.query(`SELECT * FROM depenses WHERE id = $1`, [rid]);
      const r = rows[0];
      if (!r) return { ok: false, error: "Dépense introuvable" };
      return { ok: true, data: mapRow(r as Record<string, unknown>) };
    }

    patches.push("updated_at = NOW()");
    vals.push(rid);
    const up = await pool.query(
      `UPDATE depenses SET ${patches.join(", ")} WHERE id = $${i} RETURNING *`,
      vals,
    );
    const r = up.rows[0];
    if (!r) return { ok: false, error: "Dépense introuvable" };
    return { ok: true, data: mapRow(r as Record<string, unknown>) };
  } catch (e) {
    logServerError("[updateDepenseAction]", e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteDepenseAction(id: string): Promise<DepensesOk<void>> {
  const auth = await requireDepensesAccessSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const rid = id.trim();
  if (!rid) return { ok: false, error: "id requis" };
  try {
    const pool = getPostgresPool();
    await pool.query(`DELETE FROM depenses WHERE id = $1`, [rid]);
    return { ok: true, data: undefined };
  } catch (e) {
    logServerError("[deleteDepenseAction]", e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

