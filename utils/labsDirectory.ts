/**
 * Répertoire des laboratoires partenaires — clé JSONB cabinet `dental_labs_directory`.
 */

"use client";

import { getCabinetValue, persistCabinetPartial } from "@/lib/client/cabinetBlob";

export const DENTAL_LABS_DIRECTORY_KEY = "dental_labs_directory";

export const LABS_DIRECTORY_UPDATED_EVENT = "dental-labs-directory-updated";

export type LabPhoneEntry = {
  label: string;
  numero: string;
};

export type DentalLabPartner = {
  id: string;
  nom: string;
  telephones: LabPhoneEntry[];
  adresse: string;
};

function normalizeTelephones(raw: unknown): LabPhoneEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: LabPhoneEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const label =
      typeof o.label === "string" ? o.label.trim() || "Contact" : "Contact";
    const numero = typeof o.numero === "string" ? o.numero.trim() : "";
    if (numero) out.push({ label, numero });
  }
  return out;
}

function parseLab(raw: unknown): DentalLabPartner | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.nom !== "string") return null;

  let telephones = normalizeTelephones(o.telephones);
  if (
    telephones.length === 0 &&
    typeof o.telephone === "string" &&
    o.telephone.trim()
  ) {
    telephones = [{ label: "Principal", numero: o.telephone.trim() }];
  }
  if (telephones.length === 0) {
    telephones = [{ label: "Principal", numero: "" }];
  }

  return {
    id: o.id,
    nom: o.nom.trim(),
    telephones,
    adresse: typeof o.adresse === "string" ? o.adresse : "",
  };
}

function seedLabs(): DentalLabPartner[] {
  const line = (): LabPhoneEntry[] => [{ label: "Principal", numero: "" }];
  return [
    {
      id: "lab-seed-1",
      nom: "Labo Dentaire Express",
      telephones: line(),
      adresse: "",
    },
    {
      id: "lab-seed-2",
      nom: "Prothèse & Co",
      telephones: line(),
      adresse: "",
    },
    {
      id: "lab-seed-3",
      nom: "ClinPro Lab",
      telephones: line(),
      adresse: "",
    },
  ];
}

export function readLabsDirectoryFromStorage(): DentalLabPartner[] {
  if (typeof window === "undefined") return [];
  try {
    const data = getCabinetValue<unknown>(DENTAL_LABS_DIRECTORY_KEY);
    if (data == null) {
      const seed = seedLabs();
      writeLabsDirectoryToStorage(seed);
      return seed;
    }
    if (!Array.isArray(data)) {
      const seed = seedLabs();
      writeLabsDirectoryToStorage(seed);
      return seed;
    }
    const out: DentalLabPartner[] = [];
    for (const item of data) {
      const lab = parseLab(item);
      if (lab) out.push(lab);
    }
    if (!out.length) {
      const seed = seedLabs();
      writeLabsDirectoryToStorage(seed);
      return seed;
    }
    return out;
  } catch {
    const seed = seedLabs();
    writeLabsDirectoryToStorage(seed);
    return seed;
  }
}

export function writeLabsDirectoryToStorage(items: DentalLabPartner[]) {
  if (typeof window === "undefined") return;
  void persistCabinetPartial({ [DENTAL_LABS_DIRECTORY_KEY]: items });
  window.dispatchEvent(new CustomEvent(LABS_DIRECTORY_UPDATED_EVENT));
}

export function findLabById(
  id: string,
  items: DentalLabPartner[],
): DentalLabPartner | undefined {
  return items.find((l) => l.id === id);
}

export function findLabByName(
  nom: string,
  items: DentalLabPartner[],
): DentalLabPartner | undefined {
  const t = nom.trim().toLowerCase();
  return items.find((l) => l.nom.trim().toLowerCase() === t);
}
