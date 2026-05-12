/**
 * Helpers côté client pour les radiologies par patient.
 * Stockage : JSONB cabinet (`dental_patient_radios`), via cabinetBlob.
 */

"use client";

import { getCabinetValue, persistCabinetPartial } from "@/lib/client/cabinetBlob";
import {
  DENTAL_PATIENT_RADIOS_KEY,
  parseRadio,
  sortRadios,
  type PatientRadio,
} from "@/utils/patientRadios.shared";

// Ré-exporte tout pour que les composants n'importent que depuis ce fichier.
export * from "@/utils/patientRadios.shared";

// ---------------------------------------------------------------------------
// Store helpers (côté client uniquement)
// ---------------------------------------------------------------------------

type Store = Record<string, PatientRadio[]>;

function readStore(): Store {
  if (typeof window === "undefined") return {};
  try {
    const data = getCabinetValue<unknown>(DENTAL_PATIENT_RADIOS_KEY);
    if (!data || typeof data !== "object") return {};
    return data as Store;
  } catch {
    return {};
  }
}

function writeStore(store: Store): void {
  if (typeof window === "undefined") return;
  void persistCabinetPartial({ [DENTAL_PATIENT_RADIOS_KEY]: store });
}

export function listRadiosForPatient(patientId: string): PatientRadio[] {
  if (!patientId) return [];
  const store = readStore();
  const list = store[patientId];
  if (!Array.isArray(list)) return [];
  const parsed: PatientRadio[] = [];
  for (const item of list) {
    const r = parseRadio(item);
    if (r) parsed.push(r);
  }
  return sortRadios(parsed);
}

export function addRadioForPatient(
  patientId: string,
  partial: Omit<PatientRadio, "id" | "createdAt">,
): PatientRadio {
  const radio: PatientRadio = {
    id: `radio-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    createdAt: new Date().toISOString(),
    ...partial,
  };
  const store = readStore();
  const prev = store[patientId] ?? [];
  store[patientId] = [...prev, radio];
  writeStore(store);
  return radio;
}

export function removeRadioForPatient(
  patientId: string,
  radioId: string,
): boolean {
  if (!patientId || !radioId) return false;
  const store = readStore();
  const raw = store[patientId];
  if (!Array.isArray(raw)) return false;
  const next = raw.filter((item) => {
    const r = parseRadio(item);
    return r != null && r.id !== radioId;
  });
  if (next.length === raw.length) return false;
  store[patientId] = next;
  writeStore(store);
  return true;
}

/** Purge toutes les radios du patient (appelé lors de la suppression patient). */
export function clearPatientRadios(patientId: string): void {
  if (!patientId || typeof window === "undefined") return;
  const store = readStore();
  if (!(patientId in store)) return;
  delete store[patientId];
  writeStore(store);
}
