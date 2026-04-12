"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import type { DentalCatalogAct } from "@/utils/dentalCatalogActs";

type CatalogActComboboxProps = {
  id: string;
  label: string;
  acts: DentalCatalogAct[];
  selectedId: string;
  onSelect: (act: DentalCatalogAct) => void;
  onClearSelection?: () => void;
  placeholder?: string;
};

export function CatalogActCombobox({
  id,
  label,
  acts,
  selectedId,
  onSelect,
  onClearSelection,
  placeholder = "Rechercher un acte du catalogue…",
}: CatalogActComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => acts.find((a) => a.id === selectedId) ?? null,
    [acts, selectedId],
  );

  useEffect(() => {
    if (selected) setQuery(selected.nom);
    else setQuery("");
  }, [selected]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return acts;
    return acts.filter(
      (a) =>
        a.nom.toLowerCase().includes(q) ||
        a.categorie.toLowerCase().includes(q),
    );
  }, [acts, query]);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <label
        htmlFor={id}
        className="block text-sm font-medium text-slate-700"
      >
        {label}
      </label>
      <div className="relative mt-1">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden
        />
        <input
          id={id}
          type="search"
          autoComplete="off"
          value={query}
          onChange={(e) => {
            const v = e.target.value;
            setQuery(v);
            setOpen(true);
            if (selected && v !== selected.nom && onClearSelection) {
              onClearSelection();
            }
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-listbox`}
          aria-autocomplete="list"
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-[#ede9fe] focus:ring-2 focus:ring-[#ede9fe]"
        />
      </div>
      {open && filtered.length > 0 ? (
        <ul
          id={`${id}-listbox`}
          role="listbox"
          className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          {filtered.map((act) => (
            <li key={act.id} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={act.id === selectedId}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelect(act);
                  setQuery(act.nom);
                  setOpen(false);
                }}
                className="flex w-full flex-col gap-0.5 px-3 py-2.5 text-left text-sm transition-colors hover:bg-slate-50"
              >
                <span className="font-medium text-slate-800">{act.nom}</span>
                <span className="text-xs text-slate-500">
                  {act.categorie} · {act.prix_par_defaut.toLocaleString("fr-DZ")}{" "}
                  DA
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {open && filtered.length === 0 && query.trim() ? (
        <p className="absolute z-30 mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-500 shadow-lg">
          Aucun acte ne correspond à « {query.trim()} ».
        </p>
      ) : null}
    </div>
  );
}
