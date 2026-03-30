"use client";

import { Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  ensureCatalogSeeded,
  newCatalogActId,
  readCatalogFromStorage,
  writeCatalogToStorage,
  type DentalCatalogAct,
  type DentalCatalogCategory,
} from "@/utils/dentalCatalogActs";

const CATEGORIES: DentalCatalogCategory[] = ["Chirurgie", "Soins", "Prothèse"];

const inputClass =
  "w-full min-w-0 rounded-lg border border-slate-200 bg-white p-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-slate-400 focus:ring-2 focus:ring-slate-200/80";

const labelClass = "text-sm font-medium text-gray-700";

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

  function persist(next: DentalCatalogAct[]) {
    writeCatalogToStorage(next);
    setActs(next);
  }

  function updateRow(
    id: string,
    patch: Partial<Pick<DentalCatalogAct, "nom" | "categorie" | "prix_par_defaut">>,
  ) {
    persist(
      acts.map((a) => {
        if (a.id !== id) return a;
        const nom =
          patch.nom !== undefined ? patch.nom.trim() || a.nom : a.nom;
        const categorie = patch.categorie ?? a.categorie;
        let prix = patch.prix_par_defaut ?? a.prix_par_defaut;
        if (!Number.isFinite(prix) || prix < 0) prix = 0;
        return { ...a, nom, categorie, prix_par_defaut: Math.round(prix) };
      }),
    );
  }

  function addAct() {
    const row: DentalCatalogAct = {
      id: newCatalogActId(),
      nom: "Nouvel acte",
      categorie: "Soins",
      prix_par_defaut: 0,
    };
    persist([row, ...acts]);
  }

  function removeAct(id: string) {
    if (!window.confirm("Retirer cet acte du catalogue ?")) return;
    persist(acts.filter((a) => a.id !== id));
  }

  const grouped = CATEGORIES.map((cat) => ({
    categorie: cat,
    items: acts.filter((a) => a.categorie === cat),
  }));

  if (!mounted) {
    return (
      <div className="w-full min-w-0 rounded-2xl border border-slate-200/80 bg-white p-8 text-sm text-slate-500 shadow-sm sm:p-8">
        Chargement du catalogue…
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex w-full min-w-0 flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">
            Actes &amp; tarifs
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Nomenclature utilisée sur les fiches patients et pour préremplir
            les montants de facturation. Stockage local du navigateur.
          </p>
        </div>
        <button
          type="button"
          onClick={addAct}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" strokeWidth={2.25} />
          Ajouter un acte
        </button>
      </div>

      <div className="mt-10 space-y-12">
        {grouped.map(({ categorie, items }) => (
          <section key={categorie} className="w-full min-w-0">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {categorie}
            </h3>
            {items.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-5 py-8 text-center text-sm text-slate-500">
                Aucun acte dans cette catégorie.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-slate-100 rounded-2xl border border-slate-100">
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
                            <span className="shrink-0 text-sm font-medium text-slate-400">
                              DA
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="w-full min-w-0 pt-2">
                        <button
                          type="button"
                          onClick={() => removeAct(act.id)}
                          className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
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
