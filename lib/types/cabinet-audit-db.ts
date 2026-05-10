/** Journal de traçabilité cabinet (`cabinet_audit_log`). */

export type CabinetAuditEntityType =
  | "patient"
  | "appointment"
  | "facture"
  | "stock"
  | "commande_labo";

export type CabinetAuditActionType =
  | "patient_cree"
  | "patient_mis_a_jour"
  | "patient_profil_etendu_mis_a_jour"
  | "patient_acte_ajoute"
  | "patient_acte_modifie"
  | "rdv_cree"
  | "rdv_modifie"
  | "facture_creee"
  | "facture_modifiee"
  | "stock_cree"
  | "stock_modifie"
  | "commande_labo_creee"
  | "commande_labo_modifiee";

export type CabinetAuditLogRow = {
  id: string;
  created_at: string;
  user_id: string;
  display_name: string;
  role: string;
  action_type: CabinetAuditActionType | string;
  entity_type: CabinetAuditEntityType | string;
  entity_id: string | null;
  patient_id: string | null;
  summary: string | null;
  metadata: Record<string, unknown> | null;
};

export type CabinetAppointmentTrace = {
  created_by_user_id: string | null;
  created_by_display_name: string | null;
  created_by_role: string | null;
  updated_by_user_id: string | null;
  updated_by_display_name: string | null;
  updated_by_role: string | null;
};
