/** Ligne brute `appointments` (PostgreSQL snake_case via `pg`). */
export type AppointmentRow = {
  id: string;
  patient_id: string | null;
  date: string; // ISO date YYYY-MM-DD
  heure: string;
  duree: number;
  type_acte: string | null;
  statut: string | null;
  notes: string | null;
  praticien: string | null;
  salle: string | null;
  created_at: string;
  updated_at: string;
};

/** Résultat de jointure `patients`. */
export type AppointmentRowJoined = AppointmentRow & {
  nom: string | null;
  prenom: string | null;
};

export type AppointmentInput = {
  patient_id?: string | null;
  date: string;
  heure: string;
  duree?: number;
  type_acte?: string | null;
  statut?: string | null;
  notes?: string | null;
  praticien?: string | null;
  salle?: string | null;
};
