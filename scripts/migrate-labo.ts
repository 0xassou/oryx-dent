/**
 * Insère les commandes labo mock (Marie Dupont, Jean Martin, etc.) dans PostgreSQL.
 *
 * Usage : npx tsx scripts/migrate-labo.ts
 *
 * Charge `.env.local` si `DATABASE_URL` n’est pas déjà défini.
 */

import { randomUUID } from "node:crypto";
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

type SeedCommande = {
  patientNom: string;
  travail: string;
  laboratoire: string;
  dent?: string;
  materiau?: string;
  teinte?: string;
  cout_labo?: number;
  statut?: string;
  date_retour?: string;
  date_pose?: string;
};

const SEEDS: SeedCommande[] = [
  {
    patientNom: "Marie Dupont",
    travail: "Couronne Céramo-Métallique sur 46",
    laboratoire: "Labo Dentaire Express",
    dent: "46",
    materiau: "Zircone",
    teinte: "A2",
    cout_labo: 0,
    statut: "en_attente",
    date_retour: new Date().toISOString().slice(0, 10),
    date_pose: new Date().toISOString().slice(0, 10),
  },
  {
    patientNom: "Jean Martin",
    travail: "Inlay-Onlay (Composite) sur 16",
    laboratoire: "Prothèse & Co",
    dent: "16",
    materiau: "E-max",
    teinte: "B1",
    cout_labo: 0,
    statut: "en_fabrication",
    date_retour: new Date().toISOString().slice(0, 10),
  },
  {
    patientNom: "Sophie Bernard",
    travail: "Bridge Zircone 24-25-26",
    laboratoire: "ZircoLab",
    dent: "24-25-26",
    materiau: "Zircone",
    teinte: "C3",
    cout_labo: 12000,
    statut: "recu_cabinet",
    date_retour: new Date().toISOString().slice(0, 10),
    date_pose: new Date().toISOString().slice(0, 10),
  },
  {
    patientNom: "Claire Moreau",
    travail: "Prothèse partielle (résine) — modèle 3",
    laboratoire: "ClinPro Lab",
    materiau: "Résine",
    teinte: "A3.5",
    cout_labo: 0,
    statut: "pose",
    date_retour: new Date().toISOString().slice(0, 10),
    date_pose: new Date().toISOString().slice(0, 10),
  },
];

function splitName(full: string): { prenom: string; nom: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { prenom: "", nom: "" };
  if (parts.length === 1) return { prenom: parts[0]!, nom: "" };
  return { prenom: parts[0]!, nom: parts.slice(1).join(" ") };
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

  for (const s of SEEDS) {
    const { prenom, nom } = splitName(s.patientNom);
    const { rows } = await pool.query<{ id: string }>(
      `SELECT id FROM patients WHERE prenom = $1 AND nom = $2 LIMIT 1`,
      [prenom, nom],
    );
    const patientId = rows[0]?.id ?? null;

    const id = randomUUID();
    await pool.query(
      `
      INSERT INTO commandes_labo (
        id, patient_id, patient_nom, travail, laboratoire,
        dent, materiau, teinte, cout_labo, statut,
        date_retour, date_pose, historique
      ) VALUES (
        $1,$2,$3,$4,$5,
        $6,$7,$8,$9,$10,
        $11::date,$12::date,$13::jsonb
      )
      ON CONFLICT (id) DO NOTHING
      `,
      [
        id,
        patientId,
        s.patientNom,
        s.travail,
        s.laboratoire,
        s.dent ?? null,
        s.materiau ?? null,
        s.teinte ?? null,
        Math.max(0, s.cout_labo ?? 0),
        s.statut ?? "en_attente",
        s.date_retour ?? null,
        s.date_pose ?? null,
        JSON.stringify([]),
      ],
    );

    console.log(
      "OK commande_labo",
      id.slice(0, 8),
      s.patientNom,
      patientId ? "(liée)" : "(non liée)",
    );
  }

  await pool.end();
  console.log("migrate-labo : terminé.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

