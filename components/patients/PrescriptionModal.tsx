"use client";

import { useState } from "react";
import { Search, X } from "lucide-react";

const QUICK_TAGS = [
  "Amoxicilline 1g",
  "Paracétamol 1g",
  "Ibuprofène 400mg",
  "Bain de bouche (Chlorhexidine)",
] as const;

export interface PrescriptionItem {
  id: string;
  medicament: string;
  posologie: string;
  duree: string;
}

function uid() {
  return Math.random().toString(16).slice(2);
}

interface PrescriptionModalProps {
  open: boolean;
  patientName: string;
  patientAge?: string;
  onClose: () => void;
  onGeneratePdf: (items: PrescriptionItem[]) => void;
}

const inputBase =
  "w-full rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 py-2 text-sm text-[var(--ds-text)] outline-none transition-colors placeholder:text-[var(--ds-text-subtle)] focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20";

export function PrescriptionModal({
  open,
  patientName,
  patientAge = "42 ans",
  onClose,
  onGeneratePdf,
}: PrescriptionModalProps) {
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<PrescriptionItem[]>([]);

  if (!open) return null;

  const nameParts = (patientName || "—").trim().split(/\s+/).filter(Boolean);
  const prenom = nameParts.length >= 2 ? nameParts[0] : patientName || "—";
  const nom = nameParts.length >= 2 ? nameParts.slice(1).join(" ") : patientName || "—";

  function addFromTag(medicament: string) {
    setItems((prev) => [
      ...prev,
      {
        id: uid(),
        medicament,
        posologie: "1 matin et soir",
        duree: "6 jours",
      },
    ]);
  }

  function updateItem(
    id: string,
    field: keyof PrescriptionItem,
    value: string,
  ) {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, [field]: value } : item,
      ),
    );
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  function handleGenerate() {
    onGeneratePdf(items);
    setItems([]);
    setSearch("");
    onClose();
  }

  const today = new Date().toLocaleDateString("fr-FR");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[color-mix(in_srgb,var(--ds-text)_30%,transparent)] p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="prescription-modal-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-3xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)]/98 shadow-[0_8px_30px_rgba(0,0,0,0.08)] backdrop-blur-md"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--ds-primary-border)] px-6 py-4">
          <h2
            id="prescription-modal-title"
            className="text-lg font-semibold tracking-tight text-[color:var(--ds-text)]"
          >
            Créer une ordonnance
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-[var(--ds-text-muted)] transition-colors hover:bg-[var(--ds-primary-soft)] hover:text-[var(--ds-text)]"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-1 min-h-0 flex-col overflow-hidden lg:flex-row">
          {/* Colonne gauche - Sélection rapide */}
          <div className="flex flex-col gap-4 border-b border-[var(--ds-primary-border)] p-6 lg:max-w-[320px] lg:border-b-0 lg:border-r">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-text-subtle)]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un médicament..."
                className={`${inputBase} pl-9`}
              />
            </div>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--ds-text-muted)]">
                Prescriptions courantes
              </p>
              <div className="flex flex-wrap gap-2">
                {QUICK_TAGS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => addFromTag(tag)}
                    className="rounded-xl bg-[var(--ds-primary-soft)] px-3 py-2 text-xs font-medium text-[var(--ds-text)] transition-colors hover:bg-[var(--ds-bg)]"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
            {items.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wider text-[var(--ds-text-muted)]">
                  Ligne à modifier
                </p>
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-2 space-y-1.5"
                    >
                      <p className="text-xs font-medium text-[var(--ds-text)] truncate">
                        {item.medicament}
                      </p>
                      <input
                        value={item.posologie}
                        onChange={(e) =>
                          updateItem(item.id, "posologie", e.target.value)
                        }
                        placeholder="Posologie"
                        className={`${inputBase} py-1.5 text-xs`}
                      />
                      <input
                        value={item.duree}
                        onChange={(e) =>
                          updateItem(item.id, "duree", e.target.value)
                        }
                        placeholder="Durée"
                        className={`${inputBase} py-1.5 text-xs`}
                      />
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="text-xs text-[var(--ds-primary-hover)] hover:text-[var(--ds-text)]"
                      >
                        Retirer
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Colonne droite - Aperçu A4 */}
          <div className="flex flex-1 flex-col overflow-hidden bg-[var(--ds-bg)] p-6">
            <div className="flex flex-1 items-center justify-center">
              <div className="w-full max-w-[400px] aspect-[210/297] rounded-lg border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-8 shadow-lg">
                <div className="mb-4 border-b border-[var(--ds-primary-border)] pb-4 text-center">
                  <p className="text-sm text-[var(--ds-text-muted)]">
                    <span className="font-bold text-[var(--ds-text)]">
                      Dr. Assil Messaoudi
                    </span>{" "}
                    - Chirurgien Dentiste
                  </p>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-x-10 gap-y-4 text-sm">
                  <div className="space-y-3">
                    <p className="text-[var(--ds-text)]">
                      <span className="font-semibold text-[var(--ds-text-muted)]">Nom :</span>{" "}
                      {nom || "—"}
                    </p>
                    <p className="text-[var(--ds-text)]">
                      <span className="font-semibold text-[var(--ds-text-muted)]">
                        Âge :
                      </span>{" "}
                      {patientAge || "—"}
                    </p>
                  </div>

                  <div className="space-y-3">
                    <p className="text-[var(--ds-text)]">
                      <span className="font-semibold text-[var(--ds-text-muted)]">
                        Prénom :
                      </span>{" "}
                      {prenom || "—"}
                    </p>
                    <p className="text-[var(--ds-text)]">
                      <span className="font-semibold text-[var(--ds-text-muted)]">Le</span>{" "}
                      {today}
                    </p>
                  </div>
                </div>
                <div className="mt-6 border-t border-[var(--ds-primary-border)] pt-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--ds-text-muted)]">
                    Ordonnance
                  </p>
                  {items.length === 0 ? (
                    <p className="text-sm text-[var(--ds-text-subtle)]">
                      Aucun médicament ajouté. Cliquez sur un tag à gauche.
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {items.map((item) => (
                        <li
                          key={item.id}
                          className="flex flex-wrap gap-x-2 text-sm text-[var(--ds-text)]"
                        >
                          <span className="font-medium">
                            {item.medicament}
                          </span>
                          <span>
                            — {item.posologie || "—"} ·{" "}
                            {item.duree ? `${item.duree}` : "—"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-[var(--ds-primary-border)] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-4 py-2.5 text-sm font-medium text-[var(--ds-text-muted)] shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-colors hover:bg-[var(--ds-primary-soft)] hover:text-[var(--ds-text)]"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            className="rounded-xl bg-[color:var(--ds-primary)] px-4 py-2.5 text-sm font-medium text-[var(--ds-bg)] shadow-[0_8px_30px_rgba(0,0,0,0.08)] transition-colors hover:opacity-90"
          >
            Générer le PDF
          </button>
        </div>
      </div>
    </div>
  );
}
