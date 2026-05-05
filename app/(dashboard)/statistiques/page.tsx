"use client";

import { useState, useEffect, useMemo } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Label,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  TrendingUp,
  Users,
  Calendar,
  DollarSign,
  Activity,
  Award,
} from "lucide-react";
import {
  readPatientsFromStorage,
  ensurePatientsHydrated,
} from "@/utils/patientData";
import { readAppointmentsFromStorage } from "@/utils/appointmentData";
import { readFacturesFromStorage } from "@/utils/factureDocuments";

export default function StatistiquesPage() {
  const [mounted, setMounted] = useState(false);
  const [periode, setPeriode] = useState<"mois" | "trimestre" | "annee">(
    "mois",
  );

  useEffect(() => {
    setMounted(true);
    ensurePatientsHydrated();
  }, []);

  const patients = useMemo(
    () => (mounted ? readPatientsFromStorage() : []),
    [mounted],
  );

  const appointments = useMemo(
    () => (mounted ? readAppointmentsFromStorage() : []),
    [mounted],
  );

  const factures = useMemo(
    () => (mounted ? readFacturesFromStorage() : []),
    [mounted],
  );

  const totalPatients = patients.length;

  const totalCA = factures.reduce((s, f) => s + f.montantPaye, 0);

  const totalRDV = appointments.length;

  const tauxRecouvrement = useMemo(() => {
    const total = factures.reduce((s, f) => s + f.montantTotal, 0);
    const paye = factures.reduce((s, f) => s + f.montantPaye, 0);
    return total > 0 ? Math.round((paye / total) * 100) : 0;
  }, [factures]);

  const evolutionCA = useMemo(() => {
    const result: {
      mois: string;
      ca: number;
      nouveauxPatients: number;
    }[] = [];
    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const mois = date.toLocaleDateString("fr-DZ", {
        month: "short",
      });
      const month = date.getMonth();
      const year = date.getFullYear();

      const ca = factures
        .filter((f) => {
          const p = f.date.split("/");
          if (p.length !== 3) return false;
          return (
            parseInt(p[1], 10) - 1 === month && parseInt(p[2], 10) === year
          );
        })
        .reduce((s, f) => s + f.montantPaye, 0);

      const nouveauxPatients = patients.filter((p) => {
        if (!p.createdAt) return false;
        const d = new Date(p.createdAt);
        return d.getMonth() === month && d.getFullYear() === year;
      }).length;

      result.push({ mois, ca, nouveauxPatients });
    }
    return result;
  }, [factures, patients]);

  const actesData = useMemo(() => {
    if (!mounted) return [];
    const map: Record<string, number> = {};
    patients.forEach((p) => {
      try {
        const raw = localStorage.getItem(`patient_acts_${p.id}`);
        if (!raw) return;
        const acts = JSON.parse(raw) as {
          category?: string;
          acte?: string;
        }[];
        if (!Array.isArray(acts)) return;
        acts.forEach((a) => {
          const cat = a.category ?? a.acte ?? "Autre";
          map[cat] = (map[cat] ?? 0) + 1;
        });
      } catch {
        /* ignore */
      }
    });

    const COLORS = [
      "#7c3aed",
      "#06b6d4",
      "#10b981",
      "#f97316",
      "#f43f5e",
    ];
    const total = Object.values(map).reduce((s, v) => s + v, 0);
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, value], i) => ({
        name,
        value,
        pct: total > 0 ? Math.round((value / total) * 100) : 0,
        color: COLORS[i % COLORS.length],
      }));
  }, [patients, mounted]);

  const rdvParJour = useMemo(() => {
    const joursGetDay = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
    const joursOrdonnes = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
    const map: Record<string, number> = {};
    joursOrdonnes.forEach((j) => {
      map[j] = 0;
    });
    appointments.forEach((a) => {
      const d = new Date(`${a.dateKey}T12:00:00`);
      if (Number.isNaN(d.getTime())) return;
      const jour = joursGetDay[d.getDay()];
      map[jour] = (map[jour] ?? 0) + 1;
    });
    return joursOrdonnes.map((j) => ({
      jour: j,
      rdv: map[j],
    }));
  }, [appointments]);

  const topPatients = useMemo(() => {
    const map: Record<string, number> = {};
    factures.forEach((f) => {
      if (!f.patient) return;
      map[f.patient] = (map[f.patient] ?? 0) + f.montantTotal;
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([nom, ca]) => ({ nom, ca }));
  }, [factures]);

  if (!mounted) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--ds-text)]">Statistiques</h1>
            <p className="mt-1 text-sm text-[var(--ds-text-muted)]">
              Chargement des données...
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="animate-pulse rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-5 shadow-sm"
            >
              <div className="mb-4 h-3 w-24 rounded bg-[var(--ds-primary-soft)]" />
              <div className="h-8 w-32 rounded bg-[var(--ds-primary-border)]" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="h-64 animate-pulse rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-5 shadow-sm lg:col-span-2" />
          <div className="h-64 animate-pulse rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-5 shadow-sm" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ds-text)]">Statistiques</h1>
          <p className="mt-1 text-sm text-[var(--ds-text-muted)]">
            Vue d&apos;ensemble de votre activité
            <span className="ml-2 inline-flex rounded-full bg-[var(--ds-primary-soft)] px-2 py-0.5 text-xs font-medium text-[var(--ds-text-muted)]">
              {periode === "mois"
                ? "Ce mois"
                : periode === "trimestre"
                  ? "Trimestre"
                  : "Année"}
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          {(["mois", "trimestre", "annee"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriode(p)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                periode === p
                  ? "bg-[var(--ds-primary)] text-white"
                  : "bg-[var(--ds-primary-soft)] text-[var(--ds-text-muted)] hover:bg-[var(--ds-primary-border)]"
              }`}
            >
              {p === "mois"
                ? "Ce mois"
                : p === "trimestre"
                  ? "Trimestre"
                  : "Année"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {(
          [
            {
              label: "Total patients",
              value: totalPatients.toString(),
              icon: Users,
              color: "text-violet-600",
              bg: "bg-violet-50",
              sub: "dossiers actifs",
            },
            {
              label: "CA encaissé",
              value: `${totalCA.toLocaleString("fr-DZ")} DA`,
              icon: DollarSign,
              color: "text-emerald-600",
              bg: "bg-emerald-50",
              sub: "total factures payées",
            },
            {
              label: "Rendez-vous",
              value: totalRDV.toString(),
              icon: Calendar,
              color: "text-cyan-600",
              bg: "bg-cyan-50",
              sub: "planifiés au total",
            },
            {
              label: "Recouvrement",
              value: `${tauxRecouvrement}%`,
              icon: TrendingUp,
              color: "text-orange-600",
              bg: "bg-orange-50",
              sub: "factures payées / total",
            },
          ] as const
        ).map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <div
              key={i}
              className="kpi-card rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-5 shadow-sm"
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-medium text-[var(--ds-text-muted)]">{kpi.label}</p>
                <div className={`${kpi.bg} rounded-xl p-2`}>
                  <Icon className={`h-4 w-4 ${kpi.color}`} />
                </div>
              </div>
              <p className="text-2xl font-bold leading-none tabular-nums text-[var(--ds-text)]">
                {kpi.value}
              </p>
              <p className="mt-1 text-xs text-[var(--ds-text-muted)]">{kpi.sub}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-5 shadow-sm lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-[var(--ds-text)]">
                Évolution du chiffre d&apos;affaires
              </h3>
              <p className="text-xs text-[var(--ds-text-muted)]">
                6 derniers mois · données réelles
              </p>
            </div>
            <Activity className="h-4 w-4 text-[var(--ds-text-muted)]" />
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={evolutionCA}>
              <defs>
                <linearGradient id="colorCA" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
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
              <Tooltip
                contentStyle={{
                  borderRadius: "12px",
                  border: "1px solid #ede9fe",
                  fontSize: "12px",
                }}
                formatter={(v) => {
                  const n = typeof v === "number" ? v : 0;
                  return [`${n.toLocaleString("fr-DZ")} DA`, "CA encaissé"];
                }}
              />
              <Area
                type="monotone"
                dataKey="ca"
                stroke="#7c3aed"
                strokeWidth={2.5}
                fill="url(#colorCA)"
                dot={{
                  fill: "#7c3aed",
                  strokeWidth: 2,
                  r: 4,
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-[var(--ds-text)]">
              Répartition des actes
            </h3>
            <p className="text-xs text-[var(--ds-text-muted)]">Par catégorie</p>
          </div>
          {actesData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie
                    data={actesData}
                    cx="50%"
                    cy="50%"
                    innerRadius={42}
                    outerRadius={62}
                    paddingAngle={3}
                    dataKey="value"
                    strokeWidth={2}
                    stroke="var(--ds-surface)"
                  >
                    {actesData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                    <Label
                      content={({ viewBox }) => {
                        const { cx, cy } = viewBox as { cx: number; cy: number };
                        const top = actesData[0];
                        const label = top.name.length > 9 ? top.name.slice(0, 9) + "…" : top.name;
                        return (
                          <g>
                            <text
                              x={cx}
                              y={cy - 7}
                              textAnchor="middle"
                              dominantBaseline="middle"
                              style={{ fontSize: 15, fontWeight: 700, fill: "var(--ds-text)" }}
                            >
                              {top.pct}%
                            </text>
                            <text
                              x={cx}
                              y={cy + 10}
                              textAnchor="middle"
                              dominantBaseline="middle"
                              style={{ fontSize: 9, fill: "var(--ds-text-muted)" }}
                            >
                              {label}
                            </text>
                          </g>
                        );
                      }}
                      position="center"
                    />
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: "12px",
                      border: "1px solid #312e5a",
                      backgroundColor: "var(--ds-surface)",
                      fontSize: "12px",
                      color: "var(--ds-text)",
                    }}
                    formatter={(value, _name, item) => {
                      const v = typeof value === "number" ? value : 0;
                      const payload = item?.payload as
                        | { pct?: number; name?: string }
                        | undefined;
                      return [
                        `${v} actes (${payload?.pct ?? 0}%)`,
                        payload?.name ?? "",
                      ];
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-3 space-y-1.5">
                {actesData.map((d, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: d.color }}
                      />
                      <span className="max-w-[110px] truncate text-xs text-[var(--ds-text-muted)]">
                        {d.name}
                      </span>
                    </div>
                    <span className="text-xs font-bold text-[var(--ds-text)]">
                      {d.pct}%
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex h-32 items-center justify-center text-center">
              <p className="text-xs text-[var(--ds-text-muted)]">Aucun acte enregistré</p>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="text-sm font-bold text-[var(--ds-text)]">
              Activité par jour de la semaine
            </h3>
            <p className="text-xs text-[var(--ds-text-muted)]">Nombre de RDV planifiés</p>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={rdvParJour} barSize={28}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.08)"
                vertical={false}
              />
              <XAxis
                dataKey="jour"
                tick={{ fontSize: 11, fill: "var(--ds-text-muted)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--ds-text-muted)" }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: "12px",
                  fontSize: "12px",
                }}
                formatter={(v) => {
                  const n = typeof v === "number" ? v : 0;
                  return [`${n} RDV`, ""];
                }}
              />
              <Bar
                dataKey="rdv"
                fill="#7c3aed"
                radius={[6, 6, 0, 0]}
                fillOpacity={0.85}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Award className="h-4 w-4 text-[var(--ds-text-muted)]" />
            <div>
              <h3 className="text-sm font-bold text-[var(--ds-text)]">
                Top patients
              </h3>
              <p className="text-xs text-[var(--ds-text-muted)]">Par montant facturé</p>
            </div>
          </div>
          <div className="space-y-3">
            {topPatients.length > 0 ? (
              topPatients.map((p, idx) => (
                <div
                  key={p.nom}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="truncate text-sm font-medium text-[var(--ds-text)]">
                    {idx + 1}. {p.nom}
                  </span>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-[var(--ds-text)]">
                    {p.ca.toLocaleString("fr-DZ")} DA
                  </span>
                </div>
              ))
            ) : (
              <p className="text-xs text-[var(--ds-text-muted)]">Aucune facture</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
