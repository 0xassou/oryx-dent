import Link from "next/link";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  BarChart3,
  Users,
  Calendar,
  FileText,
  Package,
  ShieldCheck,
  Truck,
  Settings,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from "lucide-react";

const SIDEBAR_TRANSITION = { type: "spring" as const, stiffness: 320, damping: 34 };
/** Largeurs en px (alignées sur w-16 / w-60) pour la marge du <main> */
export const SIDEBAR_WIDTH = { collapsed: 64, expanded: 240 };

const NAV_ITEMS = [
  { href: "/", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/patients", label: "Patients", icon: Users },
  { href: "/planning", label: "Planning", icon: Calendar },
  { href: "/factures", label: "Factures", icon: FileText },
  { href: "/statistiques", label: "Statistiques", icon: BarChart3 },
  { href: "/stocks", label: "Stocks", icon: Package },
  { href: "/sterilisation", label: "Stérilisation", icon: ShieldCheck },
  { href: "/laboratoire", label: "Laboratoire", icon: Truck },
  { href: "/parametres", label: "Paramètres", icon: Settings },
] as const;

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export function Sidebar({ collapsed, onToggleCollapsed }: SidebarProps) {
  const width = collapsed ? SIDEBAR_WIDTH.collapsed : SIDEBAR_WIDTH.expanded;

  return (
    <motion.aside
      animate={{ width }}
      transition={SIDEBAR_TRANSITION}
      className="fixed left-0 top-0 z-40 h-screen shrink-0 overflow-hidden border border-white/10 bg-white/40 shadow-[0_8px_30px_rgba(0,0,0,0.08)] backdrop-blur-2xl"
    >
      <div
        className={[
          "flex border-b border-white/20",
          collapsed
            ? "flex-col items-center justify-center gap-2 py-4"
            : "h-14 items-center justify-between gap-2 px-2.5",
        ].join(" ")}
      >
        {/* Logo : conteneur circulaire centré en mode fermé ; à gauche + texte en mode ouvert */}
        <div
          className={[
            "flex min-w-0 items-center",
            collapsed ? "justify-center" : "gap-2 shrink-0",
          ].join(" ")}
        >
          <span
            className={[
              "inline-flex shrink-0 items-center justify-center bg-gradient-to-br from-sky-500 to-teal-500 text-white shadow-[0_10px_30px_rgba(14,165,233,0.25)]",
              collapsed
                ? "h-10 w-10 rounded-full"
                : "h-9 w-9 rounded-xl",
            ].join(" ")}
          >
            <Sparkles className="h-4 w-4" />
          </span>
          <span
            className={[
              "whitespace-nowrap text-sm font-semibold tracking-wide text-slate-800",
              "overflow-hidden transition-all duration-300",
              collapsed ? "max-w-0 opacity-0" : "max-w-[140px] opacity-100",
            ].join(" ")}
          >
            DentiSmart
          </span>
        </div>

        {/* Chevron : en mode fermé, directement sous le logo, centré ; en mode ouvert à droite */}
        <button
          type="button"
          onClick={onToggleCollapsed}
          className={[
            "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-600 transition-all duration-300 transition-colors hover:bg-white/60 hover:text-slate-900",
            collapsed ? "flex items-center justify-center" : "relative",
          ].join(" ")}
          aria-label={collapsed ? "Agrandir la barre latérale" : "Réduire la barre latérale"}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </div>

      <nav className={collapsed ? "flex flex-col gap-0.5 p-1.5" : "flex flex-col gap-0.5 p-2"}>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={[
                "group flex items-center rounded-xl text-sm font-medium",
                "text-slate-600 transition-colors hover:bg-white/60 hover:text-sky-700",
                collapsed ? "justify-center px-1.5 py-2.5" : "gap-2 px-2 py-2",
              ].join(" ")}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span className="tracking-wide">{item.label}</span>}
            </Link>
          );
        })}
      </nav>
    </motion.aside>
  );
}
