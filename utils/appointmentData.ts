/**
 * Rendez-vous synchronisés sur PostgreSQL (Server Actions).
 * `APPOINTMENTS_UPDATED_EVENT` notifie les vues après mutation.
 */

import type { AppointmentRowJoined } from "@/lib/types/appointments-db";

export const DENTAL_APPOINTMENTS_STORAGE_KEY = "dental_appointments_data";

/** Émis après chaque création / mise à jour / suppression de RDV côté serveur. */
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
  /** Affichage planning (dent concernée), optionnel — ne change pas la logique agenda. */
  dent?: string;
};

const APPT_META_SEP = "\n---oryx-appt-meta\n";

export type AppointmentParsedNotesMeta = {
  dent?: string;
  rdvType?: "planned" | "direct";
  urgence?: boolean;
  /** Affichage lorsque `patient_id` est absent (nom saisi librement). */
  displayPatient?: string;
};

export function composeAppointmentNotes(
  userText: string | undefined,
  meta: AppointmentParsedNotesMeta,
): string | null {
  const t = userText?.trim() ?? "";
  const hasMeta =
    Boolean(meta.dent?.trim()) ||
    Boolean(meta.displayPatient?.trim()) ||
    meta.rdvType != null ||
    meta.urgence === true;
  if (!hasMeta && !t) return null;
  if (!hasMeta) return t;
  const json = JSON.stringify(meta);
  return t ? `${t}${APPT_META_SEP}${json}` : `${APPT_META_SEP}${json}`;
}

export function parseAppointmentNotes(notes: string | null): {
  userText: string;
  meta: AppointmentParsedNotesMeta;
} {
  if (!notes?.trim()) return { userText: "", meta: {} };
  const idx = notes.lastIndexOf(APPT_META_SEP);
  if (idx === -1)
    return { userText: notes.trim(), meta: {} };
  const userText = notes.slice(0, idx).trim();
  const raw = notes.slice(idx + APPT_META_SEP.length).trim();
  try {
    const meta = JSON.parse(raw) as AppointmentParsedNotesMeta;
    if (!meta || typeof meta !== "object") return { userText: notes.trim(), meta: {} };
    return {
      userText,
      meta: {
        ...(typeof meta.dent === "string" ? { dent: meta.dent } : {}),
        ...(typeof meta.displayPatient === "string"
          ? { displayPatient: meta.displayPatient }
          : {}),
        ...(meta.rdvType === "direct" || meta.rdvType === "planned"
          ? { rdvType: meta.rdvType }
          : {}),
        ...(meta.urgence === true ? { urgence: true } : {}),
      },
    };
  } catch {
    return { userText: notes.trim(), meta: {} };
  }
}

/** PostgreSQL statut ↔ pastilles planning (inchangées). */
export function statutUiFromDb(
  raw: string | null | undefined,
): NonNullable<AppointmentRdv["status"]> | undefined {
  const x = (raw ?? "").toLowerCase().trim();
  if (x === "en_attente" || x === "pending") return "pending";
  if (x === "termine" || x === "realise" || x === "done") return "done";
  return "confirmed";
}

export function statutDbFromUi(
  s?: AppointmentRdv["status"],
): string | null {
  if (s === "pending") return "en_attente";
  if (s === "done") return "termine";
  return null;
}

/** Ligne PG + JOIN patients → format UI legacy. */
export function appointmentJoinedRowToRdv(
  row: AppointmentRowJoined,
): AppointmentRdv {
  const { userText, meta } = parseAppointmentNotes(row.notes);
  const prenom = (row.prenom ?? "").trim();
  const nom = (row.nom ?? "").trim();
  const joined = `${prenom} ${nom}`.trim();
  const display =
    joined ||
    meta.displayPatient?.trim() ||
    "(Patient)";
  const typeActe = row.type_acte?.trim() ?? "";
  const id = row.id;
  const dateKey =
    typeof row.date === "string"
      ? row.date.slice(0, 10)
      : `${row.date}`;
  const start = row.heure.length >= 5 ? row.heure.slice(0, 5) : row.heure;
  return {
    id,
    dateKey,
    start,
    durationMinutes: Number(row.duree) || 30,
    patient: display,
    soin: typeActe || "Consultation",
    urgence:
      meta.urgence === true ||
      /urgence/i.test(typeActe) ||
      /\burgence\b/i.test(userText ?? ""),
    rdvType: meta.rdvType === "direct" ? "direct" : "planned",
    patientId: row.patient_id ?? undefined,
    status: statutUiFromDb(row.statut),
    dent: meta.dent,
  };
}

export function notifyAppointmentsUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(APPOINTMENTS_UPDATED_EVENT));
}

/** @deprecated Liste en base ; gardé pour éviter les erreurs d’import. */
export function readAppointmentsFromStorage(): AppointmentRdv[] {
  return [];
}

/** @deprecated Persistance serveur uniquement. */
export function writeAppointmentsToStorage(
  _items: AppointmentRdv[],
  _options?: { silent?: boolean },
) {}

/** Objet RDV avant persistance PostgreSQL (entrée directe dashboard). */
export function buildDirectEntryAppointmentPreview(args: {
  patientName: string;
  patientId?: string | null;
  visitKind: "consultation" | "urgence";
  at?: Date;
}): Omit<AppointmentRdv, "id"> & { id?: string } {
  const d = safeDate(args.at ?? undefined);
  const dateKey = formatDateKeyLocal(d);
  const start = formatTimeHHmmLocal(d);
  return {
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
}

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

/** Heure locale HH:mm */
export function formatTimeHHmmLocal(d: Date): string {
  return safeDate(d).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
