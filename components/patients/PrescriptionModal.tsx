"use client";

import { useState } from "react";
import { Search, X } from "lucide-react";
import {
  MEDICAMENTS_DENTAIRES,
  type MedicamentPreset,
} from "@/data/medicaments-dentaires";
import { PrimaryButton } from "@/components/ui/PrimaryButton";

export interface PrescriptionItem {
  id: string;
  nom: string;
  dosage: string;
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
  const [isAutocompleteOpen, setIsAutocompleteOpen] = useState(false);
  const [draftNom, setDraftNom] = useState("");
  const [draftDosage, setDraftDosage] = useState("");
  const [draftPosologie, setDraftPosologie] = useState("");
  const [draftDuree, setDraftDuree] = useState("");

  if (!open) return null;

  const nameParts = (patientName || "—").trim().split(/\s+/).filter(Boolean);
  const prenom = nameParts.length >= 2 ? nameParts[0] : patientName || "—";
  const nom = nameParts.length >= 2 ? nameParts.slice(1).join(" ") : patientName || "—";

  function addItemFromDraft(nextNom?: string) {
    const nomInput = (nextNom ?? draftNom).trim();
    if (!nomInput) return;
    setItems((prev) => [
      ...prev,
      {
        id: uid(),
        nom: nomInput,
        dosage: draftDosage.trim(),
        posologie: draftPosologie.trim(),
        duree: draftDuree.trim(),
      },
    ]);
    setDraftNom("");
    setDraftDosage("");
    setDraftPosologie("");
    setDraftDuree("");
    setSearch("");
    setIsAutocompleteOpen(false);
  }

  function normalize(s: string): string {
    return s
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  const query = normalize(search);
  const results: MedicamentPreset[] =
    query.length === 0
      ? []
      : MEDICAMENTS_DENTAIRES.filter((m) => {
          const hay = normalize(
            `${m.nom} ${m.dosage} ${m.posologie} ${m.duree}`,
          );
          return hay.includes(query);
        }).slice(0, 6);

  function applyPreset(p: MedicamentPreset) {
    setDraftNom(p.nom);
    setDraftDosage(p.dosage);
    setDraftPosologie(p.posologie);
    setDraftDuree(p.duree);
    setSearch(`${p.nom} ${p.dosage}`.trim());
    setIsAutocompleteOpen(false);
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
    setIsAutocompleteOpen(false);
    setDraftNom("");
    setDraftDosage("");
    setDraftPosologie("");
    setDraftDuree("");
    onClose();
  }

  const today = new Date().toLocaleDateString("fr-DZ", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

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
          {/* Colonne gauche - Ajout médicaments */}
          <div className="flex flex-col gap-4 border-b border-[var(--ds-primary-border)] p-6 lg:max-w-[360px] lg:border-b-0 lg:border-r">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-text-subtle)]" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setIsAutocompleteOpen(true);
                }}
                onFocus={() => {
                  if (search.trim()) setIsAutocompleteOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    setIsAutocompleteOpen(false);
                  }
                }}
                placeholder="Rechercher un médicament..."
                className={`${inputBase} pl-9`}
              />

              {isAutocompleteOpen && search.trim().length > 0 ? (
                <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-2xl border border-[var(--ds-primary-border)] bg-white shadow-[0_4px_16px_rgba(0,0,0,0.06)]">
                  {results.length === 0 ? (
                    <div className="px-3 py-2.5 text-xs text-[var(--ds-text-muted)]">
                      <span className="font-semibold text-[var(--ds-text)]">
                        Médicament non trouvé
                      </span>{" "}
                      — saisie libre
                    </div>
                  ) : (
                    <ul className="max-h-[240px] overflow-auto py-1">
                      {results.map((m, idx) => (
                        <li key={`${m.nom}-${m.dosage}-${idx}`}>
                          <button
                            type="button"
                            className="w-full px-3 py-2 text-left transition-colors hover:bg-[var(--ds-primary-soft)]"
                            onMouseDown={(ev) => {
                              // Évite le blur du champ avant le clic.
                              ev.preventDefault();
                            }}
                            onClick={() => applyPreset(m)}
                          >
                            <div className="text-[13px] font-semibold text-[var(--ds-text)]">
                              {m.nom}
                            </div>
                            <div className="mt-0.5 text-xs text-[var(--ds-text-muted)]">
                              {m.dosage} · {m.posologie} · {m.duree}
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}
            </div>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                addItemFromDraft(search.trim() ? search.trim() : undefined);
              }}
            >
              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wider text-[var(--ds-text-muted)]">
                  Nom médicament
                </label>
                <input
                  value={draftNom}
                  onChange={(e) => setDraftNom(e.target.value)}
                  placeholder="Ex: Amoxicilline"
                  className={inputBase}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wider text-[var(--ds-text-muted)]">
                  Dosage
                </label>
                <input
                  value={draftDosage}
                  onChange={(e) => setDraftDosage(e.target.value)}
                  placeholder="Ex: 1g / 400mg"
                  className={inputBase}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wider text-[var(--ds-text-muted)]">
                  Posologie
                </label>
                <input
                  value={draftPosologie}
                  onChange={(e) => setDraftPosologie(e.target.value)}
                  placeholder="Ex: 1 comprimé 3x/jour"
                  className={inputBase}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium uppercase tracking-wider text-[var(--ds-text-muted)]">
                  Durée
                </label>
                <input
                  value={draftDuree}
                  onChange={(e) => setDraftDuree(e.target.value)}
                  placeholder="Ex: 7 jours"
                  className={inputBase}
                />
              </div>
              <PrimaryButton type="submit" className="w-full rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm">
                Ajouter
              </PrimaryButton>
            </form>
            {items.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wider text-[var(--ds-text-muted)]">
                  Médicaments ajoutés
                </p>
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-2 space-y-1.5"
                    >
                      <p className="text-xs font-medium text-[var(--ds-text)] truncate">
                        {item.nom}
                      </p>
                      <input
                        value={item.dosage}
                        onChange={(e) =>
                          updateItem(item.id, "dosage", e.target.value)
                        }
                        placeholder="Dosage"
                        className={`${inputBase} py-1.5 text-xs`}
                      />
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

          {/* Colonne droite - Aperçu A5 */}
          <div className="flex flex-1 flex-col overflow-hidden bg-[var(--ds-bg)] p-6">
            <div className="flex flex-1 items-center justify-center">
              <div className="w-full max-w-[460px] aspect-[148/210] rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-8 shadow-lg">
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
                      Aucun médicament ajouté.
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {items.map((item) => (
                        <li
                          key={item.id}
                          className="flex flex-wrap gap-x-2 text-sm text-[var(--ds-text)]"
                        >
                          <span className="font-medium">
                            {item.nom} {item.dosage ? item.dosage : ""}
                          </span>
                          <span>
                            — {item.posologie || "—"} —{" "}
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
          <PrimaryButton
            type="button"
            onClick={handleGenerate}
            className="rounded-xl px-4 py-2.5 text-sm font-medium shadow-[0_8px_30px_rgba(0,0,0,0.08)]"
          >
            Générer le PDF
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
