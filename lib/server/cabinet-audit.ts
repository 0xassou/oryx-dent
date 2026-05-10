import { randomUUID } from "node:crypto";
import { getPostgresPool } from "@/lib/server/db/pool";
import { logServerError } from "@/lib/server/logger";
import type {
  CabinetAuditActionType,
  CabinetAuditEntityType,
} from "@/lib/types/cabinet-audit-db";

export type LogCabinetAuditInput = {
  userId: string;
  displayName: string;
  role: string;
  actionType: CabinetAuditActionType;
  entityType: CabinetAuditEntityType;
  entityId?: string | null;
  patientId?: string | null;
  summary?: string | null;
  metadata?: Record<string, unknown> | null;
};

/**
 * Insertion best-effort : n’émet jamais d’exception vers l’appelant métier.
 */
export function logCabinetAuditSafe(input: LogCabinetAuditInput): void {
  void (async () => {
    try {
      const pool = getPostgresPool();
      await pool.query(
        `INSERT INTO cabinet_audit_log (
          id, user_id, display_name, role, action_type, entity_type,
          entity_id, patient_id, summary, metadata
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
        [
          randomUUID(),
          input.userId,
          input.displayName.slice(0, 200),
          input.role.slice(0, 64),
          input.actionType,
          input.entityType,
          input.entityId?.trim() || null,
          input.patientId?.trim() || null,
          input.summary?.slice(0, 500) ?? null,
          JSON.stringify(input.metadata ?? {}),
        ],
      );
    } catch (e) {
      logServerError("logCabinetAuditSafe", e);
    }
  })();
}
