"use client";

import { FileDown, FileText, MoreVertical, Pencil, Search, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const DOCS_STORAGE_KEY = "dental_dashboard_docs";

type DocumentStatut =
  | "Payé"
  | "Payée"
  | "En attente"
  | "En retard"
  | "Accepté";

type DocumentMock = {
  id: string;
  date: string;
  patient: string;
  patientId?: string;
  type: "Devis" | "Facture";
  montant: string;
  statut: DocumentStatut;
};

const DOCUMENTS_MOCK: DocumentMock[] = [
  {
    id: "FCT-2026-042",
    date: "25/03/2026",
    patient: "Mme Dupont",
    type: "Facture",
    montant: "45 000 DA",
    statut: "Payée",
  },
  {
    id: "DEV-2026-089",
    date: "24/03/2026",
    patient: "M. Khelil",
    type: "Devis",
    montant: "250 000 DA",
    statut: "En attente",
  },
  {
    id: "FCT-2026-041",
    date: "20/03/2026",
    patient: "Mme Saïd",
    type: "Facture",
    montant: "72 000 DA",
    statut: "En retard",
  },
  {
    id: "DEV-2026-088",
    date: "15/03/2026",
    patient: "M. Yassine",
    type: "Devis",
    montant: "120 000 DA",
    statut: "Accepté",
  },
];

const PATIENTS_LIST = [
  "Mme Dupont",
  "M. Khelil",
  "Mme Saïd",
  "M. Yassine",
  "Mme Benali",
  "M. Ahmed",
] as const;

function parseDocumentsFromStorage(raw: string | null): DocumentMock[] | null {
  if (raw == null || raw === "") return null;
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data) || data.length === 0) return null;
    const out: DocumentMock[] = [];
    for (const item of data) {
      if (
        item &&
        typeof item === "object" &&
        typeof (item as DocumentMock).id === "string" &&
        typeof (item as DocumentMock).date === "string" &&
        typeof (item as DocumentMock).patient === "string" &&
        ((item as DocumentMock).type === "Devis" ||
          (item as DocumentMock).type === "Facture") &&
        typeof (item as DocumentMock).montant === "string" &&
        typeof (item as DocumentMock).statut === "string"
      ) {
        out.push(item as DocumentMock);
      }
    }
    return out.length ? out : null;
  } catch {
    return null;
  }
}

function formatDateDDMMYYYY(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatMontantWithDA(raw: string): string {
  const digits = raw.replace(/\s/g, "").replace(/[^\d]/g, "");
  if (!digits) return "";
  const n = Number.parseInt(digits, 10);
  if (!Number.isFinite(n)) return "";
  return `${new Intl.NumberFormat("fr-DZ", { maximumFractionDigits: 0 }).format(n)} DA`;
}

function StatusBadge({ statut }: { statut: DocumentStatut }) {
  const base =
    "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1";

  if (statut === "Payée" || statut === "Payé") {
    return (
      <span
        className={`${base} bg-emerald-50 text-emerald-700 ring-emerald-600/20`}
      >
        Payé
      </span>
    );
  }

  if (statut === "En attente") {
    return (
      <span className={`${base} bg-amber-50 text-amber-700 ring-amber-600/20`}>
        En attente
      </span>
    );
  }

  if (statut === "En retard") {
    return (
      <span className={`${base} bg-rose-50 text-rose-700 ring-rose-600/20`}>
        En retard
      </span>
    );
  }

  return (
    <span className={`${base} bg-sky-50 text-sky-700 ring-sky-600/20`}>
      Accepté
    </span>
  );
}

type TabKey = "Tous" | "Devis" | "Factures" | "Impayés";

const TABS: { key: TabKey; label: string }[] = [
  { key: "Tous", label: "Tous" },
  { key: "Devis", label: "Devis" },
  { key: "Factures", label: "Factures" },
  { key: "Impayés", label: "Impayés" },
];

export default function FacturesPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [documents, setDocuments] = useState<DocumentMock[]>([]);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("Tous");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editingDoc, setEditingDoc] = useState<DocumentMock | null>(null);
  const [editMontant, setEditMontant] = useState("");
  const [editStatut, setEditStatut] = useState<DocumentStatut>("En attente");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [newDocType, setNewDocType] = useState<"Devis" | "Facture">("Devis");
  const [newDocPatient, setNewDocPatient] = useState("");
  const [newDocMontant, setNewDocMontant] = useState("");

  useEffect(() => {
    setMounted(true);
    const parsed = parseDocumentsFromStorage(
      typeof window !== "undefined"
        ? localStorage.getItem(DOCS_STORAGE_KEY)
        : null,
    );
    setDocuments(parsed ?? [...DOCUMENTS_MOCK]);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem(DOCS_STORAGE_KEY, JSON.stringify(documents));
  }, [mounted, documents]);

  useEffect(() => {
    if (!toastMessage) return;
    const timeoutId = window.setTimeout(() => setToastMessage(null), 2500);
    return () => window.clearTimeout(timeoutId);
  }, [toastMessage]);

  function handleGenerateDoc() {
    if (!newDocPatient.trim() || !newDocMontant.trim()) return;

    const id =
      newDocType === "Devis"
        ? `DEV-2026-0${Math.floor(Math.random() * 100) + 90}`
        : `FCT-2026-0${Math.floor(Math.random() * 100) + 50}`;

    const montantFormatted = formatMontantWithDA(newDocMontant);
    if (!montantFormatted) return;

    const statut: DocumentStatut =
      newDocType === "Devis" ? "En attente" : "En retard";

    const newDoc: DocumentMock = {
      id,
      date: formatDateDDMMYYYY(new Date()),
      patient: newDocPatient.trim(),
      type: newDocType,
      montant: montantFormatted,
      statut,
    };

    setDocuments((prev) => [newDoc, ...prev]);
    setIsModalOpen(false);
    setNewDocType("Devis");
    setNewDocPatient("");
    setNewDocMontant("");
  }

  function handleOpenEdit(doc: DocumentMock) {
    setEditingDoc(doc);
    setEditMontant(doc.montant);
    setEditStatut(doc.statut);
    setOpenMenuId(null);
  }

  function handleSaveEditDoc() {
    if (!editingDoc) return;
    const montantFormatted = formatMontantWithDA(editMontant);
    if (!montantFormatted) return;
    setDocuments((prev) =>
      prev.map((doc) =>
        doc.id === editingDoc.id
          ? {
              ...doc,
              montant: montantFormatted,
              statut: editStatut,
            }
          : doc,
      ),
    );
    setEditingDoc(null);
  }

  function handleDeleteDoc(docId: string) {
    const ok = window.confirm("Supprimer ce document ?");
    if (!ok) return;
    setDocuments((prev) => prev.filter((doc) => doc.id !== docId));
    setOpenMenuId(null);
  }

  const filteredDocs = useMemo(() => {
    const base = documents.filter((doc) => {
      if (activeTab === "Tous") return true;
      if (activeTab === "Devis") return doc.type === "Devis";
      if (activeTab === "Factures") return doc.type === "Facture";
      if (activeTab === "Impayés") return doc.statut === "En retard";
      return true;
    });

    const q = search.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (doc) =>
        doc.patient.toLowerCase().includes(q) ||
        doc.id.toLowerCase().includes(q),
    );
  }, [documents, activeTab, search]);

  return (
    <div className="min-h-screen space-y-6 bg-slate-50 p-4 sm:p-6">
      {/* En-tête */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-900">
            Factures &amp; Devis
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Gérez vos encaissements et vos propositions de traitement.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition-colors hover:bg-indigo-700"
        >
          + Créer (Devis/Facture)
        </button>
      </div>

      {/* Mini-KPI */}
      <div className="mb-2 grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-slate-500">À encaisser</p>
          <p className="mt-2 text-2xl font-bold text-orange-500">
            320 000 DA
          </p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-slate-500">Devis en attente</p>
          <p className="mt-2 text-2xl font-bold text-sky-500">
            2 400 000 DA
          </p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium text-slate-500">Encaissé ce mois</p>
          <p className="mt-2 text-2xl font-bold text-emerald-600">
            1 850 000 DA
          </p>
        </div>
      </div>

      {/* Gestionnaire de documents */}
      <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un patient ou n° facture..."
              className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div className="flex w-full justify-start sm:w-auto">
            <div className="flex border-b border-slate-200">
              {TABS.map(({ key, label }) => {
                const active = activeTab === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveTab(key)}
                    className={[
                      "px-4 pb-3 text-sm font-medium transition-colors",
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
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  N° Document
                </th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Date
                </th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Patient
                </th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Type (Devis/Facture)
                </th>
                <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Montant
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
              {filteredDocs.map((doc) => (
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
                      onClick={() => doc.patientId && router.push("/patients/" + doc.patientId)}
                      className="transition-colors hover:text-indigo-600"
                    >
                      {doc.patient}
                    </button>
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-700">
                    <button
                      type="button"
                      onClick={() => doc.patientId && router.push("/patients/" + doc.patientId)}
                      className="transition-colors hover:text-indigo-600"
                    >
                      {doc.type}
                    </button>
                  </td>
                  <td className="px-5 py-4 text-right text-sm font-semibold text-slate-900">
                    {doc.montant}
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge statut={doc.statut} />
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (doc.patientId) {
                            router.push("/patients/" + doc.patientId);
                            return;
                          }
                          alert("Aucun patient lié à ce document.");
                        }}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-100 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
                        aria-label="Voir / Imprimer PDF"
                      >
                        <FileText className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setOpenMenuId((prev) => (prev === doc.id ? null : doc.id))
                        }
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-100 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
                        aria-label="Options"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                      {openMenuId === doc.id && (
                        <div className="absolute right-5 z-30 mt-20 w-44 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-lg">
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
              ))}

              {filteredDocs.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-10 text-center text-sm text-slate-500"
                  >
                    Aucun document ne correspond à votre recherche.
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
            aria-labelledby="modal-nouveau-doc"
            className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <h2
                id="modal-nouveau-doc"
                className="text-lg font-semibold text-slate-900"
              >
                Nouveau Document
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
                  htmlFor="doc-type"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Type
                </label>
                <select
                  id="doc-type"
                  value={newDocType}
                  onChange={(e) =>
                    setNewDocType(e.target.value as "Devis" | "Facture")
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="Devis">Devis</option>
                  <option value="Facture">Facture</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="doc-patient"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Patient
                </label>
                <select
                  id="doc-patient"
                  value={newDocPatient}
                  onChange={(e) => setNewDocPatient(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="" disabled>
                    Sélectionner un patient…
                  </option>
                  {PATIENTS_LIST.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="doc-montant"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Montant (DA)
                </label>
                <input
                  id="doc-montant"
                  type="text"
                  inputMode="decimal"
                  value={newDocMontant}
                  onChange={(e) => setNewDocMontant(e.target.value)}
                  placeholder="Ex : 45 000"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
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
                onClick={handleGenerateDoc}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700"
              >
                Générer
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
                  Montant
                </label>
                <input
                  type="text"
                  value={editMontant}
                  onChange={(e) => setEditMontant(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Statut
                </label>
                <select
                  value={editStatut}
                  onChange={(e) => setEditStatut(e.target.value as DocumentStatut)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="Payé">Payé</option>
                  <option value="En attente">En attente</option>
                  <option value="En retard">En retard</option>
                  <option value="Accepté">Accepté</option>
                </select>
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
