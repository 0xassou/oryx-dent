"use client";

import { useMemo, useState } from "react";
import { FileDown, FileText } from "lucide-react";
import {
  exportFinanceCsvAction,
  exportFinancePdfAction,
  type ExportPeriode,
} from "@/app/actions/finances-stats";

type PeriodOption = { id: ExportPeriode; label: string };

const PERIODS: PeriodOption[] = [
  { id: "mois", label: "Ce mois" },
  { id: "3mois", label: "3 mois" },
  { id: "6mois", label: "6 mois" },
  { id: "annee", label: "Cette année" },
];

function downloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadBase64Pdf(filename: string, base64: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function FinancesRapportsTab() {
  const [periode, setPeriode] = useState<ExportPeriode>("mois");
  const [exporting, setExporting] = useState<null | "csv" | "pdf">(null);
  const disabled = exporting != null;

  const periodLabel = useMemo(
    () => PERIODS.find((p) => p.id === periode)?.label ?? "Ce mois",
    [periode],
  );

  async function exportCsv() {
    setExporting("csv");
    try {
      const res = await exportFinanceCsvAction(periode);
      downloadTextFile(res.filename, res.csv, "text/csv;charset=utf-8");
    } finally {
      setExporting(null);
    }
  }

  async function exportPdf() {
    setExporting("pdf");
    try {
      const res = await exportFinancePdfAction(periode);
      downloadBase64Pdf(res.filename, res.pdfBase64);
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold tracking-tight text-[var(--ds-text)]">
          Rapports
        </h2>
        <p className="text-sm text-[var(--ds-text-muted)]">
          Export recettes + dépenses et récapitulatif financier.
        </p>
      </div>

      <div className="rounded-3xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--ds-text)]">
              Période
            </p>
            <p className="mt-1 text-xs text-[var(--ds-text-muted)]">
              Sélectionnez la fenêtre d’export.
            </p>
          </div>

          <div
            className="flex shrink-0 rounded-lg border border-[var(--ds-primary-border)] bg-[var(--ds-bg)] p-0.5"
            role="group"
            aria-label="Sélecteur de période"
          >
            {PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriode(p.id)}
                className={[
                  "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                  periode === p.id
                    ? "bg-[var(--ds-surface)] text-[var(--ds-primary)] shadow-sm ring-1 ring-[var(--ds-primary-border)]/80"
                    : "text-[var(--ds-text-muted)] hover:text-[var(--ds-text)]",
                ].join(" ")}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={exportCsv}
            disabled={disabled}
            className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-4 text-left shadow-sm transition-colors hover:bg-[var(--ds-bg)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--ds-primary-soft)] text-[var(--ds-primary)]">
                <FileDown className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[var(--ds-text)]">
                  Exporter CSV
                </span>
                <span className="block text-xs text-[var(--ds-text-muted)]">
                  Recettes + dépenses · {periodLabel}
                </span>
              </span>
            </span>
            <span className="text-xs font-semibold text-[var(--ds-primary)]">
              {exporting === "csv" ? "Génération…" : "Télécharger"}
            </span>
          </button>

          <button
            type="button"
            onClick={exportPdf}
            disabled={disabled}
            className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-4 text-left shadow-sm transition-colors hover:bg-[var(--ds-bg)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--ds-primary-soft)] text-[var(--ds-primary)]">
                <FileText className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[var(--ds-text)]">
                  Exporter PDF
                </span>
                <span className="block text-xs text-[var(--ds-text-muted)]">
                  Rapport · {periodLabel}
                </span>
              </span>
            </span>
            <span className="text-xs font-semibold text-[var(--ds-primary)]">
              {exporting === "pdf" ? "Génération…" : "Télécharger"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

