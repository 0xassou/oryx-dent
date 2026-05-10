import { getCookieCache } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { resolveAuthSecret } from "@/lib/server/auth/resolve-auth-secret";

/**
 * Vérifie le cache de session JWE signé (cookie `better-auth.session_data`) —
 * aligné sur `session.cookieCache.strategy: "jwe"` dans `lib/auth.ts`.
 */
async function hasValidBetterAuthSessionCookie(
  request: NextRequest,
): Promise<boolean> {
  let secret: string;
  try {
    secret = resolveAuthSecret();
  } catch (e) {
    console.error("[proxy] secret d'authentification manquant", e);
    return false;
  }
  try {
    const isHttps = request.nextUrl.protocol === "https:";
    const payload = await getCookieCache(request, {
      secret,
      strategy: "jwe",
      isSecure: isHttps,
    });
    return Boolean(payload?.user);
  } catch (e) {
    console.error("[proxy] lecture du cookie de session", e);
    return false;
  }
}

function isPublicPath(pathname: string): boolean {
  if (pathname === "/login" || pathname.startsWith("/login/")) return true;
  if (pathname.startsWith("/api/auth")) return true;
  /** Cron HTTP (secret vérifié dans la route, pas de session cookie). */
  if (pathname.startsWith("/api/cron/")) return true;
  /** Invitation par lien token (sans compte Better Auth). */
  if (pathname.startsWith("/invitation")) return true;
  return false;
}

async function getMustChangePassword(request: NextRequest): Promise<boolean> {
  try {
    const url = new URL("/api/team/must-change-password", request.nextUrl.origin);
    const response = await fetch(url, {
      headers: { cookie: request.headers.get("cookie") ?? "" },
      cache: "no-store",
    });
    const data: unknown = await response.json().catch(() => null);
    if (!data || typeof data !== "object") return false;
    return (data as { mustChangePassword?: boolean }).mustChangePassword === true;
  } catch {
    return false;
  }
}

/** Next.js 16+ : `proxy` remplace l’ancien export `middleware`. */
export async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  if (pathname === "/api/team/must-change-password") {
    return NextResponse.next();
  }

  if (pathname === "/login" || pathname.startsWith("/login/")) {
    if (await hasValidBetterAuthSessionCookie(req)) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const authed = await hasValidBetterAuthSessionCookie(req);

  if (!authed) {
    const url = new URL("/login", req.url);
    url.searchParams.set(
      "redirect",
      `${pathname}${req.nextUrl.search}`,
    );
    return NextResponse.redirect(url);
  }

  const onChangePasswordPage =
    pathname === "/change-password" || pathname.startsWith("/change-password/");
  if (!onChangePasswordPage) {
    const mustChange = await getMustChangePassword(req);
    if (mustChange) {
      return NextResponse.redirect(new URL("/change-password", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|logo.*\\.svg|.*\\.png|.*\\.jpg).*)",
  ],
};
