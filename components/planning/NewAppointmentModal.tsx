"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  isValidDateKeyString,
  roundStartTimeToNextTenMinutes,
  todayDateInputValue,
} from "@/utils/appointmentData";
import { PrimaryButton } from "@/components/ui/PrimaryButton";

const DUREES = [15, 30, 45, 60, 90] as const;

const MOTIFS = [
  { id: "consultation", label: "Consultation" },
  { id: "détartrage", label: "Détartrage" },
  { id: "soin", label: "Soin" },
  { id: "urgence", label: "Urgence", isUrgence: true },
  { id: "prothèse", label: "Prothèse" },
] as const;

export interface NewAppointmentPayload {
  patient: string;
  /** Lien dossier patient (ex. fiche ouverte avec `patientId=` dans l’URL). */
  patientId?: string;
  date: string;
  time: string;
  dureeMinutes: number;
  motifs: string[];
  notes: string;
}

interface NewAppointmentModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (payload: NewAppointmentPayload) => void;
  /** Pré-remplissage du champ patient (ex. query `patientName` depuis la fiche patient). */
  defaultPatientName?: string;
  /** Id dossier lorsque la fiche ouvre « Nouveau RDV » depuis le patient. */
  defaultPatientId?: string;
}

const inputBase =
  "mt-0 w-full rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)]/80 px-3 py-2.5 text-sm text-[var(--ds-text)] outline-none transition-colors placeholder:text-[var(--ds-text-muted)] focus:border-[color:var(--ds-primary)] focus-visible:ring-2 focus-visible:ring-[color:var(--ds-primary)]/20";

const fieldStack = "flex flex-col gap-2";

export function NewAppointmentModal({
  open,
  onClose,
  onConfirm,
  defaultPatientName = "",
  defaultPatientId,
}: NewAppointmentModalProps) {
  const [patient, setPatient] = useState("");
  const [date, setDate] = useState(() => todayDateInputValue());
  const [time, setTime] = useState(() =>
    roundStartTimeToNextTenMinutes(new Date()),
  );
  const [duree, setDuree] = useState<number>(30);
  const [selectedMotifs, setSelectedMotifs] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setPatient(defaultPatientName.trim());
    setDate(todayDateInputValue());
    setTime(roundStartTimeToNextTenMinutes(new Date()));
    setDuree(30);
    setSelectedMotifs([]);
    setNotes("");
  }, [open, defaultPatientName]);

  if (!open) return null;

  function toggleMotif(label: string) {
    setSelectedMotifs((prev) => {
      const adding = !prev.includes(label);
      const next = adding
        ? [...prev, label]
        : prev.filter((m) => m !== label);
      if (adding && label === "Urgence") {
        setTime(roundStartTimeToNextTenMinutes(new Date()));
      }
      return next;
    });
  }

  function normalizeTimeHHmm(raw: string): string {
    const t = raw.trim();
    if (!t) return "";
    const m = t.match(/^(\d{1,2}):(\d{2})/);
    if (!m) return "";
    const hh = Math.min(23, Math.max(0, Number(m[1])));
    const mm = Math.min(59, Math.max(0, Number(m[2])));
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }

  function handleConfirm() {
    const isUrgence = selectedMotifs.some((m) =>
      m.toLowerCase().includes("urgence"),
    );
    let resolvedDate = date.trim();
    if (!resolvedDate || !isValidDateKeyString(resolvedDate)) {
      resolvedDate = todayDateInputValue();
    }
    let resolvedTime = normalizeTimeHHmm(time);
    if (!resolvedTime) {
      resolvedTime = isUrgence
        ? roundStartTimeToNextTenMinutes(new Date())
        : "09:00";
    }
    onConfirm({
      patient: patient.trim(),
      ...(defaultPatientId?.trim()
        ? { patientId: defaultPatientId.trim() }
        : {}),
      date: resolvedDate,
      time: resolvedTime,
      dureeMinutes: duree,
      motifs: [...selectedMotifs],
      notes: notes.trim(),
    });
    onClose();
  }

  return (
    <div
      lang="fr"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-rdv-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[90vh] min-h-0 w-full max-w-lg flex-col rounded-3xl bg-[var(--ds-surface)]/95 shadow-[0_8px_30px_rgba(0,0,0,0.08)] backdrop-blur-md"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--ds-primary-border)]/60 px-6 py-4">
          <div>
            <h2
              id="new-rdv-title"
              className="text-lg font-semibold tracking-tight text-[color:var(--ds-text)]"
            >
              Nouveau rendez-vous
            </h2>
            <p className="mt-0.5 text-sm text-[var(--ds-text-muted)]">
              Patient, date, heure et motif
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-[var(--ds-text-muted)] transition-colors hover:bg-[var(--ds-primary-soft)] hover:text-[var(--ds-text)]"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 pb-20 lg:pb-6">
          <div className="space-y-6">
            <div className={fieldStack}>
              <label
                htmlFor="new-rdv-patient"
                className="text-sm font-medium text-[var(--ds-text)]"
              >
                Nom du patient
              </label>
              <input
                id="new-rdv-patient"
                type="text"
                value={patient}
                onChange={(e) => setPatient(e.target.value)}
                className={inputBase}
                placeholder="Ex. Marie Dupont"
              />
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-x-6">
              <div className={`min-w-0 ${fieldStack}`}>
                <label
                  htmlFor="new-rdv-date"
                  className="text-sm font-medium text-[var(--ds-text)]"
                >
                  Date <span className="text-[var(--ds-text-muted)]">(YYYY-MM-DD)</span>
                </label>
                <input
                  id="new-rdv-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={inputBase}
                />
              </div>
              <div className={`min-w-0 ${fieldStack}`}>
                <label
                  htmlFor="new-rdv-time"
                  className="text-sm font-medium text-[var(--ds-text)]"
                >
                  Heure <span className="text-[var(--ds-text-muted)]">(24 h)</span>
                </label>
                <input
                  id="new-rdv-time"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className={inputBase}
                  step={60}
                />
              </div>
            </div>

            <div className={fieldStack}>
              <label
                htmlFor="new-rdv-duree"
                className="text-sm font-medium text-[var(--ds-text)]"
              >
                Durée
              </label>
              <select
                id="new-rdv-duree"
                value={duree}
                onChange={(e) => setDuree(Number(e.target.value))}
                className={inputBase}
              >
                {DUREES.map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium text-[var(--ds-text)]">
                Motif du RDV
              </p>
              <div className="flex flex-wrap gap-2">
                {MOTIFS.map((m) => {
                  const { id, label } = m;
                  const isUrgence = "isUrgence" in m && m.isUrgence === true;
                  const selected = selectedMotifs.includes(label);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggleMotif(label)}
                      className={[
                        "rounded-xl px-3 py-2 text-xs font-medium transition-all duration-200",
                        selected
                          ? isUrgence
                            ? "bg-red-500 text-white shadow-[0_2px_8px_rgba(239,68,68,0.3)]"
                            : "bg-[color:var(--ds-primary)] text-white shadow-[0_2px_8px_rgba(8,145,178,0.25)]"
                          : isUrgence
                            ? "bg-red-50 text-red-600 hover:bg-red-100"
                            : "bg-[var(--ds-primary-soft)] text-[var(--ds-text-muted)] hover:bg-[var(--ds-primary-border)]/80",
                      ].join(" ")}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={fieldStack}>
              <label
                htmlFor="new-rdv-notes"
                className="text-sm font-medium text-[var(--ds-text)]"
              >
                Notes <span className="text-[var(--ds-text-muted)]">(optionnel)</span>
              </label>
              <textarea
                id="new-rdv-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className={`${inputBase} min-h-[80px] resize-y`}
                placeholder="Précisions éventuelles…"
              />
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-[var(--ds-primary-border)]/60 px-6 py-4 pb-24 lg:pb-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[var(--ds-primary-border)] px-4 py-2.5 text-sm font-medium text-[var(--ds-text-muted)] shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-colors hover:bg-[var(--ds-bg)]"
          >
            Annuler
          </button>
          <PrimaryButton
            type="button"
            onClick={handleConfirm}
            className="font-medium shadow-[0_8px_30px_rgba(0,0,0,0.08)]"
          >
            Confirmer le RDV
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
