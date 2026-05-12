"use client";

import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { formatDZD, formatDate } from "@/utils/formatters";
import { PrimaryButton } from "@/components/ui/PrimaryButton";

type PaymentMethod = "CB" | "Espèces" | "Virement" | "Chèque";

interface Payment {
  id: string;
  date: string;
  montant: number;
  mode: PaymentMethod;
}

function uid() {
  return Math.random().toString(16).slice(2);
}

const ACTES = [
  "Consultation",
  "Détartrage",
  "Plombage (Composite)",
  "Extraction",
  "Endodontie",
  "Couronne",
] as const;

export function PatientFinanceCard() {
  const totalActes = 5000;
  const [payments, setPayments] = useState<Payment[]>([
    { id: "p1", date: "2026-03-05T09:00:00.000Z", montant: 1000, mode: "CB" },
    { id: "p2", date: "2026-03-10T09:00:00.000Z", montant: 1000, mode: "Virement" },
  ]);

  const [isOpen, setIsOpen] = useState(false);
  const [isActModalOpen, setIsActModalOpen] = useState(false);
  const [date, setDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [montant, setMontant] = useState<string>("100");
  const [mode, setMode] = useState<PaymentMethod>("CB");
  const [selectedActes, setSelectedActes] = useState<string[]>([]);
  const [acteMontant, setActeMontant] = useState<string>("");

  const totalVerse = useMemo(
    () => payments.reduce((acc, p) => acc + p.montant, 0),
    [payments],
  );
  const resteAPayer = Math.max(0, totalActes - totalVerse);

  function handleSave() {
    const amount = Number(montant);
    const ymd = date.trim();
    const payload: Payment = {
      id: `p-${uid()}`,
      date: ymd
        ? `${ymd}T12:00:00.000Z`
        : new Date().toISOString(),
      montant: Number.isFinite(amount) ? amount : 0,
      mode,
    };
    setPayments((prev) => [payload, ...prev]);
    setIsOpen(false);
  }

  function toggleActe(acte: string) {
    setSelectedActes((prev) =>
      prev.includes(acte) ? prev.filter((a) => a !== acte) : [...prev, acte],
    );
  }

  function handleAddActe() {
    setSelectedActes([]);
    setActeMontant("");
    setIsActModalOpen(false);
  }

  return (
    <section className="rounded-3xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-6 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-[color:var(--ds-text)]">
            État Financier
          </h2>
          <p className="mt-1 text-xs text-[var(--ds-text-muted)]">
            Suivi des actes et des versements.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 w-full">
          <button
            type="button"
            onClick={() => setIsActModalOpen(true)}
            className="flex w-full md:w-auto flex-shrink-0 items-center justify-center gap-2 rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-primary-soft)] px-4 py-2.5 text-xs font-medium text-[var(--ds-text)] shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-colors hover:bg-[var(--ds-bg)] whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            Ajouter un acte
          </button>
          <PrimaryButton
            type="button"
            onClick={() => setIsOpen(true)}
            className="flex w-full md:w-auto flex-shrink-0 items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-medium whitespace-nowrap shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Enregistrer un paiement
          </PrimaryButton>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
        <div className="rounded-3xl bg-[var(--ds-bg)] p-4">
          <p className="text-[11px] font-medium tracking-tight text-[var(--ds-text-muted)]">
            Total Actes
          </p>
          <p className="mt-2 text-xl font-semibold tracking-tight text-[color:var(--ds-text)]">
            {formatDZD(totalActes)}
          </p>
        </div>
        <div className="rounded-3xl border border-[var(--ds-primary-border)] bg-[var(--ds-primary-soft)] p-4">
          <p className="text-[11px] font-medium tracking-tight text-[var(--ds-primary)]">
            Total Versé
          </p>
          <p className="mt-2 text-xl font-semibold tracking-tight text-[var(--ds-primary)]">
            {formatDZD(totalVerse)}
          </p>
        </div>
        <div className="rounded-3xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-4">
          <p className="text-[11px] font-medium tracking-tight text-[var(--ds-text-muted)]">
            Reste à Payer
          </p>
          <p
            className={[
              "mt-2 text-xl font-semibold tracking-tight",
              resteAPayer > 0 ? "text-[var(--ds-primary-hover)]" : "text-[var(--ds-primary)]",
            ].join(" ")}
          >
            {formatDZD(resteAPayer)}
          </p>
          {resteAPayer > 0 && (
            <p className="mt-2 inline-flex items-center gap-2 text-[11px] text-[var(--ds-text-muted)]">
              <span className="inline-flex h-5 w-12 items-center justify-center rounded-full bg-[var(--ds-primary-soft)] text-[10px] font-semibold tracking-tight text-[var(--ds-primary)] shadow-sm">
                Cristal
              </span>
              À régulariser
            </p>
          )}
        </div>
      </div>

      <div className="mt-6 overflow-x-auto w-full rounded-3xl border border-[var(--ds-primary-border)] bg-[var(--ds-bg)]">
        <table className="w-full min-w-[520px]">
          <thead>
            <tr className="border-b border-[var(--ds-primary-border)]">
              <th className="px-4 py-3 text-left text-[11px] font-semibold tracking-tight text-[var(--ds-text-muted)]">
                Date
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold tracking-tight text-[var(--ds-text-muted)]">
                Montant
              </th>
              <th className="px-4 py-3 text-left text-[11px] font-semibold tracking-tight text-[var(--ds-text-muted)]">
                Mode de paiement
              </th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr
                key={p.id}
                className="border-b border-[var(--ds-primary-border)] last:border-0 hover:bg-[var(--ds-surface)]"
              >
                <td className="px-4 py-3 text-xs text-[var(--ds-text)]">
                  {formatDate(p.date)}
                </td>
                <td className="px-4 py-3 text-xs font-semibold tracking-tight text-[var(--ds-primary)]">
                  {formatDZD(p.montant)}
                </td>
                <td className="px-4 py-3 text-xs text-[var(--ds-text)]">{p.mode}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[color-mix(in_srgb,var(--ds-text)_35%,transparent)] p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Ajouter un versement"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setIsOpen(false);
          }}
        >
          <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--ds-primary-border)] px-5 py-4">
              <div>
                <h3 className="text-base font-semibold tracking-tight text-[color:var(--ds-text)]">
                  Ajouter un versement
                </h3>
                <p className="mt-0.5 text-xs text-[var(--ds-text-muted)]">
                  Saisissez les informations du paiement.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-2xl text-[var(--ds-text-muted)] hover:bg-[var(--ds-primary-soft)] hover:text-[var(--ds-text)]"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-[var(--ds-text)]">
                    Date
                  </label>
                  <input
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="mt-1.5 w-full rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-bg)] px-3 py-2 text-xs text-[var(--ds-text)] outline-none focus:border-[color:var(--ds-primary)]/60 focus:ring-2 focus:ring-[var(--ds-primary-border)]"
                    placeholder="Ex: 17 mars 2026"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--ds-text)]">
                    Montant (DA)
                  </label>
                  <input
                    value={montant}
                    onChange={(e) => setMontant(e.target.value)}
                    inputMode="numeric"
                    className="mt-1.5 w-full rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-bg)] px-3 py-2 text-xs text-[var(--ds-text)] outline-none focus:border-[color:var(--ds-primary)]/60 focus:ring-2 focus:ring-[var(--ds-primary-border)]"
                    placeholder="Ex: 100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--ds-text)]">
                  Mode de paiement
                </label>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as PaymentMethod)}
                  className="mt-1.5 w-full rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-bg)] px-3 py-2 text-xs text-[var(--ds-text)] outline-none focus:border-[color:var(--ds-primary)]/60 focus:ring-2 focus:ring-[var(--ds-primary-border)]"
                >
                  <option value="CB">CB</option>
                  <option value="Espèces">Espèces</option>
                  <option value="Virement">Virement</option>
                  <option value="Chèque">Chèque</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[var(--ds-primary-border)] px-5 py-4">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-4 py-2 text-xs font-medium text-[var(--ds-text)] hover:bg-[var(--ds-primary-soft)]"
              >
                Annuler
              </button>
              <PrimaryButton
                type="button"
                onClick={handleSave}
                className="rounded-2xl px-4 py-2 text-xs font-medium"
              >
                Enregistrer
              </PrimaryButton>
            </div>
          </div>
        </div>
      )}

      {/* Modal Ajouter un acte */}
      {isActModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[color-mix(in_srgb,var(--ds-text)_30%,transparent)] p-4 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-acte-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setIsActModalOpen(false);
          }}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-3xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)]/95 shadow-[0_8px_30px_rgba(0,0,0,0.04)] backdrop-blur-md"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-[var(--ds-primary-border)] px-5 py-4">
              <div>
                <h3
                  id="add-acte-title"
                  className="text-base font-semibold tracking-tight text-[color:var(--ds-text)]"
                >
                  Ajouter un acte
                </h3>
                <p className="mt-0.5 text-xs text-[var(--ds-text-muted)]">
                  Type de soin et montant en DA.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsActModalOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-2xl text-[var(--ds-text-muted)] hover:bg-[var(--ds-primary-soft)] hover:text-[var(--ds-text)]"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              <div>
                <p className="mb-2 text-sm font-medium text-[var(--ds-text)]">
                  Type de soin
                </p>
                <div className="flex flex-wrap gap-2">
                  {ACTES.map((acte) => {
                    const selected = selectedActes.includes(acte);
                    return (
                      <button
                        key={acte}
                        type="button"
                        onClick={() => toggleActe(acte)}
                        className={[
                          "rounded-xl px-3 py-2 text-xs font-medium transition-all duration-200",
                          selected
                            ? "bg-[color:var(--ds-primary)] text-[var(--ds-bg)] shadow-sm"
                            : "bg-[var(--ds-primary-soft)] text-[var(--ds-text-muted)] hover:bg-[var(--ds-bg)]",
                        ].join(" ")}
                      >
                        {acte}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label
                  htmlFor="acte-montant"
                  className="block text-sm font-medium text-[var(--ds-text)]"
                >
                  Montant
                </label>
                <div className="mt-1.5 flex items-center gap-2">
                  <input
                    id="acte-montant"
                    type="number"
                    min={0}
                    step={1}
                    value={acteMontant}
                    onChange={(e) => setActeMontant(e.target.value)}
                    className="w-full rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 py-2.5 text-sm text-[var(--ds-text)] outline-none transition-colors placeholder:text-[var(--ds-text-subtle)] focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                    placeholder="0"
                  />
                  <span className="shrink-0 text-sm font-medium text-[var(--ds-text-muted)]">
                    DA
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[var(--ds-primary-border)] px-5 py-4">
              <button
                type="button"
                onClick={() => setIsActModalOpen(false)}
                className="rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-4 py-2 text-xs font-medium text-[var(--ds-text)] hover:bg-[var(--ds-primary-soft)]"
              >
                Annuler
              </button>
              <PrimaryButton
                type="button"
                onClick={handleAddActe}
                className="rounded-2xl px-4 py-2 text-xs font-medium shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
              >
                Ajouter au total
              </PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

