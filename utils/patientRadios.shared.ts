/**
 * Types et fonctions pures pour les radiologies par patient.
 * Aucune dépendance côté client (window, cabinetBlob…) — importable
 * depuis les Server Actions ET les composants client.
 */

export const DENTAL_PATIENT_RADIOS_KEY = "dental_patient_radios";

/** 10 Mo max */
export const RADIO_MAX_BYTES = 10 * 1024 * 1024;

export const RADIO_ACCEPTED_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export type RadioMime = (typeof RADIO_ACCEPTED_MIMES)[number];

export const TOOTH_SPECIAL_VALUES = [
  { value: "panoramique", label: "Panoramique" },
  { value: "retro-alveolaire", label: "Rétro-alvéolaire" },
  { value: "autre", label: "Autre" },
] as const;

export const TOOTH_SELECT_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Dent — non renseignée" },
  ...Array.from({ length: 32 }, (_, i) => ({
    value: String(i + 1),
    label: `Dent ${i + 1}`,
  })),
  ...TOOTH_SPECIAL_VALUES,
];

export function toothLabel(tooth: string | null): string {
  if (!tooth) return "—";
  const opt = TOOTH_SELECT_OPTIONS.find((o) => o.value === tooth);
  return opt ? opt.label : tooth;
}

export type PatientRadio = {
  id: string;
  /** data URL (image ou PDF) */
  url: string;
  mimeType: string;
  fileName: string;
  /** YYYY-MM-DD */
  date: string;
  /** "1".."32" | "panoramique" | "retro-alveolaire" | "autre" | null */
  tooth: string | null;
  note: string | null;
  /** ISO datetime — tri secondaire */
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export function parseRadio(raw: unknown): PatientRadio | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (
    typeof o.id !== "string" ||
    typeof o.url !== "string" ||
    typeof o.mimeType !== "string" ||
    typeof o.fileName !== "string" ||
    typeof o.date !== "string" ||
    typeof o.createdAt !== "string"
  ) {
    return null;
  }
  return {
    id: o.id,
    url: o.url,
    mimeType: o.mimeType,
    fileName: o.fileName,
    date: o.date,
    tooth: typeof o.tooth === "string" ? o.tooth : null,
    note: typeof o.note === "string" ? o.note : null,
    createdAt: o.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Tri
// ---------------------------------------------------------------------------

/** Plus récent en premier (date primaire, createdAt secondaire). */
export function sortRadios(radios: PatientRadio[]): PatientRadio[] {
  return [...radios].sort((a, b) => {
    const d = b.date.localeCompare(a.date);
    if (d !== 0) return d;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

// ---------------------------------------------------------------------------
// Validation (pure)
// ---------------------------------------------------------------------------

export function isAcceptedRadioMime(mime: string): mime is RadioMime {
  return (RADIO_ACCEPTED_MIMES as readonly string[]).includes(mime);
}

/** Taille approx en octets depuis un data URL base64. */
export function dataUrlApproxBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma === -1) return dataUrl.length;
  const base64 = dataUrl.slice(comma + 1);
  return Math.floor(base64.length * 0.75);
}
