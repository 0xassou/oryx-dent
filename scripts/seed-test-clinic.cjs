/**
 * Seed cabinet de test + 20 protocoles + stock + liaison protocol_consumables.
 * Aligné sur lib/mapping/stockProductId.ts et lib/onboarding/seedDefaultProtocols.ts (uuid v5).
 * Usage : node scripts/seed-test-clinic.cjs
 */
const fs = require("fs");
const path = require("path");
const pg = require("pg");
const { v5: uuidv5 } = require("uuid");

const root = path.join(__dirname, "..");

const CLINIC_ID = "f0000000-0000-4000-8000-000000000001";
const CLINIC_NAME = "Cabinet de test (Neon)";
const STOCK_QTY = 500;

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

/** Doit être identique à lib/mapping/stockProductId.ts */
function stockProductIdFromLabel(label) {
  const t = label.trim();
  let h = BigInt(2166136261);
  const mask = BigInt("0xffffffffffffffff");
  const mul = BigInt(16777619);
  for (let i = 0; i < t.length; i++) {
    h ^= BigInt(t.charCodeAt(i));
    h = (h * mul) & mask;
  }
  return "s" + h.toString(16).padStart(16, "0").slice(0, 15);
}

function collectUniqueItems(protocols) {
  const set = new Set();
  for (const p of protocols) {
    for (const c of p.consommables_par_defaut) {
      set.add(c.item.trim());
    }
  }
  return [...set].sort();
}

async function main() {
  loadEnvLocal();
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL manquant dans .env.local");
    process.exit(1);
  }

  const envClinic =
    process.env.NEXT_PUBLIC_CLINIC_ID || process.env.CLINIC_ID || "";
  if (envClinic && envClinic !== CLINIC_ID) {
    console.warn(
      `Attention : NEXT_PUBLIC_CLINIC_ID / CLINIC_ID = ${envClinic} (seed utilise ${CLINIC_ID}).`,
    );
  }

  const seedPath = path.join(root, "data/protocols_seed.json");
  const { protocols } = JSON.parse(fs.readFileSync(seedPath, "utf8"));
  if (!Array.isArray(protocols) || protocols.length !== 20) {
    console.error("protocols_seed.json : attendu 20 protocoles.");
    process.exit(1);
  }

  const uniqueLabels = collectUniqueItems(protocols);

  const client = new pg.Client({
    connectionString: url,
    ssl: { rejectUnauthorized: true },
  });
  await client.connect();

  try {
    await client.query("BEGIN");

    await client.query(`DELETE FROM invoice_lines WHERE clinic_id = $1::uuid`, [
      CLINIC_ID,
    ]);
    await client.query(
      `DELETE FROM patient_clinical_history WHERE clinic_id = $1::uuid`,
      [CLINIC_ID],
    );
    await client.query(
      `DELETE FROM protocol_consumables WHERE protocol_id IN (
        SELECT id FROM clinical_protocols WHERE clinic_id = $1::uuid
      )`,
      [CLINIC_ID],
    );
    await client.query(
      `DELETE FROM clinical_protocols WHERE clinic_id = $1::uuid`,
      [CLINIC_ID],
    );
    await client.query(`DELETE FROM stock_items WHERE clinic_id = $1::uuid`, [
      CLINIC_ID,
    ]);
    await client.query(`DELETE FROM clinics WHERE id = $1::uuid`, [CLINIC_ID]);

    await client.query(
      `INSERT INTO clinics (id, name) VALUES ($1::uuid, $2)`,
      [CLINIC_ID, CLINIC_NAME],
    );

    for (const label of uniqueLabels) {
      const id = stockProductIdFromLabel(label);
      await client.query(
        `INSERT INTO stock_items (id, clinic_id, label, quantity)
         VALUES ($1, $2::uuid, $3, $4)`,
        [id, CLINIC_ID, label, STOCK_QTY],
      );
    }

    for (let i = 0; i < protocols.length; i++) {
      const p = protocols[i];
      const protocolId = uuidv5(p.nom, CLINIC_ID);
      const basePriceCents = 20000 + i * 500;
      await client.query(
        `INSERT INTO clinical_protocols (id, clinic_id, name, category, base_price_cents, active)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, true)`,
        [protocolId, CLINIC_ID, p.nom, p.categorie, basePriceCents],
      );

      for (const c of p.consommables_par_defaut) {
        const stockId = stockProductIdFromLabel(c.item);
        await client.query(
          `INSERT INTO protocol_consumables (protocol_id, stock_product_id, default_quantity)
           VALUES ($1::uuid, $2, $3)`,
          [protocolId, stockId, c.qte],
        );
      }
    }

    await client.query("COMMIT");
    console.log("Seed OK : cabinet", CLINIC_ID);
    console.log("  Protocoles :", protocols.length);
    console.log("  Articles stock uniques :", uniqueLabels.length);
    console.log("  Quantité par article :", STOCK_QTY);
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Erreur seed :", e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
