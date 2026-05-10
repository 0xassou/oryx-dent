import { getPostgresPool } from "@/lib/server/db/pool";
import {
  resolveCabinetRoleForEmail,
  type CabinetRole,
} from "@/lib/server/auth/cabinet-role";

export type CabinetActorSnapshot = {
  userId: string;
  email: string;
  displayName: string;
  role: CabinetRole;
};

/**
 * Résout le nom affiché (équipe si ligne `team_members`, sinon `user.name`)
 * et le rôle cabinet pour la session courante.
 */
export async function resolveCabinetActorSnapshot(args: {
  userId: string;
  email: string;
}): Promise<CabinetActorSnapshot> {
  const pool = getPostgresPool();
  const email = args.email.trim().toLowerCase();

  const [userRes, teamRes] = await Promise.all([
    pool.query<{ name: string | null }>(
      `SELECT name FROM "user" WHERE id = $1 LIMIT 1`,
      [args.userId],
    ),
    pool.query<{ prenom: string; nom: string }>(
      `SELECT prenom, nom FROM team_members
       WHERE lower(email) = lower($1) AND actif = true LIMIT 1`,
      [email],
    ),
  ]);

  const fromTeam = teamRes.rows[0];
  const teamName = fromTeam
    ? `${String(fromTeam.prenom ?? "").trim()} ${String(fromTeam.nom ?? "").trim()}`.trim()
    : "";
  const fromUser = String(userRes.rows[0]?.name ?? "").trim();
  const displayName =
    teamName ||
    fromUser ||
    email.split("@")[0] ||
    "Utilisateur";

  const role = await resolveCabinetRoleForEmail(email);

  return {
    userId: args.userId,
    email,
    displayName,
    role,
  };
}
