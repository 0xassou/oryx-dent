import { getPostgresPool } from "./pool";

const CLINIC_ID = process.env.CLINIC_ID ?? 
  process.env.NEXT_PUBLIC_CLINIC_ID ?? "";

export async function upsertPatientDB(p: {
  id: string;
  prenom: string;
  nom: string;
  telephone: string;
  email?: string;
  notes?: string;
}) {
  const pool = getPostgresPool();
  await pool.query(
    `INSERT INTO patients 
       (id, clinic_id, prenom, nom, telephone, email, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO UPDATE SET
       prenom = EXCLUDED.prenom,
       nom = EXCLUDED.nom,
       telephone = EXCLUDED.telephone,
       email = EXCLUDED.email,
       notes = EXCLUDED.notes,
       derniere_visite = now()`,
    [p.id, CLINIC_ID, p.prenom, p.nom, 
     p.telephone, p.email ?? null, p.notes ?? null]
  );
}

export async function getPatientsDB(): Promise<{
  id: string;
  prenom: string;
  nom: string;
  telephone: string;
  email: string | null;
  created_at: string;
  derniere_visite: string | null;
}[]> {
  const pool = getPostgresPool();
  const { rows } = await pool.query(
    `SELECT id, prenom, nom, telephone, email,
            created_at, derniere_visite
     FROM patients
     WHERE clinic_id = $1
     ORDER BY created_at DESC`,
    [CLINIC_ID]
  );
  return rows;
}
