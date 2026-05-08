"use client";

import type { ComponentType } from "react";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LayoutDashboard, TrendingDown, TrendingUp } from "lucide-react";
import { FinancesDashboardTab } from "@/components/finances/FinancesDashboardTab";
import { FinancesRecettesTab } from "@/components/finances/FinancesRecettesTab";
import { FinancesDepensesTab } from "@/components/finances/FinancesDepensesTab";

type MainTab = "dashboard" | "recettes" | "depenses";

function FinancesPageContent() {
  // TODO: Masquer les onglets Tableau de bord et Dépenses si l'utilisateur n'est pas Admin.
  const [tab, setTab] = useState<MainTab>("dashboard");
  const searchParams = useSearchParams();

  useEffect(() => {
    const pid = (searchParams.get("patient") ?? "").trim();
    if (pid) setTab("recettes");
  }, [searchParams]);

  const tabs: { id: MainTab; label: string; icon: ComponentType<{ className?: string }> }[] = [
    { id: "dashboard", label: "Tableau de bord", icon: LayoutDashboard },
    { id: "recettes", label: "Recettes", icon: TrendingUp },
    { id: "depenses", label: "Dépenses", icon: TrendingDown },
  ];

  return (
    <div className="w-full">
      <header className="border-b border-[var(--ds-primary-border)]/90 pb-6">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--ds-text)]">
          Finances
        </h1>
        <p className="mt-1 text-sm text-[var(--ds-text-muted)]">
          Recettes, dépenses et pilotage en un seul endroit.
        </p>
        <nav
          className="mt-6 flex flex-nowrap gap-1 overflow-x-auto scrollbar-none border-b border-transparent"
          role="tablist"
          aria-label="Sections Finances"
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
                  "-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap lg:px-4 lg:text-sm",
                  selected
                    ? "border-[var(--ds-primary)] text-[var(--ds-text)]"
                    : "border-transparent text-[var(--ds-text-muted)] hover:text-[var(--ds-text)]",
                ].join(" ")}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {t.label}
              </button>
            );
          })}
        </nav>
      </header>

      <div className="mt-8" role="tabpanel">
        {tab === "dashboard" ? <FinancesDashboardTab /> : null}
        {tab === "recettes" ? <FinancesRecettesTab /> : null}
        {tab === "depenses" ? <FinancesDepensesTab /> : null}
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
