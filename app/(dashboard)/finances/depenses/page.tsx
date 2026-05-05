"use client";

import { FinancesDepensesTab } from "@/components/finances/FinancesDepensesTab";

/**
 * Accès direct à l’onglet Dépenses (sans Tableau de bord / Recettes).
 * Autorisé pour admin et assistante uniquement (voir `pathToNavKey` + NAV_ACCESS).
 */
export default function FinancesDepensesPage() {
  return (
    <div className="w-full">
      <FinancesDepensesTab />
    </div>
  );
}
