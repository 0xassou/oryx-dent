/**
 * Rôle applicatif cabinet (PostgreSQL `team_members` + convention sans ligne = admin).
 */

import { getPostgresPool } from "@/lib/server/db/pool";

export type CabinetRole = "admin" | "praticien" | "assistant" | "remplacant";

const ROLES: readonly CabinetRole[] = [
  "admin",
  "praticien",
  "assistant",
  "remplacant",
] as const;

function isCabinetRole(v: string): v is CabinetRole {
  return (ROLES as readonly string[]).includes(v);
}

/**
 * Sans ligne `team_members` active, le compte est considéré comme administrateur cabinet
 * (compte initial / propriétaire).
 */
export async function resolveCabinetRoleForEmail(
  email: string,
): Promise<CabinetRole> {
  const normalized = email.trim().toLowerCase();
  const pool = getPostgresPool();
  const { rows } = await pool.query<{ role: string }>(
    `SELECT role FROM team_members WHERE lower(email) = lower($1) AND actif = true LIMIT 1`,
    [normalized],
  );
  if (rows.length === 0) {
    return "admin";
  }
  const role = rows[0]!.role;
  return isCabinetRole(role) ? role : "assistant";
}

export async function isCabinetAdminEmail(email: string): Promise<boolean> {
  return (await resolveCabinetRoleForEmail(email)) === "admin";
}

/** Admin ou assistante (module stocks). */
export async function canManageStocksEmail(email: string): Promise<boolean> {
  const r = await resolveCabinetRoleForEmail(email);
  return r === "admin" || r === "assistant";
}

/** Admin ou assistante (sous-page dépenses). */
export async function canManageDepensesEmail(email: string): Promise<boolean> {
  const r = await resolveCabinetRoleForEmail(email);
  return r === "admin" || r === "assistant";
}
