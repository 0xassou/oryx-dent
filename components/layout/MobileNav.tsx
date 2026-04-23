"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Calendar,
  Plus,
  Settings,
} from "lucide-react";
import { useRole } from "@/hooks/useRole";
import { canAccessNav, type NavKey } from "@/utils/roles";

const NAV_ITEMS: { key: NavKey; href: string; icon: typeof LayoutDashboard; label: string }[] = [
  { key: "dashboard", href: "/", icon: LayoutDashboard, label: "Accueil" },
  { key: "patients", href: "/patients", icon: Users, label: "Patients" },
  { key: "planning", href: "/planning", icon: Calendar, label: "Planning" },
  { key: "settings", href: "/settings", icon: Settings, label: "Réglages" },
];

export default function MobileNav() {
  const pathname = usePathname();
  const { role, ready } = useRole();
  const items = NAV_ITEMS.filter((i) => !ready || canAccessNav(role, i.key));
  const leftItems = items.slice(0, Math.min(2, items.length));
  const rightItems = items.slice(Math.min(2, items.length));

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 lg:hidden">
      <nav
        style={{
          height: "72px",
          borderRadius: "36px",
          background: "rgba(255,255,255,0.55)",
          backdropFilter: "blur(20px) saturate(200%)",
          WebkitBackdropFilter: "blur(20px) saturate(200%)",
          border: "1px solid rgba(255,255,255,0.7)",
          boxShadow:
            "0 8px 32px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.9)",
          display: "flex",
          alignItems: "center",
          padding: "0 8px",
        }}
      >
        {/* Items gauche — Accueil + Patients */}
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
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "2px",
                borderRadius: "36px",
                background: isActive
                  ? "rgba(124,58,237,0.12)"
                  : "transparent",
                textDecoration: "none",
              }}
            >
              <Icon
                style={{
                  width: "24px",
                  height: "24px",
                  color: isActive
                    ? "var(--ds-primary, #7c3aed)"
                    : "#64748b",
                }}
              />
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: isActive ? 600 : 400,
                  color: isActive
                    ? "var(--ds-primary, #7c3aed)"
                    : "#64748b",
                  lineHeight: 1,
                }}
              >
                {item.label}
              </span>
              {isActive && (
                <div
                  style={{
                    width: "4px",
                    height: "2px",
                    borderRadius: "1px",
                    background: "var(--ds-primary, #7c3aed)",
                    marginTop: "1px",
                  }}
                />
              )}
            </Link>
          );
        })}

        {/* Bouton + central — 72px diamètre */}
        <button
          type="button"
          onClick={() => {
            window.location.href = "/planning?newRdv=true";
          }}
          style={{
            width: "74px",
            height: "72px",
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
              background: "var(--ds-primary, #7c3aed)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 16px rgba(124,58,237,0.45)",
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
              color: "#64748b",
              lineHeight: 1,
              marginTop: "2px",
            }}
          >
            Nouveau
          </span>
        </button>

        {/* Items droite — Planning + Réglages */}
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
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "2px",
                borderRadius: "36px",
                background: isActive
                  ? "rgba(124,58,237,0.12)"
                  : "transparent",
                textDecoration: "none",
              }}
            >
              <Icon
                style={{
                  width: "24px",
                  height: "24px",
                  color: isActive
                    ? "var(--ds-primary, #7c3aed)"
                    : "#64748b",
                }}
              />
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: isActive ? 600 : 400,
                  color: isActive
                    ? "var(--ds-primary, #7c3aed)"
                    : "#64748b",
                  lineHeight: 1,
                }}
              >
                {item.label}
              </span>
              {isActive && (
                <div
                  style={{
                    width: "4px",
                    height: "2px",
                    borderRadius: "1px",
                    background: "var(--ds-primary, #7c3aed)",
                    marginTop: "1px",
                  }}
                />
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
