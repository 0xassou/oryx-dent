import Link from "next/link";
import {
  LayoutDashboard,
  Banknote,
  Users,
  Calendar,
  Package,
  ShieldCheck,
  Truck,
  Settings,
  Sparkles,
  Lock,
} from "lucide-react";

/** Largeur fixe alignée sur `w-64` (16rem) — utilisée si besoin ailleurs. */
export const SIDEBAR_WIDTH_PX = 256;

const NAV_ITEMS = [
  { href: "/", label: "Tableau de bord", icon: LayoutDashboard, locked: false },
  { href: "/patients", label: "Patients", icon: Users, locked: false },
  { href: "/planning", label: "Planning", icon: Calendar, locked: false },
  { href: "/finances", label: "Finances", icon: Banknote, locked: false },
  { href: "/stocks", label: "Stocks", icon: Package, locked: false },
  { href: "/sterilisation", label: "Stérilisation", icon: ShieldCheck, locked: false },
  { href: "/laboratoire", label: "Laboratoire", icon: Truck, locked: false },
  { href: "/settings", label: "Paramètres", icon: Settings, locked: false },
] as const;

export function Sidebar() {
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col overflow-hidden border border-white/10 bg-white/40 shadow-[0_8px_30px_rgba(0,0,0,0.08)] backdrop-blur-2xl">
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-white/20 px-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-teal-500 text-white shadow-[0_10px_30px_rgba(14,165,233,0.25)]">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="truncate text-sm font-semibold tracking-wide text-slate-800">
            DentiSmart
          </span>
        </div>
      </div>

      <nav
        className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden px-2 pb-[100px] pt-1"
        aria-label="Navigation principale"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const lockTitle = item.locked ? " — zone privée" : "";
          return (
            <Link
              key={item.href}
              href={item.href}
              title={`${item.label}${lockTitle}`}
              className="group flex items-center gap-2 rounded-xl px-2 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-white/60 hover:text-sky-700"
            >
              <span className="relative inline-flex shrink-0">
                <Icon className="h-5 w-5" />
                {item.locked ? (
                  <Lock
                    className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 text-amber-600"
                    strokeWidth={2.5}
                    aria-hidden
                  />
                ) : null}
              </span>
              <span className="flex min-w-0 flex-1 items-center gap-1.5 tracking-wide">
                <span className="truncate">{item.label}</span>
                {item.locked ? (
                  <Lock
                    className="h-3.5 w-3.5 shrink-0 text-amber-600/90"
                    strokeWidth={2.25}
                    aria-hidden
                  />
                ) : null}
              </span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
