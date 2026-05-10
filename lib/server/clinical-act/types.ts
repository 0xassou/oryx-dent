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

/** Métadonnées pour créer / mettre à jour un protocole si absent en base (catalogue UI, cabinet non seedé). */
export type ClientProtocolBackfill = {
  name: string;
  category: string;
  basePriceCents: number;
};

export type ExecuteClinicalActInput = {
  patientId: string;
  /** Id protocole côté UI (UUID seed ou clé stable) — résolu en UUID DB via `resolveProtocolDbUuid`. */
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
  /**
   * Si le protocole n’existe pas encore pour ce cabinet en base, insertion / mise à jour
   * (`clinical_protocols`) avant exécution (alignement catalogue local / cockpit).
   */
  clientProtocol?: ClientProtocolBackfill | null;
};

export type ExecuteClinicalActResult = {
  clinicalHistoryId: string;
  invoiceLineId: string;
  /**
   * Lignes effectivement déstockées en base (peut être un sous-ensemble si stock insuffisant).
   */
  appliedConsumables: StockConsumptionLine[];
  /** Montant facturé effectif (centimes). */
  amountCents: number;
  /**
   * Avertissements métier (ex. stock insuffisant) : l’acte est quand même enregistré.
   */
  stockWarnings?: string[];
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
