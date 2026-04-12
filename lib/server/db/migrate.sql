-- Insérer le cabinet par défaut si absent
INSERT INTO clinics (id, name)
VALUES ('f0000000-0000-4000-8000-000000000001', 'Cabinet Dr. Assil')
ON CONFLICT (id) DO NOTHING;

-- Table patients
CREATE TABLE IF NOT EXISTS patients (
  id TEXT PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  prenom TEXT NOT NULL DEFAULT '',
  nom TEXT NOT NULL DEFAULT '',
  telephone TEXT NOT NULL DEFAULT '',
  email TEXT,
  date_naissance TEXT,
  allergies TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  derniere_visite TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_patients_clinic 
  ON patients(clinic_id);

-- Table appointments
CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id TEXT REFERENCES patients(id) ON DELETE SET NULL,
  patient_name TEXT NOT NULL DEFAULT '',
  date_key TEXT NOT NULL,
  start_time TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  soin TEXT NOT NULL DEFAULT '',
  rdv_type TEXT DEFAULT 'planned',
  status TEXT DEFAULT 'pending',
  urgence BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_appointments_clinic 
  ON appointments(clinic_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date 
  ON appointments(clinic_id, date_key);
