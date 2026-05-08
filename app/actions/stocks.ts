"use server";

import { randomUUID } from "crypto";
import { getPostgresPool } from "@/lib/server/db/pool";
import type { StockInput, StockRow } from "@/lib/types/stocks-db";

const SELECT = `
  SELECT
    id,
    nom,
    categorie,
    quantite,
    quantite_min,
    unite,
    prix_unitaire::text AS prix_unitaire,
    fournisseur,
    notes,
    created_at::text AS created_at,
    updated_at::text AS updated_at
  FROM stocks
`;

export type StocksOk<T> = { ok: true; data: T } | { ok: false; error: string };

function mapRow(r: Record<string, unknown>): StockRow {
  return {
    id: String(r.id ?? ""),
    nom: String(r.nom ?? ""),
    categorie: r.categorie != null ? String(r.categorie) : null,
    quantite: Number(r.quantite) || 0,
    quantite_min: Number(r.quantite_min) || 0,
    unite: r.unite != null ? String(r.unite) : null,
    prix_unitaire: r.prix_unitaire != null ? String(r.prix_unitaire) : null,
    fournisseur: r.fournisseur != null ? String(r.fournisseur) : null,
    notes: r.notes != null ? String(r.notes) : null,
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
  };
}

export async function getStocksAction(): Promise<StocksOk<StockRow[]>> {
  try {
    const pool = getPostgresPool();
    const { rows } = await pool.query(`${SELECT} ORDER BY nom ASC`);
    return { ok: true, data: rows.map((r) => mapRow(r as Record<string, unknown>)) };
  } catch (e) {
    console.error("[getStocksAction]", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function createStockAction(
  data: StockInput & { id?: string },
): Promise<StocksOk<StockRow>> {
  try {
    const id = data.id?.trim() || randomUUID();
    const pool = getPostgresPool();
    await pool.query(
      `INSERT INTO stocks (
          id, nom, categorie, quantite, quantite_min,
          unite, prix_unitaire, fournisseur, notes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        id,
        data.nom.trim(),
        data.categorie ?? null,
        data.quantite ?? 0,
        data.quantite_min ?? 0,
        data.unite ?? null,
        data.prix_unitaire === null || data.prix_unitaire === undefined || data.prix_unitaire === ""
          ? null
          : Number(data.prix_unitaire),
        data.fournisseur ?? null,
        data.notes ?? null,
      ],
    );
    const one = await pool.query(`${SELECT} WHERE id = $1`, [id]);
    const row = one.rows[0];
    if (!row) return { ok: false, error: "Insertion stock sans retour" };
    return { ok: true, data: mapRow(row as Record<string, unknown>) };
  } catch (e) {
    console.error("[createStockAction]", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function updateStockAction(
  id: string,
  data: Partial<StockInput>,
): Promise<StocksOk<StockRow>> {
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

    if (data.nom !== undefined) add("nom", data.nom.trim());
    if (data.categorie !== undefined) add("categorie", data.categorie);
    if (data.quantite !== undefined) add("quantite", data.quantite ?? 0);
    if (data.quantite_min !== undefined) add("quantite_min", data.quantite_min ?? 0);
    if (data.unite !== undefined) add("unite", data.unite);
    if (data.prix_unitaire !== undefined) {
      add(
        "prix_unitaire",
        data.prix_unitaire === null || data.prix_unitaire === ""
          ? null
          : Number(data.prix_unitaire),
      );
    }
    if (data.fournisseur !== undefined) add("fournisseur", data.fournisseur);
    if (data.notes !== undefined) add("notes", data.notes);

    if (patches.length === 0) {
      const { rows } = await pool.query(`${SELECT} WHERE id = $1`, [rid]);
      const r = rows[0];
      if (!r) return { ok: false, error: "Produit introuvable" };
      return { ok: true, data: mapRow(r as Record<string, unknown>) };
    }

    patches.push("updated_at = NOW()");
    vals.push(rid);
    await pool.query(
      `UPDATE stocks SET ${patches.join(", ")} WHERE id = $${i}`,
      vals,
    );
    const { rows } = await pool.query(`${SELECT} WHERE id = $1`, [rid]);
    const r = rows[0];
    if (!r) return { ok: false, error: "Produit introuvable après mise à jour" };
    return { ok: true, data: mapRow(r as Record<string, unknown>) };
  } catch (e) {
    console.error("[updateStockAction]", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function deleteStockAction(
  id: string,
): Promise<StocksOk<void>> {
  const rid = id.trim();
  if (!rid) return { ok: false, error: "id requis" };
  try {
    const pool = getPostgresPool();
    await pool.query(`DELETE FROM stocks WHERE id = $1`, [rid]);
    return { ok: true, data: undefined };
  } catch (e) {
    console.error("[deleteStockAction]", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
