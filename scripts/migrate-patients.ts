/**
 * Insère 4 patients de démonstration (profils réalistes, Algérie).
 *
 * Usage :
 *   npx tsx scripts/migrate-patients.ts
 *
 * Charge `.env.local` si `DATABASE_URL` n’est pas déjà défini.
 */

import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";

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

  const patients = [
    {
      id: randomUUID(),
      nom: "Mebarki",
      prenom: "Yasmine",
      telephone: "0550 12 34 56",
      email: "yasmine.mebarki@email.dz",
      date_naissance: "1989-07-22",
      sexe: "F",
      adresse: "Cité Diar El Mahçoul, Bab Ezzouar, Alger",
      mutuelle: "CNAS",
      antecedents: "Allergie aux AINS",
      notes: "Patient démo — script migrate-patients",
    },
    {
      id: randomUUID(),
      nom: "Boukhari",
      prenom: "Rachid",
      telephone: "0771 88 99 00",
      email: "r.boukhari@email.dz",
      date_naissance: "1976-11-05",
      sexe: "M",
      adresse: "Rue Larbi Ben M'hidi, Sidi Bel Abbès",
      mutuelle: "CASO",
      antecedents: "Hypertension artérielle équilibrée",
      notes: null,
    },
    {
      id: randomUUID(),
      nom: "Amrani",
      prenom: "Leïla",
      telephone: "0560 44 55 66",
      email: null,
      date_naissance: "1994-03-18",
      sexe: "F",
      adresse: "Bd du 19 Mai 1956, Annaba",
      mutuelle: null,
      antecedents: null,
      notes: "Bilan de routine",
    },
    {
      id: randomUUID(),
      nom: "Henni",
      prenom: "Karim",
      telephone: "0661 77 88 33",
      email: "karim.henni@email.dz",
      date_naissance: "1982-01-30",
      sexe: "M",
      adresse: "Rue Abdelhamid Ben Badis, Constantine",
      mutuelle: "MGEN",
      antecedents: "Tabagisme léger",
      notes: null,
    },
  ];

  for (const p of patients) {
    await pool.query(
      `INSERT INTO patients (
         id, nom, prenom, telephone, email, date_naissance,
         sexe, adresse, mutuelle, antecedents, notes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO NOTHING`,
      [
        p.id,
        p.nom,
        p.prenom,
        p.telephone,
        p.email,
        p.date_naissance,
        p.sexe,
        p.adresse,
        p.mutuelle,
        p.antecedents,
        p.notes,
      ],
    );
    console.log("OK", p.prenom, p.nom, p.id);
  }

  await pool.end();
  console.log("migrate-patients : terminé.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
