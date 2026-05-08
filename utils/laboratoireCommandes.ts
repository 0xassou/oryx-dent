/**
 * Commandes laboratoire / prothèses (localStorage `dental_lab_commandes`).
 */

export const DENTAL_LAB_COMMANDES_KEY = "dental_lab_commandes";

export const LAB_COMMANDES_UPDATED_EVENT = "dental-lab-commandes-updated";

export type LaboratoireStatut =
  | "EN_ATTENTE"
  | "ENVOYE_LABO"
  | "EN_FABRICATION"
  | "EXPEDIE_CABINET"
  | "RECU_CABINET"
  | "POSE"
  | "RETOUCHE";

/** Ordre d’affichage dans les sélecteurs */
export const LAB_STATUT_ORDER: readonly LaboratoireStatut[] = [
  "EN_ATTENTE",
  "ENVOYE_LABO",
  "EN_FABRICATION",
  "EXPEDIE_CABINET",
  "RECU_CABINET",
  "POSE",
  "RETOUCHE",
] as const;

const LABELS: Record<LaboratoireStatut, string> = {
  EN_ATTENTE: "En attente",
  ENVOYE_LABO: "Envoyé au labo",
  EN_FABRICATION: "En fabrication",
  EXPEDIE_CABINET: "Expédié au cabinet",
  RECU_CABINET: "Reçu au cabinet",
  POSE: "Posé",
  RETOUCHE: "Retouche",
};

/** Phrase courte pour les toasts « Statut mis à jour : … » */
const TOAST_PHRASES: Record<LaboratoireStatut, string> = {
  EN_ATTENTE: "en attente",
  ENVOYE_LABO: "envoyé au laboratoire",
  EN_FABRICATION: "en fabrication",
  EXPEDIE_CABINET: "en route vers le cabinet",
  RECU_CABINET: "reçu au cabinet",
  POSE: "posé",
  RETOUCHE: "retouche demandée",
};

const LEGACY_TO_STATUT: Record<string, LaboratoireStatut> = {
  "Empreintes envoyées": "EN_ATTENTE",
  "En fabrication": "EN_FABRICATION",
  "Reçu au cabinet": "RECU_CABINET",
  Posé: "POSE",
};

export function laboratoireStatutLabel(s: LaboratoireStatut): string {
  return LABELS[s] ?? s;
}

export function laboratoireStatutToastPhrase(s: LaboratoireStatut): string {
  return TOAST_PHRASES[s] ?? laboratoireStatutLabel(s).toLowerCase();
}

export function normalizeLaboratoireStatut(raw: unknown): LaboratoireStatut | null {
  if (typeof raw !== "string") return null;
  if ((LAB_STATUT_ORDER as readonly string[]).includes(raw)) {
    return raw as LaboratoireStatut;
  }
  return LEGACY_TO_STATUT[raw] ?? null;
}

export type LaboratoireCommande = {
  id: string;
  patient: string;
  /** Référence `patientData` lorsque la commande est liée à un dossier patient. */
  patientId?: string;
  /** Dent concernée (FDI 1-48, ex: "46"). */
  dent?: string;
  travail: string;
  labo: string;
  retourIso: string;
  teinte?: string;
  materiau?: string;
  rdvPatientIso?: string;
  statut: LaboratoireStatut;
  /** Coût facturé par le labo (DA), utilisé à la réception pour la dépense. */
  coutLaboDa?: number;
  /** Lien vers la ligne `dental_expenses_data` si déjà créée pour cette commande. */
  labExpenseId?: string;
  /** RDV agenda synchronisé avec la date de pose (`rdvPatientIso`). */
  linkedPoseAppointmentId?: string;
  /** RDV agenda synchronisé avec le retour labo (`retourIso`). */
  linkedRetourAppointmentId?: string;
};

function parseIsoToDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0);
}

export function todayIsoLocal(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function dateIsoAddDays(iso: string, days: number): string {
  const base = parseIsoToDate(iso);
  if (Number.isNaN(base.getTime())) return todayIsoLocal();
  base.setDate(base.getDate() + days);
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, "0");
  const day = String(base.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** RDV de pose : 9h00 locale (jour seul dans les données). */
function rdvPoseStartMs(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 9, 0, 0).getTime();
}

export function isCouronneOrBridgeTravail(travail: string): boolean {
  const t = travail.toLowerCase();
  return t.includes("couronne") || t.includes("bridge");
}

/**
 * Alerte : le RDV patient est fixé avant le retour labo (la pièce ne sera pas prête à temps).
 */
export function isRdvPatientBeforeRetourLabo(
  rdvIso: string | undefined,
  retourIso: string,
): boolean {
  if (!rdvIso) return false;
  const rdv = parseIsoToDate(rdvIso);
  const retour = parseIsoToDate(retourIso);
  if (Number.isNaN(rdv.getTime()) || Number.isNaN(retour.getTime())) return false;
  return rdv.getTime() < retour.getTime();
}

/** Retour labo aujourd’hui ou demain → urgence calendrier. */
export function isRetourUrgent(retourIso: string, now = new Date()): boolean {
  const due = parseIsoToDate(retourIso);
  if (Number.isNaN(due.getTime())) return false;
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(23, 59, 59, 999);
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  return due.getTime() >= startToday.getTime() && due.getTime() <= tomorrow.getTime();
}

const MS_48H = 48 * 60 * 60 * 1000;

/**
 * Pose prévue dans les 48 h et prothèse pas encore prête côté cabinet (reçue / posée).
 */
export function isLogisticsAlert(
  cmd: LaboratoireCommande,
  now = new Date(),
): boolean {
  if (cmd.statut === "RECU_CABINET" || cmd.statut === "POSE") return false;
  if (!cmd.rdvPatientIso) return false;
  const start = rdvPoseStartMs(cmd.rdvPatientIso);
  if (Number.isNaN(start)) return false;
  const diff = start - now.getTime();
  return diff > 0 && diff <= MS_48H;
}

function parseCommande(raw: unknown): LaboratoireCommande | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.patient !== "string") return null;
  if (typeof o.travail !== "string" || typeof o.labo !== "string") return null;
  if (typeof o.retourIso !== "string") return null;
  const statut = normalizeLaboratoireStatut(o.statut);
  if (!statut) return null;
  const dent = typeof o.dent === "string" ? o.dent.trim() : "";
  const cout =
    typeof o.coutLaboDa === "number" && Number.isFinite(o.coutLaboDa)
      ? Math.max(0, o.coutLaboDa)
      : undefined;
  const labExpenseId =
    typeof o.labExpenseId === "string" ? o.labExpenseId : undefined;
  const patientId =
    typeof o.patientId === "string" ? o.patientId : undefined;
  const linkedPoseAppointmentId =
    typeof o.linkedPoseAppointmentId === "string"
      ? o.linkedPoseAppointmentId
      : undefined;
  const linkedRetourAppointmentId =
    typeof o.linkedRetourAppointmentId === "string"
      ? o.linkedRetourAppointmentId
      : undefined;
  return {
    id: o.id,
    patient: o.patient,
    travail: o.travail,
    labo: o.labo,
    retourIso: o.retourIso,
    ...(dent ? { dent } : {}),
    teinte: typeof o.teinte === "string" ? o.teinte : undefined,
    materiau: typeof o.materiau === "string" ? o.materiau : undefined,
    rdvPatientIso:
      typeof o.rdvPatientIso === "string" ? o.rdvPatientIso : undefined,
    statut,
    ...(cout != null ? { coutLaboDa: cout } : {}),
    ...(labExpenseId ? { labExpenseId } : {}),
    ...(patientId ? { patientId } : {}),
    ...(linkedPoseAppointmentId ? { linkedPoseAppointmentId } : {}),
    ...(linkedRetourAppointmentId ? { linkedRetourAppointmentId } : {}),
  };
}

function seedCommandes(): LaboratoireCommande[] {
  const t = todayIsoLocal();
  return [
    {
      id: "cmd1",
      patient: "Marie Dupont",
      patientId: "3",
      dent: "46",
      travail: "Couronne Céramo-Métallique sur 46",
      teinte: "A2",
      materiau: "Zircone",
      labo: "Labo Dentaire Express",
      retourIso: dateIsoAddDays(t, 1),
      rdvPatientIso: dateIsoAddDays(t, 1),
      statut: "EN_ATTENTE",
    },
    {
      id: "cmd2",
      patient: "Jean Martin",
      dent: "16",
      travail: "Inlay-Onlay (Composite) sur 16",
      teinte: "B1",
      materiau: "Emax",
      labo: "Prothèse & Co",
      retourIso: t,
      rdvPatientIso: dateIsoAddDays(t, -2),
      statut: "EN_FABRICATION",
    },
    {
      id: "cmd3",
      patient: "Sophie Bernard",
      dent: "24-25-26",
      travail: "Bridge Zircone 24-25-26",
      teinte: "C3",
      materiau: "Zircone",
      labo: "ZircoLab",
      retourIso: dateIsoAddDays(t, 2),
      rdvPatientIso: dateIsoAddDays(t, 1),
      statut: "RECU_CABINET",
      coutLaboDa: 12000,
    },
    {
      id: "cmd4",
      patient: "Claire Moreau",
      travail: "Prothèse partielle (résine) — modèle 3",
      teinte: "A3.5",
      materiau: "Résine",
      labo: "ClinPro Lab",
      retourIso: dateIsoAddDays(t, -7),
      rdvPatientIso: dateIsoAddDays(t, -12),
      statut: "POSE",
    },
  ];
}

export function readLabCommandesFromStorage(): LaboratoireCommande[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(DENTAL_LAB_COMMANDES_KEY);
    if (raw == null || raw === "") {
      const seed = seedCommandes();
      writeLabCommandesToStorage(seed);
      return seed;
    }
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) {
      const seed = seedCommandes();
      writeLabCommandesToStorage(seed);
      return seed;
    }
    const out: LaboratoireCommande[] = [];
    for (const item of data) {
      const c = parseCommande(item);
      if (c) out.push(c);
    }
    if (!out.length) {
      const seed = seedCommandes();
      writeLabCommandesToStorage(seed);
      return seed;
    }
    return out;
  } catch {
    const seed = seedCommandes();
    writeLabCommandesToStorage(seed);
    return seed;
  }
}

export function writeLabCommandesToStorage(items: LaboratoireCommande[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(DENTAL_LAB_COMMANDES_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(LAB_COMMANDES_UPDATED_EVENT));
}

export function listLogisticsAlerts(
  items: LaboratoireCommande[],
  now = new Date(),
): LaboratoireCommande[] {
  return items.filter((c) => isLogisticsAlert(c, now));
}

function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

/**
 * Lien WhatsApp : numéro du labo si renseigné (E.164 sans +), sinon texte seul.
 */
export function whatsAppLabUrl(
  patientName: string,
  labPhone?: string,
): string {
  const text = `Bonjour, je reviens vers vous pour le travail de ${patientName}. Quel est l'état d'avancement ?`;
  const d = labPhone ? digitsOnly(labPhone) : "";
  if (d.length >= 8) {
    return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
  }
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
