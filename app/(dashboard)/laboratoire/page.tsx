"use client";

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
  readAppointmentsFromStorage,
  type AppointmentRdv,
} from "@/utils/appointmentData";
import {
  filterAppointmentsForPatient,
  pullAgendaDatesIntoLabCommandes,
  pushLabDatesToLinkedAppointments,
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
import {
  displayPatientName,
  ensurePatientsHydrated,
  readPatientsFromStorage,
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
  const [retourIso, setRetourIso] = useState<string>("");
  const [rdvPatientIso, setRdvPatientIso] = useState<string>("");

  const TRAVAUX = [
    "Couronne Céramique",
    "Bridge",
    "Inlay/Onlay",
    "Prothèse Amovible",
    "Gouttière",
  ] as const;

  const refreshPatients = useCallback(() => {
    ensurePatientsHydrated();
    setPatients(readPatientsFromStorage());
  }, []);

  useEffect(() => {
    refreshPatients();
    setLabs(readLabsDirectoryFromStorage());
    setAppointments(readAppointmentsFromStorage());
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
      const apps = readAppointmentsFromStorage();
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
    setAppointments(readAppointmentsFromStorage());
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

  const patchCommand = useCallback(
    (id: string, next: LaboratoireCommande) => {
      setCommandes((prev) =>
        prev.map((c) => {
          if (c.id !== id) return c;
          const old = c;
          const msg = pushLabDatesToLinkedAppointments(old, next);
          if (msg) showAppToast(msg);
          return next;
        }),
      );
      setAppointments(readAppointmentsFromStorage());
    },
    [],
  );

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
    <div className="space-y-0 pb-8 font-['Sora']">
      <header className="flex items-start justify-between pb-5 pt-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[color:var(--ds-text)]">
            Laboratoire &amp; Prothèses
          </h1>
          <p className="mt-1 text-xs text-[var(--ds-text-muted)]">
            Suivi des commandes prothétiques et des délais laboratoire
          </p>
        </div>
        <AnimatedButton
          onClick={() => setIsModalOpen(true)}
          className="rounded-xl bg-[color:var(--ds-primary)] px-4 py-2.5 text-xs font-semibold text-white shadow-[0_4px_14px_rgba(124,58,237,0.25)] transition-colors hover:bg-[color:var(--ds-primary-dark)]"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2} />
          Nouvelle commande labo
        </AnimatedButton>
      </header>

      <div className="grid grid-cols-1 gap-3 pb-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          kpi="rdv"
          icon={<ClipboardList />}
          value={commandes.length}
          label="Total commandes"
        />
        <KpiCard
          kpi="stock"
          icon={<AlertTriangle />}
          value={urgentCommandes.length}
          label="Urgences"
          stockAlertCount={urgentCommandes.length}
        />
        <KpiCard
          kpi="patients"
          icon={<Clock />}
          value={fabricationCommandes.length}
          label="En fabrication"
        />
        <KpiCard
          kpi="kits"
          icon={<CheckCircle2 />}
          value={recuCommandes.length}
          label="Reçu au cabinet"
        />
      </div>

      {urgentCommandes.length > 0 ? (
        <div className="mx-0 mb-5 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
            <p className="text-base text-amber-800">
              <span className="font-bold">
                {urgentCommandes.length} commande{urgentCommandes.length > 1 ? "s" : ""}
              </span>{" "}
              ont une date de pose prévue avant le retour du labo — action requise.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab("urgent")}
            className="shrink-0 rounded-lg border border-amber-300 bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-200"
          >
            Voir les commandes urgentes
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
        <div className="flex gap-1 rounded-xl border border-[var(--ds-border)] bg-[var(--ds-surface)] p-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setActiveTab(f.key)}
              className={cn(
                "flex items-center gap-2 rounded-[9px] px-5 py-2.5 text-base font-semibold transition-all",
                activeTab === f.key
                  ? "bg-[color:var(--ds-primary)] text-white"
                  : "text-[var(--ds-text-muted)] hover:text-[var(--ds-text)]",
              )}
            >
              {f.label}
              <span
                className={cn(
                  "font-['DM_Mono'] rounded-full px-2 py-0.5 text-sm font-bold leading-snug",
                  activeTab === f.key
                    ? "bg-white/20 text-white"
                    : "bg-black/5 text-[var(--ds-text-muted)]",
                )}
              >
                {f.count}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-[var(--ds-border)] bg-[var(--ds-surface)] px-3 py-2">
          <Search className="h-3.5 w-3.5 text-[var(--ds-text-muted)]" strokeWidth={2} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Rechercher un patient, un acte…"
            className="w-52 border-0 bg-transparent text-xs text-[color:var(--ds-text)] outline-none placeholder:text-[var(--ds-text-muted)]"
          />
        </div>
      </div>

      <p className="pb-4 text-lg font-medium text-[var(--ds-text-muted)]">
        <span className="font-['DM_Mono']">{filtered.length}</span> commande
        {filtered.length > 1 ? "s" : ""} trouvée
        {filtered.length > 1 ? "s" : ""}
      </p>

      {filtered.length === 0 ? (
        <div className="mx-0 rounded-2xl border border-dashed border-[var(--ds-primary-border)]/80 bg-[var(--ds-surface)]/60 px-6 py-16 text-center shadow-sm">
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
            const retourOk = cmd.statut === "RECU_CABINET" || cmd.statut === "POSE";
            const posePast = isPastIso(cmd.rdvPatientIso);
            const pretAPoser = cmd.statut === "RECU_CABINET";

            const STATUS_ACCENT: Record<string, string> = {
              "En attente": "border-l-amber-400",
              "En fabrication": "border-l-cyan-400",
              "Reçu au cabinet": "border-l-violet-500",
              Posé: "border-l-emerald-400",
            };

            const labPartner: DentalLabPartner =
              findLabByName(cmd.labo, labs) ?? {
                id: "",
                nom: cmd.labo,
                telephones: [],
                adresse: "",
              };

            const dent = parseDentFromTravail(cmd.travail);
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
                  "cursor-pointer rounded-2xl border border-[var(--ds-border)] bg-[var(--ds-surface)] px-6 py-5",
                  "border-l-[3px] transition-all hover:border-[var(--ds-primary-border)] hover:shadow-[0_4px_16px_rgba(124,58,237,0.07)]",
                  STATUS_ACCENT[statutLabel] ?? "border-l-[var(--ds-border)]",
                )}
              >
                <div className="mb-2.5 flex items-center gap-2">
                  <span className="text-xl font-bold text-[color:var(--ds-text)]">
                    {cmd.patient}
                  </span>
                  <StatusBadgeInline statut={statutLabel} />
                  {conflit && cmd.statut !== "POSE" ? <UrgenceBadge /> : null}
                  {pretAPoser ? <PretBadge /> : null}
                  <div className="flex-1" />
                  <span className="flex items-center gap-1 text-sm font-medium text-[var(--ds-text)]">
                    <Building2 className="h-3 w-3 text-[var(--ds-text-muted)]" strokeWidth={1.8} />
                    {cmd.labo}
                  </span>
                </div>

                <p className="mb-2.5 text-base text-[var(--ds-text-muted)]">
                  <span className="font-medium text-[color:var(--ds-text)]">{acte}</span>
                  {" · "}
                  {dent ?? "—"}
                  {" · "}
                  {cmd.teinte ?? "—"}
                  {" · "}
                  {cmd.materiau ?? "—"}
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
                        className="rounded-lg bg-[color:var(--ds-primary)] px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-[color:var(--ds-primary-dark)]"
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
                <h3 className="text-lg font-medium tracking-tight text-[color:var(--ds-text)]">
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
                  const msg = pushLabDatesToLinkedAppointments(undefined, next);
                  if (msg) showAppToast(msg);
                  const apps = readAppointmentsFromStorage();
                  const withNew = [next, ...prev];
                  return pullAgendaDatesIntoLabCommandes(withNew, apps);
                });
                setAppointments(readAppointmentsFromStorage());
                setIsModalOpen(false);
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
                  className="rounded-2xl bg-[color:var(--ds-primary)] px-5 py-2.5 text-sm font-medium text-white shadow-[0_4px_16px_rgba(8,145,178,0.2)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
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
    "En attente": "border-amber-200 bg-amber-50 text-amber-800",
    "En fabrication": "border-cyan-200 bg-cyan-50 text-cyan-800",
    "Reçu au cabinet":
      "border-[var(--ds-primary-border)] bg-[var(--ds-primary-soft)] text-[color:var(--ds-primary)]",
    Posé: "border-emerald-200 bg-emerald-50 text-emerald-800",
  };
  const dots: Record<string, string> = {
    "En attente": "bg-amber-400",
    "En fabrication": "bg-cyan-400",
    "Reçu au cabinet": "bg-[color:var(--ds-primary)]",
    Posé: "bg-emerald-400",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold",
        styles[statut] ?? "border-[var(--ds-border)] bg-[var(--ds-bg)] text-[var(--ds-text-muted)]",
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", dots[statut] ?? "bg-slate-400")} />
      {statut}
    </span>
  );
}

function UrgenceBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-sm font-semibold text-red-700">
      <span className="h-1 w-1 rounded-full bg-red-500" />
      Pose avant retour
    </span>
  );
}

function PretBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
      <span className="h-1 w-1 rounded-full bg-emerald-500" />
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
    <div className="flex items-center gap-1.5 text-base text-[var(--ds-text-muted)]">
      <Calendar className="h-3 w-3" strokeWidth={1.8} />
      <span>{label}</span>
      <span
        className={cn(
          "font-['DM_Mono'] font-medium",
          isAlert ? "text-red-600" : "text-[color:var(--ds-text)]",
        )}
      >
        {date}
      </span>
      {isAlert ? <AlertCircle className="h-3 w-3 text-red-500" strokeWidth={1.8} /> : null}
    </div>
  );
}

function ActionButton({
  icon,
  onClick,
  title,
}: {
  icon: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--ds-border)] bg-[var(--ds-bg)] text-[var(--ds-text-muted)] transition-all hover:border-[var(--ds-primary-border)] hover:bg-[var(--ds-primary-soft)] hover:text-[color:var(--ds-primary)]"
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
  const dent = parseDentFromTravail(cmd.travail);
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
    icon: React.ReactNode;
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
            <p className="text-[10px] font-mono uppercase tracking-[0.1em] text-[var(--ds-text-muted)]">
              Commande labo
            </p>
            <h3 className="mt-1 truncate text-[18px] font-semibold tracking-tight text-[var(--ds-text)]">
              {acte}
              {dent ? (
                <span className="text-[var(--ds-text-muted)]"> · {dent}</span>
              ) : null}
            </h3>
            <p className="mt-0.5 truncate text-[12px] font-light text-[var(--ds-text-muted)]">
              {cmd.patient} · {cmd.labo}
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
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--ds-text-muted)]">
              Statut actuel
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge statut={cmd.statut} />
              {conflit ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">
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
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--ds-text-muted)]">
              Détails de la commande
            </p>
            <div className="grid grid-cols-2 gap-2">
              <DetailItem label="Patient" value={cmd.patient} />
              <DetailItem label="Dent" value={dent ?? "—"} />
              <DetailItem label="Type" value={acte} full />
              <DetailItem label="Matériau" value={cmd.materiau ?? "—"} />
              <DetailItem label="Teinte" value={cmd.teinte ?? "—"} />
              <DetailItem label="Laboratoire" value={cmd.labo} full />
              <DetailItem
                label="Retour prévu"
                value={formatDatePrettyLocal(cmd.retourIso)}
                valueClass={retourPast ? "text-red-600" : undefined}
              />
              <DetailItem
                label="Pose prévue"
                value={formatDatePrettyLocal(cmd.rdvPatientIso)}
                valueClass={conflit ? "text-red-600" : undefined}
              />
            </div>
          </section>

          {/* Édition dates & liens */}
          <section className="mb-6">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--ds-text-muted)]">
              Modifier dates & liaison agenda
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-mono uppercase tracking-[0.1em] text-[var(--ds-text-muted)]">
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
                <label className="text-[10px] font-mono uppercase tracking-[0.1em] text-[var(--ds-text-muted)]">
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
                <label className="text-[10px] font-mono uppercase tracking-[0.1em] text-[var(--ds-text-muted)]">
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
                <label className="text-[10px] font-mono uppercase tracking-[0.1em] text-[var(--ds-text-muted)]">
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
                <label className="text-[10px] font-mono uppercase tracking-[0.1em] text-[var(--ds-text-muted)]">
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
                  className={inputSubtle + " mt-1.5 tabular-nums"}
                />
              </div>
            </div>
          </section>

          {/* Changer statut */}
          <section className="mb-6">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--ds-text-muted)]">
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
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--ds-text-muted)]">
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
                      <p className="text-[13px] font-semibold text-[var(--ds-text)]">
                        {ev.title}
                      </p>
                      <p className="font-mono text-[11px] text-[var(--ds-text-muted)]">
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

function DetailItem({
  label,
  value,
  full,
  valueClass,
}: {
  label: string;
  value: string;
  full?: boolean;
  valueClass?: string;
}) {
  return (
    <div
      className={[
        "rounded-xl bg-[var(--ds-bg)] px-3 py-2.5",
        full ? "col-span-2" : "",
      ].join(" ")}
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ds-text-muted)]">
        {label}
      </p>
      <p
        className={[
          "mt-1 text-[13px] font-semibold text-[var(--ds-text)]",
          valueClass ?? "",
        ].join(" ")}
      >
        {value}
      </p>
    </div>
  );
}
