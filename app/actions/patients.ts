"use server";
import { upsertPatientDB } from "@/lib/server/db/patients";

export async function syncPatientToDBAction(p: {
  id: string;
  prenom: string;
  nom: string;
  telephone: string;
  email?: string;
  notes?: string;
}) {
  try {
    await upsertPatientDB(p);
    return { ok: true };
  } catch (e) {
    console.error("[syncPatientToDB]", e);
    return { ok: false };
  }
}
