"use server";

/**
 * Action serveur : délègue à `executeClinicalAct` (PostgreSQL, transaction).
 * Configurez `DATABASE_URL` et `CLINIC_ID` (UUID du cabinet en base, obligatoire en production).
 * Les `protocolId` doivent exister dans `clinical_protocols` (même valeur que côté UI si synchro).
 */

import { executeClinicalAct } from "@/lib/server/clinical-act/executeClinicalAct";
import { getPostgresPool } from "@/lib/server/db/pool";
import { requireBetterAuthSession } from "@/lib/server/auth/require-session";
import { createFactureAction } from "@/app/actions/factures";
import type {
  ClientProtocolBackfill,
  ExecuteClinicalActResult,
} from "@/lib/server/clinical-act/types";

export type SubmitClinicalActInput = {
  patientId: string;
  protocolId: string;
  consumables: { stockProductId: string; quantity: number }[];
  customPriceOverrideCents?: number | null;
  /** Métadonnées pour créer le protocole en base s’il manque (catalogue local / cockpit). */
  clientProtocol?: ClientProtocolBackfill | null;
};

export type SubmitClinicalActResult =
  | { ok: true; data: ExecuteClinicalActResult & { factureId?: string } }
  | { ok: false; error: string };

export async function submitClinicalActAction(
  input: SubmitClinicalActInput,
): Promise<SubmitClinicalActResult> {
  const auth = await requireBetterAuthSession();
  if (!auth.ok) {
    return { ok: false, error: auth.error };
  }
  let clinicId: string;
  if (process.env.NODE_ENV === "production") {
    const v = process.env.CLINIC_ID?.trim();
    if (!v) {
      throw new Error("CLINIC_ID est requis en production");
    }
    clinicId = v;
  } else {
    const v = process.env.CLINIC_ID?.trim();
    if (!v) {
      return {
        ok: false,
        error:
          "Cabinet non configuré : définissez CLINIC_ID côté serveur (.env).",
      };
    }
    clinicId = v;
  }

  try {
    const pool = getPostgresPool();
    const data = await executeClinicalAct(
      pool,
      input.patientId,
      input.protocolId,
      clinicId,
      input.consumables,
      input.customPriceOverrideCents ?? null,
      input.clientProtocol ?? null,
    );

    let factureId: string | undefined;
    try {
      const montant = data.amountCents / 100;
      const factureRes = await createFactureAction({
        patient_id: input.patientId,
        date: new Date().toISOString().slice(0, 10),
        montant,
        montant_paye: 0,
        statut: "en_attente",
        actes: JSON.stringify([
          {
            label: input.clientProtocol?.name ?? "Acte clinique",
            montant,
            clinicalHistoryId: data.clinicalHistoryId,
          },
        ]),
        notes: null,
      });
      if (factureRes.ok) {
        factureId = factureRes.data.id;
      } else {
        console.error("[submitClinicalActAction] Échec création facture:", factureRes.error);
      }
    } catch (factureErr) {
      console.error("[submitClinicalActAction] Erreur lors de la création de la facture:", factureErr);
    }

    return { ok: true, data: { ...data, factureId } };
  } catch (e) {
    console.error(e);
    return { ok: false, error: "Une erreur est survenue." };
  }
}
