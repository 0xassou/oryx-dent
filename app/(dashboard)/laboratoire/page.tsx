"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, FileText, Plus, X } from "lucide-react";

type StatutProtheses = "Empreintes envoyées" | "En fabrication" | "Reçu au cabinet" | "Posé";

interface Commande {
  id: string;
  patient: string;
  travail: string;
  labo: string;
  retourIso: string; // yyyy-mm-dd
  teinte?: string;
  materiau?: string;
  rdvPatientIso?: string; // yyyy-mm-dd
  statut: StatutProtheses;
}

const MOCK_TODAY = new Date(2026, 2, 17); // 17 mars 2026 (maquette cohérente)

function uid() {
  return Math.random().toString(16).slice(2);
}

const STATUT_BADGES: Record<StatutProtheses, string> = {
  "Empreintes envoyées": "bg-slate-50 text-slate-700",
  "En fabrication": "bg-blue-50/70 text-blue-800",
  "Reçu au cabinet": "bg-emerald-50/70 text-emerald-800",
  Posé: "bg-white text-slate-400",
};

function parseIsoToDate(iso: string) {
  // iso: yyyy-mm-dd
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0);
}

function formatRetourLabel(iso: string) {
  const d = parseIsoToDate(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}

function isAlerteRetour(iso: string) {
  const due = parseIsoToDate(iso);
  if (Number.isNaN(due.getTime())) return false;
  const tomorrow = new Date(MOCK_TODAY);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return due.getTime() <= tomorrow.getTime();
}

function isConflitRdvRetour(rdvIso: string | undefined, retourIso: string) {
  if (!rdvIso) return false;
  const rdv = parseIsoToDate(rdvIso);
  const retour = parseIsoToDate(retourIso);
  if (Number.isNaN(rdv.getTime()) || Number.isNaN(retour.getTime()))
    return false;

  // Conflit simulé : retour labo le même jour ou le lendemain du RDV patient.
  const oneDayMs = 24 * 60 * 60 * 1000;
  const diffMs = retour.getTime() - rdv.getTime();
  return diffMs >= 0 && diffMs <= oneDayMs;
}

export default function LaboratoirePage() {
  const [activeTab, setActiveTab] = useState<
    "all" | "urgent" | "fabrication" | "ready"
  >("all");

  const [commandes, setCommandes] = useState<Commande[]>([
    {
      id: "cmd1",
      patient: "Marie Dupont",
      travail: "Couronne Céramo-Métallique sur 46",
      teinte: "A2",
      materiau: "Zircone",
      labo: "Labo Dentaire Express",
      retourIso: "2026-03-18", // demain => alerte
      rdvPatientIso: "2026-03-18", // même jour => conflit simulé
      statut: "Empreintes envoyées",
    },
    {
      id: "cmd2",
      patient: "Jean Martin",
      travail: "Inlay-Onlay (Composite) sur 16",
      teinte: "B1",
      materiau: "Emax",
      labo: "Prothèse & Co",
      retourIso: "2026-03-17", // aujourd'hui => alerte
      rdvPatientIso: "2026-03-15",
      statut: "En fabrication",
    },
    {
      id: "cmd3",
      patient: "Sophie Bernard",
      travail: "Bridge Zircone 24-25-26",
      teinte: "C3",
      materiau: "Zircone",
      labo: "ZircoLab",
      retourIso: "2026-03-19", // après demain => OK
      rdvPatientIso: "2026-03-18",
      statut: "Reçu au cabinet",
    },
    {
      id: "cmd4",
      patient: "Claire Moreau",
      travail: "Prothèse partielle (résine) — modèle 3",
      teinte: "A3.5",
      materiau: "Résine",
      labo: "ClinPro Lab",
      retourIso: "2026-03-10", // dépassée mais statut posé
      rdvPatientIso: "2026-03-05",
      statut: "Posé",
    },
  ]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [patient, setPatient] = useState("");
  const [travail, setTravail] = useState<string>("Couronne Céramique");
  const [labo, setLabo] = useState<string>("Labo Dentaire Express");
  const [retourIso, setRetourIso] = useState<string>("");

  const TRAVAUX = [
    "Couronne Céramique",
    "Inlay/Onlay",
    "Prothèse Amovible",
    "Gouttière",
  ] as const;

  const LABOS = [
    "Labo Dentaire Express",
    "Prothèse & Co",
    "ClinPro Lab",
  ] as const;

  const filtered = useMemo(() => {
    if (activeTab === "all") return commandes;
    if (activeTab === "fabrication")
      return commandes.filter((c) => c.statut === "En fabrication");
    if (activeTab === "ready")
      return commandes.filter(
        (c) => c.statut === "Reçu au cabinet",
      );
    // urgent
    return commandes.filter((c) => c.statut !== "Posé" && isAlerteRetour(c.retourIso));
  }, [activeTab, commandes]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[color:var(--ds-text)]">
            Laboratoire & Prothèses
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Suivi des commandes de prothèses et travaux au laboratoire.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[color:var(--ds-primary)] px-4 py-2.5 text-xs font-medium text-white shadow-sm transition-colors hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          + Nouvelle Commande
        </button>
      </div>

      {/* Onglets (filtres) */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/60 bg-white p-1 shadow-[0_8px_30px_rgba(0,0,0,0.03)]">
        <button
          type="button"
          onClick={() => setActiveTab("all")}
          className={[
            "rounded-xl px-4 py-2 text-sm font-medium transition-all",
            activeTab === "all"
              ? "bg-[color:var(--ds-primary)] text-white shadow-sm"
              : "text-slate-500 hover:text-slate-700",
          ].join(" ")}
        >
          Toutes les commandes
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("urgent")}
          className={[
            "rounded-xl px-4 py-2 text-sm font-medium transition-all",
            activeTab === "urgent"
              ? "bg-red-500 text-white shadow-sm"
              : "text-slate-500 hover:text-slate-700",
          ].join(" ")}
        >
          ⚠️ Urgences / Retards
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("fabrication")}
          className={[
            "rounded-xl px-4 py-2 text-sm font-medium transition-all",
            activeTab === "fabrication"
              ? "bg-[color:var(--ds-primary)] text-white shadow-sm"
              : "text-slate-500 hover:text-slate-700",
          ].join(" ")}
        >
          ⏳ En fabrication
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("ready")}
          className={[
            "rounded-xl px-4 py-2 text-sm font-medium transition-all",
            activeTab === "ready"
              ? "bg-[color:var(--ds-primary)] text-white shadow-sm"
              : "text-slate-500 hover:text-slate-700",
          ].join(" ")}
        >
          ✅ Prêtes à poser
        </button>
      </div>

      {/* Liste intelligente */}
      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
        <div className="divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">
              Aucune commande trouvée.
            </div>
          ) : (
            filtered.map((cmd) => {
              const critical = isAlerteRetour(cmd.retourIso);
              const retourLabel = formatRetourLabel(cmd.retourIso);
              const rdvPatientLabel = cmd.rdvPatientIso
                ? formatRetourLabel(cmd.rdvPatientIso)
                : "";
              const conflitRdv = isConflitRdvRetour(
                cmd.rdvPatientIso,
                cmd.retourIso,
              );
              const statutBadge = STATUT_BADGES[cmd.statut];

              return (
                <div
                  key={cmd.id}
                  className="grid grid-cols-1 gap-3 px-4 py-4 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] sm:items-center hover:bg-slate-50/60 transition-colors border-b border-slate-50 last:border-b-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[color:var(--ds-text)]">
                      {cmd.patient}
                    </p>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {cmd.travail}
                    </p>
                    {cmd.teinte && cmd.materiau ? (
                      <p className="mt-1 text-xs text-slate-500">
                        Teinte : {cmd.teinte} • {cmd.materiau}
                      </p>
                    ) : null}
                  </div>

                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-700">
                      {cmd.labo}
                    </p>
                  </div>

                  <div>
                    <span
                      className={
                        "inline-flex items-center rounded-lg px-2.5 py-1 text-[11px] font-semibold " +
                        statutBadge
                      }
                    >
                      {cmd.statut}
                    </span>
                  </div>

                  <div className="min-w-0 space-y-1">
                    <p className="text-[11px] font-medium text-slate-500">
                      Retour Labo prévu :{" "}
                      <span
                        className={[
                          "font-semibold",
                          cmd.statut === "Posé" ? "line-through opacity-70" : "",
                          critical ? "text-red-600" : "text-slate-700",
                        ].join(" ")}
                      >
                        {retourLabel}
                      </span>
                    </p>

                    {cmd.rdvPatientIso ? (
                      <p
                        className={[
                          "flex items-center gap-2 text-sm font-semibold",
                          conflitRdv
                            ? "font-bold text-red-600"
                            : "text-slate-700",
                        ].join(" ")}
                      >
                        {conflitRdv ? (
                          <AlertTriangle className="h-4 w-4" />
                        ) : null}
                        <span>
                          RDV Patient :{" "}
                          <span className={conflitRdv ? "font-bold" : ""}>
                            {rdvPatientLabel}
                          </span>
                        </span>
                      </p>
                    ) : null}
                  </div>

                  <div className="justify-self-end flex items-center gap-2">
                    <select
                      value={cmd.statut}
                      onChange={(e) => {
                        const nextStatut = e.target.value as StatutProtheses;
                        setCommandes((prev) =>
                          prev.map((c) =>
                            c.id === cmd.id ? { ...c, statut: nextStatut } : c,
                          ),
                        );
                      }}
                      aria-label={`Mettre à jour le statut de ${cmd.patient}`}
                      className="rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                    >
                      <option value="Empreintes envoyées">
                        Empreintes envoyées
                      </option>
                      <option value="En fabrication">En fabrication</option>
                      <option value="Reçu au cabinet">Reçu au cabinet</option>
                      <option value="Posé">Posé</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => alert("Génération du bon PDF...")}
                      title="Générer le bon de commande"
                      aria-label="Télécharger le bon de commande"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-50 hover:text-[color:var(--ds-primary)]"
                    >
                      <FileText className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Créer une commande"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setIsModalOpen(false);
          }}
        >
          <div
            className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold tracking-tight text-[color:var(--ds-text)]">
                  Nouvelle commande
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Ajoutez une commande au laboratoire.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              className="mt-5 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();

                const trimmedPatient = patient.trim();
                if (!trimmedPatient || !retourIso) return;

                const next: Commande = {
                  id: `cmd-${uid()}`,
                  patient: trimmedPatient,
                  travail,
                  labo,
                  retourIso,
                  statut: "Empreintes envoyées",
                };

                setCommandes((prev) => [next, ...prev]);
                setIsModalOpen(false);
                setPatient("");
                setRetourIso("");
                setTravail("Couronne Céramique");
                setLabo("Labo Dentaire Express");
              }}
            >
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Nom du patient
                </label>
                <input
                  type="text"
                  value={patient}
                  onChange={(e) => setPatient(e.target.value)}
                  className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                  placeholder="Ex: Marie Dupont"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Type de travail
                </label>
                <select
                  value={travail}
                  onChange={(e) => setTravail(e.target.value)}
                  className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                >
                  {TRAVAUX.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Laboratoire
                </label>
                <select
                  value={labo}
                  onChange={(e) => setLabo(e.target.value)}
                  className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                >
                  {LABOS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Date de retour prévue
                </label>
                <input
                  type="date"
                  value={retourIso}
                  onChange={(e) => setRetourIso(e.target.value)}
                  className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-[color:var(--ds-primary)] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:opacity-90"
                >
                  Créer la commande
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

