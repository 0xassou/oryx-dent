"use client";

import { useCallback, useEffect, useState } from "react";
import { HardDrive, Loader2, RefreshCw } from "lucide-react";
import {
  createBackupAction,
  getBackupsAction,
  type BackupListEntry,
} from "@/app/actions/backups";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Ko`;
  return `${(n / (1024 * 1024)).toFixed(2)} Mo`;
}

function formatFrDate(ms: number): { date: string; time: string } {
  const d = new Date(ms);
  return {
    date: d.toLocaleDateString("fr-FR", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    }),
    time: d.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

const panelClass =
  "w-full min-w-0 rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-6 sm:p-8";

export function BackupsSettingsSection() {
  const [backups, setBackups] = useState<BackupListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    const res = await getBackupsAction();
    if (!res.ok) {
      setError(res.error);
      setBackups([]);
      return;
    }
    setBackups(res.backups);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await refresh();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  async function handleCreate() {
    setCreating(true);
    setError(null);
    const res = await createBackupAction();
    setCreating(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await refresh();
  }

  const newestFilename = backups.length ? backups[0]!.filename : null;

  return (
    <div className={panelClass}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--ds-primary-soft)] text-[var(--ds-primary)]">
            <HardDrive className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-[var(--ds-text)]">
              Sauvegardes PostgreSQL
            </h2>
            <p className="mt-1 text-sm text-[var(--ds-text-muted)]">
              Export JSON des patients, rendez-vous, finances et équipe. Réservé
              à l&apos;administrateur.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => refresh()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--ds-primary-border)] px-4 py-2.5 text-sm font-medium text-[var(--ds-text)] transition-colors hover:bg-[var(--ds-bg)] disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Actualiser
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating}
            className="inline-flex items-center gap-2 rounded-xl bg-[color:var(--ds-primary)] px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <span aria-hidden>💾</span>
            )}
            Créer une sauvegarde maintenant
          </button>
        </div>
      </div>

      {error ? (
        <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="mt-8">
        {loading ? (
          <p className="text-sm text-[var(--ds-text-muted)]">Chargement…</p>
        ) : backups.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--ds-primary-border)] bg-[var(--ds-bg)]/50 px-6 py-10 text-center text-sm text-[var(--ds-text-muted)]">
            Aucune sauvegarde disponible
          </p>
        ) : (
          <ul className="space-y-3">
            {backups.map((b) => {
              const { date, time } = formatFrDate(b.mtimeMs);
              const isRecent =
                newestFilename !== null && b.filename === newestFilename;
              return (
                <li
                  key={b.filename}
                  className={[
                    "flex flex-col gap-3 rounded-xl border px-4 py-4 sm:flex-row sm:items-center sm:justify-between",
                    isRecent
                      ? "border-emerald-200 bg-emerald-50/80"
                      : "border-[var(--ds-primary-border)] bg-[var(--ds-surface)]",
                  ].join(" ")}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-medium text-[var(--ds-text)]">
                        {b.filename}
                      </span>
                      {isRecent ? (
                        <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                          Récent
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-[var(--ds-text-muted)]">
                      {date} · {time} · {formatBytes(b.sizeBytes)}
                    </p>
                  </div>
                  <a
                    href={`/api/backups/download?file=${encodeURIComponent(b.filename)}`}
                    download={b.filename}
                    className="inline-flex shrink-0 items-center justify-center rounded-xl border border-[var(--ds-primary-border)] px-4 py-2 text-sm font-medium text-[var(--ds-text)] transition-colors hover:bg-[var(--ds-bg)]"
                  >
                    ⬇️ Télécharger
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="mt-8 text-xs leading-relaxed text-[var(--ds-text-muted)]">
        Restauration CLI :{" "}
        <code className="rounded bg-[var(--ds-primary-soft)] px-1 py-0.5 font-mono text-[11px]">
          npx tsx scripts/restore.ts backups/nom-fichier.json
        </code>
      </p>
    </div>
  );
}
