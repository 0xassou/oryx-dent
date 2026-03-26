/**
 * Pool PostgreSQL partagé (Route Handlers, Server Actions, jobs).
 * Définir `DATABASE_URL` dans l'environnement (ex. `.env.local`).
 */

import { Pool } from "pg";

let singleton: Pool | null = null;

export function getPostgresPool(): Pool {
  if (singleton) return singleton;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "[db] DATABASE_URL est requis pour executeClinicalAct et le stock SQL.",
    );
  }
  singleton = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
  });
  return singleton;
}
