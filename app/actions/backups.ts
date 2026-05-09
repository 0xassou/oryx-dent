"use server";

import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { getSession } from "@/app/actions/auth";
import {
  BACKUP_FILENAME_RE,
  getBackupsDirectory,
  runBackupToDisk,
} from "@/lib/server/backup/oryx-backup";

async function requireAdminSession(): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session || session.userId !== "admin") {
    return { ok: false, error: "Réservé aux administrateurs." };
  }
  return { ok: true };
}

export interface BackupListEntry {
  filename: string;
  sizeBytes: number;
  mtimeMs: number;
}

export async function getBackupsAction(): Promise<
  | { ok: true; backups: BackupListEntry[] }
  | { ok: false; error: string }
> {
  const gate = await requireAdminSession();
  if (!gate.ok) return gate;

  const dir = getBackupsDirectory();
  try {
    const names = await readdir(dir);
    const jsonFiles = names.filter((n) => BACKUP_FILENAME_RE.test(n));
    const entries: BackupListEntry[] = [];
    for (const filename of jsonFiles) {
      const p = join(dir, filename);
      const s = await stat(p);
      if (!s.isFile()) continue;
      entries.push({
        filename,
        sizeBytes: s.size,
        mtimeMs: s.mtimeMs,
      });
    }
    entries.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return { ok: true, backups: entries };
  } catch {
    return { ok: true, backups: [] };
  }
}

export async function createBackupAction(): Promise<
  | { ok: true; filename: string }
  | { ok: false; error: string }
> {
  const gate = await requireAdminSession();
  if (!gate.ok) return gate;

  try {
    const { filename } = await runBackupToDisk();
    return { ok: true, filename };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Échec de la sauvegarde.";
    return { ok: false, error: msg };
  }
}

