"use client";

import { Plus, X } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  addExpenseToStorage,
  type DentalExpense,
  EXPENSE_CATEGORIES,
  readExpensesFromStorage,
} from "@/utils/expensesData";
import { formatDZD, formatDate } from "@/utils/formatters";

const JUSTIF_MAX_BYTES = 5 * 1024 * 1024;

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

function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function FinancesDepensesTab() {
  const [mounted, setMounted] = useState(false);
  const [expenses, setExpenses] = useState<DentalExpense[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [formDate, setFormDate] = useState(todayIsoDate);
  const [formLibelle, setFormLibelle] = useState("");
  const [formMontant, setFormMontant] = useState("");
  const [formCategorie, setFormCategorie] =
    useState<DentalExpense["categorie"]>("Frais");
  const [formJustif, setFormJustif] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(() => {
    setExpenses(readExpensesFromStorage());
  }, []);

  useEffect(() => {
    setMounted(true);
    reload();
  }, [reload]);

  function openModal() {
    setFormDate(todayIsoDate());
    setFormLibelle("");
    setFormMontant("");
    setFormCategorie("Frais");
    setFormJustif(null);
    setModalOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const lib = formLibelle.trim();
    const digits = formMontant.replace(/\s/g, "").replace(/[^\d]/g, "");
    const montant = Number.parseInt(digits, 10);
    if (!lib || !Number.isFinite(montant) || montant <= 0) return;
    setSaving(true);
    try {
      let justificatif_url = "";
      if (formJustif) {
        justificatif_url = await fileToDataUrl(formJustif);
      }
      addExpenseToStorage({
        date: new Date(`${formDate}T12:00:00`).toISOString(),
        libelle: lib,
        montant,
        categorie: formCategorie,
        justificatif_url,
      });
      setExpenses(readExpensesFromStorage());
      setModalOpen(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  if (!mounted) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
        Chargement…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-[color:var(--ds-text)]">
            Dépenses
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Enregistrez les sorties d&apos;argent (stock, labo, frais). Les
            totaux alimentent le tableau de bord Finances.
          </p>
        </div>
        <button
          type="button"
          onClick={openModal}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[color:var(--ds-primary)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          + Enregistrer une dépense
        </button>
      </div>

      <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">
          Dernières sorties
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Les plus récentes en premier
        </p>
        {expenses.length === 0 ? (
          <p className="mt-8 text-center text-sm text-slate-500">
            Aucune dépense enregistrée. Utilisez le bouton ci-dessus.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {expenses.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-2"
              >
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{e.libelle}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {formatDate(e.date)} ·{" "}
                    <span className="font-medium text-slate-600">
                      {e.categorie}
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-sm font-bold tabular-nums text-rose-600">
                    − {formatDZD(e.montant)}
                  </p>
                  {e.justificatif_url ? (
                    <a
                      href={e.justificatif_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium text-sky-600 hover:underline"
                    >
                      Justificatif
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="depense-modal-title"
          >
            <div className="flex items-start justify-between gap-3">
              <h2
                id="depense-modal-title"
                className="text-lg font-semibold text-slate-900"
              >
                Nouvelle dépense
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="exp-date"
                  className="text-xs font-medium text-slate-600"
                >
                  Date
                </label>
                <input
                  id="exp-date"
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="exp-lib"
                  className="text-xs font-medium text-slate-600"
                >
                  Libellé
                </label>
                <input
                  id="exp-lib"
                  type="text"
                  value={formLibelle}
                  onChange={(e) => setFormLibelle(e.target.value)}
                  placeholder="Ex. Commande gants nitrile"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="exp-montant"
                  className="text-xs font-medium text-slate-600"
                >
                  Montant (DA)
                </label>
                <input
                  id="exp-montant"
                  type="text"
                  inputMode="numeric"
                  value={formMontant}
                  onChange={(e) => setFormMontant(e.target.value)}
                  placeholder="Ex. 35000"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="exp-cat"
                  className="text-xs font-medium text-slate-600"
                >
                  Catégorie
                </label>
                <select
                  id="exp-cat"
                  value={formCategorie}
                  onChange={(e) =>
                    setFormCategorie(e.target.value as DentalExpense["categorie"])
                  }
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="exp-justif"
                  className="text-xs font-medium text-slate-600"
                >
                  Justificatif (optionnel, max 5 Mo)
                </label>
                <input
                  id="exp-justif"
                  type="file"
                  accept="image/*,.pdf,application/pdf"
                  onChange={(e) =>
                    setFormJustif(e.target.files?.[0] ?? null)
                  }
                  className="mt-1.5 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700"
                />
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
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
