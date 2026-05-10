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
  Star,
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
  STOCK_UPDATED_EVENT,
} from "@/utils/stockLogic";
import { getStocksAction } from "@/app/actions/stocks";
import { getFacturesByDateAction } from "@/app/actions/factures";
import { FACTURES_UPDATED_EVENT } from "@/utils/factureDocuments";
import {
  createPatientAction,
  getPatientsAction,
} from "@/app/actions/patients";
import {
  displayPatientName,
  initializeEmptyDentalChart,
  patientRowToDentalPatientRecord,
  writeMinimalPatientProfile,
  capitalizeStoragePart,
  type DentalPatientRecord,
} from "@/utils/patientData";
import { toTitleCase } from "@/utils/formatters";
import {
  createAppointmentAction,
  getAppointmentsByDateAction,
} from "@/app/actions/appointments";
import {
  APPOINTMENTS_UPDATED_EVENT,
  appointmentJoinedRowToRdv,
  buildDirectEntryAppointmentPreview,
  composeAppointmentNotes,
  notifyAppointmentsUpdated,
  statutDbFromUi,
  type AppointmentRdv,
} from "@/utils/appointmentData";
import { StatusBadge } from "@/components/laboratoire/StatusBadge";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { WeeklyRevenueChart } from "@/components/dashboard/WeeklyRevenueChart";
import {
  QuickStats,
  RecentPatients,
} from "@/components/dashboard/QuickStatsAndPatients";
import { TeamActivityFeed } from "@/components/dashboard/TeamActivityFeed";
import {
  getDashboardActesDistributionAction,
  getDashboardStatsAction,
} from "@/app/actions/dashboard";
import { getCommandesLaboAction } from "@/app/actions/laboratoire";
import {
  getCabinetBlob,
  getCabinetValue,
  persistCabinetPartial,
} from "@/lib/client/cabinetBlob";
import {
  LAB_COMMANDES_UPDATED_EVENT,
  listLogisticsAlerts,
  mapServerCommandeLaboToUi,
  type LaboratoireCommande,
} from "@/utils/laboratoireCommandes";
import { DashboardKpiSkeleton } from "@/components/ui/page-skeletons";

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
  return getCabinetValue<SterData>(STER_KEY) ?? {};
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

function mergePlannedAppointmentsIntoFlux(
  rows: FluxRow[],
  todaysPlans: AppointmentRdv[],
): FluxRow[] {
  const planned = todaysPlans.filter((a) => a.rdvType !== "direct");
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

function mapActesDistributionToChart(
  rows: { name: string; value: number }[],
): ActeChartDatum[] {
  if (!rows.length) return ACTES_CHART_FALLBACK;
  const total = rows.reduce((s, r) => s + r.value, 0);
  return rows.slice(0, 5).map((r, i) => ({
    name: r.name,
    value: r.value,
    pct: total > 0 ? Math.round((r.value / total) * 100) : 0,
    color: ACTES_COLORS[i % ACTES_COLORS.length],
  }));
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
  const v = getCabinetValue<unknown>(TASKS_STORAGE_KEY);
  if (v == null) return DEFAULT_DASHBOARD_TASKS;
  const raw = typeof v === "string" ? v : JSON.stringify(v);
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
      <Star className="h-3 w-3" />
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

  if (totalPatients === 0) {
    return (
      <div className="flex w-full flex-col items-center justify-center py-10 text-center">
        <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--ds-bg)]">
          <span className="text-2xl text-[var(--ds-text-muted)]/40">◔</span>
        </div>
        <p className="text-sm text-[var(--ds-text-muted)]">Aucun acte sur 30 j.</p>
      </div>
    );
  }

  const dominant = [...data].sort((a, b) => b.value - a.value)[0];
  const dominantPct =
    dominant && totalPatients > 0
      ? Math.round((dominant.value / totalPatients) * 100)
      : 0;
  return (
    <div className="flex min-w-0 w-full flex-col items-center">
      <div className="relative w-full">
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
        {dominant && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-xl font-bold leading-none tabular-nums text-[var(--ds-text)]">
              {dominantPct}%
            </p>
            <p className="mt-1 max-w-[72px] text-center text-[10px] font-medium leading-tight text-[var(--ds-text-muted)]">
              {dominant.name}
            </p>
          </div>
        )}
      </div>
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
    const s = getCabinetBlob() as Record<string, unknown>;
    const prenom = toTitleCase(
      typeof s.praticienPrenom === "string" ? s.praticienPrenom : "",
    );
    const nom = toTitleCase(
      typeof s.praticienNom === "string" ? s.praticienNom : "Assil",
    );
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
  const [statsLoading, setStatsLoading] = useState(true);
  const [dashboardStats, setDashboardStats] = useState<Awaited<
    ReturnType<typeof getDashboardStatsAction>
  > | null>(null);
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
  const [totalEncaisseToday, setTotalEncaisseToday] = useState(0);
  const [patientCount, setPatientCount] = useState(0);
  const [patientsThisMonthCount, setPatientsThisMonthCount] = useState(0);
  const [actesChartData, setActesChartData] = useState<ActeChartDatum[]>(
    ACTES_CHART_FALLBACK,
  );

  const logisticsAlerts = useMemo(
    () => listLogisticsAlerts(labCommandes),
    [labCommandes],
  );

  const refreshActesChart = useCallback(async () => {
    try {
      const rows = await getDashboardActesDistributionAction();
      setActesChartData(mapActesDistributionToChart(rows));
    } catch {
      setActesChartData(ACTES_CHART_FALLBACK);
    }
  }, []);

  const loadPatientsFromServer = useCallback(async () => {
    const res = await getPatientsAction();
    if (!res.ok) {
      console.error(res.error);
      return;
    }
    const list = res.data.map(patientRowToDentalPatientRecord);
    setFluxPatientCandidates(
      list.map((p) => ({
        id: p.id,
        nom: displayPatientName(p),
      })),
    );
    setPatientCount(list.length);
    const now = new Date();
    let createdThisMonth = 0;
    for (const p of list) {
      if (p.createdAt) {
        const d = new Date(p.createdAt);
        if (
          !Number.isNaN(d.getTime()) &&
          d.getFullYear() === now.getFullYear() &&
          d.getMonth() === now.getMonth()
        ) {
          createdThisMonth++;
        }
      }
    }
    setPatientsThisMonthCount(createdThisMonth);
    void refreshActesChart();
  }, [refreshActesChart]);

  const reloadTodayPlansIntoFlux = useCallback(async () => {
    const todayKey = getLocalDateISO();
    const res = await getAppointmentsByDateAction(todayKey);
    const appsToday = res.ok ? res.data.map(appointmentJoinedRowToRdv) : [];
    setRdvCount(appsToday.length);
    setRdvToConfirmCount(
      appsToday.filter((a) => a.status === "pending").length,
    );
    setFluxRows((prev) =>
      mergePlannedAppointmentsIntoFlux(prev, appsToday),
    );
  }, []);

  const refreshStockKpisFromServer = useCallback(async () => {
    const res = await getStocksAction();
    if (!res.ok) return;
    // KPI "ruptures" : quantite <= quantite_min (spéc)
    setStockCriticalCount(
      res.data.filter((row) => row.quantite <= row.quantite_min).length,
    );
  }, []);

  const refreshEncaissementsToday = useCallback(async () => {
    const todayKey = getLocalDateISO();
    const res = await getFacturesByDateAction(todayKey);
    if (!res.ok) {
      setTotalEncaisseToday(0);
      return;
    }
    let sum = 0;
    for (const row of res.data) {
      sum += Number.parseFloat(String(row.montant_paye ?? "0")) || 0;
    }
    setTotalEncaisseToday(sum);
  }, []);

  useEffect(() => {
    setDoctorInfo(getDoctorName());
    function onCabinetReady() {
      setDoctorInfo(getDoctorName());
    }
    window.addEventListener("oryx-cabinet-ready", onCabinetReady);
    return () => window.removeEventListener("oryx-cabinet-ready", onCabinetReady);
  }, []);

  useEffect(() => {
    setStatsLoading(true);
    void (async () => {
      try {
        const s = await getDashboardStatsAction();
        setDashboardStats(s);
        setPatientCount(s.totalPatients);
        setRdvCount(s.rdvAujourdHui);
        setStockCriticalCount(s.stocksEnRupture);
      } catch (e) {
        console.error("[getDashboardStatsAction]", e);
        setDashboardStats(null);
      } finally {
        setStatsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    setMounted(true);
    setTasks(loadDashboardTasks());
    const ster = readSterData();
    setSterileTotal(countSterileKitsReady(ster));
    void refreshStockKpisFromServer();
    void loadPatientsFromServer();

    const todayKey = getLocalDateISO();

    void (async () => {
      const fluxRaw = getCabinetValue<unknown>(FLUX_STORAGE_KEY);
      const parsed = parsePersistedFlux(
        fluxRaw == null
          ? null
          : typeof fluxRaw === "string"
            ? fluxRaw
            : JSON.stringify(fluxRaw),
      );
      const baseFlux = parsed ?? FLUX_INITIAL;
      const appsRes = await getAppointmentsByDateAction(todayKey);
      const appsToday = appsRes.ok
        ? appsRes.data.map(appointmentJoinedRowToRdv)
        : [];
      setRdvCount(appsToday.length);
      setRdvToConfirmCount(
        appsToday.filter((a) => a.status === "pending").length,
      );
      setFluxRows(mergePlannedAppointmentsIntoFlux(baseFlux, appsToday));
    })();

    void refreshEncaissementsToday();
  }, [
    loadPatientsFromServer,
    refreshStockKpisFromServer,
    refreshEncaissementsToday,
  ]);

  useEffect(() => {
    if (!mounted) return;
    async function refreshLab() {
      const res = await getCommandesLaboAction();
      if (res.ok) {
        setLabCommandes(res.data.map(mapServerCommandeLaboToUi));
      } else {
        setLabCommandes([]);
      }
    }
    void refreshLab();
    const h = () => {
      void refreshLab();
    };
    window.addEventListener(LAB_COMMANDES_UPDATED_EVENT, h);
    window.addEventListener("focus", h);
    return () => {
      window.removeEventListener(LAB_COMMANDES_UPDATED_EVENT, h);
      window.removeEventListener("focus", h);
    };
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    const refreshStock = () => void refreshStockKpisFromServer();
    refreshStock();
    window.addEventListener(STOCK_UPDATED_EVENT, refreshStock);
    window.addEventListener("focus", refreshStock);
    return () => {
      window.removeEventListener(STOCK_UPDATED_EVENT, refreshStock);
      window.removeEventListener("focus", refreshStock);
    };
  }, [mounted, refreshStockKpisFromServer]);

  useEffect(() => {
    if (!mounted) return;
    const refreshPay = () => void refreshEncaissementsToday();
    refreshPay();
    window.addEventListener(FACTURES_UPDATED_EVENT, refreshPay);
    window.addEventListener("focus", refreshPay);
    return () => {
      window.removeEventListener(FACTURES_UPDATED_EVENT, refreshPay);
      window.removeEventListener("focus", refreshPay);
    };
  }, [mounted, refreshEncaissementsToday]);

  useEffect(() => {
    if (!mounted) return;
    const h = () => {
      void reloadTodayPlansIntoFlux();
    };
    window.addEventListener(APPOINTMENTS_UPDATED_EVENT, h);
    window.addEventListener("focus", h);
    return () => {
      window.removeEventListener(APPOINTMENTS_UPDATED_EVENT, h);
      window.removeEventListener("focus", h);
    };
  }, [mounted, reloadTodayPlansIntoFlux]);

  useEffect(() => {
    if (!mounted) return;
    void persistCabinetPartial({ [TASKS_STORAGE_KEY]: tasks });
  }, [mounted, tasks]);

  useEffect(() => {
    if (!mounted) return;
    void persistCabinetPartial({
      [FLUX_STORAGE_KEY]: {
        dateISO: getLocalDateISO(),
        rows: fluxRows,
      },
    });
  }, [mounted, fluxRows]);

  function addDirectEntryToFlux(payload: DirectEntryPayload) {
    void (async () => {
      let patientLabel: string;
      let patientId: string | undefined;
      if (payload.mode === "quick") {
        const note = payload.medicalNote?.trim();
        const created = await createPatientAction({
          prenom: capitalizeStoragePart(payload.prenom.trim()),
          nom: capitalizeStoragePart(payload.nom.trim()),
          telephone: payload.telephone.trim() || "—",
          antecedents: note || null,
        });
        if (!created.ok) {
          console.error(created.error);
          return;
        }
        const rec = patientRowToDentalPatientRecord(created.data);
        const fullName = displayPatientName(rec);
        await writeMinimalPatientProfile({
          id: rec.id,
          nom: fullName,
          age: 0,
          genre: "—",
          profession: "—",
          adresse: "—",
          telephone: rec.telephone,
          email: "—",
          dateNaissance: "",
          alerts: note ? [note] : [],
        });
        await initializeEmptyDentalChart(rec.id);
        patientLabel = fullName;
        patientId = rec.id;
        await loadPatientsFromServer();
      } else {
        patientLabel = payload.patientLabel;
        patientId = payload.patientId;
      }
      const preview = buildDirectEntryAppointmentPreview({
        patientName: patientLabel,
        patientId: patientId ?? null,
        visitKind: payload.visitKind,
      });
      const notes = composeAppointmentNotes(undefined, {
        rdvType: "direct",
        urgence: preview.urgence,
        ...(preview.patientId
          ? {}
          : { displayPatient: preview.patient.trim() }),
      });
      const cre = await createAppointmentAction({
        patient_id: preview.patientId ?? null,
        date: preview.dateKey,
        heure: preview.start,
        duree: preview.durationMinutes,
        type_acte: preview.soin,
        statut: statutDbFromUi(preview.status) ?? undefined,
        notes,
      });
      if (!cre.ok) {
        console.error(cre.error);
        return;
      }
      const rdv = appointmentJoinedRowToRdv(cre.data);
      notifyAppointmentsUpdated();
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
      setFluxRows((prev) => [row, ...prev]);
      await reloadTodayPlansIntoFlux();
    })();
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
    return <DashboardKpiSkeleton />;
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

          {/* Daily Briefing — 3 métriques inline */}
          <div className="flex shrink-0 items-center gap-5 rounded-2xl bg-[var(--ds-bg)]/70 px-5 py-3">
            <div className="text-center">
              <p className="text-lg font-bold tabular-nums text-[color:var(--ds-text)]">
                {Math.max(0, rdvCount - rdvToConfirmCount)}
              </p>
              <p className="text-[11px] text-[var(--ds-text-muted)]">RDV confirmés</p>
            </div>
            <div className="h-8 w-px bg-[var(--ds-primary-border)]" />
            <div className="text-center">
              <p className="text-lg font-bold tabular-nums text-amber-600">{rdvToConfirmCount}</p>
              <p className="text-[11px] text-[var(--ds-text-muted)]">En attente</p>
            </div>
            <div className="h-8 w-px bg-[var(--ds-primary-border)]" />
            <div className="text-center">
              <p className="text-lg font-bold tabular-nums text-emerald-700">
                {totalEncaisseToday.toLocaleString("fr-DZ")}
                <span className="ml-0.5 text-sm font-medium"> DA</span>
              </p>
              <p className="text-[11px] text-[var(--ds-text-muted)]">Encaissé du jour</p>
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
        {statsLoading ? (
          <>
            <div className="h-[92px] animate-pulse rounded-2xl bg-muted" />
            <div className="h-[92px] animate-pulse rounded-2xl bg-muted" />
            <div className="h-[92px] animate-pulse rounded-2xl bg-muted" />
            <div className="h-[92px] animate-pulse rounded-2xl bg-muted" />
          </>
        ) : (
          <>
            <KpiCard
              kpi="patients"
              label="Patients"
              value={dashboardStats?.totalPatients ?? 0}
              change={`+${patientsThisMonthCount} ce mois-ci`}
              icon={<Users />}
            />
            <KpiCard
              kpi="rdv"
              label="RDV du jour"
              value={dashboardStats?.rdvAujourdHui ?? rdvCount}
              change={`${rdvToConfirmCount} à confirmer`}
              icon={<Calendar />}
            />
            <KpiCard
              kpi="rdv"
              label="RDV ce mois"
              value={dashboardStats?.rdvCeMois ?? 0}
              change="Période en cours"
              icon={<Calendar />}
            />
            <Link
              href="/stocks"
              className="block rounded-xl transition-opacity hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed] focus-visible:ring-offset-2"
            >
              <KpiCard
                kpi="stock"
                stockAlertCount={dashboardStats?.stocksEnRupture ?? stockCriticalCount}
                label="Stocks en rupture"
                value={dashboardStats?.stocksEnRupture ?? stockCriticalCount}
                unit="alertes"
                change="Quantité ≤ seuil"
                icon={<AlertTriangle />}
              />
            </Link>
          </>
        )}
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
                <h2 className="text-sm font-semibold text-[color:var(--ds-text)]">
                  Flux de la journée
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    void loadPatientsFromServer();
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
              <div className="flex flex-col items-center justify-center gap-4 py-16">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--ds-primary-soft)]">
                  <Calendar className="h-8 w-8 text-[color:var(--ds-primary)]" strokeWidth={1.5} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-[var(--ds-text)]">
                    Aucun rendez-vous aujourd&apos;hui
                  </p>
                  <p className="mt-1 text-xs text-[var(--ds-text-muted)]">
                    Votre agenda est libre pour cette journée.
                  </p>
                </div>
                <Link
                  href="/planning?newRdv=true"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[color:var(--ds-primary)] px-4 py-2 text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                  Planifier un RDV
                </Link>
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
                    <span className="text-sm font-semibold text-[var(--ds-text)]">
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
                    <span className="text-sm font-semibold text-[var(--ds-text)]">
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

          <div className="rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[13px] font-semibold text-[var(--ds-text)]">
                Activité récente
              </p>
              <span className="text-[11px] text-[var(--ds-text-subtle)]">
                À venir
              </span>
            </div>

            {statsLoading ? (
              <div className="flex flex-col gap-2">
                <div className="h-10 animate-pulse rounded-[10px] bg-muted" />
                <div className="h-10 animate-pulse rounded-[10px] bg-muted" />
                <div className="h-10 animate-pulse rounded-[10px] bg-muted" />
                <div className="h-10 animate-pulse rounded-[10px] bg-muted" />
                <div className="h-10 animate-pulse rounded-[10px] bg-muted" />
              </div>
            ) : (dashboardStats?.prochainsRdv?.length ?? 0) > 0 ? (
              <div className="flex flex-col gap-2">
                {dashboardStats!.prochainsRdv.map((rdv) => {
                  const patient = [rdv.patient_prenom, rdv.patient_nom]
                    .filter(Boolean)
                    .join(" ")
                    .trim();
                  return (
                    <div
                      key={rdv.id}
                      className="flex items-start gap-3 rounded-[10px] p-2.5 transition-colors hover:bg-[var(--ds-primary-soft)]"
                    >
                      <span className="mt-0.5 flex-shrink-0 font-['DM_Mono',monospace] text-[11px] font-bold text-[var(--ds-text-subtle)]">
                        {rdv.heure || "—"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-bold text-[var(--ds-text)]">
                          {patient || "Patient"}
                        </p>
                        <p className="truncate text-[12px] font-normal text-[var(--ds-text-muted)]">
                          {rdv.type_acte || "—"}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-[12px] text-[var(--ds-text-subtle)]">
                Aucun rendez-vous à venir
              </p>
            )}
          </div>
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
          <TeamActivityFeed />
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
