"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, ChevronDown, LogOut, Menu, Search } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { ToastProvider } from "@/components/ToastProvider";
import MobileNav from "@/components/layout/MobileNav";
import Sidebar from "@/components/layout/Sidebar";
import VoiceAssistant from "@/components/ui/VoiceAssistant";
import { RouteGuard } from "@/components/auth/RouteGuard";
import { useRole } from "@/hooks/useRole";
import { clearSession, getInitials, ROLE_LABEL, setCurrentRole, setCurrentUser } from "@/utils/roles";
import {
  APPOINTMENTS_UPDATED_EVENT,
  formatDateKeyLocal,
} from "@/utils/appointmentData";
import { applyTheme, getStoredTheme } from "@/utils/theme";
import { toTitleCase } from "@/utils/formatters";
import { getAppointmentsByDateAction } from "@/app/actions/appointments";
import { getStocksAction } from "@/app/actions/stocks";
import { getFacturesAction } from "@/app/actions/factures";
import { stockRowToStockLine } from "@/utils/stockDbMapping";
import { STOCK_UPDATED_EVENT } from "@/utils/stockLogic";
import { FACTURES_UPDATED_EVENT } from "@/utils/factureDocuments";

type LayoutNotification = {
  id: string;
  type: string;
  message: string;
  detail: string;
  color: "orange" | "red" | "violet";
};

function isStockLineCritical(line: {
  quantite: number;
  quantiteMax: number;
}): boolean {
  if (line.quantiteMax <= 0) return line.quantite <= 0;
  return (line.quantite / line.quantiteMax) * 100 < 50;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { role, user } = useRole();
  const [searchQuery, setSearchQuery] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<LayoutNotification[]>([]);
  const isPlanning = pathname === "/planning";

  const displayName = toTitleCase(user?.nom ?? (role === "admin" ? "Dr. Assil" : ROLE_LABEL[role]));
  const displayInitials = getInitials(user?.nom ?? (role === "admin" ? "Dr Assil" : ROLE_LABEL[role]));
  const roleLabel = ROLE_LABEL[role];

  useEffect(() => {
    const theme = getStoredTheme();
    applyTheme(theme);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function refreshNotifications() {
      const extras: LayoutNotification[] = [];

      try {
        const stocksRes = await getStocksAction();
        if (stocksRes.ok) {
          for (const row of stocksRes.data) {
            const line = stockRowToStockLine(row);
            if (!isStockLineCritical(line)) continue;
            extras.push({
              id: `stock-${line.id}`,
              type: "stock",
              message: `Stock faible : ${line.nom}`,
              detail: `${line.quantite} unités restantes`,
              color: "orange",
            });
          }
        }
      } catch {
        /* noop */
      }

      try {
        const factRes = await getFacturesAction();
        if (factRes.ok) {
          const unpaid = factRes.data
            .filter((r) => {
              const mt =
                Number.parseFloat(String(r.montant ?? "0")) || 0;
              const pay =
                Number.parseFloat(String(r.montant_paye ?? "0")) || 0;
              return mt > pay;
            })
            .slice(0, 3);
          for (const f of unpaid) {
            const mt =
              Number.parseFloat(String(f.montant ?? "0")) || 0;
            const pay =
              Number.parseFloat(String(f.montant_paye ?? "0")) || 0;
            const patient =
              `${f.prenom ?? ""} ${f.nom ?? ""}`.trim() ||
              "Patient";
            extras.push({
              id: `facture-${f.id}`,
              type: "facture",
              message: `Impayé : ${patient}`,
              detail: `${(mt - pay).toLocaleString(
                "fr-DZ",
              )} DA restants`,
              color: "red",
            });
          }
        }
      } catch {
        /* noop */
      }

      try {
        const res = await getAppointmentsByDateAction(
          formatDateKeyLocal(new Date()),
        );
        if (res.ok) {
          const pending = res.data.filter((r) => {
            const s = (r.statut ?? "").toLowerCase();
            return s === "en_attente" || s === "pending";
          });
          const count = pending.length;
          if (count > 0) {
            extras.push({
              id: "rdv-today",
              type: "rdv",
              message: `${count} RDV à confirmer`,
              detail: "Aujourd'hui",
              color: "violet",
            });
          }
        }
      } catch {
        /* noop */
      }
      if (!cancelled) setNotifications(extras);
    }
    void refreshNotifications();
    const h = () => {
      void refreshNotifications();
    };
    window.addEventListener(APPOINTMENTS_UPDATED_EVENT, h);
    window.addEventListener(STOCK_UPDATED_EVENT, h);
    window.addEventListener(FACTURES_UPDATED_EVENT, h);
    window.addEventListener("focus", h);
    return () => {
      cancelled = true;
      window.removeEventListener(APPOINTMENTS_UPDATED_EVENT, h);
      window.removeEventListener(STOCK_UPDATED_EVENT, h);
      window.removeEventListener(FACTURES_UPDATED_EVENT, h);
      window.removeEventListener("focus", h);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/get-session", {
          credentials: "include",
          cache: "no-store",
        });
        const data: unknown = await res.json().catch(() => null);
        if (cancelled || data === null || typeof data !== "object") return;
        const typed = data as {
          session?: unknown;
          user?: { email?: string; name?: string | null };
        };
        if (!typed.session || !typed.user) return;
        const u = typed.user;
        setCurrentUser({
          email: u.email ?? "",
          nom: u.name?.trim() ? u.name.trim() : "Administrateur",
          role: "admin",
        });
        setCurrentRole("admin");
      } catch {
        /* noop */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <div
        className="fixed inset-0 bg-[var(--ds-layout-bg)] p-2 lg:p-3 xl:p-4"
        style={{ backgroundColor: "var(--ds-layout-bg)" }}
      >
        <div
          className="flex h-full w-full overflow-hidden rounded-2xl"
          style={{
            boxShadow:
              "0 20px 60px color-mix(in srgb, var(--ds-primary) 25%, transparent)",
            border: "1px solid var(--ds-primary-border)",
          }}
        >
          <Sidebar
            mobileOpen={sidebarOpen}
            onMobileClose={() => setSidebarOpen(false)}
          />

          <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[var(--ds-bg)] text-[var(--ds-text)]">
            <header className="flex h-14 flex-shrink-0 items-center justify-between gap-4 border-b border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-4 lg:px-6 xl:h-16 xl:px-8">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="flex lg:hidden h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-[var(--ds-text-muted)] transition-all hover:bg-[var(--ds-primary-soft)]"
                aria-label="Ouvrir le menu"
              >
                <Menu className="h-5 w-5" />
              </button>
              {/* Recherche globale */}
              <div className="relative flex max-w-[160px] flex-1 items-center lg:max-w-lg xl:max-w-xl">
                <Search className="pointer-events-none absolute left-3 h-4 w-4 text-[var(--ds-text-muted)]" />
                <input
                  type="text"
                  placeholder="Rechercher un patient, un RDV..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && searchQuery.trim()) {
                      router.push(
                        `/patients?search=${encodeURIComponent(searchQuery.trim())}`,
                      );
                      setSearchQuery("");
                    }
                  }}
                  className="h-9 w-full rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-bg)] pl-9 pr-3 text-sm text-[var(--ds-text)] outline-none transition-all placeholder:text-[var(--ds-text-muted)] focus:border-[color:var(--ds-primary)] focus:bg-[var(--ds-surface)] focus-visible:ring-2 focus-visible:ring-[color:var(--ds-primary)]/20 lg:pr-12"
                />
                <kbd className="pointer-events-none absolute right-3 hidden items-center gap-0.5 rounded-md border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--ds-text-muted)] shadow-sm lg:flex">
                  ⌘K
                </kbd>
              </div>

              {/* Actions droite */}
              <div className="flex flex-shrink-0 items-center gap-2">
                <VoiceAssistant />
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setNotifOpen(!notifOpen)}
                    className="relative flex h-9 w-9 items-center justify-center rounded-xl text-[var(--ds-text-muted)] transition-all hover:bg-[var(--ds-primary-soft)]"
                    aria-label="Notifications"
                    aria-expanded={notifOpen}
                  >
                    <Bell className="h-5 w-5" strokeWidth={1.75} />
                    {notifications.length > 0 && (
                      <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                        {notifications.length}
                      </span>
                    )}
                  </button>

                  {notifOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setNotifOpen(false)}
                        aria-hidden
                      />

                      <div className="absolute right-0 top-11 z-50 w-80 rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] shadow-xl">
                        <div className="flex items-center justify-between border-b border-[var(--ds-primary-border)] px-4 py-3">
                          <p className="text-sm font-bold text-[var(--ds-text)]">
                            Notifications
                          </p>
                          {notifications.length > 0 && (
                            <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-bold text-red-500">
                              {notifications.length}
                            </span>
                          )}
                        </div>

                        <div className="max-h-80 divide-y divide-[var(--ds-primary-border)] overflow-y-auto">
                          {notifications.length === 0 ? (
                            <div className="py-8 text-center">
                              <p className="text-sm text-[var(--ds-text-muted)]">
                                Aucune notification
                              </p>
                            </div>
                          ) : (
                            notifications.map((n) => (
                              <div
                                key={n.id}
                                className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-[var(--ds-bg)]"
                              >
                                <div
                                  className={`mt-0.5 h-2 w-2 flex-shrink-0 rounded-full ${
                                    n.color === "orange"
                                      ? "bg-orange-400"
                                      : n.color === "red"
                                        ? "bg-red-400"
                                        : "bg-[var(--ds-primary)]"
                                  }`}
                                />
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-[var(--ds-text)]">
                                    {n.message}
                                  </p>
                                  <p className="mt-0.5 text-xs text-[var(--ds-text-muted)]">
                                    {n.detail}
                                  </p>
                                </div>
                              </div>
                            ))
                          )}
                        </div>

                        {notifications.length > 0 && (
                          <div className="border-t border-[var(--ds-primary-border)] px-4 py-3">
                            <button
                              type="button"
                              onClick={() => {
                                setNotifications([]);
                                setNotifOpen(false);
                              }}
                              className="text-xs font-medium text-[var(--ds-primary)] hover:underline"
                            >
                              Tout marquer comme lu
                            </button>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>

                <div className="h-5 w-px bg-[var(--ds-primary-border)]" />

                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setProfileOpen(!profileOpen)}
                    className="group flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 transition-all hover:bg-[var(--ds-primary-soft)]"
                  >
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--ds-primary)] text-[11px] font-bold text-white">
                      {displayInitials}
                    </div>
                    <div className="hidden text-left sm:block">
                      <div className="text-xs font-semibold leading-tight text-[var(--ds-text)]">{displayName}</div>
                      <div className="text-[10px] leading-tight text-[var(--ds-text-muted)]">{roleLabel}</div>
                    </div>
                    <ChevronDown className="h-3.5 w-3.5 text-[var(--ds-text-muted)]" strokeWidth={2.5} />
                  </button>
                  {profileOpen && (
                    <div className="absolute right-4 top-14 z-50 w-48 overflow-hidden rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] shadow-lg">
                      <button
                        type="button"
                        onClick={() => {
                          void (async () => {
                            await authClient.signOut();
                            clearSession();
                            setProfileOpen(false);
                            router.replace("/login");
                          })();
                        }}
                        className="w-full flex items-center gap-2 
           px-4 py-3 text-sm text-red-600
           hover:bg-red-50 transition-all">
                          <LogOut className="h-4 w-4" />
                          Se déconnecter
                        </button>
                    </div>
                  )}
                </div>
              </div>
            </header>

            <main className="flex-1 overflow-y-auto pb-28 lg:pb-0">
              <div
                className={
                  isPlanning
                    ? "flex min-h-0 flex-1 flex-col overflow-hidden p-4 lg:p-6 xl:p-8"
                    : "p-4 lg:p-6 xl:p-8"
                }
              >
                <RouteGuard>{children}</RouteGuard>
              </div>
            </main>
          </div>
        </div>
      </div>
      <MobileNav />
      <ToastProvider />
    </>
  );
}
