import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { getPostgresPool } from "@/lib/server/db/pool";
import { resolveAuthSecret } from "@/lib/server/auth/resolve-auth-secret";

/**
 * Better Auth — email + mot de passe, PostgreSQL (`lib/server/db/pool.ts`).
 * Variables : BETTER_AUTH_SECRET, BETTER_AUTH_URL (prod), DATABASE_URL.
 */
export const auth = betterAuth({
  secret: resolveAuthSecret(),
  baseURL:
    process.env.BETTER_AUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000",
  database: getPostgresPool(),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  session: {
    cookieCache: {
      enabled: true,
      strategy: "jwe",
      maxAge: 60 * 60 * 24 * 7,
    },
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  trustedOrigins: [
    ...(process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : []),
    ...(process.env.NEXT_PUBLIC_APP_URL ? [process.env.NEXT_PUBLIC_APP_URL] : []),
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ],
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
