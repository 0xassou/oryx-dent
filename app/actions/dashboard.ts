"use server";

import { getPostgresPool } from "@/lib/server/db/pool";
import { requireBetterAuthSession } from "@/lib/server/auth/require-session";
import { logServerError } from "@/lib/server/logger";

export type DashboardUpcomingAppointment = {
  id: string;
  date: string; // YYYY-MM-DD
  heure: string; // HH:mm
  type_acte: string | null;
  patient_nom: string | null;
  patient_prenom: string | null;
};

export type DashboardStats = {
  totalPatients: number;
  rdvAujourdHui: number;
  rdvCeMois: number;
  /** RDV du mois en cours dont le statut est annulé (aligné sur `finances-stats`). */
  rdvAnnules: number;
  recettesCeMois: number;
  facturesEnAttente: number;
  stocksEnRupture: number;
  commandesLaboUrgentes: number;
  prochainsRdv: DashboardUpcomingAppointment[];
};

function toCount(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeDate(raw: unknown): string {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString().slice(0, 10);
  }
  if (typeof raw === "string") return raw.slice(0, 10);
  return String(raw ?? "").slice(0, 10);
}

function normalizeTime(raw: unknown): string {
  if (raw == null) return "";
  const s = String(raw);
  return s.length >= 5 ? s.slice(0, 5) : s;
}

function mapUpcomingRow(r: Record<string, unknown>): DashboardUpcomingAppointment {
  return {
    id: String(r.id ?? ""),
    date: normalizeDate(r.date),
    heure: normalizeTime(r.heure),
    type_acte: r.type_acte != null ? String(r.type_acte) : null,
    patient_nom: r.nom != null ? String(r.nom) : null,
    patient_prenom: r.prenom != null ? String(r.prenom) : null,
  };
}

export async function getDashboardStatsAction(): Promise<DashboardStats> {
  const auth = await requireBetterAuthSession();
  if (!auth.ok) {
    throw new Error(auth.error);
  }
  const pool = getPostgresPool();

  const qTotalPatients = pool.query(`SELECT COUNT(*)::int AS count FROM patients`);
  const qRdvToday = pool.query(
    `SELECT COUNT(*)::int AS count FROM appointments WHERE date = CURRENT_DATE`,
  );
  const qRdvMonth = pool.query(
    `
    SELECT COUNT(*)::int AS count
    FROM appointments
    WHERE date_trunc('month', date) = date_trunc('month', CURRENT_DATE)
    `,
  );
  const qRdvAnnulesMonth = pool.query(
    `
    SELECT COUNT(*)::int AS count
    FROM appointments
    WHERE date_trunc('month', date) = date_trunc('month', CURRENT_DATE)
      AND lower(coalesce(statut, '')) IN ('annule', 'annulé', 'cancelled', 'canceled')
    `,
  );
  const qRecettesMonth = pool.query(
    `
    SELECT COALESCE(SUM(montant_paye), 0)::float8 AS sum
    FROM factures
    WHERE date_trunc('month', date) = date_trunc('month', CURRENT_DATE)
    `,
  );
  const qFacturesPending = pool.query(
    `SELECT COUNT(*)::int AS count FROM factures WHERE statut = 'en_attente'`,
  );
  const qStocksRupture = pool.query(
    `SELECT COUNT(*)::int AS count FROM stocks WHERE quantite <= quantite_min`,
  );
  const qLaboUrgent = pool.query(
    `
    SELECT COUNT(*)::int AS count
    FROM commandes_labo
    WHERE statut = 'urgent'
       OR (date_retour < CURRENT_DATE AND statut NOT IN ('pose', 'recu'))
    `,
  );
  const qUpcoming = pool.query(
    `
    SELECT a.*, p.nom, p.prenom
    FROM appointments a
    LEFT JOIN patients p ON a.patient_id = p.id
    WHERE a.date >= CURRENT_DATE
    ORDER BY a.date ASC, a.heure ASC
    LIMIT 5
    `,
  );

  const [
    totalPatientsRes,
    rdvTodayRes,
    rdvMonthRes,
    rdvAnnulesMonthRes,
    recettesMonthRes,
    facturesPendingRes,
    stocksRuptureRes,
    laboUrgentRes,
    upcomingRes,
  ] = await Promise.all([
    qTotalPatients,
    qRdvToday,
    qRdvMonth,
    qRdvAnnulesMonth,
    qRecettesMonth,
    qFacturesPending,
    qStocksRupture,
    qLaboUrgent,
    qUpcoming,
  ]);

  const totalPatients = toCount(totalPatientsRes.rows[0]?.count);
  const rdvAujourdHui = toCount(rdvTodayRes.rows[0]?.count);
  const rdvCeMois = toCount(rdvMonthRes.rows[0]?.count);
  const rdvAnnules = toCount(rdvAnnulesMonthRes.rows[0]?.count);
  const recettesCeMois = toCount(recettesMonthRes.rows[0]?.sum);
  const facturesEnAttente = toCount(facturesPendingRes.rows[0]?.count);
  const stocksEnRupture = toCount(stocksRuptureRes.rows[0]?.count);
  const commandesLaboUrgentes = toCount(laboUrgentRes.rows[0]?.count);
  const prochainsRdv = (upcomingRes.rows as Record<string, unknown>[]).map((r) =>
    mapUpcomingRow(r),
  );

  return {
    totalPatients,
    rdvAujourdHui,
    rdvCeMois,
    rdvAnnules,
    recettesCeMois,
    facturesEnAttente,
    stocksEnRupture,
    commandesLaboUrgentes,
    prochainsRdv,
  };
}

/** Agrégat des libellés d’actes (JSON factures) sur ~30 jours — une requête. */
export async function getDashboardActesDistributionAction(): Promise<
  { name: string; value: number }[]
> {
  const auth = await requireBetterAuthSession();
  if (!auth.ok) {
    throw new Error(auth.error);
  }
  const pool = getPostgresPool();
  try {
    const { rows } = await pool.query<{ name: string; cnt: string }>(
      `
      SELECT COALESCE(
        NULLIF(trim(elem->>'category'), ''),
        NULLIF(trim(elem->>'acte'), ''),
        'Autre'
      ) AS name,
      COUNT(*)::text AS cnt
      FROM factures f
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(f.actes, '[]'::jsonb)) AS elem
      WHERE f.date >= (CURRENT_DATE - INTERVAL '30 days')
        AND jsonb_typeof(COALESCE(f.actes, '[]'::jsonb)) = 'array'
      GROUP BY 1
      ORDER BY COUNT(*) DESC
      LIMIT 8
      `,
    );
    return rows.map((r) => ({
      name: String(r.name ?? "Autre"),
      value: Number.parseInt(String(r.cnt ?? "0"), 10) || 0,
    }));
  } catch (e) {
    logServerError("getDashboardActesDistributionAction", e);
    return [];
  }
}

