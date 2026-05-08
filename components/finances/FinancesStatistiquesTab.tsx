"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, TrendingDown, TrendingUp } from "lucide-react";
import {
  getDepensesByCategorieThisMonthAction,
  getGestionFinanciereKpisAction,
  getRecettesVsDepensesLast6MonthsAction,
  getTopActesFacturesAction,
  type DepensesByCategoriePoint,
  type GestionFinanciereKpis,
  type MonthlyRecettesDepensesPoint,
  type TopActeFacturePoint,
} from "@/app/actions/finances-stats";

function formatMonthLabel(isoMonthDate: string): string {
  const d = new Date(`${isoMonthDate.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return isoMonthDate.slice(0, 7);
  const raw = d.toLocaleDateString("fr-FR", { month: "short" });
  // ex: "janv." -> "Jan", "févr." -> "Fév"
  const cleaned = raw.replace(".", "");
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function formatDZD(n: number): string {
  return `${Math.round(n).toLocaleString("fr-DZ")} DA`;
}

function formatTickDzdCompact(v: unknown): string {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "";
  const abs = Math.abs(n);
  if (abs >= 1000) return `${Math.round(n / 1000)}k DA`;
  return `${Math.round(n).toLocaleString("fr-DZ")} DA`;
}

type RecettesDepensesPoint = {
  mois: string;
  recettes: number;
  depenses: number;
  benefice: number;
  profit: number;
  perte: number; // négatif
};

function RecettesDepensesTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value?: unknown; dataKey?: unknown; payload?: Record<string, unknown> }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload as Partial<RecettesDepensesPoint> | undefined;
  const recettes = Number(row?.recettes ?? 0);
  const depenses = Number(row?.depenses ?? 0);
  const benefice = Number(row?.benefice ?? recettes - depenses);
  const benefLabel = benefice >= 0 ? "Bénéfice" : "Perte";
  const benefColor = benefice >= 0 ? "#7c3aed" : "#ef4444";

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--ds-surface)] px-3 py-2 shadow-[var(--shadow-sm)]">
      <p className="text-xs font-normal text-[var(--ds-text-muted)]">{label}</p>
      <div className="mt-1 space-y-1">
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs font-normal text-[var(--ds-text)]">Recettes</span>
          <span className="font-['DM_Mono',monospace] text-xs font-bold text-[#10b981]">
            {formatDZD(recettes)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs font-normal text-[var(--ds-text)]">Dépenses</span>
          <span className="font-['DM_Mono',monospace] text-xs font-bold text-[#ef4444]">
            {formatDZD(depenses)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-[var(--border)] pt-1">
          <span className="text-xs font-normal text-[var(--ds-text)]">{benefLabel}</span>
          <span
            className="font-['DM_Mono',monospace] text-xs font-bold"
            style={{ color: benefColor }}
          >
            {benefice >= 0 ? "+" : "−"}
            {formatDZD(Math.abs(benefice))}
          </span>
        </div>
      </div>
    </div>
  );
}

function BeneficeTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value?: unknown; payload?: Record<string, unknown> }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload as Partial<RecettesDepensesPoint> | undefined;
  const b = Number(row?.benefice ?? 0);
  const isPos = b >= 0;
  const title = isPos ? "Bénéfice" : "Perte";
  const color = isPos ? "#7c3aed" : "#ef4444";
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--ds-surface)] px-3 py-2 shadow-[var(--shadow-sm)]">
      <p className="text-xs font-normal text-[var(--ds-text-muted)]">{label}</p>
      <p className="mt-1 text-xs font-normal text-[var(--ds-text)]">
        {title} :{" "}
        <span className="font-['DM_Mono',monospace] font-bold" style={{ color }}>
          {isPos ? "+" : "−"}
          {formatDZD(Math.abs(b))}
        </span>
      </p>
    </div>
  );
}

export function FinancesStatistiquesTab() {
  const [loading, setLoading] = useState(true);
  const [series, setSeries] = useState<MonthlyRecettesDepensesPoint[]>([]);
  const [pie, setPie] = useState<DepensesByCategoriePoint[]>([]);
  const [topActes, setTopActes] = useState<TopActeFacturePoint[]>([]);
  const [kpis, setKpis] = useState<GestionFinanciereKpis | null>(null);

  useEffect(() => {
    setLoading(true);
    void (async () => {
      try {
        const [s, p, top, k] = await Promise.all([
          getRecettesVsDepensesLast6MonthsAction(),
          getDepensesByCategorieThisMonthAction(),
          getTopActesFacturesAction(),
          getGestionFinanciereKpisAction(),
        ]);
        setSeries(s);
        setPie(p);
        setTopActes(top);
        setKpis(k);
      } catch (e) {
        console.error("[FinancesStatistiquesTab]", e);
        setSeries([]);
        setPie([]);
        setTopActes([]);
        setKpis(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const lineData = useMemo<RecettesDepensesPoint[]>(
    () =>
      series.map((p) => ({
        mois: formatMonthLabel(p.mois),
        recettes: p.recettes,
        depenses: p.depenses,
        benefice: p.recettes - p.depenses,
        profit: Math.max(0, p.recettes - p.depenses),
        perte: Math.min(0, p.recettes - p.depenses),
      })),
    [series],
  );

  const pieData = useMemo(
    () =>
      pie.map((p) => ({
        name: p.categorie,
        value: p.total,
      })),
    [pie],
  );

  const benef = kpis?.beneficeNetCeMois ?? 0;
  const benefColor = benef >= 0 ? "#8b5cf6" : "#ef4444";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold tracking-tight text-[var(--ds-text)]">
          Statistiques
        </h2>
        <p className="text-sm text-[var(--ds-text-muted)]">
          Recettes, dépenses et performance financière (admin uniquement).
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="h-[96px] animate-pulse rounded-2xl bg-muted" />
          <div className="h-[96px] animate-pulse rounded-2xl bg-muted" />
          <div className="h-[96px] animate-pulse rounded-2xl bg-muted" />
          <div className="h-[96px] animate-pulse rounded-2xl bg-muted" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-medium text-[var(--ds-text-muted)]">
                Recettes ce mois
              </p>
              <div className="rounded-xl bg-[var(--ds-primary-soft)] p-2">
                <TrendingUp className="h-4 w-4 text-[var(--ds-primary)]" />
              </div>
            </div>
            <p className="font-['DM_Mono',monospace] text-2xl font-bold tabular-nums text-[#10b981]">
              {formatDZD(kpis?.recettesCeMois ?? 0)}
            </p>
            <p className="mt-1 text-xs text-[var(--ds-text-muted)]">
              Encaissé (montant payé)
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-medium text-[var(--ds-text-muted)]">
                Dépenses ce mois
              </p>
              <div className="rounded-xl bg-[var(--ds-primary-soft)] p-2">
                <TrendingDown className="h-4 w-4 text-[var(--ds-primary)]" />
              </div>
            </div>
            <p className="font-['DM_Mono',monospace] text-2xl font-bold tabular-nums text-[#ef4444]">
              {formatDZD(kpis?.depensesCeMois ?? 0)}
            </p>
            <p className="mt-1 text-xs text-[var(--ds-text-muted)]">Sorties (charges)</p>
          </div>

          <div className="rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-medium text-[var(--ds-text-muted)]">
                Bénéfice net
              </p>
              <div className="rounded-xl bg-[var(--ds-primary-soft)] p-2">
                <Activity className="h-4 w-4 text-[var(--ds-primary)]" />
              </div>
            </div>
            <p
              className="font-['DM_Mono',monospace] text-2xl font-bold tabular-nums"
              style={{ color: benefColor }}
            >
              {formatDZD(benef)}
            </p>
            <p className="mt-1 text-xs text-[var(--ds-text-muted)]">Ce mois</p>
          </div>

          <div className="rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-medium text-[var(--ds-text-muted)]">
                Taux de recouvrement
              </p>
              <div className="rounded-xl bg-[var(--ds-primary-soft)] p-2">
                <Activity className="h-4 w-4 text-[var(--ds-primary)]" />
              </div>
            </div>
            <p className="font-['DM_Mono',monospace] text-2xl font-bold tabular-nums text-[var(--ds-text)]">
              {Math.round(kpis?.tauxRecouvrement ?? 0)}%
            </p>
            <p className="mt-1 text-xs text-[var(--ds-text-muted)]">
              Payé / total facturé
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--ds-surface)] p-5 shadow-[var(--shadow-sm)] lg:col-span-2">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-[var(--ds-text)]">
              Recettes vs dépenses
            </h3>
            <p className="text-xs text-[var(--ds-text-muted)]">6 derniers mois</p>
          </div>
          {loading ? (
            <div className="h-[220px] animate-pulse rounded-xl bg-muted" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={lineData} barGap={6} barCategoryGap={18}>
                <CartesianGrid vertical={false} stroke="#f1f5f9" />
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
                  tickFormatter={formatTickDzdCompact}
                />
                <Tooltip content={<RecettesDepensesTooltip />} cursor={{ fill: "transparent" }} />
                <Bar dataKey="recettes" fill="#10b981" radius={[8, 8, 0, 0]} />
                <Bar dataKey="depenses" fill="#ef4444" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}

          {/* Légende */}
          <div className="mt-4 flex items-center justify-center gap-5">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[#10b981]" />
              <span className="text-xs font-normal text-[var(--ds-text-muted)]">
                Recettes
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[#ef4444]" />
              <span className="text-xs font-normal text-[var(--ds-text-muted)]">
                Dépenses
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-[var(--ds-text)]">
              Dépenses par catégorie
            </h3>
            <p className="text-xs text-[var(--ds-text-muted)]">Ce mois</p>
          </div>
          {loading ? (
            <div className="h-[220px] animate-pulse rounded-xl bg-muted" />
          ) : pieData.length === 0 ? (
            <p className="text-sm text-[var(--ds-text-subtle)]">
              Aucune dépense enregistrée.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Tooltip
                  contentStyle={{
                    borderRadius: "12px",
                    border: "1px solid var(--ds-primary-border)",
                    backgroundColor: "var(--ds-surface)",
                    fontSize: "12px",
                  }}
                  formatter={(v) => [formatDZD(Number(v)), "Dépenses"]}
                />
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={88}
                  fill="var(--ds-primary)"
                  stroke="var(--ds-surface)"
                  strokeWidth={2}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Graphique 2 — Bénéfice net */}
      <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--ds-surface)] p-5 shadow-[var(--shadow-sm)]">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-[var(--ds-text)]">
            Bénéfice net mensuel
          </h3>
          <p className="text-xs text-[var(--ds-text-muted)]">
            Évolution sur 6 mois
          </p>
        </div>

        {loading ? (
          <div className="h-[220px] animate-pulse rounded-xl bg-muted" />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={lineData}>
              <CartesianGrid vertical={false} stroke="#f1f5f9" />
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
                tickFormatter={formatTickDzdCompact}
              />
              <ReferenceLine y={0} stroke="#e2e8f0" strokeDasharray="4 4" />
              <Tooltip content={<BeneficeTooltip />} cursor={{ fill: "transparent" }} />

              <Area
                type="monotone"
                dataKey="profit"
                stroke="#7c3aed"
                fill="#7c3aed"
                fillOpacity={0.15}
                strokeWidth={2}
                dot={(props: { cx?: number; cy?: number; value?: number }) => {
                  if (!props || !props.value || props.value <= 0) return null;
                  return (
                    <circle
                      cx={props.cx}
                      cy={props.cy}
                      r={3}
                      fill="#7c3aed"
                      stroke="#7c3aed"
                      strokeWidth={2}
                    />
                  );
                }}
                activeDot={{ r: 4 }}
              />
              <Area
                type="monotone"
                dataKey="perte"
                stroke="#ef4444"
                fill="#ef4444"
                fillOpacity={0.15}
                strokeWidth={2}
                dot={(props: { cx?: number; cy?: number; value?: number }) => {
                  if (!props || !props.value || props.value >= 0) return null;
                  return (
                    <circle
                      cx={props.cx}
                      cy={props.cy}
                      r={3}
                      fill="#ef4444"
                      stroke="#ef4444"
                      strokeWidth={2}
                    />
                  );
                }}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-5 shadow-sm">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-[var(--ds-text)]">
            Top 5 actes les plus facturés
          </h3>
          <p className="text-xs text-[var(--ds-text-muted)]">
            Basé sur `factures.actes.acteName` (montant payé).
          </p>
        </div>

        {loading ? (
          <div className="h-[220px] animate-pulse rounded-xl bg-muted" />
        ) : topActes.length === 0 ? (
          <p className="text-sm text-[var(--ds-text-subtle)]">
            Aucun acte facturé.
          </p>
        ) : (
          <div className="space-y-2">
            {topActes.map((a) => (
              <div
                key={a.acte}
                className="flex items-center justify-between gap-3 rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-bg)]/60 px-3 py-2.5"
              >
                <p className="min-w-0 truncate text-sm font-semibold text-[var(--ds-text)]">
                  {a.acte}
                </p>
                <p className="shrink-0 font-['DM_Mono',monospace] text-sm font-bold tabular-nums text-[var(--ds-text-muted)]">
                  {formatDZD(a.total)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

