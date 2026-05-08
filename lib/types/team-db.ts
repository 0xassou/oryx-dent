export type TeamMemberRole = "admin" | "praticien" | "assistant" | "remplacant";

export interface TeamMemberRow {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  role: TeamMemberRole;
  telephone: string | null;
  specialite: string | null;
  actif: boolean;
  password_hash: string | null;
  must_change_password: boolean;
  /** Mot de passe temporaire en clair tant que le membre n’a pas changé son mot de passe. */
  temp_password_display: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateTeamMemberInput {
  nom: string;
  prenom: string;
  email: string;
  role: TeamMemberRole;
  telephone?: string | null;
  specialite?: string | null;
}

export interface UpdateTeamMemberInput {
  nom?: string;
  prenom?: string;
  role?: TeamMemberRole;
  telephone?: string | null;
  specialite?: string | null;
  actif?: boolean;
}
