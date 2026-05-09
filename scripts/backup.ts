/**
 * Sauvegarde JSON des tables Oryx.
 *
 * Usage : npx tsx scripts/backup.ts
 * Requiert DATABASE_URL (ou .env.local).
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { runBackupToDisk } from "@/lib/server/backup/oryx-backup";

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
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL manquant. Définissez-le ou créez .env.local.");
    process.exit(1);
  }
  const { absolutePath, filename } = await runBackupToDisk();
  console.log(`✓ Sauvegarde créée : ${filename}`);
  console.log(`  Chemin : ${absolutePath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
