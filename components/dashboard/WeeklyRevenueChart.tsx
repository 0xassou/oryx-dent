// ============================================================
// WeeklyRevenueChart.tsx — Oryx Design System
// Mini chart barres recettes 7 derniers jours.
// À placer dans la colonne droite du dashboard, sous les KPIs.
// Ne requiert PAS Recharts — SVG pur, zéro dépendance.
// ============================================================

import React from "react";

interface DayData {
  label: string;    // "Lun", "Mar", etc.
  value: number;    // valeur brute en DA
  isToday?: boolean;
}

interface WeeklyRevenueChartProps {
  data?: DayData[];
  title?: string;
  badgeLabel?: string; // ex: "▲ 12%"
}

// Données fictives par défaut — remplace par tes vraies données
const defaultData: DayData[] = [
  { label: "Lun", value: 18000 },
  { label: "Mar", value: 25000 },
  { label: "Mer", value: 14000 },
  { label: "Jeu", value: 32000 },
  { label: "Ven", value: 22000 },
  { label: "Sam", value: 38000 },
  { label: "Auj", value: 44000, isToday: true },
];

export function WeeklyRevenueChart({
  data = defaultData,
  title = "Recettes — 7 jours",
  badgeLabel = "▲ 12%",
}: WeeklyRevenueChartProps) {
  const max = Math.max(...data.map((d) => d.value));
  const isEmpty = max === 0;

  return (
    <div className="rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[13px] font-semibold text-[var(--ds-text)]">{title}</span>
        <span className="inline-flex items-center rounded-full border border-[var(--ds-primary-border)] bg-[var(--ds-primary-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--ds-primary)]">
          {badgeLabel}
        </span>
      </div>

      {/* Barres */}
      <div className="flex h-16 items-end gap-1">
        {data.map((day) => {
          const heightPct = isEmpty ? 0 : (day.value / max) * 100;
          return (
            <div
              key={day.label}
              className="group relative flex flex-1 flex-col items-center justify-end"
            >
              <div
                className={[
                  "w-full rounded-t-[4px] transition-[height] duration-200",
                  isEmpty
                    ? "bg-[var(--ds-primary-border)]"
                    : day.isToday
                      ? "bg-[var(--ds-primary)]"
                      : "bg-[var(--ds-primary-soft)] group-hover:bg-[color-mix(in_srgb,var(--ds-primary)_45%,var(--ds-surface))]",
                ].join(" ")}
                style={{ height: isEmpty ? "4px" : `${heightPct}%` }}
              />
              {/* Tooltip au hover — masqué si vide */}
              {!isEmpty && (
                <div className="absolute -top-7 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-[var(--ds-text)] px-2 py-1 text-[10px] text-[var(--ds-bg)] group-hover:block">
                  {(day.value / 1000).toFixed(0)}k DA
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Labels jours */}
      <div className="mt-1.5 flex justify-between">
        {data.map((day) => (
          <span
            key={day.label}
            className={[
              "flex-1 text-center text-[10px]",
              !isEmpty && day.isToday
                ? "font-semibold text-[var(--ds-primary)]"
                : "text-[var(--ds-text-subtle)]",
            ].join(" ")}
          >
            {day.label}
          </span>
        ))}
      </div>

      {/* Légende état vide */}
      {isEmpty && (
        <p className="mt-2 text-center text-[10px] italic text-[var(--ds-text-muted)]">
          Aucune recette enregistrée cette semaine
        </p>
      )}
    </div>
  );
}
