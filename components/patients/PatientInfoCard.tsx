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

const iconClass = "h-4 w-4 shrink-0 text-slate-400";

export function PatientInfoCard({
  telephone = "—",
  email = "—",
  adresse = "—",
  allergies = [],
  antecedents = [],
}: PatientInfoCardProps) {
  const hasAllergies = allergies.length > 0;

  return (
    <section className="rounded-3xl bg-white p-6 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
      <h2 className="text-lg font-semibold tracking-tight text-[color:var(--ds-text)]">
        Dossier Médical & Contact
      </h2>

      {/* Contact */}
      <div className="mt-4 space-y-3">
        <div className="flex items-center gap-3 text-sm text-slate-700">
          <Phone className={iconClass} aria-hidden />
          <span>{formatPhoneNumber(telephone)}</span>
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-700">
          <Mail className={iconClass} aria-hidden />
          <span className="break-all">{email}</span>
        </div>
        <div className="flex items-start gap-3 text-sm text-slate-700">
          <MapPin className={iconClass} aria-hidden />
          <span className="min-w-0">{adresse}</span>
        </div>
      </div>

      {/* Médical (alerte visuelle) */}
      <div
        className={[
          "mt-5 rounded-2xl p-4",
          hasAllergies
            ? "bg-red-50/80"
            : "bg-slate-50/80",
        ].join(" ")}
      >
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Médical
        </h3>

        {allergies.length > 0 && (
          <div className="mt-2">
            <p className="mb-1.5 text-xs font-medium text-slate-600">
              Allergies
            </p>
            <div className="flex flex-wrap gap-1.5">
              {allergies.map((a) => (
                <span
                  key={a}
                  className="inline-flex rounded-lg bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700"
                >
                  {a}
                </span>
              ))}
            </div>
          </div>
        )}

        {antecedents.length > 0 && (
          <div className={allergies.length > 0 ? "mt-3" : "mt-2"}>
            <p className="mb-1.5 text-xs font-medium text-slate-600">
              Antécédents
            </p>
            <div className="flex flex-wrap gap-1.5">
              {antecedents.map((a) => (
                <span
                  key={a}
                  className="inline-flex rounded-lg bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800"
                >
                  {a}
                </span>
              ))}
            </div>
          </div>
        )}

        {allergies.length === 0 && antecedents.length === 0 && (
          <p className="mt-2 text-xs text-slate-500">
            Aucune allergie ni antécédent renseigné.
          </p>
        )}
      </div>
    </section>
  );
}
