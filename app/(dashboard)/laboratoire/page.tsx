"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  FileText,
  Plus,
  Search,
  X,
} from "lucide-react";
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
  "w-full rounded-xl border border-slate-100 bg-white px-3 py-2 text-xs font-normal text-slate-700 outline-none transition-colors focus:border-slate-200 focus:ring-1 focus:ring-slate-200/60";

export default function LaboratoirePage() {
  const [activeTab, setActiveTab] = useState<
    "all" | "urgent" | "fabrication" | "ready"
  >("all");

  const [commandes, setCommandes] = useState<LaboratoireCommande[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [patients, setPatients] = useState<DentalPatientRecord[]>([]);
  const [labs, setLabs] = useState<DentalLabPartner[]>([]);
  const [appointments, setAppointments] = useState<AppointmentRdv[]>([]);
  const [expandedCommandId, setExpandedCommandId] = useState<string | null>(
    null,
  );
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

  const tabFiltered = useMemo(() => {
    if (activeTab === "all") return commandes;
    if (activeTab === "fabrication")
      return commandes.filter((c) => c.statut === "EN_FABRICATION");
    if (activeTab === "ready")
      return commandes.filter((c) => c.statut === "RECU_CABINET");
    return commandes.filter(
      (c) => c.statut !== "POSE" && isRetourUrgent(c.retourIso),
    );
  }, [activeTab, commandes]);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return tabFiltered;
    return tabFiltered.filter((c) => {
      const patient = c.patient.toLowerCase();
      const travail = c.travail.toLowerCase();
      const labo = c.labo.toLowerCase();
      return (
        patient.includes(q) || travail.includes(q) || labo.includes(q)
      );
    });
  }, [tabFiltered, searchTerm]);

  function apptsForCommand(cmd: LaboratoireCommande): AppointmentRdv[] {
    return filterAppointmentsForPatient(
      appointments,
      cmd.patientId,
      cmd.patient,
    );
  }

  return (
    <div className="space-y-10 pb-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-medium tracking-tight text-[color:var(--ds-text)]">
            Laboratoire & Prothèses
          </h1>
          <p className="max-w-xl text-sm font-light leading-relaxed text-slate-500">
            Commandes compactes : ouvrez une fiche pour ajuster les dates, les
            liens agenda et le coût.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 self-start rounded-2xl bg-[color:var(--ds-primary)] px-5 py-3 text-sm font-medium text-white shadow-[0_4px_20px_rgba(8,145,178,0.22)] transition-opacity hover:opacity-90"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          Nouvelle commande labo
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-100/90 bg-white/95 p-2 shadow-[0_2px_16px_rgba(15,23,42,0.04)]">
        {(
          [
            ["all", "Toutes"],
            ["urgent", "Urgences"],
            ["fabrication", "En fabrication"],
            ["ready", "Prêtes à poser"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={[
              "rounded-xl px-4 py-2 text-sm font-normal transition-all",
              activeTab === id
                ? id === "urgent"
                  ? "bg-red-500/95 font-medium text-white shadow-sm"
                  : "bg-[color:var(--ds-primary)] font-medium text-white shadow-[0_2px_12px_rgba(8,145,178,0.25)]"
                : "text-slate-500 hover:bg-slate-50/80 hover:text-slate-700",
            ].join(" ")}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-slate-400"
          strokeWidth={2}
          aria-hidden
        />
        <input
          type="search"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Rechercher un patient, un acte ou un laboratoire…"
          aria-label="Rechercher dans les commandes laboratoire"
          autoComplete="off"
          className="w-full rounded-xl border border-gray-200/60 bg-white py-2.5 pl-10 pr-10 text-sm font-normal text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.04)] outline-none transition-shadow placeholder:text-slate-400 focus:border-gray-200/80 focus:ring-2 focus:ring-blue-100"
        />
        {searchTerm ? (
          <button
            type="button"
            onClick={() => setSearchTerm("")}
            className="absolute right-2 top-1/2 z-[1] flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600"
            aria-label="Effacer la recherche"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        ) : null}
      </div>

      <div className="space-y-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-medium tracking-tight text-slate-700">
            {filtered.length === 1 ? (
              <>
                <span className="tabular-nums text-slate-900">1</span> commande
                trouvée
              </>
            ) : (
              <>
                <span className="tabular-nums text-slate-900">
                  {filtered.length}
                </span>{" "}
                commandes trouvées
              </>
            )}
          </p>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200/80 bg-white/60 px-6 py-16 text-center shadow-[0_2px_12px_rgba(15,23,42,0.03)]">
            {searchTerm.trim() && tabFiltered.length > 0 ? (
              <div className="mx-auto max-w-md space-y-3">
                <div
                  className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-50 text-slate-300"
                  aria-hidden
                >
                  <Search className="h-6 w-6" strokeWidth={1.5} />
                </div>
                <p className="text-sm font-light leading-relaxed text-slate-500">
                  Aucun résultat pour &quot;{searchTerm.trim()}&quot; dans le
                  Laboratoire.
                </p>
              </div>
            ) : (
              <p className="text-sm font-light text-slate-400">
                Aucune commande dans ce filtre.
              </p>
            )}
          </div>
        ) : (
          filtered.map((cmd) => {
            const critical = isRetourUrgent(cmd.retourIso);
            const conflitDate = isRdvPatientBeforeRetourLabo(
              cmd.rdvPatientIso,
              cmd.retourIso,
            );
            const labPartner: DentalLabPartner =
              findLabByName(cmd.labo, labs) ?? {
                id: "",
                nom: cmd.labo,
                telephones: [],
                adresse: "",
              };
            const rowAppts = apptsForCommand(cmd);
            const expanded = expandedCommandId === cmd.id;

            return (
              <div
                key={cmd.id}
                className="overflow-hidden rounded-2xl border border-slate-100/90 bg-white shadow-[0_2px_24px_rgba(15,23,42,0.045)] transition-shadow duration-300 hover:shadow-[0_8px_32px_rgba(15,23,42,0.06)]"
              >
                <div
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setExpandedCommandId((x) =>
                        x === cmd.id ? null : cmd.id,
                      );
                    }
                  }}
                  onClick={() =>
                    setExpandedCommandId((x) => (x === cmd.id ? null : cmd.id))
                  }
                  className="w-full cursor-pointer p-6 text-left outline-none focus-visible:ring-2 focus-visible:ring-slate-200/80"
                >
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1 space-y-2">
                      <p className="flex items-center gap-2 text-[15px] font-medium tracking-tight text-slate-800">
                        {cmd.statut === "POSE" ? (
                          <span
                            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"
                            title="Travail posé"
                            aria-hidden
                          >
                            <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                          </span>
                        ) : null}
                        <span>{cmd.patient}</span>
                      </p>
                      <p className="text-sm font-light leading-relaxed text-slate-500">
                        {cmd.travail}
                      </p>
                      <p className="text-sm font-light tracking-wide text-slate-600">
                        Retour :{" "}
                        <span
                          className={
                            critical && cmd.statut !== "POSE"
                              ? "font-normal text-red-600"
                              : "font-normal text-slate-700"
                          }
                        >
                          {formatDatePretty(cmd.retourIso)}
                        </span>
                        <span className="text-slate-300"> | </span>
                        Pose :{" "}
                        <span className="font-normal text-slate-700">
                          {cmd.rdvPatientIso
                            ? formatDatePretty(cmd.rdvPatientIso)
                            : "—"}
                        </span>
                      </p>
                      {cmd.teinte && cmd.materiau ? (
                        <p className="text-xs font-light text-slate-400">
                          Teinte {cmd.teinte} · {cmd.materiau}
                        </p>
                      ) : null}
                      {conflitDate ? (
                        <p className="flex items-center gap-1.5 text-xs font-light text-red-600">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 animate-blink-red-alert" />
                          Pose avant retour labo
                        </p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 lg:flex-col lg:items-end lg:gap-3">
                      <StatusBadge statut={cmd.statut} />
                      <span className="max-w-[14rem] truncate text-sm font-light text-slate-600">
                        {cmd.labo}
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        <LabWhatsAppButton
                          patientName={cmd.patient}
                          telephones={labPartner.telephones}
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedCommandId((x) =>
                              x === cmd.id ? null : cmd.id,
                            );
                          }}
                          className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-slate-200 hover:bg-white"
                        >
                          {expanded ? "Fermer" : "Modifier"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {expanded ? (
                  <div
                    className="border-t border-slate-100/90 bg-slate-50/30 px-6 pb-8 pt-6"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <p className="mb-6 text-xs font-normal uppercase tracking-wider text-slate-400">
                      Détail & liaison agenda
                    </p>
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                      <div>
                        <label className="text-[11px] font-normal uppercase tracking-wider text-slate-400">
                          Retour labo
                        </label>
                        <input
                          type="date"
                          value={cmd.retourIso}
                          onChange={(e) => {
                            const v = e.target.value;
                            patchCommand(cmd.id, { ...cmd, retourIso: v });
                          }}
                          className={inputSubtle + " mt-2"}
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-normal uppercase tracking-wider text-slate-400">
                          Date de pose
                        </label>
                        <input
                          type="date"
                          value={cmd.rdvPatientIso ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            patchCommand(cmd.id, {
                              ...cmd,
                              rdvPatientIso: v || undefined,
                            });
                          }}
                          className={inputSubtle + " mt-2"}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="text-[11px] font-normal uppercase tracking-wider text-slate-400">
                          Lien agenda — pose
                        </label>
                        <select
                          value={cmd.linkedPoseAppointmentId ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (!v) {
                              patchCommand(cmd.id, {
                                ...cmd,
                                linkedPoseAppointmentId: undefined,
                              });
                              return;
                            }
                            const a = appointments.find((x) => x.id === v);
                            patchCommand(cmd.id, {
                              ...cmd,
                              linkedPoseAppointmentId: v,
                              rdvPatientIso: a?.dateKey ?? cmd.rdvPatientIso,
                            });
                          }}
                          className={inputSubtle + " mt-2"}
                        >
                          <option value="">— Aucun —</option>
                          {rowAppts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.dateKey} {a.start} — {a.soin}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="sm:col-span-2">
                        <label className="text-[11px] font-normal uppercase tracking-wider text-slate-400">
                          Lien agenda — retour labo
                        </label>
                        <select
                          value={cmd.linkedRetourAppointmentId ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (!v) {
                              patchCommand(cmd.id, {
                                ...cmd,
                                linkedRetourAppointmentId: undefined,
                              });
                              return;
                            }
                            const a = appointments.find((x) => x.id === v);
                            patchCommand(cmd.id, {
                              ...cmd,
                              linkedRetourAppointmentId: v,
                              retourIso: a?.dateKey ?? cmd.retourIso,
                            });
                          }}
                          className={inputSubtle + " mt-2"}
                        >
                          <option value="">— Aucun —</option>
                          {rowAppts.map((a) => (
                            <option key={`r-${a.id}`} value={a.id}>
                              {a.dateKey} {a.start} — {a.soin}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="mt-8 flex flex-col gap-6 border-t border-slate-100/80 pt-8 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <label className="text-[11px] font-normal uppercase tracking-wider text-slate-400">
                          Coût labo (DA)
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={100}
                          inputMode="numeric"
                          value={cmd.coutLaboDa ?? ""}
                          placeholder="—"
                          onChange={(e) => {
                            const raw = e.target.value;
                            setCommandes((prev) =>
                              prev.map((c) => {
                                if (c.id !== cmd.id) return c;
                                if (raw === "")
                                  return { ...c, coutLaboDa: undefined };
                                const n = Number(raw);
                                return {
                                  ...c,
                                  coutLaboDa: Number.isFinite(n)
                                    ? Math.max(0, n)
                                    : c.coutLaboDa,
                                };
                              }),
                            );
                          }}
                          onBlur={() => {
                            setCommandes((prev) =>
                              prev.map((c) =>
                                c.id === cmd.id
                                  ? maybeCreateLabExpense(c)
                                  : c,
                              ),
                            );
                          }}
                          className={
                            inputSubtle + " mt-2 max-w-[10rem] tabular-nums"
                          }
                        />
                      </div>
                      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                        <div className="min-w-0 flex-1 sm:min-w-[min(100%,20rem)] sm:flex-none">
                          <p className="text-[11px] font-normal uppercase tracking-wider text-slate-400">
                            Statut
                          </p>
                          <div
                            className="mt-2 flex flex-wrap gap-2"
                            role="group"
                            aria-label={`Statut de ${cmd.patient}`}
                          >
                            {LAB_STATUT_ORDER.map((s) => {
                              const active = cmd.statut === s;
                              return (
                                <button
                                  key={s}
                                  type="button"
                                  onClick={() => {
                                    if (s === cmd.statut) return;
                                    setCommandes((prev) =>
                                      prev.map((c) => {
                                        if (c.id !== cmd.id) return c;
                                        let next: LaboratoireCommande = {
                                          ...c,
                                          statut: s,
                                        };
                                        if (s === "RECU_CABINET") {
                                          next = maybeCreateLabExpense(next);
                                        }
                                        return next;
                                      }),
                                    );
                                    showAppToast(
                                      `Statut mis à jour : ${capitalizeToastPhrase(
                                        laboratoireStatutToastPhrase(s),
                                      )}`,
                                    );
                                  }}
                                  className={[
                                    "rounded-full px-3.5 py-1.5 text-[11px] font-medium tracking-wide transition-all",
                                    active
                                      ? "bg-slate-900 text-white shadow-[0_2px_8px_rgba(15,23,42,0.12)]"
                                      : "bg-white text-slate-600 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 ring-slate-200/70 hover:bg-slate-50/90",
                                  ].join(" ")}
                                >
                                  {laboratoireStatutLabel(s)}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => alert("Génération du bon PDF…")}
                          title="Bon de commande PDF"
                          className="inline-flex h-10 w-10 shrink-0 items-center justify-center self-end rounded-xl border border-slate-100 text-slate-400 transition-colors hover:border-slate-200 hover:bg-white hover:text-[color:var(--ds-primary)] sm:self-center"
                          aria-label="PDF"
                        >
                          <FileText className="h-4 w-4" strokeWidth={1.75} />
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

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
            className="max-h-[min(90vh,720px)] w-full max-w-lg overflow-y-auto rounded-3xl border border-slate-100/90 bg-white p-8 shadow-[0_12px_48px_rgba(15,23,42,0.1)]"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <h3 className="text-lg font-medium tracking-tight text-[color:var(--ds-text)]">
                  Nouvelle commande labo
                </h3>
                <p className="text-sm font-light text-slate-500">
                  Patient, laboratoire et liaisons agenda.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600"
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
                <label className="block text-sm font-medium text-slate-700">
                  Type de travail
                </label>
                <select
                  value={travail}
                  onChange={(e) => setTravail(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-100 bg-slate-50/30 px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-slate-200 focus:bg-white focus:ring-1 focus:ring-slate-200/80"
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
                  value={modalLabId}
                  onChange={(e) => setModalLabId(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-100 bg-slate-50/30 px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-slate-200 focus:bg-white focus:ring-1 focus:ring-slate-200/80"
                >
                  {labs.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nom}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Date RDV patient (pose)
                </label>
                <input
                  type="date"
                  value={rdvPatientIso}
                  onChange={(e) => setRdvPatientIso(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-100 bg-slate-50/30 px-3 py-2.5 text-sm font-normal outline-none focus:border-slate-200 focus:bg-white focus:ring-1 focus:ring-slate-200/80"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Retour labo prévu
                </label>
                <input
                  type="date"
                  value={retourIso}
                  onChange={(e) => setRetourIso(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-100 bg-slate-50/30 px-3 py-2.5 text-sm font-normal outline-none focus:border-slate-200 focus:bg-white focus:ring-1 focus:ring-slate-200/80"
                />
                <p className="mt-2 text-xs font-light text-slate-400">
                  Couronne / Bridge : J+7 suggéré automatiquement.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">
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
                  className="mt-2 w-full rounded-2xl border border-slate-100 bg-slate-50/30 px-3 py-2.5 text-sm font-normal outline-none disabled:opacity-50"
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
                <label className="block text-sm font-medium text-slate-700">
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
                  className="mt-2 w-full rounded-2xl border border-slate-100 bg-slate-50/30 px-3 py-2.5 text-sm font-normal outline-none disabled:opacity-50"
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
                  className="rounded-2xl border border-slate-100 px-5 py-2.5 text-sm font-normal text-slate-500 transition-colors hover:bg-slate-50"
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
