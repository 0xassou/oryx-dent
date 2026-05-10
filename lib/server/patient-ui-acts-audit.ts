import type { CabinetActorSnapshot } from "@/lib/server/cabinet-actor";
import { logCabinetAuditSafe } from "@/lib/server/cabinet-audit";

export type ActAuditStamp = {
  userId: string;
  displayName: string;
  role: string;
  at: string;
};

function cloneLooseAct(raw: unknown): Record<string, unknown> {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw)
    ? { ...(raw as Record<string, unknown>) }
    : {};
}

function stripAudit(row: Record<string, unknown>): Record<string, unknown> {
  const { _audit: _a, ...rest } = row;
  return rest;
}

function actFingerprint(row: Record<string, unknown>): string {
  if (row.kind === "state") {
    return `state:${String(row.tooth ?? "")}`;
  }
  const d =
    typeof row.date === "string"
      ? row.date.slice(0, 10)
      : String(row.date ?? "").slice(0, 10);
  return JSON.stringify({
    k: row.kind ?? "act",
    t: row.tooth,
    a: row.acte,
    d,
    c: row.category,
  });
}

/**
 * Ajoute `_audit` sur les actes dentaires nouveaux ou modifiés et journalise.
 */
export function mergeActsWithAuditTrail(
  patientId: string,
  incomingActs: unknown,
  previousActs: unknown,
  actor: CabinetActorSnapshot,
): unknown[] {
  if (!Array.isArray(incomingActs)) return [];

  const prevList = Array.isArray(previousActs) ? previousActs : [];
  const prevByFp = new Map<string, Record<string, unknown>>();
  for (const raw of prevList) {
    const pr = cloneLooseAct(raw);
    if (pr.kind === "state") continue;
    prevByFp.set(actFingerprint(pr), pr);
  }

  const stamp = (): ActAuditStamp => ({
    userId: actor.userId,
    displayName: actor.displayName,
    role: actor.role,
    at: new Date().toISOString(),
  });

  const out: unknown[] = [];
  for (const raw of incomingActs) {
    const row = cloneLooseAct(raw);
    if (row.kind === "state") {
      out.push(row);
      continue;
    }
    const fp = actFingerprint(row);
    const prev = prevByFp.get(fp);
    const st = stamp();
    if (!prev) {
      row._audit = st;
      out.push(row);
      logCabinetAuditSafe({
        userId: actor.userId,
        displayName: actor.displayName,
        role: actor.role,
        actionType: "patient_acte_ajoute",
        entityType: "patient",
        entityId: null,
        patientId,
        summary: `Acte ajouté · dent ${String(row.tooth ?? "—")} — ${String(row.acte ?? "")}`,
        metadata: {
          tooth: row.tooth,
          acte: row.acte,
          date: row.date,
          category: row.category,
        },
      });
      continue;
    }
    if (
      JSON.stringify(stripAudit(row)) === JSON.stringify(stripAudit(prev))
    ) {
      row._audit =
        (prev._audit as ActAuditStamp | undefined) != null
          ? (prev._audit as ActAuditStamp)
          : st;
    } else {
      row._audit = st;
      logCabinetAuditSafe({
        userId: actor.userId,
        displayName: actor.displayName,
        role: actor.role,
        actionType: "patient_acte_modifie",
        entityType: "patient",
        entityId: null,
        patientId,
        summary: `Acte modifié · dent ${String(row.tooth ?? "—")} — ${String(row.acte ?? "")}`,
        metadata: {
          tooth: row.tooth,
          acte: row.acte,
          date: row.date,
        },
      });
    }
    out.push(row);
  }
  return out;
}
