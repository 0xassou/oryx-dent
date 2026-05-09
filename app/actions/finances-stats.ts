"use server";

import { getPostgresPool } from "@/lib/server/db/pool";
import { requireCabinetAdminSession } from "@/lib/server/auth/require-session";

async function assertCabinetFinancesAdmin(): Promise<void> {
  const g = await requireCabinetAdminSession();
  if (!g.ok) throw new Error(g.error);
}

export type MonthlyRevenuePoint = {
  mois: string; // YYYY-MM-01
  total: number;
};

export type MonthlyRecettesDepensesPoint = {
  mois: string; // YYYY-MM-01
  recettes: number;
  depenses: number;
};

export type TopActePoint = {
  type_acte: string;
  total: number;
};

export type TopActeFacturePoint = {
  acte: string;
  total: number;
};

export type DepensesByCategoriePoint = {
  categorie: string;
  total: number;
};

export type FinancesStatsKpis = {
  revenuMoyenParPatient: number;
  tauxRecouvrement: number; // %
  nouveauxPatientsCeMois: number;
  rdvHonores: number;
  rdvAnnules: number;
};

export type ExportPeriode = "mois" | "3mois" | "6mois" | "annee";

function toNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toInt(v: unknown): number {
  return Math.trunc(toNumber(v));
}

function startDateSqlForPeriode(periode: ExportPeriode): string {
  switch (periode) {
    case "3mois":
      return "date_trunc('month', CURRENT_DATE) - interval '2 months'";
    case "6mois":
      return "date_trunc('month', CURRENT_DATE) - interval '5 months'";
    case "annee":
      return "date_trunc('year', CURRENT_DATE)";
    case "mois":
    default:
      return "date_trunc('month', CURRENT_DATE)";
  }
}

export async function getMonthlyRevenueLast12MonthsAction(): Promise<
  MonthlyRevenuePoint[]
> {
  await assertCabinetFinancesAdmin();
  const pool = getPostgresPool();
  const { rows } = await pool.query(
    `
    WITH months AS (
      SELECT generate_series(
        date_trunc('month', CURRENT_DATE) - interval '11 months',
        date_trunc('month', CURRENT_DATE),
        interval '1 month'
      ) AS mois
    ),
    revenue AS (
      SELECT date_trunc('month', date) AS mois, SUM(montant_paye)::float8 AS total
      FROM factures
      GROUP BY 1
    )
    SELECT
      m.mois::date::text AS mois,
      COALESCE(r.total, 0)::float8 AS total
    FROM months m
    LEFT JOIN revenue r ON r.mois = m.mois
    ORDER BY m.mois ASC
    `,
  );
  return (rows as Record<string, unknown>[]).map((r) => ({
    mois: String(r.mois ?? ""),
    total: toNumber(r.total),
  }));
}

export async function getTopActesAction(): Promise<TopActePoint[]> {
  await assertCabinetFinancesAdmin();
  const pool = getPostgresPool();
  const { rows } = await pool.query(
    `
    SELECT type_acte, COUNT(*)::int AS total
    FROM appointments
    WHERE type_acte IS NOT NULL AND btrim(type_acte) <> ''
    GROUP BY type_acte
    ORDER BY total DESC
    LIMIT 5
    `,
  );
  return (rows as Record<string, unknown>[]).map((r) => ({
    type_acte: String(r.type_acte ?? ""),
    total: toInt(r.total),
  }));
}

export async function getFinancesStatsKpisAction(): Promise<FinancesStatsKpis> {
  await assertCabinetFinancesAdmin();
  const pool = getPostgresPool();

  const qTotalPatients = pool.query(`SELECT COUNT(*)::int AS count FROM patients`);
  const qFacturesMonth = pool.query(
    `
    SELECT
      COALESCE(SUM(montant), 0)::float8 AS total,
      COALESCE(SUM(montant_paye), 0)::float8 AS paye
    FROM factures
    WHERE date_trunc('month', date) = date_trunc('month', CURRENT_DATE)
    `,
  );
  const qNouveauxPatients = pool.query(
    `
    SELECT COUNT(*)::int AS count
    FROM patients
    WHERE date_trunc('month', created_at) = date_trunc('month', CURRENT_DATE)
    `,
  );
  const qRdv = pool.query(
    `
    SELECT
      SUM(CASE WHEN lower(coalesce(statut,'')) IN ('termine','realise','done') THEN 1 ELSE 0 END)::int AS honores,
      SUM(CASE WHEN lower(coalesce(statut,'')) IN ('annule','annulé','cancelled','canceled') THEN 1 ELSE 0 END)::int AS annules
    FROM appointments
    WHERE date_trunc('month', date) = date_trunc('month', CURRENT_DATE)
    `,
  );

  const [pRes, fRes, nRes, rRes] = await Promise.all([
    qTotalPatients,
    qFacturesMonth,
    qNouveauxPatients,
    qRdv,
  ]);

  const totalPatients = toInt((pRes.rows[0] as Record<string, unknown> | undefined)?.count);
  const total = toNumber((fRes.rows[0] as Record<string, unknown> | undefined)?.total);
  const paye = toNumber((fRes.rows[0] as Record<string, unknown> | undefined)?.paye);
  const nouveauxPatientsCeMois = toInt(
    (nRes.rows[0] as Record<string, unknown> | undefined)?.count,
  );
  const rdvHonores = toInt(
    (rRes.rows[0] as Record<string, unknown> | undefined)?.honores,
  );
  const rdvAnnules = toInt(
    (rRes.rows[0] as Record<string, unknown> | undefined)?.annules,
  );

  const revenuMoyenParPatient = totalPatients > 0 ? paye / totalPatients : 0;
  const tauxRecouvrement = total > 0 ? (paye / total) * 100 : 0;

  return {
    revenuMoyenParPatient,
    tauxRecouvrement,
    nouveauxPatientsCeMois,
    rdvHonores,
    rdvAnnules,
  };
}

function escapeCsvCell(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export async function exportFacturesCsvAction(
  periode: ExportPeriode,
): Promise<{ filename: string; csv: string }> {
  await assertCabinetFinancesAdmin();
  const pool = getPostgresPool();
  const startExpr = startDateSqlForPeriode(periode);
  const { rows } = await pool.query(
    `
    SELECT
      f.id,
      f.date::date::text AS date,
      COALESCE(p.nom, '') AS nom,
      COALESCE(p.prenom, '') AS prenom,
      f.montant::text AS montant,
      f.montant_paye::text AS montant_paye,
      COALESCE(f.statut, '') AS statut
    FROM factures f
    LEFT JOIN patients p ON f.patient_id = p.id
    WHERE f.date >= (${startExpr})::date
      AND f.date <= CURRENT_DATE
    ORDER BY f.date DESC, f.created_at DESC
    `,
  );

  const header = [
    "id",
    "date",
    "nom",
    "prenom",
    "montant",
    "montant_paye",
    "statut",
  ].join(",");

  const lines = (rows as Record<string, unknown>[]).map((r) =>
    [
      escapeCsvCell(String(r.id ?? "")),
      escapeCsvCell(String(r.date ?? "")),
      escapeCsvCell(String(r.nom ?? "")),
      escapeCsvCell(String(r.prenom ?? "")),
      escapeCsvCell(String(r.montant ?? "")),
      escapeCsvCell(String(r.montant_paye ?? "")),
      escapeCsvCell(String(r.statut ?? "")),
    ].join(","),
  );

  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const filename = `factures_${periode}_${y}-${m}.csv`;

  return { filename, csv: [header, ...lines].join("\n") + "\n" };
}

export async function exportFacturesPdfAction(
  periode: ExportPeriode,
): Promise<{ filename: string; pdfBase64: string }> {
  await assertCabinetFinancesAdmin();
  // Implémentation minimale côté serveur (sans modifier le design UI).
  // On génère un PDF texte simple via jsPDF (déjà dans les deps).
  const { jsPDF } = await import("jspdf");

  const pool = getPostgresPool();
  const startExpr = startDateSqlForPeriode(periode);
  const { rows } = await pool.query(
    `
    SELECT
      f.date::date::text AS date,
      COALESCE(p.prenom,'') AS prenom,
      COALESCE(p.nom,'') AS nom,
      f.montant::float8 AS montant,
      f.montant_paye::float8 AS montant_paye,
      COALESCE(f.statut,'') AS statut
    FROM factures f
    LEFT JOIN patients p ON f.patient_id = p.id
    WHERE f.date >= (${startExpr})::date
      AND f.date <= CURRENT_DATE
    ORDER BY f.date ASC
    `,
  );

  const docs = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = docs.internal.pageSize.getWidth();
  const margin = 40;
  let y = 48;

  docs.setFont("helvetica", "bold");
  docs.setFontSize(16);
  docs.text("Rapport mensuel — Factures", margin, y);
  y += 18;

  docs.setFont("helvetica", "normal");
  docs.setFontSize(11);
  docs.text(`Période: ${periode}`, margin, y);
  y += 22;

  let total = 0;
  let paye = 0;
  for (const r of rows as Record<string, unknown>[]) {
    total += toNumber(r.montant);
    paye += toNumber(r.montant_paye);
  }
  const taux = total > 0 ? Math.round((paye / total) * 100) : 0;
  docs.text(`Total facturé: ${Math.round(total).toLocaleString("fr-DZ")} DA`, margin, y);
  y += 14;
  docs.text(`Total encaissé: ${Math.round(paye).toLocaleString("fr-DZ")} DA`, margin, y);
  y += 14;
  docs.text(`Taux de recouvrement: ${taux}%`, margin, y);
  y += 24;

  docs.setFont("helvetica", "bold");
  docs.text("Détail", margin, y);
  y += 14;
  docs.setFont("helvetica", "normal");

  const colDate = margin;
  const colNom = margin + 90;
  const colTotal = pageW - margin - 160;
  const colPaye = pageW - margin - 80;

  docs.setFontSize(10);
  docs.setTextColor(100);
  docs.text("Date", colDate, y);
  docs.text("Patient", colNom, y);
  docs.text("Total", colTotal, y, { align: "right" });
  docs.text("Payé", colPaye, y, { align: "right" });
  docs.setTextColor(0);
  y += 12;

  for (const r of rows as Record<string, unknown>[]) {
    if (y > 780) {
      docs.addPage();
      y = 48;
    }
    const date = String(r.date ?? "");
    const patient = `${String(r.prenom ?? "").trim()} ${String(r.nom ?? "").trim()}`.trim();
    const mt = Math.round(toNumber(r.montant));
    const mp = Math.round(toNumber(r.montant_paye));
    docs.text(date, colDate, y);
    docs.text(patient || "—", colNom, y, { maxWidth: colTotal - colNom - 10 });
    docs.text(`${mt.toLocaleString("fr-DZ")}`, colTotal, y, { align: "right" });
    docs.text(`${mp.toLocaleString("fr-DZ")}`, colPaye, y, { align: "right" });
    y += 14;
  }

  const pdfBase64 = docs.output("datauristring").split(",")[1] ?? "";
  const now = new Date();
  const yy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const filename = `rapport_${periode}_${yy}-${mm}.pdf`;
  return { filename, pdfBase64 };
}

export async function getRecettesVsDepensesLast6MonthsAction(): Promise<
  MonthlyRecettesDepensesPoint[]
> {
  await assertCabinetFinancesAdmin();
  const pool = getPostgresPool();
  const { rows } = await pool.query(
    `
    WITH months AS (
      SELECT generate_series(
        date_trunc('month', CURRENT_DATE) - interval '5 months',
        date_trunc('month', CURRENT_DATE),
        interval '1 month'
      ) AS mois
    ),
    recettes AS (
      SELECT date_trunc('month', date) AS mois, SUM(montant_paye)::float8 AS total
      FROM factures
      GROUP BY 1
    ),
    depenses AS (
      SELECT date_trunc('month', date) AS mois, SUM(montant)::float8 AS total
      FROM depenses
      GROUP BY 1
    )
    SELECT
      m.mois::date::text AS mois,
      COALESCE(r.total, 0)::float8 AS recettes,
      COALESCE(d.total, 0)::float8 AS depenses
    FROM months m
    LEFT JOIN recettes r ON r.mois = m.mois
    LEFT JOIN depenses d ON d.mois = m.mois
    ORDER BY m.mois ASC
    `,
  );
  return (rows as Record<string, unknown>[]).map((r) => ({
    mois: String(r.mois ?? ""),
    recettes: toNumber(r.recettes),
    depenses: toNumber(r.depenses),
  }));
}

export async function getDepensesByCategorieThisMonthAction(): Promise<
  DepensesByCategoriePoint[]
> {
  await assertCabinetFinancesAdmin();
  const pool = getPostgresPool();
  const { rows } = await pool.query(
    `
    SELECT categorie, COALESCE(SUM(montant), 0)::float8 AS total
    FROM depenses
    WHERE date_trunc('month', date) = date_trunc('month', CURRENT_DATE)
    GROUP BY categorie
    ORDER BY total DESC
    `,
  );
  return (rows as Record<string, unknown>[]).map((r) => ({
    categorie: String(r.categorie ?? ""),
    total: toNumber(r.total),
  }));
}

export async function getTopActesFacturesAction(): Promise<TopActeFacturePoint[]> {
  await assertCabinetFinancesAdmin();
  const pool = getPostgresPool();
  const { rows } = await pool.query(
    `
    SELECT
      COALESCE(NULLIF(btrim(f.actes->>'acteName'), ''), 'Autre') AS acte,
      COALESCE(SUM(f.montant_paye), 0)::float8 AS total
    FROM factures f
    WHERE f.actes IS NOT NULL
    GROUP BY acte
    ORDER BY total DESC
    LIMIT 5
    `,
  );
  return (rows as Record<string, unknown>[]).map((r) => ({
    acte: String(r.acte ?? "Autre"),
    total: toNumber(r.total),
  }));
}

export async function exportFinanceCsvAction(
  periode: ExportPeriode,
): Promise<{ filename: string; csv: string }> {
  await assertCabinetFinancesAdmin();
  const pool = getPostgresPool();
  const startExpr = startDateSqlForPeriode(periode);

  const header = ["type", "id", "date", "categorie", "description", "fournisseur", "montant"].join(
    ",",
  );
  const lines: string[] = [];

  const factRes = await pool.query(
    `
    SELECT
      f.id,
      f.date::date::text AS date,
      COALESCE(p.prenom,'') AS prenom,
      COALESCE(p.nom,'') AS nom,
      f.montant_paye::text AS montant
    FROM factures f
    LEFT JOIN patients p ON f.patient_id = p.id
    WHERE f.date >= (${startExpr})::date
      AND f.date <= CURRENT_DATE
    ORDER BY f.date DESC, f.created_at DESC
    `,
  );
  for (const r of factRes.rows as Record<string, unknown>[]) {
    const patient = `${String(r.prenom ?? "").trim()} ${String(r.nom ?? "").trim()}`.trim();
    lines.push(
      [
        "recette",
        escapeCsvCell(String(r.id ?? "")),
        escapeCsvCell(String(r.date ?? "")),
        escapeCsvCell(""),
        escapeCsvCell(patient),
        escapeCsvCell(""),
        escapeCsvCell(String(r.montant ?? "")),
      ].join(","),
    );
  }

  const depRes = await pool.query(
    `
    SELECT
      d.id,
      d.date::date::text AS date,
      d.categorie,
      COALESCE(d.description,'') AS description,
      COALESCE(d.fournisseur,'') AS fournisseur,
      d.montant::text AS montant
    FROM depenses d
    WHERE d.date >= (${startExpr})::date
      AND d.date <= CURRENT_DATE
    ORDER BY d.date DESC, d.created_at DESC
    `,
  );
  for (const r of depRes.rows as Record<string, unknown>[]) {
    lines.push(
      [
        "depense",
        escapeCsvCell(String(r.id ?? "")),
        escapeCsvCell(String(r.date ?? "")),
        escapeCsvCell(String(r.categorie ?? "")),
        escapeCsvCell(String(r.description ?? "")),
        escapeCsvCell(String(r.fournisseur ?? "")),
        escapeCsvCell(String(r.montant ?? "")),
      ].join(","),
    );
  }

  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const filename = `gestion_financiere_${periode}_${y}-${m}.csv`;

  return { filename, csv: [header, ...lines].join("\n") + "\n" };
}

export async function exportFinancePdfAction(
  periode: ExportPeriode,
): Promise<{ filename: string; pdfBase64: string }> {
  await assertCabinetFinancesAdmin();
  const { jsPDF } = await import("jspdf");
  const pool = getPostgresPool();
  const startExpr = startDateSqlForPeriode(periode);

  const recettesRes = await pool.query(
    `
    SELECT COALESCE(SUM(montant_paye), 0)::float8 AS total
    FROM factures
    WHERE date >= (${startExpr})::date AND date <= CURRENT_DATE
    `,
  );
  const depensesRes = await pool.query(
    `
    SELECT COALESCE(SUM(montant), 0)::float8 AS total
    FROM depenses
    WHERE date >= (${startExpr})::date AND date <= CURRENT_DATE
    `,
  );
  const factKpiRes = await pool.query(
    `
    SELECT
      COALESCE(SUM(montant), 0)::float8 AS total,
      COALESCE(SUM(montant_paye), 0)::float8 AS paye
    FROM factures
    WHERE date >= (${startExpr})::date AND date <= CURRENT_DATE
    `,
  );

  const recettes = toNumber((recettesRes.rows[0] ?? {}).total);
  const depenses = toNumber((depensesRes.rows[0] ?? {}).total);
  const totalFact = toNumber((factKpiRes.rows[0] ?? {}).total);
  const payeFact = toNumber((factKpiRes.rows[0] ?? {}).paye);
  const benef = recettes - depenses;
  const taux = totalFact > 0 ? Math.round((payeFact / totalFact) * 100) : 0;

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  let y = 48;
  const margin = 40;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Gestion Financière — Rapport", margin, y);
  y += 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Période: ${periode}`, margin, y);
  y += 22;
  doc.text(`Recettes: ${Math.round(recettes).toLocaleString("fr-DZ")} DA`, margin, y);
  y += 14;
  doc.text(`Dépenses: ${Math.round(depenses).toLocaleString("fr-DZ")} DA`, margin, y);
  y += 14;
  doc.text(`Bénéfice net: ${Math.round(benef).toLocaleString("fr-DZ")} DA`, margin, y);
  y += 14;
  doc.text(`Taux de recouvrement: ${taux}%`, margin, y);

  const pdfBase64 = doc.output("datauristring").split(",")[1] ?? "";
  const now = new Date();
  const yy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const filename = `gestion_financiere_${periode}_${yy}-${mm}.pdf`;
  return { filename, pdfBase64 };
}

export type GestionFinanciereKpis = {
  recettesCeMois: number;
  depensesCeMois: number;
  beneficeNetCeMois: number;
  tauxRecouvrement: number; // %
};

export async function getGestionFinanciereKpisAction(): Promise<GestionFinanciereKpis> {
  await assertCabinetFinancesAdmin();
  const pool = getPostgresPool();
  const [recRes, depRes, recouvRes] = await Promise.all([
    pool.query(
      `
      SELECT COALESCE(SUM(montant_paye), 0)::float8 AS total
      FROM factures
      WHERE date_trunc('month', date) = date_trunc('month', CURRENT_DATE)
      `,
    ),
    pool.query(
      `
      SELECT COALESCE(SUM(montant), 0)::float8 AS total
      FROM depenses
      WHERE date_trunc('month', date) = date_trunc('month', CURRENT_DATE)
      `,
    ),
    pool.query(
      `
      SELECT
        COALESCE(SUM(montant), 0)::float8 AS total,
        COALESCE(SUM(montant_paye), 0)::float8 AS paye
      FROM factures
      WHERE date_trunc('month', date) = date_trunc('month', CURRENT_DATE)
      `,
    ),
  ]);

  const recettes = toNumber((recRes.rows[0] ?? {}).total);
  const depenses = toNumber((depRes.rows[0] ?? {}).total);
  const total = toNumber((recouvRes.rows[0] ?? {}).total);
  const paye = toNumber((recouvRes.rows[0] ?? {}).paye);
  const taux = total > 0 ? (paye / total) * 100 : 0;
  return {
    recettesCeMois: recettes,
    depensesCeMois: depenses,
    beneficeNetCeMois: recettes - depenses,
    tauxRecouvrement: taux,
  };
}

