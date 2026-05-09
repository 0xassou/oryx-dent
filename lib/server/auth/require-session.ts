/**
 * Garde-fous session Better Auth pour Server Actions et modules serveur.
 */

import { getBetterAuthSession } from "@/lib/server/auth/better-auth-session";
import {
  canManageDepensesEmail,
  canManageStocksEmail,
  isCabinetAdminEmail,
  type CabinetRole,
  resolveCabinetRoleForEmail,
} from "@/lib/server/auth/cabinet-role";

export type AuthGateOk = {
  ok: true;
  userId: string;
  email: string;
};

export type AuthGateFail = { ok: false; error: string };

export async function requireBetterAuthSession(): Promise<
  AuthGateOk | AuthGateFail
> {
  const session = await getBetterAuthSession();
  const id = session?.user?.id?.trim();
  const email = session?.user?.email?.trim().toLowerCase();
  if (!id || !email) {
    return { ok: false, error: "Non authentifié." };
  }
  return { ok: true, userId: id, email };
}

export async function requireCabinetAdminSession(): Promise<
  AuthGateOk | AuthGateFail
> {
  const base = await requireBetterAuthSession();
  if (!base.ok) return base;
  if (!(await isCabinetAdminEmail(base.email))) {
    return { ok: false, error: "Réservé aux administrateurs du cabinet." };
  }
  return base;
}

export async function requireCabinetRoleSession(
  allowed: readonly CabinetRole[],
): Promise<AuthGateOk | AuthGateFail> {
  const base = await requireBetterAuthSession();
  if (!base.ok) return base;
  const role = await resolveCabinetRoleForEmail(base.email);
  if (!allowed.includes(role)) {
    return { ok: false, error: "Permissions insuffisantes." };
  }
  return base;
}

export async function requireStocksAccessSession(): Promise<
  AuthGateOk | AuthGateFail
> {
  const base = await requireBetterAuthSession();
  if (!base.ok) return base;
  if (!(await canManageStocksEmail(base.email))) {
    return { ok: false, error: "Accès stocks réservé à l’administration." };
  }
  return base;
}

export async function requireDepensesAccessSession(): Promise<
  AuthGateOk | AuthGateFail
> {
  const base = await requireBetterAuthSession();
  if (!base.ok) return base;
  if (!(await canManageDepensesEmail(base.email))) {
    return { ok: false, error: "Accès dépenses non autorisé pour ce rôle." };
  }
  return base;
}

/** Pour pages serveur (ex. onglet Sauvegardes). */
export async function isCabinetAdminFromSession(): Promise<boolean> {
  const g = await requireBetterAuthSession();
  if (!g.ok) return false;
  return isCabinetAdminEmail(g.email);
}
