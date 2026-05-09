"use server";

import { unstable_cache, revalidateTag } from "next/cache";
import { generateId } from "@better-auth/core/utils/id";
import { hashPassword } from "@better-auth/utils/password";
import { getPostgresPool } from "@/lib/server/db/pool";
import { getBetterAuthSession } from "@/lib/server/auth/better-auth-session";
import { resolveCabinetRoleForEmail } from "@/lib/server/auth/cabinet-role";
import { requireCabinetAdminSession } from "@/lib/server/auth/require-session";
import { generateTempPassword } from "@/lib/team/generate-temp-password";
import type {
  CreateTeamMemberInput,
  TeamMemberRow,
  TeamMemberRole,
  UpdateTeamMemberInput,
} from "@/lib/types/team-db";
import type { Role } from "@/utils/roles";
import { parseInvitationToken } from "@/utils/roles";
import { logServerError } from "@/lib/server/logger";

const TEAM_MEMBERS_CACHE_TAG = "team-members";

function toIso(v: unknown): string {
  if (v == null) return new Date(0).toISOString();
  if (v instanceof Date) return v.toISOString();
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString();
}

function mapTeamRow(r: Record<string, unknown>): TeamMemberRow {
  return {
    id: String(r.id),
    nom: String(r.nom ?? ""),
    prenom: String(r.prenom ?? ""),
    email: String(r.email ?? ""),
    role: r.role as TeamMemberRole,
    telephone: r.telephone == null ? null : String(r.telephone),
    specialite: r.specialite == null ? null : String(r.specialite),
    actif: Boolean(r.actif),
    password_hash: r.password_hash == null ? null : String(r.password_hash),
    must_change_password: Boolean(r.must_change_password),
    temp_password_display:
      r.temp_password_display == null
        ? null
        : String(r.temp_password_display),
    created_at: toIso(r.created_at),
    updated_at: toIso(r.updated_at),
  };
}

/** Réponse API / UI : jamais de hash ni de mot de passe en clair. */
function mapTeamMemberForClient(r: Record<string, unknown>): TeamMemberRow {
  const m = mapTeamRow(r);
  return {
    ...m,
    password_hash: null,
    temp_password_display: null,
  };
}

async function loadTeamMembersForCache(): Promise<TeamMemberRow[]> {
  const pool = getPostgresPool();
  const { rows } = await pool.query(
    `SELECT * FROM team_members ORDER BY nom ASC, prenom ASC`,
  );
  return rows.map((row) => mapTeamMemberForClient(row as Record<string, unknown>));
}

const getTeamMembersCached = unstable_cache(loadTeamMembersForCache, ["team-members-list-v1"], {
  revalidate: 60,
  tags: [TEAM_MEMBERS_CACHE_TAG],
});

const ROLES: readonly TeamMemberRole[] = [
  "admin",
  "praticien",
  "assistant",
  "remplacant",
] as const;

function isTeamMemberRole(v: string): v is TeamMemberRole {
  return (ROLES as readonly string[]).includes(v);
}

/**
 * Rôle applicatif après connexion Better Auth (localStorage / navigation).
 * Sans ligne `team_members`, le compte est traité comme administrateur cabinet.
 */
export async function resolveAppRoleForSessionAction(): Promise<
  | {
      ok: true;
      role: Role;
      email: string;
      nom: string;
    }
  | { ok: false; error: string }
> {
  const session = await getBetterAuthSession();
  if (!session?.user?.email) {
    return { ok: false, error: "Non authentifié." };
  }
  const email = session.user.email.trim().toLowerCase();
  const pool = getPostgresPool();
  const { rows } = await pool.query<{
    nom: string;
    prenom: string;
  }>(
    `SELECT nom, prenom FROM team_members WHERE lower(email) = lower($1) AND actif = true LIMIT 1`,
    [email],
  );
  const cabinetRole = await resolveCabinetRoleForEmail(email);
  const roleMap: Record<TeamMemberRole, Role> = {
    admin: "admin",
    praticien: "praticien",
    assistant: "assistant",
    remplacant: "remplacant",
  };
  const role = roleMap[cabinetRole];
  let nom =
    session.user.name?.trim() || email.split("@")[0] || "Utilisateur";
  if (rows.length > 0) {
    const r = rows[0]!;
    nom = `${r.prenom} ${r.nom}`.trim();
  }
  return { ok: true, role, email, nom };
}

export async function getTeamMembersAction(): Promise<
  { ok: true; data: TeamMemberRow[] } | { ok: false; error: string }
> {
  const gate = await requireCabinetAdminSession();
  if (!gate.ok) return gate;
  try {
    const data = await getTeamMembersCached();
    return {
      ok: true,
      data,
    };
  } catch (e) {
    logServerError("getTeamMembersAction", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Impossible de charger l'équipe.",
    };
  }
}

/**
 * Crée l'enregistrement `team_members` et le compte Better Auth (tables `user` + `account`),
 * équivalent serveur de `authClient.signUp.email` avec le mot de passe temporaire produit.
 */
export async function createTeamMemberAction(
  data: CreateTeamMemberInput,
): Promise<
  | {
      ok: true;
      member: TeamMemberRow;
      tempPassword: string;
      authWarning?: string;
    }
  | { ok: false; error: string }
> {
  const gate = await requireCabinetAdminSession();
  if (!gate.ok) return gate;

  const nom = data.nom.trim();
  const prenom = data.prenom.trim();
  const email = data.email.trim().toLowerCase();
  if (!nom || !prenom) {
    return { ok: false, error: "Nom et prénom sont obligatoires." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Adresse e-mail invalide." };
  }
  if (!isTeamMemberRole(data.role)) {
    return { ok: false, error: "Rôle invalide." };
  }

  const pool = getPostgresPool();
  const memberId = generateId();
  const tempPlain = generateTempPassword();
  const pwdHash = await hashPassword(tempPlain);
  const displayName = `${prenom} ${nom}`.trim();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const dupTeam = await client.query(
      `SELECT id FROM team_members WHERE lower(email) = lower($1)`,
      [email],
    );
    if (dupTeam.rows.length > 0) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Ce membre est déjà enregistré." };
    }

    const dupUser = await client.query(
      `SELECT id FROM "user" WHERE lower("email") = lower($1)`,
      [email],
    );
    if (dupUser.rows.length > 0) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Un compte existe déjà avec cet e-mail." };
    }

    let authWarning: string | undefined;
    await client.query("SAVEPOINT team_member_auth");
    try {
      await client.query(
        `
        INSERT INTO "user" (id, name, email, "emailVerified", image, "createdAt", "updatedAt")
        VALUES ($1, $2, $3, 1, NULL, NOW(), NOW())
        `,
        [memberId, displayName, email],
      );

      await client.query(
        `
        INSERT INTO "account" (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
        VALUES ($1, $2, 'credential', $2, $3, NOW(), NOW())
        `,
        [generateId(), memberId, pwdHash],
      );
      await client.query("RELEASE SAVEPOINT team_member_auth");
    } catch (authErr) {
      await client.query("ROLLBACK TO SAVEPOINT team_member_auth");
      logServerError(
        "createTeamMemberAction:authInsert",
        authErr,
        { phase: "insert user/account Better Auth" },
      );
      authWarning =
        "Membre enregistré dans l'équipe, mais la création du compte de connexion a échoué. Vérifiez les tables Better Auth ou créez le compte manuellement.";
    }

    const { rows } = await client.query(
      `
      INSERT INTO team_members (
        id, nom, prenom, email, role, telephone, specialite, actif,
        password_hash, must_change_password, temp_password_display,
        created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, true, $9, NOW(), NOW())
      RETURNING *
      `,
      [
        memberId,
        nom,
        prenom,
        email,
        data.role,
        data.telephone?.trim() || null,
        data.specialite?.trim() || null,
        pwdHash,
        tempPlain,
      ],
    );

    const row0 = rows[0] as Record<string, unknown> | undefined;
    if (!row0) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Insertion équipe : aucune ligne retournée." };
    }

    await client.query("COMMIT");
    revalidateTag(TEAM_MEMBERS_CACHE_TAG, "max");
    return {
      ok: true,
      member: mapTeamMemberForClient(row0),
      tempPassword: tempPlain,
      ...(authWarning ? { authWarning } : {}),
    };
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackErr) {
      logServerError("createTeamMemberAction:rollback", rollbackErr);
    }
    logServerError("createTeamMemberAction", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Création impossible.",
    };
  } finally {
    client.release();
  }
}

export async function updateTeamMemberAction(
  id: string,
  data: UpdateTeamMemberInput,
): Promise<{ ok: true; data: TeamMemberRow } | { ok: false; error: string }> {
  const gate = await requireCabinetAdminSession();
  if (!gate.ok) return gate;
  if (!id?.trim()) return { ok: false, error: "Identifiant manquant." };

  const sets: string[] = [];
  const vals: unknown[] = [];
  let n = 1;

  if (data.nom !== undefined) {
    sets.push(`nom = $${n++}`);
    vals.push(data.nom.trim());
  }
  if (data.prenom !== undefined) {
    sets.push(`prenom = $${n++}`);
    vals.push(data.prenom.trim());
  }
  if (data.role !== undefined) {
    if (!isTeamMemberRole(data.role)) {
      return { ok: false, error: "Rôle invalide." };
    }
    sets.push(`role = $${n++}`);
    vals.push(data.role);
  }
  if (data.telephone !== undefined) {
    sets.push(`telephone = $${n++}`);
    vals.push(data.telephone?.trim() || null);
  }
  if (data.specialite !== undefined) {
    sets.push(`specialite = $${n++}`);
    vals.push(data.specialite?.trim() || null);
  }
  if (data.actif !== undefined) {
    sets.push(`actif = $${n++}`);
    vals.push(data.actif);
  }

  if (sets.length === 0) {
    return { ok: false, error: "Aucune modification." };
  }

  sets.push(`updated_at = NOW()`);
  vals.push(id);

  try {
    const pool = getPostgresPool();
    const { rows } = await pool.query(
      `UPDATE team_members SET ${sets.join(", ")} WHERE id = $${n} RETURNING *`,
      vals,
    );
    if (rows.length === 0) {
      return { ok: false, error: "Membre introuvable." };
    }

    if (data.actif === false) {
      await pool.query(`DELETE FROM session WHERE "userId" = $1`, [id]);
    }

    const row = rows[0] as Record<string, unknown>;
    if (data.nom !== undefined || data.prenom !== undefined) {
      const nom = String(row.nom ?? "");
      const prenom = String(row.prenom ?? "");
      await pool.query(`UPDATE "user" SET name = $1, "updatedAt" = NOW() WHERE id = $2`, [
        `${prenom} ${nom}`.trim(),
        id,
      ]);
    }
    if (data.actif === false) {
      await pool.query(`UPDATE "user" SET "updatedAt" = NOW() WHERE id = $1`, [id]);
    }

    revalidateTag(TEAM_MEMBERS_CACHE_TAG, "max");
    return { ok: true, data: mapTeamMemberForClient(row) };
  } catch (e) {
    logServerError("updateTeamMemberAction", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Mise à jour impossible.",
    };
  }
}

/**
 * Supprime le membre et désactive le compte Better Auth (sessions + utilisateur).
 */
export async function deleteTeamMemberAction(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await requireCabinetAdminSession();
  if (!gate.ok) return gate;
  if (!gate.userId) return { ok: false, error: "Session invalide." };
  if (!id?.trim()) return { ok: false, error: "Identifiant manquant." };
  if (id === gate.userId) {
    return { ok: false, error: "Vous ne pouvez pas supprimer votre propre compte." };
  }

  const client = await getPostgresPool().connect();
  try {
    await client.query("BEGIN");
    const { rowCount } = await client.query(`DELETE FROM team_members WHERE id = $1`, [id]);
    if (!rowCount) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Membre introuvable." };
    }
    await client.query(`DELETE FROM session WHERE "userId" = $1`, [id]);
    await client.query(`DELETE FROM "account" WHERE "userId" = $1`, [id]);
    await client.query(`DELETE FROM "user" WHERE id = $1`, [id]);
    await client.query("COMMIT");
    revalidateTag(TEAM_MEMBERS_CACHE_TAG, "max");
    return { ok: true };
  } catch (e) {
    await client.query("ROLLBACK");
    logServerError("deleteTeamMemberAction", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Suppression impossible.",
    };
  } finally {
    client.release();
  }
}

/**
 * Premier changement de mot de passe (membre avec `must_change_password`).
 * Met à jour le credential Better Auth (`account`) avec le même hachage que Better Auth.
 */
export async function completeFirstPasswordChangeAction(
  newPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getBetterAuthSession();
  if (!session?.user?.id || !session.user.email?.trim()) {
    return { ok: false, error: "Non connecté." };
  }
  if (newPassword.length < 8) {
    return { ok: false, error: "Le mot de passe doit contenir au moins 8 caractères." };
  }

  const userId = session.user.id;
  const email = session.user.email.trim().toLowerCase();
  const pool = getPostgresPool();

  const { rows: tmRows } = await pool.query<{ must_change_password: boolean }>(
    `SELECT must_change_password FROM team_members WHERE id = $1 AND lower(email) = lower($2) AND actif = true LIMIT 1`,
    [userId, email],
  );
  if (tmRows.length === 0) {
    return {
      ok: false,
      error: "Ce compte ne nécessite pas de changement de mot de passe ici.",
    };
  }
  if (!tmRows[0]!.must_change_password) {
    return { ok: false, error: "Votre mot de passe est déjà définitif." };
  }

  const pwdHash = await hashPassword(newPassword);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const acc = await client.query(
      `UPDATE "account" SET password = $1, "updatedAt" = NOW() WHERE "userId" = $2 AND "providerId" = 'credential'`,
      [pwdHash, userId],
    );
    if (acc.rowCount === 0) {
      await client.query("ROLLBACK");
      return {
        ok: false,
        error: "Compte credential introuvable. Contactez l’administrateur.",
      };
    }
    const tm = await client.query(
      `
      UPDATE team_members
      SET must_change_password = false,
          temp_password_display = NULL,
          password_hash = $1,
          updated_at = NOW()
      WHERE id = $2 AND lower(trim(email)) = lower(trim($3))
      `,
      [pwdHash, userId, email],
    );
    if ((tm.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return {
        ok: false,
        error: "Mise à jour du membre d’équipe impossible (email ou identifiant incohérent).",
      };
    }
    await client.query("COMMIT");
    revalidateTag(TEAM_MEMBERS_CACHE_TAG, "max");
    return { ok: true };
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* noop */
    }
    logServerError("completeFirstPasswordChangeAction", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Mise à jour impossible.",
    };
  } finally {
    client.release();
  }
}

function splitInvitationDisplayName(full: string): { nom: string; prenom: string } {
  const t = full.trim();
  if (!t) return { prenom: "Invité", nom: "Cabinet" };
  const parts = t.split(/\s+/);
  if (parts.length === 1) {
    const one = parts[0]!;
    return { prenom: one, nom: one };
  }
  return { prenom: parts[0]!, nom: parts.slice(1).join(" ") };
}

/**
 * Acceptation d’invitation (token signé) : crée `user` + `account` Better Auth et `team_members`.
 * Pas d’authentification préalable (lien public).
 */
export async function acceptInvitationAction(
  rawToken: string,
  displayName: string,
  password: string,
): Promise<
  | { ok: true; email: string; role: TeamMemberRole; memberId: string }
  | { ok: false; error: string }
> {
  const parsed = await parseInvitationToken(rawToken.trim());
  if (!parsed.ok) return parsed;

  if (password.length < 8) {
    return { ok: false, error: "Le mot de passe doit contenir au moins 8 caractères." };
  }

  const email = parsed.data.email;
  const roleInput = parsed.data.role;
  if (roleInput !== "assistant" && roleInput !== "remplacant") {
    return { ok: false, error: "Rôle d’invitation invalide." };
  }
  const role: TeamMemberRole = roleInput;

  const { nom, prenom } = splitInvitationDisplayName(displayName);
  const memberId = generateId();
  const pwdHash = await hashPassword(password);
  const displayNameFull = `${prenom} ${nom}`.trim();

  const pool = getPostgresPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const dupTeam = await client.query(
      `SELECT id FROM team_members WHERE lower(email) = lower($1)`,
      [email],
    );
    if (dupTeam.rows.length > 0) {
      await client.query("ROLLBACK");
      return {
        ok: false,
        error: "Ce compte est déjà enregistré. Connectez-vous avec cet e-mail.",
      };
    }

    const dupUser = await client.query(
      `SELECT id FROM "user" WHERE lower("email") = lower($1)`,
      [email],
    );
    if (dupUser.rows.length > 0) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Un compte existe déjà avec cet e-mail." };
    }

    await client.query(
      `
      INSERT INTO "user" (id, name, email, "emailVerified", image, "createdAt", "updatedAt")
      VALUES ($1, $2, $3, 1, NULL, NOW(), NOW())
      `,
      [memberId, displayNameFull, email],
    );

    await client.query(
      `
      INSERT INTO "account" (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
      VALUES ($1, $2, 'credential', $2, $3, NOW(), NOW())
      `,
      [generateId(), memberId, pwdHash],
    );

    await client.query(
      `
      INSERT INTO team_members (
        id, nom, prenom, email, role, telephone, specialite, actif,
        password_hash, must_change_password, temp_password_display,
        created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, NULL, NULL, true, $6, false, NULL, NOW(), NOW())
      `,
      [memberId, nom, prenom, email, role, pwdHash],
    );

    await client.query("COMMIT");
    revalidateTag(TEAM_MEMBERS_CACHE_TAG, "max");
    return { ok: true, email, role, memberId };
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* noop */
    }
    logServerError("acceptInvitationAction", e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Inscription impossible.",
    };
  } finally {
    client.release();
  }
}
