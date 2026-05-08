/**
 * Applique le DDL `commandes_labo` via pg (sans psql).
 *
 * Usage : npx tsx scripts/ensure-labo-table.ts
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";
import { ensureCommandesLaboDdl } from "./ensure-labo-ddl";

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

async function main() {
  loadDotEnvLocal();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL manquant (.env.local ou environnement).");
    process.exit(1);
  }
  const pool = new Pool({ connectionString, max: 2 });
  await ensureCommandesLaboDdl(pool);
  await pool.end();
  console.log("ensure-labo-table : terminé.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

