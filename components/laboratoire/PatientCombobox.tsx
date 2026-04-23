"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import {
  displayPatientName,
  type DentalPatientRecord,
} from "@/utils/patientData";

type PatientComboboxProps = {
  id: string;
  patients: DentalPatientRecord[];
  selectedId: string | null;
  onSelect: (patient: DentalPatientRecord) => void;
  onClear: () => void;
  placeholder?: string;
};

export function PatientCombobox({
  id,
  patients,
  selectedId,
  onSelect,
  onClear,
  placeholder = "Rechercher un patient…",
}: PatientComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => patients.find((p) => p.id === selectedId) ?? null,
    [patients, selectedId],
  );

  useEffect(() => {
    if (selected) setQuery(displayPatientName(selected));
    else setQuery("");
  }, [selected]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((p) => {
      const name = displayPatientName(p).toLowerCase();
      return (
        name.includes(q) ||
        p.nom.toLowerCase().includes(q) ||
        p.prenom.toLowerCase().includes(q) ||
        p.telephone.replace(/\s/g, "").includes(q.replace(/\s/g, ""))
      );
    });
  }, [patients, query]);

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
        className="block text-sm font-medium text-[var(--ds-text)]"
      >
        Patient
      </label>
      <div className="relative mt-1.5">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-text-subtle)]"
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
            if (selected && v !== displayPatientName(selected)) {
              onClear();
            }
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] py-2.5 pl-10 pr-3 text-sm text-[var(--ds-text)] outline-none transition-colors placeholder:text-[var(--ds-text-subtle)] focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
        />
        {open && filtered.length > 0 ? (
          <ul
            className="absolute left-0 right-0 top-full z-50 mt-1 max-h-52 overflow-auto rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] py-1 shadow-lg"
            role="listbox"
          >
            {filtered.map((p) => (
              <li key={p.id} role="option">
                <button
                  type="button"
                  className="flex w-full px-3 py-2 text-left text-sm text-[var(--ds-text)] hover:bg-[var(--ds-primary-soft)]"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onSelect(p);
                    setQuery(displayPatientName(p));
                    setOpen(false);
                  }}
                >
                  <span className="font-medium">{displayPatientName(p)}</span>
                  <span className="ml-2 text-xs text-[var(--ds-text-muted)]">
                    {p.telephone}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
