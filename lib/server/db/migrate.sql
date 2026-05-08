-- Insérer le cabinet par défaut si absent
INSERT INTO clinics (id, name)
VALUES ('f0000000-0000-4000-8000-000000000001', 'Cabinet Dr. Assil')
ON CONFLICT (id) DO NOTHING;

-- Table patients (alignée sur db/schema.sql)
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

-- Table appointments (alignée db/schema.sql)
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
