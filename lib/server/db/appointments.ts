import { getPostgresPool } from "./pool";

const CLINIC_ID = process.env.CLINIC_ID ?? 
  process.env.NEXT_PUBLIC_CLINIC_ID ?? "";

export async function upsertAppointmentDB(a: {
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
  const pool = getPostgresPool();
  await pool.query(
    `INSERT INTO appointments
       (id, clinic_id, patient_id, patient_name,
        date_key, start_time, duration_minutes,
        soin, rdv_type, status, urgence)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (id) DO UPDATE SET
       patient_name = EXCLUDED.patient_name,
       date_key = EXCLUDED.date_key,
       start_time = EXCLUDED.start_time,
       soin = EXCLUDED.soin,
       status = EXCLUDED.status`,
    [
      a.id, CLINIC_ID, a.patientId ?? null,
      a.patientName, a.dateKey, a.startTime,
      a.durationMinutes, a.soin,
      a.rdvType ?? "planned",
      a.status ?? "pending",
      a.urgence ?? false
    ]
  );
}
