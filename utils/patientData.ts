/**
 * Données patient côté client : profil et actes cockpit dans `patient_ui_state`
 * (Server Actions). La liste des patients est en PostgreSQL.
 */

import type { PatientRow } from "@/lib/types/patients-db";
import { mergePatientUiStateAction } from "@/app/actions/patient-ui-state";

export function capitalizeStoragePart(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : "";
}

/** IDs 1–4 réservés à la démo : ne pas écraser leur historique d'actes. */
export function isReservedDemoPatientId(id: string): boolean {
  return /^[1-4]$/.test(id.trim());
}

/** Schéma dentaire vide (aucun acte cockpit) pour les nouveaux patients. */
export async function initializeEmptyDentalChart(patientId: string) {
  if (typeof window === "undefined") return;
  if (isReservedDemoPatientId(patientId)) return;
  await mergePatientUiStateAction(patientId, { acts: [] });
}

export type DentalPatientRecord = {
  id: string;
  nom: string;
  prenom: string;
  telephone: string;
  /** ISO 8601 — aligné sur `updated_at` en base */
  derniereVisite: string;
  createdAt?: string;
};

export function displayPatientName(p: DentalPatientRecord): string {
  return `${p.prenom} ${p.nom}`.trim() || p.nom || p.prenom || "—";
}

/** Découpe « Prénom Nom … » : dernier token = nom de famille. */
export function splitNomComplet(full: string): { prenom: string; nom: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { prenom: "", nom: "" };
  if (parts.length === 1) return { prenom: "", nom: parts[0] };
  return {
    prenom: parts.slice(0, -1).join(" "),
    nom: parts[parts.length - 1],
  };
}

/**
 * Prénom / nom affichables : priorité à l’enregistrement PostgreSQL (`DentalPatientRecord`),
 * sinon profil local (éventuellement nom complet historique dans `nom` seul).
 */
export function resolvePatientDisplayParts(
  patientRecord: DentalPatientRecord | null,
  patientProfile: { prenom?: string; nom: string },
): { prenom: string; nom: string } {
  if (patientRecord) {
    const p = String(patientRecord.prenom ?? "").trim();
    const n = String(patientRecord.nom ?? "").trim();
    if (p || n) return { prenom: p, nom: n };
  }
  const ppP = String(patientProfile.prenom ?? "").trim();
  const ppN = String(patientProfile.nom ?? "").trim();
  if (ppP) return { prenom: ppP, nom: ppN };
  if (/^patient\s*#/i.test(ppN)) return { prenom: "", nom: "" };
  return splitNomComplet(ppN);
}

export function patientRowToDentalPatientRecord(
  row: PatientRow,
): DentalPatientRecord {
  const derniereVisite = row.updated_at
    ? new Date(row.updated_at).toISOString()
    : new Date(row.created_at).toISOString();
  return {
    id: row.id,
    nom: row.nom,
    prenom: row.prenom,
    telephone: row.telephone ?? "",
    derniereVisite,
    createdAt: row.created_at
      ? new Date(row.created_at).toISOString()
      : undefined,
  };
}

export function computeAgeFromDateIso(dateValue: string): number {
  if (!dateValue) return 0;
  const dob = new Date(dateValue);
  if (Number.isNaN(dob.getTime())) return 0;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
  return Math.max(0, age);
}

export type MinimalPatientProfileForLs = {
  id: string;
  nom: string;
  age: number;
  genre: string;
  profession: string;
  adresse: string;
  telephone: string;
  email: string;
  dateNaissance: string;
  alerts: string[];
};

export async function writeMinimalPatientProfile(
  profile: MinimalPatientProfileForLs,
) {
  if (typeof window === "undefined") return;
  await mergePatientUiStateAction(profile.id, {
    profile: {
      id: profile.id,
      nom: profile.nom,
      age: profile.age,
      genre: profile.genre,
      profession: profile.profession,
      adresse: profile.adresse,
      telephone: profile.telephone,
      email: profile.email,
      dateNaissance: profile.dateNaissance,
      telephoneSecondaire: "",
      groupeSanguin: "",
      mutuelle: "",
      premiereVisite: "",
      statut: "actif",
      alerts: profile.alerts.map((label) => ({
        label,
        level: "warning" as const,
      })),
    },
  });
}
