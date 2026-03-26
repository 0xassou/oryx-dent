/**
 * Service d'exécution d'acte clinique (hyper-automatisation)
 * ---------------------------------------------------------------------------
 * Enchaîne dans une **transaction SQL** unique :
 * 1. Dossier patient : entrée d'historique clinique.
 * 2. Stock : décrément selon override **pontuel** ou consommables par défaut du protocole.
 * 3. Facturation : ligne « en attente de paiement » avec montant de base ou override.
 *
 * Règle métier : `customConsumablesOverride` et `customPriceOverrideCents` ne modifient
 * jamais les tables `clinical_protocols` / `protocol_consumables` (réglages globaux intacts).
 *
 * Prérequis : schéma appliqué (`schema.sql`), `npm install pg`, `DATABASE_URL` configurée.
 */

import type { Pool, PoolClient } from "pg";
import type {
  ExecuteClinicalActInput,
  ExecuteClinicalActResult,
  ProtocolConsumableRow,
  ProtocolRow,
  StockConsumptionLine,
} from "./types";

// ─── Erreurs métier ───────────────────────────────────────────────────────────

/** Protocole introuvable pour ce cabinet ou inactif. */
export class ClinicalProtocolNotFoundError extends Error {
  constructor(public readonly protocolId: string, public readonly clinicId: string) {
    super(`Protocole introuvable ou inactif : protocolId=${protocolId}, clinicId=${clinicId}`);
    this.name = "ClinicalProtocolNotFoundError";
  }
}

/** Protocole sans consommables en base alors qu'aucun override n'est fourni. */
export class ProtocolConsumablesMissingError extends Error {
  constructor(public readonly protocolId: string) {
    super(
      `Aucune ligne protocol_consumables pour le protocole ${protocolId} et aucun override fourni.`,
    );
    this.name = "ProtocolConsumablesMissingError";
  }
}

/** Stock insuffisant pour une ligne donnée (transaction annulée). */
export class InsufficientStockError extends Error {
  constructor(
    public readonly stockProductId: string,
    public readonly requested: number,
    public readonly available: number,
  ) {
    super(
      `Stock insuffisant pour le produit "${stockProductId}" : demandé ${requested}, disponible ${available}.`,
    );
    this.name = "InsufficientStockError";
  }
}

// ─── Résolution des consommables effectifs ───────────────────────────────────

/**
 * Détermine la liste utilisée pour le déstockage :
 * - `override` défini (y compris tableau vide `[]`) → **cette liste uniquement** pour cet acte
 *   (ex. `[]` = pas de déstockage pour ce cas précis ; ne modifie pas le protocole global).
 * - `undefined` / `null` → lignes `protocol_consumables` (défauts enregistrés).
 */
function resolveEffectiveConsumables(
  defaultsFromDb: StockConsumptionLine[],
  override: StockConsumptionLine[] | null | undefined,
): StockConsumptionLine[] {
  if (override !== undefined && override !== null) {
    return override.map((l) => ({
      stockProductId: l.stockProductId,
      quantity: l.quantity,
    }));
  }
  return defaultsFromDb;
}

function mapProtocolConsumableRows(rows: ProtocolConsumableRow[]): StockConsumptionLine[] {
  return rows.map((r) => ({
    stockProductId: r.stock_product_id,
    quantity: Number(r.default_quantity),
  }));
}

/** Regroupe les lignes portant le même `stockProductId` (somme des quantités). */
function mergeConsumptionLines(lines: StockConsumptionLine[]): StockConsumptionLine[] {
  const map = new Map<string, number>();
  for (const l of lines) {
    map.set(l.stockProductId, (map.get(l.stockProductId) ?? 0) + l.quantity);
  }
  return [...map.entries()].map(([stockProductId, quantity]) => ({
    stockProductId,
    quantity,
  }));
}

// ─── Accès base (requêtes paramétrées) ────────────────────────────────────────

async function fetchProtocol(
  client: PoolClient,
  protocolId: string,
  clinicId: string,
): Promise<ProtocolRow | null> {
  const { rows } = await client.query<ProtocolRow>(
    `
    SELECT id, name, base_price_cents
    FROM clinical_protocols
    WHERE id = $1::uuid
      AND clinic_id = $2::uuid
      AND active = true
    `,
    [protocolId, clinicId],
  );
  return rows[0] ?? null;
}

async function fetchDefaultConsumables(
  client: PoolClient,
  protocolId: string,
): Promise<ProtocolConsumableRow[]> {
  const { rows } = await client.query<ProtocolConsumableRow>(
    `
    SELECT stock_product_id, default_quantity::text
    FROM protocol_consumables
    WHERE protocol_id = $1::uuid
    ORDER BY stock_product_id
    `,
    [protocolId],
  );
  return rows;
}

async function readAvailableQuantity(
  client: PoolClient,
  clinicId: string,
  stockProductId: string,
): Promise<number> {
  const { rows } = await client.query<{ quantity: string }>(
    `
    SELECT quantity::text
    FROM stock_items
    WHERE clinic_id = $1::uuid AND id = $2::text
    `,
    [clinicId, stockProductId],
  );
  if (!rows[0]) return 0;
  return Number(rows[0].quantity);
}

/**
 * Décrément atomique avec garde : `quantity >= déduction`.
 * Retourne la quantité **avant** déduction si succès.
 */
async function decrementStockLine(
  client: PoolClient,
  clinicId: string,
  line: StockConsumptionLine,
): Promise<void> {
  if (line.quantity <= 0) {
    throw new Error(
      `Quantité invalide pour ${line.stockProductId} : ${line.quantity} (attendu > 0).`,
    );
  }

  const { rowCount } = await client.query(
    `
    UPDATE stock_items
    SET
      quantity = quantity - $1::numeric,
      updated_at = now()
    WHERE clinic_id = $2::uuid
      AND id = $3::text
      AND quantity >= $1::numeric
    `,
    [line.quantity, clinicId, line.stockProductId],
  );

  if (rowCount === 0) {
    const available = await readAvailableQuantity(client, clinicId, line.stockProductId);
    throw new InsufficientStockError(line.stockProductId, line.quantity, available);
  }
}

// ─── API publique ─────────────────────────────────────────────────────────────

/**
 * Variante à paramètres positionnels (même comportement que l'objet `input`).
 * Les overrides sont **pontuels** : ils ne mettent pas à jour le protocole global.
 */
export async function executeClinicalAct(
  pool: Pool,
  patientId: string,
  protocolId: string,
  clinicId: string,
  customConsumablesOverride?: StockConsumptionLine[] | null,
  customPriceOverrideCents?: number | null,
): Promise<ExecuteClinicalActResult> {
  return executeClinicalActWithInput(pool, {
    patientId,
    protocolId,
    clinicId,
    customConsumablesOverride,
    customPriceOverrideCents,
  });
}

/**
 * Exécute un acte clinique complet dans une transaction :
 * historique patient → déstockage → ligne de facture en attente.
 *
 * @param pool Pool `pg` (connexion PostgreSQL).
 * @param input Identifiants patient / protocole / cabinet + overrides optionnels.
 */
export async function executeClinicalActWithInput(
  pool: Pool,
  input: ExecuteClinicalActInput,
): Promise<ExecuteClinicalActResult> {
  const {
    patientId,
    protocolId,
    clinicId,
    customConsumablesOverride,
    customPriceOverrideCents,
  } = input;

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const protocol = await fetchProtocol(client, protocolId, clinicId);
    if (!protocol) {
      throw new ClinicalProtocolNotFoundError(protocolId, clinicId);
    }

    const defaultRows = await fetchDefaultConsumables(client, protocolId);
    const defaultsMapped = mapProtocolConsumableRows(defaultRows);

    const appliedConsumables = resolveEffectiveConsumables(
      defaultsMapped,
      customConsumablesOverride,
    );

    const usesProtocolDefaults =
      customConsumablesOverride === undefined || customConsumablesOverride === null;

    if (usesProtocolDefaults && defaultsMapped.length === 0) {
      throw new ProtocolConsumablesMissingError(protocolId);
    }

    if (appliedConsumables.length === 0 && usesProtocolDefaults) {
      throw new Error("Aucune ligne de consommation à appliquer après résolution.");
    }

    const mergedForStock = mergeConsumptionLines(appliedConsumables);

    // 1) Stock : déductions (skip si liste effective vide, ex. override = [])
    for (const line of mergedForStock) {
      await decrementStockLine(client, clinicId, line);
    }

    const amountCents =
      customPriceOverrideCents != null && customPriceOverrideCents >= 0
        ? Math.floor(customPriceOverrideCents)
        : protocol.base_price_cents;

    const consumablesSnapshot = {
      source:
        customConsumablesOverride !== undefined && customConsumablesOverride !== null
          ? "override"
          : "protocol_defaults",
      lines: mergedForStock,
      protocolId,
      protocolName: protocol.name,
    };

    // 2) Dossier patient : historique clinique
    const historyInsert = await client.query<{ id: string }>(
      `
      INSERT INTO patient_clinical_history (
        patient_id,
        clinic_id,
        protocol_id,
        consumables_snapshot,
        amount_cents
      )
      VALUES ($1::text, $2::uuid, $3::uuid, $4::jsonb, $5::int)
      RETURNING id::text
      `,
      [
        patientId,
        clinicId,
        protocolId,
        JSON.stringify(consumablesSnapshot),
        amountCents,
      ],
    );

    const clinicalHistoryId = historyInsert.rows[0]?.id;
    if (!clinicalHistoryId) {
      throw new Error("Échec insertion patient_clinical_history (aucun id retourné).");
    }

    const invoiceLabel = `${protocol.name}`;

    // 3) Facturation : ligne « en attente de paiement »
    const invoiceInsert = await client.query<{ id: string }>(
      `
      INSERT INTO invoice_lines (
        patient_id,
        clinic_id,
        clinical_history_id,
        label,
        amount_cents,
        status
      )
      VALUES (
        $1::text,
        $2::uuid,
        $3::uuid,
        $4::text,
        $5::int,
        'pending_payment'::invoice_line_status
      )
      RETURNING id::text
      `,
      [patientId, clinicId, clinicalHistoryId, invoiceLabel, amountCents],
    );

    const invoiceLineId = invoiceInsert.rows[0]?.id;
    if (!invoiceLineId) {
      throw new Error("Échec insertion invoice_lines (aucun id retourné).");
    }

    await client.query("COMMIT");

    return {
      clinicalHistoryId,
      invoiceLineId,
      appliedConsumables: mergedForStock,
      amountCents,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
