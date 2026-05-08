-- Module Patients — schéma PostgreSQL
-- Appliquer : psql "$DATABASE_URL" -f db/schema.sql

CREATE TABLE IF NOT EXISTS patients (
  id            TEXT PRIMARY KEY,
  nom           TEXT NOT NULL,
  prenom        TEXT NOT NULL,
  telephone     TEXT,
  email         TEXT,
  date_naissance DATE,
  sexe          TEXT,
  adresse       TEXT,
  mutuelle      TEXT,
  antecedents   TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Mise à niveau depuis l’ancien schéma (lib/server/db/migrate.sql)
DROP INDEX IF EXISTS idx_patients_clinic;

ALTER TABLE patients ADD COLUMN IF NOT EXISTS sexe TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS adresse TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS mutuelle TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS antecedents TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE patients ADD COLUMN IF NOT EXISTS notes TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'patients' AND column_name = 'allergies'
  ) THEN
    UPDATE patients
    SET antecedents = COALESCE(antecedents, allergies)
    WHERE antecedents IS NULL AND allergies IS NOT NULL;
  END IF;
END $$;

ALTER TABLE patients DROP COLUMN IF EXISTS allergies;
ALTER TABLE patients DROP COLUMN IF EXISTS clinic_id;
ALTER TABLE patients DROP COLUMN IF EXISTS derniere_visite;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'patients'
      AND column_name = 'date_naissance' AND udt_name = 'text'
  ) THEN
    ALTER TABLE patients
      ALTER COLUMN date_naissance TYPE DATE
      USING NULLIF(TRIM(date_naissance::text), '')::date;
  END IF;
END $$;

-- Module Rendez-vous — remplace l’ancienne table avec clinic_id si présente
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'appointments'
  )
  AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'appointments'
      AND column_name = 'clinic_id'
  ) THEN
    DROP TABLE appointments CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS appointments (
  id            TEXT PRIMARY KEY,
  patient_id    TEXT REFERENCES patients(id) ON DELETE CASCADE,
  date          DATE NOT NULL,
  heure         TEXT NOT NULL,
  duree         INTEGER DEFAULT 30,
  type_acte     TEXT,
  statut        TEXT DEFAULT 'confirme',
  notes         TEXT,
  praticien     TEXT,
  salle         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(date);
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id);

-- Module Stocks (remplace dental_stock localStorage)
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
);

CREATE INDEX IF NOT EXISTS idx_stocks_nom ON stocks(nom);

-- Module Factures (remplace dental_dashboard_docs localStorage)
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
);

CREATE INDEX IF NOT EXISTS idx_factures_patient ON factures(patient_id);
CREATE INDEX IF NOT EXISTS idx_factures_date ON factures(date);

-- Module Laboratoire (remplace dental_lab_commandes localStorage)
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
);

CREATE INDEX IF NOT EXISTS idx_commandes_labo_patient ON commandes_labo(patient_id);
CREATE INDEX IF NOT EXISTS idx_commandes_labo_created ON commandes_labo(created_at);
