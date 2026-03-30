"use client";

import { FileDown, FileText, MoreVertical, Pencil, Search, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deriveFactureStatut,
  formatMontantDANumber,
  type FactureDocument,
  type FactureStatut,
  parseFacturesFromLocalStorage,
  resteAPayer,
  writeFacturesToStorage,
} from "@/utils/factureDocuments";
import {
  createPatientQuick,
  displayPatientName,
  ensurePatientsHydrated,
  readPatientsFromStorage,
  touchPatientDerniereVisite,
  type DentalPatientRecord,
} from "@/utils/patientData";
import { formatPhoneNumber } from "@/utils/formatters";

const DOCS_STORAGE_KEY = "dental_dashboard_docs";

const FACTURES_MOCK: FactureDocument[] = [
  {
    id: "FCT-2026-042",
    date: "25/03/2026",
    patient: "Mme Dupont",
    patientId: "3",
    montantTotal: 45_000,
    montantPaye: 45_000,
  },
  {
    id: "FCT-2026-089",
    date: "24/03/2026",
    patient: "M. Khelil",
    patientId: "2",
    montantTotal: 250_000,
    montantPaye: 80_000,
  },
  {
    id: "FCT-2026-041",
    date: "20/03/2026",
    patient: "Mme Saïd",
    patientId: "3",
    montantTotal: 72_000,
    montantPaye: 0,
  },
  {
    id: "FCT-2026-088",
    date: "15/03/2026",
    patient: "M. Yassine",
    patientId: "1",
    montantTotal: 120_000,
    montantPaye: 120_000,
  },
];

function loadInitialFactures(): FactureDocument[] {
  if (typeof window === "undefined") return [...FACTURES_MOCK];
  const parsed = parseFacturesFromLocalStorage(
    localStorage.getItem(DOCS_STORAGE_KEY),
  );
  return parsed.length ? parsed : [...FACTURES_MOCK];
}

function formatDateDDMMYYYY(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
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

  const refreshPatientDirectory = useCallback(() => {
    ensurePatientsHydrated();
    setPatientDirectory(readPatientsFromStorage());
  }, []);

  useEffect(() => {
    setMounted(true);
    setFactures(loadInitialFactures());
    refreshPatientDirectory();
  }, [refreshPatientDirectory]);

  useEffect(() => {
    if (!mounted) return;
    writeFacturesToStorage(factures);
  }, [mounted, factures]);

  useEffect(() => {
    if (!toastMessage) return;
    const timeoutId = window.setTimeout(() => setToastMessage(null), 2500);
    return () => window.clearTimeout(timeoutId);
  }, [toastMessage]);

  function handleGenerateFacture() {
    if (!selectedPatientId || !newDocMontant.trim()) return;

    const montantTotal = parseMontantInput(newDocMontant);
    if (montantTotal <= 0) return;

    let patientLabel: string;
    let patientId: string | undefined;

    if (selectedPatientId === "__new__") {
      const pr = newPatientPrenom.trim();
      const n = newPatientNom.trim();
      const tel = newPatientTel.trim();
      if (!pr || !n || !tel) return;
      const rec = createPatientQuick({
        prenom: pr,
        nom: n,
        telephone: tel,
      });
      patientLabel = displayPatientName(rec);
      patientId = rec.id;
    } else {
      const p = patientDirectory.find((x) => x.id === selectedPatientId);
      if (!p) return;
      patientLabel = displayPatientName(p);
      patientId = p.id;
      touchPatientDerniereVisite(p.id);
    }

    const id = `FCT-2026-${Math.floor(Math.random() * 900 + 100)}`;

    const doc: FactureDocument = {
      id,
      date: formatDateDDMMYYYY(new Date()),
      patient: patientLabel,
      patientId,
      montantTotal,
      montantPaye: 0,
    };

    setFactures((prev) => [doc, ...prev]);
    setIsModalOpen(false);
    setSelectedPatientId("");
    setNewDocMontant("");
    setNewPatientPrenom("");
    setNewPatientNom("");
    setNewPatientTel("");
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

    setFactures((prev) =>
      prev.map((doc) =>
        doc.id === editingDoc.id
          ? {
              ...doc,
              montantTotal: total,
              montantPaye: payeClamped,
            }
          : doc,
      ),
    );
    setEditingDoc(null);
  }

  function handleDeleteDoc(docId: string) {
    const ok = window.confirm("Supprimer cette facture ?");
    if (!ok) return;
    setFactures((prev) => prev.filter((doc) => doc.id !== docId));
    setOpenMenuId(null);
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
    const base = factures.filter((doc) => {
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
  }, [factures, activeTab, search, dateFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">
            Recettes
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Suivi des factures, paiements et reste à payer.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            refreshPatientDirectory();
            setIsModalOpen(true);
          }}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition-colors hover:bg-indigo-700"
        >
          + Nouvelle facture
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un patient ou n° facture..."
                className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
            <div
              className="flex shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-0.5"
              role="group"
              aria-label="Filtrer par période"
            >
              <button
                type="button"
                onClick={() => setDateFilter("today")}
                className={[
                  "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                  dateFilter === "today"
                    ? "bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200/80"
                    : "text-slate-600 hover:text-slate-900",
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
                    ? "bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200/80"
                    : "text-slate-600 hover:text-slate-900",
                ].join(" ")}
              >
                Cette semaine
              </button>
            </div>
          </div>

          <div className="flex w-full justify-start overflow-x-auto sm:w-auto">
            <div className="flex min-w-max border-b border-slate-200">
              {TABS.map(({ key, label }) => {
                const active = activeTab === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveTab(key)}
                    className={[
                      "whitespace-nowrap px-3 pb-3 text-sm font-medium transition-colors sm:px-4",
                      active
                        ? "border-b-2 border-indigo-500 text-indigo-600"
                        : "text-slate-500 hover:text-slate-700",
                    ].join(" ")}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  N° Facture
                </th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Date
                </th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Patient
                </th>
                <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Montant total
                </th>
                <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Montant payé
                </th>
                <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Reste à payer
                </th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Statut
                </th>
                <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">
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
                    className="border-b border-slate-100 transition-colors hover:bg-slate-50"
                  >
                    <td className="px-5 py-4 font-mono text-sm text-slate-600">
                      {doc.id}
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-700">
                      {doc.date}
                    </td>
                    <td className="px-5 py-4 text-sm font-medium text-slate-900">
                      <button
                        type="button"
                        onClick={() =>
                          doc.patientId &&
                          router.push("/patients/" + doc.patientId)
                        }
                        className="text-left transition-colors hover:text-indigo-600"
                      >
                        {doc.patient}
                      </button>
                    </td>
                    <td className="px-5 py-4 text-right text-sm font-semibold text-slate-900 tabular-nums">
                      {formatMontantDANumber(doc.montantTotal)}
                    </td>
                    <td className="px-5 py-4 text-right text-sm text-slate-700 tabular-nums">
                      {formatMontantDANumber(doc.montantPaye)}
                    </td>
                    <td className="px-5 py-4 text-right text-sm font-semibold text-slate-900 tabular-nums">
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
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-100 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
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
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-100 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
                          aria-label="Options"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                        {openMenuId === doc.id && (
                          <div className="absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-lg">
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(doc)}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50"
                            >
                              <Pencil className="h-4 w-4" />
                              Modifier
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setToastMessage("Préparation du PDF en cours...");
                                setOpenMenuId(null);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50"
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
                    className="px-5 py-10 text-center text-sm text-slate-500"
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
            className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <h2
                id="modal-nouvelle-facture"
                className="text-lg font-semibold text-slate-900"
              >
                Nouvelle facture
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="fact-patient"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Patient
                </label>
                <select
                  id="fact-patient"
                  value={selectedPatientId}
                  onChange={(e) => setSelectedPatientId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
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
                <div className="space-y-3 rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                  <p className="text-xs font-medium text-slate-600">
                    Nouveau patient (sera ajouté à la liste globale)
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="fact-np-prenom"
                        className="mb-1 block text-xs font-medium text-slate-600"
                      >
                        Prénom
                      </label>
                      <input
                        id="fact-np-prenom"
                        type="text"
                        value={newPatientPrenom}
                        onChange={(e) => setNewPatientPrenom(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="fact-np-nom"
                        className="mb-1 block text-xs font-medium text-slate-600"
                      >
                        Nom
                      </label>
                      <input
                        id="fact-np-nom"
                        type="text"
                        value={newPatientNom}
                        onChange={(e) => setNewPatientNom(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>
                  </div>
                  <div>
                    <label
                      htmlFor="fact-np-tel"
                      className="mb-1 block text-xs font-medium text-slate-600"
                    >
                      Téléphone
                    </label>
                    <input
                      id="fact-np-tel"
                      type="tel"
                      value={newPatientTel}
                      onChange={(e) => setNewPatientTel(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                </div>
              )}

              <div>
                <label
                  htmlFor="fact-montant"
                  className="mb-1 block text-sm font-medium text-slate-700"
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
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Statut initial : En attente (aucun paiement enregistré).
                </p>
              </div>
            </div>

            <div className="mt-8 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleGenerateFacture}
                disabled={!canCreateFacture}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Créer la facture
              </button>
            </div>
          </div>
        </div>
      )}

      {editingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-lg font-semibold text-slate-900">
                Modifier {editingDoc.id}
              </h2>
              <button
                type="button"
                onClick={() => setEditingDoc(null)}
                className="rounded-lg p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Montant total (DA)
                </label>
                <input
                  type="text"
                  value={editMontantTotal}
                  onChange={(e) => setEditMontantTotal(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Montant payé (DA)
                </label>
                <input
                  type="text"
                  value={editMontantPaye}
                  onChange={(e) => setEditMontantPaye(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Le statut est recalculé automatiquement (Payé / Partiellement
                  Payé / En attente).
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditingDoc(null)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSaveEditDoc}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
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
