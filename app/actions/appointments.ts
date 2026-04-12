"use server";
import { upsertAppointmentDB } from 
  "@/lib/server/db/appointments";

export async function syncAppointmentToDBAction(a: {
  id: string;
  patientId?: string;
  patientName: string;
  dateKey: string;
  startTime: string;
  durationMinutes: number;
  soin: string;
  rdvType?: string;
  status?: string;
  urgence?: boolean;
}) {
  try {
    await upsertAppointmentDB(a);
    return { ok: true };
  } catch (e) {
    console.error("[syncAppointmentToDB]", e);
    return { ok: false };
  }
}
