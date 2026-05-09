import { NextResponse } from "next/server";
import { runBackupToDisk } from "@/lib/server/backup/oryx-backup";

function extractSecret(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    return auth.slice(7).trim();
  }
  return req.headers.get("x-cron-secret");
}

export async function GET(req: Request): Promise<Response> {
  const expected = process.env.CRON_SECRET ?? process.env.BACKUP_CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET non configuré sur le serveur." },
      { status: 503 },
    );
  }
  const got = extractSecret(req);
  if (!got || got !== expected) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "DATABASE_URL manquant." },
      { status: 500 },
    );
  }

  try {
    const { filename } = await runBackupToDisk();
    console.log(`✓ Backup automatique créé : ${filename}`);
    return NextResponse.json({ ok: true, filename });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur inconnue";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
