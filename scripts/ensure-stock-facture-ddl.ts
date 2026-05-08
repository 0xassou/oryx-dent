/**
 * DDL stocks / factures (aligné sur db/schema.sql), exécutable sans psql.
 * Idempotent via IF NOT EXISTS.
 *
 * Les factures référencent `patients` : utiliser ensureFacturesDdl après
 * que la table patients existe (schéma principal du projet).
 */

import type { Pool } from "pg";

export async function ensureStocksDdl(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stocks (
      id            TEXT PRIMARY KEY,
      nom           TEXT NOT NULL,
      categorie     TEXT,
      quantite      INTEGER DEFAULT 0,
      quantite_min  INTEGER DEFAULT 0,
      unite         TEXT,
      prix_unitaire NUMERIC(10,2),
      fournisseur   TEXT,
      notes         TEXT,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_stocks_nom ON stocks(nom)`,
  );
}

export async function ensureFacturesDdl(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS factures (
      id            TEXT PRIMARY KEY,
      patient_id    TEXT REFERENCES patients(id) ON DELETE SET NULL,
      date          DATE NOT NULL,
      montant       NUMERIC(10,2) DEFAULT 0,
      montant_paye  NUMERIC(10,2) DEFAULT 0,
      statut        TEXT DEFAULT 'en_attente',
      actes         JSONB,
      notes         TEXT,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_factures_patient ON factures(patient_id)`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_factures_date ON factures(date)`,
  );
}
