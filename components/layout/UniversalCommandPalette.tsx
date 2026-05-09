"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Calendar,
  FlaskConical,
  Loader2,
  Package,
  Receipt,
  Search,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  universalSearchAction,
  type UniversalSearchCategory,
  type UniversalSearchHit,
} from "@/app/actions/universal-search";

const CATEGORY_META: Record<
  UniversalSearchCategory,
  { label: string; icon: LucideIcon }
> = {
  patients: { label: "Patients", icon: Users },
  appointments: { label: "Rendez-vous", icon: Calendar },
  stocks: { label: "Stocks", icon: Package },
  laboratoire: { label: "Laboratoire", icon: FlaskConical },
  factures: { label: "Factures", icon: Receipt },
};

const CATEGORY_ORDER: UniversalSearchCategory[] = [
  "patients",
  "appointments",
  "stocks",
  "laboratoire",
  "factures",
];

function groupHits(hits: UniversalSearchHit[]) {
  const map = new Map<UniversalSearchCategory, UniversalSearchHit[]>();
  for (const c of CATEGORY_ORDER) map.set(c, []);
  for (const h of hits) {
    const list = map.get(h.category);
    if (list) list.push(h);
  }
  return map;
}

function buildFlatOrderedList(hits: UniversalSearchHit[]): UniversalSearchHit[] {
  const grouped = groupHits(hits);
  const out: UniversalSearchHit[] = [];
  for (const c of CATEGORY_ORDER) {
    out.push(...(grouped.get(c) ?? []));
  }
  return out;
}

type UniversalCommandPaletteProps = {
  open: boolean;
  onClose: () => void;
};

export function UniversalCommandPalette({
  open,
  onClose,
}: UniversalCommandPaletteProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<UniversalSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const flatList = useMemo(() => buildFlatOrderedList(hits), [hits]);
  const indexById = useMemo(() => {
    const m = new Map<string, number>();
    flatList.forEach((h, i) => m.set(h.id, i));
    return m;
  }, [flatList]);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setQuery("");
      setHits([]);
      setError(null);
      setSelectedIndex(0);
    });
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 1) {
      queueMicrotask(() => {
        setHits([]);
        setLoading(false);
        setError(null);
        setSelectedIndex(0);
      });
      return;
    }

    queueMicrotask(() => {
      setLoading(true);
      setError(null);
    });
    const handle = window.setTimeout(() => {
      void (async () => {
        const res = await universalSearchAction(q);
        if (!res.ok) {
          const err = res.error;
          queueMicrotask(() => {
            setHits([]);
            setError(err);
            setLoading(false);
            setSelectedIndex(0);
          });
          return;
        }
        const nextHits = res.hits;
        queueMicrotask(() => {
          setHits(nextHits);
          setLoading(false);
          setSelectedIndex(0);
        });
      })();
    }, 220);

    return () => window.clearTimeout(handle);
  }, [query, open]);

  useEffect(() => {
    if (selectedIndex < 0 || flatList.length === 0) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-cmd-index="${selectedIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, flatList.length]);

  const navigateTo = useCallback(
    (href: string) => {
      onClose();
      setQuery("");
      setHits([]);
      router.push(href);
    },
    [onClose, router],
  );

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) =>
        flatList.length === 0 ? 0 : Math.min(i + 1, flatList.length - 1),
      );
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) =>
        flatList.length === 0 ? 0 : Math.max(i - 1, 0),
      );
      return;
    }
    if (e.key === "Enter" && flatList[selectedIndex]) {
      e.preventDefault();
      navigateTo(flatList[selectedIndex]!.href);
    }
  }

  if (!open || typeof document === "undefined") return null;

  const grouped = groupHits(hits);

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[min(12vh,120px)] px-3"
      role="dialog"
      aria-modal="true"
      aria-label="Recherche universelle"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
        aria-label="Fermer"
        onClick={onClose}
      />
      <div className="relative z-10 flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] shadow-2xl">
        <div className="flex items-center gap-2 border-b border-[var(--ds-primary-border)] px-3 py-2">
          <Search className="h-5 w-5 shrink-0 text-[var(--ds-text-muted)]" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Rechercher patients, RDV, stocks, labo, factures…"
            className="min-w-0 flex-1 border-0 bg-transparent py-2 text-sm text-[var(--ds-text)] outline-none placeholder:text-[var(--ds-text-muted)]"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {loading ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--ds-primary)]" />
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--ds-text-muted)] hover:bg-[var(--ds-primary-soft)]"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div
          ref={listRef}
          className="max-h-[min(60vh,420px)] overflow-y-auto px-2 py-2"
        >
          {error ? (
            <p className="px-3 py-6 text-center text-sm text-red-600">{error}</p>
          ) : query.trim().length < 1 ? (
            <p className="px-3 py-8 text-center text-sm text-[var(--ds-text-muted)]">
              Tapez au moins une lettre pour lancer la recherche dans tout le
              cabinet.
            </p>
          ) : loading && hits.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-[var(--ds-text-muted)]">
              Recherche…
            </p>
          ) : flatList.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-[var(--ds-text-muted)]">
              Aucun résultat pour « {query.trim()} »
            </p>
          ) : (
            CATEGORY_ORDER.map((cat) => {
              const items = grouped.get(cat) ?? [];
              if (items.length === 0) return null;
              const { label, icon: Icon } = CATEGORY_META[cat];
              return (
                <div key={cat} className="mb-3 last:mb-0">
                  <div className="flex items-center gap-2 px-2 py-1.5">
                    <Icon className="h-3.5 w-3.5 text-[var(--ds-primary)]" />
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ds-text-muted)]">
                      {label}
                    </span>
                  </div>
                  <ul className="space-y-0.5">
                    {items.map((hit) => {
                      const idx = indexById.get(hit.id) ?? 0;
                      const isActive = idx === selectedIndex;
                      return (
                        <li key={hit.id}>
                          <button
                            type="button"
                            data-cmd-index={idx}
                            onMouseEnter={() => setSelectedIndex(idx)}
                            onClick={() => navigateTo(hit.href)}
                            className={[
                              "flex w-full flex-col gap-0.5 rounded-xl px-3 py-2.5 text-left transition-colors",
                              isActive
                                ? "bg-[var(--ds-primary-soft)] ring-1 ring-[var(--ds-primary)]/25"
                                : "hover:bg-[var(--ds-bg)]",
                            ].join(" ")}
                          >
                            <span className="text-sm font-medium text-[var(--ds-text)]">
                              {hit.title}
                            </span>
                            {hit.subtitle ? (
                              <span className="text-xs text-[var(--ds-text-muted)]">
                                {hit.subtitle}
                              </span>
                            ) : null}
                            <span className="text-[10px] font-medium text-[var(--ds-text-muted)]">
                              {hit.location}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--ds-primary-border)] px-3 py-2 text-[10px] text-[var(--ds-text-muted)]">
          <span>
            <kbd className="rounded border border-[var(--ds-primary-border)] bg-[var(--ds-bg)] px-1 py-0.5 font-mono">
              ↑↓
            </kbd>{" "}
            naviguer
          </span>
          <span>
            <kbd className="rounded border border-[var(--ds-primary-border)] bg-[var(--ds-bg)] px-1 py-0.5 font-mono">
              Entrée
            </kbd>{" "}
            ouvrir
          </span>
          <span>
            <kbd className="rounded border border-[var(--ds-primary-border)] bg-[var(--ds-bg)] px-1 py-0.5 font-mono">
              Échap
            </kbd>{" "}
            fermer
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
