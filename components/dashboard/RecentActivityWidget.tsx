// RecentActivityWidget.tsx
// Widget Activité récente — comble l'espace vide colonne gauche

import React from "react";

interface ActivityItem {
  time: string;
  description: string;
  type: "rdv" | "paiement" | "patient" | "stock";
}

const typeConfig = {
  rdv: {
    badgeClass:
      "bg-[var(--ds-primary-soft)] text-[color:var(--ds-primary)] border border-[var(--ds-primary-border)]",
    label: "RDV",
  },
  paiement: {
    badgeClass:
      "bg-emerald-50 text-emerald-700 border border-emerald-200",
    label: "Paiement",
  },
  patient: {
    badgeClass:
      "bg-cyan-50 text-cyan-700 border border-cyan-200",
    label: "Patient",
  },
  stock: {
    badgeClass:
      "bg-amber-50 text-amber-700 border border-amber-200",
    label: "Stock",
  },
};

// Remplace par tes vraies données si disponibles
const defaultActivity: ActivityItem[] = [
  { time: "10:32", description: "RDV confirmé — Youcef Mansouri", type: "rdv" },
  { time: "09:47", description: "Paiement reçu — 15 000 DA · Nour Hadj Ali", type: "paiement" },
  { time: "09:15", description: "Nouveau patient enregistré — Rania Djemaa", type: "patient" },
  { time: "08:50", description: "RDV terminé — Amira Bouchama", type: "rdv" },
  { time: "08:30", description: "Alerte stock — Composite A3 sous seuil", type: "stock" },
];

export function RecentActivityWidget({
  items = defaultActivity,
}: {
  items?: ActivityItem[];
}) {
  return (
    <div className="rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[13px] font-semibold text-[var(--ds-text)]">
          Activité récente
        </p>
        <span className="text-[11px] text-[var(--ds-text-subtle)]">Aujourd'hui</span>
      </div>

      <div className="flex flex-col gap-2">
        {items.map((item, i) => {
          const cfg = typeConfig[item.type];
          return (
            <div
              key={i}
              className="flex items-start gap-3 rounded-[10px] p-2.5 transition-colors hover:bg-[var(--ds-primary-soft)]"
            >
              {/* Badge type */}
              <span
                className={`mt-0.5 flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${cfg.badgeClass}`}
              >
                {cfg.label}
              </span>

              {/* Description */}
              <p className="flex-1 text-[12px] text-[var(--ds-text)]">
                {item.description}
              </p>

              {/* Heure */}
              <span className="flex-shrink-0 font-['DM_Mono',monospace] text-[11px] text-[var(--ds-text-subtle)]">
                {item.time}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
