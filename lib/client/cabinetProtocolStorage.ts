"use client";

import { getCabinetBlob, persistCabinetPartial } from "@/lib/client/cabinetBlob";

/**
 * Adaptateur Storage pour `loadProtocolsFromStorage` / `saveProtocolsToStorage`
 * — persistance dans `cabinet_settings` (JSONB) au lieu du localStorage.
 */
export function getCabinetProtocolsStorage(): Pick<Storage, "getItem" | "setItem"> {
  return {
    getItem(key: string) {
      const v = getCabinetBlob()[key];
      if (v === undefined || v === null) return null;
      if (typeof v === "string") return v;
      return JSON.stringify(v);
    },
    setItem(key: string, value: string) {
      try {
        const parsed: unknown = JSON.parse(value);
        void persistCabinetPartial({ [key]: parsed });
      } catch {
        /* ignore */
      }
    },
  };
}
