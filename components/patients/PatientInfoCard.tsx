"use client";

import { Mail, MapPin, Phone } from "lucide-react";
import { formatPhoneNumber } from "@/utils/formatters";

export interface PatientInfoCardProps {
  telephone?: string;
  email?: string;
  adresse?: string;
  allergies?: string[];
  antecedents?: string[];
}

const iconClass = "h-4 w-4 shrink-0 text-[var(--ds-text-subtle)]";

export function PatientInfoCard({
  telephone = "—",
  email = "—",
  adresse = "—",
  allergies = [],
  antecedents = [],
}: PatientInfoCardProps) {
  const hasAllergies = allergies.length > 0;

  return (
    <section className="rounded-3xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-6 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
      <h2 className="text-lg font-semibold tracking-tight text-[color:var(--ds-text)]">
        Dossier Médical & Contact
      </h2>

      {/* Contact */}
      <div className="mt-4 space-y-3">
        <div className="flex items-center gap-3 text-sm text-[var(--ds-text)]">
          <Phone className={iconClass} aria-hidden />
          <span>{formatPhoneNumber(telephone)}</span>
        </div>
        <div className="flex items-center gap-3 text-sm text-[var(--ds-text)]">
          <Mail className={iconClass} aria-hidden />
          <span className="break-all">{email}</span>
        </div>
        <div className="flex items-start gap-3 text-sm text-[var(--ds-text)]">
          <MapPin className={iconClass} aria-hidden />
          <span className="min-w-0">{adresse}</span>
        </div>
      </div>

      {/* Médical (alerte visuelle) */}
      <div
        className={[
          "mt-5 rounded-2xl p-4",
          hasAllergies
            ? "border border-[var(--ds-border-strong)] bg-[var(--ds-surface-2)]"
            : "bg-[var(--ds-bg)]",
        ].join(" ")}
      >
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--ds-text-muted)]">
          Médical
        </h3>

        {allergies.length > 0 && (
          <div className="mt-2">
            <p className="mb-1.5 text-xs font-medium text-[var(--ds-text-muted)]">
              Allergies
            </p>
            <div className="flex flex-wrap gap-1.5">
              {allergies.map((a) => (
                <span
                  key={a}
                  className="inline-flex rounded-lg border border-[var(--ds-border-strong)] bg-[var(--ds-primary-soft)] px-2.5 py-0.5 text-xs font-medium text-[var(--ds-primary-hover)]"
                >
                  {a}
                </span>
              ))}
            </div>
          </div>
        )}

        {antecedents.length > 0 && (
          <div className={allergies.length > 0 ? "mt-3" : "mt-2"}>
            <p className="mb-1.5 text-xs font-medium text-[var(--ds-text-muted)]">
              Antécédents
            </p>
            <div className="flex flex-wrap gap-1.5">
              {antecedents.map((a) => (
                <span
                  key={a}
                  className="inline-flex rounded-lg border border-[var(--ds-primary-border)] bg-[var(--ds-primary-soft)] px-2.5 py-0.5 text-xs font-medium text-[var(--ds-primary)]"
                >
                  {a}
                </span>
              ))}
            </div>
          </div>
        )}

        {allergies.length === 0 && antecedents.length === 0 && (
          <p className="mt-2 text-xs text-[var(--ds-text-muted)]">
            Aucune allergie ni antécédent renseigné.
          </p>
        )}
      </div>
    </section>
  );
}
