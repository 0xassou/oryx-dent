"use client";

import type { ComponentType } from "react";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileText, LineChart, Receipt, TrendingUp } from "lucide-react";
import { FinancesRecettesTab } from "@/components/finances/FinancesRecettesTab";
import { FinancesStatistiquesTab } from "@/components/finances/FinancesStatistiquesTab";
import { FinancesRapportsTab } from "@/components/finances/FinancesRapportsTab";
import { GestionFinanciereDepensesTab } from "@/components/finances/GestionFinanciereDepensesTab";
import { useRole } from "@/hooks/useRole";

type MainTab = "recettes" | "depenses" | "statistiques" | "rapports";

function FinancesPageContent() {
  const [tab, setTab] = useState<MainTab>("recettes");
  const searchParams = useSearchParams();
  const router = useRouter();
  const { role, ready } = useRole();
  const isAdmin = ready && role === "admin";

  useEffect(() => {
    const pid = (searchParams.get("patient") ?? "").trim();
    if (pid) {
      setTab("recettes");
      return;
    }
    const qTab = (searchParams.get("tab") ?? "").trim().toLowerCase();
    if (qTab === "depenses") setTab("depenses");
    else if (qTab === "statistiques") setTab("statistiques");
    else if (qTab === "rapports") setTab("rapports");
    else setTab("recettes");
  }, [searchParams]);

  useEffect(() => {
    if (!ready) return;
    const qTab = (searchParams.get("tab") ?? "").trim().toLowerCase();
    const wantsAdminTab = qTab === "statistiques" || qTab === "rapports";
    if (!isAdmin && wantsAdminTab) {
      setTab("recettes");
      router.replace("/finances?tab=recettes");
    }
  }, [ready, isAdmin, router, searchParams]);

  const tabs: { id: MainTab; label: string; icon: ComponentType<{ className?: string }> }[] =
    [
      { id: "recettes", label: "Recettes", icon: TrendingUp },
      { id: "depenses", label: "Dépenses", icon: Receipt },
      ...(isAdmin
        ? ([
            { id: "statistiques", label: "Statistiques", icon: LineChart },
            { id: "rapports", label: "Rapports", icon: FileText },
          ] as const)
        : []),
    ];

  return (
    <div className="w-full">
      <header className="border-b border-[var(--ds-primary-border)]/90 pb-6">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--ds-text)]">
          Gestion Financière
        </h1>
        <p className="mt-1 text-sm text-[var(--ds-text-muted)]">
          Recettes, dépenses et analyses du cabinet
        </p>
        <div
          className="mt-6 inline-flex rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-bg)] p-0.5"
          role="tablist"
          aria-label="Gestion Financière"
        >
          {tabs.map((t) => {
            const selected = tab === t.id;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setTab(t.id)}
                className={[
                  "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap lg:px-4 lg:text-sm",
                  selected
                    ? "bg-[var(--ds-primary)] text-white font-semibold"
                    : "text-[var(--ds-text-muted)] hover:text-[var(--ds-text)]",
                ].join(" ")}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {t.label}
              </button>
            );
          })}
        </div>
      </header>

      <div className="mt-8" role="tabpanel">
        {tab === "recettes" ? <FinancesRecettesTab /> : null}
        {tab === "depenses" ? <GestionFinanciereDepensesTab /> : null}
        {tab === "statistiques" ? <FinancesStatistiquesTab /> : null}
        {tab === "rapports" ? <FinancesRapportsTab /> : null}
      </div>
    </div>
  );
}

export default function FinancesPage() {
  return (
    <Suspense fallback={null}>
      <FinancesPageContent />
    </Suspense>
  );
}
