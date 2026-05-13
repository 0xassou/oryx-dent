/**
 * Service d'exécution d'acte clinique (hyper-automatisation)
 * ---------------------------------------------------------------------------
 * Enchaîne dans une **transaction SQL** unique :
 * 1. Dossier patient : entrée d'historique clinique.
 * 2. Stock : décrément **au mieux** selon override ou défauts protocole (lignes en rupture
 *    sont ignorées et listées dans `stockWarnings` ; l’acte est tout de même enregistré).
 * 3. Facturation : ligne « en attente de paiement » avec montant de base ou override.
 *
 * Règle métier : `customConsumablesOverride` et `customPriceOverrideCents` ne modifient
 * jamais les tables `clinical_protocols` / `protocol_consumables` (réglages globaux intacts).
 *
 * Prérequis : schéma appliqué (`schema.sql`), `npm install pg`, `DATABASE_URL` configurée.
 */

import type { Pool, PoolClient } from "pg";
import { resolveProtocolDbUuid } from "@/lib/clinical/resolveProtocolDbUuid";
import { isValidPostgresProtocolUuid } from "@/lib/onboarding/seedDefaultProtocols";
import type {
  ClientProtocolBackfill,
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

/** Stock insuffisant (conservé pour appels externes ; `executeClinicalAct` ne bloque plus dessus). */
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

async function upsertProtocolFromClient(
  client: PoolClient,
  dbProtocolId: string,
  clinicId: string,
  snap: ClientProtocolBackfill,
): Promise<void> {
  const cents = Math.max(0, Math.floor(Number(snap.basePriceCents) || 0));
  await client.query(
    `
    INSERT INTO clinical_protocols (id, clinic_id, name, category, base_price_cents, active)
    VALUES ($1::uuid, $2::uuid, $3, $4, $5, true)
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      category = EXCLUDED.category,
      base_price_cents = EXCLUDED.base_price_cents,
      active = true
    `,
    [dbProtocolId, clinicId, snap.name, snap.category, cents],
  );
}

async function fetchProtocol(
  client: PoolClient,
  protocolId: string,
  clinicId: string,
): Promise<ProtocolRow | null> {
  const id = protocolId.trim();
  if (!isValidPostgresProtocolUuid(id)) return null;
  const { rows } = await client.query<ProtocolRow>(
    `
    SELECT id, name, base_price_cents
    FROM clinical_protocols
    WHERE id = $1::uuid
      AND clinic_id = $2::uuid
      AND active = true
    `,
    [id, clinicId],
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

type StockDecrementAttempt =
  | { ok: true }
  | { ok: false; displayName: string };

/**
 * Tente un décrément atomique si `quantity >= déduction`.
 * Ne lève pas d’erreur en rupture : retourne `ok: false` (l’appelant enregistre l’avertissement).
 */
async function tryDecrementStockLine(
  client: PoolClient,
  clinicId: string,
  line: StockConsumptionLine,
): Promise<StockDecrementAttempt> {
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
    const { rows } = await client.query<{ label: string | null }>(
      `
      SELECT label
      FROM stock_items
      WHERE clinic_id = $1::uuid AND id = $2::text
      `,
      [clinicId, line.stockProductId],
    );
    const displayName = rows[0]?.label?.trim() || line.stockProductId;
    return { ok: false, displayName };
  }
  return { ok: true };
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
  clientProtocol?: ClientProtocolBackfill | null,
): Promise<ExecuteClinicalActResult> {
  return executeClinicalActWithInput(pool, {
    patientId,
    protocolId,
    clinicId,
    customConsumablesOverride,
    customPriceOverrideCents,
    clientProtocol: clientProtocol ?? undefined,
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
    protocolId: uiProtocolId,
    clinicId,
    customConsumablesOverride,
    customPriceOverrideCents,
    clientProtocol,
  } = input;

  const cid = clinicId.trim();
  const dbProtocolId = resolveProtocolDbUuid(uiProtocolId, cid);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    let protocol = await fetchProtocol(client, dbProtocolId, cid);
    if (!protocol && clientProtocol) {
      await upsertProtocolFromClient(client, dbProtocolId, cid, clientProtocol);
      protocol = await fetchProtocol(client, dbProtocolId, cid);
    }
    if (!protocol) {
      throw new ClinicalProtocolNotFoundError(uiProtocolId, cid);
    }

    const defaultRows = await fetchDefaultConsumables(client, dbProtocolId);
    const defaultsMapped = mapProtocolConsumableRows(defaultRows);

    const appliedConsumables = resolveEffectiveConsumables(
      defaultsMapped,
      customConsumablesOverride,
    );

    const usesProtocolDefaults =
      customConsumablesOverride === undefined || customConsumablesOverride === null;

    if (usesProtocolDefaults && defaultsMapped.length === 0) {
      throw new ProtocolConsumablesMissingError(dbProtocolId);
    }

    if (appliedConsumables.length === 0 && usesProtocolDefaults) {
      throw new Error("Aucune ligne de consommation à appliquer après résolution.");
    }

    const mergedForStock = mergeConsumptionLines(appliedConsumables);

    // 1) Stock : déductions au mieux (rupture → avertissement, acte poursuivi)
    const stockWarnings: string[] = [];
    const deductedLines: StockConsumptionLine[] = [];
    for (const line of mergedForStock) {
      const attempt = await tryDecrementStockLine(client, cid, line);
      if (attempt.ok) {
        deductedLines.push(line);
      } else {
        stockWarnings.push(`Stock insuffisant pour ${attempt.displayName}`);
      }
    }

    const amountCents =
      customPriceOverrideCents != null && customPriceOverrideCents > 0
        ? Math.floor(customPriceOverrideCents)
        : protocol.base_price_cents > 0
          ? protocol.base_price_cents
          : (clientProtocol?.basePriceCents ?? 0);

    const consumablesSnapshot = {
      source:
        customConsumablesOverride !== undefined && customConsumablesOverride !== null
          ? "override"
          : "protocol_defaults",
      lines: mergedForStock,
      deductedStockLines: deductedLines,
      stockDeductionShortfalls:
        stockWarnings.length > 0 ? [...stockWarnings] : undefined,
      protocolId: dbProtocolId,
      uiProtocolId: uiProtocolId.trim() !== dbProtocolId ? uiProtocolId.trim() : undefined,
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
        cid,
        dbProtocolId,
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
      [patientId, cid, clinicalHistoryId, invoiceLabel, amountCents],
    );

    const invoiceLineId = invoiceInsert.rows[0]?.id;
    if (!invoiceLineId) {
      throw new Error("Échec insertion invoice_lines (aucun id retourné).");
    }

    await client.query("COMMIT");

    return {
      clinicalHistoryId,
      invoiceLineId,
      appliedConsumables: deductedLines,
      amountCents,
      ...(stockWarnings.length > 0 ? { stockWarnings } : {}),
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
