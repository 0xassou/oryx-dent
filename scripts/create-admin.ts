/**
 * Crée l'utilisateur administrateur Better Auth (email + mot de passe credential).
 *
 * Usage :
 *   ORYX_ADMIN_PASSWORD='votre-mot-de-passe' npx tsx scripts/create-admin.ts
 *
 * Charge `.env.local` si `DATABASE_URL` n’est pas déjà défini.
 *
 * Important : Better Auth utilise scrypt (@better-auth/utils), pas bcrypt.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import * as readline from "node:readline/promises";
import { Pool } from "pg";
import { hashPassword } from "@better-auth/utils/password";
import { generateId } from "@better-auth/core/utils/id";

const ADMIN_EMAIL = "assmess1996@icloud.com";
const ADMIN_NAME = "Administrateur";

function loadDotEnvLocal(): void {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split(/\n/)) {
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

async function promptPassword(prompt: string): Promise<string> {
  const rl = readline.createInterface({ input, output });
  try {
    return (await rl.question(prompt)).trim();
  } finally {
    rl.close();
  }
}

async function ensureTables(pool: Pool): Promise<void> {
  const { rows } = await pool.query<{ table_name: string }>(
    `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('user','session','account','verification')
    `,
  );
  const have = new Set(rows.map((r) => r.table_name));
  const required = ["user", "session", "account", "verification"] as const;
  const missing = required.filter((t) => !have.has(t));
  if (missing.length === 0) {
    console.log("[create-admin] Tables Better Auth présentes (user, session, account, verification).");
    return;
  }
  console.log("[create-admin] Tables manquantes :", missing.join(", "));
  const sqlPath = resolve(process.cwd(), "db/better-auth-schema.sql");
  if (!existsSync(sqlPath)) {
    throw new Error(`Fichier migration introuvable : ${sqlPath}`);
  }
  const ddl = readFileSync(sqlPath, "utf8");
  await pool.query(ddl);
  console.log("[create-admin] Migration appliquée : db/better-auth-schema.sql");
}

async function main(): Promise<void> {
  loadDotEnvLocal();

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("[create-admin] DATABASE_URL est requis (ex. depuis .env.local).");
    process.exit(1);
  }

  let password = process.env.ORYX_ADMIN_PASSWORD?.trim();
  if (!password) {
    password = await promptPassword(
      `[create-admin] Mot de passe pour ${ADMIN_EMAIL} (ORYX_ADMIN_PASSWORD non défini) : `,
    );
  }

  const minLen = Number(process.env.ORYX_ADMIN_PASSWORD_MIN_LENGTH ?? "8") || 8;
  if (password.length < minLen) {
    console.error(`[create-admin] Mot de passe trop court (minimum ${minLen} caractères).`);
    process.exit(1);
  }

  const pool = new Pool({ connectionString, max: 2 });
  try {
    await ensureTables(pool);

    const emailNormalized = ADMIN_EMAIL.trim().toLowerCase();
    const passwordHash = await hashPassword(password);

    const existing = await pool.query<{ id: string }>(
      `SELECT id FROM "user" WHERE lower("email") = lower($1) LIMIT 1`,
      [ADMIN_EMAIL.trim()],
    );

    let userId: string;

    if (existing.rows.length > 0) {
      userId = existing.rows[0]!.id;
      console.log("[create-admin] Utilisateur existe déjà, mise à jour du compte credential + mot de passe.");
      await pool.query(`UPDATE "user" SET name = $1, "updatedAt" = NOW() WHERE id = $2`, [
        ADMIN_NAME,
        userId,
      ]);

      await pool.query(
        `
        UPDATE "account"
        SET password = $1, "updatedAt" = NOW()
        WHERE "userId" = $2 AND "providerId" = 'credential'
        `,
        [passwordHash, userId],
      );

      const accCheck = await pool.query<{ id: string }>(
        `SELECT id FROM "account" WHERE "userId" = $1 AND "providerId" = 'credential'`,
        [userId],
      );
      if (accCheck.rows.length === 0) {
        await pool.query(
          `
          INSERT INTO "account"
            (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
          VALUES
            ($1, $2, 'credential', $2, $3, NOW(), NOW())
          `,
          [generateId(), userId, passwordHash],
        );
      }
    } else {
      userId = generateId();
      await pool.query(
        `
        INSERT INTO "user"
          (id, name, email, "emailVerified", image, "createdAt", "updatedAt")
        VALUES
          ($1, $2, $3, 1, NULL, NOW(), NOW())
        `,
        [userId, ADMIN_NAME, emailNormalized],
      );
      await pool.query(
        `
        INSERT INTO "account"
          (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
        VALUES
          ($1, $2, 'credential', $2, $3, NOW(), NOW())
        `,
        [generateId(), userId, passwordHash],
      );
      console.log("[create-admin] Utilisateur créé.");
    }

    const check = await pool.query(
      `
      SELECT u.id, u.email, u.name, u."emailVerified",
             a."providerId", (a.password IS NOT NULL AND LENGTH(a.password) > 0) AS "has_password"
      FROM "user" u
      LEFT JOIN "account" a ON a."userId" = u.id AND a."providerId" = 'credential'
      WHERE u.id = $1
      `,
      [userId],
    );

    const row = check.rows[0];
    console.log("[create-admin] Vérification PostgreSQL :");
    console.dir(
      row
        ? {
            ...row,
            roleApp: "admin (via localStorage après connexion)",
          }
        : null,
      { depth: null },
    );

    console.log("[create-admin] OK — connexion Better Auth avec email + credential.");
    process.exitCode = 0;
  } catch (err) {
    console.error("[create-admin] Erreur :", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[create-admin] Fatal :", err);
  process.exit(1);
});