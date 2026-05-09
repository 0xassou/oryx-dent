"use client";

import { FileDown, FileText, MoreVertical, Pencil, Search, Trash2, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deriveFactureStatut,
  formatMontantDANumber,
  FACTURES_UPDATED_EVENT,
  notifyFacturesUpdated,
  resteAPayer,
  type FactureDocument,
  type FactureStatut,
} from "@/utils/factureDocuments";
import { createPatientAction, getPatientsAction, updatePatientAction } from "@/app/actions/patients";
import {
  createFactureAction,
  deleteFactureAction,
  getFacturesAction,
  updateFactureAction,
} from "@/app/actions/factures";
import {
  factureDateFrToIso,
  factureJoinedRowToDocument,
  montantsToStatutPostgreSQL,
} from "@/utils/factureDbMapping";
import {
  displayPatientName,
  initializeEmptyDentalChart,
  patientRowToDentalPatientRecord,
  writeMinimalPatientProfile,
  capitalizeStoragePart,
  type DentalPatientRecord,
} from "@/utils/patientData";
import { formatPhoneNumber } from "@/utils/formatters";
import { generateFacturePDF } from "@/utils/generateFacturePDF";
import { getCabinetBlob } from "@/lib/client/cabinetBlob";

function getSettings(): Record<string, unknown> {
  if (typeof window === "undefined") return {};
  try {
    return getCabinetBlob() as Record<string, unknown>;
  } catch {
    return {};
  }
}

function parseDDMMYYYY(s: string): Date | null {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const d = Number.parseInt(m[1], 10);
  const mo = Number.parseInt(m[2], 10) - 1;
  const y = Number.parseInt(m[3], 10);
  const dt = new Date(y, mo, d);
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== mo ||
    dt.getDate() !== d
  ) {
    return null;
  }
  return dt;
}

function startOfWeekMonday(ref: Date): Date {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const day = d.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + offset);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfWeekSunday(ref: Date): Date {
  const start = startOfWeekMonday(ref);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isDateInCurrentWeek(docDate: Date, ref: Date): boolean {
  const start = startOfWeekMonday(ref);
  const end = endOfWeekSunday(ref);
  return docDate >= start && docDate <= end;
}

type DateFilterKey = "today" | "week";

function parseMontantInput(raw: string): number {
  const digits = raw.replace(/\s/g, "").replace(/[^\d]/g, "");
  if (!digits) return 0;
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) ? n : 0;
}

function StatusBadge({ statut }: { statut: FactureStatut }) {
  const base =
    "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1";

  if (statut === "Payé") {
    return (
      <span
        className={`${base} bg-emerald-50 text-emerald-700 ring-emerald-600/20`}
      >
        Payé
      </span>
    );
  }

  if (statut === "Partiellement Payé") {
    return (
      <span className={`${base} bg-cyan-50 text-cyan-800 ring-cyan-600/25`}>
        Partiellement Payé
      </span>
    );
  }

  return (
    <span className={`${base} bg-amber-50 text-amber-800 ring-amber-600/20`}>
      En attente
    </span>
  );
}

type TabKey = "Tous" | "Payé" | "Partiellement Payé" | "En attente";

const TABS: { key: TabKey; label: string }[] = [
  { key: "Tous", label: "Tous" },
  { key: "Payé", label: "Payé" },
  { key: "Partiellement Payé", label: "Partiellement" },
  { key: "En attente", label: "En attente" },
];

export function FinancesRecettesTab() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [factures, setFactures] = useState<FactureDocument[]>([]);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("Tous");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editingDoc, setEditingDoc] = useState<FactureDocument | null>(null);
  const [editMontantTotal, setEditMontantTotal] = useState("");
  const [editMontantPaye, setEditMontantPaye] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [newDocMontant, setNewDocMontant] = useState("");
  const [newPatientPrenom, setNewPatientPrenom] = useState("");
  const [newPatientNom, setNewPatientNom] = useState("");
  const [newPatientTel, setNewPatientTel] = useState("");
  const [patientDirectory, setPatientDirectory] = useState<
    DentalPatientRecord[]
  >([]);
  const [dateFilter, setDateFilter] = useState<DateFilterKey>("today");

  const refreshPatientDirectory = useCallback(async () => {
    const res = await getPatientsAction();
    if (!res.ok) {
      console.error(res.error);
      return;
    }
    setPatientDirectory(res.data.map(patientRowToDentalPatientRecord));
  }, []);

  const reloadFactures = useCallback(async () => {
    const res = await getFacturesAction();
    if (!res.ok) {
      console.error(res.error);
      return;
    }
    setFactures(res.data.map(factureJoinedRowToDocument));
  }, []);

  useEffect(() => {
    setMounted(true);
    void reloadFactures();
    void refreshPatientDirectory();
  }, [refreshPatientDirectory, reloadFactures]);

  useEffect(() => {
    if (!mounted || typeof window === "undefined") return;
    const h = () => void reloadFactures();
    window.addEventListener(FACTURES_UPDATED_EVENT, h);
    return () =>
      window.removeEventListener(FACTURES_UPDATED_EVENT, h);
  }, [mounted, reloadFactures]);

  useEffect(() => {
    if (!toastMessage) return;
    const timeoutId = window.setTimeout(() => setToastMessage(null), 2500);
    return () => window.clearTimeout(timeoutId);
  }, [toastMessage]);

  function handleGenerateFacture() {
    if (!selectedPatientId || !newDocMontant.trim()) return;

    const montantTotal = parseMontantInput(newDocMontant);
    if (montantTotal <= 0) return;

    void (async () => {
      let patientLabel: string;
      let patientId: string | undefined;

      if (selectedPatientId === "__new__") {
        const pr = newPatientPrenom.trim();
        const n = newPatientNom.trim();
        const tel = newPatientTel.trim();
        if (!pr || !n || !tel) return;
        const created = await createPatientAction({
          nom: capitalizeStoragePart(n),
          prenom: capitalizeStoragePart(pr),
          telephone: tel || "—",
        });
        if (!created.ok) {
          console.error(created.error);
          return;
        }
        const rec = patientRowToDentalPatientRecord(created.data);
        const fullName = displayPatientName(rec);
        await writeMinimalPatientProfile({
          id: rec.id,
          nom: fullName,
          age: 0,
          genre: "—",
          profession: "—",
          adresse: "—",
          telephone: rec.telephone,
          email: "—",
          dateNaissance: "",
          alerts: [],
        });
        await initializeEmptyDentalChart(rec.id);
        patientLabel = fullName;
        patientId = rec.id;
      } else {
        const p = patientDirectory.find((x) => x.id === selectedPatientId);
        if (!p) return;
        patientLabel = displayPatientName(p);
        patientId = p.id;
        await updatePatientAction(p.id, {});
      }

      const todayIso = (() => {
        const n = new Date();
        const y = n.getFullYear();
        const mo = String(n.getMonth() + 1).padStart(2, "0");
        const dd = String(n.getDate()).padStart(2, "0");
        return `${y}-${mo}-${dd}`;
      })();

      const ins = await createFactureAction({
        patient_id: patientId ?? null,
        date: todayIso,
        montant: montantTotal,
        montant_paye: 0,
      });
      if (!ins.ok) {
        console.error(ins.error);
        return;
      }
      const doc = factureJoinedRowToDocument(ins.data);

      setFactures((prev) => [doc, ...prev]);
      notifyFacturesUpdated();
      setIsModalOpen(false);
      setSelectedPatientId("");
      setNewDocMontant("");
      setNewPatientPrenom("");
      setNewPatientNom("");
      setNewPatientTel("");
      await refreshPatientDirectory();
    })();
  }

  function handleOpenEdit(doc: FactureDocument) {
    setEditingDoc(doc);
    setEditMontantTotal(String(doc.montantTotal));
    setEditMontantPaye(String(doc.montantPaye));
    setOpenMenuId(null);
  }

  function handleSaveEditDoc() {
    if (!editingDoc) return;
    const total = parseMontantInput(editMontantTotal);
    const paye = parseMontantInput(editMontantPaye);
    if (total <= 0) return;
    const payeClamped = Math.max(0, Math.min(paye, total));
    const cur = editingDoc;

    void (async () => {
      const iso = factureDateFrToIso(cur.date);
      const st = montantsToStatutPostgreSQL(total, payeClamped);
      const up = await updateFactureAction(cur.id, {
        date: iso,
        montant: total,
        montant_paye: payeClamped,
        statut: st,
      });
      if (!up.ok) {
        console.error(up.error);
        return;
      }
      const doc = factureJoinedRowToDocument(up.data);
      setFactures((prev) =>
        prev.map((d) => (d.id === cur.id ? doc : d)),
      );
      setEditingDoc(null);
      notifyFacturesUpdated();
    })();
  }

  function handleDeleteDoc(docId: string) {
    const ok = window.confirm("Supprimer cette facture ?");
    if (!ok) return;
    void (async () => {
      const r = await deleteFactureAction(docId);
      if (!r.ok) {
        console.error(r.error);
        return;
      }
      setFactures((prev) => prev.filter((doc) => doc.id !== docId));
      setOpenMenuId(null);
      notifyFacturesUpdated();
    })();
  }

  const canCreateFacture = useMemo(() => {
    if (!selectedPatientId || !newDocMontant.trim()) return false;
    if (parseMontantInput(newDocMontant) <= 0) return false;
    if (selectedPatientId === "__new__") {
      return (
        newPatientPrenom.trim().length > 0 &&
        newPatientNom.trim().length > 0 &&
        newPatientTel.trim().length > 0
      );
    }
    return true;
  }, [
    selectedPatientId,
    newDocMontant,
    newPatientPrenom,
    newPatientNom,
    newPatientTel,
  ]);

  const filteredFactures = useMemo(() => {
    const now = new Date();
    const patientFilterId = (searchParams.get("patient") ?? "").trim();
    const base = factures.filter((doc) => {
      if (patientFilterId && doc.patientId !== patientFilterId) return false;
      const st = deriveFactureStatut(doc.montantTotal, doc.montantPaye);
      if (activeTab === "Tous") return true;
      return st === activeTab;
    });

    const byDate = base.filter((doc) => {
      const parsed = parseDDMMYYYY(doc.date);
      if (!parsed) return true;
      if (dateFilter === "today") return isSameCalendarDay(parsed, now);
      return isDateInCurrentWeek(parsed, now);
    });

    const q = search.trim().toLowerCase();
    if (!q) return byDate;
    return byDate.filter(
      (doc) =>
        doc.patient.toLowerCase().includes(q) ||
        doc.id.toLowerCase().includes(q),
    );
  }, [factures, activeTab, search, dateFilter, searchParams]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight text-[var(--ds-text)]">
            Recettes
          </h2>
          <p className="mt-1 text-sm text-[var(--ds-text-muted)]">
            Suivi des factures, paiements et reste à payer.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            refreshPatientDirectory();
            setIsModalOpen(true);
          }}
          className="rounded-lg bg-[var(--ds-primary)] px-4 py-2 text-sm font-semibold text-white shadow-md transition-colors hover:bg-[var(--ds-primary-hover)]"
        >
          + Nouvelle facture
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] shadow-sm">
        <div className="flex flex-col gap-3 p-5">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-text-muted)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un patient ou n° facture..."
              className="w-full rounded-lg border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] py-2.5 pl-10 pr-3 text-sm text-[var(--ds-text)] placeholder:text-[var(--ds-text-muted)] outline-none focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary-border)]/20"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="flex shrink-0 rounded-lg border border-[var(--ds-primary-border)] bg-[var(--ds-bg)] p-0.5"
              role="group"
              aria-label="Filtrer par période"
            >
              <button
                type="button"
                onClick={() => setDateFilter("today")}
                className={[
                  "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                  dateFilter === "today"
                    ? "bg-[var(--ds-surface)] text-[var(--ds-primary)] shadow-sm ring-1 ring-[var(--ds-primary-border)]/80"
                    : "text-[var(--ds-text-muted)] hover:text-[var(--ds-text)]",
                ].join(" ")}
              >
                Aujourd&apos;hui
              </button>
              <button
                type="button"
                onClick={() => setDateFilter("week")}
                className={[
                  "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                  dateFilter === "week"
                    ? "bg-[var(--ds-surface)] text-[var(--ds-primary)] shadow-sm ring-1 ring-[var(--ds-primary-border)]/80"
                    : "text-[var(--ds-text-muted)] hover:text-[var(--ds-text)]",
                ].join(" ")}
              >
                Cette semaine
              </button>
            </div>

            <div
              className="flex shrink-0 rounded-lg border border-[var(--ds-primary-border)] bg-[var(--ds-bg)] p-0.5"
              role="group"
              aria-label="Filtrer par statut"
            >
              {TABS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveTab(key)}
                  className={[
                    "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                    activeTab === key
                      ? "bg-[var(--ds-surface)] text-[var(--ds-primary)] shadow-sm ring-1 ring-[var(--ds-primary-border)]/80"
                      : "text-[var(--ds-text-muted)] hover:text-[var(--ds-text)]",
                  ].join(" ")}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="bg-[var(--ds-bg)]">
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--ds-text-muted)]">
                  N° Facture
                </th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--ds-text-muted)]">
                  Date
                </th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--ds-text-muted)]">
                  Patient
                </th>
                <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-[var(--ds-text-muted)]">
                  Montant total
                </th>
                <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-[var(--ds-text-muted)]">
                  Montant payé
                </th>
                <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-[var(--ds-text-muted)]">
                  Reste à payer
                </th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--ds-text-muted)]">
                  Statut
                </th>
                <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-[var(--ds-text-muted)]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredFactures.map((doc) => {
                const st = deriveFactureStatut(doc.montantTotal, doc.montantPaye);
                const reste = resteAPayer(doc);
                return (
                  <tr
                    key={doc.id}
                    className="border-b border-[var(--ds-primary-border)] transition-colors hover:bg-[var(--ds-bg)]"
                  >
                    <td className="px-5 py-4 font-mono text-sm text-[var(--ds-text-muted)]">
                      {doc.id}
                    </td>
                    <td className="px-5 py-4 text-sm text-[var(--ds-text)]">
                      {doc.date}
                    </td>
                    <td className="px-5 py-4 text-sm font-medium text-[var(--ds-text)]">
                      <button
                        type="button"
                        onClick={() =>
                          doc.patientId &&
                          router.push("/patients/" + doc.patientId)
                        }
                        className="text-left transition-colors hover:text-[var(--ds-primary)]"
                      >
                        {doc.patient}
                      </button>
                    </td>
                    <td className="px-5 py-4 text-right text-sm font-semibold text-[var(--ds-text)] tabular-nums">
                      {formatMontantDANumber(doc.montantTotal)}
                    </td>
                    <td className="px-5 py-4 text-right text-sm text-[var(--ds-text)] tabular-nums">
                      {formatMontantDANumber(doc.montantPaye)}
                    </td>
                    <td className="px-5 py-4 text-right text-sm font-semibold text-[var(--ds-text)] tabular-nums">
                      {formatMontantDANumber(reste)}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge statut={st} />
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="relative flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (doc.patientId) {
                              router.push("/patients/" + doc.patientId);
                              return;
                            }
                            alert("Aucun patient lié à cette facture.");
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] text-[var(--ds-text-muted)] transition-colors hover:bg-[var(--ds-bg)] hover:text-[var(--ds-text)]"
                          aria-label="Voir fiche patient"
                        >
                          <FileText className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setOpenMenuId((prev) =>
                              prev === doc.id ? null : doc.id,
                            )
                          }
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] text-[var(--ds-text-muted)] transition-colors hover:bg-[var(--ds-bg)] hover:text-[var(--ds-text)]"
                          aria-label="Options"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                        {openMenuId === doc.id && (
                          <div className="absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] shadow-lg">
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(doc)}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--ds-text)] transition-colors hover:bg-[var(--ds-bg)]"
                            >
                              <Pencil className="h-4 w-4" />
                              Modifier
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const settings = getSettings();
                                generateFacturePDF({
                                  id: doc.id,
                                  date: doc.date,
                                  patient: doc.patient,
                                  montantTotal: doc.montantTotal,
                                  montantPaye: doc.montantPaye,
                                  statut: st,
                                  acte: doc.financeLineId
                                    ? undefined
                                    : "Soins dentaires",
                                  cabinetNom:
                                    (settings.nomCabinet ??
                                      settings.cabinetNom) as string | undefined,
                                  cabinetAdresse: settings.adresse as
                                    | string
                                    | undefined,
                                  cabinetTel: settings.telephone as
                                    | string
                                    | undefined,
                                  mentionLegale: settings.mentionLegale as
                                    | string
                                    | undefined,
                                  logoBase64: settings.logoBase64 as
                                    | string
                                    | undefined,
                                });
                                setOpenMenuId(null);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--ds-text)] transition-colors hover:bg-[var(--ds-bg)]"
                            >
                              <FileDown className="h-4 w-4" />
                              Générer PDF
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteDoc(doc.id)}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 transition-colors hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                              Supprimer
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredFactures.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-5 py-10 text-center text-sm text-[var(--ds-text-muted)]"
                  >
                    Aucune facture ne correspond à votre recherche.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-nouvelle-facture"
            className="w-full max-w-lg rounded-xl bg-[var(--ds-surface)] p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <h2
                id="modal-nouvelle-facture"
                className="text-lg font-semibold text-[var(--ds-text)]"
              >
                Nouvelle facture
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1 text-[var(--ds-text-muted)] transition-colors hover:bg-[var(--ds-primary-soft)] hover:text-[var(--ds-text)]"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="fact-patient"
                  className="mb-1 block text-sm font-medium text-[var(--ds-text)]"
                >
                  Patient
                </label>
                <select
                  id="fact-patient"
                  value={selectedPatientId}
                  onChange={(e) => setSelectedPatientId(e.target.value)}
                  className="w-full rounded-lg border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 py-2.5 text-sm text-[var(--ds-text)] outline-none focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary-border)]/20"
                >
                  <option value="" disabled>
                    Sélectionner un patient…
                  </option>
                  {patientDirectory.map((p) => (
                    <option key={p.id} value={p.id}>
                      {displayPatientName(p)} — {formatPhoneNumber(p.telephone)}
                    </option>
                  ))}
                  <option value="__new__">+ Nouveau patient…</option>
                </select>
              </div>

              {selectedPatientId === "__new__" && (
                <div className="space-y-3 rounded-lg border border-[var(--ds-primary-border)] bg-[var(--ds-bg)]/80 p-3">
                  <p className="text-xs font-medium text-[var(--ds-text-muted)]">
                    Nouveau patient (sera ajouté à la liste globale)
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="fact-np-prenom"
                        className="mb-1 block text-xs font-medium text-[var(--ds-text-muted)]"
                      >
                        Prénom
                      </label>
                      <input
                        id="fact-np-prenom"
                        type="text"
                        value={newPatientPrenom}
                        onChange={(e) => setNewPatientPrenom(e.target.value)}
                        className="w-full rounded-lg border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary-border)]/20"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="fact-np-nom"
                        className="mb-1 block text-xs font-medium text-[var(--ds-text-muted)]"
                      >
                        Nom
                      </label>
                      <input
                        id="fact-np-nom"
                        type="text"
                        value={newPatientNom}
                        onChange={(e) => setNewPatientNom(e.target.value)}
                        className="w-full rounded-lg border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary-border)]/20"
                      />
                    </div>
                  </div>
                  <div>
                    <label
                      htmlFor="fact-np-tel"
                      className="mb-1 block text-xs font-medium text-[var(--ds-text-muted)]"
                    >
                      Téléphone
                    </label>
                    <input
                      id="fact-np-tel"
                      type="tel"
                      value={newPatientTel}
                      onChange={(e) => setNewPatientTel(e.target.value)}
                      className="w-full rounded-lg border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary-border)]/20"
                    />
                  </div>
                </div>
              )}

              <div>
                <label
                  htmlFor="fact-montant"
                  className="mb-1 block text-sm font-medium text-[var(--ds-text)]"
                >
                  Montant total (DA)
                </label>
                <input
                  id="fact-montant"
                  type="text"
                  inputMode="decimal"
                  value={newDocMontant}
                  onChange={(e) => setNewDocMontant(e.target.value)}
                  placeholder="Ex : 45 000"
                  className="w-full rounded-lg border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 py-2.5 text-sm text-[var(--ds-text)] outline-none focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary-border)]/20"
                />
                <p className="mt-1 text-xs text-[var(--ds-text-muted)]">
                  Statut initial : En attente (aucun paiement enregistré).
                </p>
              </div>
            </div>

            <div className="mt-8 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-4 py-2 text-sm font-medium text-[var(--ds-text)] transition-colors hover:bg-[var(--ds-bg)]"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleGenerateFacture}
                disabled={!canCreateFacture}
                className="rounded-lg bg-[var(--ds-primary)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--ds-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Créer la facture
              </button>
            </div>
          </div>
        </div>
      )}

      {editingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl bg-[var(--ds-surface)] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-lg font-semibold text-[var(--ds-text)]">
                Modifier {editingDoc.id}
              </h2>
              <button
                type="button"
                onClick={() => setEditingDoc(null)}
                className="rounded-lg p-1 text-[var(--ds-text-muted)] transition-colors hover:bg-[var(--ds-primary-soft)] hover:text-[var(--ds-text)]"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--ds-text)]">
                  Montant total (DA)
                </label>
                <input
                  type="text"
                  value={editMontantTotal}
                  onChange={(e) => setEditMontantTotal(e.target.value)}
                  className="w-full rounded-lg border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 py-2.5 text-sm text-[var(--ds-text)] outline-none focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary-border)]/20"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-[var(--ds-text)]">
                  Montant payé (DA)
                </label>
                <input
                  type="text"
                  value={editMontantPaye}
                  onChange={(e) => setEditMontantPaye(e.target.value)}
                  className="w-full rounded-lg border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 py-2.5 text-sm text-[var(--ds-text)] outline-none focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary-border)]/20"
                />
                <p className="mt-1 text-xs text-[var(--ds-text-muted)]">
                  Le statut est recalculé automatiquement (Payé / Partiellement
                  Payé / En attente).
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditingDoc(null)}
                className="rounded-lg border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-4 py-2 text-sm font-medium text-[var(--ds-text)] transition-colors hover:bg-[var(--ds-bg)]"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSaveEditDoc}
                className="rounded-lg bg-[var(--ds-primary)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--ds-primary-hover)]"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-[70] rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
