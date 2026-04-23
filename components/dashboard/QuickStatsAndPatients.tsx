// ============================================================
// QuickStats.tsx — Oryx Design System
// Ligne de 3 stats rapides : Satisfaction, Durée moy., Annulations
// À placer sous WeeklyRevenueChart dans la colonne droite.
// ============================================================

import React from "react";

interface StatItem {
  value: string;
  label: string;
  /** Couleur d’accent (variables CSS `--ds-*` uniquement). */
  colorVar?: string;
}

interface QuickStatsProps {
  stats?: StatItem[];
  title?: string;
}

const defaultStats: StatItem[] = [
  { value: "98%", label: "Satisfaction", colorVar: "var(--ds-primary)" },
  { value: "24 min", label: "Durée moy.", colorVar: "var(--ds-primary-hover)" },
  { value: "2", label: "Annulations", colorVar: "var(--ds-text-muted)" },
];

export function QuickStats({
  stats = defaultStats,
  title = "Stats rapides",
}: QuickStatsProps) {
  return (
    <div className="rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-4">
      <p className="mb-3 text-[13px] font-semibold text-[var(--ds-text)]">{title}</p>
      <div className="grid grid-cols-3 gap-2">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-[10px] bg-[var(--ds-primary-soft)] px-3 py-2.5 text-center"
          >
            <p
              className="font-['DM_Mono',monospace] text-[16px] font-medium leading-none"
              style={{ color: stat.colorVar ?? "var(--ds-text)" }}
            >
              {stat.value}
            </p>
            <p className="mt-1 text-[10px] text-[var(--ds-text-subtle)]">{stat.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}


// ============================================================
// RecentPatients.tsx — Oryx Design System
// Liste des nouveaux patients avec avatar coloré + date.
// À placer sous QuickStats dans la colonne droite.
// ============================================================

interface Patient {
  initials: string;
  name: string;
  date: string;
  avatarBgVar?: string;
}

interface RecentPatientsProps {
  patients?: Patient[];
  title?: string;
  onViewAll?: () => void;
}

const defaultPatients: Patient[] = [
  { initials: "AB", name: "Assia Brahimi", date: "16 avr", avatarBgVar: "var(--ds-primary)" },
  { initials: "MZ", name: "Mourad Zidane", date: "15 avr", avatarBgVar: "var(--ds-primary-hover)" },
  { initials: "LD", name: "Lyna Djaballah", date: "14 avr", avatarBgVar: "var(--ds-text-muted)" },
];

export function RecentPatients({
  patients = defaultPatients,
  title = "Nouveaux patients",
  onViewAll,
}: RecentPatientsProps) {
  return (
    <div className="rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[13px] font-semibold text-[var(--ds-text)]">{title}</p>
        {onViewAll && (
          <button
            onClick={onViewAll}
            className="text-[11px] font-semibold text-[var(--ds-primary)] hover:underline"
          >
            Voir tout →
          </button>
        )}
      </div>

      {/* Liste */}
      <div className="flex flex-col">
        {patients.map((p, i) => (
          <div
            key={p.name}
            className={[
              "flex items-center gap-2.5 py-1.5",
              i < patients.length - 1
                ? "border-b border-[var(--ds-primary-border)]"
                : "",
            ].join(" ")}
          >
            {/* Avatar */}
            <div
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-[var(--ds-bg)]"
              style={{ backgroundColor: p.avatarBgVar ?? "var(--ds-primary)" }}
            >
              {p.initials}
            </div>

            {/* Nom */}
            <p className="flex-1 text-[12.5px] font-semibold text-[var(--ds-text)]">
              {p.name}
            </p>

            {/* Date */}
            <p className="font-['DM_Mono',monospace] text-[11px] text-[var(--ds-text-subtle)]">
              {p.date}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
