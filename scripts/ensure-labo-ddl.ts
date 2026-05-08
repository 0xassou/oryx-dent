/**
 * DDL commandes_labo (aligné sur db/schema.sql), exécutable sans psql.
 * Idempotent via IF NOT EXISTS.
 */

import type { Pool } from "pg";

export async function ensureCommandesLaboDdl(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS commandes_labo (
      id              TEXT PRIMARY KEY,
      patient_id      TEXT REFERENCES patients(id) ON DELETE SET NULL,
      patient_nom     TEXT,
      travail         TEXT NOT NULL,
      laboratoire     TEXT,
      dent            TEXT,
      materiau        TEXT,
      teinte          TEXT,
      cout_labo       NUMERIC(10,2) DEFAULT 0,
      statut          TEXT DEFAULT 'en_attente',
      date_retour     DATE,
      date_pose       DATE,
      rdv_pose_id     TEXT,
      rdv_retour_id   TEXT,
      notes           TEXT,
      historique      JSONB DEFAULT '[]',
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_commandes_labo_patient ON commandes_labo(patient_id)`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_commandes_labo_created ON commandes_labo(created_at)`,
  );
}

