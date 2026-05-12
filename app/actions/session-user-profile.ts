"use server";

import { getBetterAuthSession } from "@/lib/server/auth/better-auth-session";
import { getPostgresPool } from "@/lib/server/db/pool";
import { logServerError } from "@/lib/server/logger";

export type SessionUserProfile = {
  prenom: string;
  nom: string;
  email: string;
};

/**
 * Profil affichable « Mon compte » : priorité `team_members` (prenom/nom),
 * sinon découpage de `user.name` Better Auth, sinon partie locale de l’email.
 */
export async function getSessionUserProfileAction(): Promise<
  | { ok: true; data: SessionUserProfile }
  | { ok: false; error: string }
> {
  try {
    const session = await getBetterAuthSession();
    if (!session?.user?.email?.trim()) {
      return { ok: false, error: "Non authentifié." };
    }
    const email = session.user.email.trim();
    let prenom = "";
    let nom = "";

    const pool = getPostgresPool();
    const { rows } = await pool.query<{ prenom: string; nom: string }>(
      `SELECT prenom, nom FROM team_members WHERE lower(email) = lower($1) AND actif = true LIMIT 1`,
      [email],
    );

    if (rows.length > 0) {
      prenom = String(rows[0]!.prenom ?? "").trim();
      nom = String(rows[0]!.nom ?? "").trim();
    } else {
      const display = session.user.name?.trim() ?? "";
      const parts = display.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        prenom = parts[0]!;
        nom = parts.slice(1).join(" ");
      } else if (parts.length === 1) {
        prenom = parts[0]!;
        nom = "";
      } else {
        prenom = email.split("@")[0] ?? "";
        nom = "";
      }
    }

    return { ok: true, data: { prenom, nom, email } };
  } catch (e) {
    logServerError("getSessionUserProfileAction", e);
    return { ok: false, error: "Une erreur est survenue." };
  }
}
