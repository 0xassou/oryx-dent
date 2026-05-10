"use server";

import { getPostgresPool } from "@/lib/server/db/pool";
import { requireBetterAuthSession } from "@/lib/server/auth/require-session";
import { resolveCabinetRoleForEmail } from "@/lib/server/auth/cabinet-role";
import { logServerError } from "@/lib/server/logger";

export type UniversalSearchCategory =
  | "patients"
  | "appointments"
  | "stocks"
  | "laboratoire"
  | "factures";

export type UniversalSearchHit = {
  id: string;
  category: UniversalSearchCategory;
  title: string;
  subtitle: string;
  location: string;
  href: string;
};

const LIMIT = 8;

const CATEGORY_ORDER: UniversalSearchCategory[] = [
  "patients",
  "appointments",
  "stocks",
  "laboratoire",
  "factures",
];

export async function universalSearchAction(
  query: string,
): Promise<
  { ok: true; hits: UniversalSearchHit[] } | { ok: false; error: string }
> {
  const auth = await requireBetterAuthSession();
  if (!auth.ok) return { ok: false, error: auth.error };

  const q = query.trim().toLowerCase();
  if (q.length < 1) return { ok: true, hits: [] };

  const role = await resolveCabinetRoleForEmail(auth.email);
  const canStocks = role === "admin" || role === "assistant";
  const canLabo = role === "admin" || role === "praticien";
  const canFactures = role === "admin";

  const pool = getPostgresPool();
  const hits: UniversalSearchHit[] = [];

  try {
    const pr = await pool.query(
      `SELECT id, nom, prenom, telephone, telephone2
       FROM patients
       WHERE position($1 IN lower(
         coalesce(nom, '') || ' ' || coalesce(prenom, '') || ' ' ||
         coalesce(telephone, '') || ' ' || coalesce(telephone2, '')
       )) > 0
       ORDER BY nom ASC, prenom ASC
       LIMIT $2`,
      [q, LIMIT],
    );
    for (const row of pr.rows as Record<string, unknown>[]) {
      const id = String(row.id);
      const nom = String(row.nom ?? "");
      const prenom = String(row.prenom ?? "");
      const tel = row.telephone != null ? String(row.telephone) : "";
      hits.push({
        id: `p-${id}`,
        category: "patients",
        title: `${prenom} ${nom}`.trim() || nom || "Patient",
        subtitle: tel || "—",
        location: "Patients › Fiche",
        href: `/patients/${id}`,
      });
    }

    const ap = await pool.query(
      `SELECT a.id, a.date::text AS d, a.heure, a.type_acte, a.patient_id,
              p.nom AS nom, p.prenom AS prenom
       FROM appointments a
       LEFT JOIN patients p ON a.patient_id = p.id
       WHERE position($1 IN lower(
         coalesce(p.nom, '') || ' ' || coalesce(p.prenom, '') || ' ' ||
         coalesce(a.date::text, '') || ' ' ||
         coalesce(to_char(a.date, 'DD/MM/YYYY'), '') || ' ' ||
         coalesce(a.heure::text, '') || ' ' || coalesce(a.type_acte, '') || ' ' ||
         coalesce(a.notes, '')
       )) > 0
       ORDER BY a.date DESC, a.heure DESC
       LIMIT $2`,
      [q, LIMIT],
    );
    for (const row of ap.rows as Record<string, unknown>[]) {
      const id = String(row.id);
      const date = String(row.d ?? "").slice(0, 10);
      const heure = String(row.heure ?? "").slice(0, 5);
      const typeActe = String(row.type_acte ?? "");
      const nom = row.nom != null ? String(row.nom) : "";
      const prenom = row.prenom != null ? String(row.prenom) : "";
      const patientName = `${prenom} ${nom}`.trim() || "Patient";
      const pid = row.patient_id != null ? String(row.patient_id) : "";
      const dateLabel = date
        ? new Date(`${date}T12:00:00`).toLocaleDateString("fr-FR", {
            weekday: "short",
            day: "numeric",
            month: "short",
            year: "numeric",
          })
        : "";
      const sub = [dateLabel, heure, typeActe].filter(Boolean).join(" · ");
      const href = pid
        ? `/planning?patientId=${encodeURIComponent(pid)}&listDay=${encodeURIComponent(date)}`
        : `/planning?listDay=${encodeURIComponent(date)}`;
      hits.push({
        id: `a-${id}`,
        category: "appointments",
        title: patientName,
        subtitle: sub,
        location: "Planning › Rendez-vous",
        href,
      });
    }

    if (canStocks) {
      const st = await pool.query(
        `SELECT id, nom, categorie, quantite, unite
         FROM stocks
         WHERE position($1 IN lower(
           coalesce(nom, '') || ' ' || coalesce(categorie, '') || ' ' ||
           coalesce(fournisseur, '') || ' ' || coalesce(notes, '')
         )) > 0
         ORDER BY nom ASC
         LIMIT $2`,
        [q, LIMIT],
      );
      for (const row of st.rows as Record<string, unknown>[]) {
        const id = String(row.id);
        const nom = String(row.nom ?? "");
        const cat =
          row.categorie != null && String(row.categorie).trim()
            ? String(row.categorie)
            : "Sans catégorie";
        const qty = Number(row.quantite) || 0;
        const unite = row.unite != null ? String(row.unite) : "";
        hits.push({
          id: `s-${id}`,
          category: "stocks",
          title: nom,
          subtitle: `${qty}${unite ? ` ${unite}` : ""} en stock`,
          location: `Stocks › ${cat}`,
          href: "/stocks",
        });
      }
    }

    if (canLabo) {
      const lb = await pool.query(
        `SELECT c.id, c.travail, c.laboratoire, c.patient_nom,
                p.nom AS pn, p.prenom AS pp
         FROM commandes_labo c
         LEFT JOIN patients p ON c.patient_id = p.id
         WHERE position($1 IN lower(
           coalesce(c.travail, '') || ' ' || coalesce(c.laboratoire, '') || ' ' ||
           coalesce(c.patient_nom, '') || ' ' || coalesce(c.notes, '') || ' ' ||
           coalesce(c.dent, '') || ' ' || coalesce(c.materiau, '') || ' ' ||
           coalesce(p.nom, '') || ' ' || coalesce(p.prenom, '')
         )) > 0
         ORDER BY c.created_at DESC
         LIMIT $2`,
        [q, LIMIT],
      );
      for (const row of lb.rows as Record<string, unknown>[]) {
        const id = String(row.id);
        const travail = String(row.travail ?? "");
        const labo =
          row.laboratoire != null && String(row.laboratoire).trim()
            ? String(row.laboratoire)
            : "Laboratoire";
        const storedNom =
          row.patient_nom != null ? String(row.patient_nom).trim() : "";
        const pn = row.pn != null ? String(row.pn) : "";
        const pp = row.pp != null ? String(row.pp) : "";
        const fromPatient = `${pp} ${pn}`.trim();
        const patientLabel = storedNom || fromPatient || "Patient";
        hits.push({
          id: `l-${id}`,
          category: "laboratoire",
          title: patientLabel,
          subtitle: travail,
          location: `Laboratoire › ${labo}`,
          href: `/laboratoire?commande=${encodeURIComponent(id)}`,
        });
      }
    }

    if (canFactures) {
      const fc = await pool.query(
        `SELECT f.id, f.date::text AS d, f.montant::text AS montant,
                f.patient_id, p.nom, p.prenom
         FROM factures f
         LEFT JOIN patients p ON f.patient_id = p.id
         WHERE position($1 IN lower(
           coalesce(p.nom, '') || ' ' || coalesce(p.prenom, '') || ' ' ||
           coalesce(f.date::text, '') || ' ' ||
           coalesce(to_char(f.date, 'DD/MM/YYYY'), '') || ' ' ||
           coalesce(f.montant::text, '') || ' ' || coalesce(f.montant_paye::text, '') || ' ' ||
           coalesce(f.notes, '') || ' ' || coalesce(f.actes::text, '')
         )) > 0
         ORDER BY f.date DESC, f.created_at DESC
         LIMIT $2`,
        [q, LIMIT],
      );
      for (const row of fc.rows as Record<string, unknown>[]) {
        const id = String(row.id);
        const date = String(row.d ?? "").slice(0, 10);
        const montant = String(row.montant ?? "0");
        const nom = row.nom != null ? String(row.nom) : "";
        const prenom = row.prenom != null ? String(row.prenom) : "";
        const pid = row.patient_id != null ? String(row.patient_id) : "";
        const patientName = `${prenom} ${nom}`.trim() || "Facture";
        const dateLabel = date
          ? new Date(`${date}T12:00:00`).toLocaleDateString("fr-FR")
          : "";
        hits.push({
          id: `f-${id}`,
          category: "factures",
          title: patientName,
          subtitle: `${dateLabel} · ${montant} DA`,
          location: "Finances › Factures",
          href: pid
            ? `/finances?patient=${encodeURIComponent(pid)}`
            : `/finances`,
        });
      }
    }

    const rank = new Map(CATEGORY_ORDER.map((k, i) => [k, i]));
    hits.sort((a, b) => {
      const ra = rank.get(a.category) ?? 99;
      const rb = rank.get(b.category) ?? 99;
      if (ra !== rb) return ra - rb;
      return a.title.localeCompare(b.title, "fr");
    });

    return { ok: true, hits };
  } catch (e) {
    logServerError("universalSearchAction", e);
    console.error(e);
    return {
      ok: false,
      error: "Une erreur est survenue.",
    };
  }
}
