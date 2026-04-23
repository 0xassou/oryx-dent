"use client";

import type { LaboratoireStatut } from "@/utils/laboratoireCommandes";
import { laboratoireStatutLabel } from "@/utils/laboratoireCommandes";

const STYLES: Record<
  LaboratoireStatut,
  { className: string; blink?: boolean }
> = {
  EN_ATTENTE: {
    className:
      "bg-[var(--ds-primary-soft)] text-[var(--ds-text-muted)] border-[var(--ds-primary-border)]",
  },
  ENVOYE_LABO: {
    className:
      "bg-[var(--ds-bg)] text-[var(--ds-text)] border-[var(--ds-primary-border)]",
  },
  EN_FABRICATION: {
    className:
      "bg-[var(--ds-surface-2)] text-[var(--ds-primary-hover)] border-[var(--ds-border-strong)]",
  },
  EXPEDIE_CABINET: {
    className:
      "bg-[var(--ds-primary-soft)] text-[var(--ds-primary)] border-[var(--ds-primary-border)]",
  },
  RECU_CABINET: {
    className:
      "bg-[var(--ds-primary-soft)] text-[var(--ds-primary)] border-[var(--ds-border-strong)]",
  },
  POSE: {
    className:
      "bg-[var(--ds-surface-2)] text-[var(--ds-text-subtle)] border-[var(--ds-primary-border)]",
  },
  RETOUCHE: {
    className:
      "bg-[var(--ds-surface-2)] text-[var(--ds-primary-hover)] border-[var(--ds-border-strong)]",
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
