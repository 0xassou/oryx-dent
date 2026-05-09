/**
 * Restauration depuis un fichier JSON produit par scripts/backup.ts.
 *
 * Usage : npx tsx scripts/restore.ts backups/backup-oryx-2026-05-08-12-30.json
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";
import {
  BACKUP_TABLES,
  parseBackupFileJson,
  restoreFromPayload,
} from "@/lib/server/backup/oryx-backup";

function loadDotEnvLocal(): void {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const fileArg = process.argv[2];
  if (!fileArg) {
    console.error(
      "Usage : npx tsx scripts/restore.ts <fichier.json>",
    );
    process.exit(1);
  }
  const cs = process.env.DATABASE_URL;
  if (!cs) {
    console.error("DATABASE_URL manquant.");
    process.exit(1);
  }
  const abs = resolve(process.cwd(), fileArg);
  if (!existsSync(abs)) {
    console.error(`Fichier introuvable : ${abs}`);
    process.exit(1);
  }
  const raw = readFileSync(abs, "utf8");
  const payload = parseBackupFileJson(raw);

  const pool = new Pool({ connectionString: cs, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const counts = await restoreFromPayload(client, payload);
    await client.query("COMMIT");
    for (const name of BACKUP_TABLES) {
      const n = counts[name];
      console.log(`✓ ${name}: ${n} lignes restaurées`);
    }
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
