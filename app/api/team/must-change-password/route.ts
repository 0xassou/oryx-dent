import { NextResponse } from "next/server";
import { getBetterAuthSession } from "@/lib/server/auth/better-auth-session";
import { getPostgresPool } from "@/lib/server/db/pool";

/**
 * Indique si l’utilisateur connecté doit changer son mot de passe (middleware + page).
 */
export async function GET() {
  try {
    const session = await getBetterAuthSession();
    if (!session?.user?.id || !session.user.email?.trim()) {
      return NextResponse.json({ mustChangePassword: false });
    }
    const pool = getPostgresPool();
    const { rows } = await pool.query<{ must_change_password: boolean | null }>(
      `SELECT must_change_password FROM team_members WHERE id = $1 AND lower(email) = lower($2) AND actif = true LIMIT 1`,
      [session.user.id, session.user.email.trim().toLowerCase()],
    );
    if (rows.length === 0) {
      return NextResponse.json({ mustChangePassword: false });
    }
    return NextResponse.json({
      mustChangePassword: Boolean(rows[0]!.must_change_password),
    });
  } catch (e) {
    console.error("[GET /api/team/must-change-password]", e);
    return NextResponse.json({ mustChangePassword: false });
  }
}
