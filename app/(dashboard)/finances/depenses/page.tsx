"use client";

import { FinancesDepensesTab } from "@/components/finances/FinancesDepensesTab";

/**
 * Accès direct à l’onglet Dépenses (sans Tableau de bord / Recettes).
 * Autorisé pour admin et assistante uniquement (voir `pathToNavKey` + NAV_ACCESS).
 */
export default function FinancesDepensesPage() {
  return (
    <div className="min-h-screen bg-[var(--ds-bg)] p-4 sm:p-8">
      <div className="mx-auto max-w-6xl">
        <FinancesDepensesTab />
      </div>
    </div>
  );
}
