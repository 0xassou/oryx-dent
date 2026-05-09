/**
 * Export / import JSON des tables métier Oryx (PostgreSQL).
 * Utilisé par les scripts CLI, les server actions et le cron.
 */

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Pool, PoolClient } from "pg";
import { getPostgresPool } from "@/lib/server/db/pool";

export const BACKUP_TABLES = [
  "patients",
  "appointments",
  "consultations",
  "factures",
  "depenses",
  "stocks",
  "commandes_labo",
  "team_members",
] as const;

export type BackupTableName = (typeof BACKUP_TABLES)[number];

export const BACKUP_FILENAME_RE =
  /^backup-oryx-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\.json$/;

export function isValidBackupFilename(name: string): boolean {
  return BACKUP_FILENAME_RE.test(name);
}

export interface OryxBackupFileV1 {
  version: "1.0";
  date: string;
  cabinet: string;
  tables: Record<BackupTableName, Record<string, unknown>[]>;
}

/** Ordre respectant les clés étrangères à la restauration. */
export const RESTORE_TABLE_ORDER: readonly BackupTableName[] = [
  "patients",
  "team_members",
  "appointments",
  "consultations",
  "factures",
  "depenses",
  "stocks",
  "commandes_labo",
] as const;

export function getBackupsDirectory(): string {
  return join(process.cwd(), "backups");
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

export function formatBackupFilename(d: Date): string {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  const h = pad2(d.getHours());
  const min = pad2(d.getMinutes());
  return `backup-oryx-${y}-${m}-${day}-${h}-${min}.json`;
}

export async function loadBackupPayload(
  pool: Pool,
  cabinetLabel: string,
): Promise<OryxBackupFileV1> {
  const tables = {} as OryxBackupFileV1["tables"];
  for (const name of BACKUP_TABLES) {
    const { rows } = await pool.query<Record<string, unknown>>(
      `SELECT * FROM ${quoteIdent(name)}`,
    );
    tables[name] = rows.map((row) => serializeRow(row));
  }
  return {
    version: "1.0",
    date: new Date().toISOString(),
    cabinet: cabinetLabel,
    tables,
  };
}

function quoteIdent(ident: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(ident)) {
    throw new Error(`Identifiant SQL invalide: ${ident}`);
  }
  return `"${ident.replace(/"/g, '""')}"`;
}

/** Convertit Dates et autres types pg en JSON-safe. */
function serializeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v instanceof Date) {
      out[k] = v.toISOString();
    } else {
      out[k] = v;
    }
  }
  return out;
}

export interface RunBackupResult {
  absolutePath: string;
  filename: string;
}

export async function runBackupToDisk(options?: {
  pool?: Pool;
  cabinetLabel?: string;
}): Promise<RunBackupResult> {
  const pool = options?.pool ?? getPostgresPool();
  const cabinet =
    options?.cabinetLabel ??
    process.env.ORYX_BACKUP_CABINET_LABEL ??
    "Cabinet Oryx";
  const dir = getBackupsDirectory();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const filename = formatBackupFilename(new Date());
  const absolutePath = join(dir, filename);
  const payload = await loadBackupPayload(pool, cabinet);
  writeFileSync(absolutePath, JSON.stringify(payload, null, 2), "utf8");
  return { absolutePath, filename };
}

function collectColumns(rows: Record<string, unknown>[]): string[] {
  const keys = new Set<string>();
  for (const row of rows) {
    for (const k of Object.keys(row)) {
      keys.add(k);
    }
  }
  return [...keys].sort();
}

export async function restoreFromPayload(
  client: PoolClient,
  payload: OryxBackupFileV1,
): Promise<Record<BackupTableName, number>> {
  const counts = {} as Record<BackupTableName, number>;
  for (const name of BACKUP_TABLES) {
    counts[name] = 0;
  }

  for (const table of RESTORE_TABLE_ORDER) {
    const rows = payload.tables[table];
    if (!Array.isArray(rows) || rows.length === 0) {
      continue;
    }
    const cols = collectColumns(rows);
    if (cols.length === 0) continue;
    const colList = cols.map((c) => quoteIdent(c)).join(", ");
    const placeholdersRow = cols.map((_, i) => `$${i + 1}`).join(", ");
    const updateCols = cols.filter((c) => c !== "id");
    const updateSet = updateCols
      .map((c) => `${quoteIdent(c)} = EXCLUDED.${quoteIdent(c)}`)
      .join(", ");

    const insertSql = `
      INSERT INTO ${quoteIdent(table)} (${colList})
      VALUES (${placeholdersRow})
      ON CONFLICT (id) DO UPDATE SET ${updateSet}
    `;

    for (const rawRow of rows) {
      const values = cols.map((c) => {
        const v = rawRow[c];
        if (v === undefined) return null;
        return v;
      });
      await client.query(insertSql, values);
      counts[table] += 1;
    }
  }
  return counts;
}

export function parseBackupFileJson(raw: string): OryxBackupFileV1 {
  const data = JSON.parse(raw) as unknown;
  if (!data || typeof data !== "object") {
    throw new Error("Fichier de sauvegarde invalide.");
  }
  const o = data as Record<string, unknown>;
  if (o.version !== "1.0") {
    throw new Error(`Version de sauvegarde non supportée: ${String(o.version)}`);
  }
  if (typeof o.cabinet !== "string" || typeof o.date !== "string") {
    throw new Error("Métadonnées cabinet/date manquantes.");
  }
  if (!o.tables || typeof o.tables !== "object") {
    throw new Error("Section tables manquante.");
  }
  const tables = o.tables as Record<string, unknown>;
  const outTables = {} as OryxBackupFileV1["tables"];
  for (const name of BACKUP_TABLES) {
    const t = tables[name];
    if (!Array.isArray(t)) {
      outTables[name] = [];
    } else {
      outTables[name] = t as Record<string, unknown>[];
    }
  }
  return {
    version: "1.0",
    date: o.date,
    cabinet: o.cabinet,
    tables: outTables,
  };
}
