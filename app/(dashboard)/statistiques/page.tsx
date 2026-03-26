"use client";

import { CalendarDays, Download, TrendingUp, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDZD } from "@/utils/formatters";

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

const KPI_DATA = {
  week: {
    ca: "450 000",
    depenses: "120 000",
    benefice: "330 000",
    impayes: "80 000",
  },
  month: {
    ca: "1 850 000",
    depenses: "650 000",
    benefice: "1 200 000",
    impayes: "320 000",
  },
  year: {
    ca: "18 500 000",
    depenses: "5 200 000",
    benefice: "13 300 000",
    impayes: "1 200 000",
  },
} as const;

type PeriodKey = keyof typeof KPI_DATA;

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

export default function StatistiquesPage() {
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [activeDetail, setActiveDetail] = useState<string | null>(null);
  const [transactionTab, setTransactionTab] = useState<
    "entrees" | "sorties"
  >("entrees");

  const currentKPI = KPI_DATA[period];

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

  const kpis = [
    {
      label: "CA Encaissé",
      value: `${currentKPI.ca} DA`,
      subtitle: "+ vs mois précédent",
      tone: "text-emerald-600",
      bg: "bg-emerald-50 border-emerald-100",
      icon: undefined,
    },
    {
      label: "Dépenses (Charges)",
      value: `${currentKPI.depenses} DA`,
      subtitle: "Charges & frais",
      tone: "text-rose-600",
      bg: "bg-rose-50 border-rose-100",
      icon: undefined,
    },
    {
      label: "Bénéfice Net",
      value: `${currentKPI.benefice} DA`,
      subtitle: "Après dépenses",
      tone: "text-indigo-600",
      bg: "bg-indigo-50 border-indigo-100",
      icon: TrendingUp,
    },
    {
      label: "Reste à recouvrer",
      value: `${currentKPI.impayes} DA`,
      subtitle: "Impayés / créances",
      tone: "text-orange-600",
      bg: "bg-orange-50 border-orange-100",
      icon: undefined,
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

  const TRANSACTIONS_SORTIES_MOCK = [
    {
      id: "sx1",
      dateHeure: "Aujourd'hui 09:00",
      patient: "Labo Céramique",
      acteMotif: "Prothèses Zircone (M. Yassine)",
      montant: -15_000,
      modePaiement: "Virement",
      statut: "Payé",
    },
    {
      id: "sx2",
      dateHeure: "Hier 14:00",
      patient: "Dental Santé",
      acteMotif: "Achat Gants & Anesthésie",
      montant: -35_000,
      modePaiement: "Chèque",
      statut: "Payé",
    },
    {
      id: "sx3",
      dateHeure: "Le 20/03",
      patient: "Loyer Cabinet",
      acteMotif: "Loyer Mensuel",
      montant: -80_000,
      modePaiement: "Virement",
      statut: "Payé",
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
    <div className="min-h-screen space-y-6 bg-slate-50 p-4 sm:p-6">
      {/* En-tête */}
      <div className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-[color:var(--ds-text)]">
                Statistiques &amp; Finances
              </h1>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                Privé - Accès Praticien
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              Pilotage financier premium de la clinique
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
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          (() => {
            const isImpayes = kpi.label === "Reste à recouvrer";
            const isActive = isImpayes && activeDetail === "impayes";
            return (
          <div
            key={kpi.label}
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
                  <Tooltip content={<RevenusTooltip />} />
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
                : TRANSACTIONS_SORTIES_MOCK
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

