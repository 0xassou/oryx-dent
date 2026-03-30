"use client";

import { CalendarDays, Download, TrendingUp, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Label,
  Pie,
  PieChart,
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

const REVENUS_6M: RevenusDatum[] = [
  { mois: "Avr", soins: 260_000, protheses: 170_000 },
  { mois: "Mai", soins: 300_000, protheses: 190_000 },
  { mois: "Juin", soins: 320_000, protheses: 220_000 },
  { mois: "Juil.", soins: 290_000, protheses: 240_000 },
  { mois: "Août", soins: 340_000, protheses: 260_000 },
  { mois: "Sept.", soins: 365_000, protheses: 280_000 },
];

type TopActe = { acte: string; montant: number };

const TOP_ACTES: TopActe[] = [
  { acte: "Implantologie", montant: 950_000 },
  { acte: "Couronnes & Bridges", montant: 770_000 },
  { acte: "Orthodontie", montant: 620_000 },
];

const CROISSANCE_MOCK = {
  week: "+5,2 %",
  month: "+12,4 %",
  year: "+8,1 %",
} as const;

type PeriodKey = keyof typeof CROISSANCE_MOCK;

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

function formatKpiIntegerDa(n: number): string {
  return new Intl.NumberFormat("fr-DZ", { maximumFractionDigits: 0 }).format(
    Math.round(n),
  );
}

/** Donut « vide » : un seul segment gris clair (360°). */
const EMPTY_PIE_PLACEHOLDER: { name: string; value: number; color: string }[] =
  [{ name: "__empty", value: 1, color: "#f1f5f9" }];

function DepensesDonutCenterLabel({ totalDa }: { totalDa: number }) {
  return (
    <Label
      position="center"
      content={({ viewBox }) => {
        if (
          !viewBox ||
          typeof viewBox !== "object" ||
          !("cx" in viewBox) ||
          !("cy" in viewBox)
        ) {
          return null;
        }
        const { cx, cy } = viewBox as { cx: number; cy: number };
        return (
          <g>
            <text
              x={cx}
              y={cy - 6}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#94a3b8"
              fontSize={11}
              fontWeight={500}
              letterSpacing="0.08em"
            >
              TOTAL
            </text>
            <text
              x={cx}
              y={cy + 16}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#0f172a"
              fontSize={19}
              fontWeight={700}
              className="tabular-nums"
            >
              {formatDZD(totalDa)}
            </text>
          </g>
        );
      }}
    />
  );
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

  const currentKPI = useMemo(
    () => ({
      ca: formatKpiIntegerDa(totalRecettes),
      depenses: formatKpiIntegerDa(totalDepenses),
      benefice: formatKpiIntegerDa(beneficeNet),
      impayes: formatKpiIntegerDa(totalImpayes),
      croissance: CROISSANCE_MOCK[period],
    }),
    [totalRecettes, totalDepenses, beneficeNet, totalImpayes, period],
  );

  const periodLabel =
    period === "week"
      ? "Cette semaine"
      : period === "year"
        ? "Cette année"
        : "Ce mois-ci";

  const totalTop = useMemo(
    () => TOP_ACTES.reduce((acc, a) => acc + a.montant, 0),
    [],
  );

  const croissanceSubtitle =
    period === "week"
      ? "vs semaine précédente"
      : period === "year"
        ? "vs année précédente"
        : "vs mois précédent";

  const totalDepensesPie = pieSlices.reduce((a, s) => a + s.value, 0);
  const isDepensesPieEmpty = totalDepensesPie <= 0;

  const kpis = [
    {
      label: "Total recettes",
      value: `${currentKPI.ca} DA`,
      subtitle: `${periodLabel} · factures payées (montant total)`,
      tone: "text-emerald-600",
      bg: "bg-emerald-50 border-emerald-100",
      icon: undefined,
      key: "ca" as const,
    },
    {
      label: "Croissance du CA",
      value: currentKPI.croissance,
      subtitle: croissanceSubtitle,
      tone: "text-teal-600",
      bg: "bg-teal-50 border-teal-100",
      icon: TrendingUp,
      key: "croissance" as const,
    },
    {
      label: "Total dépenses",
      value: `${currentKPI.depenses} DA`,
      subtitle: `${periodLabel} · module Dépenses (localStorage)`,
      tone: "text-rose-600",
      bg: "bg-rose-50 border-rose-100",
      icon: undefined,
      key: "depenses" as const,
    },
    {
      label: "Bénéfice net",
      value: `${currentKPI.benefice} DA`,
      subtitle: "Recettes payées − dépenses (période)",
      tone: "text-indigo-600",
      bg: "bg-indigo-50 border-indigo-100",
      icon: undefined,
      key: "benefice" as const,
    },
    {
      label: "Reste à recouvrer",
      value: `${currentKPI.impayes} DA`,
      subtitle: "Impayés / créances",
      tone: "text-orange-600",
      bg: "bg-orange-50 border-orange-100",
      icon: undefined,
      key: "impayes" as const,
    },
  ] as const;

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

  const TRANSACTIONS_MOCK = [
    {
      id: "tx1",
      dateHeure: "Aujourd'hui 14:30",
      patient: "M. Yassine",
      acteMotif: "Couronne Zircone",
      montant: 45_000,
      modePaiement: "Espèces",
      statut: "Encaissé",
    },
    {
      id: "tx2",
      dateHeure: "Aujourd'hui 11:15",
      patient: "Mme Amina",
      acteMotif: "Détartrage",
      montant: 5_000,
      modePaiement: "CIB",
      statut: "Encaissé",
    },
    {
      id: "tx3",
      dateHeure: "Hier 16:00",
      patient: "M. Khelil",
      acteMotif: "Acompte Implant",
      montant: 50_000,
      modePaiement: "Chèque",
      statut: "En attente d'encaissement",
    },
    {
      id: "tx4",
      dateHeure: "Hier 10:00",
      patient: "Mme Benali",
      acteMotif: "Consultation",
      montant: 2_000,
      modePaiement: "Espèces",
      statut: "Encaissé",
    },
    {
      id: "tx5",
      dateHeure: "Il y a 2 jours 09:40",
      patient: "M. Ahmed",
      acteMotif: "Endodontie",
      montant: 12_500,
      modePaiement: "CIB",
      statut: "En attente d'encaissement",
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
        <span className={`${base} border-sky-200 bg-sky-50 text-sky-700`}>
          {mode}
        </span>
      );
    }
    if (mode === "Virement") {
      return (
        <span
          className={`${base} border-slate-200 bg-slate-50 text-slate-700`}
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
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200">
        {statut}
      </span>
    );
  }

  function BlocTableauImpayes() {
    return (
      <div className="mt-6 w-full overflow-hidden rounded-xl border border-orange-100 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-4 border-b border-orange-100 bg-white px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-900">
            Détail des créances (Reste à recouvrer)
          </h3>
          <button
            type="button"
            onClick={() => setActiveDetail(null)}
            className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" strokeWidth={2.5} />
            <span className="text-xs text-slate-500">Fermer</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse">
            <thead>
              <tr>
                <th className="bg-slate-50 px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Patient
                </th>
                <th className="bg-slate-50 px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Acte
                </th>
                <th className="bg-slate-50 px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Date du soin
                </th>
                <th className="bg-slate-50 px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Total Facturé
                </th>
                <th className="bg-slate-50 px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Reste à Payer
                </th>
                <th className="bg-slate-50 px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {IMPAYES_LIGNES.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-slate-100 transition-colors hover:bg-slate-50"
                >
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-slate-900">
                      {r.patient}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-slate-700">{r.acte}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-slate-600">{r.dateSoin}</p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <p className="text-sm text-slate-700 tabular-nums">
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
      <div
        className="flex flex-col gap-2 rounded-2xl border border-amber-200/80 bg-gradient-to-r from-amber-50 via-amber-50/80 to-amber-50/40 px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:gap-4"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-lg leading-none" aria-hidden>
            🔒
          </span>
          <p className="text-sm font-semibold text-amber-950">
            Espace Administrateur — Accès restreint
          </p>
        </div>
        <p className="text-xs leading-relaxed text-amber-900/85 sm:border-l sm:border-amber-200/80 sm:pl-4">
          Agrégats financiers, marges et tendances : réservés au dentiste et à
          la direction. Ne pas diffuser en salle d&apos;attente.
        </p>
      </div>

      {/* En-tête */}
      <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-tight text-[color:var(--ds-text)]">
              Tableau de bord
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Pilotage stratégique : CA, croissance, bénéfices et trésorerie.
            </p>
          </div>

          <div className="flex items-center gap-3 self-end">
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <select
                value={period}
                    onChange={(e) =>
                      setPeriod(e.target.value as PeriodKey)
                    }
                aria-label="Sélecteur de période"
                    className="appearance-none bg-white border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block w-full p-2.5 pr-8 cursor-pointer shadow-sm outline-none"
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {kpis.map((kpi) => (
          (() => {
            const isImpayes = kpi.key === "impayes";
            const isActive = isImpayes && activeDetail === "impayes";
            return (
          <div
            key={kpi.key}
            role={isImpayes ? "button" : undefined}
            tabIndex={isImpayes ? 0 : undefined}
            onClick={
              isImpayes
                ? () =>
                    setActiveDetail(
                      activeDetail === "impayes" ? null : "impayes",
                    )
                : undefined
            }
            onKeyDown={
              isImpayes
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setActiveDetail(
                        activeDetail === "impayes" ? null : "impayes",
                      );
                    }
                  }
                : undefined
            }
            className={[
              "rounded-2xl border bg-white p-5 shadow-sm",
              kpi.bg,
              isImpayes
                ? "cursor-pointer transition-all ring-offset-2 hover:shadow-md hover:ring-2 hover:ring-orange-500/50 ring-offset-slate-50"
                : "",
              isActive ? "ring-2 ring-orange-500" : "",
            ].join(" ")}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-500">
                  {kpi.label}
                </p>
                <p
                  className={`mt-2 text-3xl font-bold tracking-tight ${kpi.tone}`}
                >
                  {kpi.value}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  {kpi.subtitle}
                </p>
              </div>

              {kpi.icon ? (
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-2">
                  <kpi.icon className={`h-5 w-5 ${kpi.tone}`} />
                </div>
              ) : null}
            </div>
          </div>
            );
          })()
        ))}
      </div>

      <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">
              Répartition des dépenses
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {periodLabel} · Stock, Labo, Frais (module Dépenses)
            </p>
          </div>
        </div>
        <div className="mt-6 space-y-3">
          <div className="flex flex-row flex-wrap items-center justify-center gap-6">
            <div className="h-[220px] w-full max-w-[280px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={
                      isDepensesPieEmpty ? EMPTY_PIE_PLACEHOLDER : pieSlices
                    }
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={62}
                    outerRadius={84}
                    paddingAngle={isDepensesPieEmpty ? 0 : 2}
                    stroke="none"
                    animationBegin={120}
                    animationDuration={950}
                    // Recharts applique un ressort réel ; les typings n’incluent pas encore "spring".
                    animationEasing={"spring" as never}
                  >
                    <DepensesDonutCenterLabel
                      totalDa={isDepensesPieEmpty ? 0 : totalDepensesPie}
                    />
                    {isDepensesPieEmpty ? (
                      <Cell fill="#f1f5f9" stroke="none" />
                    ) : (
                      pieSlices.map((entry) => (
                        <Cell
                          key={entry.name}
                          fill={entry.color}
                          stroke="none"
                        />
                      ))
                    )}
                  </Pie>
                  <RTooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const row = payload[0].payload as {
                        name: string;
                        value: number;
                      };
                      if (row.name === "__empty") return null;
                      const pct =
                        totalDepensesPie <= 0
                          ? 0
                          : Math.round(
                              (row.value / totalDepensesPie) * 100,
                            );
                      return (
                        <div className="rounded-lg border border-slate-700/80 bg-slate-900 px-3 py-2 shadow-xl">
                          <p className="text-xs font-semibold text-white">
                            {row.name}
                          </p>
                          <p className="mt-1 text-xs text-slate-300">
                            {formatDZD(row.value)} ({pct}%)
                          </p>
                        </div>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            {!isDepensesPieEmpty ? (
              <ul className="w-full min-w-[220px] max-w-sm space-y-3">
                {pieSlices.map((s) => {
                  const pct =
                    totalDepensesPie <= 0
                      ? 0
                      : Math.round((s.value / totalDepensesPie) * 100);
                  return (
                    <li
                      key={s.name}
                      className="flex items-center justify-between gap-4 text-sm"
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white shadow-sm"
                          style={{ backgroundColor: s.color }}
                          aria-hidden
                        />
                        <span className="font-medium text-slate-800">
                          {s.name}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-baseline justify-end gap-1 text-right">
                        <span className="text-sm font-semibold tabular-nums text-slate-900">
                          {formatDZD(s.value)}
                        </span>
                        <span className="text-[10px] font-medium tabular-nums text-slate-400">
                          ({pct}%)
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
          <p className="text-center text-[11px] leading-relaxed text-slate-400">
            Vos dépenses sont stables par rapport au mois dernier
          </p>
          {isDepensesPieEmpty ? (
            <p className="text-center text-sm text-slate-500">
              Aucune dépense enregistrée sur cette période. Ajoutez-en depuis
              l&apos;onglet Dépenses de Finances.
            </p>
          ) : null}
        </div>
      </div>

      {/* Layout principal */}
      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        {/* Col gauche */}
        <div className="lg:col-span-2">
          <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-800">
                  Évolution des Revenus (Soins vs Prothèses)
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {periodLabel} • 6 derniers mois (mock)
                </p>
              </div>
              <div className="hidden items-center gap-4 sm:flex">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: soinsColor }}
                  />
                  <span className="text-xs font-medium text-slate-600">
                    Soins
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: prothesesColor }}
                  />
                  <span className="text-xs font-medium text-slate-600">
                    Prothèses
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6 w-full">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={REVENUS_6M}
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
          <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-800">
                  Palmarès de Rentabilité
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Top 3 actes générant le CA (mock)
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              {TOP_ACTES.map((a, idx) => {
                const pct =
                  totalTop === 0 ? 0 : Math.round((a.montant / totalTop) * 100);
                const barColor =
                  idx === 0
                    ? "bg-indigo-500"
                    : idx === 1
                      ? "bg-emerald-500"
                      : "bg-sky-500";

                return (
                  <div key={a.acte}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-slate-900">
                        {a.acte}
                      </p>
                      <p className="text-sm font-bold text-slate-900 tabular-nums">
                        {formatDZD(a.montant)}
                      </p>
                    </div>

                    <div className="mt-2 h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full ${barColor}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    <p className="mt-1 text-[11px] text-slate-500">
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

      <div className="mt-8 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <h3 className="text-lg font-semibold text-slate-900">
            Registre des Transactions (Flux de trésorerie)
          </h3>

          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
            aria-label="Exporter CSV"
          >
            <Download className="h-4 w-4" />
            <span>📥 Exporter (CSV)</span>
          </button>
        </div>

        <div className="mb-4 flex border-b border-slate-200">
          <button
            type="button"
            onClick={() => setTransactionTab("entrees")}
            className={[
              "px-4 py-2 text-sm font-medium transition-colors",
              transactionTab === "entrees"
                ? "border-b-2 border-indigo-500 text-indigo-600"
                : "text-slate-500 hover:text-slate-700",
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
                ? "border-b-2 border-indigo-500 text-indigo-600"
                : "text-slate-500 hover:text-slate-700",
            ].join(" ")}
          >
            🔴 Sorties (Dépenses)
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse">
            <thead>
              <tr>
                <th className="border-b border-slate-100 bg-slate-50 px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Date &amp; Heure
                </th>
                <th className="border-b border-slate-100 bg-slate-50 px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Patient
                </th>
                <th className="border-b border-slate-100 bg-slate-50 px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Acte / Motif
                </th>
                <th className="border-b border-slate-100 bg-slate-50 px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Montant
                </th>
                <th className="border-b border-slate-100 bg-slate-50 px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Mode de paiement
                </th>
                <th className="border-b border-slate-100 bg-slate-50 px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Statut
                </th>
              </tr>
            </thead>
            <tbody>
              {(transactionTab === "entrees"
                ? TRANSACTIONS_MOCK
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
                  className="border-b border-slate-100 transition-colors hover:bg-slate-50"
                >
                  <td className="px-4 py-3">
                    <p className="text-sm text-slate-700">{t.dateHeure}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-slate-900">
                      {t.patient}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-slate-700">{t.acteMotif}</p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <p
                      className={[
                        "text-sm font-semibold tabular-nums",
                        t.montant < 0 ? "text-rose-600" : "text-slate-900",
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
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

