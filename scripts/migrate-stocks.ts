/**
 * Insère 5 lignes stocks dentaires réalistes (contexte Algérie).
 *
 * Usage : npx tsx scripts/migrate-stocks.ts
 *
 * Charge `.env.local` si `DATABASE_URL` n’est pas déjà défini.
 * Les `id` sont alignés sur `stockProductIdFromLabel` pour la déduction cockpit.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";
import { stockProductIdFromLabel } from "../lib/mapping/stockProductId";
import { ensureStocksDdl } from "./ensure-stock-facture-ddl";

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

type StockSeed = {
  label: string;
  categorie: string;
  quantite: number;
  quantite_min: number;
  unite: string;
  prix_unitaire: number;
  fournisseur: string;
  notesMeta: Record<string, unknown>;
};

const ITEMS: StockSeed[] = [
  {
    label: "Gants nitrile sans poudre (boîte 100)",
    categorie: "Protection",
    quantite: 42,
    quantite_min: 10,
    unite: "boîte",
    prix_unitaire: 2800,
    fournisseur: "Distri Médical Alger",
    notesMeta: {
      v: 1,
      gestion: "unitaire",
      peremption: "2027-03-15",
      quantiteMax: 80,
    },
  },
  {
    label: "Masques chirurgicaux triple couche",
    categorie: "Protection",
    quantite: 1200,
    quantite_min: 200,
    unite: "unité",
    prix_unitaire: 45,
    fournisseur: "SARL Pharmédia Oran",
    notesMeta: { v: 1, gestion: "unitaire", peremption: "2026-12-01", quantiteMax: 2000 },
  },
  {
    label: "Lidocaïne 2% — carpules",
    categorie: "Pharmacie",
    quantite: 180,
    quantite_min: 40,
    unite: "carpule",
    prix_unitaire: 120,
    fournisseur: "Medis DZ Constantine",
    notesMeta: { v: 1, gestion: "multidose", peremption: "2026-08-30", quantiteMax: 300 },
  },
  {
    label: "Composite photopolymérisable A2",
    categorie: "Consommable dentaire",
    quantite: 24,
    quantite_min: 6,
    unite: "seringue",
    prix_unitaire: 8900,
    fournisseur: "Dental Pro Maghreb",
    notesMeta: { v: 1, gestion: "unitaire", peremption: "2027-01-20", quantiteMax: 40 },
  },
  {
    label: "Irrigant chlorhexidine 0,12 % (flacon 500 ml)",
    categorie: "Désinfection",
    quantite: 18,
    quantite_min: 4,
    unite: "flacon",
    prix_unitaire: 1650,
    fournisseur: "Bio Smile Alger",
    notesMeta: { v: 1, gestion: "multidose", peremption: "2028-05-01", quantiteMax: 30 },
  },
];

async function main() {
  loadDotEnvLocal();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL manquant (.env.local ou environnement).");
    process.exit(1);
  }

  const pool = new Pool({ connectionString, max: 2 });

  await ensureStocksDdl(pool);

  for (const it of ITEMS) {
    const id = stockProductIdFromLabel(it.label);
    const notes = JSON.stringify(it.notesMeta);
    await pool.query(
      `INSERT INTO stocks (
         id, nom, categorie, quantite, quantite_min,
         unite, prix_unitaire, fournisseur, notes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET
         nom = EXCLUDED.nom,
         categorie = EXCLUDED.categorie,
         quantite = EXCLUDED.quantite,
         quantite_min = EXCLUDED.quantite_min,
         unite = EXCLUDED.unite,
         prix_unitaire = EXCLUDED.prix_unitaire,
         fournisseur = EXCLUDED.fournisseur,
         notes = EXCLUDED.notes,
         updated_at = NOW()`,
      [
        id,
        it.label,
        it.categorie,
        it.quantite,
        it.quantite_min,
        it.unite,
        it.prix_unitaire,
        it.fournisseur,
        notes,
      ],
    );
    console.log("OK stock", id, it.label.slice(0, 40));
  }

  await pool.end();
  console.log("migrate-stocks : terminé.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
