import type { AppointmentRdv } from "@/utils/appointmentData";
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

/** Mises à jour agenda à appliquer côté serveur quand une commande labo impose une date de RDV liée. */
export type LabLinkedAppointmentMove = {
  appointmentId: string;
  newDateIso: string;
  toast: string;
};

/**
 * Détermine les déplacements de RDV (PostgreSQL via `updateAppointmentAction`) après sauvegarde d’une commande labo.
 */
export function computeLinkedAppointmentDateMovesFromLab(
  appointments: AppointmentRdv[],
  next: LaboratoireCommande,
): LabLinkedAppointmentMove[] {
  const moves: LabLinkedAppointmentMove[] = [];

  if (next.linkedPoseAppointmentId) {
    const a = appointments.find((x) => x.id === next.linkedPoseAppointmentId);
    if (
      a &&
      next.rdvPatientIso &&
      next.rdvPatientIso !== a.dateKey
    ) {
      moves.push({
        appointmentId: next.linkedPoseAppointmentId,
        newDateIso: next.rdvPatientIso,
        toast: `Le rendez-vous de ${next.patient} a été déplacé au ${formatToastLongDate(next.rdvPatientIso)} pour correspondre à la date de pose.`,
      });
    }
  }

  if (next.linkedRetourAppointmentId) {
    const a = appointments.find((x) => x.id === next.linkedRetourAppointmentId);
    if (a && next.retourIso && next.retourIso !== a.dateKey) {
      moves.push({
        appointmentId: next.linkedRetourAppointmentId,
        newDateIso: next.retourIso,
        toast: `Le rendez-vous de ${next.patient} a été déplacé au ${formatToastLongDate(next.retourIso)} pour correspondre au retour labo.`,
      });
    }
  }

  return moves;
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
