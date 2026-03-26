/**
 * Types du service d'exécution d'acte clinique (dossier patient + stock + facturation).
 */

/** Ligne de consommation effective pour le déstockage (quantités réelles pour ce patient). */
export type StockConsumptionLine = {
  /** Identifiant produit dans `stock_items` (même clé que côté gestion de stock). */
  stockProductId: string;
  /** Quantité à déduire (peut différer du protocole si override). */
  quantity: number;
};

export type ExecuteClinicalActInput = {
  patientId: string;
  /** UUID du protocole (`clinical_protocols.id`). */
  protocolId: string;
  /** UUID du cabinet (`clinics.id`). */
  clinicId: string;
  /**
   * Si défini : liste utilisée **uniquement** pour cette exécution pour décrémenter le stock.
   * N'altère jamais le protocole global en base (réglages).
   * Si absent : on utilise les lignes `protocol_consumables` du protocole.
   */
  customConsumablesOverride?: StockConsumptionLine[] | null;
  /**
   * Montant facturé pour cette ligne, en centimes (ex : remise / majoration ponctuelle).
   * Si absent : `clinical_protocols.base_price_cents`.
   */
  customPriceOverrideCents?: number | null;
};

export type ExecuteClinicalActResult = {
  clinicalHistoryId: string;
  invoiceLineId: string;
  /** Consommables réellement appliqués (audit + cohérence avec le snapshot). */
  appliedConsumables: StockConsumptionLine[];
  /** Montant facturé effectif (centimes). */
  amountCents: number;
};

export type ProtocolConsumableRow = {
  stock_product_id: string;
  default_quantity: string;
};

export type ProtocolRow = {
  id: string;
  name: string;
  base_price_cents: number;
};
