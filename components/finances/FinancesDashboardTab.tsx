"use client";

import Link from "next/link";
import {
  AlertCircle,
  BarChart2,
  CalendarDays,
  DollarSign,
  Download,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDZD, formatDateShort } from "@/utils/formatters";
import {
  deriveFactureStatut,
  parseFactureDateFr,
  readFacturesFromStorage,
  resteAPayer,
  type FactureDocument,
} from "@/utils/factureDocuments";
import {
  readExpensesFromStorage,
  sumExpensesByCategory,
  type DentalExpense,
} from "@/utils/expensesData";

type RevenusDatum = {
  mois: string;
  soins: number;
  protheses: number;
};

function getRevenusSixMois(): RevenusDatum[] {
  const factures = readFacturesFromStorage();
  const result: RevenusDatum[] = [];
  for (let i = 5; i >= 0; i--) {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    const mois = date.toLocaleDateString("fr-DZ", {
      month: "short",
    });
    const month = date.getMonth();
    const year = date.getFullYear();

    const facturesDuMois = factures.filter((f) => {
      const parts = f.date.split("/");
      if (parts.length !== 3) return false;
      const fMonth = parseInt(parts[1], 10) - 1;
      const fYear = parseInt(parts[2], 10);
      return fMonth === month && fYear === year;
    });

    const soins = facturesDuMois
      .filter((f) => f.montantPaye > 0)
      .reduce((s, f) => s + f.montantPaye, 0);

    result.push({ mois, soins, protheses: 0 });
  }
  return result;
}

type TopActe = { acte: string; montant: number };

function getTopActes(): TopActe[] {
  const factures = readFacturesFromStorage();
  const map: Record<string, number> = {};

  factures.forEach((f) => {
    if (!f.patient) return;
    const key = f.patient;
    map[key] = (map[key] ?? 0) + f.montantTotal;
  });

  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([acte, montant]) => ({ acte, montant }));
}

type PeriodKey = "week" | "month" | "year";

function isDateInPeriod(d: Date, period: PeriodKey): boolean {
  const ref = new Date();
  const end = new Date(ref);
  end.setHours(23, 59, 59, 999);
  const start = new Date(ref);
  if (period === "week") {
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
  } else if (period === "month") {
    start.setTime(new Date(ref.getFullYear(), ref.getMonth(), 1).getTime());
    start.setHours(0, 0, 0, 0);
  } else {
    start.setTime(new Date(ref.getFullYear(), 0, 1).getTime());
    start.setHours(0, 0, 0, 0);
  }
  const t = d.getTime();
  return t >= start.getTime() && t <= end.getTime();
}

function totalRecettesFacturesPayees(
  factures: FactureDocument[],
  period: PeriodKey,
): number {
  let s = 0;
  for (const f of factures) {
    if (deriveFactureStatut(f.montantTotal, f.montantPaye) !== "Payé") continue;
    const dt = parseFactureDateFr(f.date);
    if (!dt || !isDateInPeriod(dt, period)) continue;
    s += f.montantTotal;
  }
  return s;
}

function expensesInPeriod(
  expenses: DentalExpense[],
  period: PeriodKey,
): DentalExpense[] {
  return expenses.filter((e) => {
    const d = new Date(e.date);
    return !Number.isNaN(d.getTime()) && isDateInPeriod(d, period);
  });
}

function RevenusTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string; value?: number }>;
  label?: string;
}) {
  if (!active || !payload || !payload.length || !label) return null;

  const soins = payload.find((p) => p.dataKey === "soins")?.value ?? 0;
  const protheses = payload.find((p) => p.dataKey === "protheses")?.value ?? 0;

  return (
    <div className="rounded-lg border border-slate-700/80 bg-slate-900 px-3 py-2.5 shadow-xl">
      <p className="text-[13px] font-semibold text-white">{label}</p>
      <div className="mt-2 space-y-1">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-slate-300">Soins</span>
          <span className="text-xs font-semibold text-white tabular-nums">
            {formatDZD(Number(soins))}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-slate-300">Prothèses</span>
          <span className="text-xs font-semibold text-white tabular-nums">
            {formatDZD(Number(protheses))}
          </span>
        </div>
      </div>
    </div>
  );
}

function getDepenses6Mois() {
  const depenses = readExpensesFromStorage?.() ?? [];
  const result: { mois: string; total: number; isDemo?: boolean }[] = [];
  let hasData = false;

  for (let i = 5; i >= 0; i--) {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    const mois = date.toLocaleDateString("fr-DZ", { month: "short" });
    const month = date.getMonth();
    const year = date.getFullYear();

    const total = depenses
      .filter((d) => {
        if (!d.date) return false;
        const parts = d.date.split("/");
        if (parts.length !== 3) return false;
        return (
          parseInt(parts[1], 10) - 1 === month &&
          parseInt(parts[2], 10) === year
        );
      })
      .reduce((s, d) => s + (d.montant ?? 0), 0);

    if (total > 0) hasData = true;
    result.push({ mois, total });
  }

  if (!hasData) {
    const DEMO = [8000, 12000, 15000, 18000, 25000, 7000];
    return result.map((r, i) => ({ ...r, total: DEMO[i], isDemo: true }));
  }
  return result;
}

function getRealTransactions() {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem("dental_dashboard_docs");
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(
      (f: {
        id?: string;
        date?: string;
        patient?: string;
        montantTotal?: number;
        montantPaye?: number;
      }) => ({
        id: f.id ?? "",
        dateHeure: f.date ?? "",
        patient: f.patient ?? "",
        acteMotif: "Soins dentaires",
        montant: f.montantTotal ?? 0,
        modePaiement: "—",
        statut: deriveFactureStatut(
          f.montantTotal ?? 0,
          f.montantPaye ?? 0,
        ),
      }),
    );
  } catch {
    return [];
  }
}

export function FinancesDashboardTab() {
  const [mounted, setMounted] = useState(false);
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [activeDetail, setActiveDetail] = useState<string | null>(null);
  const [transactionTab, setTransactionTab] = useState<
    "entrees" | "sorties"
  >("entrees");

  useEffect(() => {
    setMounted(true);
  }, []);

  const {
    totalRecettes,
    totalDepenses,
    beneficeNet,
    totalImpayes,
    periodExpensesList,
    pieSlices,
  } = useMemo(() => {
    if (!mounted) {
      return {
        totalRecettes: 0,
        totalDepenses: 0,
        beneficeNet: 0,
        totalImpayes: 0,
        periodExpensesList: [] as DentalExpense[],
        pieSlices: [] as { name: string; value: number; color: string }[],
      };
    }
    const factures = readFacturesFromStorage();
    const expenses = readExpensesFromStorage();
    const tr = totalRecettesFacturesPayees(factures, period);
    const list = expensesInPeriod(expenses, period);
    const td = list.reduce((a, e) => a + e.montant, 0);
    const imp = factures.reduce((s, f) => s + resteAPayer(f), 0);
    const byCat = sumExpensesByCategory(list);
    const slices = [
      {
        name: "Produits & Stock",
        value: byCat["Produits & Stock"],
        color: "#14b8a6",
      },
      {
        name: "Prothésiste / Labo",
        value: byCat["Prothésiste / Labo"],
        color: "#a855f7",
      },
      { name: "Stock", value: byCat.Stock, color: "#06b6d4" },
      { name: "Labo", value: byCat.Labo, color: "#6366f1" },
      { name: "Frais", value: byCat.Frais, color: "#f43f5e" },
    ].filter((x) => x.value > 0);
    return {
      totalRecettes: tr,
      totalDepenses: td,
      beneficeNet: tr - td,
      totalImpayes: imp,
      periodExpensesList: list,
      pieSlices: slices,
    };
  }, [mounted, period]);

  const realTransactions = useMemo(() => getRealTransactions(), [mounted]);

  const croissanceCA = useMemo(() => {
    if (typeof window === "undefined") return 0;
    try {
      const raw = localStorage.getItem("dental_dashboard_docs");
      if (!raw) return 0;
      const factures = JSON.parse(raw) as unknown;
      if (!Array.isArray(factures)) return 0;

      const now = new Date();
      const thisMonth = now.getMonth();
      const thisYear = now.getFullYear();
      const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1;
      const lastYear = thisMonth === 0 ? thisYear - 1 : thisYear;

      const sumMonth = (m: number, y: number) =>
        factures
          .filter((f: { date?: string; montantTotal?: number; montantPaye?: number }) => {
            if (!f.date) return false;
            if (
              deriveFactureStatut(
                f.montantTotal ?? 0,
                f.montantPaye ?? 0,
              ) !== "Payé"
            ) {
              return false;
            }
            const parts = f.date.split("/");
            if (parts.length !== 3) return false;
            return (
              parseInt(parts[1], 10) - 1 === m &&
              parseInt(parts[2], 10) === y
            );
          })
          .reduce(
            (s: number, f: { montantPaye?: number }) =>
              s + (f.montantPaye ?? 0),
            0,
          );

      const current = sumMonth(thisMonth, thisYear);
      const previous = sumMonth(lastMonth, lastYear);

      if (previous === 0) return current > 0 ? 100 : 0;
      return (
        Math.round(((current - previous) / previous) * 100 * 10) / 10
      );
    } catch {
      return 0;
    }
  }, [mounted]);

  const resteARecouvrer = totalImpayes;

  const periodLabel =
    period === "week"
      ? "Cette semaine"
      : period === "year"
        ? "Cette année"
        : "Ce mois-ci";

  const revenus6M = useMemo(() => getRevenusSixMois(), [mounted]);
  const topActes = useMemo(() => getTopActes(), [mounted]);
  const depenses6M = useMemo(() => getDepenses6Mois(), [mounted]);

  const totalTop = useMemo(
    () => topActes.reduce((acc, a) => acc + a.montant, 0),
    [topActes],
  );

  const totalDepensesPie = pieSlices.reduce((a, s) => a + s.value, 0);
  const isDepensesPieEmpty = totalDepensesPie <= 0;

  const soinsColor = "#0ea5e9"; // bleu profond
  const prothesesColor = "#14b8a6"; // teal

  const IMPAYES_LIGNES = [
    {
      id: "i1",
      patient: "Mme Dupont",
      acte: "Devis Implant",
      dateSoin: "12/03/2026",
      totalFacture: 300_000,
      resteAPayer: 150_000,
    },
    {
      id: "i2",
      patient: "M. Khelil",
      acte: "Couronnes & Bridges",
      dateSoin: "05/03/2026",
      totalFacture: 220_000,
      resteAPayer: 98_000,
    },
    {
      id: "i3",
      patient: "Mme Saïd",
      acte: "Contrôle + Soins",
      dateSoin: "20/02/2026",
      totalFacture: 180_000,
      resteAPayer: 72_000,
    },
    {
      id: "i4",
      patient: "M. Ahmed",
      acte: "Endodontie",
      dateSoin: "28/02/2026",
      totalFacture: 160_000,
      resteAPayer: 64_000,
    },
  ] as const;

  function BadgeModePaiement({ mode }: { mode: string }) {
    const base =
      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border";
    if (mode === "Espèces") {
      return (
        <span className={`${base} border-emerald-200 bg-emerald-50 text-emerald-700`}>
          {mode}
        </span>
      );
    }
    if (mode === "CIB") {
      return (
        <span className={`${base} border-[var(--ds-primary-border)] bg-[var(--ds-primary-soft)] text-[var(--ds-primary)]`}>
          {mode}
        </span>
      );
    }
    if (mode === "Virement") {
      return (
        <span
          className={`${base} border-[var(--ds-primary-border)] bg-[var(--ds-bg)] text-[var(--ds-text)]`}
        >
          {mode}
        </span>
      );
    }
    if (mode === "Chèque") {
      return (
        <span
          className={`${base} border-violet-200 bg-violet-50 text-violet-700`}
        >
          {mode}
        </span>
      );
    }
    return (
      <span className={`${base} border-violet-200 bg-violet-50 text-violet-700`}>
        {mode}
      </span>
    );
  }

  function BadgeStatut({ statut }: { statut: string }) {
    const s = statut.toLowerCase();
    const isAttente = s.includes("attente");
    const isEncaisse = s.includes("encaiss") || s.includes("encais");

    if (isEncaisse && !isAttente) {
      return (
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-600/20">
          {statut}
        </span>
      );
    }

    if (isAttente) {
      return (
        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-600/20">
          {statut}
        </span>
      );
    }

    return (
      <span className="rounded-full bg-[var(--ds-primary-soft)] px-2 py-0.5 text-xs font-medium text-[var(--ds-text)] ring-1 ring-[var(--ds-primary-border)]">
        {statut}
      </span>
    );
  }

  function BlocTableauImpayes() {
    return (
      <div className="mt-6 w-full overflow-hidden rounded-xl border border-orange-100 bg-[var(--ds-surface)] shadow-sm">
        <div className="flex items-center justify-between gap-4 border-b border-orange-100 bg-[var(--ds-surface)] px-5 py-4">
          <h3 className="text-sm font-semibold text-[var(--ds-text)]">
            Détail des créances (Reste à recouvrer)
          </h3>
          <button
            type="button"
            onClick={() => setActiveDetail(null)}
            className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm font-medium text-[var(--ds-text-muted)] transition-colors hover:bg-[var(--ds-bg)]"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" strokeWidth={2.5} />
            <span className="text-xs text-[var(--ds-text-muted)]">Fermer</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr>
                <th className="bg-[var(--ds-bg)] px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--ds-text-muted)]">
                  Patient
                </th>
                <th className="bg-[var(--ds-bg)] px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--ds-text-muted)]">
                  Acte
                </th>
                <th className="bg-[var(--ds-bg)] px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--ds-text-muted)]">
                  Date du soin
                </th>
                <th className="bg-[var(--ds-bg)] px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wide text-[var(--ds-text-muted)]">
                  Total Facturé
                </th>
                <th className="bg-[var(--ds-bg)] px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wide text-[var(--ds-text-muted)]">
                  Reste à Payer
                </th>
                <th className="bg-[var(--ds-bg)] px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wide text-[var(--ds-text-muted)]">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {IMPAYES_LIGNES.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-[var(--ds-primary-border)] transition-colors hover:bg-[var(--ds-bg)]"
                >
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-[var(--ds-text)]">
                      {r.patient}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-[var(--ds-text)]">{r.acte}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-[var(--ds-text-muted)]">{r.dateSoin}</p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <p className="text-sm text-[var(--ds-text)] tabular-nums">
                      {formatDZD(r.totalFacture)}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <p className="text-sm font-semibold text-orange-600 tabular-nums">
                      {formatDZD(r.resteAPayer)}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className="rounded-md px-3 py-1 text-sm font-medium text-orange-600 transition-colors hover:bg-orange-50"
                    >
                      Relancer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="rounded-3xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-tight text-[color:var(--ds-text)]">
              Synthèse Financière
            </h2>
            <p className="mt-1 text-sm text-[var(--ds-text-muted)]">
              Vue d&apos;ensemble de votre trésorerie et de vos finances.
            </p>
          </div>

          <div className="flex items-center gap-3 self-end">
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-text-muted)]" />
              <select
                value={period}
                    onChange={(e) =>
                      setPeriod(e.target.value as PeriodKey)
                    }
                aria-label="Sélecteur de période"
                    className="appearance-none bg-[var(--ds-surface)] border border-[var(--ds-primary-border)] text-[var(--ds-text)] text-sm rounded-lg focus:ring-[var(--ds-primary)] focus:border-[var(--ds-primary)] block w-full p-2.5 pr-8 cursor-pointer shadow-sm outline-none"
              >
                    <option value="week">Cette semaine</option>
                    <option value="month">Ce mois-ci</option>
                    <option value="year">Cette année</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <div className="kpi-card rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-medium text-[var(--ds-text-muted)]">Total recettes</p>
            <div className="rounded-xl bg-emerald-50 p-2">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
            </div>
          </div>
          <p className="text-2xl font-bold leading-none tabular-nums text-emerald-600">
            {totalRecettes.toLocaleString("fr-DZ")} DA
          </p>
          <p className="mt-1 text-xs text-[var(--ds-text-muted)]">Factures payées</p>
        </div>

        <div className="kpi-card rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-medium text-[var(--ds-text-muted)]">Croissance CA</p>
            <div className="rounded-xl bg-violet-50 p-2">
              <BarChart2 className="h-4 w-4 text-violet-600" />
            </div>
          </div>
          <p className="text-2xl font-bold leading-none tabular-nums text-violet-600">
            {croissanceCA >= 0 ? "+" : ""}
            {croissanceCA.toFixed(1)}%
          </p>
          <p className="mt-1 text-xs text-[var(--ds-text-muted)]">vs mois précédent</p>
        </div>

        <div className="kpi-card rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-medium text-[var(--ds-text-muted)]">Total dépenses</p>
            <div className="rounded-xl bg-red-50 p-2">
              <TrendingDown className="h-4 w-4 text-red-500" />
            </div>
          </div>
          <p className="text-2xl font-bold leading-none tabular-nums text-red-500">
            {totalDepenses.toLocaleString("fr-DZ")} DA
          </p>
          <p className="mt-1 text-xs text-[var(--ds-text-muted)]">Ce mois-ci</p>
        </div>

        <div
          className={`kpi-card rounded-2xl border p-5 shadow-sm ${
            beneficeNet >= 0
              ? "border border-emerald-500/20 bg-emerald-50/20"
              : "border border-red-500/20 bg-red-50/20"
          }`}
        >
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-medium text-[var(--ds-text-muted)]">Bénéfice net</p>
            <div
              className={`rounded-xl p-2 ${
                beneficeNet >= 0 ? "bg-emerald-500/10" : "bg-red-500/10"
              }`}
            >
              <DollarSign
                className={`h-4 w-4 ${
                  beneficeNet >= 0 ? "text-emerald-400" : "text-red-600"
                }`}
              />
            </div>
          </div>
          <p
            className={`text-2xl font-bold leading-none tabular-nums ${
              beneficeNet >= 0 ? "text-emerald-400" : "text-red-600"
            }`}
          >
            {beneficeNet.toLocaleString("fr-DZ")} DA
          </p>
          <p className="mt-1 text-xs text-[var(--ds-text-muted)]">Recettes − Dépenses</p>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() =>
            setActiveDetail(activeDetail === "impayes" ? null : "impayes")
          }
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setActiveDetail(activeDetail === "impayes" ? null : "impayes");
            }
          }}
          className={[
            "kpi-card cursor-pointer rounded-2xl border border-orange-100 bg-[var(--ds-surface)] p-5 shadow-sm transition-all ring-offset-2 hover:shadow-md hover:ring-2 hover:ring-orange-500/50 ring-offset-[var(--ds-bg)]",
            activeDetail === "impayes" ? "ring-2 ring-orange-500" : "",
          ].join(" ")}
        >
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-medium text-[var(--ds-text-muted)]">Impayés</p>
            <div className="rounded-xl bg-orange-50 p-2">
              <AlertCircle className="h-4 w-4 text-orange-500" />
            </div>
          </div>
          <p className="text-2xl font-bold leading-none tabular-nums text-orange-600">
            {resteARecouvrer.toLocaleString("fr-DZ")} DA
          </p>
          <p className="mt-1 text-xs text-[var(--ds-text-muted)]">Factures en attente</p>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-2xl border border-[var(--ds-primary)]/20 bg-[var(--ds-primary-soft)] px-5 py-3">
        <div className="flex items-center gap-3">
          <BarChart2 className="h-5 w-5 text-[var(--ds-primary)]" />
          <div>
            <p className="text-sm font-semibold text-[var(--ds-primary)]">
              Statistiques avancées
            </p>
            <p className="text-xs text-[var(--ds-text-muted)]">
              Performance, tendances et analyse détaillée
            </p>
          </div>
        </div>
        <Link
          href="/statistiques"
          className="flex items-center gap-1.5 rounded-xl bg-[var(--ds-primary)] px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-[var(--ds-primary-hover)]"
        >
          Voir les stats →
        </Link>
      </div>

      <div className="rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-[var(--ds-text)]">
              Évolution des dépenses
            </h3>
            <p className="text-xs text-[var(--ds-text-muted)]">
              6 derniers mois · données réelles
            </p>
          </div>
        </div>

        <>
          {depenses6M[0]?.isDemo && (
            <p className="mb-2 text-xs italic text-[var(--ds-text-muted)]">
              Aperçu avec données de démonstration
            </p>
          )}
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart
              data={depenses6M}
              margin={{ top: 5, right: 5, bottom: 0, left: 0 }}
            >
              <defs>
                <linearGradient id="gradDepenses" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.06)"
                vertical={false}
              />
              <XAxis
                dataKey="mois"
                tick={{ fontSize: 11, fill: "var(--ds-text-muted)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--ds-text-muted)" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) =>
                  v >= 1000 ? `${v / 1000}k` : v.toString()
                }
              />
              <RTooltip
                contentStyle={{
                  borderRadius: "12px",
                  border: "1px solid #312e5a",
                  backgroundColor: "var(--ds-surface)",
                  fontSize: "12px",
                  color: "var(--ds-text)",
                }}
                formatter={(v) => {
                  const n = typeof v === "number" ? v : 0;
                  return [`${n.toLocaleString("fr-DZ")} DA`, "Dépenses"];
                }}
              />
              <Area
                type="monotone"
                dataKey="total"
                stroke="#f43f5e"
                strokeWidth={2.5}
                fill="url(#gradDepenses)"
                dot={{ fill: "#f43f5e", r: 3, strokeWidth: 0 }}
                activeDot={{
                  r: 5,
                  fill: "#f43f5e",
                  stroke: "var(--ds-surface)",
                  strokeWidth: 2,
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </>

        {(() => {
          const total = depenses6M.reduce((s, d) => s + d.total, 0);
          const max = depenses6M.reduce(
            (m, d) => (d.total > m.total ? d : m),
            depenses6M[0],
          );
          const avg = Math.round(total / 6);

          return (
            <div className="mt-4 grid grid-cols-3 gap-3 border-t border-[var(--ds-primary-border)] pt-4">
              <div>
                <p className="mb-1 text-xs text-[var(--ds-text-muted)]">
                  Total période
                </p>
                <p className="text-sm font-bold tabular-nums text-red-400">
                  {total.toLocaleString("fr-DZ")} DA
                </p>
              </div>
              <div>
                <p className="mb-1 text-xs text-[var(--ds-text-muted)]">
                  Mois le + élevé
                </p>
                <p className="text-sm font-bold tabular-nums text-[var(--ds-text)]">
                  {max?.mois} — {max?.total.toLocaleString("fr-DZ")} DA
                </p>
              </div>
              <div>
                <p className="mb-1 text-xs text-[var(--ds-text-muted)]">
                  Moyenne/mois
                </p>
                <p className="text-sm font-bold tabular-nums text-[var(--ds-text)]">
                  {avg.toLocaleString("fr-DZ")} DA
                </p>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Layout principal */}
      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        {/* Col gauche */}
        <div className="lg:col-span-2">
          <div className="rounded-3xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-[var(--ds-text)]">
                  Évolution des Revenus (Soins vs Prothèses)
                </h2>
                <p className="mt-1 text-xs text-[var(--ds-text-muted)]">
                  {periodLabel} • 6 derniers mois · données réelles
                </p>
              </div>
              <div className="hidden items-center gap-4 sm:flex">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: soinsColor }}
                  />
                  <span className="text-xs font-medium text-[var(--ds-text-muted)]">
                    Soins
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: prothesesColor }}
                  />
                  <span className="text-xs font-medium text-[var(--ds-text-muted)]">
                    Prothèses
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6 w-full">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={revenus6M}
                  margin={{ top: 12, right: 18, left: 0, bottom: 6 }}
                >
                  <XAxis
                    dataKey="mois"
                    tick={{ fontSize: 12, fill: "#64748b" }}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: "#64748b" }}
                    width={90}
                    tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
                  />
                  <RTooltip content={<RevenusTooltip />} />
                  <Bar
                    dataKey="soins"
                    stackId="rev"
                    fill={soinsColor}
                    radius={[6, 6, 0, 0]}
                  />
                  <Bar
                    dataKey="protheses"
                    stackId="rev"
                    fill={prothesesColor}
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Col droite */}
        <div className="lg:col-span-1">
          <div className="rounded-3xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-[var(--ds-text)]">
                  Palmarès de Rentabilité
                </h2>
                <p className="mt-1 text-xs text-[var(--ds-text-muted)]">
                  Top 3 patients · CA total
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              {topActes.map((a, idx) => {
                const pct =
                  totalTop === 0 ? 0 : Math.round((a.montant / totalTop) * 100);
                const barColor =
                  idx === 0
                    ? "bg-[var(--ds-primary)]"
                    : idx === 1
                      ? "bg-emerald-500"
                      : "bg-[var(--ds-primary)]";

                return (
                  <div key={a.acte}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-[var(--ds-text)]">
                        {a.acte}
                      </p>
                      <p className="text-sm font-bold text-[var(--ds-text)] tabular-nums">
                        {formatDZD(a.montant)}
                      </p>
                    </div>

                    <div className="mt-2 h-2 w-full rounded-full bg-[var(--ds-primary-soft)] overflow-hidden">
                      <div
                        className={`h-full ${barColor}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    <p className="mt-1 text-[11px] text-[var(--ds-text-muted)]">
                      {pct}% du top
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {activeDetail === "impayes" && <BlocTableauImpayes />}

      <div className="mt-8 overflow-hidden rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] shadow-sm">
        <div className="flex items-center justify-between gap-4 border-b border-[var(--ds-primary-border)] px-5 py-4">
          <h3 className="text-lg font-semibold text-[var(--ds-text)]">
            Registre des Transactions (Flux de trésorerie)
          </h3>

          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 py-2 text-sm font-medium text-[var(--ds-text-muted)] transition-colors hover:bg-[var(--ds-bg)]"
            aria-label="Exporter CSV"
          >
            <Download className="h-4 w-4" />
            <span>📥 Exporter (CSV)</span>
          </button>
        </div>

        <div className="mb-4 flex border-b border-[var(--ds-primary-border)]">
          <button
            type="button"
            onClick={() => setTransactionTab("entrees")}
            className={[
              "px-4 py-2 text-sm font-medium transition-colors",
              transactionTab === "entrees"
                ? "border-b-2 border-[var(--ds-primary)] text-[var(--ds-primary)]"
                : "text-[var(--ds-text-muted)] hover:text-[var(--ds-text)]",
            ].join(" ")}
          >
            🟢 Entrées (Recettes)
          </button>
          <button
            type="button"
            onClick={() => setTransactionTab("sorties")}
            className={[
              "px-4 py-2 text-sm font-medium transition-colors",
              transactionTab === "sorties"
                ? "border-b-2 border-[var(--ds-primary)] text-[var(--ds-primary)]"
                : "text-[var(--ds-text-muted)] hover:text-[var(--ds-text)]",
            ].join(" ")}
          >
            🔴 Sorties (Dépenses)
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse">
            <thead>
              <tr>
                <th className="border-b border-[var(--ds-primary-border)] bg-[var(--ds-bg)] px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--ds-text-muted)]">
                  Date &amp; Heure
                </th>
                <th className="border-b border-[var(--ds-primary-border)] bg-[var(--ds-bg)] px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--ds-text-muted)]">
                  Patient
                </th>
                <th className="border-b border-[var(--ds-primary-border)] bg-[var(--ds-bg)] px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--ds-text-muted)]">
                  Acte / Motif
                </th>
                <th className="border-b border-[var(--ds-primary-border)] bg-[var(--ds-bg)] px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wide text-[var(--ds-text-muted)]">
                  Montant
                </th>
                <th className="border-b border-[var(--ds-primary-border)] bg-[var(--ds-bg)] px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--ds-text-muted)]">
                  Mode de paiement
                </th>
                <th className="border-b border-[var(--ds-primary-border)] bg-[var(--ds-bg)] px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-[var(--ds-text-muted)]">
                  Statut
                </th>
              </tr>
            </thead>
            <tbody>
              {transactionTab === "entrees" &&
              realTransactions.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="py-12 text-center text-sm text-[var(--ds-text-muted)]"
                  >
                    Aucune recette enregistrée. Ajoutez des factures depuis
                    l&apos;onglet Recettes.
                  </td>
                </tr>
              ) : (
                (transactionTab === "entrees"
                  ? realTransactions
                  : periodExpensesList.map((e) => ({
                      id: e.id,
                      dateHeure: formatDateShort(e.date),
                      patient: e.categorie,
                      acteMotif: e.libelle,
                      montant: -e.montant,
                      modePaiement: "—",
                      statut: "Payé",
                    }))
                ).map((t) => (
                  <tr
                    key={t.id}
                    className="border-b border-[var(--ds-primary-border)] transition-colors hover:bg-[var(--ds-bg)]"
                  >
                    <td className="px-4 py-3">
                      <p className="text-sm text-[var(--ds-text)]">
                        {t.dateHeure}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-[var(--ds-text)]">
                        {t.patient}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-[var(--ds-text)]">
                        {t.acteMotif}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p
                        className={[
                          "text-sm font-semibold tabular-nums",
                          t.montant < 0
                            ? "text-rose-600"
                            : "text-[var(--ds-text)]",
                        ].join(" ")}
                      >
                        {t.montant < 0
                          ? `- ${formatDZD(Math.abs(t.montant))}`
                          : formatDZD(t.montant)}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <BadgeModePaiement mode={t.modePaiement} />
                    </td>
                    <td className="px-4 py-3">
                      <BadgeStatut statut={t.statut} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

