"use server";

import { getPostgresPool } from "@/lib/server/db/pool";
import { requireBetterAuthSession } from "@/lib/server/auth/require-session";
import { logServerError } from "@/lib/server/logger";
import type { CabinetAuditLogRow } from "@/lib/types/cabinet-audit-db";
import { cabinetAuditSentenceFr } from "@/utils/cabinetAuditSentenceFr";

export type CabinetAuditFeedItem = {
  id: string;
  createdAt: string;
  userId: string;
  displayName: string;
  role: string;
  sentence: string;
};

function mapAuditRow(r: Record<string, unknown>): CabinetAuditLogRow {
  return {
    id: String(r.id ?? ""),
    created_at: String(r.created_at ?? ""),
    user_id: String(r.user_id ?? ""),
    display_name: String(r.display_name ?? ""),
    role: String(r.role ?? ""),
    action_type: String(r.action_type ?? ""),
    entity_type: String(r.entity_type ?? ""),
    entity_id: r.entity_id != null ? String(r.entity_id) : null,
    patient_id: r.patient_id != null ? String(r.patient_id) : null,
    summary: r.summary != null ? String(r.summary) : null,
    metadata:
      r.metadata && typeof r.metadata === "object" && !Array.isArray(r.metadata)
        ? (r.metadata as Record<string, unknown>)
        : null,
  };
}

export async function getRecentCabinetAuditAction(
  limit = 10,
): Promise<
  { ok: true; data: CabinetAuditFeedItem[] } | { ok: false; error: string }
> {
  const auth = await requireBetterAuthSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const lim = Math.min(Math.max(1, limit), 50);
  try {
    const pool = getPostgresPool();
    const { rows } = await pool.query(
      `SELECT id, created_at, user_id, display_name, role, action_type, entity_type,
              entity_id, patient_id, summary, metadata
       FROM cabinet_audit_log
       ORDER BY created_at DESC
       LIMIT $1`,
      [lim],
    );
    const data: CabinetAuditFeedItem[] = rows.map((raw) => {
      const row = mapAuditRow(raw as Record<string, unknown>);
      return {
        id: row.id,
        createdAt: row.created_at,
        userId: row.user_id,
        displayName: row.display_name,
        role: row.role,
        sentence: cabinetAuditSentenceFr(row),
      };
    });
    return { ok: true, data };
  } catch (e) {
    logServerError("getRecentCabinetAuditAction", e);
    console.error(e);
    return {
      ok: false,
      error: "Une erreur est survenue.",
    };
  }
}
