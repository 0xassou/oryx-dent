import {
  readAppointmentsFromStorage,
  writeAppointmentsToStorage,
  type AppointmentRdv,
} from "@/utils/appointmentData";
import type { LaboratoireCommande } from "@/utils/laboratoireCommandes";

/** RDV du patient (nom ou id dossier). */
export function filterAppointmentsForPatient(
  appointments: AppointmentRdv[],
  patientId: string | undefined,
  patientLabel: string,
): AppointmentRdv[] {
  const labelNorm = patientLabel.trim().toLowerCase().replace(/\s+/g, " ");
  return appointments.filter((a) => {
    if (patientId && a.patientId === patientId) return true;
    const pn = a.patient.trim().toLowerCase().replace(/\s+/g, " ");
    return pn === labelNorm;
  });
}

export function formatToastLongDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Pousse les dates Pose / Retour labo vers les RDV liés dans l’agenda.
 * Retourne un message toast si au moins un RDV a été modifié.
 */
export function pushLabDatesToLinkedAppointments(
  _prev: LaboratoireCommande | undefined,
  next: LaboratoireCommande,
): string | null {
  const apps = readAppointmentsFromStorage();
  const messages: string[] = [];
  let mutated = false;

  const nextApps = apps.map((a) => {
    if (
      next.linkedPoseAppointmentId &&
      a.id === next.linkedPoseAppointmentId &&
      next.rdvPatientIso &&
      next.rdvPatientIso !== a.dateKey
    ) {
      mutated = true;
      messages.push(
        `Le rendez-vous de ${next.patient} a été déplacé au ${formatToastLongDate(next.rdvPatientIso)} pour correspondre à la date de pose.`,
      );
      return { ...a, dateKey: next.rdvPatientIso };
    }
    if (
      next.linkedRetourAppointmentId &&
      a.id === next.linkedRetourAppointmentId &&
      next.retourIso &&
      next.retourIso !== a.dateKey
    ) {
      mutated = true;
      messages.push(
        `Le rendez-vous de ${next.patient} a été déplacé au ${formatToastLongDate(next.retourIso)} pour correspondre au retour labo.`,
      );
      return { ...a, dateKey: next.retourIso };
    }
    return a;
  });

  if (!mutated) return null;
  writeAppointmentsToStorage(nextApps, { silent: true });
  return messages[0] ?? null;
}

/** Recopie les dates agenda → fiche labo (déplacement dans le planning). */
export function pullAgendaDatesIntoLabCommandes(
  commandes: LaboratoireCommande[],
  appointments: AppointmentRdv[],
): LaboratoireCommande[] {
  return commandes.map((cmd) => {
    let c = { ...cmd };
    if (cmd.linkedPoseAppointmentId) {
      const a = appointments.find((x) => x.id === cmd.linkedPoseAppointmentId);
      if (a && a.dateKey !== cmd.rdvPatientIso) {
        c = { ...c, rdvPatientIso: a.dateKey };
      }
    }
    if (cmd.linkedRetourAppointmentId) {
      const a = appointments.find((x) => x.id === cmd.linkedRetourAppointmentId);
      if (a && a.dateKey !== cmd.retourIso) {
        c = { ...c, retourIso: a.dateKey };
      }
    }
    return c;
  });
}
