"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, LogOut, Menu, Search } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { ToastProvider } from "@/components/ToastProvider";
import { DashboardSessionSkeleton } from "@/components/layout/DashboardSessionSkeleton";
import MobileNav from "@/components/layout/MobileNav";
import Sidebar from "@/components/layout/Sidebar";
import { UniversalCommandPalette } from "@/components/layout/UniversalCommandPalette";
import { NotificationsPopover } from "@/components/notifications/NotificationsPopover";
import { RouteGuard } from "@/components/auth/RouteGuard";
import { useRole } from "@/hooks/useRole";
import { clearSession, getInitials, ROLE_LABEL, setCurrentRole, setCurrentUser } from "@/utils/roles";
import { applyTheme, getStoredTheme } from "@/utils/theme";
import { toTitleCase } from "@/utils/formatters";
import { showAppToast } from "@/utils/appToast";
import { getCabinetSettingsAction } from "@/app/actions/cabinet-settings";
import { resolveAppRoleForSessionAction } from "@/app/actions/team";
import { replaceCabinetBlobFromServer } from "@/lib/client/cabinetBlob";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { role, user, ready } = useRole();
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [isAppleMod] = useState(() => {
    if (typeof navigator === "undefined") return true;
    return /Mac|iPhone|iPod|iPad/i.test(navigator.platform ?? "");
  });
  const [profileOpen, setProfileOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isPlanning = pathname === "/planning";

  const displayName =
    ready && role !== null
      ? toTitleCase(
          user?.nom ?? (role === "admin" ? "Dr. Assil" : ROLE_LABEL[role]),
        )
      : "";
  const displayInitials =
    ready && role !== null
      ? getInitials(
          user?.nom ?? (role === "admin" ? "Dr Assil" : ROLE_LABEL[role]),
        )
      : "··";
  const roleLabel =
    ready && role !== null ? ROLE_LABEL[role] : "";

  useEffect(() => {
    const theme = getStoredTheme();
    applyTheme(theme);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandPaletteOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cab, resolved] = await Promise.all([
          getCabinetSettingsAction(),
          resolveAppRoleForSessionAction(),
        ]);
        if (cancelled) return;
        if (cab.ok) replaceCabinetBlobFromServer(cab.data);
        if (resolved.ok) {
          setCurrentRole(resolved.role);
          setCurrentUser({
            email: resolved.email,
            nom: resolved.nom,
            role: resolved.role,
          });
        }
      } catch (e) {
        console.error("[dashboard] cabinet / rôle session", e);
        showAppToast("Données cabinet ou session partiellement indisponibles.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready || role === null) {
    return (
      <>
        <DashboardSessionSkeleton />
        <ToastProvider />
      </>
    );
  }

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
              {/* Command palette — recherche universelle */}
              <div className="relative flex max-w-[160px] flex-1 items-center lg:max-w-lg xl:max-w-xl">
                <button
                  type="button"
                  onClick={() => setCommandPaletteOpen(true)}
                  aria-haspopup="dialog"
                  aria-expanded={commandPaletteOpen}
                  className="relative flex h-9 w-full items-center rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-bg)] pl-9 pr-3 text-left text-sm outline-none transition-all hover:bg-[var(--ds-surface)] focus:border-[color:var(--ds-primary)] focus-visible:ring-2 focus-visible:ring-[color:var(--ds-primary)]/20 lg:pr-12"
                >
                  <Search className="pointer-events-none absolute left-3 h-4 w-4 text-[var(--ds-text-muted)]" />
                  <span className="block truncate text-[var(--ds-text-muted)]">
                    Rechercher dans Oryx...{" "}
                    {isAppleMod ? "⌘K" : "Ctrl+K"}
                  </span>
                </button>
                <kbd className="pointer-events-none absolute right-3 hidden items-center gap-0.5 rounded-md border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--ds-text-muted)] shadow-sm lg:flex">
                  {isAppleMod ? "⌘K" : "Ctrl+K"}
                </kbd>
              </div>

              {/* Actions droite */}
              <div className="flex flex-shrink-0 items-center gap-2">
                <NotificationsPopover />

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
      <UniversalCommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
      />
    </>
  );
}
