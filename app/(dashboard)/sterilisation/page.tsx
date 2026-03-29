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
  color: string;
}

type CycleTestResult = "conforme" | "non-conforme";

/** Stock agrégé par type : prêt / sale / en autoclave */
interface KitStock {
  disponible: number;
  sale: number;
  enCours: number;
}

interface AutoclaveCycle {
  id: string;
  date: string;
  numero: number;
  operateur: string;
  bowieDick: CycleTestResult;
  helix: CycleTestResult;
  /** Quantités passées sale → enCours au lancement */
  qtyByType: Record<KitTypeId, number>;
  /** Après validation opérateur : enCours → disponible */
  valide: boolean;
}

interface SterilizationDataV2 {
  stockByType: Record<KitTypeId, KitStock>;
  cycles: AutoclaveCycle[];
  /** @deprecated conservé pour migration uniquement */
  kits?: unknown[];
  nextKitNumero?: number;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const LS_KEY = "dental_sterilization_data";

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

const DEFAULT_STOCK = (): Record<KitTypeId, KitStock> => ({
  examen: { disponible: 10, sale: 0, enCours: 0 },
  chirurgie: { disponible: 8, sale: 0, enCours: 0 },
  endo: { disponible: 8, sale: 0, enCours: 0 },
});

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

type LegacyKit = {
  kitType: KitTypeId;
  status: string;
  cycleId?: string;
};

function migrateFromLegacy(raw: unknown): SterilizationDataV2 {
  const empty = (): Record<KitTypeId, KitStock> => ({
    examen: { disponible: 0, sale: 0, enCours: 0 },
    chirurgie: { disponible: 0, sale: 0, enCours: 0 },
    endo: { disponible: 0, sale: 0, enCours: 0 },
  });

  if (
    raw &&
    typeof raw === "object" &&
    "stockByType" in raw &&
    raw.stockByType &&
    typeof raw.stockByType === "object"
  ) {
    const s = raw.stockByType as Record<string, KitStock>;
    const merged = DEFAULT_STOCK();
    for (const id of ["examen", "chirurgie", "endo"] as KitTypeId[]) {
      const v = s[id];
      if (
        v &&
        typeof v.disponible === "number" &&
        typeof v.sale === "number" &&
        typeof v.enCours === "number"
      ) {
        merged[id] = {
          disponible: Math.max(0, v.disponible),
          sale: Math.max(0, v.sale),
          enCours: Math.max(0, v.enCours),
        };
      }
    }
    const cyclesIn = Array.isArray((raw as SterilizationDataV2).cycles)
      ? (raw as SterilizationDataV2).cycles
      : [];
    return {
      stockByType: merged,
      cycles: cyclesIn.map(migrateCycleShape),
    };
  }

  const data = raw as {
    kits?: LegacyKit[];
    cycles?: Partial<AutoclaveCycle>[];
    nextKitNumero?: number;
  };
  const stock = empty();
  for (const k of data.kits ?? []) {
    const t = k.kitType;
    if (t !== "examen" && t !== "chirurgie" && t !== "endo") continue;
    if (k.status === "sterile") stock[t].disponible++;
    else if (k.status === "sale" || k.status === "perime") stock[t].sale++;
    else if (k.status === "en-cycle") stock[t].enCours++;
  }

  const hasKits = (data.kits?.length ?? 0) > 0;
  const total =
    stock.examen.disponible +
    stock.examen.sale +
    stock.examen.enCours +
    stock.chirurgie.disponible +
    stock.chirurgie.sale +
    stock.chirurgie.enCours +
    stock.endo.disponible +
    stock.endo.sale +
    stock.endo.enCours;

  const baseStock = !hasKits || total === 0 ? DEFAULT_STOCK() : stock;

  const legacyCycles = data.cycles ?? [];
  const cyclesById: Record<string, Partial<AutoclaveCycle>> = {};
  for (const c of legacyCycles) {
    if (c && typeof c === "object" && typeof c.id === "string") {
      cyclesById[c.id] = c as Partial<AutoclaveCycle>;
    }
  }

  const qtyFromKits: Record<string, Record<KitTypeId, number>> = {};
  for (const k of data.kits ?? []) {
    const cid = k.cycleId ?? "";
    if (!cid) continue;
    const t = k.kitType;
    if (t !== "examen" && t !== "chirurgie" && t !== "endo") continue;
    if (!qtyFromKits[cid]) {
      qtyFromKits[cid] = { examen: 0, chirurgie: 0, endo: 0 };
    }
    qtyFromKits[cid][t]++;
  }

  const cycles: AutoclaveCycle[] = legacyCycles.map((c, i) => {
    const id = typeof c?.id === "string" ? c.id : uid();
    const qty =
      qtyFromKits[id] ??
      ({
        examen: 0,
        chirurgie: 0,
        endo: 0,
      } as Record<KitTypeId, number>);
    const hasQty = qty.examen + qty.chirurgie + qty.endo > 0;
    const cycleKits = (data.kits ?? []).filter((k) => k.cycleId === id);
    const stillEnCycle = cycleKits.some((k) => k.status === "en-cycle");
    const valide =
      typeof (c as AutoclaveCycle).valide === "boolean"
        ? (c as AutoclaveCycle).valide
        : !stillEnCycle && hasQty;

    return {
      id,
      date:
        typeof c?.date === "string"
          ? c.date
          : new Date().toISOString(),
      numero: typeof c?.numero === "number" ? c.numero : i + 1,
      operateur:
        typeof c?.operateur === "string" ? c.operateur : DEFAULT_OPERATORS[0],
      bowieDick:
        c?.bowieDick === "non-conforme" ? "non-conforme" : "conforme",
      helix: c?.helix === "non-conforme" ? "non-conforme" : "conforme",
      qtyByType:
        (c as AutoclaveCycle).qtyByType && hasQty
          ? (c as AutoclaveCycle).qtyByType
          : qty,
      valide,
    };
  });

  return { stockByType: baseStock, cycles };
}

function migrateCycleShape(c: AutoclaveCycle): AutoclaveCycle {
  return {
    ...c,
    qtyByType: c.qtyByType ?? { examen: 0, chirurgie: 0, endo: 0 },
    valide: typeof c.valide === "boolean" ? c.valide : true,
  };
}

function readStorage(): SterilizationDataV2 {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) {
      return { stockByType: DEFAULT_STOCK(), cycles: [] };
    }
    const parsed = JSON.parse(raw) as unknown;
    return migrateFromLegacy(parsed);
  } catch {
    return { stockByType: DEFAULT_STOCK(), cycles: [] };
  }
}

function writeStorage(data: SterilizationDataV2) {
  localStorage.setItem(LS_KEY, JSON.stringify(data));
}

/** Stock cohérent avec un cycle #3 encore en attente de validation (1 examen + 1 endo en machine). */
function initialStockForSeed(): Record<KitTypeId, KitStock> {
  return {
    examen: { disponible: 9, sale: 0, enCours: 1 },
    chirurgie: { disponible: 8, sale: 0, enCours: 0 },
    endo: { disponible: 7, sale: 0, enCours: 1 },
  };
}

function buildSeedCycles(): AutoclaveCycle[] {
  const now = new Date();
  const d1 = new Date(now);
  d1.setDate(d1.getDate() - 2);
  const d2 = new Date(now);
  d2.setDate(d2.getDate() - 1);
  const c1 = uid();
  const c2 = uid();
  const c3 = uid();
  return [
    {
      id: c1,
      date: d1.toISOString(),
      numero: 1,
      operateur: "Amel B.",
      bowieDick: "conforme",
      helix: "conforme",
      qtyByType: { examen: 2, chirurgie: 1, endo: 0 },
      valide: true,
    },
    {
      id: c2,
      date: d2.toISOString(),
      numero: 2,
      operateur: "Nadia K.",
      bowieDick: "conforme",
      helix: "conforme",
      qtyByType: { examen: 2, chirurgie: 1, endo: 1 },
      valide: true,
    },
    {
      id: c3,
      date: now.toISOString(),
      numero: 3,
      operateur: "Amel B.",
      bowieDick: "conforme",
      helix: "non-conforme",
      qtyByType: { examen: 1, chirurgie: 0, endo: 1 },
      valide: false,
    },
  ];
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SterilisationPage() {
  const [isMounted, setIsMounted] = useState(false);
  const [stockByType, setStockByType] = useState<Record<KitTypeId, KitStock>>(
    DEFAULT_STOCK,
  );
  const [cycles, setCycles] = useState<AutoclaveCycle[]>([]);

  const [showCycleModal, setShowCycleModal] = useState(false);
  const [newOperateur, setNewOperateur] = useState(DEFAULT_OPERATORS[0]);
  const [newBowieDick, setNewBowieDick] = useState<CycleTestResult>("conforme");
  const [newHelix, setNewHelix] = useState<CycleTestResult>("conforme");
  const [kitCounts, setKitCounts] = useState<Record<KitTypeId, number>>({
    examen: 0,
    chirurgie: 0,
    endo: 0,
  });
  const [cycleError, setCycleError] = useState<string | null>(null);

  useEffect(() => {
    setIsMounted(true);
    const data = readStorage();
    const isEmpty = data.cycles.length === 0 && isStockPristine(data.stockByType);
    if (isEmpty) {
      const seedStock = initialStockForSeed();
      const seedCycles = buildSeedCycles();
      const next = { stockByType: seedStock, cycles: seedCycles };
      setStockByType(seedStock);
      setCycles(seedCycles);
      writeStorage(next);
    } else {
      setStockByType(data.stockByType);
      setCycles(data.cycles);
    }
  }, []);

  useEffect(() => {
    if (!isMounted) return;
    writeStorage({ stockByType, cycles });
  }, [stockByType, cycles, isMounted]);

  const todayStr = new Date().toISOString().slice(0, 10);

  const totals = useMemo(() => {
    let d = 0;
    let s = 0;
    let e = 0;
    for (const kt of KIT_TYPES) {
      const st = stockByType[kt.id];
      d += st.disponible;
      s += st.sale;
      e += st.enCours;
    }
    return { disponible: d, sale: s, enCours: e };
  }, [stockByType]);

  const cyclesToday = useMemo(
    () => cycles.filter((c) => c.date.slice(0, 10) === todayStr).length,
    [cycles, todayStr],
  );

  const totalNewKits = kitCounts.examen + kitCounts.chirurgie + kitCounts.endo;

  const stockSufficient = useMemo(() => {
    for (const kt of KIT_TYPES) {
      const need = kitCounts[kt.id];
      if (need > stockByType[kt.id].sale) return false;
    }
    return true;
  }, [kitCounts, stockByType]);

  function handleCreateCycle() {
    setCycleError(null);
    if (totalNewKits === 0) return;
    for (const kt of KIT_TYPES) {
      const need = kitCounts[kt.id];
      if (need > stockByType[kt.id].sale) {
        setCycleError(
          `Stock sale insuffisant pour ${kt.label} : ${stockByType[kt.id].sale} disponible(s) en zone sale, ${need} demandé(s).`,
        );
        return;
      }
    }

    const nowISO = new Date().toISOString();
    const numero =
      cycles.length === 0
        ? 1
        : Math.max(...cycles.map((c) => c.numero)) + 1;
    const cycleId = uid();

    const cycle: AutoclaveCycle = {
      id: cycleId,
      date: nowISO,
      numero,
      operateur: newOperateur,
      bowieDick: newBowieDick,
      helix: newHelix,
      qtyByType: {
        examen: kitCounts.examen,
        chirurgie: kitCounts.chirurgie,
        endo: kitCounts.endo,
      },
      valide: false,
    };

    setStockByType((prev) => {
      const next = { ...prev };
      for (const kt of KIT_TYPES) {
        const q = kitCounts[kt.id];
        if (q === 0) continue;
        next[kt.id] = {
          ...next[kt.id],
          sale: next[kt.id].sale - q,
          enCours: next[kt.id].enCours + q,
        };
      }
      return next;
    });

    setCycles((prev) => [cycle, ...prev]);
    resetModal();
  }

  function resetModal() {
    setShowCycleModal(false);
    setNewBowieDick("conforme");
    setNewHelix("conforme");
    setKitCounts({ examen: 0, chirurgie: 0, endo: 0 });
    setCycleError(null);
  }

  function utiliserUnKit(kitType: KitTypeId) {
    setStockByType((prev) => {
      const st = prev[kitType];
      if (st.disponible <= 0) return prev;
      return {
        ...prev,
        [kitType]: {
          disponible: st.disponible - 1,
          sale: st.sale + 1,
          enCours: st.enCours,
        },
      };
    });
  }

  function validerCycle(cycle: AutoclaveCycle) {
    if (cycle.valide) return;
    const q = cycle.qtyByType;
    setStockByType((prev) => {
      const next = { ...prev };
      for (const kt of KIT_TYPES) {
        const n = q[kt.id];
        if (n <= 0) continue;
        const st = next[kt.id];
        next[kt.id] = {
          disponible: st.disponible + n,
          sale: st.sale,
          enCours: Math.max(0, st.enCours - n),
        };
      }
      return next;
    });
    setCycles((prev) =>
      prev.map((c) => (c.id === cycle.id ? { ...c, valide: true } : c)),
    );
  }

  if (!isMounted) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-slate-400">Chargement…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[color:var(--ds-text)]">
            Stérilisation
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Boucle stock : prêt → utilisé (sale) → autoclave (en cours) → prêt.
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

      {/* Cartes stock par type */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          Stock par type de kit
        </h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {KIT_TYPES.map((kt) => {
            const st = stockByType[kt.id];
            const Icon = kt.icon;
            const canUse = st.disponible > 0;
            return (
              <div
                key={kt.id}
                className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      className={[
                        "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border",
                        kt.color,
                      ].join(" ")}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="font-semibold text-slate-900">{kt.label}</p>
                      <p className="text-[11px] text-slate-400">
                        {kt.instruments}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => utiliserUnKit(kt.id)}
                    disabled={!canUse}
                    title={
                      canUse
                        ? "Retirer un kit prêt (consultation)"
                        : "Aucun kit prêt"
                    }
                    className={[
                      "shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors",
                      canUse
                        ? "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                        : "cursor-not-allowed border border-slate-100 bg-slate-50 text-slate-400",
                    ].join(" ")}
                  >
                    Utiliser
                  </button>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/80 py-2">
                    <p className="text-[10px] font-semibold uppercase text-emerald-800">
                      Prêt
                    </p>
                    <p className="text-xl font-bold tabular-nums text-emerald-700">
                      {st.disponible}
                    </p>
                  </div>
                  <div className="rounded-xl border border-red-100 bg-red-50/80 py-2">
                    <p className="text-[10px] font-semibold uppercase text-red-800">
                      Sale
                    </p>
                    <p className="text-xl font-bold tabular-nums text-red-700">
                      {st.sale}
                    </p>
                  </div>
                  <div className="rounded-xl border border-sky-100 bg-sky-50/80 py-2">
                    <p className="text-[10px] font-semibold uppercase text-sky-900">
                      En machine
                    </p>
                    <p className="text-xl font-bold tabular-nums text-sky-700">
                      {st.enCours}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50/60 to-white p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
          Totaux agrégés
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-white px-3 py-2 shadow-sm">
            <span className="text-xs font-medium text-emerald-800">Prêt</span>
            <span className="text-lg font-bold tabular-nums text-emerald-700">
              {totals.disponible}
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-red-100 bg-white px-3 py-2 shadow-sm">
            <span className="text-xs font-medium text-red-800">Sale</span>
            <span className="text-lg font-bold tabular-nums text-red-700">
              {totals.sale}
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-sky-100 bg-white px-3 py-2 shadow-sm">
            <span className="text-xs font-medium text-sky-900">En machine</span>
            <span className="text-lg font-bold tabular-nums text-sky-700">
              {totals.enCours}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2 rounded-xl bg-emerald-600/10 px-4 py-2">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            <span className="text-sm font-bold text-emerald-700">
              {totals.disponible} kit{totals.disponible !== 1 ? "s" : ""} prêt
              {totals.disponible !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={ShieldCheck}
          label="Kits prêts (disponible)"
          value={String(totals.disponible)}
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
          label="En autoclave (en cours)"
          value={String(totals.enCours)}
          badgeClass="bg-sky-50 text-sky-800"
        />
        <KpiCard
          icon={AlertTriangle}
          label="Kits sales (à traiter)"
          value={String(totals.sale)}
          badgeClass="bg-red-50 text-red-700"
          alert={totals.sale > 0}
        />
      </div>

      <section className="rounded-3xl bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold tracking-tight text-[color:var(--ds-text)]">
          Cycles Autoclave
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Lancer un cycle consomme le stock <strong>sale</strong>. Valider le
          cycle rend les kits <strong>prêts</strong> (disponible).
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
                <th className="pb-3 pr-4">Statut</th>
                <th className="pb-3 pr-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {cycles.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="py-10 text-center text-sm text-slate-400"
                  >
                    Aucun cycle enregistré.
                  </td>
                </tr>
              ) : (
                [...cycles]
                  .sort(
                    (a, b) =>
                      new Date(b.date).getTime() - new Date(a.date).getTime(),
                  )
                  .map((c) => {
                    const summary = KIT_TYPES.map((kt) => {
                      const n = c.qtyByType[kt.id] ?? 0;
                      return n > 0 ? `${n} ${kt.label}` : null;
                    }).filter(Boolean);
                    return (
                      <tr key={c.id} className="group">
                        <td className="py-3 pr-4 font-semibold text-slate-700">
                          #{c.numero}
                        </td>
                        <td className="py-3 pr-4 text-slate-600">
                          {formatDateShort(c.date)}
                        </td>
                        <td className="py-3 pr-4 text-slate-600">
                          {c.operateur}
                        </td>
                        <td className="py-3 pr-4">
                          <TestBadge result={c.bowieDick} />
                        </td>
                        <td className="py-3 pr-4">
                          <TestBadge result={c.helix} />
                        </td>
                        <td className="py-3 pr-4 text-xs text-slate-600">
                          {summary.length > 0 ? summary.join(", ") : "—"}
                        </td>
                        <td className="py-3 pr-4">
                          {c.valide ? (
                            <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-100">
                              Terminé / Validé
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800 ring-1 ring-sky-100">
                              En cours
                            </span>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-right">
                          {!c.valide ? (
                            <button
                              type="button"
                              onClick={() => validerCycle(c)}
                              className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100"
                            >
                              Terminer / Valider
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
              )}
            </tbody>
          </table>
        </div>
      </section>

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
                    <option key={op} value={op}>
                      {op}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <TestToggle
                  label="Bowie-Dick"
                  value={newBowieDick}
                  onChange={setNewBowieDick}
                />
                <TestToggle
                  label="Test Helix"
                  value={newHelix}
                  onChange={setNewHelix}
                />
              </div>

              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Kits dans ce cycle (depuis le stock sale)
                </p>
                <div className="space-y-3">
                  {KIT_TYPES.map((kt) => {
                    const Icon = kt.icon;
                    const count = kitCounts[kt.id];
                    const maxSale = stockByType[kt.id].sale;
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
                            Sale : {maxSale} disponible(s)
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
                                [kt.id]: Math.min(maxSale, prev[kt.id] + 1),
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
                    <strong>{totalNewKits}</strong> kit
                    {totalNewKits > 1 ? "s" : ""} pris depuis la zone{" "}
                    <strong>sale</strong> → <strong>en machine</strong>.
                  </p>
                )}
                {cycleError && (
                  <p className="mt-2 text-xs font-medium text-red-600">
                    {cycleError}
                  </p>
                )}
              </div>

              {(newBowieDick === "non-conforme" || newHelix === "non-conforme") && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2.5">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <p className="text-xs leading-relaxed text-amber-800">
                    Un ou plusieurs tests sont <strong>non-conformes</strong>.
                    Validez manuellement le cycle après contrôle.
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
                disabled={totalNewKits === 0 || !stockSufficient}
                className={[
                  "rounded-2xl px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors",
                  totalNewKits === 0 || !stockSufficient
                    ? "cursor-not-allowed bg-slate-300"
                    : "bg-[color:var(--ds-primary)] hover:opacity-90",
                ].join(" ")}
              >
                Confirmer le cycle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function isStockPristine(s: Record<KitTypeId, KitStock>): boolean {
  const d = DEFAULT_STOCK();
  return KIT_TYPES.every(
    (kt) =>
      s[kt.id].disponible === d[kt.id].disponible &&
      s[kt.id].sale === d[kt.id].sale &&
      s[kt.id].enCours === d[kt.id].enCours,
  );
}

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
      {ok ? (
        <Check className="h-3 w-3" strokeWidth={2.5} />
      ) : (
        <XCircle className="h-3 w-3" />
      )}
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
