"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Package,
  Plus,
  Scissors,
  Search,
  ShieldCheck,
  Stethoscope,
  Thermometer,
  X,
  XCircle,
} from "lucide-react";
import AnimatedButton from "@/components/ui/AnimatedButton";
import { formatDateShort } from "@/utils/formatters";
import {
  APPOINTMENTS_UPDATED_EVENT,
  formatDateKeyLocal,
  readAppointmentsFromStorage,
  type AppointmentRdv,
} from "@/utils/appointmentData";

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

// ─── Traçabilité individuelle des kits ───────────────────────────────────────

type KitStatut = "pret" | "sale" | "machine";
type KitLogAction = "utilise" | "sterilise" | "marque_sale";

interface KitUsageRecord {
  date: string;
  patientNom: string;
  patientId: string;
  dent: string;
  operateur: string;
}

interface KitCycleRecord {
  date: string;
  operateur: string;
  bowieDick: CycleTestResult;
  helix: CycleTestResult;
}

interface KitLogEntry {
  date: string;
  action: KitLogAction;
  details: string;
  operateur: string;
}

interface IndividualKit {
  id: string;
  type: KitTypeId;
  statut: KitStatut;
  cycleId?: string | null;
  derniereUtilisation: KitUsageRecord | null;
  derniereCycle: KitCycleRecord | null;
  historiqueComplet: KitLogEntry[];
}

const KITS_LS_KEY = "oryx_kits";

const KIT_DEFAULT_COUNT: Record<KitTypeId, number> = {
  examen: 10,
  chirurgie: 8,
  endo: 8,
};

const KIT_ID_PREFIX: Record<KitTypeId, string> = {
  examen: "EX",
  chirurgie: "CH",
  endo: "EN",
};

function buildDefaultKits(): IndividualKit[] {
  const kits: IndividualKit[] = [];
  for (const t of ["examen", "chirurgie", "endo"] as KitTypeId[]) {
    const n = KIT_DEFAULT_COUNT[t];
    const prefix = KIT_ID_PREFIX[t];
    for (let i = 1; i <= n; i++) {
      kits.push({
        id: `${prefix}-${String(i).padStart(3, "0")}`,
        type: t,
        statut: "pret",
        cycleId: null,
        derniereUtilisation: null,
        derniereCycle: null,
        historiqueComplet: [],
      });
    }
  }
  return kits;
}

function readKits(): IndividualKit[] | null {
  try {
    const raw = localStorage.getItem(KITS_LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed as IndividualKit[];
  } catch {
    return null;
  }
}

function writeKits(kits: IndividualKit[]) {
  try {
    localStorage.setItem(KITS_LS_KEY, JSON.stringify(kits));
  } catch {
    /* ignore */
  }
}

/**
 * Aligne un tableau de kits « tous prêts » avec les cycles non validés :
 * pour chaque cycle non validé, on prend N kits prêts du bon type et on
 * les marque « machine » avec l'ID du cycle.
 */
function syncKitsWithPendingCycles(
  kits: IndividualKit[],
  cycles: AutoclaveCycle[],
): IndividualKit[] {
  const pool = kits.map((k) => ({ ...k }));
  for (const c of cycles) {
    if (c.valide) continue;
    for (const kt of ["examen", "chirurgie", "endo"] as KitTypeId[]) {
      const need = c.qtyByType[kt] ?? 0;
      let taken = 0;
      for (const k of pool) {
        if (taken >= need) break;
        if (k.type !== kt) continue;
        if (k.statut !== "pret") continue;
        k.statut = "machine";
        k.cycleId = c.id;
        k.historiqueComplet = [
          ...k.historiqueComplet,
          {
            date: c.date,
            action: "sterilise",
            details: `Placé dans le cycle autoclave #${c.numero}`,
            operateur: c.operateur,
          },
        ];
        taken++;
      }
    }
  }
  return pool;
}

function statutLabel(s: KitStatut): string {
  if (s === "pret") return "Prêt";
  if (s === "sale") return "Sale";
  return "En machine";
}

const JOURNEE_BANNER_LS_KEY = "oryx_journee_banner_collapsed";

/**
 * Heuristique de mapping « soin » → type de kit stérilisé.
 * - Chirurgie : chirurgie, extraction, implant, avulsion, greffe, sinus
 * - Endo     : endo, canal, canalaire, dévital, pulpe, racine, pulpectomie
 * - Sinon    : examen (consultation, détartrage, contrôle, composite, etc.)
 */
function mapSoinToKitType(soin: string): KitTypeId {
  const s = soin.toLowerCase();
  if (
    s.includes("chirurg") ||
    s.includes("extract") ||
    s.includes("implant") ||
    s.includes("avuls") ||
    s.includes("greffe") ||
    s.includes("sinus")
  ) {
    return "chirurgie";
  }
  if (
    s.includes("endo") ||
    s.includes("canal") ||
    s.includes("dévital") ||
    s.includes("devital") ||
    s.includes("pulpe") ||
    s.includes("pulpect") ||
    s.includes("racine")
  ) {
    return "endo";
  }
  return "examen";
}

function formatFullDateFR(d: Date): string {
  return d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const LS_KEY = "dental_sterilization_data";

const KIT_TYPES: KitType[] = [
  {
    id: "examen",
    label: "Examen",
    instruments: "Miroir / Sonde / Précelles",
    icon: Stethoscope,
    color:
      "bg-[var(--ds-primary-soft)] text-[var(--ds-primary)] border-[var(--ds-primary-border)]",
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
  const [kits, setKits] = useState<IndividualKit[]>([]);
  const [cycles, setCycles] = useState<AutoclaveCycle[]>([]);

  const [showCycleModal, setShowCycleModal] = useState(false);
  const [newOperateur, setNewOperateur] = useState(DEFAULT_OPERATORS[0]);
  const [newHeure, setNewHeure] = useState<string>(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  });
  const [newBowieDick, setNewBowieDick] = useState<CycleTestResult>("conforme");
  const [newHelix, setNewHelix] = useState<CycleTestResult>("conforme");
  const [kitCounts, setKitCounts] = useState<Record<KitTypeId, number>>({
    examen: 0,
    chirurgie: 0,
    endo: 0,
  });
  const [cycleError, setCycleError] = useState<string | null>(null);

  const [usePopoverTypeId, setUsePopoverTypeId] = useState<KitTypeId | null>(
    null,
  );
  const [drawerTypeId, setDrawerTypeId] = useState<KitTypeId | null>(null);
  const [reportCycle, setReportCycle] = useState<AutoclaveCycle | null>(null);
  const [expandedHistoryKitIds, setExpandedHistoryKitIds] = useState<
    Set<string>
  >(() => new Set());
  const popoverRootRef = useRef<HTMLDivElement | null>(null);
  const cyclesSectionRef = useRef<HTMLElement | null>(null);

  const [todayAppointments, setTodayAppointments] = useState<AppointmentRdv[]>(
    [],
  );
  const [journeeBannerCollapsed, setJourneeBannerCollapsed] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const data = readStorage();
    let nextCycles: AutoclaveCycle[];

    const isEmpty = data.cycles.length === 0 && isStockPristine(data.stockByType);
    if (isEmpty) {
      const seedCycles = buildSeedCycles();
      nextCycles = seedCycles;
      writeStorage({ stockByType: initialStockForSeed(), cycles: seedCycles });
    } else {
      nextCycles = data.cycles;
    }
    setCycles(nextCycles);

    const storedKits = readKits();
    if (!storedKits) {
      const fresh = syncKitsWithPendingCycles(buildDefaultKits(), nextCycles);
      setKits(fresh);
      writeKits(fresh);
    } else {
      setKits(storedKits);
    }
  }, []);

  const stockByType = useMemo<Record<KitTypeId, KitStock>>(() => {
    const next: Record<KitTypeId, KitStock> = {
      examen: { disponible: 0, sale: 0, enCours: 0 },
      chirurgie: { disponible: 0, sale: 0, enCours: 0 },
      endo: { disponible: 0, sale: 0, enCours: 0 },
    };
    for (const k of kits) {
      const st = next[k.type];
      if (!st) continue;
      if (k.statut === "pret") st.disponible++;
      else if (k.statut === "sale") st.sale++;
      else if (k.statut === "machine") st.enCours++;
    }
    return next;
  }, [kits]);

  useEffect(() => {
    if (!isMounted) return;
    writeStorage({ stockByType, cycles });
  }, [stockByType, cycles, isMounted]);

  useEffect(() => {
    if (!isMounted) return;
    writeKits(kits);
  }, [kits, isMounted]);

  useEffect(() => {
    if (!usePopoverTypeId) return;
    function onDocMouseDown(e: MouseEvent) {
      if (!popoverRootRef.current) return;
      if (!popoverRootRef.current.contains(e.target as Node)) {
        setUsePopoverTypeId(null);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [usePopoverTypeId]);

  useEffect(() => {
    if (!isMounted) return;
    const todayKey = formatDateKeyLocal(new Date());
    const refresh = () => {
      const all = readAppointmentsFromStorage();
      setTodayAppointments(all.filter((r) => r.dateKey === todayKey));
    };
    refresh();
    window.addEventListener(APPOINTMENTS_UPDATED_EVENT, refresh);
    return () =>
      window.removeEventListener(APPOINTMENTS_UPDATED_EVENT, refresh);
  }, [isMounted]);

  useEffect(() => {
    if (!isMounted) return;
    try {
      const raw = localStorage.getItem(JOURNEE_BANNER_LS_KEY);
      if (raw === "1") setJourneeBannerCollapsed(true);
    } catch {
      /* ignore */
    }
  }, [isMounted]);

  function toggleJourneeBanner() {
    setJourneeBannerCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(JOURNEE_BANNER_LS_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const journeeDemand = useMemo<Record<KitTypeId, number>>(() => {
    const acc: Record<KitTypeId, number> = {
      examen: 0,
      chirurgie: 0,
      endo: 0,
    };
    for (const rdv of todayAppointments) {
      const t = mapSoinToKitType(rdv.soin || "");
      acc[t]++;
    }
    return acc;
  }, [todayAppointments]);

  const journeeHasShortage = useMemo(
    () =>
      KIT_TYPES.some(
        (kt) => journeeDemand[kt.id] > (stockByType[kt.id]?.disponible ?? 0),
      ),
    [journeeDemand, stockByType],
  );

  function scrollToCyclesSection() {
    cyclesSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

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

    const [hh, mm] = newHeure ? newHeure.split(":").map(Number) : [new Date().getHours(), new Date().getMinutes()];
    const dateWithTime = new Date();
    dateWithTime.setHours(hh, mm, 0, 0);
    const nowISO = dateWithTime.toISOString();
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

    setKits((prev) => {
      const next = prev.map((k) => ({ ...k }));
      for (const kt of KIT_TYPES) {
        let taken = 0;
        const need = kitCounts[kt.id];
        if (need <= 0) continue;
        for (const k of next) {
          if (taken >= need) break;
          if (k.type !== kt.id) continue;
          if (k.statut !== "sale") continue;
          k.statut = "machine";
          k.cycleId = cycleId;
          k.historiqueComplet = [
            ...k.historiqueComplet,
            {
              date: nowISO,
              action: "sterilise",
              details: `Placé dans le cycle autoclave #${numero}`,
              operateur: newOperateur,
            },
          ];
          taken++;
        }
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
    const now = new Date();
    setNewHeure(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
  }

  function utiliserKitById(kitId: string) {
    const nowISO = new Date().toISOString();
    const operateur = newOperateur || DEFAULT_OPERATORS[0];
    setKits((prev) =>
      prev.map((k) => {
        if (k.id !== kitId) return k;
        if (k.statut !== "pret") return k;
        const usage: KitUsageRecord = {
          date: nowISO,
          patientNom: "—",
          patientId: "",
          dent: "—",
          operateur,
        };
        return {
          ...k,
          statut: "sale",
          cycleId: null,
          derniereUtilisation: usage,
          historiqueComplet: [
            ...k.historiqueComplet,
            {
              date: nowISO,
              action: "utilise",
              details: "Kit sorti pour utilisation clinique",
              operateur,
            },
          ],
        };
      }),
    );
    setUsePopoverTypeId(null);
  }

  function validerCycle(cycle: AutoclaveCycle) {
    if (cycle.valide) return;
    const nowISO = new Date().toISOString();
    setKits((prev) =>
      prev.map((k) => {
        if (k.cycleId !== cycle.id) return k;
        const cycleRecord: KitCycleRecord = {
          date: nowISO,
          operateur: cycle.operateur,
          bowieDick: cycle.bowieDick,
          helix: cycle.helix,
        };
        const detailsBits = [
          `Cycle #${cycle.numero} validé`,
          `Bowie-Dick ${cycle.bowieDick}`,
          `Helix ${cycle.helix}`,
        ];
        return {
          ...k,
          statut: "pret",
          cycleId: null,
          derniereCycle: cycleRecord,
          historiqueComplet: [
            ...k.historiqueComplet,
            {
              date: nowISO,
              action: "sterilise",
              details: detailsBits.join(" — "),
              operateur: cycle.operateur,
            },
          ],
        };
      }),
    );
    setCycles((prev) =>
      prev.map((c) => (c.id === cycle.id ? { ...c, valide: true } : c)),
    );
  }

  function toggleKitHistory(kitId: string) {
    setExpandedHistoryKitIds((prev) => {
      const next = new Set(prev);
      if (next.has(kitId)) next.delete(kitId);
      else next.add(kitId);
      return next;
    });
  }

  if (!isMounted) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-[var(--ds-text-muted)]">Chargement…</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[color:var(--ds-text)]">
            Stérilisation
          </h1>
          <p className="mt-1 text-sm text-[var(--ds-text-muted)]">
            Boucle stock : prêt → utilisé (sale) → autoclave (en cours) → prêt.
          </p>
        </div>
        <AnimatedButton onClick={() => setShowCycleModal(true)}>
          <Plus className="h-4 w-4" strokeWidth={2} />
          Nouveau Cycle
        </AnimatedButton>
      </div>

      {/* Mode Journée */}
      {(() => {
        const totalRdv = todayAppointments.length;
        const collapsed = journeeBannerCollapsed;
        const shortage = journeeHasShortage;
        const wrapperClass = shortage
          ? "border-amber-200 bg-amber-50/70 dark:border-amber-800/40 dark:bg-amber-950/50"
          : "border-emerald-100 bg-emerald-50/60 dark:border-emerald-800/40 dark:bg-emerald-950/50";
        return (
          <section
            className={[
              "rounded-2xl border px-4 py-3 transition-colors",
              wrapperClass,
            ].join(" ")}
            aria-label="Mode Journée"
          >
            <button
              type="button"
              onClick={toggleJourneeBanner}
              className="flex w-full items-center justify-between gap-3"
              aria-expanded={!collapsed}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={[
                    "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
                    shortage
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
                      : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
                  ].join(" ")}
                  aria-hidden
                >
                  {shortage ? (
                    <AlertTriangle className="h-4 w-4" />
                  ) : (
                    <Check className="h-4 w-4" strokeWidth={2.5} />
                  )}
                </span>
                <div className="min-w-0 text-left">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ds-text-muted)]">
                    Mode Journée
                  </p>
                  <p
                    className={[
                      "truncate text-sm font-semibold",
                      shortage
                        ? "text-[color:var(--ds-text)]"
                        : "text-emerald-900 dark:text-emerald-300",
                    ].join(" ")}
                  >
                    Journée du {formatFullDateFR(new Date())}
                    <span
                      className={[
                        "ml-2 text-xs font-medium",
                        shortage
                          ? "text-[var(--ds-text-muted)]"
                          : "text-emerald-700/90 dark:text-emerald-400/90",
                      ].join(" ")}
                    >
                      · {totalRdv} RDV
                    </span>
                  </p>
                </div>
              </div>
              <ChevronDown
                className={[
                  "h-4 w-4 shrink-0 text-[var(--ds-text-muted)] transition-transform",
                  collapsed ? "-rotate-90" : "",
                ].join(" ")}
              />
            </button>

            {!collapsed ? (
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-stretch">
                <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-3">
                  {KIT_TYPES.map((kt) => {
                    const demand = journeeDemand[kt.id];
                    const ready = stockByType[kt.id]?.disponible ?? 0;
                    const ok = demand <= ready;
                    return (
                      <div
                        key={kt.id}
                        className={[
                          "flex items-center gap-3 rounded-xl border bg-[var(--ds-surface)] px-3 py-2",
                          ok
                            ? "border-[var(--ds-primary-border)]"
                            : "border-amber-200 dark:border-amber-800/40",
                        ].join(" ")}
                      >
                        <span
                          className={[
                            "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border",
                            kt.color,
                          ].join(" ")}
                          aria-hidden
                        >
                          <kt.icon className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ds-text-muted)]">
                            {kt.label}
                          </p>
                          <p className="text-xs font-medium text-[var(--ds-text)]">
                            <span className="tabular-nums">{demand}</span>{" "}
                            RDV
                            <span className="text-[var(--ds-text-muted)]">
                              {" "}
                              · {ready} prêts
                            </span>
                          </p>
                        </div>
                        <span
                          className={[
                            "inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                            ok
                              ? "border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-950/45 dark:text-emerald-300"
                              : "border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/45 dark:text-amber-200",
                          ].join(" ")}
                          title={
                            ok
                              ? "Kits suffisants pour la journée"
                              : "Pas assez de kits prêts pour la journée"
                          }
                        >
                          <span aria-hidden>{ok ? "✅" : "⚠️"}</span>
                          {ok ? "Suffisant" : "Insuffisant"}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {shortage ? (
                  <div className="flex items-center justify-end sm:pl-2">
                    <button
                      type="button"
                      onClick={scrollToCyclesSection}
                      className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-800 shadow-sm transition-colors hover:bg-amber-200/80"
                    >
                      <Thermometer className="h-4 w-4" />
                      Lancer un cycle maintenant
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        );
      })()}

      {/* Cartes stock par type */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--ds-text-muted)]">
          Stock par type de kit
        </h2>
        <div className="mt-3 grid grid-cols-3 gap-4">
          {KIT_TYPES.map((kt) => {
            const st = stockByType[kt.id];
            const Icon = kt.icon;
            const canUse = st.disponible > 0;
            const popoverOpen = usePopoverTypeId === kt.id;
            const kitsOfType = kits.filter((k) => k.type === kt.id);
            return (
              <div
                key={kt.id}
                className="rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-5"
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
                      <p className="font-semibold text-[var(--ds-text)]">{kt.label}</p>
                      <p className="text-[11px] text-[var(--ds-text-muted)]">
                        {kt.instruments}
                      </p>
                    </div>
                  </div>
                  <div
                    className="relative"
                    ref={popoverOpen ? popoverRootRef : undefined}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setUsePopoverTypeId(popoverOpen ? null : kt.id)
                      }
                      disabled={!canUse}
                      title={
                        canUse
                          ? "Retirer un kit prêt (consultation)"
                          : "Aucun kit prêt"
                      }
                      className={[
                        "shrink-0 rounded-xl border px-4 py-1.5 text-xs font-semibold transition-all",
                        canUse
                          ? "border-[var(--ds-primary-border)] bg-[var(--ds-primary-soft)] text-[var(--ds-primary)] hover:bg-[var(--ds-primary)] hover:text-white"
                          : "cursor-not-allowed border-[var(--ds-primary-border)] bg-[var(--ds-bg)] text-[var(--ds-text-muted)] opacity-50",
                      ].join(" ")}
                    >
                      Utiliser
                    </button>
                    {popoverOpen ? (
                      <div className="absolute right-0 top-full z-30 mt-2 w-64 overflow-hidden rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] shadow-xl">
                        <div className="border-b border-[var(--ds-primary-border)] px-3 py-2">
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ds-text-muted)]">
                            Choisir un kit {kt.label}
                          </p>
                        </div>
                        <div className="max-h-64 overflow-y-auto py-1">
                          {kitsOfType.length === 0 ? (
                            <p className="px-3 py-3 text-xs text-[var(--ds-text-muted)]">
                              Aucun kit disponible.
                            </p>
                          ) : (
                            kitsOfType.map((k) => {
                              const isPret = k.statut === "pret";
                              const icon =
                                k.statut === "pret"
                                  ? "✅"
                                  : k.statut === "machine"
                                    ? "⚙️"
                                    : "🧴";
                              return (
                                <button
                                  key={k.id}
                                  type="button"
                                  disabled={!isPret}
                                  onClick={() =>
                                    isPret ? utiliserKitById(k.id) : undefined
                                  }
                                  className={[
                                    "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors",
                                    isPret
                                      ? "text-[var(--ds-text)] hover:bg-[var(--ds-primary-soft)]"
                                      : "cursor-not-allowed text-[var(--ds-text-muted)] opacity-60",
                                  ].join(" ")}
                                  title={
                                    isPret
                                      ? "Sélectionner ce kit"
                                      : `Statut : ${statutLabel(k.statut)}`
                                  }
                                >
                                  <span className="font-medium tabular-nums">
                                    {k.id}
                                  </span>
                                  <span className="flex items-center gap-1.5">
                                    <span
                                      className="text-sm leading-none"
                                      aria-hidden
                                    >
                                      {icon}
                                    </span>
                                    <span className="text-[10px] uppercase tracking-wider">
                                      {statutLabel(k.statut)}
                                    </span>
                                  </span>
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
                  <div className="flex min-h-0 flex-col justify-center gap-0.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-[0.4rem] text-center lg:p-[0.6rem]">
                    <p className="text-[10px] font-bold leading-tight tracking-widest text-emerald-400 lg:text-xs">
                      Prêt
                    </p>
                    <p className="text-[20px] font-bold leading-none tabular-nums text-emerald-400">
                      {st.disponible}
                    </p>
                  </div>
                  <div className="flex min-h-0 flex-col justify-center gap-0.5 rounded-xl border border-red-500/30 bg-red-500/10 p-[0.4rem] text-center lg:p-[0.6rem]">
                    <p className="text-[10px] font-bold leading-tight tracking-widest text-red-400 lg:text-xs">
                      Sale
                    </p>
                    <p className="text-[20px] font-bold leading-none tabular-nums text-red-400">
                      {st.sale}
                    </p>
                  </div>
                  <div className="flex min-h-0 flex-col justify-center gap-0.5 rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-primary-soft)] p-[0.4rem] text-center lg:p-[0.6rem]">
                    <p className="text-[10px] font-bold leading-tight tracking-widest text-[var(--ds-primary)] lg:text-xs">
                      En machine
                    </p>
                    <p className="text-[20px] font-bold leading-none tabular-nums text-[var(--ds-primary)]">
                      {st.enCours}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setDrawerTypeId(kt.id)}
                    className="text-[11px] font-medium text-[var(--ds-primary)] underline-offset-2 transition-colors hover:underline"
                  >
                    Voir les kits
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-5">
        <p className="mb-4 text-xs font-bold tracking-widest text-[var(--ds-text-muted)]">
          Totaux agrégés
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-[var(--ds-surface)] px-3 py-2 shadow-sm">
            <span className="text-xs font-medium text-emerald-800">Prêt</span>
            <span className="text-lg font-bold tabular-nums text-emerald-700">
              {totals.disponible}
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-red-100 bg-[var(--ds-surface)] px-3 py-2 shadow-sm">
            <span className="text-xs font-medium text-red-800">Sale</span>
            <span className="text-lg font-bold tabular-nums text-red-700">
              {totals.sale}
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 py-2 shadow-sm">
            <span className="text-xs font-medium text-[var(--ds-primary-hover)]">En machine</span>
            <span className="text-lg font-bold tabular-nums text-[var(--ds-primary)]">
              {totals.enCours}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-400">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
            <span>
              {totals.disponible} kit{totals.disponible !== 1 ? "s" : ""} prêt
              {totals.disponible !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={ShieldCheck}
          label="Kits prêts (disponible)"
          value={String(totals.disponible)}
          badgeClass="bg-emerald-50 text-emerald-700"
          cardClass="border-emerald-200 bg-emerald-50"
        />
        <KpiCard
          icon={Thermometer}
          label="Cycles du jour"
          value={String(cyclesToday)}
          badgeClass="bg-violet-100 text-[var(--ds-primary)]"
          cardClass="border-violet-200 bg-violet-50"
        />
        <KpiCard
          icon={Clock}
          label="En autoclave (en cours)"
          value={String(totals.enCours)}
          badgeClass="bg-cyan-100 text-cyan-700"
          cardClass="border-cyan-200 bg-cyan-50"
        />
        <KpiCard
          icon={AlertTriangle}
          label="Kits sales (à traiter)"
          value={String(totals.sale)}
          badgeClass="bg-red-50 text-red-700"
          cardClass="border-red-200 bg-red-50"
          alert={totals.sale > 0}
        />
      </div>

      <section
        ref={cyclesSectionRef}
        className="rounded-3xl bg-[var(--ds-surface)] p-6 shadow-sm scroll-mt-24"
      >
        <h2 className="text-base font-semibold tracking-tight text-[color:var(--ds-text)]">
          Cycles Autoclave
        </h2>
        <p className="mt-1 text-xs text-[var(--ds-text-muted)]">
          Lancer un cycle consomme le stock <strong>sale</strong>. Valider le
          cycle rend les kits <strong>prêts</strong> (disponible).
        </p>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--ds-primary-border)] text-xs font-medium uppercase tracking-wider text-[var(--ds-text-muted)]">
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
            <tbody className="divide-y divide-[var(--ds-primary-border)]/40">
              {cycles.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="py-10 text-center text-sm text-[var(--ds-text-muted)]"
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
                      <tr key={c.id} className={`group${c.valide && c.helix === "non-conforme" ? " bg-orange-50" : ""}`}>
                        <td className="py-3 pr-4 font-semibold text-[var(--ds-text)]">
                          #{c.numero}
                        </td>
                        <td className="py-3 pr-4 text-[var(--ds-text-muted)]">
                          {formatDateShort(c.date)}
                          <span className="ml-1.5 tabular-nums text-xs">
                            {new Date(c.date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-[var(--ds-text-muted)]">
                          {c.operateur}
                        </td>
                        <td className="py-3 pr-4">
                          <TestBadge result={c.bowieDick} />
                        </td>
                        <td className="py-3 pr-4">
                          <TestBadge result={c.helix} />
                        </td>
                        <td className="py-3 pr-4 text-xs text-[var(--ds-text-muted)]">
                          {summary.length > 0 ? summary.join(", ") : "—"}
                        </td>
                        <td className="py-3 pr-4">
                          {c.valide ? (
                            c.helix === "non-conforme" ? (
                              <span className="inline-flex rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700 ring-1 ring-orange-200">
                                Terminé / Anomalie
                              </span>
                            ) : (
                              <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-100">
                                Terminé / Validé
                              </span>
                            )
                          ) : (
                            <span className="inline-flex rounded-full bg-[var(--ds-primary-soft)] px-2 py-0.5 text-xs font-medium text-[var(--ds-primary-hover)] ring-1 ring-[var(--ds-primary-border)]">
                              En cours
                            </span>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-right">
                          <div className="inline-flex items-center gap-2">
                            {!c.valide && (
                              <button
                                type="button"
                                onClick={() => validerCycle(c)}
                                className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100"
                              >
                                Terminer / Valider
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setReportCycle(c)}
                              className="rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-primary-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--ds-primary)] transition-colors hover:bg-[var(--ds-primary)] hover:text-white"
                            >
                              Voir rapport
                            </button>
                          </div>
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
          <div className="w-full max-w-lg rounded-3xl bg-[var(--ds-surface)] p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-[var(--ds-text-muted)]">
                  Autoclave
                </p>
                <h3 className="mt-0.5 text-lg font-semibold text-[color:var(--ds-text)]">
                  Nouveau Cycle
                </h3>
              </div>
              <button
                type="button"
                onClick={resetModal}
                className="flex h-9 w-9 items-center justify-center rounded-2xl text-[var(--ds-text-muted)] transition-colors hover:bg-[var(--ds-primary-soft)] hover:text-[var(--ds-text-muted)]"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6 space-y-5">
              <div>
                <label className="block text-xs font-medium text-[var(--ds-text)]">
                  Opérateur
                </label>
                <select
                  value={newOperateur}
                  onChange={(e) => setNewOperateur(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 py-2.5 text-sm text-[var(--ds-text)] outline-none transition-colors focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                >
                  {DEFAULT_OPERATORS.map((op) => (
                    <option key={op} value={op}>
                      {op}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--ds-text)]">
                  Heure du cycle
                </label>
                <input
                  type="time"
                  value={newHeure}
                  onChange={(e) => setNewHeure(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 py-2.5 text-sm text-[var(--ds-text)] outline-none transition-colors focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                />
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
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--ds-text-muted)]">
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
                        className="flex items-center gap-3 rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-bg)]/60 px-4 py-3"
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
                          <p className="text-sm font-medium text-[var(--ds-text)]">
                            {kt.label}
                          </p>
                          <p className="text-[11px] text-[var(--ds-text-muted)]">
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
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] text-sm font-semibold text-[var(--ds-text-muted)] transition-colors hover:bg-[var(--ds-primary-soft)]"
                          >
                            −
                          </button>
                          <span className="w-8 text-center text-sm font-bold tabular-nums text-[var(--ds-text)]">
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
                            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] text-sm font-semibold text-[var(--ds-text-muted)] transition-colors hover:bg-[var(--ds-primary-soft)]"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {totalNewKits > 0 && (
                  <p className="mt-2 text-xs text-[var(--ds-text-muted)]">
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
                className="rounded-2xl px-5 py-2.5 text-sm font-medium text-[var(--ds-text-muted)] transition-colors hover:bg-[var(--ds-primary-soft)]"
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
                    ? "cursor-not-allowed bg-[var(--ds-primary-border)]"
                    : "bg-[color:var(--ds-primary)] hover:opacity-90",
                ].join(" ")}
              >
                Confirmer le cycle
              </button>
            </div>
          </div>
        </div>
      )}

      {drawerTypeId ? (
        <KitsDrawer
          kitType={KIT_TYPE_MAP[drawerTypeId]}
          kits={kits.filter((k) => k.type === drawerTypeId)}
          expandedIds={expandedHistoryKitIds}
          onToggleHistory={toggleKitHistory}
          onClose={() => setDrawerTypeId(null)}
        />
      ) : null}

      {reportCycle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-[var(--ds-surface)] p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-[var(--ds-text-muted)]">
                  Rapport autoclave
                </p>
                <h3 className="mt-0.5 text-lg font-semibold text-[color:var(--ds-text)]">
                  Cycle #{reportCycle.numero}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setReportCycle(null)}
                className="flex h-9 w-9 items-center justify-center rounded-2xl text-[var(--ds-text-muted)] transition-colors hover:bg-[var(--ds-primary-soft)]"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 divide-y divide-[var(--ds-primary-border)] text-sm">
              <div className="flex items-center justify-between py-3">
                <span className="text-[var(--ds-text-muted)]">Date</span>
                <span className="font-medium text-[var(--ds-text)]">{formatDateShort(reportCycle.date)}</span>
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-[var(--ds-text-muted)]">Opérateur</span>
                <span className="font-medium text-[var(--ds-text)]">{reportCycle.operateur}</span>
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-[var(--ds-text-muted)]">Bowie-Dick</span>
                <TestBadge result={reportCycle.bowieDick} />
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-[var(--ds-text-muted)]">Helix</span>
                <TestBadge result={reportCycle.helix} />
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-[var(--ds-text-muted)]">Kits traités</span>
                <span className="text-right font-medium text-[var(--ds-text)]">
                  {KIT_TYPES.map((kt) => {
                    const n = reportCycle.qtyByType[kt.id] ?? 0;
                    return n > 0 ? `${n} ${kt.label}` : null;
                  }).filter(Boolean).join(", ") || "—"}
                </span>
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-[var(--ds-text-muted)]">Statut</span>
                {reportCycle.valide ? (
                  reportCycle.helix === "non-conforme" ? (
                    <span className="inline-flex rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700 ring-1 ring-orange-200">
                      Terminé / Anomalie
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-100">
                      Terminé / Validé
                    </span>
                  )
                ) : (
                  <span className="inline-flex rounded-full bg-[var(--ds-primary-soft)] px-2 py-0.5 text-xs font-medium text-[var(--ds-primary-hover)] ring-1 ring-[var(--ds-primary-border)]">
                    En cours
                  </span>
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setReportCycle(null)}
                className="rounded-2xl px-5 py-2.5 text-sm font-medium text-[var(--ds-text-muted)] transition-colors hover:bg-[var(--ds-primary-soft)]"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KitStatusBadge({ statut }: { statut: KitStatut }) {
  const map: Record<KitStatut, string> = {
    pret: "border-emerald-100 bg-emerald-50 text-emerald-700",
    sale: "border-red-100 bg-red-50 text-red-700",
    machine:
      "border-[var(--ds-primary-border)] bg-[var(--ds-primary-soft)] text-[var(--ds-primary-hover)]",
  };
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        map[statut],
      ].join(" ")}
    >
      {statutLabel(statut)}
    </span>
  );
}

function KitsDrawer({
  kitType,
  kits,
  expandedIds,
  onToggleHistory,
  onClose,
}: {
  kitType: KitType;
  kits: IndividualKit[];
  expandedIds: Set<string>;
  onToggleHistory: (id: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const Icon = kitType.icon;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/30 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside
        className="h-full w-full max-w-md overflow-y-auto bg-[var(--ds-surface)] shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-5 py-4">
          <div className="flex items-center gap-3">
            <span
              className={[
                "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border",
                kitType.color,
              ].join(" ")}
            >
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--ds-text-muted)]">
                Kits {kitType.label}
              </p>
              <h3 className="text-lg font-semibold tracking-tight text-[color:var(--ds-text)]">
                Traçabilité ({kits.length})
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-2xl text-[var(--ds-text-muted)] transition-colors hover:bg-[var(--ds-primary-soft)] hover:text-[var(--ds-text)]"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 px-4 py-4">
          {kits.length === 0 ? (
            <p className="px-1 py-6 text-center text-sm text-[var(--ds-text-muted)]">
              Aucun kit enregistré.
            </p>
          ) : (
            kits.map((k) => {
              const expanded = expandedIds.has(k.id);
              const utilisation = k.derniereUtilisation;
              const cycle = k.derniereCycle;
              return (
                <div
                  key={k.id}
                  className="rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-[var(--ds-text-muted)]" />
                      <p className="text-sm font-semibold tabular-nums text-[var(--ds-text)]">
                        {k.id}
                      </p>
                    </div>
                    <KitStatusBadge statut={k.statut} />
                  </div>

                  <dl className="mt-3 grid grid-cols-1 gap-2 text-xs">
                    <div>
                      <dt className="font-medium uppercase tracking-wider text-[var(--ds-text-muted)]">
                        Dernière utilisation
                      </dt>
                      <dd className="mt-0.5 text-[var(--ds-text)]">
                        {utilisation ? (
                          <>
                            <span className="font-medium">
                              {utilisation.patientNom || "—"}
                            </span>
                            {utilisation.dent && utilisation.dent !== "—" ? (
                              <span className="text-[var(--ds-text-muted)]">
                                {" "}
                                · dent {utilisation.dent}
                              </span>
                            ) : null}
                            <span className="block text-[var(--ds-text-muted)]">
                              {formatDateShort(utilisation.date)} —{" "}
                              {utilisation.operateur}
                            </span>
                          </>
                        ) : (
                          <span className="text-[var(--ds-text-muted)]">
                            Aucune utilisation enregistrée
                          </span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium uppercase tracking-wider text-[var(--ds-text-muted)]">
                        Dernier cycle
                      </dt>
                      <dd className="mt-0.5 text-[var(--ds-text)]">
                        {cycle ? (
                          <>
                            <span className="font-medium">
                              {formatDateShort(cycle.date)}
                            </span>
                            <span className="text-[var(--ds-text-muted)]">
                              {" "}
                              — {cycle.operateur}
                            </span>
                            <span className="block text-[10px] uppercase tracking-wider text-[var(--ds-text-muted)]">
                              Bowie-Dick :{" "}
                              <span
                                className={
                                  cycle.bowieDick === "conforme"
                                    ? "text-emerald-700"
                                    : "text-red-600"
                                }
                              >
                                {cycle.bowieDick}
                              </span>{" "}
                              · Helix :{" "}
                              <span
                                className={
                                  cycle.helix === "conforme"
                                    ? "text-emerald-700"
                                    : "text-red-600"
                                }
                              >
                                {cycle.helix}
                              </span>
                            </span>
                          </>
                        ) : (
                          <span className="text-[var(--ds-text-muted)]">
                            Jamais stérilisé
                          </span>
                        )}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => onToggleHistory(k.id)}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-[var(--ds-primary)] transition-colors hover:bg-[var(--ds-primary-soft)]"
                      aria-expanded={expanded}
                    >
                      {expanded ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                      Voir historique
                      <span className="text-[10px] font-normal text-[var(--ds-text-muted)]">
                        ({k.historiqueComplet.length})
                      </span>
                    </button>

                    {expanded ? (
                      <ol className="mt-2 space-y-2 border-l border-[var(--ds-primary-border)] pl-3">
                        {k.historiqueComplet.length === 0 ? (
                          <li className="text-[11px] text-[var(--ds-text-muted)]">
                            Aucun mouvement enregistré.
                          </li>
                        ) : (
                          [...k.historiqueComplet]
                            .slice()
                            .reverse()
                            .map((log, idx) => (
                              <li key={idx} className="text-[11px]">
                                <p className="font-medium text-[var(--ds-text)]">
                                  {log.details}
                                </p>
                                <p className="text-[var(--ds-text-muted)]">
                                  {formatDateShort(log.date)} — {log.operateur}{" "}
                                  · {log.action}
                                </p>
                              </li>
                            ))
                        )}
                      </ol>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>
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
  cardClass,
  alert,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  badgeClass: string;
  cardClass: string;
  alert?: boolean;
}) {
  return (
    <div
      className={[
        "kpi-card relative rounded-2xl border p-6 shadow-sm transition-shadow hover:shadow-md",
        cardClass,
        alert ? "ring-1 ring-red-200" : "",
      ].join(" ")}
    >
      <div className="flex items-center gap-3">
        <span
          className={[
            "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl",
            badgeClass,
          ].join(" ")}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--ds-text-muted)]">{label}</p>
          <p className="text-3xl font-bold tracking-tight text-[color:var(--ds-text)]">
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
      <p className="mb-1.5 text-xs font-medium text-[var(--ds-text)]">{label}</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange("conforme")}
          className={[
            "flex-1 rounded-xl border px-3 py-2 text-xs font-medium transition-colors",
            ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-[var(--ds-primary-border)] bg-[var(--ds-surface)] text-[var(--ds-text-muted)] hover:bg-[var(--ds-bg)]",
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
              : "border-[var(--ds-primary-border)] bg-[var(--ds-surface)] text-[var(--ds-text-muted)] hover:bg-[var(--ds-bg)]",
          ].join(" ")}
        >
          <XCircle className="mr-1 inline-block h-3.5 w-3.5" />
          Non-conf.
        </button>
      </div>
    </div>
  );
}
