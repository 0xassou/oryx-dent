import { v5 as uuidv5 } from "uuid";
import { CLINIC_NAMESPACE_UUID } from "@/lib/clinical/clinicNamespace";
import { isValidPostgresProtocolUuid } from "@/lib/onboarding/seedDefaultProtocols";

/**
 * Identifiant `clinical_protocols.id` utilisé côté PostgreSQL.
 * Si l’UI envoie déjà un UUID RFC4122 (seed 20 protocoles), on le garde.
 * Sinon (clé catalogue, préfixe `act-…`, etc.) → UUID v5 déterministe par (cabinet, clé UI),
 * aligné sur la logique serveur d’upsert dans `executeClinicalActWithInput`.
 */
export function resolveProtocolDbUuid(uiProtocolId: string, clinicId: string): string {
  const raw = uiProtocolId.trim();
  const cid = clinicId.trim();
  if (!cid) return raw;
  if (isValidPostgresProtocolUuid(raw)) return raw;
  return uuidv5(`${cid}|${raw}`, CLINIC_NAMESPACE_UUID);
}
