"use client";

import type { LaboratoireStatut } from "@/utils/laboratoireCommandes";
import { laboratoireStatutLabel } from "@/utils/laboratoireCommandes";

const STYLES: Record<
  LaboratoireStatut,
  { className: string; blink?: boolean }
> = {
  EN_ATTENTE: {
    className:
      "bg-blue-100 text-blue-700 border-blue-200/50",
  },
  ENVOYE_LABO: {
    className:
      "bg-blue-100 text-blue-700 border-blue-200/50",
  },
  EN_FABRICATION: {
    className:
      "bg-indigo-100 text-indigo-700 border-indigo-200/50",
  },
  EXPEDIE_CABINET: {
    className:
      "bg-cyan-100 text-cyan-700 border-cyan-200/50",
  },
  RECU_CABINET: {
    className:
      "bg-emerald-100 text-emerald-700 border-emerald-200/50",
  },
  POSE: {
    className:
      "bg-slate-100 text-slate-600 border-slate-200/50",
  },
  RETOUCHE: {
    className:
      "bg-rose-100 text-rose-700 border-rose-200/50",
    blink: true,
  },
};

type StatusBadgeProps = {
  statut: LaboratoireStatut;
  className?: string;
};

/**
 * Badge statut laboratoire — lisible, pastels accentués, pill.
 */
export function StatusBadge({ statut, className = "" }: StatusBadgeProps) {
  const cfg = STYLES[statut];
  return (
    <span
      className={[
        "inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold tracking-wide",
        cfg.className,
        cfg.blink ? "animate-lab-retouche" : "",
        className,
      ].join(" ")}
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full bg-current"
        aria-hidden
      />
      {laboratoireStatutLabel(statut)}
    </span>
  );
}
