/**
 * Insère 4 rendez-vous de démonstration liés aux patients déjà en base.
 *
 * Usage :
 *   npx tsx scripts/migrate-appointments.ts
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

function addDays(base: Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function main() {
  loadDotEnvLocal();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL manquant (.env.local ou environnement).");
    process.exit(1);
  }

  const pool = new Pool({ connectionString, max: 2 });

  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM patients ORDER BY created_at ASC NULLS LAST, nom, prenom LIMIT 4`,
  );

  if (rows.length === 0) {
    console.error(
      "Aucun patient en base — exécutez scripts/migrate-patients.ts d’abord.",
    );
    await pool.end();
    process.exit(1);
  }

  const patientId = (i: number) => rows[i % rows.length]!.id;
  const today = new Date();

  const seeds = [
    {
      patientIdx: 0,
      date: addDays(today, 1),
      heure: "09:00",
      duree: 30,
      type_acte: "Consultation",
      statut: "confirme",
      notes: "Démo — script migrate-appointments",
      praticien: "Dr. Benali",
      salle: "Cabinet 1",
    },
    {
      patientIdx: 1,
      date: addDays(today, 2),
      heure: "10:30",
      duree: 45,
      type_acte: "Détartrage",
      statut: "confirme",
      notes: null,
      praticien: "Dr. Saidi",
      salle: "Cabinet 2",
    },
    {
      patientIdx: 2,
      date: addDays(today, 4),
      heure: "14:15",
      duree: 60,
      type_acte: "Extraction",
      statut: "confirme",
      notes: "PDP fourni",
      praticien: "Dr. Benali",
      salle: "Bloc",
    },
    {
      patientIdx: 3,
      date: addDays(today, 6),
      heure: "11:00",
      duree: 30,
      type_acte: "Contrôle",
      statut: "en_attente",
      notes: null,
      praticien: null,
      salle: "Cabinet 1",
    },
  ];

  for (const s of seeds) {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO appointments (
         id, patient_id, date, heure, duree, type_acte, statut, notes, praticien, salle
       ) VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id,
        patientId(s.patientIdx),
        s.date,
        s.heure,
        s.duree,
        s.type_acte,
        s.statut,
        s.notes,
        s.praticien,
        s.salle,
      ],
    );
    console.log("OK RDV", id, s.date, s.heure, "patient", patientId(s.patientIdx));
  }

  await pool.end();
  console.log("migrate-appointments : terminé.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
