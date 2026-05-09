"use client";

import { mergeCabinetSettingsAction } from "@/app/actions/cabinet-settings";

let blob: Record<string, unknown> = {};
let initialized = false;

export const ORYX_CABINET_READY_EVENT = "oryx-cabinet-ready";

export function replaceCabinetBlobFromServer(data: Record<string, unknown>): void {
  blob = { ...data };
  initialized = true;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(ORYX_CABINET_READY_EVENT));
  }
}

export function isCabinetBlobInitialized(): boolean {
  return initialized;
}

export function getCabinetBlob(): Record<string, unknown> {
  return blob;
}

export function getCabinetValue<T>(key: string): T | undefined {
  return blob[key] as T | undefined;
}

/** Met à jour la copie locale puis persiste en JSONB (fusion). */
export async function persistCabinetPartial(
  partial: Record<string, unknown>,
): Promise<void> {
  const res = await mergeCabinetSettingsAction(partial);
  if (!res.ok) return;
  blob = { ...blob, ...partial };
}
