"use server";

import { randomUUID } from "node:crypto";
import { getPostgresPool } from "@/lib/server/db/pool";
import { requireBetterAuthSession } from "@/lib/server/auth/require-session";
import { logServerError } from "@/lib/server/logger";

const SELECT_LABO_JOIN = `
  SELECT
    c.*,
    p.nom AS join_patient_nom,
    p.prenom AS join_patient_prenom
  FROM commandes_labo c
  LEFT JOIN patients p ON c.patient_id = p.id
`;
import type { LaboratoireStatut } from "@/utils/laboratoireCommandes";

type CommandeLaboStatutDb =
  | "en_attente"
  | "envoye_labo"
  | "en_fabrication"
  | "expedie_cabinet"
  | "recu_cabinet"
  | "pose"
  | "retouche";

export type CommandeLaboRow = {
  id: string;
  patient_id: string | null;
  patient_nom: string | null;
  travail: string;
  laboratoire: string | null;
  dent: string | null;
  materiau: string | null;
  teinte: string | null;
  cout_labo: string | number | null;
  statut: string | null;
  date_retour: string | null;
  date_pose: string | null;
  rdv_pose_id: string | null;
  rdv_retour_id: string | null;
  notes: string | null;
  historique: unknown;
  created_at: string;
  updated_at: string;
};

export type CommandeLabo = {
  id: string;
  patientId?: string;
  patientNom?: string;
  travail: string;
  laboratoire?: string;
  dent?: string;
  materiau?: string;
  teinte?: string;
  coutLabo?: number;
  statut: LaboratoireStatut;
  dateRetour?: string; // YYYY-MM-DD
  datePose?: string; // YYYY-MM-DD
  rdvPoseId?: string;
  rdvRetourId?: string;
  notes?: string;
  historique: unknown[];
  createdAt: string;
  updatedAt: string;
};

export type CommandeLaboInput = {
  patient_id?: string | null;
  patient_nom?: string | null;
  travail: string;
  laboratoire?: string | null;
  dent?: string | null;
  materiau?: string | null;
  teinte?: string | null;
  cout_labo?: number | null;
  statut?: LaboratoireStatut | null;
  date_retour?: string | null;
  date_pose?: string | null;
  rdv_pose_id?: string | null;
  rdv_retour_id?: string | null;
  notes?: string | null;
  historique?: unknown[] | null;
};

export type LaboratoireOk<T> = { ok: true; data: T } | { ok: false; error: string };

function normalizeIsoDate(raw: unknown): string | null {
  if (raw == null) return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.toISOString().slice(0, 10);
  const s = String(raw);
  if (s.length >= 10) return s.slice(0, 10);
  return s || null;
}

function toIsoTimestamp(v: unknown): string {
  if (v == null) return new Date(0).toISOString();
  if (v instanceof Date) return v.toISOString();
  const s = String(v);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString();
}

function normalizeStatutDb(raw: unknown): CommandeLaboStatutDb {
  const s = String(raw ?? "en_attente").trim().toLowerCase();
  const allowed: CommandeLaboStatutDb[] = [
    "en_attente",
    "envoye_labo",
    "en_fabrication",
    "expedie_cabinet",
    "recu_cabinet",
    "pose",
    "retouche",
  ];
  return (allowed as readonly string[]).includes(s)
    ? (s as CommandeLaboStatutDb)
    : "en_attente";
}

function statutDbToUi(raw: unknown): LaboratoireStatut {
  const s = normalizeStatutDb(raw);
  switch (s) {
    case "envoye_labo":
      return "ENVOYE_LABO";
    case "en_fabrication":
      return "EN_FABRICATION";
    case "expedie_cabinet":
      return "EXPEDIE_CABINET";
    case "recu_cabinet":
      return "RECU_CABINET";
    case "pose":
      return "POSE";
    case "retouche":
      return "RETOUCHE";
    case "en_attente":
    default:
      return "EN_ATTENTE";
  }
}

function statutUiToDb(s: LaboratoireStatut | null | undefined): CommandeLaboStatutDb {
  switch (s) {
    case "ENVOYE_LABO":
      return "envoye_labo";
    case "EN_FABRICATION":
      return "en_fabrication";
    case "EXPEDIE_CABINET":
      return "expedie_cabinet";
    case "RECU_CABINET":
      return "recu_cabinet";
    case "POSE":
      return "pose";
    case "RETOUCHE":
      return "retouche";
    case "EN_ATTENTE":
    default:
      return "en_attente";
  }
}

function toNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function mapRow(r: Record<string, unknown>): CommandeLabo {
  const cout = toNumber(r.cout_labo);
  const hist = Array.isArray(r.historique) ? r.historique : [];
  const nomStored =
    r.patient_nom != null ? String(r.patient_nom).trim() : "";
  const fromJoin = [r.join_patient_prenom, r.join_patient_nom]
    .filter((x) => x != null && String(x).trim() !== "")
    .map((x) => String(x).trim())
    .join(" ")
    .trim();
  const patientNomResolved =
    nomStored !== "" ? nomStored : fromJoin !== "" ? fromJoin : undefined;
  return {
    id: String(r.id ?? ""),
    patientId: r.patient_id != null ? String(r.patient_id) : undefined,
    patientNom: patientNomResolved,
    travail: String(r.travail ?? ""),
    laboratoire: r.laboratoire != null ? String(r.laboratoire) : undefined,
    dent: r.dent != null ? String(r.dent) : undefined,
    materiau: r.materiau != null ? String(r.materiau) : undefined,
    teinte: r.teinte != null ? String(r.teinte) : undefined,
    coutLabo: Math.max(0, cout),
    statut: statutDbToUi(r.statut),
    dateRetour: normalizeIsoDate(r.date_retour) ?? undefined,
    datePose: normalizeIsoDate(r.date_pose) ?? undefined,
    rdvPoseId: r.rdv_pose_id != null ? String(r.rdv_pose_id) : undefined,
    rdvRetourId: r.rdv_retour_id != null ? String(r.rdv_retour_id) : undefined,
    notes: r.notes != null ? String(r.notes) : undefined,
    historique: hist,
    createdAt: toIsoTimestamp(r.created_at),
    updatedAt: toIsoTimestamp(r.updated_at),
  };
}

export async function getCommandesLaboAction(): Promise<LaboratoireOk<CommandeLabo[]>> {
  const auth = await requireBetterAuthSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  try {
    const pool = getPostgresPool();
    const { rows } = await pool.query(
      `${SELECT_LABO_JOIN} ORDER BY c.created_at DESC`,
    );
    return { ok: true, data: rows.map((r) => mapRow(r as Record<string, unknown>)) };
  } catch (e) {
    logServerError("getCommandesLaboAction", e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getCommandeLaboByIdAction(
  id: string,
): Promise<LaboratoireOk<CommandeLabo | null>> {
  const auth = await requireBetterAuthSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const rid = id.trim();
  if (!rid) return { ok: false, error: "id requis" };
  try {
    const pool = getPostgresPool();
    const { rows } = await pool.query(
      `${SELECT_LABO_JOIN} WHERE c.id = $1`,
      [rid],
    );
    if (rows.length === 0) return { ok: true, data: null };
    return { ok: true, data: mapRow(rows[0] as Record<string, unknown>) };
  } catch (e) {
    logServerError("getCommandeLaboByIdAction", e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function createCommandeLaboAction(
  data: CommandeLaboInput,
): Promise<LaboratoireOk<CommandeLabo>> {
  const auth = await requireBetterAuthSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  try {
    const pool = getPostgresPool();
    const id = randomUUID();
    const hist = data.historique ?? [];
    const { rows } = await pool.query(
      `
      INSERT INTO commandes_labo (
        id, patient_id, patient_nom, travail, laboratoire,
        dent, materiau, teinte, cout_labo, statut,
        date_retour, date_pose, rdv_pose_id, rdv_retour_id,
        notes, historique
      ) VALUES (
        $1,$2,$3,$4,$5,
        $6,$7,$8,$9,$10,
        $11::date,$12::date,$13,$14,
        $15,$16::jsonb
      )
      RETURNING *
      `,
      [
        id,
        data.patient_id ?? null,
        data.patient_nom ?? null,
        data.travail,
        data.laboratoire ?? null,
        data.dent ?? null,
        data.materiau ?? null,
        data.teinte ?? null,
        Math.max(0, data.cout_labo ?? 0),
        statutUiToDb(data.statut),
        data.date_retour ? data.date_retour.slice(0, 10) : null,
        data.date_pose ? data.date_pose.slice(0, 10) : null,
        data.rdv_pose_id ?? null,
        data.rdv_retour_id ?? null,
        data.notes ?? null,
        JSON.stringify(hist),
      ],
    );
    const r = rows[0];
    if (!r) return { ok: false, error: "Insertion sans retour" };
    return { ok: true, data: mapRow(r as Record<string, unknown>) };
  } catch (e) {
    logServerError("createCommandeLaboAction", e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function updateCommandeLaboAction(
  id: string,
  data: Partial<CommandeLaboInput>,
): Promise<LaboratoireOk<CommandeLabo>> {
  const auth = await requireBetterAuthSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const rid = id.trim();
  if (!rid) return { ok: false, error: "id requis" };
  try {
    const pool = getPostgresPool();
    const patches: string[] = [];
    const vals: unknown[] = [];
    let i = 1;

    function add(col: string, v: unknown) {
      patches.push(`${col} = $${i++}`);
      vals.push(v);
    }

    if (data.patient_id !== undefined) add("patient_id", data.patient_id ?? null);
    if (data.patient_nom !== undefined) add("patient_nom", data.patient_nom ?? null);
    if (data.travail !== undefined) add("travail", data.travail);
    if (data.laboratoire !== undefined) add("laboratoire", data.laboratoire ?? null);
    if (data.dent !== undefined) add("dent", data.dent ?? null);
    if (data.materiau !== undefined) add("materiau", data.materiau ?? null);
    if (data.teinte !== undefined) add("teinte", data.teinte ?? null);
    if (data.cout_labo !== undefined) add("cout_labo", Math.max(0, data.cout_labo ?? 0));
    if (data.statut !== undefined) add("statut", statutUiToDb(data.statut ?? null));

    if (data.date_retour !== undefined) {
      patches.push(`date_retour = $${i++}::date`);
      vals.push(data.date_retour ? data.date_retour.slice(0, 10) : null);
    }
    if (data.date_pose !== undefined) {
      patches.push(`date_pose = $${i++}::date`);
      vals.push(data.date_pose ? data.date_pose.slice(0, 10) : null);
    }
    if (data.rdv_pose_id !== undefined) add("rdv_pose_id", data.rdv_pose_id ?? null);
    if (data.rdv_retour_id !== undefined) add("rdv_retour_id", data.rdv_retour_id ?? null);
    if (data.notes !== undefined) add("notes", data.notes ?? null);
    if (data.historique !== undefined) add("historique", JSON.stringify(data.historique ?? []));

    if (patches.length === 0) {
      const { rows } = await pool.query(
        `${SELECT_LABO_JOIN} WHERE c.id = $1`,
        [rid],
      );
      const r = rows[0];
      if (!r) return { ok: false, error: "Commande introuvable" };
      return { ok: true, data: mapRow(r as Record<string, unknown>) };
    }

    patches.push(`updated_at = NOW()`);
    vals.push(rid);

    const q = `UPDATE commandes_labo SET ${patches.join(", ")} WHERE id = $${i} RETURNING *`;
    const up = await pool.query(q, vals);
    const r = up.rows[0];
    if (!r) return { ok: false, error: "Commande introuvable" };
    return { ok: true, data: mapRow(r as Record<string, unknown>) };
  } catch (e) {
    logServerError("updateCommandeLaboAction", e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteCommandeLaboAction(
  id: string,
): Promise<LaboratoireOk<void>> {
  const auth = await requireBetterAuthSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const rid = id.trim();
  if (!rid) return { ok: false, error: "id requis" };
  try {
    const pool = getPostgresPool();
    const del = await pool.query(`DELETE FROM commandes_labo WHERE id = $1`, [rid]);
    if ((del.rowCount ?? 0) === 0) return { ok: false, error: "Commande introuvable" };
    return { ok: true, data: undefined };
  } catch (e) {
    logServerError("deleteCommandeLaboAction", e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

