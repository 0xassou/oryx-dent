"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  AlertTriangle,
  Bell,
  Calendar,
  Check,
  ClipboardList,
  FlaskConical,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import {
  loadDentalStock,
  STOCK_UPDATED_EVENT,
  type StockLine,
} from "@/utils/stockLogic";
import {
  createPatientQuick,
  DENTAL_PATIENTS_STORAGE_KEY,
  displayPatientName,
  ensurePatientsHydrated,
  readPatientsFromStorage,
} from "@/utils/patientData";
import { syncPatientToDBAction } from "@/app/actions/patients";
import { syncAppointmentToDBAction } from "@/app/actions/appointments";
import {
  appendDirectEntryAppointment,
  DENTAL_APPOINTMENTS_STORAGE_KEY,
  readAppointmentsFromStorage,
} from "@/utils/appointmentData";
import { StatusBadge } from "@/components/laboratoire/StatusBadge";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { WeeklyRevenueChart } from "@/components/dashboard/WeeklyRevenueChart";
import {
  QuickStats,
  RecentPatients,
} from "@/components/dashboard/QuickStatsAndPatients";
import { RecentActivityWidget } from "@/components/dashboard/RecentActivityWidget";
import {
  LAB_COMMANDES_UPDATED_EVENT,
  listLogisticsAlerts,
  readLabCommandesFromStorage,
  type LaboratoireCommande,
} from "@/utils/laboratoireCommandes";

const STER_KEY = "dental_sterilization_data";

const todayLong = new Date().toLocaleDateString("fr-FR", {
  weekday: "long",
  day: "2-digit",
  month: "long",
  year: "numeric",
});

type KitRow = {
  id: string;
  kitType: string;
  status: string;
  numero: number;
};

type SterData = {
  kits?: KitRow[];
  stockByType?: Record<string, { disponible?: number }>;
};

function readSterData(): SterData {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STER_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as SterData;
  } catch {
    return {};
  }
}

function countSterileKitsReady(ster: SterData): number {
  if (ster.stockByType && typeof ster.stockByType === "object") {
    let s = 0;
    for (const id of ["examen", "chirurgie", "endo"] as const) {
      const v = ster.stockByType[id]?.disponible;
      if (typeof v === "number") s += Math.max(0, v);
    }
    return s;
  }
  const kits = ster.kits ?? [];
  return kits.filter((k) => k.status === "sterile").length;
}

function isStockCritical(s: StockLine): boolean {
  if (s.quantiteMax <= 0) return s.quantite <= 0;
  return (s.quantite / s.quantiteMax) * 100 < 50;
}

type FluxStatus = "Terminé" | "En attente" | "Au fauteuil" | "À venir";

type VisitKind = "consultation" | "urgence";

type FluxRow = {
  id: string;
  time: string;
  patient: string;
  act: string;
  status: FluxStatus;
  attenteMin?: number;
  visitKind?: VisitKind;
  /** Lien vers `AppointmentRdv.id` (planning / entrée directe). */
  appointmentId?: string;
};

const FLUX_STORAGE_KEY = "dental_dashboard_flux_daily";

function getLocalDateISO(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatTimeHHmm(d: Date) {
  return d.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function parsePersistedFlux(raw: string | null): FluxRow[] | null {
  if (raw == null || raw === "") return null;
  try {
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object") return null;
    const rec = data as { dateISO?: unknown; rows?: unknown };
    if (typeof rec.dateISO !== "string" || !Array.isArray(rec.rows)) return null;
    if (rec.dateISO !== getLocalDateISO()) return null;
    const out: FluxRow[] = [];
    for (const item of rec.rows) {
      if (
        item &&
        typeof item === "object" &&
        typeof (item as FluxRow).id === "string" &&
        typeof (item as FluxRow).time === "string" &&
        typeof (item as FluxRow).patient === "string" &&
        typeof (item as FluxRow).act === "string" &&
        typeof (item as FluxRow).status === "string"
      ) {
        const r = item as FluxRow;
        const visitKind =
          r.visitKind === "consultation" || r.visitKind === "urgence"
            ? r.visitKind
            : undefined;
        out.push({
          ...r,
          attenteMin:
            typeof r.attenteMin === "number" ? r.attenteMin : undefined,
          visitKind,
          appointmentId:
            typeof r.appointmentId === "string" ? r.appointmentId : undefined,
        });
      }
    }
    return out.length ? out : null;
  } catch {
    return null;
  }
}

function minutesFromHHmm(t: string): number {
  const [h, m] = t.split(":").map((x) => Number(x));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

function mergePlannedAppointmentsIntoFlux(rows: FluxRow[]): FluxRow[] {
  const today = getLocalDateISO();
  const apps = readAppointmentsFromStorage();
  const planned = apps.filter(
    (a) => a.dateKey === today && a.rdvType !== "direct",
  );
  const existingIds = new Set(
    rows.map((r) => r.appointmentId).filter(Boolean) as string[],
  );
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const additions: FluxRow[] = [];
  for (const a of planned) {
    if (existingIds.has(a.id)) continue;
    const slotMin = minutesFromHHmm(a.start);
    const status: FluxStatus =
      nowMin < slotMin ? "À venir" : "En attente";
    additions.push({
      id: `appt-${a.id}`,
      time: a.start,
      patient: a.patient,
      act: a.soin,
      status,
      attenteMin: status === "En attente" ? 0 : undefined,
      visitKind: a.urgence ? "urgence" : "consultation",
      appointmentId: a.id,
    });
  }
  if (additions.length === 0) return sortFluxRowsByTime(rows);
  return sortFluxRowsByTime([...rows, ...additions]);
}

function sortFluxRowsByTime(rows: FluxRow[]): FluxRow[] {
  return [...rows].sort((a, b) =>
    minutesFromHHmm(a.time) - minutesFromHHmm(b.time),
  );
}

function loadFluxRowsForToday(): FluxRow[] {
  if (typeof window === "undefined") return FLUX_INITIAL;
  const parsed = parsePersistedFlux(localStorage.getItem(FLUX_STORAGE_KEY));
  const base = parsed ?? FLUX_INITIAL;
  return mergePlannedAppointmentsIntoFlux(base);
}

const FLUX_INITIAL: FluxRow[] = [];

/** Répartition actes : patients + % (total 120 patients sur 30 j.) */
type ActeChartDatum = {
  name: string;
  value: number;
  pct: number;
  color: string;
};

const ACTES_CHART_FALLBACK: ActeChartDatum[] = [
  { name: "Consultation / Bilan", value: 54, pct: 45, color: "#0ea5e9" },
  { name: "Détartrage", value: 30, pct: 25, color: "#14b8a6" },
  { name: "Composite", value: 18, pct: 15, color: "#8b5cf6" },
  { name: "Endodontie", value: 12, pct: 10, color: "#f59e0b" },
  { name: "Chirurgie", value: 6, pct: 5, color: "#f43f5e" },
];

const ACTES_COLORS = [
  "#7c3aed",
  "#06b6d4",
  "#10b981",
  "#f97316",
  "#f43f5e",
];

function computeActesChartDataFromStorage(): ActeChartDatum[] {
  if (typeof window === "undefined") return ACTES_CHART_FALLBACK;
  try {
    ensurePatientsHydrated();
    const patients = readPatientsFromStorage();
    const actesCount: Record<string, number> = {};
    patients.forEach((p) => {
      const raw = localStorage.getItem(`patient_acts_${p.id}`);
      if (!raw) return;
      try {
        const acts = JSON.parse(raw) as {
          category?: string;
          acte?: string;
        }[];
        if (!Array.isArray(acts)) return;
        acts.forEach((a) => {
          const cat = a.category ?? a.acte ?? "Autre";
          actesCount[cat] = (actesCount[cat] ?? 0) + 1;
        });
      } catch {
        /* ignore */
      }
    });
    const total = Object.values(actesCount).reduce((s, v) => s + v, 0);
    const newActesData = Object.entries(actesCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, value], i) => ({
        name,
        value,
        pct: total > 0 ? Math.round((value / total) * 100) : 0,
        color: ACTES_COLORS[i % ACTES_COLORS.length],
      }));
    return newActesData.length > 0 ? newActesData : ACTES_CHART_FALLBACK;
  } catch {
    return ACTES_CHART_FALLBACK;
  }
}

const TASKS_STORAGE_KEY = "dental_dashboard_tasks";

type DashboardTask = {
  id: number;
  text: string;
  isDone: boolean;
};

const DEFAULT_DASHBOARD_TASKS: DashboardTask[] = [
  {
    id: 1,
    text: "Rappeler Mme Dupont pour son devis d'implant",
    isDone: false,
  },
  {
    id: 2,
    text: "Valider la commande de composite (Stock faible)",
    isDone: false,
  },
  {
    id: 3,
    text: "Confirmer les RDV de demain",
    isDone: false,
  },
];

function parseDashboardTasks(raw: string | null): DashboardTask[] | null {
  if (raw == null || raw === "") return null;
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return null;
    const out: DashboardTask[] = [];
    for (const item of data) {
      if (
        item &&
        typeof item === "object" &&
        typeof (item as DashboardTask).id === "number" &&
        typeof (item as DashboardTask).text === "string" &&
        typeof (item as DashboardTask).isDone === "boolean"
      ) {
        out.push(item as DashboardTask);
      }
    }
    return out;
  } catch {
    return null;
  }
}

function loadDashboardTasks(): DashboardTask[] {
  if (typeof window === "undefined") return DEFAULT_DASHBOARD_TASKS;
  const raw = localStorage.getItem(TASKS_STORAGE_KEY);
  if (raw == null || raw === "") return DEFAULT_DASHBOARD_TASKS;
  const parsed = parseDashboardTasks(raw);
  if (parsed == null) return DEFAULT_DASHBOARD_TASKS;
  return parsed;
}

const RELANCE_PATIENTS = [
  {
    id: "rel1",
    patient: "Mme Dupont",
    motif: "Contrôle annuel — dernier passage il y a 14 mois",
    actionLabel: "Appeler" as const,
  },
  {
    id: "rel2",
    patient: "M. Khelil",
    motif: "Devis Implant — Reste : 25 000 DA",
    actionLabel: "Relancer" as const,
  },
  {
    id: "rel3",
    patient: "Mme Saïd",
    motif: "Facture impayée — échéance dépassée",
    actionLabel: "Relancer" as const,
  },
] as const;

function PremiumBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={[
        "inline-flex items-center gap-0.5 rounded-full border border-[var(--ds-primary-border)] bg-[var(--ds-primary-soft)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--ds-primary)] lg:px-2 lg:text-xs",
        className,
      ].join(" ")}
    >
      <Sparkles className="h-3 w-3" />
      Premium
    </span>
  );
}

function ActesTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: ActeChartDatum }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  if (!d) return null;
  return (
    <div className="rounded-lg border border-slate-700/80 bg-slate-900 px-3.5 py-2.5 text-left shadow-xl">
      <p className="text-[13px] font-semibold text-white">{d.name}</p>
      <p className="mt-1 text-xs text-slate-300">
        {d.value} patient{d.value > 1 ? "s" : ""} ({d.pct}%)
      </p>
    </div>
  );
}

function ActesDoughnutChart({ data }: { data: ActeChartDatum[] }) {
  const totalPatients = data.reduce((a, b) => a + b.value, 0);
  return (
    <div className="flex min-w-0 w-full flex-col items-center">
      <ResponsiveContainer width="100%" height={250}>
        <PieChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
          <Pie
            data={data as ActeChartDatum[]}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={58}
            outerRadius={88}
            paddingAngle={2}
            stroke="none"
          >
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={entry.color}
                className="cursor-pointer outline-none transition-opacity hover:opacity-90 focus:opacity-90"
              />
            ))}
          </Pie>
          <Tooltip
            content={<ActesTooltip />}
            cursor={{ fill: "transparent" }}
          />
        </PieChart>
      </ResponsiveContainer>
      <ul className="mt-4 w-full space-y-2 border-t border-[var(--ds-primary-border)] pt-4">
        {data.map((s) => (
          <li
            key={s.name}
            className="flex items-center justify-between gap-2 text-xs"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              <span className="truncate text-[var(--ds-text-muted)]">{s.name}</span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums text-[var(--ds-text)]">
              {s.pct}%
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-center text-[10px] text-[var(--ds-text-muted)]">
        {totalPatients} patients sur 30 j.
      </p>
    </div>
  );
}

type DirectEntryMode = "existing" | "quick";

type DirectEntryPayload =
  | {
      mode: "existing";
      visitKind: VisitKind;
      patientId: string;
      patientLabel: string;
    }
  | {
      mode: "quick";
      visitKind: VisitKind;
      prenom: string;
      nom: string;
      telephone: string;
      medicalNote?: string;
    };

function DirectEntryModal({
  open,
  onClose,
  onAdd,
  candidates,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (payload: DirectEntryPayload) => void;
  candidates: { id: string; nom: string }[];
}) {
  const [mode, setMode] = useState<DirectEntryMode>("existing");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [medicalNote, setMedicalNote] = useState("");
  const [visitKind, setVisitKind] = useState<VisitKind | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode("existing");
    setSearch("");
    setSelectedId(null);
    setNom("");
    setPrenom("");
    setTelephone("");
    setMedicalNote("");
    setVisitKind(null);
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((p) => p.nom.toLowerCase().includes(q));
  }, [search, candidates]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (visitKind == null) return;
    if (mode === "existing") {
      const p = candidates.find((x) => x.id === selectedId);
      if (!p) return;
      onAdd({
        mode: "existing",
        visitKind,
        patientId: p.id,
        patientLabel: p.nom,
      });
      onClose();
      return;
    }
    const n = nom.trim();
    const pr = prenom.trim();
    const tel = telephone.trim();
    if (!n || !pr || !tel) return;
    const note = medicalNote.trim();
    onAdd({
      mode: "quick",
      visitKind,
      prenom: pr,
      nom: n,
      telephone: tel,
      ...(note ? { medicalNote: note } : {}),
    });
    onClose();
  }

  const canSubmit =
    visitKind != null &&
    (mode === "existing"
      ? selectedId != null
      : nom.trim().length > 0 &&
        prenom.trim().length > 0 &&
        telephone.trim().length > 0);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="direct-entry-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Fermer"
      />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="direct-entry-title"
              className="text-lg font-semibold text-[var(--ds-text)]"
            >
              Entrée directe
            </h2>
            <p className="mt-1 text-sm text-[var(--ds-text-muted)]">
              Ajout au flux du jour et au planning (créneau marqué « Direct »,
              heure actuelle).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--ds-text-muted)] transition-colors hover:bg-[var(--ds-primary-soft)] hover:text-[var(--ds-text)]"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 flex gap-2 rounded-xl bg-[var(--ds-primary-soft)] p-1">
          <button
            type="button"
            onClick={() => setMode("existing")}
            className={[
              "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              mode === "existing"
                ? "bg-[var(--ds-surface)] text-[var(--ds-text)] shadow-sm"
                : "text-[var(--ds-text-muted)] hover:text-[var(--ds-text)]",
            ].join(" ")}
          >
            Patient existant
          </button>
          <button
            type="button"
            onClick={() => setMode("quick")}
            className={[
              "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              mode === "quick"
                ? "bg-[var(--ds-surface)] text-[var(--ds-text)] shadow-sm"
                : "text-[var(--ds-text-muted)] hover:text-[var(--ds-text)]",
            ].join(" ")}
          >
            Nouveau patient rapide
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <p className="text-xs font-medium text-[var(--ds-text-muted)]">
              Type de visite <span className="text-red-500">*</span>
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setVisitKind("consultation")}
                className={[
                  "flex-1 min-w-[140px] rounded-xl border-2 px-3 py-2.5 text-sm font-semibold transition-colors",
                  visitKind === "consultation"
                    ? "border-[var(--ds-primary)] bg-[var(--ds-primary-soft)] text-[var(--ds-primary-hover)] ring-2 ring-[var(--ds-primary-border)]"
                    : "border-[var(--ds-primary-border)] bg-[var(--ds-surface)] text-[var(--ds-text-muted)] hover:border-[var(--ds-primary-border)] hover:bg-[var(--ds-primary-soft)]/50",
                ].join(" ")}
              >
                Consultation <span aria-hidden>🔵</span>
              </button>
              <button
                type="button"
                onClick={() => setVisitKind("urgence")}
                className={[
                  "flex-1 min-w-[140px] rounded-xl border-2 px-3 py-2.5 text-sm font-semibold transition-colors",
                  visitKind === "urgence"
                    ? "border-red-500 bg-red-50 text-red-900 ring-2 ring-red-200"
                    : "border-[var(--ds-primary-border)] bg-[var(--ds-surface)] text-[var(--ds-text-muted)] hover:border-red-200 hover:bg-red-50/50",
                ].join(" ")}
              >
                Urgence <span aria-hidden>🔴</span>
              </button>
            </div>
          </div>

          {mode === "existing" ? (
            <>
              <div>
                <label
                  htmlFor="direct-entry-search"
                  className="text-xs font-medium text-[var(--ds-text-muted)]"
                >
                  Rechercher un patient
                </label>
                <div className="relative mt-1.5">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-text-muted)]" />
                  <input
                    id="direct-entry-search"
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Nom, prénom…"
                    className="w-full rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] py-2.5 pl-10 pr-3 text-sm outline-none ring-[var(--ds-primary-border)] focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary-border)]"
                    autoComplete="off"
                  />
                </div>
              </div>
              <ul className="max-h-44 overflow-y-auto rounded-xl border border-[var(--ds-primary-border)]">
                {filtered.length === 0 ? (
                  <li className="px-4 py-6 text-center text-sm text-[var(--ds-text-muted)]">
                    Aucun patient ne correspond.
                  </li>
                ) : (
                  filtered.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(p.id)}
                        className={[
                          "flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors",
                          selectedId === p.id
                            ? "bg-[var(--ds-primary-soft)] font-medium text-[var(--ds-primary-hover)]"
                            : "text-[var(--ds-text)] hover:bg-[var(--ds-bg)]",
                        ].join(" ")}
                      >
                        {p.nom}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </>
          ) : (
            <div className="space-y-3">
              <div>
                <label
                  htmlFor="quick-nom"
                  className="text-xs font-medium text-[var(--ds-text-muted)]"
                >
                  Nom
                </label>
                <input
                  id="quick-nom"
                  type="text"
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-[var(--ds-primary-border)] px-3 py-2 text-sm outline-none focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary-border)]"
                  autoComplete="family-name"
                />
              </div>
              <div>
                <label
                  htmlFor="quick-prenom"
                  className="text-xs font-medium text-[var(--ds-text-muted)]"
                >
                  Prénom
                </label>
                <input
                  id="quick-prenom"
                  type="text"
                  value={prenom}
                  onChange={(e) => setPrenom(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-[var(--ds-primary-border)] px-3 py-2 text-sm outline-none focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary-border)]"
                  autoComplete="given-name"
                />
              </div>
              <div>
                <label
                  htmlFor="quick-tel"
                  className="text-xs font-medium text-[var(--ds-text-muted)]"
                >
                  Téléphone
                </label>
                <input
                  id="quick-tel"
                  type="tel"
                  value={telephone}
                  onChange={(e) => setTelephone(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-[var(--ds-primary-border)] px-3 py-2 text-sm outline-none focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary-border)]"
                  autoComplete="tel"
                />
              </div>
              <div>
                <label
                  htmlFor="quick-med-note"
                  className="text-xs font-medium text-[var(--ds-text-muted)]"
                >
                  Note médicale (optionnel)
                </label>
                <p className="mt-0.5 text-[11px] text-[var(--ds-text-muted)]">
                  Allergies, antécédents…
                </p>
                <textarea
                  id="quick-med-note"
                  value={medicalNote}
                  onChange={(e) => setMedicalNote(e.target.value)}
                  rows={2}
                  placeholder="Ex. allergie pénicilline"
                  className="mt-1.5 w-full resize-y rounded-xl border border-[var(--ds-primary-border)] px-3 py-2 text-sm outline-none focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary-border)]"
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--ds-primary-border)] pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-4 py-2 text-sm font-medium text-[var(--ds-text)] transition-colors hover:bg-[var(--ds-primary-soft)]"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Ajouter au flux
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function getDoctorName() {
  if (typeof window === "undefined")
    return { nom: "Assil", initiales: "A" };
  try {
    const s = JSON.parse(
      localStorage.getItem("dental_settings") ?? "{}",
    ) as Record<string, unknown>;
    const prenom =
      typeof s.praticienPrenom === "string" ? s.praticienPrenom : "";
    const nom =
      typeof s.praticienNom === "string" ? s.praticienNom : "Assil";
    const initiales = [prenom, nom]
      .filter(Boolean)
      .map((n) => n.charAt(0).toUpperCase())
      .join("");
    return {
      nom: prenom ? `${prenom} ${nom}` : nom,
      initiales: initiales || "A",
    };
  } catch {
    return { nom: "Assil", initiales: "A" };
  }
}

export default function DashboardPage() {
  const router = useRouter();
  const annulationsCount = 0;
  const [mounted, setMounted] = useState(false);
  const [doctorInfo, setDoctorInfo] = useState({
    nom: "Assil",
    initiales: "A",
  });
  const [sterileTotal, setSterileTotal] = useState(0);
  const [stockCriticalCount, setStockCriticalCount] = useState(0);
  const [fluxRows, setFluxRows] = useState<FluxRow[]>(FLUX_INITIAL);
  const [directEntryOpen, setDirectEntryOpen] = useState(false);
  const [tasks, setTasks] = useState<DashboardTask[]>([]);
  const [newTaskText, setNewTaskText] = useState("");
  const [fluxPatientCandidates, setFluxPatientCandidates] = useState<
    { id: string; nom: string }[]
  >([]);
  const [labCommandes, setLabCommandes] = useState<LaboratoireCommande[]>([]);
  const [rdvCount, setRdvCount] = useState(0);
  const [rdvToConfirmCount, setRdvToConfirmCount] = useState(0);
  const [patientCount, setPatientCount] = useState(0);
  const [patientsThisMonthCount, setPatientsThisMonthCount] = useState(0);
  const [actesChartData, setActesChartData] = useState<ActeChartDatum[]>(
    ACTES_CHART_FALLBACK,
  );

  const logisticsAlerts = useMemo(
    () => listLogisticsAlerts(labCommandes),
    [labCommandes],
  );

  const refreshFluxPatientCandidates = useCallback(() => {
    ensurePatientsHydrated();
    setFluxPatientCandidates(
      readPatientsFromStorage().map((p) => ({
        id: p.id,
        nom: displayPatientName(p),
      })),
    );
  }, []);

  useEffect(() => {
    setDoctorInfo(getDoctorName());
  }, []);

  useEffect(() => {
    setMounted(true);
    setFluxRows(loadFluxRowsForToday());
    setTasks(loadDashboardTasks());
    const ster = readSterData();
    setSterileTotal(countSterileKitsReady(ster));
    const stock = loadDentalStock();
    setStockCriticalCount(stock.filter(isStockCritical).length);
    refreshFluxPatientCandidates();

    const todayKey = getLocalDateISO();
    const appointments = readAppointmentsFromStorage();
    setRdvCount(appointments.filter((a) => a.dateKey === todayKey).length);

    let toConfirm = 0;
    try {
      const rawApps = localStorage.getItem(DENTAL_APPOINTMENTS_STORAGE_KEY);
      if (rawApps) {
        const data = JSON.parse(rawApps) as unknown;
        if (Array.isArray(data)) {
          for (const item of data) {
            if (!item || typeof item !== "object") continue;
            const o = item as Record<string, unknown>;
            const dateKey =
              typeof o.dateKey === "string" ? o.dateKey.trim() : "";
            if (dateKey !== todayKey) continue;
            const status =
              typeof o.status === "string" ? o.status : "";
            if (status === "pending" || o.confirmed === false) {
              toConfirm++;
            }
          }
        }
      }
    } catch {
      /* ignore */
    }
    setRdvToConfirmCount(toConfirm);

    const patients = readPatientsFromStorage();
    setPatientCount(patients.length);

    let createdThisMonth = 0;
    try {
      const rawPts = localStorage.getItem(DENTAL_PATIENTS_STORAGE_KEY);
      if (rawPts) {
        const data = JSON.parse(rawPts) as unknown;
        if (Array.isArray(data)) {
          const now = new Date();
          const y = now.getFullYear();
          const m = now.getMonth();
          for (const item of data) {
            if (!item || typeof item !== "object") continue;
            const createdAt = (item as Record<string, unknown>).createdAt;
            if (typeof createdAt !== "string") continue;
            const d = new Date(createdAt);
            if (Number.isNaN(d.getTime())) continue;
            if (d.getFullYear() === y && d.getMonth() === m) {
              createdThisMonth++;
            }
          }
        }
      }
    } catch {
      /* ignore */
    }
    setPatientsThisMonthCount(createdThisMonth);

    setActesChartData(computeActesChartDataFromStorage());
  }, [refreshFluxPatientCandidates]);

  useEffect(() => {
    if (!mounted) return;
    function refreshLab() {
      setLabCommandes(readLabCommandesFromStorage());
    }
    refreshLab();
    window.addEventListener(LAB_COMMANDES_UPDATED_EVENT, refreshLab);
    window.addEventListener("focus", refreshLab);
    return () => {
      window.removeEventListener(LAB_COMMANDES_UPDATED_EVENT, refreshLab);
      window.removeEventListener("focus", refreshLab);
    };
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    function refreshStock() {
      const stock = loadDentalStock();
      const criticals = stock.filter(isStockCritical);
      setStockCriticalCount(criticals.length);
    }
    refreshStock();
    window.addEventListener(STOCK_UPDATED_EVENT, refreshStock);
    window.addEventListener("focus", refreshStock);
    return () => {
      window.removeEventListener(STOCK_UPDATED_EVENT, refreshStock);
      window.removeEventListener("focus", refreshStock);
    };
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
  }, [mounted, tasks]);

  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(
        FLUX_STORAGE_KEY,
        JSON.stringify({
          dateISO: getLocalDateISO(),
          rows: fluxRows,
        }),
      );
    } catch {
      /* ignore quota */
    }
  }, [mounted, fluxRows]);

  function addDirectEntryToFlux(payload: DirectEntryPayload) {
    let patientLabel: string;
    let patientId: string | undefined;
    if (payload.mode === "quick") {
      const rec = createPatientQuick({
        prenom: payload.prenom,
        nom: payload.nom,
        telephone: payload.telephone,
        medicalNote: payload.medicalNote,
      });
      patientLabel = displayPatientName(rec);
      patientId = rec.id;
      refreshFluxPatientCandidates();
      syncPatientToDBAction({
        id: rec.id,
        prenom: rec.prenom,
        nom: rec.nom,
        telephone: rec.telephone,
      }).catch(console.error);
    } else {
      patientLabel = payload.patientLabel;
      patientId = payload.patientId;
    }
    const rdv = appendDirectEntryAppointment({
      patientName: patientLabel,
      patientId: patientId ?? null,
      visitKind: payload.visitKind,
    });
    syncAppointmentToDBAction({
      id: rdv.id,
      patientId: rdv.patientId,
      patientName: rdv.patient,
      dateKey: rdv.dateKey,
      startTime: rdv.start,
      durationMinutes: rdv.durationMinutes,
      soin: rdv.soin,
      rdvType: rdv.rdvType,
      status: rdv.status,
      urgence: rdv.urgence,
    }).catch(console.error);
    const row: FluxRow = {
      id: `flux-${rdv.id}`,
      time: rdv.start,
      patient: patientLabel,
      act: rdv.soin,
      status: "En attente",
      attenteMin: 0,
      visitKind: payload.visitKind,
      appointmentId: rdv.id,
    };
    setFluxRows((prev) =>
      mergePlannedAppointmentsIntoFlux([row, ...prev]),
    );
  }

  function addTask() {
    const trimmed = newTaskText.trim();
    if (!trimmed) return;
    setTasks((prev) => [
      ...prev,
      { id: Date.now(), text: trimmed, isDone: false },
    ]);
    setNewTaskText("");
  }

  function toggleTask(id: number) {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, isDone: !t.isDone } : t,
      ),
    );
  }

  const firstWaiting = useMemo(
    () => fluxRows.find((r) => r.status === "En attente"),
    [fluxRows],
  );

  function passAuFauteuil(id: string) {
    setFluxRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, status: "Au fauteuil" as FluxStatus, attenteMin: undefined }
          : r,
      ),
    );
  }

  if (!mounted) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center bg-[var(--ds-bg)] p-6">
        <p className="text-sm text-[var(--ds-text-muted)]">Chargement du tableau de bord…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col gap-4 bg-[#faf9ff] p-6">
      {/* ── En-tête ───────────────────────────────────────────────────── */}
      <div className="rounded-3xl border border-[var(--ds-primary-border)]/80 bg-[var(--ds-surface)] p-4 shadow-sm lg:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--ds-primary)] text-sm font-semibold tracking-tight text-white shadow-lg shadow-[color-mix(in_srgb,var(--ds-primary)_20%,transparent)] lg:h-12 lg:w-12 lg:text-base">
              {doctorInfo.initiales}
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[color:var(--ds-text)]">
                Bonjour, Dr. {doctorInfo.nom}
              </h1>
              <p className="mt-1 text-sm text-[var(--ds-text-muted)]">{todayLong}</p>
            </div>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-100/80 lg:px-4 lg:text-sm">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            Cabinet Ouvert
          </span>
        </div>
      </div>

      {/* ── KPI 4 colonnes (KpiCard design system) ───────────────────── */}
      <div className="grid grid-cols-4 gap-3">
        <KpiCard
          kpi="rdv"
          label="RDV du jour"
          value={rdvCount}
          change={`${rdvToConfirmCount} à confirmer`}
          icon={<Calendar />}
        />
        <KpiCard
          kpi="patients"
          label="Nouveaux patients"
          value={patientCount}
          change={`+${patientsThisMonthCount} ce mois-ci`}
          icon={<Users />}
        />
        <Link
          href="/sterilisation"
          className="block rounded-xl transition-opacity hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed] focus-visible:ring-offset-2"
        >
          <KpiCard
            kpi="kits"
            label="Kits stériles"
            value={sterileTotal}
            change="Module stérilisation"
            icon={<ShieldCheck />}
          />
        </Link>
        <Link
          href="/stocks"
          className="block rounded-xl transition-opacity hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed] focus-visible:ring-offset-2"
        >
          <KpiCard
            kpi="stock"
            stockAlertCount={stockCriticalCount}
            label="Stock faible"
            value={stockCriticalCount}
            unit="alertes"
            change="Sous le seuil sécurité"
            icon={<AlertTriangle />}
          />
        </Link>
      </div>

      {logisticsAlerts.length > 0 ? (
        <div className="rounded-2xl border border-amber-200/90 bg-gradient-to-br from-amber-50 to-orange-50/80 p-5 shadow-sm">
          <div className="flex flex-wrap items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <AlertTriangle className="h-5 w-5" strokeWidth={2.25} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-amber-950">
                Alertes logistiques
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-amber-900/80">
                Pose prévue dans les 48 h alors que la prothèse n&apos;est pas
                encore au statut « Reçu au cabinet ».
              </p>
              <ul className="mt-4 space-y-2">
                {logisticsAlerts.map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200/80 bg-[var(--ds-surface)]/90 px-3 py-2.5 text-sm text-amber-950"
                  >
                    <span className="font-medium">
                      {c.patient}
                      <span className="font-normal text-amber-800/90">
                        {" "}
                        — {c.travail}
                      </span>
                    </span>
                    <Link
                      href="/laboratoire"
                      className="shrink-0 text-xs font-semibold text-amber-800 underline-offset-2 hover:underline"
                    >
                      Voir le labo →
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Flux de la journée — pleine largeur ───────────────────────── */}
      <div className="rounded-3xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-6 shadow-sm">
            <div className="mb-5 flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <h2 className="text-base font-semibold tracking-tight text-[color:var(--ds-text)]">
                  Flux de la journée
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    refreshFluxPatientCandidates();
                    setDirectEntryOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-primary-soft)] px-3 py-1.5 text-xs font-semibold text-[color:var(--ds-primary)] transition-colors hover:bg-[var(--ds-primary)] hover:text-white"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                  + Entrée Directe
                </button>
              </div>
              <Link
                href="/planning"
                className="hidden text-xs font-medium text-[var(--ds-text-muted)] transition-colors hover:text-[color:var(--ds-primary)] lg:block"
              >
                Planning complet →
              </Link>
            </div>

            <DirectEntryModal
              open={directEntryOpen}
              onClose={() => setDirectEntryOpen(false)}
              onAdd={addDirectEntryToFlux}
              candidates={fluxPatientCandidates}
            />

            <p className="mb-4 text-xs text-[var(--ds-text-muted)]">
              Rendez-vous actifs — file et fauteuil
            </p>

            {fluxRows.length === 0 ? (
              <div className="py-12 text-center text-sm text-[var(--ds-text-muted)]">
                Aucun rendez-vous aujourd&apos;hui
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-[var(--ds-primary-border)]/80">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b border-[var(--ds-primary-border)] bg-[var(--ds-bg)]/50 text-left">
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--ds-text-muted)]">
                        Heure
                      </th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--ds-text-muted)]">
                        Patient
                      </th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--ds-text-muted)]">
                        Acte prévu
                      </th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--ds-text-muted)]">
                        Statut
                      </th>
                      <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--ds-text-muted)]">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {fluxRows.map((row) => {
                      const badgeClass =
                        row.status === "Terminé"
                          ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                          : row.status === "En attente"
                            ? "bg-[var(--ds-primary-soft)] text-[var(--ds-primary-hover)] ring-[var(--ds-primary-border)]"
                            : row.status === "Au fauteuil"
                              ? "bg-amber-50 text-amber-900 ring-amber-100"
                              : "bg-[var(--ds-bg)] text-[var(--ds-text-muted)] ring-[var(--ds-primary-border)]";
                      const badgeText =
                        row.status === "En attente"
                          ? `En attente${row.attenteMin != null && row.attenteMin > 0 ? ` — ${row.attenteMin} min` : ""}`
                          : row.status === "À venir"
                            ? "À venir"
                            : row.status;
                      return (
                        <tr
                          key={row.id}
                          className="border-b border-[var(--ds-primary-border)] transition-colors last:border-0 hover:bg-[var(--ds-primary-soft)]/40"
                        >
                          <td className="px-4 py-3 font-medium tabular-nums text-[var(--ds-text-muted)]">
                            {row.time}
                          </td>
                          <td className="px-4 py-3 font-medium text-[var(--ds-text)]">
                            <span className="inline-flex flex-wrap items-center gap-2">
                              <span>{row.patient}</span>
                              {row.status === "En attente" &&
                                row.visitKind != null && (
                                  <span
                                    className={[
                                      "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                                      row.visitKind === "urgence"
                                        ? "bg-red-100 text-red-800 ring-1 ring-red-200/80"
                                        : "bg-[var(--ds-primary-border)] text-[var(--ds-primary-hover)] ring-1 ring-[var(--ds-primary-border)]/80",
                                    ].join(" ")}
                                  >
                                    {row.visitKind === "urgence"
                                      ? "Urgence"
                                      : "Consultation"}
                                  </span>
                                )}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-[var(--ds-text-muted)]">{row.act}</td>
                          <td className="px-4 py-3">
                            <span
                              className={[
                                "inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1",
                                badgeClass,
                              ].join(" ")}
                            >
                              {badgeText}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {row.status === "En attente" ? (
                              <button
                                type="button"
                                onClick={() => passAuFauteuil(row.id)}
                                className="rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-primary-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--ds-primary-hover)] shadow-sm transition-colors hover:bg-[var(--ds-primary-border)]"
                              >
                                Passer au fauteuil
                              </button>
                            ) : row.status === "Au fauteuil" ? (
                              <span className="text-xs text-[var(--ds-text-muted)]">—</span>
                            ) : (
                              <span className="text-xs text-[var(--ds-text-muted)]">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {firstWaiting && (
              <p className="mt-4 text-[11px] text-[var(--ds-text-muted)]">
                Prochain en attente :{" "}
                <span className="font-medium text-[var(--ds-text-muted)]">
                  {firstWaiting.patient}
                </span>
              </p>
            )}

      </div>

      <div className="grid grid-cols-1 gap-4 items-start lg:grid-cols-[1fr_380px]">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                  <div className="mb-3 flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 shrink-0 text-[color:var(--ds-primary)]" />
                    <span className="text-[13px] font-semibold text-[var(--ds-text)]">
                      Actions Prioritaires
                    </span>
                  </div>
                  <div className="mt-4 flex items-center gap-2 rounded-lg bg-[var(--ds-bg)] px-3 py-2.5">
                    <input
                      type="text"
                      value={newTaskText}
                      onChange={(e) => setNewTaskText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addTask();
                        }
                      }}
                      placeholder="Ajouter une tâche…"
                      className="min-w-0 flex-1 bg-transparent text-sm text-[var(--ds-text)] outline-none placeholder:text-[var(--ds-text-muted)]"
                      aria-label="Nouvelle tâche"
                    />
                    <button
                      type="button"
                      onClick={addTask}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--ds-text-muted)] transition-colors hover:bg-[var(--ds-surface)]/80 hover:text-[var(--ds-text)]"
                      aria-label="Ajouter une tâche"
                    >
                      <Plus className="h-4 w-4" strokeWidth={2.25} />
                    </button>
                  </div>
                  <div className="mt-4 border-t border-[var(--ds-primary-border)] pt-4">
                    <ul className="space-y-2">
                      {tasks.map((t) => (
                        <li key={t.id}>
                          <button
                            type="button"
                            aria-pressed={t.isDone}
                            onClick={() => toggleTask(t.id)}
                            className="flex w-full cursor-pointer items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-[var(--ds-primary-soft)]"
                          >
                            <span
                              className={[
                                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                                t.isDone
                                  ? "border-[var(--ds-primary)] bg-[var(--ds-primary)]"
                                  : "border-[var(--ds-primary-border)] bg-transparent",
                              ].join(" ")}
                              aria-hidden
                            >
                              {t.isDone ? (
                                <Check
                                  className="h-3 w-3 text-[var(--ds-bg)]"
                                  strokeWidth={3}
                                />
                              ) : null}
                            </span>
                            <span
                              className={[
                                "text-sm leading-snug text-[var(--ds-text)]",
                                t.isDone ? "text-[var(--ds-text-muted)] line-through" : "",
                              ].join(" ")}
                            >
                              {t.text}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                  <div className="mb-3 flex items-center gap-2">
                    <Bell className="h-4 w-4 shrink-0 text-[color:var(--ds-primary)]" />
                    <span className="text-[13px] font-semibold text-[var(--ds-text)]">
                      À recontacter
                    </span>
                  </div>
                  <div className="mt-4 space-y-3">
                    {RELANCE_PATIENTS.map((r) => (
                      <div
                        key={r.id}
                        className="flex items-center gap-3 rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-[var(--ds-text)]">
                            {r.patient}
                          </p>
                          <p className="mt-1 text-xs leading-relaxed text-[var(--ds-text-muted)]">
                            {r.motif}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="shrink-0 rounded-full border border-[var(--ds-border-strong)] bg-[var(--ds-primary-soft)] px-4 py-1.5 text-[12px] font-semibold text-[var(--ds-primary-hover)] transition-colors hover:bg-[var(--ds-bg)]"
                        >
                          {r.actionLabel}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

          <RecentActivityWidget />
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-3xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
              Répartition des actes
            </h3>
            <p className="mt-1 text-xs text-[var(--ds-text-muted)]">Volume estimé (30 j.)</p>
            <div className="mt-6 flex justify-center">
              <ActesDoughnutChart data={actesChartData} />
            </div>
          </div>

          <WeeklyRevenueChart badgeLabel="▲ 12%" />
          <QuickStats
            stats={[
              { value: "98%", label: "Satisfaction", colorVar: "var(--ds-primary)" },
              { value: "24 min", label: "Durée moy.", colorVar: "var(--ds-primary-hover)" },
              {
                value: annulationsCount.toString(),
                label: "Annulations",
                colorVar: "var(--ds-text-muted)",
              },
            ]}
          />
          <RecentPatients
            onViewAll={() => {
              router.push("/patients");
            }}
          />

          <div className="flex-1 rounded-3xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                Suivi laboratoire
              </h3>
              <PremiumBadge />
            </div>
            <p className="mt-1 text-xs text-[var(--ds-text-muted)]">Travaux externes</p>

            <div className="mt-5 flex flex-col gap-3">
              {labCommandes.length === 0 ? (
                <p className="text-xs text-[var(--ds-text-muted)]">
                  Aucune commande en cours.
                </p>
              ) : (
                labCommandes.slice(0, 3).map((row) => {
                  const retourD = (() => {
                    const [y, m, d] = row.retourIso.split("-").map(Number);
                    const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
                    if (Number.isNaN(dt.getTime())) return "—";
                    return dt.toLocaleDateString("fr-FR", {
                      day: "2-digit",
                      month: "short",
                    });
                  })();
                  return (
                    <div
                      key={row.id}
                      className="flex items-center gap-3 rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-bg)]/50 p-3 transition-colors hover:bg-[var(--ds-primary-soft)]/80"
                    >
                      <FlaskConical
                        className="h-4 w-4 shrink-0 text-[var(--ds-text-muted)]"
                        strokeWidth={1.75}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[var(--ds-text)]">
                          {row.patient}
                          <span className="text-[var(--ds-text-muted)]"> · </span>
                          {row.travail}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--ds-text-muted)]">
                          Retour prévu {retourD}
                        </p>
                      </div>
                    <StatusBadge statut={row.statut} className="shrink-0" />
                    </div>
                  );
                })
              )}
            </div>

            <Link
              href="/laboratoire"
              className="mt-4 block w-full rounded-lg py-2 text-center text-sm font-medium text-[var(--ds-primary)] transition-colors hover:bg-[var(--ds-primary-soft)]"
            >
              Voir le laboratoire →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
