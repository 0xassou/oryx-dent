"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Banknote,
  Users,
  Calendar,
  ClipboardList,
  Package,
  ShieldCheck,
  Truck,
  Settings,
  Lock,
  Wallet,
} from "lucide-react";
import { useRole } from "@/hooks/useRole";
import { canAccessNav, type NavKey } from "@/utils/roles";

/** Largeur fixe alignée sur `w-64` (16rem) — utilisée si besoin ailleurs. */
export const SIDEBAR_WIDTH_PX = 256;

type NavItem = {
  key: NavKey;
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  locked: boolean;
};

const NAV_PRINCIPAL: readonly NavItem[] = [
  { key: "dashboard", href: "/", label: "Tableau de bord", icon: LayoutDashboard, locked: false },
  { key: "patients", href: "/patients", label: "Patients", icon: Users, locked: false },
  { key: "planning", href: "/planning", label: "Planning", icon: Calendar, locked: false },
  { key: "workflow", href: "/workflow", label: "Salle d'attente", icon: ClipboardList, locked: false },
  { key: "finances", href: "/finances", label: "Gestion Financière", icon: Banknote, locked: false },
];

const NAV_GESTION: readonly NavItem[] = [
  { key: "financesDepenses", href: "/finances/depenses", label: "Dépenses", icon: Wallet, locked: false },
  { key: "stocks", href: "/stocks", label: "Stocks", icon: Package, locked: false },
  { key: "sterilisation", href: "/sterilisation", label: "Stérilisation", icon: ShieldCheck, locked: false },
  { key: "laboratoire", href: "/laboratoire", label: "Laboratoire", icon: Truck, locked: false },
  { key: "settings", href: "/settings", label: "Paramètres", icon: Settings, locked: false },
];

function isNavActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
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
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinkRow({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const lockTitle = item.locked ? " — zone privée" : "";
  const active = isNavActive(pathname, item.href);
  const iconCls = `h-5 w-5 shrink-0 ${active ? "text-white" : "text-white/70"}`;
  const lockCls = active ? "text-white" : "text-white/70";

  return (
    <Link
      href={item.href}
      prefetch={true}
      title={`${item.label}${lockTitle}`}
      aria-current={active ? "page" : undefined}
      onClick={() => onNavigate?.()}
      className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${
        active
          ? "bg-[var(--ds-primary-soft)]/20 text-white"
          : "text-white/70 hover:bg-white/10 hover:text-white"
      }`}
    >
      <span className="relative inline-flex shrink-0">
        <Icon className={iconCls} />
        {item.locked ? (
          <Lock
            className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 ${lockCls}`}
            strokeWidth={2.5}
            aria-hidden
          />
        ) : null}
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-1.5 tracking-wide">
        <span className="truncate">{item.label}</span>
        {item.locked ? (
          <Lock className={`h-3.5 w-3.5 shrink-0 ${lockCls}`} strokeWidth={2.25} aria-hidden />
        ) : null}
      </span>
    </Link>
  );
}

export interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export default function Sidebar({
  mobileOpen = false,
  onMobileClose,
}: SidebarProps) {
  const pathname = usePathname();
  const { role, ready } = useRole();

  const navPrincipal = NAV_PRINCIPAL.filter(
    (i) => !ready || (role !== null && canAccessNav(role, i.key)),
  );
  const navGestion = NAV_GESTION.filter((i) => {
    if (i.key === "financesDepenses" && role === "admin") {
      return false;
    }
    return !ready || (role !== null && canAccessNav(role, i.key));
  });

  return (
    <>
      {/* Overlay mobile */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => onMobileClose?.()}
          aria-hidden
        />
      )}

      {/* Sidebar */}
      <div
        className={[
          "hidden lg:flex flex-col flex-shrink-0 overflow-hidden border-r border-white/10 shadow-[0_8px_30px_rgba(0,0,0,0.08)]",
          "h-full",
          "bg-[var(--ds-sidebar-bg)]",
          "transition-transform duration-300",
          "lg:relative lg:translate-x-0 lg:w-64",
          "fixed inset-y-0 left-0 z-50 w-64",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        ].join(" ")}
      >
        <div className="flex h-16 flex-shrink-0 items-center gap-3 border-b border-white/10 px-5">
          <img
            src="/logo-white.svg"
            alt="Oryx"
            width={44}
            height={44}
            className="flex-shrink-0 object-contain"
            style={{ filter: "brightness(0) invert(1)" }}
          />
          <div className="flex flex-col">
            <span className="text-[16px] font-bold leading-none text-white">Oryx</span>
            <span className="mt-1 text-[11px] leading-none text-white/50">Gestion Dentaire</span>
          </div>
        </div>
        <nav
          className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden px-2 pb-3 pt-3"
          aria-label="Navigation principale"
        >
          {navPrincipal.length > 0 && (
            <>
              <p className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-white/40">
                Principal
              </p>
              {navPrincipal.map((item) => (
                <NavLinkRow
                  key={item.href}
                  item={item}
                  pathname={pathname}
                  onNavigate={onMobileClose}
                />
              ))}
            </>
          )}

          {navPrincipal.length > 0 && navGestion.length > 0 && (
            <div className="mx-3 my-2 h-px bg-white/10" />
          )}

          {navGestion.length > 0 && (
            <>
              <p className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-white/40">
                Gestion
              </p>
              {navGestion.map((item) => (
                <NavLinkRow
                  key={item.href}
                  item={item}
                  pathname={pathname}
                  onNavigate={onMobileClose}
                />
              ))}
            </>
          )}
        </nav>
      </div>
    </>
  );
}
