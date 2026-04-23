// KpiCard — Design System Oryx (KPI dashboard)
// Accents distincts, compatibles clair / sombre.

import React from "react";

type KpiKey = "rdv" | "patients" | "kits" | "stock";

interface KpiCardProps {
  label: string;
  value: string | number;
  unit?: string;
  change?: string;
  /** Conservé pour compat API ; le sous-texte reste en teinte muted. */
  trend?: "up" | "down" | "neutral";
  icon?: React.ReactNode;
  /** Variante d’accent (fond, icône, valeur). */
  kpi: KpiKey;
  /** Requis logiquement pour `kpi="stock"` : 0 = vert (comme kits), &gt; 0 = orange. */
  stockAlertCount?: number;
}

type ResolvedTheme = "rdv" | "patients" | "emerald" | "orange";

const THEME: Record<
  ResolvedTheme,
  {
    card: string;
    iconWrap: string;
    value: string;
    icon: string;
  }
> = {
  rdv: {
    card: "border-blue-200/80 bg-blue-50 dark:border-blue-800/50 dark:bg-blue-950/40",
    iconWrap: "bg-blue-100 dark:bg-blue-900/50",
    value: "text-blue-600 dark:text-blue-400",
    icon: "text-blue-600 dark:text-blue-300",
  },
  patients: {
    card: "border-purple-200/80 bg-purple-50 dark:border-purple-800/50 dark:bg-purple-950/40",
    iconWrap: "bg-purple-100 dark:bg-purple-900/50",
    value: "text-purple-600 dark:text-purple-400",
    icon: "text-purple-600 dark:text-purple-300",
  },
  emerald: {
    card: "border-emerald-200/80 bg-emerald-50 dark:border-emerald-800/50 dark:bg-emerald-950/40",
    iconWrap: "bg-emerald-100 dark:bg-emerald-900/50",
    value: "text-emerald-600 dark:text-emerald-400",
    icon: "text-emerald-600 dark:text-emerald-300",
  },
  orange: {
    card: "border-orange-200/80 bg-orange-50 dark:border-orange-800/50 dark:bg-orange-950/40",
    iconWrap: "bg-orange-100 dark:bg-orange-900/50",
    value: "text-orange-600 dark:text-orange-400",
    icon: "text-orange-600 dark:text-orange-300",
  },
};

function resolveTheme(kpi: KpiKey, stockAlertCount: number | undefined): ResolvedTheme {
  if (kpi === "stock") {
    return (stockAlertCount ?? 0) > 0 ? "orange" : "emerald";
  }
  if (kpi === "rdv") return "rdv";
  if (kpi === "patients") return "patients";
  return "emerald";
}

export function KpiCard({
  label,
  value,
  unit,
  change,
  icon,
  kpi,
  stockAlertCount,
}: KpiCardProps) {
  const resolved = resolveTheme(kpi, stockAlertCount);
  const t = THEME[resolved];

  return (
    <div
      className={[
        "relative overflow-hidden rounded-xl border p-4",
        t.card,
      ].join(" ")}
    >
      <p className="mb-1.5 pr-14 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ds-text-muted)]">
        {label}
      </p>

      <div className="flex items-baseline gap-1">
        <span
          className={[
            "font-['DM_Mono',monospace] text-[22px] font-medium leading-none tracking-tight",
            t.value,
          ].join(" ")}
        >
          {value}
        </span>
        {unit ? (
          <span className="font-['Sora',sans-serif] text-[12px] text-[var(--ds-text-muted)]">
            {unit}
          </span>
        ) : null}
      </div>

      {change ? (
        <p className="mt-1.5 text-[11px] text-[var(--ds-text-muted)]">{change}</p>
      ) : null}

      {icon ? (
        <div
          className={[
            "absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-lg",
            t.iconWrap,
            t.icon,
            "[&>svg]:h-[18px] [&>svg]:w-[18px] lg:[&>svg]:h-5 lg:[&>svg]:w-5",
          ].join(" ")}
          aria-hidden
        >
          {icon}
        </div>
      ) : null}
    </div>
  );
}
