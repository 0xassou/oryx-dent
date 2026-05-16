"use client";

import { Plus, RefreshCcw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  ensureCatalogSeeded,
  newCatalogActId,
  readCatalogFromStorage,
  writeCatalogToStorage,
  type DentalCatalogAct,
  type DentalCatalogCategory,
} from "@/utils/dentalCatalogActs";
import { DEFAULT_ACTES_TARIFS } from "@/utils/defaultActesTarifs";
import { replaceCabinetSettingsAction } from "@/app/actions/cabinet-settings";
import { PrimaryButton } from "@/components/ui/PrimaryButton";

const CATEGORIES: DentalCatalogCategory[] = ["Chirurgie", "Soins", "Prothèse"];

const inputClass =
  "w-full min-w-0 rounded-lg border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-2.5 text-sm text-[var(--ds-text)] outline-none transition-colors focus:border-[var(--ds-primary-border)] focus:ring-2 focus:ring-[var(--ds-primary-border)]/80";

const labelClass = "text-sm font-medium text-[var(--ds-text)]";

const fieldRow =
  "flex w-full min-w-0 flex-col gap-2 mb-4 last:mb-0";

const fieldRowGrid = "flex w-full min-w-0 flex-col gap-2";

const actFieldsGrid =
  "grid w-full min-w-0 grid-cols-1 gap-6 md:grid-cols-2";

export function ActesTarifsSection() {
  const [acts, setActs] = useState<DentalCatalogAct[]>([]);
  const [mounted, setMounted] = useState(false);

  const refresh = useCallback(() => {
    ensureCatalogSeeded();
    setActs(readCatalogFromStorage());
  }, []);

  useEffect(() => {
    setMounted(true);
    refresh();
  }, [refresh]);

  function updateRow(
    id: string,
    patch: Partial<Pick<DentalCatalogAct, "nom" | "categorie" | "prix_par_defaut">>,
  ) {
    setActs((prev) => {
      const next = prev.map((a) => {
        if (a.id !== id) return a;
        const nom =
          patch.nom !== undefined ? patch.nom.trim() || a.nom : a.nom;
        const categorie = patch.categorie ?? a.categorie;
        let prix = patch.prix_par_defaut ?? a.prix_par_defaut;
        if (!Number.isFinite(prix) || prix < 0) prix = 0;
        return { ...a, nom, categorie, prix_par_defaut: Math.round(prix) };
      });
      writeCatalogToStorage(next);
      return next;
    });
  }

  function addAct() {
    const row: DentalCatalogAct = {
      id: newCatalogActId(),
      nom: "Nouvel acte",
      categorie: "Soins",
      prix_par_defaut: 0,
    };
    setActs((prev) => {
      const next = [row, ...prev];
      writeCatalogToStorage(next);
      return next;
    });
  }

  async function resetToDefaults() {
    const confirmed = window.confirm(
      "Remplacer tous les actes par les 20 protocoles standards ? Cette action efface les actes actuels.",
    );
    if (!confirmed) return;

    const resetActs: DentalCatalogAct[] = DEFAULT_ACTES_TARIFS.map((t) => ({
      id: newCatalogActId(),
      nom: t.acte,
      categorie: mapDefaultCategoryToCatalog(t.categorie),
      prix_par_defaut: t.prix,
    }));

    setActs(resetActs);
    writeCatalogToStorage(resetActs);

    const actesTarifsPayload = DEFAULT_ACTES_TARIFS.map((t) => ({
      categorie: t.categorie,
      acte: t.acte,
      prix: t.prix,
    }));

    await replaceCabinetSettingsAction({ actesTarifs: actesTarifsPayload });
  }

  function mapDefaultCategoryToCatalog(
    cat: string,
  ): DentalCatalogCategory {
    const lower = cat.toLowerCase();
    if (lower.includes("chirurgie")) return "Chirurgie";
    if (lower.includes("prothèse") || lower.includes("prothese"))
      return "Prothèse";
    return "Soins";
  }

  function removeAct(id: string) {
    if (!window.confirm("Retirer cet acte du catalogue ?")) return;
    setActs((prev) => {
      const next = prev.filter((a) => a.id !== id);
      writeCatalogToStorage(next);
      return next;
    });
  }

  const grouped = CATEGORIES.map((cat) => ({
    categorie: cat,
    items: acts.filter((a) => a.categorie === cat),
  }));

  if (!mounted) {
    return (
      <div className="w-full min-w-0 rounded-2xl border border-[var(--ds-primary-border)]/80 bg-[var(--ds-surface)] p-8 text-sm text-[var(--ds-text-muted)] shadow-sm sm:p-8">
        Chargement du catalogue…
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 rounded-2xl border border-[var(--ds-primary-border)]/80 bg-[var(--ds-surface)] p-6 shadow-sm sm:p-8">
      <div className="flex w-full min-w-0 flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold tracking-tight text-[var(--ds-text)]">
            Actes &amp; tarifs
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--ds-text-muted)]">
            Nomenclature utilisée sur les fiches patients et pour préremplir
            les montants de facturation. Stockage local du navigateur.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={resetToDefaults}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-4 py-3 text-sm font-medium text-[var(--ds-text)] shadow-sm transition-colors hover:bg-[var(--ds-surface-2)]"
          >
            <RefreshCcw className="h-4 w-4" strokeWidth={2.25} />
            Réinitialiser les tarifs par défaut
          </button>
          <PrimaryButton
            type="button"
            onClick={addAct}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-sm"
          >
            <Plus className="h-4 w-4" strokeWidth={2.25} />
            Ajouter un acte
          </PrimaryButton>
        </div>
      </div>

      <div className="mt-10 space-y-12">
        {grouped.map(({ categorie, items }) => (
          <section key={categorie} className="w-full min-w-0">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--ds-text-muted)]">
              {categorie}
            </h3>
            {items.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-[var(--ds-primary-border)] bg-[var(--ds-bg)]/80 px-5 py-8 text-center text-sm text-[var(--ds-text-muted)]">
                Aucun acte dans cette catégorie.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-[var(--ds-primary-border)] rounded-2xl border border-[var(--ds-primary-border)]">
                {items.map((act) => (
                  <li key={act.id} className="p-6 sm:p-8">
                    <div className="w-full min-w-0">
                      <div className={fieldRow}>
                        <label className={labelClass} htmlFor={`nom-${act.id}`}>
                          Nom de l&apos;acte
                        </label>
                        <input
                          id={`nom-${act.id}`}
                          value={act.nom}
                          onChange={(e) =>
                            updateRow(act.id, { nom: e.target.value })
                          }
                          className={inputClass}
                        />
                      </div>
                      <div className={actFieldsGrid}>
                        <div className={fieldRowGrid}>
                          <label className={labelClass} htmlFor={`cat-${act.id}`}>
                            Catégorie
                          </label>
                          <select
                            id={`cat-${act.id}`}
                            value={act.categorie}
                            onChange={(e) =>
                              updateRow(act.id, {
                                categorie: e.target.value as DentalCatalogCategory,
                              })
                            }
                            className={inputClass}
                          >
                            {CATEGORIES.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className={fieldRowGrid}>
                          <label className={labelClass} htmlFor={`prix-${act.id}`}>
                            Prix par défaut (DA)
                          </label>
                          <div className="flex w-full min-w-0 items-center gap-3">
                            <input
                              id={`prix-${act.id}`}
                              type="number"
                              min={0}
                              step={100}
                              value={act.prix_par_defaut}
                              onChange={(e) =>
                                updateRow(act.id, {
                                  prix_par_defaut: Number(e.target.value),
                                })
                              }
                              className={`${inputClass} min-w-0 flex-1`}
                            />
                            <span className="shrink-0 text-sm font-medium text-[var(--ds-text-muted)]">
                              DA
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="w-full min-w-0 pt-2">
                        <button
                          type="button"
                          onClick={() => removeAct(act.id)}
                          className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-[var(--ds-text-muted)] transition-colors hover:bg-red-50 hover:text-red-600"
                          aria-label="Supprimer cet acte du catalogue"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
