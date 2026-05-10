"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  CalendarClock,
  CheckCheck,
  FlaskConical,
  Package,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getAppointmentsAction } from "@/app/actions/appointments";
import { getCommandesLaboAction } from "@/app/actions/laboratoire";
import { getStocksAction } from "@/app/actions/stocks";
import {
  APPOINTMENTS_UPDATED_EVENT,
  formatDateKeyLocal,
} from "@/utils/appointmentData";
import { stockRowToStockLine } from "@/utils/stockDbMapping";
import { STOCK_UPDATED_EVENT } from "@/utils/stockLogic";
import { LAB_COMMANDES_UPDATED_EVENT } from "@/utils/laboratoireCommandes";
import type { CommandeLabo } from "@/app/actions/laboratoire";
import type { StockRow } from "@/lib/types/stocks-db";

const MAX_STOCK = 12;
const MAX_RDV = 15;
const MAX_LABO = 12;

export type DashboardNotificationKind = "stock" | "rdv" | "labo";

export type DashboardNotification = {
  id: string;
  kind: DashboardNotificationKind;
  title: string;
  subtitle?: string;
  href: string;
};

const KIND_ICONS: Record<DashboardNotificationKind, LucideIcon> = {
  stock: Package,
  rdv: CalendarClock,
  labo: FlaskConical,
};

function isStockLineCritical(line: {
  quantite: number;
  quantiteMax: number;
}): boolean {
  if (line.quantiteMax <= 0) return line.quantite <= 0;
  return (line.quantite / line.quantiteMax) * 100 < 50;
}

function stockNeedsAlert(row: StockRow, line: ReturnType<typeof stockRowToStockLine>): boolean {
  if (row.quantite <= 0) return true;
  if (row.quantite_min > 0 && row.quantite <= row.quantite_min) return true;
  return isStockLineCritical(line);
}

function isPendingStatut(raw: string | null | undefined): boolean {
  const s = (raw ?? "").trim().toLowerCase();
  return s === "en_attente" || s === "pending";
}

function todayKeyLocal(): string {
  return formatDateKeyLocal(new Date());
}

function isLaboPoseOverdue(c: CommandeLabo): boolean {
  const pose = c.datePose?.trim().slice(0, 10);
  if (!pose || !/^\d{4}-\d{2}-\d{2}$/.test(pose)) return false;
  const today = todayKeyLocal();
  if (pose >= today) return false;
  if (c.statut === "POSE") return false;
  return true;
}

function formatShortDate(iso: string): string {
  const d = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return iso;
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

export function NotificationsPopover() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<DashboardNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const next: DashboardNotification[] = [];

    try {
      const stocksRes = await getStocksAction();
      if (stocksRes.ok) {
        let n = 0;
        for (const row of stocksRes.data) {
          if (n >= MAX_STOCK) break;
          const line = stockRowToStockLine(row);
          if (!stockNeedsAlert(row, line)) continue;
          const isRupture = row.quantite <= 0 || (row.quantite_min > 0 && row.quantite <= row.quantite_min);
          next.push({
            id: `stock-${line.id}`,
            kind: "stock",
            title: isRupture ? `Rupture / seuil : ${line.nom}` : `Stock faible : ${line.nom}`,
            subtitle: `${line.quantite} unité(s) · seuil ${row.quantite_min}`,
            href: "/stocks",
          });
          n++;
        }
      }
    } catch {
      /* accès stocks refusé ou erreur — on ignore */
    }

    try {
      const rdvRes = await getAppointmentsAction();
      if (rdvRes.ok) {
        const pending = rdvRes.data
          .filter((a) => isPendingStatut(a.statut))
          .sort((a, b) => {
            const da = a.date.localeCompare(b.date);
            if (da !== 0) return da;
            return (a.heure ?? "").localeCompare(b.heure ?? "");
          });
        for (let i = 0; i < pending.length && i < MAX_RDV; i++) {
          const a = pending[i]!;
          const name =
            `${a.prenom ?? ""} ${a.nom ?? ""}`.trim() || "Patient";
          next.push({
            id: `rdv-${a.id}`,
            kind: "rdv",
            title: `RDV à confirmer · ${name}`,
            subtitle: `${formatShortDate(a.date)} · ${a.heure?.slice(0, 5) ?? "—"}`,
            href: `/planning?listDay=${encodeURIComponent(a.date.slice(0, 10))}`,
          });
        }
      }
    } catch {
      /* ignore */
    }

    try {
      const labRes = await getCommandesLaboAction();
      if (labRes.ok) {
        const overdue = labRes.data.filter(isLaboPoseOverdue);
        overdue.sort((a, b) => (a.datePose ?? "").localeCompare(b.datePose ?? ""));
        for (let i = 0; i < overdue.length && i < MAX_LABO; i++) {
          const c = overdue[i]!;
          const patient = c.patientNom?.trim() || "Patient";
          const travail = c.travail?.trim() || "Commande";
          next.push({
            id: `labo-${c.id}`,
            kind: "labo",
            title: `Pose dépassée · ${patient}`,
            subtitle: `${travail} · prévue le ${formatShortDate(c.datePose ?? "")}`,
            href: `/laboratoire?commande=${encodeURIComponent(c.id)}`,
          });
        }
      }
    } catch {
      /* ignore */
    }

    setItems(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const h = () => {
      void refresh();
    };
    window.addEventListener(APPOINTMENTS_UPDATED_EVENT, h);
    window.addEventListener(STOCK_UPDATED_EVENT, h);
    window.addEventListener(LAB_COMMANDES_UPDATED_EVENT, h);
    window.addEventListener("focus", h);
    return () => {
      window.removeEventListener(APPOINTMENTS_UPDATED_EVENT, h);
      window.removeEventListener(STOCK_UPDATED_EVENT, h);
      window.removeEventListener(LAB_COMMANDES_UPDATED_EVENT, h);
      window.removeEventListener("focus", h);
    };
  }, [refresh]);

  function handleMarkAllRead() {
    setItems([]);
    setOpen(false);
  }

  const count = items.length;
  const hasUnread = count > 0;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl text-[var(--ds-text-muted)] transition-all hover:bg-[var(--ds-primary-soft)]"
        aria-label="Notifications"
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" strokeWidth={1.75} />
        {hasUnread && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white tabular-nums">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {/* Voile hors AnimatePresence : sinon il peut rester au-dessus du contenu (ex. Réglages)
          pendant la sortie du panneau et bloquer tous les clics sous z-40. */}
      {open ? (
        <div
          className="fixed inset-0 z-40"
          aria-hidden="true"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <AnimatePresence>
        {open && (
            <motion.div
              role="dialog"
              aria-label="Notifications"
              initial={{ opacity: 0, scale: 0.96, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -6 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className="absolute right-0 top-11 z-50 w-[min(100vw-2rem,22rem)] overflow-hidden rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] shadow-xl"
            >
              <div className="flex items-start justify-between gap-3 border-b border-[var(--ds-primary-border)] px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-[var(--ds-text)]">
                    Notifications
                  </p>
                  {loading ? (
                    <p className="mt-0.5 text-xs text-[var(--ds-text-muted)]">
                      Chargement…
                    </p>
                  ) : hasUnread ? (
                    <p className="mt-0.5 text-xs text-[var(--ds-text-muted)]">
                      {count} alerte{count > 1 ? "s" : ""} active{count > 1 ? "s" : ""}
                    </p>
                  ) : null}
                </div>
                {hasUnread && (
                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-[var(--ds-primary)] transition-colors hover:bg-[var(--ds-primary-soft)]"
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    Tout masquer
                  </button>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto">
                {loading && items.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-[var(--ds-text-muted)]">
                    Chargement…
                  </p>
                ) : !hasUnread ? (
                  <p className="px-4 py-8 text-center text-sm text-[var(--ds-text-muted)]">
                    Aucune notification
                  </p>
                ) : (
                  <ul className="divide-y divide-[var(--ds-primary-border)]">
                    {items.map((item) => {
                      const Icon = KIND_ICONS[item.kind];
                      return (
                        <li key={item.id}>
                          <Link
                            href={item.href}
                            onClick={() => setOpen(false)}
                            className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-[var(--ds-bg)]"
                          >
                            <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--ds-primary-soft)] text-[var(--ds-primary)]">
                              <Icon className="h-4 w-4" strokeWidth={2} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-medium text-[var(--ds-text)]">
                                {item.title}
                              </span>
                              {item.subtitle ? (
                                <span className="mt-0.5 block text-xs text-[var(--ds-text-muted)]">
                                  {item.subtitle}
                                </span>
                              ) : null}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
