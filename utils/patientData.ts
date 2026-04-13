/**
 * Source unique des patients (localStorage `dental_patients_data`).
 */

export const DENTAL_PATIENTS_STORAGE_KEY = "dental_patients_data";

function capitalizeStoragePart(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : "";
}

/** IDs 1–4 réservés à la démo : ne pas écraser leur historique d’actes. */
export function isReservedDemoPatientId(id: string): boolean {
  return /^[1-4]$/.test(id.trim());
}

/** Schéma dentaire vide (aucun acte) pour les nouveaux patients. */
export function initializeEmptyDentalChart(patientId: string) {
  if (typeof window === "undefined") return;
  if (isReservedDemoPatientId(patientId)) return;
  try {
    localStorage.setItem(`patient_acts_${patientId}`, JSON.stringify([]));
  } catch (e) {
    console.error("Storage error:", e);
  }
}

export type DentalPatientRecord = {
  id: string;
  nom: string;
  prenom: string;
  telephone: string;
  /** ISO 8601 */
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

function parseRecord(raw: unknown): DentalPatientRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string") return null;
  return {
    id: o.id,
    nom: typeof o.nom === "string" ? o.nom : "",
    prenom: typeof o.prenom === "string" ? o.prenom : "",
    telephone: typeof o.telephone === "string" ? o.telephone : "",
    derniereVisite:
      typeof o.derniereVisite === "string"
        ? o.derniereVisite
        : new Date().toISOString(),
  };
}

/** Données de démo (Karim, Sarah, Marie) — éditables après migration. */
export function getSeedPatients(): DentalPatientRecord[] {
  const t = new Date("2026-03-15T10:00:00.000Z").toISOString();
  return [
    {
      id: "1",
      prenom: "Karim",
      nom: "Haddad",
      telephone: "06 12 34 56 78",
      derniereVisite: t,
    },
    {
      id: "2",
      prenom: "Sarah",
      nom: "Benali",
      telephone: "06 98 76 54 32",
      derniereVisite: t,
    },
    {
      id: "3",
      prenom: "Marie",
      nom: "Dupont",
      telephone: "07 11 22 33 44",
      derniereVisite: t,
    },
  ];
}

export function readPatientsFromStorage(): DentalPatientRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(DENTAL_PATIENTS_STORAGE_KEY);
    if (raw == null || raw === "") return [];
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    const out: DentalPatientRecord[] = [];
    for (const item of data) {
      const r = parseRecord(item);
      if (r) out.push(r);
    }
    return out;
  } catch (e) {
    console.error("Storage error:", e);
    return [];
  }
}

export function writePatientsToStorage(patients: DentalPatientRecord[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      DENTAL_PATIENTS_STORAGE_KEY,
      JSON.stringify(patients),
    );
  } catch (e) {
    console.error("Storage error:", e);
  }
}

/** Si vide : enregistre les patients de démo et les retourne. */
export function ensurePatientsHydrated(): DentalPatientRecord[] {
  const existing = readPatientsFromStorage();
  if (existing.length > 0) return existing;
  const seed = getSeedPatients();
  writePatientsToStorage(seed);
  return seed;
}

export function newPatientId(): string {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function upsertPatientInStorage(record: DentalPatientRecord) {
  const list = readPatientsFromStorage();
  const idx = list.findIndex((p) => p.id === record.id);
  if (idx >= 0) {
    list[idx] = record;
  } else {
    list.unshift(record);
  }
  writePatientsToStorage(list);
}

/** Met à jour ou crée, et pousse `derniereVisite` si fourni. */
export function upsertPatientFields(
  partial: Partial<DentalPatientRecord> & { id: string },
) {
  const list = readPatientsFromStorage();
  const idx = list.findIndex((p) => p.id === partial.id);
  const now = new Date().toISOString();
  if (idx >= 0) {
    const prev = list[idx];
    list[idx] = {
      ...prev,
      ...partial,
      derniereVisite: partial.derniereVisite ?? prev.derniereVisite,
    };
  } else {
    list.unshift({
      id: partial.id,
      nom: capitalizeStoragePart(partial.nom ?? ""),
      prenom: capitalizeStoragePart(partial.prenom ?? ""),
      telephone: partial.telephone ?? "",
      derniereVisite: partial.derniereVisite ?? now,
      createdAt: new Date().toISOString(),
    });
  }
  writePatientsToStorage(list);
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

export function touchPatientDerniereVisite(patientId: string) {
  const list = readPatientsFromStorage();
  const idx = list.findIndex((p) => p.id === patientId);
  if (idx < 0) return;
  list[idx] = {
    ...list[idx],
    derniereVisite: new Date().toISOString(),
  };
  writePatientsToStorage(list);
}

/** Synchronise la liste globale depuis une fiche (nom complet + téléphone). */
export function syncPatientFromProfile(args: {
  id: string;
  nomComplet: string;
  telephone: string;
  touchVisit?: boolean;
}) {
  const { prenom, nom } = splitNomComplet(args.nomComplet);
  upsertPatientFields({
    id: args.id,
    prenom: prenom || args.nomComplet.trim(),
    nom: nom || "",
    telephone: args.telephone.trim() || "—",
    ...(args.touchVisit ? { derniereVisite: new Date().toISOString() } : {}),
  });
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

export function writeMinimalPatientProfile(profile: MinimalPatientProfileForLs) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      `patient_profile_${profile.id}`,
      JSON.stringify(profile),
    );
  } catch (e) {
    console.error("Storage error:", e);
  }
}

/** Création rapide (facture / entrée) : enregistre liste + profil minimal pour ouvrir la fiche. */
export function createPatientQuick(args: {
  prenom: string;
  nom: string;
  telephone: string;
  /** Allergies / antécédents (optionnel) */
  medicalNote?: string;
}): DentalPatientRecord {
  const id = newPatientId();
  const now = new Date().toISOString();
  const note = args.medicalNote?.trim();
  const record: DentalPatientRecord = {
    id,
    prenom: capitalizeStoragePart(args.prenom.trim()),
    nom: capitalizeStoragePart(args.nom.trim()),
    telephone: args.telephone.trim() || "—",
    derniereVisite: now,
    createdAt: new Date().toISOString(),
  };
  upsertPatientInStorage(record);
  const fullName = displayPatientName(record);
  writeMinimalPatientProfile({
    id,
    nom: fullName,
    age: 0,
    genre: "—",
    profession: "—",
    adresse: "—",
    telephone: record.telephone,
    email: "—",
    dateNaissance: "",
    alerts: note ? [note] : [],
  });
  initializeEmptyDentalChart(id);
  return record;
}
