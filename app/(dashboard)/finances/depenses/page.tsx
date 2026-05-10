"use client";

import { DepensesManager } from "@/components/depenses/DepensesManager";

/**
 * Accès direct aux dépenses (hors onglets Recettes / Statistiques / Rapports).
 */
export default function FinancesDepensesPage() {
  return (
    <div className="w-full">
      <DepensesManager showPageHeading={true} />
    </div>
  );
}
