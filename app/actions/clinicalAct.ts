"use server";

/**
 * Action serveur : délègue à `executeClinicalAct` (PostgreSQL, transaction).
 * Configurez `DATABASE_URL` et `CLINIC_ID` (UUID du cabinet en base).
 * Les `protocolId` doivent exister dans `clinical_protocols` (même valeur que côté UI si synchro).
 */

import { executeClinicalAct } from "@/lib/server/clinical-act/executeClinicalAct";
import { getPostgresPool } from "@/lib/server/db/pool";
import { requireBetterAuthSession } from "@/lib/server/auth/require-session";
import type { ExecuteClinicalActResult } from "@/lib/server/clinical-act/types";

export type SubmitClinicalActInput = {
  patientId: string;
  protocolId: string;
  clinicId: string;
  consumables: { stockProductId: string; quantity: number }[];
  customPriceOverrideCents?: number | null;
};

export type SubmitClinicalActResult =
  | { ok: true; data: ExecuteClinicalActResult }
  | { ok: false; error: string };

export async function submitClinicalActAction(
  input: SubmitClinicalActInput,
): Promise<SubmitClinicalActResult> {
  const auth = await requireBetterAuthSession();
  if (!auth.ok) {
    return { ok: false, error: auth.error };
  }
  const clinicId = process.env.CLINIC_ID ?? input.clinicId;
  if (!clinicId?.trim()) {
    return {
      ok: false,
      error:
        "Cabinet non configuré : définissez CLINIC_ID (serveur) ou transmettez clinicId.",
    };
  }

  try {
    const pool = getPostgresPool();
    const data = await executeClinicalAct(
      pool,
      input.patientId,
      input.protocolId,
      clinicId.trim(),
      input.consumables,
      input.customPriceOverrideCents ?? null,
    );
    return { ok: true, data };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Erreur lors de l'exécution de l'acte clinique.";
    return { ok: false, error: message };
  }
}
