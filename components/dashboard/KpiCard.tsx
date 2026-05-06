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

type ResolvedTheme = "rdv" | "patients" | "kits" | "stock";

const THEME: Record<
  ResolvedTheme,
  {
    card: string;
    iconWrap: string;
    icon: string;
  }
> = {
  rdv: {
    card: "border-violet-200 bg-violet-50",
    iconWrap: "bg-violet-100",
    icon: "text-[color:var(--ds-primary)]",
  },
  patients: {
    card: "border-cyan-200 bg-cyan-50",
    iconWrap: "bg-cyan-100",
    icon: "text-cyan-700",
  },
  kits: {
    card: "border-emerald-200 bg-emerald-50",
    iconWrap: "bg-emerald-100",
    icon: "text-emerald-700",
  },
  stock: {
    card: "border-red-200 bg-red-50",
    iconWrap: "bg-red-100",
    icon: "text-red-700",
  },
};

function resolveTheme(kpi: KpiKey): ResolvedTheme {
  if (kpi === "stock") return "stock";
  if (kpi === "rdv") return "rdv";
  if (kpi === "patients") return "patients";
  return "kits";
}

export function KpiCard({
  label,
  value,
  unit,
  change,
  icon,
  kpi,
}: KpiCardProps) {
  const resolved = resolveTheme(kpi);
  const t = THEME[resolved];

  return (
    <div
      className={[
        "rounded-2xl border px-4 py-3",
        t.card,
      ].join(" ")}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--ds-text-muted)]">
          {label}
        </span>
        {icon ? (
          <div
            className={[
              "flex h-10 w-10 items-center justify-center rounded-xl",
              t.iconWrap,
              t.icon,
              "[&>svg]:h-4 [&>svg]:w-4",
            ].join(" ")}
            aria-hidden
          >
            {icon}
          </div>
        ) : null}
      </div>

      <p className="font-['DM_Mono',monospace] text-3xl font-bold text-[color:var(--ds-text)]">
        {value}
        {unit ? (
          <span className="ml-1 font-['Sora',sans-serif] text-xs font-medium text-[var(--ds-text-muted)]">
            {unit}
          </span>
        ) : null}
      </p>
      {change ? (
        <p className="mt-1 text-xs text-[var(--ds-text-muted)]">{change}</p>
      ) : null}
    </div>
  );
}
