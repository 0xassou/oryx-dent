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
  /** `lab` : card laboratoire (fonds teintés) — KPI dashboard inchangé par défaut. */
  variant?: "dashboard" | "lab";
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

const LAB_ICON: Record<
  ResolvedTheme,
  { wrap: string; icon: string }
> = {
  rdv: {
    wrap: "bg-[#f5f3ff]",
    icon: "text-[color:var(--ds-primary)]",
  },
  stock: {
    wrap: "bg-[#fef2f2]",
    icon: "text-[#ef4444]",
  },
  patients: {
    wrap: "bg-[#ecfeff]",
    icon: "text-[#0891b2]",
  },
  kits: {
    wrap: "bg-[#f0fdf4]",
    icon: "text-[#059669]",
  },
};

/** Variante Laboratoire — fonds / bords par KPI (DESIGN.md). */
const LAB_CARD_SURFACES: Record<ResolvedTheme, string> = {
  rdv: "border border-[var(--ds-primary-border)] bg-[var(--ds-primary-soft)]",
  stock: "border border-[#fecaca] bg-[#fef2f2]",
  patients: "border border-[#a5f3fc] bg-[#ecfeff]",
  kits: "border border-[#bbf7d0] bg-[#f0fdf4]",
};

export function KpiCard({
  label,
  value,
  unit,
  change,
  icon,
  kpi,
  variant = "dashboard",
}: KpiCardProps) {
  const resolved = resolveTheme(kpi);
  const t = THEME[resolved];
  const labI = LAB_ICON[resolved];

  if (variant === "lab") {
    const labCard = LAB_CARD_SURFACES[resolved];
    return (
      <div
        className={[
          "rounded-[20px] px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)]",
          labCard,
        ].join(" ")}
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-xs font-medium uppercase tracking-[0.2em] text-[var(--ds-text-subtle)]">
            {label}
          </span>
          {icon ? (
            <div
              className={[
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px]",
                labI.wrap,
                labI.icon,
                "[&>svg]:h-4 [&>svg]:w-4",
              ].join(" ")}
              aria-hidden
            >
              {icon}
            </div>
          ) : null}
        </div>

        <p className="font-mono text-[28px] font-bold leading-tight tracking-tight text-[color:var(--ds-text)]">
          {value}
          {unit ? (
            <span className="ml-1 font-sans text-xs font-normal text-[var(--ds-text-muted)]">
              {unit}
            </span>
          ) : null}
        </p>
        {change ? (
          <p className="mt-1 text-xs font-light text-[var(--ds-text-muted)]">{change}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={[
        "rounded-2xl border px-4 py-3",
        t.card,
      ].join(" ")}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--ds-text-muted)]">
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

      <p className="font-mono text-3xl font-bold text-[color:var(--ds-text)]">
        {value}
        {unit ? (
          <span className="ml-1 font-sans text-xs font-normal text-[var(--ds-text-muted)]">
            {unit}
          </span>
        ) : null}
      </p>
      {change ? (
        <p className="mt-1 text-xs font-light text-[var(--ds-text-muted)]">
          {change}
        </p>
      ) : null}
    </div>
  );
}
