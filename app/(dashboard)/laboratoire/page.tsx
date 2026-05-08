"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  Package,
  Pencil,
  Phone,
  Plus,
  Search,
  Send,
  Trash2,
  X,
} from "lucide-react";
import AnimatedButton from "@/components/ui/AnimatedButton";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { LabWhatsAppButton } from "@/components/laboratoire/LabWhatsAppButton";
import { PatientCombobox } from "@/components/laboratoire/PatientCombobox";
import { StatusBadge } from "@/components/laboratoire/StatusBadge";
import { addExpenseToStorage } from "@/utils/expensesData";
import { showAppToast } from "@/utils/appToast";
import {
  APPOINTMENTS_UPDATED_EVENT,
  appointmentJoinedRowToRdv,
  notifyAppointmentsUpdated,
  type AppointmentRdv,
} from "@/utils/appointmentData";
import {
  computeLinkedAppointmentDateMovesFromLab,
  filterAppointmentsForPatient,
  pullAgendaDatesIntoLabCommandes,
} from "@/utils/labAgendaSync";
import {
  findLabById,
  findLabByName,
  LABS_DIRECTORY_UPDATED_EVENT,
  readLabsDirectoryFromStorage,
  type DentalLabPartner,
} from "@/utils/labsDirectory";
import {
  LAB_STATUT_ORDER,
  dateIsoAddDays,
  isCouronneOrBridgeTravail,
  isRetourUrgent,
  isRdvPatientBeforeRetourLabo,
  laboratoireStatutLabel,
  laboratoireStatutToastPhrase,
  type LaboratoireCommande,
  type LaboratoireStatut,
  readLabCommandesFromStorage,
  todayIsoLocal,
  writeLabCommandesToStorage,
} from "@/utils/laboratoireCommandes";
import { getPatientsAction } from "@/app/actions/patients";
import {
  getAppointmentsAction,
  updateAppointmentAction,
} from "@/app/actions/appointments";
import {
  displayPatientName,
  patientRowToDentalPatientRecord,
  type DentalPatientRecord,
} from "@/utils/patientData";
import { generateLabBonPDF } from "@/utils/generateLabBonPDF";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function uid() {
  return Math.random().toString(16).slice(2);
}

function capitalizeToastPhrase(s: string) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function parseIsoToDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0);
}

/** Ex. « 12 Mars » */
function formatDatePretty(iso: string | undefined): string {
  if (!iso) return "—";
  const d = parseIsoToDate(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const s = d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
  });
  const parts = s.split(" ");
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    parts[parts.length - 1] =
      last.charAt(0).toUpperCase() + last.slice(1);
    return parts.join(" ");
  }
  return s;
}

function maybeCreateLabExpense(cmd: LaboratoireCommande): LaboratoireCommande {
  if (cmd.statut !== "RECU_CABINET") return cmd;
  const cost = cmd.coutLaboDa ?? 0;
  if (cost <= 0 || cmd.labExpenseId) return cmd;
  const exp = addExpenseToStorage({
    date: new Date().toISOString().slice(0, 10),
    libelle: `Labo: ${cmd.patient}`,
    montant: cost,
    categorie: "Labo",
    justificatif_url: "",
  });
  return { ...cmd, labExpenseId: exp.id };
}

function labDatesDiffer(
  a: LaboratoireCommande,
  b: LaboratoireCommande,
): boolean {
  return (
    a.rdvPatientIso !== b.rdvPatientIso ||
    a.retourIso !== b.retourIso ||
    a.linkedPoseAppointmentId !== b.linkedPoseAppointmentId ||
    a.linkedRetourAppointmentId !== b.linkedRetourAppointmentId
  );
}

const inputSubtle =
  "w-full rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 py-2 text-xs font-normal text-[var(--ds-text)] outline-none transition-colors focus:border-[var(--ds-primary-border)] focus:ring-1 focus:ring-[var(--ds-primary-border)]/60";

/** Extrait la ou les dents d'un libellé "Couronne … sur 46" ou "Bridge 24-25-26". */
function parseDentFromTravail(travail: string): string | null {
  const m = travail.match(/\b(\d{1,2}(?:\s*[-,]\s*\d{1,2}){0,4})\b/g);
  if (!m || m.length === 0) return null;
  return m[m.length - 1].replace(/\s+/g, "");
}

/** Libellé sans la dent (ex. "Couronne Céramo-Métallique sur 46" → "Couronne Céramo-Métallique"). */
function travailWithoutDent(travail: string): string {
  return travail
    .replace(/\s*(?:sur\s+)?\d{1,2}(?:\s*[-,]\s*\d{1,2}){0,4}\s*$/i, "")
    .trim();
}

/** Jour au format court FR (ex. "14 avr."). */
function formatDayShortFR(iso: string | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt
    .toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })
    .replace(".", "");
}

function isPastIso(iso: string | undefined): boolean {
  if (!iso) return false;
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1, 23, 59, 59);
  if (Number.isNaN(dt.getTime())) return false;
  return dt.getTime() < Date.now();
}

/** Bandeau gauche 4px — DESIGN.md §09 Labo (#f97316) + séquentiel état / urgence calendrier. */
function commandeCardLeftAccent(
  cmd: LaboratoireCommande,
  conflit: boolean,
): string {
  if (conflit && cmd.statut !== "POSE") return "border-l-[#ef4444]";
  switch (cmd.statut) {
    case "EN_ATTENTE":
      return "border-l-[#f59e0b]";
    case "EN_FABRICATION":
      return "border-l-[#06b6d4]";
    case "RECU_CABINET":
    case "POSE":
      return "border-l-[#10b981]";
    default:
      return "border-l-[#f97316]";
  }
}

type ActiveTab = "all" | "urgent" | "fabrication" | "ready" | "pose";
type FilterKey = ActiveTab;

export default function LaboratoirePage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("all");

  const [commandes, setCommandes] = useState<LaboratoireCommande[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [patients, setPatients] = useState<DentalPatientRecord[]>([]);
  const [labs, setLabs] = useState<DentalLabPartner[]>([]);
  const [appointments, setAppointments] = useState<AppointmentRdv[]>([]);
  const [drawerCommandId, setDrawerCommandId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalPatientId, setModalPatientId] = useState<string | null>(null);
  const [modalLabId, setModalLabId] = useState<string>("");
  const [modalPoseApptId, setModalPoseApptId] = useState("");
  const [modalRetourApptId, setModalRetourApptId] = useState("");
  const [travail, setTravail] = useState<string>("Couronne Céramique");
  const [modalDent, setModalDent] = useState<string>("");
  const [modalMateriau, setModalMateriau] = useState<string>("");
  const [modalTeinte, setModalTeinte] = useState<string>("");
  const [modalCoutLaboDa, setModalCoutLaboDa] = useState<number>(0);
  const [retourIso, setRetourIso] = useState<string>("");
  const [rdvPatientIso, setRdvPatientIso] = useState<string>("");

  const TRAVAUX = [
    "Couronne Céramique",
    "Bridge",
    "Inlay/Onlay",
    "Prothèse Amovible",
    "Gouttière",
  ] as const;

  const refreshPatients = useCallback(async () => {
    const res = await getPatientsAction();
    if (!res.ok) {
      console.error(res.error);
      return;
    }
    setPatients(res.data.map(patientRowToDentalPatientRecord));
  }, []);

  useEffect(() => {
    void refreshPatients();
    void (async () => {
      const res = await getAppointmentsAction();
      if (res.ok) {
        setAppointments(res.data.map(appointmentJoinedRowToRdv));
      }
    })();
    setLabs(readLabsDirectoryFromStorage());
    setCommandes(readLabCommandesFromStorage());
    setHydrated(true);
  }, [refreshPatients]);

  useEffect(() => {
    function onLabs() {
      setLabs(readLabsDirectoryFromStorage());
    }
    window.addEventListener(LABS_DIRECTORY_UPDATED_EVENT, onLabs);
    return () =>
      window.removeEventListener(LABS_DIRECTORY_UPDATED_EVENT, onLabs);
  }, []);

  useEffect(() => {
    function onAppt() {
      void (async () => {
        const res = await getAppointmentsAction();
        if (!res.ok) return;
        const apps = res.data.map(appointmentJoinedRowToRdv);
        setAppointments(apps);
        setCommandes((prev) => {
          const merged = pullAgendaDatesIntoLabCommandes(prev, apps);
          const pmap = new Map(prev.map((c) => [c.id, c]));
          for (const m of merged) {
            const p = pmap.get(m.id);
            if (!p || labDatesDiffer(p, m)) {
              return merged;
            }
          }
          return prev;
        });
      })();
    }
    window.addEventListener(APPOINTMENTS_UPDATED_EVENT, onAppt);
    return () =>
      window.removeEventListener(APPOINTMENTS_UPDATED_EVENT, onAppt);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    writeLabCommandesToStorage(commandes);
  }, [commandes, hydrated]);

  useEffect(() => {
    if (!isModalOpen) return;
    setModalPatientId(null);
    setModalPoseApptId("");
    setModalRetourApptId("");
    setRdvPatientIso("");
    setModalDent("");
    setModalMateriau("");
    setModalTeinte("");
    setModalCoutLaboDa(0);
    setTravail("Couronne Céramique");
    const t0 = "Couronne Céramique";
    setRetourIso(
      isCouronneOrBridgeTravail(t0)
        ? dateIsoAddDays(todayIsoLocal(), 7)
        : "",
    );
    const L = readLabsDirectoryFromStorage();
    setLabs(L);
    setModalLabId(L[0]?.id ?? "");
    void (async () => {
      const res = await getAppointmentsAction();
      if (res.ok) setAppointments(res.data.map(appointmentJoinedRowToRdv));
    })();
  }, [isModalOpen]);

  useEffect(() => {
    if (!isModalOpen) return;
    if (isCouronneOrBridgeTravail(travail)) {
      setRetourIso(dateIsoAddDays(todayIsoLocal(), 7));
    }
  }, [travail, isModalOpen]);

  const modalPatientRecord = useMemo(
    () => patients.find((p) => p.id === modalPatientId) ?? null,
    [patients, modalPatientId],
  );

  const modalAppts = useMemo(() => {
    if (!modalPatientRecord || !modalPatientId) return [];
    return filterAppointmentsForPatient(
      appointments,
      modalPatientId,
      displayPatientName(modalPatientRecord),
    );
  }, [appointments, modalPatientId, modalPatientRecord]);

  const patchCommand = useCallback((id: string, next: LaboratoireCommande) => {
    setCommandes((prev) =>
      prev.map((c) => (c.id === id ? next : c)),
    );
    void (async () => {
      const appsRes = await getAppointmentsAction();
      if (!appsRes.ok) return;
      const apps = appsRes.data.map(appointmentJoinedRowToRdv);
      const moves = computeLinkedAppointmentDateMovesFromLab(apps, next);
      for (const m of moves) {
        const up = await updateAppointmentAction(m.appointmentId, {
          date: m.newDateIso.trim().slice(0, 10),
        });
        if (!up.ok) console.error(up.error);
      }
      if (moves.length === 0) return;
      showAppToast(capitalizeToastPhrase(moves[0].toast));
      const refreshed = await getAppointmentsAction();
      if (!refreshed.ok) return;
      const refreshedApps = refreshed.data.map(appointmentJoinedRowToRdv);
      setAppointments(refreshedApps);
      setCommandes((prev) =>
        pullAgendaDatesIntoLabCommandes(
          prev.map((c) => (c.id === id ? next : c)),
          refreshedApps,
        ),
      );
      notifyAppointmentsUpdated();
    })();
  }, []);

  const urgentCommandes = useMemo(
    () =>
      commandes.filter(
        (c) =>
          c.statut !== "POSE" &&
          isRdvPatientBeforeRetourLabo(c.rdvPatientIso, c.retourIso),
      ),
    [commandes],
  );

  const fabricationCommandes = useMemo(
    () => commandes.filter((c) => c.statut === "EN_FABRICATION"),
    [commandes],
  );

  const recuCommandes = useMemo(
    () => commandes.filter((c) => c.statut === "RECU_CABINET"),
    [commandes],
  );

  const poseCommandes = useMemo(
    () => commandes.filter((c) => c.statut === "POSE"),
    [commandes],
  );

  const tabFiltered = useMemo(() => {
    if (activeTab === "all") return commandes;
    if (activeTab === "fabrication") return fabricationCommandes;
    if (activeTab === "ready") return recuCommandes;
    if (activeTab === "pose") return poseCommandes;
    return urgentCommandes;
  }, [
    activeTab,
    commandes,
    fabricationCommandes,
    poseCommandes,
    recuCommandes,
    urgentCommandes,
  ]);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return tabFiltered;
    return tabFiltered.filter((c) => {
      const patient = c.patient.toLowerCase();
      const travail = c.travail.toLowerCase();
      return patient.includes(q) || travail.includes(q);
    });
  }, [tabFiltered, searchTerm]);

  function apptsForCommand(cmd: LaboratoireCommande): AppointmentRdv[] {
    return filterAppointmentsForPatient(
      appointments,
      cmd.patientId,
      cmd.patient,
    );
  }

  const changeStatut = useCallback(
    (cmd: LaboratoireCommande, s: LaboratoireStatut) => {
      if (s === cmd.statut) return;
      setCommandes((prev) =>
        prev.map((c) => {
          if (c.id !== cmd.id) return c;
          let next: LaboratoireCommande = { ...c, statut: s };
          if (s === "RECU_CABINET") next = maybeCreateLabExpense(next);
          return next;
        }),
      );
      showAppToast(
        `Statut mis à jour : ${capitalizeToastPhrase(
          laboratoireStatutToastPhrase(s),
        )}`,
      );
    },
    [],
  );

  const deleteCommande = useCallback((cmd: LaboratoireCommande) => {
    if (
      !window.confirm(
        `Supprimer la commande de « ${cmd.patient} » ? Cette action est irréversible.`,
      )
    ) {
      return;
    }
    setCommandes((prev) => prev.filter((c) => c.id !== cmd.id));
    setDrawerCommandId(null);
    showAppToast("Commande supprimée");
  }, []);

  const drawerCommand = useMemo(
    () => commandes.find((c) => c.id === drawerCommandId) ?? null,
    [commandes, drawerCommandId],
  );

  useEffect(() => {
    if (!drawerCommandId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDrawerCommandId(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerCommandId]);

  const tabCounts: Record<ActiveTab, number> = {
    all: commandes.length,
    urgent: urgentCommandes.length,
    fabrication: fabricationCommandes.length,
    ready: recuCommandes.length,
    pose: poseCommandes.length,
  };

  const FILTERS: Array<{ key: FilterKey; label: string; count: number }> = [
    { key: "all", label: "Toutes", count: tabCounts.all },
    { key: "urgent", label: "Urgences", count: tabCounts.urgent },
    { key: "fabrication", label: "Fabrication", count: tabCounts.fabrication },
    { key: "ready", label: "Reçu", count: tabCounts.ready },
    { key: "pose", label: "Posé", count: tabCounts.pose },
  ];

  return (
    <div className="space-y-0 bg-[var(--ds-bg)] pb-8 font-sans">
      <header className="flex items-start justify-between pb-5 pt-6">
        <div>
          <h1 className="text-[28px] font-bold leading-tight tracking-tight text-[color:var(--ds-text)]">
            Laboratoire &amp; Prothèses
          </h1>
          <p className="mt-1.5 text-sm font-normal leading-relaxed text-[var(--ds-text-muted)]">
            Suivi des commandes prothétiques et des délais laboratoire
          </p>
        </div>
        <AnimatedButton
          onClick={() => setIsModalOpen(true)}
          className="rounded-[12px] bg-[color:var(--ds-primary)] px-4 py-2.5 text-[13px] font-semibold text-white shadow-[0_4px_16px_rgba(124,58,237,0.25)] transition-colors hover:bg-[color:var(--ds-primary-hover)]"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2} />
          Nouvelle commande labo
        </AnimatedButton>
      </header>

      <div className="grid grid-cols-1 gap-3 pb-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          variant="lab"
          kpi="rdv"
          icon={<ClipboardList />}
          value={commandes.length}
          label="TOTAL COMMANDES"
        />
        <KpiCard
          variant="lab"
          kpi="stock"
          icon={<AlertTriangle />}
          value={urgentCommandes.length}
          label="URGENCES"
          stockAlertCount={urgentCommandes.length}
        />
        <KpiCard
          variant="lab"
          kpi="patients"
          icon={<Clock />}
          value={fabricationCommandes.length}
          label="EN FABRICATION"
        />
        <KpiCard
          variant="lab"
          kpi="kits"
          icon={<CheckCircle2 />}
          value={recuCommandes.length}
          label="REÇU AU CABINET"
        />
      </div>

      {urgentCommandes.length > 0 ? (
        <div className="mx-0 mb-5 flex flex-col gap-3 rounded-[16px] border border-[#fde68a] bg-[#fffbeb] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-2.5 sm:items-center">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#d97706] sm:mt-0" />
            <p className="text-sm font-medium leading-snug text-[#d97706]">
              <span className="font-mono tabular-nums font-medium tracking-tight">
                {urgentCommandes.length}
              </span>{" "}
              commande{urgentCommandes.length > 1 ? "s" : ""} ont une date de
              pose prévue avant le retour du labo — action requise.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab("urgent")}
            className="shrink-0 rounded-[12px] border border-[#f59e0b] px-3.5 py-2 text-[13px] font-semibold text-[#d97706] transition-colors hover:bg-[#fef3c7]"
          >
            Voir les commandes urgentes
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setActiveTab(f.key)}
              type="button"
              className={cn(
                "flex items-center gap-2 rounded-[12px] border px-3.5 py-2 text-[13px] transition-colors",
                activeTab === f.key
                  ? "border-transparent bg-[color:var(--ds-primary)] font-semibold text-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                  : "border-[var(--ds-border)] bg-[var(--ds-surface)] font-medium text-[var(--ds-text-muted)] hover:bg-[var(--ds-primary-soft)]",
              )}
            >
              {f.label}
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 font-mono text-[11px] font-medium tabular-nums leading-none tracking-tight",
                  activeTab === f.key
                    ? "bg-white/20 text-white"
                    : "bg-[var(--ds-bg)] text-[var(--ds-text-muted)]",
                )}
              >
                {f.count}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 rounded-[12px] border border-[var(--ds-border)] bg-[var(--ds-surface)] px-3 py-2 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <Search
            className="h-3.5 w-3.5 shrink-0 text-[var(--ds-text-muted)]"
            strokeWidth={2}
          />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Rechercher un patient, un acte…"
            className="w-52 border-0 bg-transparent text-[13px] font-normal text-[color:var(--ds-text)] outline-none placeholder:text-[var(--ds-text-subtle)]"
          />
        </div>
      </div>

      <p className="pb-4 text-sm font-normal leading-relaxed text-[var(--ds-text-muted)]">
        <span className="font-mono text-sm font-medium tabular-nums text-[var(--ds-text-muted)]">
          {filtered.length}
        </span>{" "}
        commande
        {filtered.length > 1 ? "s" : ""} trouvée
        {filtered.length > 1 ? "s" : ""}
      </p>

      {filtered.length === 0 ? (
        <div className="mx-0 rounded-[20px] border border-dashed border-[var(--ds-primary-border)]/80 bg-[var(--ds-surface)]/60 px-6 py-16 text-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          {searchTerm.trim() && tabFiltered.length > 0 ? (
            <div className="mx-auto max-w-md space-y-3">
              <div
                className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--ds-bg)] text-[var(--ds-text-muted)]/60"
                aria-hidden
              >
                <Search className="h-6 w-6" strokeWidth={1.5} />
              </div>
              <p className="text-sm font-light leading-relaxed text-[var(--ds-text-muted)]">
                Aucun résultat pour &quot;{searchTerm.trim()}&quot; dans le
                Laboratoire.
              </p>
            </div>
          ) : (
            <p className="text-sm font-light text-[var(--ds-text-muted)]">
              Aucune commande dans ce filtre.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.map((cmd) => {
            const critical = isRetourUrgent(cmd.retourIso);
            const conflit = isRdvPatientBeforeRetourLabo(
              cmd.rdvPatientIso,
              cmd.retourIso,
            );
            const retourPast =
              isPastIso(cmd.retourIso) &&
              cmd.statut !== "RECU_CABINET" &&
              cmd.statut !== "POSE";
            const posePast = isPastIso(cmd.rdvPatientIso);
            const pretAPoser = cmd.statut === "RECU_CABINET";

            const labPartner: DentalLabPartner =
              findLabByName(cmd.labo, labs) ?? {
                id: "",
                nom: cmd.labo,
                telephones: [],
                adresse: "",
              };

            const dent = cmd.dent ?? parseDentFromTravail(cmd.travail);
            const acte = travailWithoutDent(cmd.travail);

            const statutLabel = laboratoireStatutLabel(cmd.statut);

            return (
              <article
                key={cmd.id}
                role="button"
                tabIndex={0}
                onClick={() => setDrawerCommandId(cmd.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setDrawerCommandId(cmd.id);
                  }
                }}
                className={cn(
                  "cursor-pointer rounded-[20px] border border-[var(--ds-border)] bg-[var(--ds-surface)] py-5 pl-5 pr-6",
                  "border-l-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)]",
                  commandeCardLeftAccent(cmd, conflit),
                )}
              >
                <div className="mb-2.5 flex flex-wrap items-center gap-2">
                  <span className="text-lg font-bold leading-snug tracking-tight text-[color:var(--ds-text)]">
                    {cmd.patient}
                  </span>
                  <StatusBadgeInline statut={statutLabel} />
                  {conflit && cmd.statut !== "POSE" ? <UrgenceBadge /> : null}
                  {pretAPoser ? <PretBadge /> : null}
                  <div className="hidden flex-1 min-[880px]:block" />
                  <span className="ml-auto flex min-w-0 items-center gap-1.5 text-sm font-normal text-[var(--ds-text-subtle)] max-[879px]:w-full">
                    <Building2
                      className="h-3.5 w-3.5 shrink-0 text-[var(--ds-text-subtle)]"
                      strokeWidth={1.85}
                      aria-hidden
                    />
                    <span className="truncate">{cmd.labo}</span>
                  </span>
                </div>

                <p className="mb-2 text-sm font-normal leading-relaxed text-[var(--ds-text-muted)]">
                  {acte}
                </p>
                <p className="mb-2.5 text-xs font-light leading-relaxed tracking-tight text-[var(--ds-text-subtle)]">
                  <span className="font-mono font-normal text-[var(--ds-text-subtle)]">
                    {dent ?? "—"}
                  </span>
                  <span aria-hidden className="px-1.5 opacity-70">
                    ·
                  </span>
                  <span>{cmd.teinte ?? "—"}</span>
                  <span aria-hidden className="px-1.5 opacity-70">
                    ·
                  </span>
                  <span>{cmd.materiau ?? "—"}</span>
                </p>

                <div className="flex items-center gap-4 border-t border-[var(--ds-border)] pt-2.5">
                  <DateItem
                    label="Retour"
                    date={formatDayShortFR(cmd.retourIso)}
                    isAlert={retourPast || critical}
                  />
                  <DateItem
                    label="Pose"
                    date={formatDayShortFR(cmd.rdvPatientIso)}
                    isAlert={conflit || (posePast && cmd.statut !== "POSE")}
                  />
                  <div className="ml-auto flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <ActionButton
                      icon={<Phone className="h-3.5 w-3.5" strokeWidth={1.8} />}
                      onClick={() => setDrawerCommandId(cmd.id)}
                      title="Appeler"
                    />
                    <ActionButton
                      icon={<Pencil className="h-3.5 w-3.5" strokeWidth={1.8} />}
                      onClick={() => setDrawerCommandId(cmd.id)}
                      title="Modifier"
                    />
                    <div title="WhatsApp">
                      <LabWhatsAppButton
                        patientName={cmd.patient}
                        telephones={labPartner.telephones}
                      />
                    </div>
                    {pretAPoser ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          changeStatut(cmd, "POSE");
                        }}
                        className="rounded-[12px] bg-[color:var(--ds-primary)] px-3 py-1.5 text-[11px] font-semibold text-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-colors hover:bg-[color:var(--ds-primary-hover)]"
                        title="Poser"
                      >
                        Poser
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Drawer latéral */}
      {drawerCommand ? (
        <CommandeDrawer
          cmd={drawerCommand}
          appointments={appointments}
          labs={labs}
          onClose={() => setDrawerCommandId(null)}
          onPatch={(next) => patchCommand(drawerCommand.id, next)}
          onChangeStatut={(s) => changeStatut(drawerCommand, s)}
          onDelete={() => deleteCommande(drawerCommand)}
          onGeneratePdf={() =>
            generateLabBonPDF({
              patient: drawerCommand.patient,
              acte: drawerCommand.travail,
              laboratoire: drawerCommand.labo,
              dateRetour: formatDatePretty(drawerCommand.retourIso),
              notes:
                [drawerCommand.teinte, drawerCommand.materiau]
                  .filter(Boolean)
                  .join(" · ") || undefined,
              id: drawerCommand.id,
            })
          }
          onCoutChange={(raw) =>
            setCommandes((prev) =>
              prev.map((c) => {
                if (c.id !== drawerCommand.id) return c;
                if (raw === "") return { ...c, coutLaboDa: undefined };
                const n = Number(raw);
                return {
                  ...c,
                  coutLaboDa: Number.isFinite(n)
                    ? Math.max(0, n)
                    : c.coutLaboDa,
                };
              }),
            )
          }
          onCoutCommit={() =>
            setCommandes((prev) =>
              prev.map((c) =>
                c.id === drawerCommand.id ? maybeCreateLabExpense(c) : c,
              ),
            )
          }
        />
      ) : null}

      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/15 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-label="Nouvelle commande laboratoire"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setIsModalOpen(false);
          }}
        >
          <div
            className="max-h-[min(90vh,720px)] w-full max-w-lg overflow-y-auto rounded-3xl border border-[var(--ds-primary-border)]/90 bg-[var(--ds-surface)] p-8 shadow-[0_12px_48px_rgba(15,23,42,0.1)]"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <h3 className="text-lg font-semibold tracking-tight text-[color:var(--ds-text)]">
                  Nouvelle commande labo
                </h3>
                <p className="text-sm font-light text-[var(--ds-text-muted)]">
                  Patient, laboratoire et liaisons agenda.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-xl p-2 text-[var(--ds-text-muted)] transition-colors hover:bg-[var(--ds-bg)] hover:text-[var(--ds-text-muted)]"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" strokeWidth={1.75} />
              </button>
            </div>

            <form
              className="mt-8 space-y-5"
              onSubmit={(e) => {
                e.preventDefault();
                const pr = patients.find((p) => p.id === modalPatientId);
                const lab = findLabById(modalLabId, labs);
                if (!pr || !lab || !retourIso.trim()) return;

                const next: LaboratoireCommande = {
                  id: `cmd-${uid()}`,
                  patient: displayPatientName(pr),
                  patientId: pr.id,
                  travail,
                  ...(modalDent.trim() ? { dent: modalDent.trim() } : {}),
                  ...(modalTeinte.trim() ? { teinte: modalTeinte.trim() } : {}),
                  ...(modalMateriau ? { materiau: modalMateriau } : {}),
                  coutLaboDa: Number.isFinite(modalCoutLaboDa)
                    ? Math.max(0, modalCoutLaboDa)
                    : 0,
                  labo: lab.nom,
                  retourIso: retourIso.trim(),
                  statut: "EN_ATTENTE",
                  ...(rdvPatientIso ? { rdvPatientIso } : {}),
                  ...(modalPoseApptId
                    ? { linkedPoseAppointmentId: modalPoseApptId }
                    : {}),
                  ...(modalRetourApptId
                    ? { linkedRetourAppointmentId: modalRetourApptId }
                    : {}),
                };

                let poseIso = rdvPatientIso;
                if (modalPoseApptId) {
                  const ap = appointments.find((x) => x.id === modalPoseApptId);
                  if (ap) poseIso = ap.dateKey;
                }
                if (poseIso) next.rdvPatientIso = poseIso;

                if (modalRetourApptId) {
                  const ar = appointments.find(
                    (x) => x.id === modalRetourApptId,
                  );
                  if (ar) next.retourIso = ar.dateKey;
                }

                setCommandes((prev) => {
                  const withNew = [next, ...prev];
                  return pullAgendaDatesIntoLabCommandes(withNew, appointments);
                });
                setIsModalOpen(false);
                void (async () => {
                  const appsRes = await getAppointmentsAction();
                  if (!appsRes.ok) return;
                  const appsFromServer = appsRes.data.map(
                    appointmentJoinedRowToRdv,
                  );
                  const moves = computeLinkedAppointmentDateMovesFromLab(
                    appsFromServer,
                    next,
                  );
                  for (const m of moves) {
                    const up = await updateAppointmentAction(m.appointmentId, {
                      date: m.newDateIso.trim().slice(0, 10),
                    });
                    if (!up.ok) console.error(up.error);
                  }
                  if (moves.length > 0) {
                    showAppToast(capitalizeToastPhrase(moves[0].toast));
                  }
                  const refreshed = await getAppointmentsAction();
                  if (!refreshed.ok) return;
                  const refreshedApps = refreshed.data.map(
                    appointmentJoinedRowToRdv,
                  );
                  setAppointments(refreshedApps);
                  setCommandes((prev) =>
                    pullAgendaDatesIntoLabCommandes(prev, refreshedApps),
                  );
                  notifyAppointmentsUpdated();
                })();
              }}
            >
              <PatientCombobox
                id="lab-new-patient"
                patients={patients}
                selectedId={modalPatientId}
                onSelect={(p) => setModalPatientId(p.id)}
                onClear={() => setModalPatientId(null)}
              />

              <div>
                <label className="block text-sm font-medium text-[var(--ds-text)]">
                  Type de travail
                </label>
                <select
                  value={travail}
                  onChange={(e) => setTravail(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-bg)]/30 px-3 py-2.5 text-sm font-normal text-[var(--ds-text)] outline-none focus:border-[var(--ds-primary-border)] focus:bg-[var(--ds-surface)] focus:ring-1 focus:ring-[var(--ds-primary-border)]/80"
                >
                  {TRAVAUX.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              {/* Champs ajoutés (homogénéité fiche détail) */}
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-[var(--ds-text-muted)]">
                  Dent (numéro)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Ex: 46"
                  value={modalDent}
                  onChange={(e) => setModalDent(e.target.value)}
                  className="mt-2 w-full rounded-[var(--radius-md)] border border-[var(--ds-border)] bg-[var(--ds-surface)] px-3 py-2.5 text-sm font-normal text-[var(--ds-text)] outline-none focus:border-[var(--ds-primary-border)] focus:ring-1 focus:ring-[var(--ds-primary-border)]/80"
                />
              </div>

              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-[var(--ds-text-muted)]">
                  Matériau
                </label>
                <select
                  value={modalMateriau}
                  onChange={(e) => setModalMateriau(e.target.value)}
                  className="mt-2 w-full rounded-[var(--radius-md)] border border-[var(--ds-border)] bg-[var(--ds-surface)] px-3 py-2.5 text-sm font-normal text-[var(--ds-text)] outline-none focus:border-[var(--ds-primary-border)] focus:ring-1 focus:ring-[var(--ds-primary-border)]/80"
                >
                  <option value="">Sélectionner un matériau</option>
                  {[
                    "Zircone",
                    "Céramique",
                    "Métal-Céramique",
                    "Composite",
                    "Résine",
                    "Alliage métallique",
                    "E-max",
                    "Autre",
                  ].map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-[var(--ds-text-muted)]">
                  Teinte
                </label>
                <input
                  type="text"
                  placeholder="Ex: A2, B1, C3..."
                  value={modalTeinte}
                  onChange={(e) => setModalTeinte(e.target.value)}
                  className="mt-2 w-full rounded-[var(--radius-md)] border border-[var(--ds-border)] bg-[var(--ds-surface)] px-3 py-2.5 text-sm font-normal text-[var(--ds-text)] outline-none focus:border-[var(--ds-primary-border)] focus:ring-1 focus:ring-[var(--ds-primary-border)]/80"
                />
              </div>

              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-[var(--ds-text-muted)]">
                  Coût labo (DA)
                </label>
                <input
                  type="number"
                  min={0}
                  step={100}
                  inputMode="numeric"
                  placeholder="0"
                  value={String(modalCoutLaboDa)}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setModalCoutLaboDa(Number.isFinite(n) ? Math.max(0, n) : 0);
                  }}
                  className="mt-2 w-full rounded-[var(--radius-md)] border border-[var(--ds-border)] bg-[var(--ds-surface)] px-3 py-2.5 text-sm font-normal text-[var(--ds-text)] outline-none focus:border-[var(--ds-primary-border)] focus:ring-1 focus:ring-[var(--ds-primary-border)]/80"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--ds-text)]">
                  Laboratoire
                </label>
                <select
                  value={modalLabId}
                  onChange={(e) => setModalLabId(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-bg)]/30 px-3 py-2.5 text-sm font-normal text-[var(--ds-text)] outline-none focus:border-[var(--ds-primary-border)] focus:bg-[var(--ds-surface)] focus:ring-1 focus:ring-[var(--ds-primary-border)]/80"
                >
                  {labs.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nom}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--ds-text)]">
                  Date RDV patient (pose)
                </label>
                <input
                  type="date"
                  value={rdvPatientIso}
                  onChange={(e) => setRdvPatientIso(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-bg)]/30 px-3 py-2.5 text-sm font-normal outline-none focus:border-[var(--ds-primary-border)] focus:bg-[var(--ds-surface)] focus:ring-1 focus:ring-[var(--ds-primary-border)]/80"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--ds-text)]">
                  Retour labo prévu
                </label>
                <input
                  type="date"
                  value={retourIso}
                  onChange={(e) => setRetourIso(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-bg)]/30 px-3 py-2.5 text-sm font-normal outline-none focus:border-[var(--ds-primary-border)] focus:bg-[var(--ds-surface)] focus:ring-1 focus:ring-[var(--ds-primary-border)]/80"
                />
                <p className="mt-2 text-xs font-light text-[var(--ds-text-muted)]">
                  Couronne / Bridge : J+7 suggéré automatiquement.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--ds-text)]">
                  Lien agenda — pose
                </label>
                <select
                  value={modalPoseApptId}
                  onChange={(e) => {
                    const v = e.target.value;
                    setModalPoseApptId(v);
                    if (!v) return;
                    const a = appointments.find((x) => x.id === v);
                    if (a) setRdvPatientIso(a.dateKey);
                  }}
                  disabled={!modalPatientId}
                  className="mt-2 w-full rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-bg)]/30 px-3 py-2.5 text-sm font-normal outline-none disabled:opacity-50"
                >
                  <option value="">— Aucun —</option>
                  {modalAppts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.dateKey} {a.start} — {a.soin}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--ds-text)]">
                  Lien agenda — retour labo
                </label>
                <select
                  value={modalRetourApptId}
                  onChange={(e) => {
                    const v = e.target.value;
                    setModalRetourApptId(v);
                    if (!v) return;
                    const a = appointments.find((x) => x.id === v);
                    if (a) setRetourIso(a.dateKey);
                  }}
                  disabled={!modalPatientId}
                  className="mt-2 w-full rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-bg)]/30 px-3 py-2.5 text-sm font-normal outline-none disabled:opacity-50"
                >
                  <option value="">— Aucun —</option>
                  {modalAppts.map((a) => (
                    <option key={`r-${a.id}`} value={a.id}>
                      {a.dateKey} {a.start} — {a.soin}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-2xl border border-[var(--ds-primary-border)] px-5 py-2.5 text-sm font-normal text-[var(--ds-text-muted)] transition-colors hover:bg-[var(--ds-bg)]"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={!modalPatientId || !modalLabId || !retourIso}
                  className="rounded-2xl bg-[color:var(--ds-primary)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_4px_16px_rgba(8,145,178,0.2)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
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


function StatusBadgeInline({ statut }: { statut: string }) {
  const styles: Record<string, string> = {
    "En attente":
      "border-[#fde68a] bg-[#fffbeb] text-[#b45309]",
    "En fabrication":
      "border-[#a5f3fc] bg-[#ecfeff] text-[#0891b2]",
    "Reçu au cabinet":
      "border-[#bbf7d0] bg-[#f0fdf4] text-[#059669]",
    Posé:
      "border-[#bbf7d0] bg-[#f0fdf4] text-[#059669]",
    "Envoyé au labo":
      "border-[#fed7aa] bg-[#fff7ed] text-[#ea580c]",
    "Expédié au cabinet":
      "border-[#a5f3fc] bg-[#ecfeff] text-[#0891b2]",
    Retouche:
      "border-[#fde68a] bg-[#fffbeb] text-[#b45309]",
  };
  const dots: Record<string, string> = {
    "En attente": "bg-[#f59e0b]",
    "En fabrication": "bg-[#06b6d4]",
    "Reçu au cabinet": "bg-[#10b981]",
    Posé: "bg-[#10b981]",
    "Envoyé au labo": "bg-[#f97316]",
    "Expédié au cabinet": "bg-[#06b6d4]",
    Retouche: "bg-[#f59e0b]",
  };
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-tight text-[color:var(--ds-text)]",
        styles[statut] ??
          "border-[var(--ds-border)] bg-[var(--ds-bg)] text-[var(--ds-text-muted)]",
      )}
    >
      <span
        className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dots[statut] ?? "bg-[var(--ds-text-subtle)]")}
      />
      {statut}
    </span>
  );
}

function UrgenceBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#fecaca] bg-[#fef2f2] px-2.5 py-1 text-[11px] font-medium tracking-tight text-[#dc2626]">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#ef4444]" />
      Pose avant retour
    </span>
  );
}

function PretBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#bbf7d0] bg-[#f0fdf4] px-2.5 py-1 text-[11px] font-medium tracking-tight text-[#059669]">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#10b981]" />
      Prêt à poser
    </span>
  );
}

function DateItem({
  label,
  date,
  isAlert,
}: {
  label: string;
  date: string;
  isAlert?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs leading-snug tracking-tight text-[var(--ds-text-muted)]">
      <Calendar
        className="h-3 w-3 shrink-0 text-[var(--ds-text-subtle)]"
        strokeWidth={1.85}
      />
      <span className="font-light text-[var(--ds-text-subtle)]">{label}</span>
      <span
        className={cn(
          "font-light tabular-nums",
          isAlert ? "text-[#ef4444]" : "text-[color:var(--ds-text)]",
        )}
      >
        {date}
      </span>
      {isAlert ? (
        <AlertCircle
          className="h-3 w-3 shrink-0 text-[#ef4444]"
          strokeWidth={1.85}
        />
      ) : null}
    </div>
  );
}

function ActionButton({
  icon,
  onClick,
  title,
}: {
  icon: ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex h-8 w-8 items-center justify-center rounded-[10px] text-[var(--ds-text-subtle)] transition-colors hover:bg-[var(--ds-primary-soft)] hover:text-[color:var(--ds-primary)] active:scale-[0.98]"
    >
      {icon}
    </button>
  );
}

function formatDatePrettyLocal(iso: string | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0);
  if (Number.isNaN(dt.getTime())) return "—";
  const s = dt.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const parts = s.split(" ");
  if (parts.length >= 2) {
    parts[1] = parts[1].charAt(0).toUpperCase() + parts[1].slice(1);
  }
  return parts.join(" ");
}

function CommandeDrawer({
  cmd,
  appointments,
  labs,
  onClose,
  onPatch,
  onChangeStatut,
  onDelete,
  onGeneratePdf,
  onCoutChange,
  onCoutCommit,
}: {
  cmd: LaboratoireCommande;
  appointments: AppointmentRdv[];
  labs: DentalLabPartner[];
  onClose: () => void;
  onPatch: (next: LaboratoireCommande) => void;
  onChangeStatut: (s: LaboratoireStatut) => void;
  onDelete: () => void;
  onGeneratePdf: () => void;
  onCoutChange: (raw: string) => void;
  onCoutCommit: () => void;
}) {
  const rowAppts = filterAppointmentsForPatient(
    appointments,
    cmd.patientId,
    cmd.patient,
  );
  const labPartner: DentalLabPartner =
    findLabByName(cmd.labo, labs) ?? {
      id: "",
      nom: cmd.labo,
      telephones: [],
      adresse: "",
    };
  const dent = cmd.dent ?? parseDentFromTravail(cmd.travail);
  const acte = travailWithoutDent(cmd.travail);
  const conflit = isRdvPatientBeforeRetourLabo(
    cmd.rdvPatientIso,
    cmd.retourIso,
  );
  const retourPast =
    isPastIso(cmd.retourIso) &&
    cmd.statut !== "RECU_CABINET" &&
    cmd.statut !== "POSE";

  type TimelineEvent = {
    key: string;
    icon: ReactNode;
    dotClass: string;
    title: string;
    date: string;
  };

  const timeline: TimelineEvent[] = [];
  if (cmd.statut !== "EN_ATTENTE") {
    timeline.push({
      key: "sent",
      icon: <Send className="h-3.5 w-3.5" />,
      dotClass: "bg-[var(--ds-primary-soft)] text-[color:var(--ds-primary)] ring-[color:var(--ds-primary)]/40",
      title: "Commande envoyée au labo",
      date: formatDatePrettyLocal(cmd.retourIso),
    });
  } else {
    timeline.push({
      key: "created",
      icon: <ClipboardList className="h-3.5 w-3.5" />,
      dotClass: "bg-[var(--ds-primary-soft)] text-[color:var(--ds-primary)] ring-[color:var(--ds-primary)]/40",
      title: "Commande créée",
      date: "Aujourd’hui",
    });
  }
  if (
    cmd.statut === "EN_FABRICATION" ||
    cmd.statut === "EXPEDIE_CABINET" ||
    cmd.statut === "RECU_CABINET" ||
    cmd.statut === "POSE"
  ) {
    timeline.push({
      key: "fab",
      icon: <Clock className="h-3.5 w-3.5" />,
      dotClass:
        "bg-indigo-50 text-indigo-600 ring-indigo-300",
      title: "En fabrication",
      date: "Laboratoire",
    });
  }
  if (cmd.statut === "RECU_CABINET" || cmd.statut === "POSE") {
    timeline.push({
      key: "recu",
      icon: <Package className="h-3.5 w-3.5" />,
      dotClass:
        "bg-emerald-50 text-emerald-600 ring-emerald-300",
      title: "Reçu au cabinet",
      date: formatDatePrettyLocal(cmd.retourIso),
    });
  }
  if (cmd.statut === "POSE") {
    timeline.push({
      key: "pose",
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      dotClass: "bg-emerald-50 text-emerald-600 ring-emerald-300",
      title: "Prothèse posée",
      date: formatDatePrettyLocal(cmd.rdvPatientIso),
    });
  }
  if (retourPast) {
    timeline.push({
      key: "alert",
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
      dotClass: "bg-red-50 text-red-600 ring-red-300",
      title: "Retour labo dépassé",
      date: formatDatePrettyLocal(cmd.retourIso),
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/30 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside
        className="oryx-fade-up h-full w-full max-w-[440px] overflow-y-auto bg-[var(--ds-surface)] shadow-[-8px_0_40px_rgba(0,0,0,0.12)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-6 py-5">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--ds-text-muted)]">
              Commande labo
            </p>
            <h3 className="mt-1 truncate text-[18px] font-normal tracking-tight text-[var(--ds-text)]">
              {acte}
              {dent ? (
                <span className="font-mono font-medium text-[var(--ds-text-muted)]">
                  {" "}
                  · {dent}
                </span>
              ) : null}
            </h3>
            <p className="mt-0.5 truncate text-[12px] text-[var(--ds-text-muted)]">
              <span className="font-bold text-[var(--ds-text)]">
                {cmd.patient}
              </span>
              <span className="font-light"> · {cmd.labo}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] text-[var(--ds-text-muted)] transition-colors hover:bg-[var(--ds-bg)]"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-6">
          {/* Statut */}
          <section className="mb-6">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-[var(--ds-text-muted)]">
              Statut actuel
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge statut={cmd.statut} />
              {conflit ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-600">
                  🚨 Pose avant retour
                </span>
              ) : null}
              {cmd.statut === "RECU_CABINET" ? (
                <button
                  type="button"
                  onClick={() => onChangeStatut("POSE")}
                  className="inline-flex items-center gap-1 rounded-lg bg-[color:var(--ds-primary)] px-3 py-1 text-[12px] font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Poser
                </button>
              ) : null}
            </div>
          </section>

          {/* Détails */}
          <section className="mb-6">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-[var(--ds-text-muted)]">
              Détails de la commande
            </p>
            <div className="grid grid-cols-2 gap-2">
              <DetailItem
                label="Patient"
                value={cmd.patient}
                valueVariant="patient"
              />
              <DetailItem
                label="Dent"
                value={dent ?? "—"}
                valueVariant="dent"
              />
              <DetailItem label="Type" value={acte} full valueVariant="detail" />
              <DetailItem
                label="Matériau"
                value={cmd.materiau ?? "—"}
                valueVariant="detail"
              />
              <DetailItem
                label="Teinte"
                value={cmd.teinte ?? "—"}
                valueVariant="detail"
              />
              <DetailItem
                label="Laboratoire"
                value={cmd.labo}
                full
                valueVariant="meta"
              />
              <DetailItem
                label="Retour prévu"
                value={formatDatePrettyLocal(cmd.retourIso)}
                valueClass={retourPast ? "text-red-600" : undefined}
                valueVariant="date"
              />
              <DetailItem
                label="Pose prévue"
                value={formatDatePrettyLocal(cmd.rdvPatientIso)}
                valueClass={conflit ? "text-red-600" : undefined}
                valueVariant="date"
              />
            </div>
          </section>

          {/* Édition dates & liens */}
          <section className="mb-6">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-[var(--ds-text-muted)]">
              Modifier dates & liaison agenda
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-medium uppercase tracking-wide text-[var(--ds-text-muted)]">
                  Dent (numéro)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Ex: 46"
                  value={cmd.dent ?? ""}
                  onChange={(e) =>
                    onPatch({
                      ...cmd,
                      dent: e.target.value.trim() || undefined,
                    })
                  }
                  className={inputSubtle + " mt-1.5 font-mono tabular-nums"}
                />
              </div>
              <div>
                <label className="text-[10px] font-medium uppercase tracking-wide text-[var(--ds-text-muted)]">
                  Teinte
                </label>
                <input
                  type="text"
                  placeholder="Ex: A2, B1, C3..."
                  value={cmd.teinte ?? ""}
                  onChange={(e) =>
                    onPatch({
                      ...cmd,
                      teinte: e.target.value.trim() || undefined,
                    })
                  }
                  className={inputSubtle + " mt-1.5"}
                />
              </div>
              <div>
                <label className="text-[10px] font-medium uppercase tracking-wide text-[var(--ds-text-muted)]">
                  Retour labo
                </label>
                <input
                  type="date"
                  value={cmd.retourIso}
                  onChange={(e) =>
                    onPatch({ ...cmd, retourIso: e.target.value })
                  }
                  className={inputSubtle + " mt-1.5"}
                />
              </div>
              <div>
                <label className="text-[10px] font-medium uppercase tracking-wide text-[var(--ds-text-muted)]">
                  Date de pose
                </label>
                <input
                  type="date"
                  value={cmd.rdvPatientIso ?? ""}
                  onChange={(e) =>
                    onPatch({
                      ...cmd,
                      rdvPatientIso: e.target.value || undefined,
                    })
                  }
                  className={inputSubtle + " mt-1.5"}
                />
              </div>
              <div className="col-span-2">
                <label className="text-[10px] font-medium uppercase tracking-wide text-[var(--ds-text-muted)]">
                  Matériau
                </label>
                <select
                  value={cmd.materiau ?? ""}
                  onChange={(e) =>
                    onPatch({
                      ...cmd,
                      materiau: e.target.value || undefined,
                    })
                  }
                  className={inputSubtle + " mt-1.5"}
                >
                  <option value="">— Sélectionner un matériau —</option>
                  {[
                    "Zircone",
                    "Céramique",
                    "Métal-Céramique",
                    "Composite",
                    "Résine",
                    "Alliage métallique",
                    "E-max",
                    "Autre",
                  ].map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-[10px] font-medium uppercase tracking-wide text-[var(--ds-text-muted)]">
                  Lien agenda — pose
                </label>
                <select
                  value={cmd.linkedPoseAppointmentId ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) {
                      onPatch({
                        ...cmd,
                        linkedPoseAppointmentId: undefined,
                      });
                      return;
                    }
                    const a = appointments.find((x) => x.id === v);
                    onPatch({
                      ...cmd,
                      linkedPoseAppointmentId: v,
                      rdvPatientIso: a?.dateKey ?? cmd.rdvPatientIso,
                    });
                  }}
                  className={inputSubtle + " mt-1.5"}
                >
                  <option value="">— Aucun —</option>
                  {rowAppts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.dateKey} {a.start} — {a.soin}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-[10px] font-medium uppercase tracking-wide text-[var(--ds-text-muted)]">
                  Lien agenda — retour labo
                </label>
                <select
                  value={cmd.linkedRetourAppointmentId ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) {
                      onPatch({
                        ...cmd,
                        linkedRetourAppointmentId: undefined,
                      });
                      return;
                    }
                    const a = appointments.find((x) => x.id === v);
                    onPatch({
                      ...cmd,
                      linkedRetourAppointmentId: v,
                      retourIso: a?.dateKey ?? cmd.retourIso,
                    });
                  }}
                  className={inputSubtle + " mt-1.5"}
                >
                  <option value="">— Aucun —</option>
                  {rowAppts.map((a) => (
                    <option key={`r-${a.id}`} value={a.id}>
                      {a.dateKey} {a.start} — {a.soin}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-medium uppercase tracking-wide text-[var(--ds-text-muted)]">
                  Coût labo (DA)
                </label>
                <input
                  type="number"
                  min={0}
                  step={100}
                  inputMode="numeric"
                  value={cmd.coutLaboDa ?? ""}
                  placeholder="—"
                  onChange={(e) => onCoutChange(e.target.value)}
                  onBlur={onCoutCommit}
                  className={inputSubtle + " mt-1.5 font-normal tabular-nums"}
                />
              </div>
            </div>
          </section>

          {/* Changer statut */}
          <section className="mb-6">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-[var(--ds-text-muted)]">
              Changer le statut
            </p>
            <div className="flex flex-wrap gap-1.5">
              {LAB_STATUT_ORDER.map((s) => {
                const active = cmd.statut === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onChangeStatut(s)}
                    className={[
                      "rounded-full px-3 py-1 text-[11px] font-medium tracking-wide transition-all",
                      active
                        ? "bg-[color:var(--ds-primary)] text-white shadow-[0_2px_8px_rgba(124,58,237,0.25)]"
                        : "border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] text-[var(--ds-text-muted)] hover:bg-[var(--ds-bg)]",
                    ].join(" ")}
                  >
                    {laboratoireStatutLabel(s)}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Timeline */}
          <section className="mb-6">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-[var(--ds-text-muted)]">
              Historique
            </p>
            <ol className="relative space-y-3 pl-0">
              {timeline.map((ev, i) => {
                const isLast = i === timeline.length - 1;
                return (
                  <li key={ev.key} className="flex items-start gap-3">
                    <span className="relative flex h-7 w-7 shrink-0 items-center justify-center">
                      <span
                        className={[
                          "relative z-10 flex h-7 w-7 items-center justify-center rounded-full ring-2",
                          ev.dotClass,
                        ].join(" ")}
                      >
                        {ev.icon}
                      </span>
                      {!isLast ? (
                        <span className="absolute left-1/2 top-7 h-[calc(100%+0.75rem)] w-px -translate-x-1/2 bg-[var(--ds-primary-border)]" />
                      ) : null}
                    </span>
                    <div className="min-w-0 flex-1 pb-1">
                      <p className="text-[13px] font-medium text-[var(--ds-text)]">
                        {ev.title}
                      </p>
                      <p className="text-[11px] font-light text-[var(--ds-text-muted)]">
                        {ev.date}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>

        {/* Footer actions */}
        <div className="sticky bottom-0 flex items-center gap-2 border-t border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-6 py-4">
          {cmd.statut === "RECU_CABINET" ? (
            <button
              type="button"
              onClick={() => onChangeStatut("POSE")}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[color:var(--ds-primary)] px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
            >
              <CheckCircle2 className="h-4 w-4" />
              Marquer posé
            </button>
          ) : cmd.statut === "POSE" ? (
            <span className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-50 px-4 py-2.5 text-[13px] font-semibold text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> Travail posé
            </span>
          ) : (
            <button
              type="button"
              onClick={() => onChangeStatut("RECU_CABINET")}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[color:var(--ds-primary)] px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
            >
              <Package className="h-4 w-4" />
              Marquer reçu
            </button>
          )}
          <button
            type="button"
            onClick={onGeneratePdf}
            title="Bon de commande PDF"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] text-[var(--ds-text-muted)] transition-colors hover:border-[color:var(--ds-primary)] hover:bg-[var(--ds-primary-soft)] hover:text-[color:var(--ds-primary)]"
            aria-label="PDF"
          >
            <FileText className="h-4 w-4" />
          </button>
          <LabWhatsAppButton
            patientName={cmd.patient}
            telephones={labPartner.telephones}
          />
          <button
            type="button"
            onClick={onDelete}
            title="Supprimer la commande"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] text-[var(--ds-text-muted)] transition-colors hover:bg-[var(--ds-surface-2)] hover:text-[var(--ds-text)]"
            aria-label="Supprimer"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </aside>
    </div>
  );
}

type DetailValueVariant =
  | "patient"
  | "dent"
  | "detail"
  | "meta"
  | "date"
  | "default";

function DetailItem({
  label,
  value,
  full,
  valueClass,
  valueVariant = "default",
}: {
  label: string;
  value: string;
  full?: boolean;
  valueClass?: string;
  valueVariant?: DetailValueVariant;
}) {
  const valueTypography: Record<DetailValueVariant, string> = {
    patient: "mt-1 text-[13px] font-bold text-[var(--ds-text)]",
    dent: "mt-1 text-[13px] font-mono font-medium text-[var(--ds-text)]",
    detail: "mt-1 text-[13px] font-normal text-[var(--ds-text)]",
    meta: "mt-1 text-[13px] font-light text-[var(--ds-text)]",
    date: "mt-1 text-[13px] font-light text-[var(--ds-text)]",
    default: "mt-1 text-[13px] font-normal text-[var(--ds-text)]",
  };

  return (
    <div
      className={[
        "rounded-xl bg-[var(--ds-bg)] px-3 py-2.5",
        full ? "col-span-2" : "",
      ].join(" ")}
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--ds-text-muted)]">
        {label}
      </p>
      <p className={cn(valueTypography[valueVariant], valueClass ?? "")}>
        {value}
      </p>
    </div>
  );
}
