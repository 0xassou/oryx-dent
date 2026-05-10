const DEV_FALLBACK = "oryx-dev-better-auth-secret-change-me";

/**
 * Secret partagé Better Auth / cookies JWE / JWT session legacy (`oryx-session`).
 * En production, `BETTER_AUTH_SECRET` ou `AUTH_SECRET` doit être défini.
 */
export function resolveAuthSecret(): string {
  const raw = process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET;
  if (typeof raw === "string" && raw.trim()) {
    return raw.trim();
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("BETTER_AUTH_SECRET est requis en production");
  }
  console.warn(
    "[Oryx] BETTER_AUTH_SECRET (ou AUTH_SECRET) n'est pas défini — utilisation d'un secret de développement uniquement.",
  );
  return DEV_FALLBACK;
}
