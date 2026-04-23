/**
 * Rendez-vous partagés (Planning ↔ Dashboard).
 * Clé localStorage : dental_appointments_data
 */

export const DENTAL_APPOINTMENTS_STORAGE_KEY = "dental_appointments_data";

/** Émis après chaque écriture du planning (sync module Laboratoire, etc.). */
export const APPOINTMENTS_UPDATED_EVENT = "dental-appointments-updated";

export type AppointmentRdv = {
  id: string;
  /** YYYY-MM-DD local */
  dateKey: string;
  start: string;
  durationMinutes: number;
  patient: string;
  soin: string;
  urgence?: boolean;
  /** RDV créé depuis le planning vs entrée directe dashboard */
  rdvType?: "planned" | "direct";
  patientId?: string;
  status?: "pending" | "confirmed" | "done";
};

/** Date valide pour calculs ; sinon aujourd'hui (évite Invalid Date / crash toISOString). */
export function safeDate(d: Date | null | undefined): Date {
  if (d == null || !(d instanceof Date) || Number.isNaN(d.getTime())) {
    return new Date();
  }
  return d;
}

export function toISOStringSafe(d: Date | null | undefined): string {
  return safeDate(d).toISOString();
}

/** Partie date YYYY-MM-DD (UTC) à partir d'une Date potentiellement invalide. */
export function toISODateOnlySafe(d: Date | null | undefined): string {
  return toISOStringSafe(d).split("T")[0] ?? "";
}

/** Date locale au format YYYY-MM-DD (pour inputs type="date" et stockage). */
export function formatDateKeyLocal(d: Date): string {
  const x = safeDate(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Valeur initiale sûre pour les champs date : jamais vide à l’affichage. */
export function todayDateInputValue(): string {
  return formatDateKeyLocal(new Date());
}

export function isValidDateKeyString(s: string | undefined | null): boolean {
  if (s == null || typeof s !== "string") return false;
  const t = s.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return false;
  const d = new Date(`${t}T12:00:00`);
  return !isNaN(d.getTime());
}

/**
 * Heure actuelle arrondie à la dizaine de minutes supérieure (plafonnée à 23:50).
 * Pour les urgences : heure de début par défaut.
 */
export function roundStartTimeToNextTenMinutes(d: Date = new Date()): string {
  const base = safeDate(d);
  let minutes = base.getHours() * 60 + base.getMinutes();
  if (base.getSeconds() > 0 || base.getMilliseconds() > 0) {
    minutes += 1;
  }
  let rounded = Math.ceil(minutes / 10) * 10;
  if (rounded >= 24 * 60) {
    rounded = 23 * 60 + 50;
  }
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function parseRdv(raw: unknown): AppointmentRdv | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const dateKeyRaw =
    typeof o.dateKey === "string" ? o.dateKey.trim() : "";
  if (
    typeof o.id !== "string" ||
    !dateKeyRaw ||
    !isValidDateKeyString(dateKeyRaw) ||
    typeof o.start !== "string" ||
    typeof o.patient !== "string" ||
    typeof o.soin !== "string"
  ) {
    return null;
  }
  const duration =
    typeof o.durationMinutes === "number"
      ? o.durationMinutes
      : Number(o.durationMinutes) || 30;
  return {
    id: o.id,
    dateKey: dateKeyRaw,
    start: o.start.length >= 5 ? o.start.slice(0, 5) : o.start,
    durationMinutes: duration,
    patient: o.patient,
    soin: o.soin,
    urgence: o.urgence === true,
    rdvType:
      o.rdvType === "direct"
        ? "direct"
        : o.rdvType === "planned"
          ? "planned"
          : undefined,
    patientId: typeof o.patientId === "string" ? o.patientId : undefined,
    status:
      o.status === "done"
        ? "done"
        : o.status === "confirmed"
          ? "confirmed"
          : o.status === "pending"
            ? "pending"
            : undefined,
  };
}

export function readAppointmentsFromStorage(): AppointmentRdv[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(DENTAL_APPOINTMENTS_STORAGE_KEY);
    if (raw == null || raw === "") return [];
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    const out: AppointmentRdv[] = [];
    for (const item of data) {
      const r = parseRdv(item);
      if (r) out.push(r);
    }
    if (out.length !== data.length) {
      writeAppointmentsToStorage(out);
    }
    return out;
  } catch (e) {
    console.error("Storage error:", e);
    return [];
  }
}

export function writeAppointmentsToStorage(
  items: AppointmentRdv[],
  options?: { silent?: boolean },
) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      DENTAL_APPOINTMENTS_STORAGE_KEY,
      JSON.stringify(items),
    );
    if (!options?.silent) {
      window.dispatchEvent(new CustomEvent(APPOINTMENTS_UPDATED_EVENT));
    }
  } catch (e) {
    console.error("Storage error:", e);
  }
}

/** Si le stockage est vide, initialise avec la graine (ex. démo planning). */
export function ensureAppointmentsSeeded(seed: AppointmentRdv[]): AppointmentRdv[] {
  if (typeof window === "undefined") return seed;
  const cur = readAppointmentsFromStorage();
  if (cur.length > 0) return cur;
  writeAppointmentsToStorage(seed);
  return seed;
}

/** Heure locale HH:mm */
export function formatTimeHHmmLocal(d: Date): string {
  return safeDate(d).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Ajoute un créneau « entrée directe » à l’agenda (aujourd’hui, heure actuelle).
 */
export function appendDirectEntryAppointment(args: {
  patientName: string;
  patientId?: string | null;
  visitKind: "consultation" | "urgence";
  at?: Date;
}): AppointmentRdv {
  const d = safeDate(args.at ?? undefined);
  const dateKey = formatDateKeyLocal(d);
  const start = formatTimeHHmmLocal(d);
  const rdv: AppointmentRdv = {
    id: `direct-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    dateKey,
    start,
    durationMinutes: 30,
    patient: args.patientName.trim(),
    soin:
      args.visitKind === "urgence"
        ? "Urgence (entrée directe)"
        : "Consultation (entrée directe)",
    urgence: args.visitKind === "urgence",
    rdvType: "direct",
    status: "pending",
    ...(args.patientId ? { patientId: args.patientId } : {}),
  };
  const list = readAppointmentsFromStorage();
  list.push(rdv);
  writeAppointmentsToStorage(list);
  return rdv;
}
