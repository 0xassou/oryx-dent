"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Clock,
  Play,
  CheckCircle2,
  UserX,
  UserPlus,
  X,
  RefreshCw,
} from "lucide-react";
import {
  getConsultationsDuJourAction,
  createConsultationAction,
  updateStatutConsultationAction,
  type ConsultationRow,
  type ConsultationStatut,
} from "@/app/actions/consultations";
import {
  createPatientAction,
  searchPatientsAutocompleteAction,
} from "@/app/actions/patients";
import type { PatientRow } from "@/lib/types/patients-db";
import { showAppToast } from "@/utils/appToast";
import { WorkflowKanbanSkeleton } from "@/components/ui/page-skeletons";
import { PrimaryButton } from "@/components/ui/PrimaryButton";

const REFRESH_MS = 15_000;

type Column = {
  statut: ConsultationStatut;
  label: string;
  icon: typeof Clock;
  accent: string;
  bg: string;
  border: string;
};

const COLUMNS: Column[] = [
  {
    statut: "en_attente",
    label: "En attente",
    icon: Clock,
    accent: "#d97706",
    bg: "#fffbeb",
    border: "#fde68a",
  },
  {
    statut: "arrive",
    label: "Arrivé",
    icon: UserPlus,
    accent: "#16a34a",
    bg: "#f0fdf4",
    border: "#bbf7d0",
  },
  {
    statut: "en_consultation",
    label: "En consultation",
    icon: Play,
    accent: "#0891b2",
    bg: "#ecfeff",
    border: "#a5f3fc",
  },
  {
    statut: "termine",
    label: "Terminé",
    icon: CheckCircle2,
    accent: "#475569",
    bg: "#f8fafc",
    border: "#e2e8f0",
  },
];

function todayLabel(): string {
  return new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function waitMinutes(isoDate: string | null): string {
  if (!isoDate) return "";
  const diff = Date.now() - new Date(isoDate).getTime();
  if (diff < 0) return "";
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "< 1 min";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const rest = mins % 60;
  return `${h}h${rest > 0 ? String(rest).padStart(2, "0") : ""}`;
}

/** Formate la saisie en JJ/MM/AAAA (auto-insertion des /) */
function formatDateInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** Convertit une date ISO (YYYY-MM-DD) en JJ/MM/AAAA pour l'affichage */
function isoToDisplayDate(isoDate: string): string {
  if (!isoDate) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    const [y, m, d] = isoDate.split("-");
    return `${d}/${m}/${y}`;
  }
  // Si déjà au format JJ/MM/AAAA, retourner tel quel
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(isoDate)) return isoDate;
  return "";
}

/** Convertit une date JJ/MM/AAAA en ISO (YYYY-MM-DD) */
function parseDateToISO(dateValue: string): string {
  if (!dateValue) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return dateValue;
  const match = dateValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return "";
  const [, d, m, y] = match;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function useNowClock(): string {
  const [time, setTime] = useState(() => {
    const n = new Date();
    return `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
  });
  useEffect(() => {
    const id = setInterval(() => {
      const n = new Date();
      setTime(
        `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`,
      );
    }, 1_000);
    return () => clearInterval(id);
  }, []);
  return time;
}

/* ───────────── SVG salle d'attente ───────────── */

function WaitingRoomIllustration() {
  return (
    <svg
      width="220"
      height="160"
      viewBox="0 0 220 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className="mx-auto"
    >
      {/* Sol */}
      <rect x="10" y="130" width="200" height="4" rx="2" fill="#e2e8f0" />
      {/* Chaise gauche */}
      <rect x="30" y="100" width="40" height="6" rx="3" fill="#a5b4fc" />
      <rect x="32" y="80" width="4" height="20" rx="2" fill="#818cf8" />
      <rect x="64" y="80" width="4" height="20" rx="2" fill="#818cf8" />
      <rect x="34" y="106" width="4" height="24" rx="2" fill="#c7d2fe" />
      <rect x="62" y="106" width="4" height="24" rx="2" fill="#c7d2fe" />
      <rect x="30" y="75" width="6" height="28" rx="3" fill="#818cf8" />
      {/* Chaise droite */}
      <rect x="150" y="100" width="40" height="6" rx="3" fill="#a5b4fc" />
      <rect x="152" y="80" width="4" height="20" rx="2" fill="#818cf8" />
      <rect x="184" y="80" width="4" height="20" rx="2" fill="#818cf8" />
      <rect x="154" y="106" width="4" height="24" rx="2" fill="#c7d2fe" />
      <rect x="182" y="106" width="4" height="24" rx="2" fill="#c7d2fe" />
      <rect x="184" y="75" width="6" height="28" rx="3" fill="#818cf8" />
      {/* Table basse */}
      <rect x="85" y="110" width="50" height="5" rx="2.5" fill="#cbd5e1" />
      <rect x="95" y="115" width="4" height="15" rx="2" fill="#94a3b8" />
      <rect x="121" y="115" width="4" height="15" rx="2" fill="#94a3b8" />
      {/* Magazine sur table */}
      <rect
        x="98"
        y="104"
        width="16"
        height="10"
        rx="1.5"
        fill="#ddd6fe"
        transform="rotate(-8 98 104)"
      />
      {/* Plante pot */}
      <rect x="95" y="55" width="30" height="18" rx="4" fill="#86efac" />
      <ellipse cx="110" cy="55" rx="18" ry="10" fill="#4ade80" />
      <rect x="105" y="73" width="10" height="12" rx="3" fill="#d97706" />
      {/* Tiges */}
      <line x1="106" y1="55" x2="100" y2="35" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" />
      <line x1="110" y1="52" x2="110" y2="28" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" />
      <line x1="114" y1="55" x2="120" y2="35" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" />
      {/* Feuilles */}
      <ellipse cx="98" cy="33" rx="6" ry="4" fill="#4ade80" transform="rotate(-25 98 33)" />
      <ellipse cx="110" cy="26" rx="6" ry="4" fill="#4ade80" />
      <ellipse cx="122" cy="33" rx="6" ry="4" fill="#4ade80" transform="rotate(25 122 33)" />
      {/* Horloge murale */}
      <circle cx="40" cy="30" r="16" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="2" />
      <circle cx="40" cy="30" r="1.5" fill="#475569" />
      <line x1="40" y1="30" x2="40" y2="20" stroke="#475569" strokeWidth="2" strokeLinecap="round" />
      <line x1="40" y1="30" x2="48" y2="33" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" />
      {/* Cadre mural */}
      <rect x="160" y="18" width="30" height="22" rx="3" fill="#ede9fe" stroke="#c4b5fd" strokeWidth="1.5" />
      <rect x="165" y="23" width="20" height="12" rx="1.5" fill="#ddd6fe" />
    </svg>
  );
}

/* ───────────── Page ───────────── */

export default function WorkflowPage() {
  const [consultations, setConsultations] = useState<ConsultationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [, setTick] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clock = useNowClock();

  const refresh = useCallback(async () => {
    const res = await getConsultationsDuJourAction();
    if (res.ok) setConsultations(res.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    timerRef.current = setInterval(() => void refresh(), REFRESH_MS);
    tickRef.current = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [refresh]);

  // Recharger immédiatement quand l'utilisateur revient sur l'onglet
  useEffect(() => {
    const handleFocus = () => {
      void refresh();
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [refresh]);

  async function transition(id: string, to: ConsultationStatut) {
    const previous = consultations;
    setConsultations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, statut: to } : c)),
    );
    const res = await updateStatutConsultationAction(id, to);
    if (!res.ok) {
      setConsultations(previous);
      showAppToast(res.error);
      return;
    }
    setConsultations((prev) =>
      prev.map((c) => (c.id === id ? res.data : c)),
    );
  }

  const nonAbsent = consultations.filter((c) => c.statut !== "absent");
  const isEmpty = nonAbsent.length === 0 && !loading;

  return (
    <div className="w-full space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--ds-text)]">
            Salle d&apos;attente
          </h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-[var(--ds-text-muted)]">
            <span>{todayLabel()}</span>
            <span className="hidden h-4 w-px bg-[var(--ds-primary-border)] sm:inline-block" />
            <span className="font-mono text-sm font-semibold text-[var(--ds-text-muted)]">
              {clock}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--ds-primary-border)] px-3 py-2 text-xs font-medium text-[var(--ds-text-muted)] hover:bg-[var(--ds-primary-soft)]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Actualiser
          </button>
          <PrimaryButton
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
          >
            <UserPlus className="h-4 w-4" strokeWidth={2} />
            Patient sans RDV
          </PrimaryButton>
        </div>
      </div>

      {/* Kanban */}
      {loading ? (
        <WorkflowKanbanSkeleton />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {COLUMNS.map((col) => {
              const items = consultations.filter(
                (c) => c.statut === col.statut,
              );
              const Icon = col.icon;
              return (
                <div
                  key={col.statut}
                  className="flex flex-col rounded-2xl border"
                  style={{
                    borderColor: col.border,
                    backgroundColor: col.bg,
                    minHeight: isEmpty ? 80 : 200,
                  }}
                >
                  {/* Column header */}
                  <div
                    className="flex items-center gap-2 border-b px-4 py-3"
                    style={{ borderColor: col.border }}
                  >
                    <Icon
                      className="h-4 w-4"
                      style={{ color: col.accent }}
                      strokeWidth={2}
                    />
                    <span
                      className="text-sm font-semibold"
                      style={{ color: col.accent }}
                    >
                      {col.label}
                    </span>
                    <span
                      className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white"
                      style={{ backgroundColor: col.accent }}
                    >
                      {items.length}
                    </span>
                  </div>

                  {/* Cards (collapsed when empty state) */}
                  {!isEmpty && (
                    <div className="flex flex-1 flex-col gap-2.5 p-3">
                      {items.length === 0 ? (
                        <p className="py-6 text-center text-xs text-[var(--ds-text-muted)]">
                          Aucun patient
                        </p>
                      ) : (
                        items.map((c) => (
                          <ConsultationCard
                            key={c.id}
                            consultation={c}
                            column={col}
                            onTransition={transition}
                          />
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Empty state */}
          {isEmpty && (
            <div className="flex flex-col items-center rounded-2xl border border-dashed border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-6 py-14">
              <WaitingRoomIllustration />
              <h2 className="mt-6 text-lg font-bold text-[var(--ds-text)]">
                Aucun patient aujourd&apos;hui
              </h2>
              <p className="mt-2 text-center text-sm text-[var(--ds-text-muted)]">
                Les patients apparaîtront ici dès leur arrivée
              </p>
              <PrimaryButton
                type="button"
                onClick={() => setModalOpen(true)}
                className="mt-6 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold shadow-[0_4px_16px_rgba(124,58,237,0.25)]"
              >
                <UserPlus className="h-4 w-4" strokeWidth={2} />
                Patient sans RDV
              </PrimaryButton>
            </div>
          )}
        </>
      )}

      {/* Absent row */}
      {consultations.some((c) => c.statut === "absent") && (
        <div className="rounded-2xl border border-red-200 bg-red-50/60 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-500">
            Absents
          </p>
          <div className="flex flex-wrap gap-2">
            {consultations
              .filter((c) => c.statut === "absent")
              .map((c) => (
                <span
                  key={c.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-white px-3 py-1 text-xs font-medium text-red-600"
                >
                  <UserX className="h-3 w-3" />
                  {c.prenom} {c.nom} &middot; {c.heure ?? "—"}
                </span>
              ))}
          </div>
        </div>
      )}

      {/* Modal patient sans rendez-vous */}
      {modalOpen && (
        <WalkInPatientModal
          onClose={() => setModalOpen(false)}
          onCreated={(row) => {
            setConsultations((prev) => [...prev, row]);
            setModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

/* ───────────── Card ───────────── */

function ConsultationCard({
  consultation: c,
  column,
  onTransition,
}: {
  consultation: ConsultationRow;
  column: Column;
  onTransition: (id: string, to: ConsultationStatut) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  async function go(to: ConsultationStatut) {
    setBusy(true);
    try {
      await onTransition(c.id, to);
    } finally {
      setBusy(false);
    }
  }

  const wait =
    c.statut === "arrive" ? waitMinutes(c.heure_arrivee) : null;

  return (
    <div
      className="rounded-xl border bg-white p-3 shadow-sm"
      style={{ borderColor: column.border }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-sm font-bold text-[var(--ds-text)]">
            {c.heure ?? "—"}
          </p>
          <p className="truncate text-sm font-semibold text-[var(--ds-text)]">
            {c.prenom} {c.nom}
          </p>
          <p className="truncate text-xs text-[var(--ds-text-muted)]">
            {c.type_acte || "Consultation"}
          </p>
        </div>
        {wait && (
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{
              backgroundColor: "color-mix(in srgb, #d97706 15%, transparent)",
              color: "#d97706",
            }}
          >
            {wait}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {c.statut === "en_attente" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void go("arrive")}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: "#16a34a" }}
          >
            Marquer arrivé
          </button>
        )}
        {c.statut === "arrive" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void go("en_consultation")}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: "#0891b2" }}
          >
            <Play className="h-3 w-3" />
            Commencer
          </button>
        )}
        {c.statut === "en_consultation" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void go("termine")}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: "#475569" }}
          >
            <CheckCircle2 className="h-3 w-3" />
            Terminer
          </button>
        )}
        {c.statut !== "absent" && c.statut !== "termine" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void go("absent")}
            className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1 text-[10px] font-medium text-red-500 hover:bg-red-50 disabled:opacity-50"
          >
            <UserX className="h-3 w-3" />
            Absent
          </button>
        )}
      </div>
    </div>
  );
}

const WALKIN_INPUT =
  "w-full rounded-[0.75rem] border border-[var(--ds-border)] bg-white px-3 py-2.5 text-sm font-normal text-[var(--ds-text)] outline-none transition-[border-color,box-shadow] duration-200 focus:ring-2 focus:ring-[color:var(--ds-primary)]";

const BLOOD_GROUPS = [
  "O+",
  "O-",
  "A+",
  "A-",
  "B+",
  "B-",
  "AB+",
  "AB-",
  "Inconnu",
] as const;

type MedCheckboxId =
  | "diabete"
  | "hypertension"
  | "cardiaque"
  | "enceinte"
  | "anticoagulant"
  | "aucun";

const MED_CHECKBOX_LABELS: Record<Exclude<MedCheckboxId, "aucun">, string> = {
  diabete: "Diabète",
  hypertension: "Hypertension",
  cardiaque: "Problèmes cardiaques",
  enceinte: "Enceinte",
  anticoagulant: "Traitement anticoagulant",
};

function buildWalkInAntecedentsText(
  allergies: string,
  flags: Record<Exclude<MedCheckboxId, "aucun">, boolean>,
): string | null {
  const lines: string[] = [];
  const al = allergies.trim();
  if (al) lines.push(`Allergies connues : ${al}`);
  const conds = (
    Object.entries(flags) as [
      Exclude<MedCheckboxId, "aucun">,
      boolean,
    ][]
  )
    .filter(([, v]) => v)
    .map(([k]) => MED_CHECKBOX_LABELS[k]);
  if (conds.length) lines.push(`Antécédents : ${conds.join(", ")}`);
  if (lines.length === 0) return null;
  return lines.join("\n");
}

/* ───────────── Modal patient sans rendez-vous ───────────── */

function WalkInPatientModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (row: ConsultationRow) => void;
}) {
  type PatientEntryMode = "search" | "new";
  const [patientEntryMode, setPatientEntryMode] =
    useState<PatientEntryMode>("search");

  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState<PatientRow[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [selected, setSelected] = useState<PatientRow | null>(null);
  const [motif, setMotif] = useState("");
  const [busy, setBusy] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [npPrenom, setNpPrenom] = useState("");
  const [npNom, setNpNom] = useState("");
  const [npTel, setNpTel] = useState("");
  const [npDob, setNpDob] = useState("");
  const [npSexe, setNpSexe] = useState<"" | "M" | "F">("");
  const [npGroupe, setNpGroupe] = useState<string>("Inconnu");
  const [npAllergies, setNpAllergies] = useState("");
  const [npTraitements, setNpTraitements] = useState("");
  const [npMedFlags, setNpMedFlags] = useState<
    Record<Exclude<MedCheckboxId, "aucun">, boolean>
  >({
    diabete: false,
    hypertension: false,
    cardiaque: false,
    enceinte: false,
    anticoagulant: false,
  });
  const [npAucun, setNpAucun] = useState(false);

  function toggleMedFlag(id: Exclude<MedCheckboxId, "aucun">, checked: boolean) {
    setNpAucun(false);
    setNpMedFlags((prev) => ({ ...prev, [id]: checked }));
  }

  function toggleAucun(checked: boolean) {
    setNpAucun(checked);
    if (checked) {
      setNpMedFlags({
        diabete: false,
        hypertension: false,
        cardiaque: false,
        enceinte: false,
        anticoagulant: false,
      });
    }
  }

  useEffect(() => {
    if (patientEntryMode !== "search" || selected) {
      setSuggestions([]);
      return;
    }
    const q = search.trim();
    if (q.length < 1) {
      setSuggestions([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void (async () => {
        setSearchBusy(true);
        const res = await searchPatientsAutocompleteAction(q, 15);
        setSearchBusy(false);
        if (res.ok) setSuggestions(res.data);
        else showAppToast(res.error);
      })();
    }, 220);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, selected, patientEntryMode]);

  async function submit() {
    const m = motif.trim();
    if (!m) {
      showAppToast("Indiquez un motif de visite.");
      return;
    }

    if (patientEntryMode === "new") {
      const pr = npPrenom.trim();
      const no = npNom.trim();
      if (!pr || !no) {
        showAppToast("Prénom et nom sont obligatoires.");
        return;
      }
      setBusy(true);
      const antecedents = buildWalkInAntecedentsText(npAllergies, npMedFlags);
      const created = await createPatientAction({
        nom: no,
        prenom: pr,
        telephone: npTel.trim() || null,
        date_naissance: npDob.trim() || null,
        sexe: npSexe === "M" || npSexe === "F" ? npSexe : null,
        groupe_sanguin:
          npGroupe === "Inconnu" || !npGroupe ? null : npGroupe,
        antecedents,
        notes: npTraitements.trim() || null,
      });
      if (!created.ok) {
        setBusy(false);
        showAppToast(created.error);
        return;
      }
      const res = await createConsultationAction({
        appointment_id: null,
        patient_id: created.data.id,
        type_acte: m,
      });
      setBusy(false);
      if (res.ok) {
        onCreated(res.data);
        showAppToast(`${pr} ${no} enregistré et ajouté en salle d'attente`);
      } else {
        showAppToast(res.error);
      }
      return;
    }

    if (!selected) {
      showAppToast("Sélectionnez un patient.");
      return;
    }
    setBusy(true);
    const res = await createConsultationAction({
      appointment_id: null,
      patient_id: selected.id,
      type_acte: m,
    });
    setBusy(false);
    if (res.ok) {
      onCreated(res.data);
      showAppToast(`${selected.prenom} ${selected.nom} — arrivée enregistrée`);
    } else {
      showAppToast(res.error);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal
      aria-labelledby="walkin-modal-title"
    >
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] shadow-xl">
        <div className="shrink-0 border-b border-[var(--ds-primary-border)] px-5 py-4">
          <div className="flex items-center justify-between">
            <h3
              id="walkin-modal-title"
              className="text-base font-bold text-[var(--ds-text)]"
            >
              Patient sans rendez-vous
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1 text-[var(--ds-text-muted)] hover:bg-[var(--ds-primary-soft)]"
              aria-label="Fermer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="space-y-4 transition-opacity duration-200 ease-out">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-[var(--ds-text-muted)]">
                Patient
              </label>

              {patientEntryMode === "search" && (
                <div className="space-y-2">
                  {selected ? (
                    <div className="flex items-center justify-between gap-2 rounded-[0.75rem] border border-[var(--ds-border)] bg-[var(--ds-primary-soft)] px-3 py-2">
                      <span className="text-sm font-normal text-[var(--ds-text)]">
                        {selected.prenom} {selected.nom}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(null);
                          setSearch("");
                        }}
                        className="text-xs font-semibold text-[var(--ds-text-muted)] hover:text-[var(--ds-text)]"
                      >
                        Changer
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <input
                        type="search"
                        autoComplete="off"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Rechercher par nom, prénom ou téléphone…"
                        className={WALKIN_INPUT}
                      />
                      {searchBusy && (
                        <p className="absolute right-3 top-3 text-[10px] text-[var(--ds-text-muted)]">
                          …
                        </p>
                      )}
                      {suggestions.length > 0 && (
                        <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-[0.75rem] border border-[var(--ds-border)] bg-white py-1 shadow-lg">
                          {suggestions.map((p) => (
                            <li key={p.id}>
                              <button
                                type="button"
                                className="w-full px-3 py-2 text-left text-sm font-normal hover:bg-[var(--ds-primary-soft)]"
                                onClick={() => {
                                  setSelected(p);
                                  setSearch("");
                                  setSuggestions([]);
                                }}
                              >
                                <span className="font-medium text-[var(--ds-text)]">
                                  {p.prenom} {p.nom}
                                </span>
                                {p.telephone ? (
                                  <span className="mt-0.5 block text-xs text-[var(--ds-text-muted)]">
                                    {p.telephone}
                                  </span>
                                ) : null}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setPatientEntryMode("new");
                      setSelected(null);
                      setSearch("");
                      setSuggestions([]);
                    }}
                    className="text-sm font-semibold text-[color:var(--ds-primary)] hover:underline"
                  >
                    Nouveau patient
                  </button>
                </div>
              )}

              {patientEntryMode === "new" && (
                <div className="space-y-4">
                  <div className="space-y-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ds-text-muted)]">
                      Identité
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-[var(--ds-text-muted)]">
                          Prénom <span className="text-red-500">*</span>
                        </label>
                        <input
                          className={WALKIN_INPUT}
                          value={npPrenom}
                          onChange={(e) => setNpPrenom(e.target.value)}
                          autoComplete="given-name"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-[var(--ds-text-muted)]">
                          Nom <span className="text-red-500">*</span>
                        </label>
                        <input
                          className={WALKIN_INPUT}
                          value={npNom}
                          onChange={(e) => setNpNom(e.target.value)}
                          autoComplete="family-name"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[var(--ds-text-muted)]">
                        Téléphone
                      </label>
                      <input
                        className={WALKIN_INPUT}
                        type="tel"
                        value={npTel}
                        onChange={(e) => setNpTel(e.target.value)}
                        autoComplete="tel"
                      />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-[var(--ds-text-muted)]">
                          Date de naissance
                        </label>
                        <input
                          className={WALKIN_INPUT}
                          type="text"
                          value={isoToDisplayDate(npDob)}
                          onChange={(e) => {
                            const formatted = formatDateInput(e.target.value);
                            const iso = parseDateToISO(formatted);
                            setNpDob(iso || formatted);
                          }}
                          placeholder="ex: 15/03/1990"
                          maxLength={10}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-[var(--ds-text-muted)]">
                          Sexe
                        </label>
                        <select
                          className={WALKIN_INPUT}
                          value={npSexe}
                          onChange={(e) =>
                            setNpSexe(e.target.value as "" | "M" | "F")
                          }
                        >
                          <option value="">Non précisé</option>
                          <option value="M">Homme</option>
                          <option value="F">Femme</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div
                    className="rounded-2xl border p-4"
                    style={{
                      backgroundColor: "#fff7ed",
                      borderColor: "#fed7aa",
                    }}
                  >
                    <p
                      className="mb-3 text-xs font-medium leading-snug text-[#f97316]"
                      style={{ fontFamily: "Sora, sans-serif" }}
                    >
                      ⚕️ Informations médicales — à vérifier avant soins
                    </p>
                    <div className="space-y-3">
                      <div>
                        <label className="mb-1 block text-xs font-normal text-[var(--ds-text)]">
                          Groupe sanguin
                        </label>
                        <select
                          className={WALKIN_INPUT}
                          value={npGroupe}
                          onChange={(e) => setNpGroupe(e.target.value)}
                        >
                          {BLOOD_GROUPS.map((g) => (
                            <option key={g} value={g}>
                              {g}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-normal text-[var(--ds-text)]">
                          Allergies connues
                        </label>
                        <input
                          className={WALKIN_INPUT}
                          value={npAllergies}
                          onChange={(e) => setNpAllergies(e.target.value)}
                          placeholder="Ex: Pénicilline, latex, anesthésiques..."
                        />
                      </div>
                      <fieldset>
                        <legend className="mb-2 text-xs font-normal text-[var(--ds-text)]">
                          Antécédents
                        </legend>
                        <div className="flex flex-col gap-2">
                          {(
                            Object.keys(MED_CHECKBOX_LABELS) as Exclude<
                              MedCheckboxId,
                              "aucun"
                            >[]
                          ).map((id) => (
                            <label
                              key={id}
                              className="flex cursor-pointer items-center gap-2 text-sm font-normal text-[var(--ds-text)]"
                            >
                              <input
                                type="checkbox"
                                checked={npMedFlags[id]}
                                disabled={npAucun}
                                onChange={(e) =>
                                  toggleMedFlag(id, e.target.checked)
                                }
                                className="rounded border-[var(--ds-border)]"
                              />
                              {MED_CHECKBOX_LABELS[id]}
                            </label>
                          ))}
                          <label className="flex cursor-pointer items-center gap-2 text-sm font-normal text-[var(--ds-text)]">
                            <input
                              type="checkbox"
                              checked={npAucun}
                              onChange={(e) => toggleAucun(e.target.checked)}
                              className="rounded border-[var(--ds-border)]"
                            />
                            Aucun
                          </label>
                        </div>
                      </fieldset>
                      <div>
                        <label className="mb-1 block text-xs font-normal text-[var(--ds-text)]">
                          Traitements en cours
                        </label>
                        <input
                          className={WALKIN_INPUT}
                          value={npTraitements}
                          onChange={(e) => setNpTraitements(e.target.value)}
                          placeholder="Ex: Metformine, Aspirine..."
                        />
                      </div>
                    </div>
                  </div>

                  <p
                    className="text-xs italic text-[var(--ds-text-subtle)]"
                    style={{ fontFamily: "Sora, sans-serif", fontWeight: 400 }}
                  >
                    Le dossier complet pourra être complété après la
                    consultation
                  </p>

                  <button
                    type="button"
                    onClick={() => {
                      setPatientEntryMode("search");
                      setNpPrenom("");
                      setNpNom("");
                      setNpTel("");
                      setNpDob("");
                      setNpSexe("");
                      setNpGroupe("Inconnu");
                      setNpAllergies("");
                      setNpTraitements("");
                      setNpMedFlags({
                        diabete: false,
                        hypertension: false,
                        cardiaque: false,
                        enceinte: false,
                        anticoagulant: false,
                      });
                      setNpAucun(false);
                    }}
                    className="text-sm font-semibold text-[color:var(--ds-primary)] hover:underline"
                  >
                    Retour à la recherche
                  </button>
                </div>
              )}
            </div>

            <div>
              <label
                htmlFor="walkin-motif"
                className="mb-1.5 block text-xs font-semibold text-[var(--ds-text-muted)]"
              >
                Motif de visite
              </label>
              <input
                id="walkin-motif"
                type="text"
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                placeholder="Urgence douleur, Contrôle, Détartrage…"
                className={WALKIN_INPUT}
              />
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-[var(--ds-primary-border)] p-4">
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-[0.75rem] border border-[var(--ds-border)] px-4 py-2 text-sm font-medium text-[var(--ds-text-muted)] hover:bg-[var(--ds-primary-soft)]"
            >
              Annuler
            </button>
            <PrimaryButton
              type="button"
              disabled={busy}
              isLoading={busy}
              onClick={() => void submit()}
              className="rounded-[0.75rem] px-4 py-2 text-sm font-semibold"
            >
              Enregistrer
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}
