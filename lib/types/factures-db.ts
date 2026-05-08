/** Modèle Factures (PostgreSQL, JOIN patient optionnel). */

export type FactureRowJoined = {
  id: string;
  patient_id: string | null;
  date: string;
  montant: string;
  montant_paye: string;
  statut: string | null;
  actes: unknown;
  notes: string | null;
  created_at: string;
  updated_at: string;
  nom: string | null;
  prenom: string | null;
};

export type FactureInput = {
  patient_id?: string | null;
  date: string;
  montant: number;
  montant_paye?: number;
  statut?: string | null;
  actes?: unknown;
  notes?: string | null;
};
