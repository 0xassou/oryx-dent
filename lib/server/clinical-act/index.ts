/**
 * Point d'entrée du module « exécution d'acte clinique » (backend).
 * À importer uniquement côté serveur (Route Handler, Server Action, worker).
 */

export {
  executeClinicalAct,
  executeClinicalActWithInput,
  ClinicalProtocolNotFoundError,
  ProtocolConsumablesMissingError,
  InsufficientStockError,
} from "./executeClinicalAct";

export type {
  ExecuteClinicalActInput,
  ExecuteClinicalActResult,
  StockConsumptionLine,
} from "./types";
