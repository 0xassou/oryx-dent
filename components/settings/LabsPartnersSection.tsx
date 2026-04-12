"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  type DentalLabPartner,
  type LabPhoneEntry,
  readLabsDirectoryFromStorage,
  writeLabsDirectoryToStorage,
} from "@/utils/labsDirectory";

function uid() {
  return `lab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function LabsPartnersSection() {
  const [labs, setLabs] = useState<DentalLabPartner[]>([]);
  const [directoryReady, setDirectoryReady] = useState(false);

  useEffect(() => {
    setLabs(readLabsDirectoryFromStorage());
    setDirectoryReady(true);
  }, []);

  useEffect(() => {
    if (!directoryReady) return;
    writeLabsDirectoryToStorage(labs);
  }, [labs, directoryReady]);

  function addLab() {
    setLabs((prev) => [
      ...prev,
      {
        id: uid(),
        nom: "Nouveau laboratoire",
        telephones: [{ label: "Principal", numero: "" }],
        adresse: "",
      },
    ]);
  }

  function removeLab(id: string) {
    setLabs((prev) => prev.filter((l) => l.id !== id));
  }

  function updateLab(id: string, patch: Partial<DentalLabPartner>) {
    setLabs((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    );
  }

  function addPhoneLine(labId: string) {
    setLabs((prev) =>
      prev.map((l) =>
        l.id === labId
          ? {
              ...l,
              telephones: [
                ...l.telephones,
                { label: `Contact ${l.telephones.length + 1}`, numero: "" },
              ],
            }
          : l,
      ),
    );
  }

  function updatePhone(
    labId: string,
    index: number,
    patch: Partial<LabPhoneEntry>,
  ) {
    setLabs((prev) =>
      prev.map((l) => {
        if (l.id !== labId) return l;
        const next = l.telephones.map((p, i) =>
          i === index ? { ...p, ...patch } : p,
        );
        return { ...l, telephones: next };
      }),
    );
  }

  function removePhone(labId: string, index: number) {
    setLabs((prev) =>
      prev.map((l) => {
        if (l.id !== labId) return l;
        const next = l.telephones.filter((_, i) => i !== index);
        return {
          ...l,
          telephones:
            next.length > 0 ? next : [{ label: "Principal", numero: "" }],
        };
      }),
    );
  }

  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-lg font-medium tracking-tight text-[var(--ds-text)]">
          Laboratoires partenaires
        </h2>
        <p className="mt-2 text-sm font-light leading-relaxed text-[var(--ds-text-muted)]">
          Répertoire utilisé dans le module Laboratoire. Ajoutez plusieurs
          numéros (secrétariat, prothésiste…) pour un menu WhatsApp sur la fiche
          commande.
        </p>
      </div>

      <div className="space-y-8">
        {labs.map((lab) => (
          <div
            key={lab.id}
            className="rounded-2xl border border-[var(--ds-primary-border)]/90 bg-[var(--ds-surface)] p-6 shadow-[0_2px_20px_rgba(15,23,42,0.04)]"
          >
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-[var(--ds-text)]">
                  Nom du laboratoire
                </label>
                <input
                  type="text"
                  value={lab.nom}
                  onChange={(e) => updateLab(lab.id, { nom: e.target.value })}
                  className="rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-bg)]/40 px-3 py-2.5 text-sm font-normal text-[var(--ds-text)] outline-none transition-colors focus:border-[var(--ds-primary-border)] focus:bg-[var(--ds-surface)] focus:ring-1 focus:ring-[var(--ds-primary-border)]/80"
                />
              </div>
              <div className="md:col-span-2 flex flex-col gap-2">
                <label className="text-sm font-medium text-[var(--ds-text)]">
                  Adresse
                </label>
                <input
                  type="text"
                  value={lab.adresse}
                  onChange={(e) =>
                    updateLab(lab.id, { adresse: e.target.value })
                  }
                  className="rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-bg)]/40 px-3 py-2.5 text-sm font-normal text-[var(--ds-text)] outline-none transition-colors focus:border-[var(--ds-primary-border)] focus:bg-[var(--ds-surface)] focus:ring-1 focus:ring-[var(--ds-primary-border)]/80"
                />
              </div>
            </div>

            <div className="mt-8 border-t border-[var(--ds-primary-border)]/90 pt-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-medium text-[var(--ds-text)]">
                  Téléphones
                </p>
                <button
                  type="button"
                  onClick={() => addPhoneLine(lab.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 py-1.5 text-xs font-medium text-[var(--ds-text-muted)] shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-[var(--ds-primary-border)] hover:bg-[var(--ds-bg)]/80"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2.25} />
                  Ajouter un numéro
                </button>
              </div>
              <div className="mt-4 space-y-4">
                {lab.telephones.map((line, idx) => (
                  <div
                    key={`${lab.id}-tel-${idx}`}
                    className="flex flex-col gap-3 sm:flex-row sm:items-end"
                  >
                    <div className="min-w-0 flex-1">
                      <label className="text-xs font-normal uppercase tracking-wider text-[var(--ds-text-muted)]">
                        Libellé
                      </label>
                      <input
                        type="text"
                        value={line.label}
                        onChange={(e) =>
                          updatePhone(lab.id, idx, { label: e.target.value })
                        }
                        placeholder="ex. Accueil"
                        className="mt-1 w-full rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-bg)]/40 px-3 py-2 text-sm font-normal text-[var(--ds-text)] outline-none focus:border-[var(--ds-primary-border)] focus:bg-[var(--ds-surface)] focus:ring-1 focus:ring-[var(--ds-primary-border)]/80"
                      />
                    </div>
                    <div className="min-w-0 flex-[1.2]">
                      <label className="text-xs font-normal uppercase tracking-wider text-[var(--ds-text-muted)]">
                        Numéro
                      </label>
                      <div className="mt-1 flex gap-2">
                        <input
                          type="tel"
                          value={line.numero}
                          onChange={(e) =>
                            updatePhone(lab.id, idx, { numero: e.target.value })
                          }
                          placeholder="+213 …"
                          className="min-w-0 flex-1 rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-bg)]/40 px-3 py-2 text-sm font-normal text-[var(--ds-text)] outline-none focus:border-[var(--ds-primary-border)] focus:bg-[var(--ds-surface)] focus:ring-1 focus:ring-[var(--ds-primary-border)]/80"
                        />
                        <button
                          type="button"
                          onClick={() => removePhone(lab.id, idx)}
                          className="shrink-0 rounded-xl border border-transparent p-2 text-[var(--ds-text-muted)] transition-colors hover:border-red-100 hover:bg-red-50/50 hover:text-red-600"
                          aria-label="Supprimer ce numéro"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8 flex justify-end border-t border-[var(--ds-primary-border)]/90 pt-6">
              <button
                type="button"
                onClick={() => removeLab(lab.id)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-red-100 bg-red-50/40 px-4 py-2 text-xs font-medium text-red-700 transition-colors hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Supprimer ce laboratoire
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addLab}
        className="inline-flex items-center gap-2 rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-5 py-3 text-sm font-medium text-[var(--ds-text-muted)] shadow-[0_2px_12px_rgba(15,23,42,0.05)] transition-colors hover:border-[var(--ds-primary-border)] hover:bg-[var(--ds-bg)]/80"
      >
        <Plus className="h-4 w-4" strokeWidth={2} />
        Ajouter un laboratoire
      </button>
    </div>
  );
}
