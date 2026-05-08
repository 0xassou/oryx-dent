import { NextResponse, type NextRequest } from "next/server";

/**
 * Lecture de session Better Auth sans toucher PostgreSQL depuis l’Edge :
 * même contrat JSON que `/get-session`.
 */
async function hasBetterAuthSession(request: NextRequest): Promise<boolean> {
  try {
    const url = new URL("/api/auth/get-session", request.nextUrl.origin);
    const response = await fetch(url, {
      headers: { cookie: request.headers.get("cookie") ?? "" },
      cache: "no-store",
    });
    let data: unknown = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    if (!data || typeof data !== "object") return false;
    const rec = data as { session?: unknown; user?: unknown };
    return rec.session != null && rec.user != null;
  } catch {
    return false;
  }
}

function isPublicPath(pathname: string): boolean {
  if (pathname === "/login" || pathname.startsWith("/login/")) return true;
  if (pathname.startsWith("/api/auth")) return true;
  /** Invitation par lien token (sans compte Better Auth). */
  if (pathname.startsWith("/invitation")) return true;
  return false;
}

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  if (pathname === "/login" || pathname.startsWith("/login/")) {
    if (await hasBetterAuthSession(req)) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const authed = await hasBetterAuthSession(req);

  if (!authed) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|logo.*\\.svg|.*\\.png|.*\\.jpg).*)",
  ],
};
