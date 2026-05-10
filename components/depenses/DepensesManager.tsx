"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { FileText, Plus, Trash2, X } from "lucide-react";
import {
  createDepenseAction,
  deleteDepenseAction,
  getDepensesAction,
  updateDepenseAction,
  type DepenseCategorie,
  type DepenseRow,
} from "@/app/actions/depenses";
import { showAppToast } from "@/utils/appToast";

const CATEGORIES: DepenseCategorie[] = [
  "Loyer",
  "Matériel médical",
  "Consommables",
  "Salaires",
  "Charges sociales",
  "Electricité/Eau/Gaz",
  "Maintenance",
  "Laboratoire",
  "Formation",
  "Autre",
];

const JUSTIF_MAX_BYTES = 5 * 1024 * 1024;

type PeriodFilter = "all" | "week" | "month";

export type DepensesManagerProps = {
  /** Si `false`, masque le bloc titre (h2 + sous-titre). Défaut : `true`. */
  showPageHeading?: boolean;
};

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > JUSTIF_MAX_BYTES) {
      reject(new Error("Justificatif trop volumineux (max 5 Mo)."));
      return;
    }
    const r = new FileReader();
    r.onload = () => {
      const x = r.result;
      if (typeof x === "string") resolve(x);
      else reject(new Error("Lecture impossible."));
    };
    r.onerror = () => reject(new Error("Lecture impossible."));
    r.readAsDataURL(file);
  });
}

function formatDateFr(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatDZD(v: number): string {
  return `${Math.round(v).toLocaleString("fr-DZ")} DA`;
}

function toNumber(v: string): number {
  const n = Number.parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isInPeriod(isoDate: string, period: PeriodFilter): boolean {
  if (period === "all") return true;
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return true;
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  if (period === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    return d.getTime() >= start.getTime() && d.getTime() <= end.getTime();
  }
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0);
  return d.getTime() >= start.getTime() && d.getTime() <= end.getTime();
}

export function DepensesManager({ showPageHeading = true }: DepensesManagerProps) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<DepenseRow[]>([]);
  const [period, setPeriod] = useState<PeriodFilter>("all");
  const [category, setCategory] = useState<DepenseCategorie | "all">("all");

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formCategorie, setFormCategorie] = useState<DepenseCategorie>("Consommables");
  const [formDescription, setFormDescription] = useState("");
  const [formMontant, setFormMontant] = useState("");
  const [formDate, setFormDate] = useState(todayIso());
  const [formFournisseur, setFormFournisseur] = useState("");
  const [formJustif, setFormJustif] = useState<File | null>(null);

  const reload = useCallback(async () => {
    const res = await getDepensesAction();
    if (!res.ok) {
      showAppToast(res.error);
      setRows([]);
      return;
    }
    setRows(res.data);
  }, []);

  useEffect(() => {
    setLoading(true);
    void (async () => {
      try {
        await reload();
      } finally {
        setLoading(false);
      }
    })();
  }, [reload]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (category !== "all" && r.categorie !== category) return false;
      if (!isInPeriod(r.date, period)) return false;
      return true;
    });
  }, [rows, category, period]);

  function openModal() {
    setFormCategorie("Consommables");
    setFormDescription("");
    setFormMontant("");
    setFormDate(todayIso());
    setFormFournisseur("");
    setFormJustif(null);
    setModalOpen(true);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const montantDigits = formMontant.replace(/\s/g, "").replace(",", ".").replace(/[^\d.]/g, "");
    const montant = Number.parseFloat(montantDigits);
    if (!Number.isFinite(montant) || montant <= 0) return;
    setSaving(true);
    try {
      let justificatif: string | null = null;
      if (formJustif) {
        try {
          justificatif = await fileToDataUrl(formJustif);
        } catch (err) {
          showAppToast(err instanceof Error ? err.message : "Justificatif invalide.");
          setSaving(false);
          return;
        }
      }
      const res = await createDepenseAction({
        categorie: formCategorie,
        description: formDescription.trim() || null,
        montant,
        date: formDate,
        fournisseur: formFournisseur.trim() || null,
        justificatif,
      });
      if (!res.ok) {
        showAppToast(res.error);
        return;
      }
      setRows((prev) => [res.data, ...prev].sort((a, b) => b.date.localeCompare(a.date)));
      setModalOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function deleteRow(id: string) {
    const ok = window.confirm("Supprimer cette dépense ?");
    if (!ok) return;
    const res = await deleteDepenseAction(id);
    if (!res.ok) {
      showAppToast(res.error);
      return;
    }
    setRows((prev) => prev.filter((x) => x.id !== id));
  }

  async function quickEditDescription(id: string, next: string) {
    const res = await updateDepenseAction(id, { description: next.trim() || null });
    if (!res.ok) {
      showAppToast(res.error);
      return;
    }
    setRows((prev) => prev.map((x) => (x.id === id ? res.data : x)));
  }

  return (
    <div className="space-y-6">
      <div
        className={[
          "flex flex-col gap-4 sm:flex-row sm:items-start",
          showPageHeading ? "sm:justify-between" : "sm:justify-end",
        ].join(" ")}
      >
        {showPageHeading ? (
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-tight text-[var(--ds-text)]">
              Dépenses
            </h2>
            <p className="mt-1 text-sm text-[var(--ds-text-muted)]">
              Suivi des sorties d’argent (loyer, matériel, charges, labo…).
            </p>
          </div>
        ) : null}

        <button
          type="button"
          onClick={openModal}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[color:var(--ds-primary)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 sm:shrink-0"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          Nouvelle dépense
        </button>
      </div>

      <div className="rounded-[20px] border border-[var(--border)] bg-[var(--ds-surface)] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="flex shrink-0 rounded-lg border border-[var(--ds-primary-border)] bg-[var(--ds-bg)] p-0.5"
              role="group"
              aria-label="Filtrer par période"
            >
              {(
                [
                  { id: "all", label: "Toutes" },
                  { id: "week", label: "Cette semaine" },
                  { id: "month", label: "Ce mois" },
                ] as const
              ).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPeriod(p.id)}
                  className={[
                    "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                    period === p.id
                      ? "bg-[var(--ds-surface)] text-[var(--ds-primary)] shadow-sm ring-1 ring-[var(--ds-primary-border)]/80"
                      : "text-[var(--ds-text-muted)] hover:text-[var(--ds-text)]",
                  ].join(" ")}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="relative">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as DepenseCategorie | "all")}
                className="appearance-none rounded-lg border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 py-2 text-xs font-semibold text-[var(--ds-text)] shadow-sm outline-none focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary-border)]/20"
                aria-label="Filtrer par catégorie"
              >
                <option value="all">Toutes catégories</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--ds-primary-border)]/80">
          <table className="w-full min-w-[920px] text-sm">
            <thead>
              <tr className="border-b border-[var(--ds-primary-border)] bg-[var(--ds-bg)]/50 text-left">
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--ds-text-muted)]">
                  Date
                </th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--ds-text-muted)]">
                  Catégorie
                </th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--ds-text-muted)]">
                  Description
                </th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--ds-text-muted)]">
                  Fournisseur
                </th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ds-text-muted)]">
                  Montant
                </th>
                <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-[var(--ds-text-muted)]">
                  Justificatif
                </th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ds-text-muted)]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array.from({ length: 6 })].map((_, i) => (
                  <tr key={i} className="border-b border-[var(--ds-primary-border)] last:border-0">
                    <td className="px-4 py-3" colSpan={7}>
                      <div className="h-8 animate-pulse rounded-xl bg-muted" />
                    </td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center text-sm text-[var(--ds-text-muted)]" colSpan={7}>
                    Aucune dépense pour ce filtre.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-[var(--ds-primary-border)] transition-colors last:border-0 hover:bg-[var(--ds-primary-soft)]/40"
                  >
                    <td className="px-4 py-3 text-[var(--ds-text-muted)]">
                      {formatDateFr(r.date)}
                    </td>
                    <td className="px-4 py-3 font-medium text-[var(--ds-text)]">
                      {r.categorie}
                    </td>
                    <td className="px-4 py-3 text-[var(--ds-text)]">
                      <input
                        defaultValue={r.description ?? ""}
                        onBlur={(e) => {
                          const next = e.target.value;
                          if ((r.description ?? "") === next) return;
                          void quickEditDescription(r.id, next);
                        }}
                        className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm outline-none transition-colors focus:border-[var(--ds-primary-border)] focus:bg-[var(--ds-surface)]"
                        placeholder="—"
                      />
                    </td>
                    <td className="px-4 py-3 text-[var(--ds-text-muted)]">
                      {r.fournisseur ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-['DM_Mono',monospace] font-bold tabular-nums text-[#ef4444]">
                      − {formatDZD(toNumber(r.montant))}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {r.justificatif ? (
                        <a
                          href={r.justificatif}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center justify-center rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-2 text-[var(--ds-primary)] transition-colors hover:bg-[var(--ds-primary-soft)]"
                          aria-label="Ouvrir le justificatif"
                          title="Justificatif"
                        >
                          <FileText className="h-4 w-4" />
                        </a>
                      ) : (
                        <span className="text-[var(--ds-text-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => void deleteRow(r.id)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] text-red-600 transition-colors hover:bg-red-50"
                        aria-label="Supprimer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div
            className="w-full max-w-md rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="depense-modal-title"
          >
            <div className="flex items-start justify-between gap-3">
              <h2
                id="depense-modal-title"
                className="text-lg font-semibold text-[var(--ds-text)]"
              >
                Nouvelle dépense
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1 text-[var(--ds-text-muted)] hover:bg-[var(--ds-primary-soft)] hover:text-[var(--ds-text)]"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={submit} className="mt-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-[var(--ds-text-muted)]" htmlFor="dep-cat">
                  Catégorie
                </label>
                <select
                  id="dep-cat"
                  value={formCategorie}
                  onChange={(e) => setFormCategorie(e.target.value as DepenseCategorie)}
                  className="mt-1.5 w-full rounded-xl border border-[var(--ds-primary-border)] px-3 py-2 text-sm outline-none focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary-border)]"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-[var(--ds-text-muted)]" htmlFor="dep-desc">
                  Description
                </label>
                <input
                  id="dep-desc"
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-[var(--ds-primary-border)] px-3 py-2 text-sm outline-none focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary-border)]"
                  placeholder="Ex. Achat composite A3"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-[var(--ds-text-muted)]" htmlFor="dep-montant">
                    Montant (DA)
                  </label>
                  <input
                    id="dep-montant"
                    type="text"
                    inputMode="decimal"
                    value={formMontant}
                    onChange={(e) => setFormMontant(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-[var(--ds-primary-border)] px-3 py-2 text-sm outline-none focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary-border)]"
                    placeholder="Ex. 35000"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--ds-text-muted)]" htmlFor="dep-date">
                    Date
                  </label>
                  <input
                    id="dep-date"
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-[var(--ds-primary-border)] px-3 py-2 text-sm outline-none focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary-border)]"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-[var(--ds-text-muted)]" htmlFor="dep-four">
                  Fournisseur
                </label>
                <input
                  id="dep-four"
                  type="text"
                  value={formFournisseur}
                  onChange={(e) => setFormFournisseur(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-[var(--ds-primary-border)] px-3 py-2 text-sm outline-none focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary-border)]"
                  placeholder="Optionnel"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-[var(--ds-text-muted)]" htmlFor="dep-justif">
                  Justificatif (optionnel, max 5 Mo)
                </label>
                <input
                  id="dep-justif"
                  type="file"
                  accept="image/*,.pdf,application/pdf"
                  onChange={(e) => setFormJustif(e.target.files?.[0] ?? null)}
                  className="mt-1.5 block w-full text-sm text-[var(--ds-text-muted)] file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--ds-primary-soft)] file:px-3 file:py-2 file:text-sm file:font-medium file:text-[var(--ds-text)]"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-[var(--ds-primary-border)] pt-4">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-xl border border-[var(--ds-primary-border)] px-4 py-2 text-sm font-medium text-[var(--ds-text)] hover:bg-[var(--ds-bg)]"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-[color:var(--ds-primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? "Enregistrement…" : "Enregistrer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
