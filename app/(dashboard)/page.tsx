"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  Check,
  FlaskConical,
  PackageSearch,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  UserPlus,
  X,
} from "lucide-react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { loadDentalStock, type StockLine } from "@/utils/stockLogic";
import {
  createPatientQuick,
  displayPatientName,
  ensurePatientsHydrated,
  readPatientsFromStorage,
} from "@/utils/patientData";
import {
  appendDirectEntryAppointment,
  readAppointmentsFromStorage,
} from "@/utils/appointmentData";
import { StatusBadge } from "@/components/laboratoire/StatusBadge";
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

const FLUX_INITIAL: FluxRow[] = [
  {
    id: "1",
    time: "08:50",
    patient: "M. Yassine",
    act: "Couronne",
    status: "Terminé",
  },
  {
    id: "2",
    time: "09:05",
    patient: "Mme Benali",
    act: "Consultation",
    status: "En attente",
    attenteMin: 20,
  },
  {
    id: "3",
    time: "10:10",
    patient: "M. Ahmed",
    act: "Extraction",
    status: "En attente",
    attenteMin: 0,
  },
  {
    id: "4",
    time: "11:00",
    patient: "Mme Amina",
    act: "Endodontie",
    status: "À venir",
  },
  {
    id: "5",
    time: "14:00",
    patient: "M. Saïd",
    act: "Contrôle",
    status: "À venir",
  },
];

/** Répartition actes : patients + % (total 120 patients sur 30 j.) */
type ActeChartDatum = {
  name: string;
  value: number;
  pct: number;
  color: string;
};

const ACTES_CHART_DATA: ActeChartDatum[] = [
  { name: "Consultation / Bilan", value: 54, pct: 45, color: "#0ea5e9" },
  { name: "Détartrage", value: 30, pct: 25, color: "#14b8a6" },
  { name: "Composite", value: 18, pct: 15, color: "#8b5cf6" },
  { name: "Endodontie", value: 12, pct: 10, color: "#f59e0b" },
  { name: "Chirurgie", value: 6, pct: 5, color: "#f43f5e" },
];

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
        "inline-flex items-center gap-0.5 rounded-full border border-violet-200/80 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700",
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

function ActesDoughnutChart() {
  const totalPatients = ACTES_CHART_DATA.reduce((a, b) => a + b.value, 0);
  return (
    <div className="flex min-w-0 w-full flex-col items-center">
      <ResponsiveContainer width="100%" height={250}>
        <PieChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
          <Pie
            data={ACTES_CHART_DATA as ActeChartDatum[]}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={58}
            outerRadius={88}
            paddingAngle={2}
            stroke="none"
          >
            {ACTES_CHART_DATA.map((entry, i) => (
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
      <ul className="mt-4 w-full space-y-2 border-t border-slate-100 pt-4">
        {ACTES_CHART_DATA.map((s) => (
          <li
            key={s.name}
            className="flex items-center justify-between gap-2 text-xs"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              <span className="truncate text-slate-600">{s.name}</span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums text-slate-900">
              {s.pct}%
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-center text-[10px] text-slate-400">
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
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="direct-entry-title"
              className="text-lg font-semibold text-slate-900"
            >
              Entrée directe
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Ajout au flux du jour et au planning (créneau marqué « Direct »,
              heure actuelle).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 flex gap-2 rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setMode("existing")}
            className={[
              "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              mode === "existing"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900",
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
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900",
            ].join(" ")}
          >
            Nouveau patient rapide
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <p className="text-xs font-medium text-slate-600">
              Type de visite <span className="text-red-500">*</span>
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setVisitKind("consultation")}
                className={[
                  "flex-1 min-w-[140px] rounded-xl border-2 px-3 py-2.5 text-sm font-semibold transition-colors",
                  visitKind === "consultation"
                    ? "border-sky-500 bg-sky-50 text-sky-900 ring-2 ring-sky-200"
                    : "border-slate-200 bg-white text-slate-600 hover:border-sky-200 hover:bg-sky-50/50",
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
                    : "border-slate-200 bg-white text-slate-600 hover:border-red-200 hover:bg-red-50/50",
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
                  className="text-xs font-medium text-slate-600"
                >
                  Rechercher un patient
                </label>
                <div className="relative mt-1.5">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="direct-entry-search"
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Nom, prénom…"
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none ring-slate-200 focus:border-sky-300 focus:ring-2"
                    autoComplete="off"
                  />
                </div>
              </div>
              <ul className="max-h-44 overflow-y-auto rounded-xl border border-slate-100">
                {filtered.length === 0 ? (
                  <li className="px-4 py-6 text-center text-sm text-slate-500">
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
                            ? "bg-sky-50 font-medium text-sky-900"
                            : "text-slate-800 hover:bg-slate-50",
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
                  className="text-xs font-medium text-slate-600"
                >
                  Nom
                </label>
                <input
                  id="quick-nom"
                  type="text"
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                  autoComplete="family-name"
                />
              </div>
              <div>
                <label
                  htmlFor="quick-prenom"
                  className="text-xs font-medium text-slate-600"
                >
                  Prénom
                </label>
                <input
                  id="quick-prenom"
                  type="text"
                  value={prenom}
                  onChange={(e) => setPrenom(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                  autoComplete="given-name"
                />
              </div>
              <div>
                <label
                  htmlFor="quick-tel"
                  className="text-xs font-medium text-slate-600"
                >
                  Téléphone
                </label>
                <input
                  id="quick-tel"
                  type="tel"
                  value={telephone}
                  onChange={(e) => setTelephone(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                  autoComplete="tel"
                />
              </div>
              <div>
                <label
                  htmlFor="quick-med-note"
                  className="text-xs font-medium text-slate-600"
                >
                  Note médicale (optionnel)
                </label>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  Allergies, antécédents…
                </p>
                <textarea
                  id="quick-med-note"
                  value={medicalNote}
                  onChange={(e) => setMedicalNote(e.target.value)}
                  rows={2}
                  placeholder="Ex. allergie pénicilline"
                  className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
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

export default function DashboardPage() {
  const [mounted, setMounted] = useState(false);
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
    setMounted(true);
    setFluxRows(loadFluxRowsForToday());
    setTasks(loadDashboardTasks());
    const ster = readSterData();
    setSterileTotal(countSterileKitsReady(ster));
    const stock = loadDentalStock();
    setStockCriticalCount(stock.filter(isStockCritical).length);
    refreshFluxPatientCandidates();
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
    } else {
      patientLabel = payload.patientLabel;
      patientId = payload.patientId;
    }
    const rdv = appendDirectEntryAppointment({
      patientName: patientLabel,
      patientId: patientId ?? null,
      visitKind: payload.visitKind,
    });
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
      <div className="flex min-h-[40vh] items-center justify-center bg-slate-50 p-6">
        <p className="text-sm text-slate-400">Chargement du tableau de bord…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen space-y-6 bg-slate-50 p-4 sm:p-6">
      {/* ── En-tête ───────────────────────────────────────────────────── */}
      <div className="rounded-3xl border border-slate-100/80 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-sky-500 to-teal-500 text-lg font-semibold tracking-tight text-white shadow-lg shadow-sky-500/20">
              AM
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-[color:var(--ds-text)]">
                Bonjour, Dr. Assil
              </h1>
              <p className="mt-1 text-sm text-slate-500">{todayLong}</p>
            </div>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-50 px-4 py-1.5 text-sm font-medium text-emerald-800 ring-1 ring-emerald-100/80">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            Cabinet Ouvert
          </span>
        </div>
      </div>

      {/* ── KPI 4 colonnes ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-slate-500">RDV du jour</p>
              <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-slate-900">
                12
              </p>
              <span className="mt-3 inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-100">
                2 à confirmer
              </span>
            </div>
            <div className="rounded-xl border border-sky-100 bg-sky-50 p-3 text-sky-600">
              <Calendar className="h-5 w-5" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-slate-500">
                Nouveaux patients
              </p>
              <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-slate-900">
                24
              </p>
              <span className="mt-3 inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-100">
                +2 ce mois-ci
              </span>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-emerald-600">
              <UserPlus className="h-5 w-5" />
            </div>
          </div>
        </div>

        <Link
          href="/sterilisation"
          className="group rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition-all hover:border-violet-200/80 hover:shadow-md"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-medium text-slate-500">
                  Kits stériles
                </p>
                <PremiumBadge />
              </div>
              <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-slate-900">
                {sterileTotal}
              </p>
              <p className="mt-2 text-[11px] text-slate-400">
                Module stérilisation
              </p>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-emerald-600">
              <ShieldCheck className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 flex items-center gap-1 text-xs font-medium text-slate-500 group-hover:text-violet-600">
            Ouvrir
            <ArrowRight className="h-3.5 w-3.5" />
          </p>
        </Link>

        <Link
          href="/stocks"
          className="group rounded-2xl border border-slate-100 bg-white p-5 shadow-sm transition-all hover:border-violet-200/80 hover:shadow-md"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-medium text-slate-500">
                  Stock faible
                </p>
                <PremiumBadge />
              </div>
              <p className="mt-2 text-3xl font-bold tabular-nums text-red-600">
                {stockCriticalCount}
              </p>
              <p className="mt-2 text-[11px] text-slate-400">
                Sous le seuil de sécurité
              </p>
            </div>
            <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-red-600">
              <PackageSearch className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 flex items-center gap-1 text-xs font-medium text-slate-500 group-hover:text-violet-600">
            Ouvrir
            <ArrowRight className="h-3.5 w-3.5" />
          </p>
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
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200/80 bg-white/90 px-3 py-2.5 text-sm text-amber-950"
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

      {/* ── Layout principal 2/3 + 1/3 ───────────────────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Flux — col 2 */}
        <div className="lg:col-span-2">
          <div className="h-full rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
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
                  className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                  + Entrée Directe
                </button>
              </div>
              <Link
                href="/planning"
                className="text-xs font-medium text-slate-400 transition-colors hover:text-[color:var(--ds-primary)]"
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

            <p className="mb-4 text-xs text-slate-500">
              Rendez-vous actifs — file et fauteuil
            </p>

            <div className="overflow-x-auto rounded-2xl border border-slate-100/80">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50 text-left">
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Heure
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Patient
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Acte prévu
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Statut
                    </th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
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
                          ? "bg-sky-50 text-sky-800 ring-sky-100"
                          : row.status === "Au fauteuil"
                            ? "bg-amber-50 text-amber-900 ring-amber-100"
                            : "bg-slate-50 text-slate-600 ring-slate-100";
                    const badgeText =
                      row.status === "En attente"
                        ? `En attente${row.attenteMin != null && row.attenteMin > 0 ? ` — ${row.attenteMin} min` : ""}`
                        : row.status === "À venir"
                          ? "À venir"
                          : row.status;
                    return (
                      <tr
                        key={row.id}
                        className="border-b border-slate-50 transition-colors last:border-0 hover:bg-slate-50/40"
                      >
                        <td className="px-4 py-3 font-medium tabular-nums text-slate-600">
                          {row.time}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-900">
                          <span className="inline-flex flex-wrap items-center gap-2">
                            <span>{row.patient}</span>
                            {row.status === "En attente" &&
                              row.visitKind != null && (
                                <span
                                  className={[
                                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                                    row.visitKind === "urgence"
                                      ? "bg-red-100 text-red-800 ring-1 ring-red-200/80"
                                      : "bg-sky-100 text-sky-800 ring-1 ring-sky-200/80",
                                  ].join(" ")}
                                >
                                  {row.visitKind === "urgence"
                                    ? "Urgence"
                                    : "Consultation"}
                                </span>
                              )}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{row.act}</td>
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
                              className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800 shadow-sm transition-colors hover:bg-sky-100"
                            >
                              Passer au fauteuil
                            </button>
                          ) : row.status === "Au fauteuil" ? (
                            <span className="text-xs text-slate-400">—</span>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {firstWaiting && (
              <p className="mt-4 text-[11px] text-slate-400">
                Prochain en attente :{" "}
                <span className="font-medium text-slate-600">
                  {firstWaiting.patient}
                </span>
              </p>
            )}

            <div className="mt-8 border-t border-slate-100 pt-8">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
                  <h3 className="text-sm font-semibold text-slate-800">
                    📝 Actions Prioritaires
                  </h3>
                  <div className="mt-4 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2.5">
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
                      className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                      aria-label="Nouvelle tâche"
                    />
                    <button
                      type="button"
                      onClick={addTask}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white/80 hover:text-slate-800"
                      aria-label="Ajouter une tâche"
                    >
                      <Plus className="h-4 w-4" strokeWidth={2.25} />
                    </button>
                  </div>
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <ul className="space-y-2">
                      {tasks.map((t) => (
                        <li key={t.id}>
                          <button
                            type="button"
                            aria-pressed={t.isDone}
                            onClick={() => toggleTask(t.id)}
                            className="flex w-full cursor-pointer items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-slate-50"
                          >
                            <span
                              className={[
                                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                                t.isDone
                                  ? "border-indigo-500 bg-indigo-500"
                                  : "border-slate-300 bg-transparent",
                              ].join(" ")}
                              aria-hidden
                            >
                              {t.isDone ? (
                                <Check
                                  className="h-3 w-3 text-white"
                                  strokeWidth={3}
                                />
                              ) : null}
                            </span>
                            <span
                              className={[
                                "text-sm leading-snug text-slate-700",
                                t.isDone ? "text-slate-400 line-through" : "",
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

                <div>
                  <h3 className="text-sm font-semibold text-slate-800">
                    🔔 À recontacter
                  </h3>
                  <div className="mt-4 space-y-3">
                    {RELANCE_PATIENTS.map((r) => (
                      <div
                        key={r.id}
                        className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3 shadow-sm"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-900">
                            {r.patient}
                          </p>
                          <p className="mt-1 text-xs leading-relaxed text-slate-500">
                            {r.motif}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="shrink-0 rounded-full border border-amber-500 px-3 py-1.5 text-xs font-medium text-amber-600 transition-colors hover:bg-amber-50"
                        >
                          {r.actionLabel}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Widgets — col 1 */}
        <div className="flex flex-col gap-6 lg:col-span-1">
          <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
              Répartition des actes
            </h3>
            <p className="mt-1 text-xs text-slate-500">Volume estimé (30 j.)</p>
            <div className="mt-6 flex justify-center">
              <ActesDoughnutChart />
            </div>
          </div>

          <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-[color:var(--ds-text)]">
                Suivi laboratoire
              </h3>
              <PremiumBadge />
            </div>
            <p className="mt-1 text-xs text-slate-500">Travaux externes</p>

            <div className="mt-5 flex flex-col gap-3">
              {labCommandes.length === 0 ? (
                <p className="text-xs text-slate-400">
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
                      className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-3 transition-colors hover:bg-slate-50/80"
                    >
                      <FlaskConical
                        className="h-4 w-4 shrink-0 text-slate-400"
                        strokeWidth={1.75}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900">
                          {row.patient}
                          <span className="text-slate-400"> · </span>
                          {row.travail}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
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
              className="mt-4 block w-full rounded-lg py-2 text-center text-sm font-medium text-indigo-600 transition-colors hover:bg-indigo-50"
            >
              Voir le laboratoire →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
