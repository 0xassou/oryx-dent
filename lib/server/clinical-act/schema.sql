-- Schéma PostgreSQL minimal pour le Service d'Exécution d'Acte (multi-cabinet).
-- Exécuter une fois sur la base (migration) avant d'utiliser executeClinicalAct.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Cabinet
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clinics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Protocole clinique (par cabinet) — le catalogue métier, distinct du JSON seed UI
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clinical_protocols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  base_price_cents INTEGER NOT NULL CHECK (base_price_cents >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, name)
);

-- Lignes de consommables par défaut du protocole (référence stock du cabinet)
CREATE TABLE IF NOT EXISTS protocol_consumables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol_id UUID NOT NULL REFERENCES clinical_protocols (id) ON DELETE CASCADE,
  stock_product_id TEXT NOT NULL,
  default_quantity NUMERIC(12, 4) NOT NULL CHECK (default_quantity >= 0),
  UNIQUE (protocol_id, stock_product_id)
);

-- ---------------------------------------------------------------------------
-- Stock par cabinet (aligné conceptuellement sur vos produits « dental_stock »)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock_items (
  id TEXT NOT NULL,
  clinic_id UUID NOT NULL REFERENCES clinics (id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  quantity NUMERIC(12, 4) NOT NULL CHECK (quantity >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (clinic_id, id)
);

CREATE INDEX IF NOT EXISTS idx_stock_items_clinic ON stock_items (clinic_id);

-- ---------------------------------------------------------------------------
-- Dossier patient — entrée d'historique clinique (audit + lien facture)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patient_clinical_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id TEXT NOT NULL,
  clinic_id UUID NOT NULL REFERENCES clinics (id) ON DELETE CASCADE,
  protocol_id UUID NOT NULL REFERENCES clinical_protocols (id),
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Snapshot JSON : consommables réellement appliqués (avec overrides) pour traçabilité
  consumables_snapshot JSONB NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_pch_patient ON patient_clinical_history (patient_id);
CREATE INDEX IF NOT EXISTS idx_pch_clinic ON patient_clinical_history (clinic_id);

-- ---------------------------------------------------------------------------
-- Facturation — ligne en attente de paiement
-- ---------------------------------------------------------------------------
CREATE TYPE invoice_line_status AS ENUM ('pending_payment', 'paid', 'cancelled');

CREATE TABLE IF NOT EXISTS invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id TEXT NOT NULL,
  clinic_id UUID NOT NULL REFERENCES clinics (id) ON DELETE CASCADE,
  clinical_history_id UUID NOT NULL UNIQUE REFERENCES patient_clinical_history (id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  status invoice_line_status NOT NULL DEFAULT 'pending_payment',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_patient ON invoice_lines (patient_id);
