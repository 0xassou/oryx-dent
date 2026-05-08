/**
 * Insère 4 factures de démo liées aux patients présents en base.
 *
 * Usage : npx tsx scripts/migrate-factures.ts
 *
 * Charge `.env.local` si `DATABASE_URL` n’est pas déjà défini.
 */

import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";
import {
  ensureFacturesDdl,
  ensureStocksDdl,
} from "./ensure-stock-facture-ddl";

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

  await ensureStocksDdl(pool);
  await ensureFacturesDdl(pool);

  const { rows: patients } = await pool.query<{
    id: string;
    prenom: string;
    nom: string;
  }>(
    `SELECT id, prenom, nom FROM patients ORDER BY created_at ASC LIMIT 4`,
  );

  if (patients.length === 0) {
    console.error(
      "Aucun patient en base : exécutez d’abord scripts/migrate-patients.ts",
    );
    await pool.end();
    process.exit(1);
  }

  const seeds: {
    patientIndex: number;
    date: string;
    montant: number;
    montant_paye: number;
    statut: string;
    actes: Record<string, unknown> | null;
    notes: string | null;
  }[] = [
    {
      patientIndex: 0,
      date: "2026-05-06",
      montant: 18500,
      montant_paye: 18500,
      statut: "paye",
      actes: {
        acteName: "Consultation et détartrage",
        catalogActId: "demo-consult",
      },
      notes: null,
    },
    {
      patientIndex: 1 % patients.length,
      date: "2026-05-05",
      montant: 42000,
      montant_paye: 15000,
      statut: "partiel",
      actes: { acteName: "Obturation composite", catalogActId: "demo-occlusal" },
      notes: null,
    },
    {
      patientIndex: 2 % patients.length,
      date: "2026-05-04",
      montant: 95000,
      montant_paye: 0,
      statut: "en_attente",
      actes: { acteName: "Coiffe céramo-cémenteuse", catalogActId: "demo-cc" },
      notes: "Devis accepté — règlement à l’essayage",
    },
    {
      patientIndex: 3 % patients.length,
      date: "2026-05-07",
      montant: 12000,
      montant_paye: 6000,
      statut: "partiel",
      actes: { acteName: "Surfaçage et vernis fluoré", catalogActId: "demo-fluor" },
      notes: null,
    },
  ];

  for (const s of seeds) {
    const p = patients[s.patientIndex];
    const id = randomUUID();
    await pool.query(
      `INSERT INTO factures (
         id, patient_id, date, montant, montant_paye, statut, actes, notes
       ) VALUES ($1,$2,$3::date,$4,$5,$6,$7::jsonb,$8)
       ON CONFLICT (id) DO NOTHING`,
      [
        id,
        p.id,
        s.date,
        s.montant,
        s.montant_paye,
        s.statut,
        s.actes,
        s.notes,
      ],
    );
    console.log("OK facture", id.slice(0, 8), p.prenom, p.nom, s.date);
  }

  await pool.end();
  console.log("migrate-factures : terminé.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
