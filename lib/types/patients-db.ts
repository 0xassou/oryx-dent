/**
 * Types alignés sur la table PostgreSQL `patients` (module Patients).
 */

export type PatientRow = {
  id: string;
  nom: string;
  prenom: string;
  telephone: string | null;
  telephone2: string | null;
  email: string | null;
  /** YYYY-MM-DD */
  date_naissance: string | null;
  groupe_sanguin: string | null;
  sexe: string | null;
  adresse: string | null;
  mutuelle: string | null;
  mutuelle_nom: string | null;
  mutuelle_numero: string | null;
  antecedents: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  /** Présent quand la liste patients charge les comptages en une requête. */
  rdv_count?: number;
};

export type PatientInput = {
  nom: string;
  prenom: string;
  telephone?: string | null;
  telephone2?: string | null;
  email?: string | null;
  date_naissance?: string | null;
  groupe_sanguin?: string | null;
  sexe?: string | null;
  adresse?: string | null;
  mutuelle?: string | null;
  mutuelle_nom?: string | null;
  mutuelle_numero?: string | null;
  antecedents?: string | null;
  notes?: string | null;
};

/** Création : `id` optionnel (ex. dossiers existants / démo), sinon UUID serveur. */
export type CreatePatientInput = PatientInput & { id?: string };
