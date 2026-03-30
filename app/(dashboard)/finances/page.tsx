"use client";

import { useState } from "react";
import { FinancesDashboardTab } from "@/components/finances/FinancesDashboardTab";
import { FinancesRecettesTab } from "@/components/finances/FinancesRecettesTab";
import { FinancesDepensesTab } from "@/components/finances/FinancesDepensesTab";

type MainTab = "dashboard" | "recettes" | "depenses";

export default function FinancesPage() {
  // TODO: Masquer les onglets Tableau de bord et Dépenses si l'utilisateur n'est pas Admin.
  const [tab, setTab] = useState<MainTab>("dashboard");

  const tabs: { id: MainTab; label: string }[] = [
    { id: "dashboard", label: "Tableau de bord 📊" },
    { id: "recettes", label: "Recettes 📥" },
    { id: "depenses", label: "Dépenses 📤" },
  ];

  return (
    <div className="min-h-screen bg-[#fafafa] p-4 sm:p-8">
      <div className="mx-auto max-w-6xl">
        <header className="border-b border-slate-200/90 pb-6">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            Finances
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Recettes, dépenses et pilotage en un seul endroit.
          </p>
          <nav
            className="mt-6 flex flex-wrap gap-1 border-b border-transparent"
            role="tablist"
            aria-label="Sections Finances"
          >
            {tabs.map((t) => {
              const selected = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setTab(t.id)}
                  className={[
                    "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                    selected
                      ? "border-slate-900 text-slate-900"
                      : "border-transparent text-slate-500 hover:text-slate-800",
                  ].join(" ")}
                >
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
    </div>
  );
}
