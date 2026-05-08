/**
 * Exécute db/schema.sql sur DATABASE_URL (PostgreSQL).
 * Usage : node scripts/run-db-schema.cjs
 */
const fs = require("fs");
const path = require("path");
const pg = require("pg");

const root = path.join(__dirname, "..");

function loadEnvLocal() {
  const p = path.join(root, ".env.local");
  if (!fs.existsSync(p)) {
    console.error("Fichier .env.local introuvable.");
    process.exit(1);
  }
  const txt = fs.readFileSync(p, "utf8");
  for (const line of txt.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

async function main() {
  loadEnvLocal();
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL manquant dans .env.local");
    process.exit(1);
  }

  const sqlPath = path.join(root, "db/schema.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(sql);
    console.log("db/schema.sql exécuté avec succès.");
  } catch (e) {
    console.error("Erreur lors de l'exécution du schéma :", e.message);
    process.exit(1);
  }

  const { rows } = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  console.log("Tables public :", rows.map((r) => r.table_name).join(", "));

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

