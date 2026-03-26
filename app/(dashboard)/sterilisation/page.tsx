"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Clock,
  Plus,
  Scissors,
  Search,
  ShieldCheck,
  Stethoscope,
  Thermometer,
  X,
  XCircle,
} from "lucide-react";
import { formatDateShort } from "@/utils/formatters";

// ─── Types ────────────────────────────────────────────────────────────────────

type KitTypeId = "examen" | "chirurgie" | "endo";

interface KitType {
  id: KitTypeId;
  label: string;
  instruments: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string; // classes Tailwind pour le badge type
}

type CycleTestResult = "conforme" | "non-conforme";

interface AutoclaveCycle {
  id: string;
  date: string;
  numero: number;
  operateur: string;
  bowieDick: CycleTestResult;
  helix: CycleTestResult;
}

type KitStatus = "sale" | "en-cycle" | "sterile" | "perime";

interface InstrumentKit {
  id: string;
  cycleId: string;
  kitType: KitTypeId;
  numero: number;
  dateCreation: string;
  datePeremption: string;
  status: KitStatus;
}

interface SterilizationData {
  cycles: AutoclaveCycle[];
  kits: InstrumentKit[];
  nextKitNumero: number;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const LS_KEY = "dental_sterilization_data";
const PEREMPTION_MONTHS = 6;

const KIT_TYPES: KitType[] = [
  {
    id: "examen",
    label: "Examen",
    instruments: "Miroir / Sonde / Précelles",
    icon: Stethoscope,
    color: "bg-sky-50 text-sky-700 border-sky-100",
  },
  {
    id: "chirurgie",
    label: "Chirurgie",
    instruments: "Élévateurs / Daviers / Syndesmotome",
    icon: Scissors,
    color: "bg-violet-50 text-violet-700 border-violet-100",
  },
  {
    id: "endo",
    label: "Endo",
    instruments: "Localisateur / Limes / Miroir",
    icon: Search,
    color: "bg-amber-50 text-amber-700 border-amber-100",
  },
];

const KIT_TYPE_MAP = Object.fromEntries(
  KIT_TYPES.map((k) => [k.id, k]),
) as Record<KitTypeId, KitType>;

const KIT_STATUS_LABEL: Record<KitStatus, string> = {
  sale: "Sale",
  "en-cycle": "En cycle",
  sterile: "Stérile",
  perime: "Périmé",
};

const KIT_STATUS_CLASS: Record<KitStatus, string> = {
  sale: "bg-red-50 text-red-600 border-red-100",
  "en-cycle": "bg-amber-50 text-amber-700 border-amber-100",
  sterile: "bg-emerald-50 text-emerald-700 border-emerald-100",
  perime: "bg-slate-100 text-slate-500 border-slate-200",
};

const KIT_STATUS_DOT: Record<KitStatus, string> = {
  sale: "bg-red-500",
  "en-cycle": "bg-amber-500",
  sterile: "bg-emerald-500",
  perime: "bg-slate-400",
};

const DEFAULT_OPERATORS = [
  "Amel B.",
  "Nadia K.",
  "Yasmine D.",
  "Samira M.",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function addMonths(isoDate: string, months: number): string {
  const d = new Date(isoDate);
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
}

function readStorage(): SterilizationData {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { cycles: [], kits: [], nextKitNumero: 100 };
    const parsed = JSON.parse(raw) as SterilizationData;
    if (!parsed.kits) {
      return { cycles: parsed.cycles ?? [], kits: [], nextKitNumero: 100 };
    }
    return parsed;
  } catch {
    return { cycles: [], kits: [], nextKitNumero: 100 };
  }
}

function writeStorage(data: SterilizationData) {
  localStorage.setItem(LS_KEY, JSON.stringify(data));
}

function autoExpireKits(kits: InstrumentKit[]): InstrumentKit[] {
  const now = Date.now();
  return kits.map((k) => {
    if (
      k.status === "sterile" &&
      new Date(k.datePeremption).getTime() < now
    ) {
      return { ...k, status: "perime" as KitStatus };
    }
    return k;
  });
}

// ─── Données seed ─────────────────────────────────────────────────────────────

function buildSeedData(): SterilizationData {
  const now = new Date();
  const d1 = new Date(now);
  d1.setDate(d1.getDate() - 2);
  const d2 = new Date(now);
  d2.setDate(d2.getDate() - 1);

  const c1 = uid();
  const c2 = uid();
  const c3 = uid();

  const cycles: AutoclaveCycle[] = [
    { id: c1, date: d1.toISOString(), numero: 1, operateur: "Amel B.", bowieDick: "conforme", helix: "conforme" },
    { id: c2, date: d2.toISOString(), numero: 2, operateur: "Nadia K.", bowieDick: "conforme", helix: "conforme" },
    { id: c3, date: now.toISOString(), numero: 3, operateur: "Amel B.", bowieDick: "conforme", helix: "non-conforme" },
  ];

  let num = 100;

  const makeKit = (
    cycleId: string,
    kitType: KitTypeId,
    creation: string,
    status: KitStatus,
  ): InstrumentKit => ({
    id: uid(),
    cycleId,
    kitType,
    numero: num++,
    dateCreation: creation,
    datePeremption: addMonths(creation, PEREMPTION_MONTHS),
    status,
  });

  const kits: InstrumentKit[] = [
    makeKit(c1, "examen", d1.toISOString(), "sterile"),
    makeKit(c1, "examen", d1.toISOString(), "sterile"),
    makeKit(c1, "examen", d1.toISOString(), "sale"),
    makeKit(c1, "chirurgie", d1.toISOString(), "sterile"),
    makeKit(c1, "chirurgie", d1.toISOString(), "sale"),
    makeKit(c2, "examen", d2.toISOString(), "sterile"),
    makeKit(c2, "examen", d2.toISOString(), "sterile"),
    makeKit(c2, "endo", d2.toISOString(), "sterile"),
    makeKit(c2, "chirurgie", d2.toISOString(), "sterile"),
    makeKit(c3, "examen", now.toISOString(), "en-cycle"),
    makeKit(c3, "endo", now.toISOString(), "en-cycle"),
    makeKit(c3, "chirurgie", now.toISOString(), "en-cycle"),
  ];

  return { cycles, kits, nextKitNumero: num };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SterilisationPage() {
  const [isMounted, setIsMounted] = useState(false);
  const [cycles, setCycles] = useState<AutoclaveCycle[]>([]);
  const [kits, setKits] = useState<InstrumentKit[]>([]);
  const [nextNumero, setNextNumero] = useState(100);

  // Modal
  const [showCycleModal, setShowCycleModal] = useState(false);
  const [newOperateur, setNewOperateur] = useState(DEFAULT_OPERATORS[0]);
  const [newBowieDick, setNewBowieDick] = useState<CycleTestResult>("conforme");
  const [newHelix, setNewHelix] = useState<CycleTestResult>("conforme");
  const [kitCounts, setKitCounts] = useState<Record<KitTypeId, number>>({
    examen: 0,
    chirurgie: 0,
    endo: 0,
  });

  // Filtres
  const [statusFilter, setStatusFilter] = useState<KitStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState<KitTypeId | "all">("all");

  // ── Hydratation ─────────────────────────────────────────────────────────
  useEffect(() => {
    setIsMounted(true);
    const data = readStorage();
    if (data.cycles.length === 0 && data.kits.length === 0) {
      const seed = buildSeedData();
      setCycles(seed.cycles);
      setKits(autoExpireKits(seed.kits));
      setNextNumero(seed.nextKitNumero);
      writeStorage(seed);
    } else {
      setCycles(data.cycles);
      setKits(autoExpireKits(data.kits));
      setNextNumero(data.nextKitNumero ?? 100);
    }
  }, []);

  useEffect(() => {
    if (!isMounted) return;
    writeStorage({ cycles, kits, nextKitNumero: nextNumero });
  }, [cycles, kits, nextNumero, isMounted]);

  // ── KPI ─────────────────────────────────────────────────────────────────
  const todayStr = new Date().toISOString().slice(0, 10);

  const sterileByType = useMemo(() => {
    const map: Record<KitTypeId, number> = { examen: 0, chirurgie: 0, endo: 0 };
    for (const k of kits) {
      if (k.status === "sterile") map[k.kitType]++;
    }
    return map;
  }, [kits]);

  const totalSterile = sterileByType.examen + sterileByType.chirurgie + sterileByType.endo;

  const cyclesToday = useMemo(
    () => cycles.filter((c) => c.date.slice(0, 10) === todayStr).length,
    [cycles, todayStr],
  );

  const saleCount = useMemo(
    () => kits.filter((k) => k.status === "sale").length,
    [kits],
  );

  const enCycleCount = useMemo(
    () => kits.filter((k) => k.status === "en-cycle").length,
    [kits],
  );

  // ── Filtrage kits ───────────────────────────────────────────────────────
  const filteredKits = useMemo(() => {
    let list = [...kits].sort(
      (a, b) =>
        new Date(b.dateCreation).getTime() - new Date(a.dateCreation).getTime(),
    );
    if (statusFilter !== "all") list = list.filter((k) => k.status === statusFilter);
    if (typeFilter !== "all") list = list.filter((k) => k.kitType === typeFilter);
    return list;
  }, [kits, statusFilter, typeFilter]);

  // ── Actions ─────────────────────────────────────────────────────────────
  const totalNewKits = kitCounts.examen + kitCounts.chirurgie + kitCounts.endo;

  function handleCreateCycle() {
    if (totalNewKits === 0) return;

    const nowISO = new Date().toISOString();
    const numero = cycles.length + 1;
    const cycleId = uid();

    const cycle: AutoclaveCycle = {
      id: cycleId,
      date: nowISO,
      numero,
      operateur: newOperateur,
      bowieDick: newBowieDick,
      helix: newHelix,
    };

    const allConform = newBowieDick === "conforme" && newHelix === "conforme";
    const newStatus: KitStatus = allConform ? "sterile" : "en-cycle";

    let num = nextNumero;
    const newKits: InstrumentKit[] = [];
    for (const kt of KIT_TYPES) {
      const qty = kitCounts[kt.id];
      for (let i = 0; i < qty; i++) {
        newKits.push({
          id: uid(),
          cycleId,
          kitType: kt.id,
          numero: num++,
          dateCreation: nowISO,
          datePeremption: addMonths(nowISO, PEREMPTION_MONTHS),
          status: newStatus,
        });
      }
    }

    setCycles((prev) => [cycle, ...prev]);
    setKits((prev) => [...newKits, ...prev]);
    setNextNumero(num);
    resetModal();
  }

  function resetModal() {
    setShowCycleModal(false);
    setNewBowieDick("conforme");
    setNewHelix("conforme");
    setKitCounts({ examen: 0, chirurgie: 0, endo: 0 });
  }

  function markUsed(id: string) {
    setKits((prev) =>
      prev.map((k) =>
        k.id === id && k.status === "sterile"
          ? { ...k, status: "sale" as KitStatus }
          : k,
      ),
    );
  }

  function markSterile(id: string) {
    setKits((prev) =>
      prev.map((k) =>
        k.id === id && k.status === "en-cycle"
          ? { ...k, status: "sterile" as KitStatus }
          : k,
      ),
    );
  }

  // ── Rendu ───────────────────────────────────────────────────────────────
  if (!isMounted) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-slate-400">Chargement…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      {/* ── En-tête ──────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[color:var(--ds-text)]">
            Stérilisation
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Traçabilité des cycles autoclave et gestion des kits
            d&apos;instruments.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCycleModal(true)}
          className="inline-flex items-center gap-2 rounded-2xl bg-[color:var(--ds-primary)] px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Nouveau Cycle
        </button>
      </div>

      {/* ── Résumé kits stériles ─────────────────────────────────────── */}
      <div className="rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50/60 to-white p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
          Kits stériles disponibles
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          {KIT_TYPES.map((kt) => {
            const count = sterileByType[kt.id];
            const Icon = kt.icon;
            return (
              <div
                key={kt.id}
                className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-white px-3 py-2 shadow-sm"
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  <Icon className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-xs font-medium text-slate-500">
                    {kt.label}
                  </p>
                  <p className="text-lg font-bold tracking-tight text-[color:var(--ds-text)]">
                    {count}
                  </p>
                </div>
              </div>
            );
          })}
          <div className="ml-auto flex items-center gap-2 rounded-xl bg-emerald-600/10 px-4 py-2">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            <span className="text-sm font-bold text-emerald-700">
              {totalSterile} total
            </span>
          </div>
        </div>
      </div>

      {/* ── KPIs ─────────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={ShieldCheck}
          label="Kits stériles"
          value={String(totalSterile)}
          badgeClass="bg-emerald-50 text-emerald-700"
        />
        <KpiCard
          icon={Thermometer}
          label="Cycles du jour"
          value={String(cyclesToday)}
          badgeClass="bg-sky-50 text-sky-700"
        />
        <KpiCard
          icon={Clock}
          label="En cycle"
          value={String(enCycleCount)}
          badgeClass="bg-amber-50 text-amber-700"
        />
        <KpiCard
          icon={AlertTriangle}
          label="Kits sales"
          value={String(saleCount)}
          badgeClass="bg-red-50 text-red-700"
          alert={saleCount > 0}
        />
      </div>

      {/* ── Cycles autoclave ─────────────────────────────────────────── */}
      <section className="rounded-3xl bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold tracking-tight text-[color:var(--ds-text)]">
          Cycles Autoclave
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Historique des cycles de stérilisation.
        </p>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs font-medium uppercase tracking-wider text-slate-400">
                <th className="pb-3 pr-4">N°</th>
                <th className="pb-3 pr-4">Date</th>
                <th className="pb-3 pr-4">Opérateur</th>
                <th className="pb-3 pr-4">Bowie-Dick</th>
                <th className="pb-3 pr-4">Helix</th>
                <th className="pb-3 pr-4">Kits</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {cycles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-sm text-slate-400">
                    Aucun cycle enregistré.
                  </td>
                </tr>
              ) : (
                [...cycles]
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .map((c) => {
                    const cycleKits = kits.filter((k) => k.cycleId === c.id);
                    const summary = KIT_TYPES.map((kt) => {
                      const n = cycleKits.filter((k) => k.kitType === kt.id).length;
                      return n > 0 ? `${n} ${kt.label}` : null;
                    }).filter(Boolean);
                    return (
                      <tr key={c.id} className="group">
                        <td className="py-3 pr-4 font-semibold text-slate-700">#{c.numero}</td>
                        <td className="py-3 pr-4 text-slate-600">{formatDateShort(c.date)}</td>
                        <td className="py-3 pr-4 text-slate-600">{c.operateur}</td>
                        <td className="py-3 pr-4"><TestBadge result={c.bowieDick} /></td>
                        <td className="py-3 pr-4"><TestBadge result={c.helix} /></td>
                        <td className="py-3 pr-4 text-xs text-slate-600">
                          {summary.length > 0 ? summary.join(", ") : "—"}
                        </td>
                      </tr>
                    );
                  })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Grille des Kits ──────────────────────────────────────────── */}
      <section className="rounded-3xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-[color:var(--ds-text)]">
              Kits d&apos;instruments
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {kits.length} kit{kits.length !== 1 ? "s" : ""} enregistré{kits.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as KitTypeId | "all")}
                className="appearance-none rounded-xl border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm text-slate-700 outline-none transition-colors focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
              >
                <option value="all">Tous les types</option>
                {KIT_TYPES.map((kt) => (
                  <option key={kt.id} value={kt.id}>{kt.label}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as KitStatus | "all")}
                className="appearance-none rounded-xl border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm text-slate-700 outline-none transition-colors focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
              >
                <option value="all">Tous les statuts</option>
                <option value="sterile">Stérile</option>
                <option value="en-cycle">En cycle</option>
                <option value="sale">Sale</option>
                <option value="perime">Périmé</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredKits.length === 0 ? (
            <p className="col-span-full py-10 text-center text-sm text-slate-400">
              Aucun kit correspondant.
            </p>
          ) : (
            filteredKits.map((k) => (
              <KitCard
                key={k.id}
                kit={k}
                onMarkUsed={markUsed}
                onMarkSterile={markSterile}
              />
            ))
          )}
        </div>
      </section>

      {/* ── Modal Nouveau Cycle ──────────────────────────────────────── */}
      {showCycleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  Autoclave
                </p>
                <h3 className="mt-0.5 text-lg font-semibold text-[color:var(--ds-text)]">
                  Nouveau Cycle
                </h3>
              </div>
              <button
                type="button"
                onClick={resetModal}
                className="flex h-9 w-9 items-center justify-center rounded-2xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6 space-y-5">
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Opérateur
                </label>
                <select
                  value={newOperateur}
                  onChange={(e) => setNewOperateur(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                >
                  {DEFAULT_OPERATORS.map((op) => (
                    <option key={op} value={op}>{op}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <TestToggle label="Bowie-Dick" value={newBowieDick} onChange={setNewBowieDick} />
                <TestToggle label="Test Helix" value={newHelix} onChange={setNewHelix} />
              </div>

              {/* Sélection des kits */}
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Kits dans ce cycle
                </p>
                <div className="space-y-3">
                  {KIT_TYPES.map((kt) => {
                    const Icon = kt.icon;
                    const count = kitCounts[kt.id];
                    return (
                      <div
                        key={kt.id}
                        className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3"
                      >
                        <span
                          className={[
                            "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
                            kt.color,
                          ].join(" ")}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-800">
                            {kt.label}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {kt.instruments}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              setKitCounts((prev) => ({
                                ...prev,
                                [kt.id]: Math.max(0, prev[kt.id] - 1),
                              }))
                            }
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100"
                          >
                            −
                          </button>
                          <span className="w-8 text-center text-sm font-bold tabular-nums text-slate-800">
                            {count}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setKitCounts((prev) => ({
                                ...prev,
                                [kt.id]: prev[kt.id] + 1,
                              }))
                            }
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {totalNewKits > 0 && (
                  <p className="mt-2 text-xs text-slate-500">
                    <strong>{totalNewKits}</strong> kit{totalNewKits > 1 ? "s" : ""} sera{totalNewKits > 1 ? "ont" : ""} créé{totalNewKits > 1 ? "s" : ""}.
                  </p>
                )}
              </div>

              {(newBowieDick === "non-conforme" || newHelix === "non-conforme") && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2.5">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <p className="text-xs leading-relaxed text-amber-800">
                    Un ou plusieurs tests sont <strong>non-conformes</strong>. Les kits seront créés en statut{" "}
                    <span className="font-semibold">« En cycle »</span> et devront être validés manuellement.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={resetModal}
                className="rounded-2xl px-5 py-2.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleCreateCycle}
                disabled={totalNewKits === 0}
                className={[
                  "rounded-2xl px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors",
                  totalNewKits === 0
                    ? "cursor-not-allowed bg-slate-300"
                    : "bg-[color:var(--ds-primary)] hover:opacity-90",
                ].join(" ")}
              >
                Enregistrer le cycle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Composants auxiliaires ───────────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  label,
  value,
  badgeClass,
  alert,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  badgeClass: string;
  alert?: boolean;
}) {
  return (
    <div
      className={[
        "relative rounded-2xl bg-white p-5 shadow-sm transition-shadow hover:shadow-md",
        alert ? "ring-1 ring-red-200" : "",
      ].join(" ")}
    >
      <div className="flex items-center gap-3">
        <span
          className={[
            "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
            badgeClass,
          ].join(" ")}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="text-xl font-bold tracking-tight text-[color:var(--ds-text)]">
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}

function TestBadge({ result }: { result: CycleTestResult }) {
  const ok = result === "conforme";
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-xs font-medium",
        ok
          ? "border-emerald-100 bg-emerald-50 text-emerald-700"
          : "border-red-100 bg-red-50 text-red-600",
      ].join(" ")}
    >
      {ok ? <Check className="h-3 w-3" strokeWidth={2.5} /> : <XCircle className="h-3 w-3" />}
      {ok ? "Conforme" : "Non-conforme"}
    </span>
  );
}

function TestToggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: CycleTestResult;
  onChange: (v: CycleTestResult) => void;
}) {
  const ok = value === "conforme";
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-slate-700">{label}</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange("conforme")}
          className={[
            "flex-1 rounded-xl border px-3 py-2 text-xs font-medium transition-colors",
            ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
          ].join(" ")}
        >
          <Check className="mr-1 inline-block h-3.5 w-3.5" strokeWidth={2.5} />
          Conforme
        </button>
        <button
          type="button"
          onClick={() => onChange("non-conforme")}
          className={[
            "flex-1 rounded-xl border px-3 py-2 text-xs font-medium transition-colors",
            !ok
              ? "border-red-200 bg-red-50 text-red-600"
              : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
          ].join(" ")}
        >
          <XCircle className="mr-1 inline-block h-3.5 w-3.5" />
          Non-conf.
        </button>
      </div>
    </div>
  );
}

function KitCard({
  kit,
  onMarkUsed,
  onMarkSterile,
}: {
  kit: InstrumentKit;
  onMarkUsed: (id: string) => void;
  onMarkSterile: (id: string) => void;
}) {
  const s = kit.status;
  const kt = KIT_TYPE_MAP[kit.kitType];
  const Icon = kt.icon;

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <span
            className={[
              "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border",
              kt.color,
            ].join(" ")}
          >
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-800">
              Kit {kt.label}{" "}
              <span className="text-slate-400">#{kit.numero}</span>
            </p>
            <p className="text-[11px] text-slate-400">{kt.instruments}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className={["h-2 w-2 rounded-full", KIT_STATUS_DOT[s]].join(" ")} />
          <span
            className={[
              "rounded-lg border px-2 py-0.5 text-[11px] font-semibold",
              KIT_STATUS_CLASS[s],
            ].join(" ")}
          >
            {KIT_STATUS_LABEL[s]}
          </span>
        </div>
      </div>

      <div className="mt-3 space-y-1 text-xs text-slate-500">
        <div className="flex justify-between">
          <span>Création</span>
          <span className="font-medium text-slate-700">
            {formatDateShort(kit.dateCreation)}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Péremption</span>
          <span
            className={[
              "font-medium",
              s === "perime" ? "text-red-600" : "text-slate-700",
            ].join(" ")}
          >
            {formatDateShort(kit.datePeremption)}
          </span>
        </div>
      </div>

      {(s === "sterile" || s === "en-cycle") && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          {s === "sterile" && (
            <button
              type="button"
              onClick={() => onMarkUsed(kit.id)}
              className="w-full rounded-xl border border-red-200 bg-red-50 py-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-100"
            >
              Marquer comme sale (utilisé)
            </button>
          )}
          {s === "en-cycle" && (
            <button
              type="button"
              onClick={() => onMarkSterile(kit.id)}
              className="w-full rounded-xl border border-emerald-200 bg-emerald-50 py-2 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
            >
              Valider comme stérile
            </button>
          )}
        </div>
      )}
    </div>
  );
}
