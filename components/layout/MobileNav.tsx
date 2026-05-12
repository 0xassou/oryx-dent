"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  Calendar,
  Plus,
  Settings,
  MoreHorizontal,
  ClipboardList,
  Banknote,
  Package,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { useRole } from "@/hooks/useRole";
import { canAccessNav, type NavKey } from "@/utils/roles";

const NAV_ITEMS: {
  key: NavKey;
  href: string;
  icon: LucideIcon;
  label: string;
}[] = [
  { key: "dashboard", href: "/", icon: LayoutDashboard, label: "Tableau de bord" },
  { key: "patients", href: "/patients", icon: Users, label: "Patients" },
  { key: "planning", href: "/planning", icon: Calendar, label: "Planning" },
  { key: "settings", href: "/settings", icon: Settings, label: "Paramètres" },
];

/** Modules listés dans le drawer « Plus » — filtrés avec `canAccessNav`. */
const MORE_DRAWER_ITEMS: {
  key: NavKey;
  href: string;
  icon: LucideIcon;
  label: string;
}[] = [
  {
    key: "workflow",
    href: "/workflow",
    icon: ClipboardList,
    label: "Salle d'attente",
  },
  { key: "finances", href: "/finances", icon: Banknote, label: "Finances" },
  { key: "stocks", href: "/stocks", icon: Package, label: "Stocks" },
  {
    key: "sterilisation",
    href: "/sterilisation",
    icon: ShieldCheck,
    label: "Stérilisation",
  },
  {
    key: "laboratoire",
    href: "/laboratoire",
    icon: Truck,
    label: "Laboratoire",
  },
];

function isDrawerItemActive(pathname: string, href: string): boolean {
  if (href === "/finances") {
    if (
      pathname === "/finances/depenses" ||
      pathname.startsWith("/finances/depenses/")
    ) {
      return false;
    }
    return pathname === "/finances" || pathname.startsWith("/finances/");
  }
  if (href === "/finances/depenses") {
    return (
      pathname === "/finances/depenses" ||
      pathname.startsWith("/finances/depenses/")
    );
  }
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { role, ready } = useRole();
  const [moreOpen, setMoreOpen] = useState(false);
  const [drawerEntered, setDrawerEntered] = useState(false);

  const items = NAV_ITEMS.filter(
    (i) => !ready || (role !== null && canAccessNav(role, i.key)),
  );
  const leftItems = items.slice(0, Math.min(2, items.length));
  const rightItems = items.slice(Math.min(2, items.length));

  const visibleDrawerItems = useMemo(() => {
    if (!ready || role === null) return [];
    return MORE_DRAWER_ITEMS.filter((i) => canAccessNav(role, i.key));
  }, [ready, role]);

  const plusActive =
    moreOpen ||
    visibleDrawerItems.some((i) => isDrawerItemActive(pathname, i.href));

  useEffect(() => {
    if (!moreOpen) {
      setDrawerEntered(false);
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setDrawerEntered(true));
    });
    return () => {
      cancelAnimationFrame(id);
      document.body.style.overflow = prev;
    };
  }, [moreOpen]);

  const showMoreTab = ready && role !== null && visibleDrawerItems.length > 0;

  return (
    <>
      <div className="fixed bottom-6 left-1/2 z-50 max-w-[calc(100vw-16px)] -translate-x-1/2 lg:hidden">
        <nav
          style={{
            height: "72px",
            borderRadius: "36px",
            background:
              "color-mix(in srgb, var(--ds-surface) 60%, transparent)",
            backdropFilter: "blur(20px) saturate(200%)",
            WebkitBackdropFilter: "blur(20px) saturate(200%)",
            border: "1px solid var(--ds-primary-border)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
            display: "flex",
            alignItems: "center",
            padding: "0 8px",
            overflowX: "auto",
            maxWidth: "100%",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
          className="[&::-webkit-scrollbar]:hidden"
          aria-label="Navigation principale"
        >
          {leftItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  width: "74px",
                  height: "72px",
                  flexShrink: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "2px",
                  borderRadius: "36px",
                  background: isActive
                    ? "color-mix(in srgb, var(--ds-primary) 12%, transparent)"
                    : "transparent",
                  textDecoration: "none",
                }}
              >
                <Icon
                  style={{
                    width: "24px",
                    height: "24px",
                    color: isActive
                      ? "var(--ds-primary)"
                      : "var(--ds-text-muted)",
                  }}
                />
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: isActive ? 600 : 400,
                    color: isActive
                      ? "var(--ds-primary)"
                      : "var(--ds-text-muted)",
                    lineHeight: 1,
                  }}
                >
                  {item.label}
                </span>
                {isActive ? (
                  <div
                    style={{
                      width: "4px",
                      height: "2px",
                      borderRadius: "1px",
                      background: "var(--ds-primary)",
                      marginTop: "1px",
                    }}
                  />
                ) : null}
              </Link>
            );
          })}

          <button
            type="button"
            onClick={() => {
              router.push("/planning?newRdv=true");
            }}
            style={{
              width: "74px",
              height: "72px",
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "2px",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            <div
              style={{
                width: "52px",
                height: "52px",
                borderRadius: "50%",
                background: "var(--ds-primary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow:
                  "0 4px 16px color-mix(in srgb, var(--ds-primary) 45%, transparent)",
                marginTop: "-8px",
              }}
            >
              <Plus
                style={{
                  width: "24px",
                  height: "24px",
                  color: "white",
                }}
              />
            </div>
            <span
              style={{
                fontSize: "12px",
                fontWeight: 400,
                color: "var(--ds-text-muted)",
                lineHeight: 1,
                marginTop: "2px",
              }}
            >
              Nouveau
            </span>
          </button>

          {rightItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  width: "74px",
                  height: "72px",
                  flexShrink: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "2px",
                  borderRadius: "36px",
                  background: isActive
                    ? "color-mix(in srgb, var(--ds-primary) 12%, transparent)"
                    : "transparent",
                  textDecoration: "none",
                }}
              >
                <Icon
                  style={{
                    width: "24px",
                    height: "24px",
                    color: isActive
                      ? "var(--ds-primary)"
                      : "var(--ds-text-muted)",
                  }}
                />
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: isActive ? 600 : 400,
                    color: isActive
                      ? "var(--ds-primary)"
                      : "var(--ds-text-muted)",
                    lineHeight: 1,
                  }}
                >
                  {item.label}
                </span>
                {isActive ? (
                  <div
                    style={{
                      width: "4px",
                      height: "2px",
                      borderRadius: "1px",
                      background: "var(--ds-primary)",
                      marginTop: "1px",
                    }}
                  />
                ) : null}
              </Link>
            );
          })}

          {showMoreTab ? (
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-expanded={moreOpen}
              aria-haspopup="dialog"
              style={{
                width: "74px",
                height: "72px",
                flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "2px",
                borderRadius: "36px",
                background: plusActive
                  ? "color-mix(in srgb, var(--ds-primary) 12%, transparent)"
                  : "transparent",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
            >
              <MoreHorizontal
                style={{
                  width: "24px",
                  height: "24px",
                  color: plusActive
                    ? "var(--ds-primary)"
                    : "var(--ds-text-muted)",
                }}
              />
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: plusActive ? 600 : 400,
                  color: plusActive
                    ? "var(--ds-primary)"
                    : "var(--ds-text-muted)",
                  lineHeight: 1,
                }}
              >
                Plus
              </span>
              {plusActive ? (
                <div
                  style={{
                    width: "4px",
                    height: "2px",
                    borderRadius: "1px",
                    background: "var(--ds-primary)",
                    marginTop: "1px",
                  }}
                />
              ) : null}
            </button>
          ) : null}
        </nav>
      </div>

      {moreOpen ? (
        <div
          className="fixed inset-0 z-[60] lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Autres modules"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            aria-label="Fermer le menu"
            onClick={() => setMoreOpen(false)}
          />
          <div
            className={[
              "absolute bottom-0 left-0 right-0 z-[70] max-h-[min(85vh,560px)] overflow-y-auto rounded-t-3xl border border-[var(--ds-primary-border)] bg-[color-mix(in_srgb,var(--ds-surface)_92%,transparent)] shadow-[0_-8px_32px_rgba(0,0,0,0.15)] backdrop-blur-xl transition-transform duration-200 ease-out",
              drawerEntered ? "translate-y-0" : "translate-y-full",
            ].join(" ")}
            style={{
              WebkitBackdropFilter: "blur(20px) saturate(200%)",
            }}
          >
            <div className="flex flex-col px-4 pb-6 pt-3">
              <div
                className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-[var(--ds-text-muted)] opacity-40"
                aria-hidden
              />
              <p className="mb-3 px-1 text-center text-xs font-semibold uppercase tracking-wide text-[var(--ds-text-muted)]">
                Autres modules
              </p>
              <ul className="flex flex-col gap-1">
                {visibleDrawerItems.map((item) => {
                  const Icon = item.icon;
                  const active = isDrawerItemActive(pathname, item.href);
                  return (
                    <li key={item.key}>
                      <Link
                        href={item.href}
                        onClick={() => setMoreOpen(false)}
                        className={[
                          "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-colors",
                          active
                            ? "bg-[color-mix(in_srgb,var(--ds-primary)_14%,transparent)] text-[var(--ds-primary)]"
                            : "text-[var(--ds-text)] hover:bg-[color-mix(in_srgb,var(--ds-primary)_8%,transparent)]",
                        ].join(" ")}
                      >
                        <Icon
                          className="h-5 w-5 shrink-0"
                          style={{
                            color: active
                              ? "var(--ds-primary)"
                              : "var(--ds-text-muted)",
                          }}
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {item.label}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
