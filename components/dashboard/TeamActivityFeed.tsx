"use client";

import { useEffect, useState } from "react";
import { getRecentCabinetAuditAction } from "@/app/actions/cabinet-audit";
import type { CabinetAuditFeedItem } from "@/app/actions/cabinet-audit";
import { MemberAvatar } from "@/components/team/MemberAvatar";
import { formatRelativeTimeFr } from "@/utils/formatRelativeTimeFr";

export function TeamActivityFeed() {
  const [items, setItems] = useState<CabinetAuditFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await getRecentCabinetAuditAction(10);
      if (cancelled) return;
      if (res.ok) {
        setItems(res.data);
        setErr(null);
      } else {
        setErr(res.error);
        setItems([]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[13px] font-semibold text-[var(--ds-text)]">
          Activité récente de l&apos;équipe
        </p>
      </div>

      {loading ? (
        <p className="text-[12px] text-[var(--ds-text-muted)]">Chargement…</p>
      ) : err ? (
        <p className="text-[12px] text-red-600">{err}</p>
      ) : items.length === 0 ? (
        <p className="text-[12px] text-[var(--ds-text-muted)]">
          Aucune action enregistrée pour le moment.
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {items.map((it) => (
            <li
              key={it.id}
              className="flex items-start gap-3 rounded-[10px] p-2 transition-colors hover:bg-[var(--ds-primary-soft)]"
            >
              <MemberAvatar
                userId={it.userId}
                displayName={it.displayName}
                role={it.role}
                sizePx={32}
                className="mt-0.5"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] leading-snug text-[var(--ds-text)]">
                  {it.sentence}
                </p>
                <p className="mt-0.5 font-['DM_Mono',monospace] text-[10.5px] text-[var(--ds-text-subtle)]">
                  {formatRelativeTimeFr(it.createdAt)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
