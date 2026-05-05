"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUpDown, ChevronRight, MoreVertical, Search, FileText, UserPlus } from "lucide-react";
import AnimatedButton from "@/components/ui/AnimatedButton";
import { syncPatientToDBAction } from "@/app/actions/patients";
import {
  AddPatientModal,
  type AddPatientPayload,
} from "@/components/patients/AddPatientModal";
import { formatDate, formatPhoneNumber, toTitleCase } from "@/utils/formatters";
import {
  computeAgeFromDateIso,
  displayPatientName,
  ensurePatientsHydrated,
  initializeEmptyDentalChart,
  newPatientId,
  readPatientsFromStorage,
  type DentalPatientRecord,
  upsertPatientInStorage,
  writeMinimalPatientProfile,
} from "@/utils/patientData";

const AVATAR_PALETTE = [
  { bg: "bg-violet-100 dark:bg-violet-900/40", text: "text-violet-700 dark:text-violet-300" },
  { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-300" },
  { bg: "bg-rose-100 dark:bg-rose-900/40", text: "text-rose-700 dark:text-rose-300" },
  { bg: "bg-amber-100 dark:bg-amber-900/40", text: "text-amber-700 dark:text-amber-300" },
  { bg: "bg-cyan-100 dark:bg-cyan-900/40", text: "text-cyan-700 dark:text-cyan-300" },
  { bg: "bg-indigo-100 dark:bg-indigo-900/40", text: "text-indigo-700 dark:text-indigo-300" },
  { bg: "bg-pink-100 dark:bg-pink-900/40", text: "text-pink-700 dark:text-pink-300" },
  { bg: "bg-teal-100 dark:bg-teal-900/40", text: "text-teal-700 dark:text-teal-300" },
];

function getAvatarColor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

const SIX_MONTHS_MS = 180 * 24 * 60 * 60 * 1000;

function PatientsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [patients, setPatients] = useState<DentalPatientRecord[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [openActionsId, setOpenActionsId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"tous" | "actifs" | "inactifs">("tous");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");

  const reload = useCallback(() => {
    setPatients(readPatientsFromStorage());
  }, []);

  useEffect(() => {
    ensurePatientsHydrated();
    setPatients(readPatientsFromStorage());
    setHydrated(true);
  }, []);

  useEffect(() => {
    const q = searchParams.get("search");
    if (q) setSearch(q);
  }, [searchParams]);

  useEffect(() => {
    function onFocus() {
      if (typeof window === "undefined") return;
      reload();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [reload]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = Date.now();

    const result = patients.filter((p) => {
      if (q) {
        const name = displayPatientName(p).toLowerCase();
        if (
          !name.includes(q) &&
          !p.nom.toLowerCase().includes(q) &&
          !p.prenom.toLowerCase().includes(q) &&
          !p.telephone.replace(/\s/g, "").includes(q.replace(/\s/g, ""))
        ) return false;
      }
      if (statusFilter !== "tous") {
        const isActif = now - new Date(p.derniereVisite).getTime() < SIX_MONTHS_MS;
        if (statusFilter === "actifs" && !isActif) return false;
        if (statusFilter === "inactifs" && isActif) return false;
      }
      return true;
    });

    return result.sort((a, b) => {
      const ta = new Date(a.derniereVisite).getTime();
      const tb = new Date(b.derniereVisite).getTime();
      return sortOrder === "desc" ? tb - ta : ta - tb;
    });
  }, [patients, search, statusFilter, sortOrder]);

  function goToPatient(patientId: string) {
    router.push(`/patients/${patientId}`);
    setOpenActionsId(null);
  }

  function handleAddPatient(payload: AddPatientPayload) {
    if (!payload.nom.trim() || !payload.prenom.trim() || !payload.telephone.trim())
      return;
    const newId = newPatientId();
    const record: DentalPatientRecord = {
      id: newId,
      nom: payload.nom.trim(),
      prenom: payload.prenom.trim(),
      telephone: payload.telephone.trim() || "—",
      derniereVisite: new Date().toISOString(),
    };
    upsertPatientInStorage(record);

    // Sync PostgreSQL
    syncPatientToDBAction({
      id: record.id,
      prenom: record.prenom,
      nom: record.nom,
      telephone: record.telephone,
    }).catch(console.error);

    const genreLabel =
      payload.sexe === "F"
        ? "Femme"
        : payload.sexe === "M"
          ? "Homme"
          : "—";

    writeMinimalPatientProfile({
      id: newId,
      nom: displayPatientName(record),
      age: computeAgeFromDateIso(payload.dateNaissance),
      genre: genreLabel,
      profession: "—",
      adresse: payload.adresse.trim() || "—",
      telephone: record.telephone,
      email: payload.email.trim() || "—",
      dateNaissance: payload.dateNaissance.trim(),
      alerts: payload.allergies
        ? [payload.allergies.trim()].filter(Boolean)
        : [],
    });

    initializeEmptyDentalChart(newId);

    reload();
    setIsModalOpen(false);
    router.push(`/patients/${newId}`);
  }

  if (!hydrated) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--ds-text-muted)]">
        Chargement des patients…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--ds-text)]">Patients</h1>
          <p className="mt-1 text-sm text-[var(--ds-text-muted)]">
            Total : {patients.length} patient{patients.length !== 1 ? "s" : ""}{" "}
            enregistré{patients.length !== 1 ? "s" : ""}
          </p>
        </div>
        <AnimatedButton onClick={() => setIsModalOpen(true)}>
          <UserPlus className="h-4 w-4" strokeWidth={2} />
          Ajouter un patient
        </AnimatedButton>
      </div>

      <div className="relative w-full">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-text-muted)]" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher par nom, prénom ou téléphone…"
          className="w-full rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] py-2.5 pl-10 pr-3 text-sm text-[var(--ds-text)] outline-none focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary-border)]"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {(["tous", "actifs", "inactifs"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setStatusFilter(f)}
              className={[
                "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
                statusFilter === f
                  ? "bg-[var(--ds-primary)] text-white"
                  : "border border-[var(--ds-border)] bg-[var(--ds-surface)] text-[var(--ds-text-muted)] hover:border-[var(--ds-primary-border)] hover:text-[var(--ds-text)]",
              ].join(" ")}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setSortOrder((o) => (o === "desc" ? "asc" : "desc"))}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--ds-border)] bg-[var(--ds-surface)] px-3 py-1.5 text-xs font-medium text-[var(--ds-text-muted)] transition-colors hover:border-[var(--ds-primary-border)] hover:text-[var(--ds-text)]"
        >
          <ArrowUpDown className="h-3.5 w-3.5" />
          Dernière visite : {sortOrder === "desc" ? "récent → ancien" : "ancien → récent"}
        </button>
      </div>

      <div className="rounded-3xl bg-[var(--ds-surface)] p-6 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-[var(--ds-text-muted)]">
            Aucun patient ne correspond à votre recherche.
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[560px]">
                <thead className="border-b border-[var(--ds-border)] bg-[var(--ds-bg)]">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--ds-text-muted)]">
                      Prénom
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--ds-text-muted)]">
                      Nom
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--ds-text-muted)]">
                      Téléphone
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--ds-text-muted)]">
                      Dernière visite
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--ds-text-muted)]">
                      Statut
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--ds-text-muted)]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((patient) => {
                    const isActionsOpen = openActionsId === patient.id;
                    const initials = `${patient.prenom?.[0]?.toUpperCase() ?? ""}${patient.nom?.[0]?.toUpperCase() ?? ""}` || "?";
                    const avatarColor = getAvatarColor(patient.id);
                    return (
                      <tr
                        key={patient.id}
                        onClick={() => goToPatient(patient.id)}
                        className="group cursor-pointer border-b border-[var(--ds-border)] transition-colors last:border-0 hover:bg-[var(--ds-primary-soft)]/50"
                      >
                        <td className="px-4 py-2.5 text-sm font-medium text-[var(--ds-text)]">
                          <div className="flex items-center gap-2.5">
                            <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl text-[11px] font-bold transition-transform group-hover:scale-110 ${avatarColor.bg} ${avatarColor.text}`}>
                              {initials}
                            </div>
                            <span>{patient.prenom || "—"}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-sm font-medium text-[var(--ds-text)]">
                          {patient.nom || "—"}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-[var(--ds-text-muted)]">
                          <div className="flex items-center">
                            <span>{formatPhoneNumber(patient.telephone)}</span>
                            <a
                              href={`https://wa.me/${patient.telephone
                                .replace(/\s/g, "")
                                .replace(/^0/, "213")}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 transition-all hover:bg-emerald-500 hover:text-white"
                              title="WhatsApp"
                            >
                              <svg
                                className="h-3 w-3"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                                aria-hidden
                              >
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                              </svg>
                            </a>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-sm text-[var(--ds-text-muted)]">
                          {formatDate(patient.derniereVisite)}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="inline-flex rounded-full border border-[var(--ds-primary-border)] bg-[var(--ds-primary-soft)] px-2.5 py-0.5 text-[10px] font-semibold text-[color:var(--ds-primary)]">
                            Actif
                          </span>
                        </td>
                        <td className="relative px-4 py-2.5 text-right">
                          <button
                            type="button"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-2xl text-[var(--ds-text-muted)] transition-colors hover:bg-[var(--ds-primary-soft)] hover:text-[var(--ds-primary)]"
                            aria-label={`Actions pour ${displayPatientName(patient)}`}
                            aria-expanded={isActionsOpen}
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenActionsId(isActionsOpen ? null : patient.id);
                            }}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
                          {isActionsOpen && (
                            <>
                              <div
                                className="fixed inset-0 z-40"
                                aria-hidden="true"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenActionsId(null);
                                }}
                              />
                              <div className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-3xl bg-[var(--ds-surface)] py-2 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    goToPatient(patient.id);
                                  }}
                                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-[var(--ds-text)] transition-colors hover:bg-[var(--ds-primary-soft)]/50"
                                >
                                  <FileText className="h-4 w-4 text-[color:var(--ds-primary)]" />
                                  Voir la fiche
                                </button>
                              </div>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 lg:hidden">
              {filtered.map((patient) => {
                const initial = (
                  patient.prenom?.trim() ||
                  patient.nom?.trim() ||
                  "?"
                )
                  .charAt(0)
                  .toUpperCase();
                const avatarColor = getAvatarColor(patient.id);
                return (
                  <div
                    key={patient.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => router.push(`/patients/${patient.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        router.push(`/patients/${patient.id}`);
                      }
                    }}
                    className="flex cursor-pointer items-center justify-between rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-4 transition-all hover:border-[var(--ds-primary)]/40 hover:shadow-sm"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-sm font-bold ${avatarColor.bg} ${avatarColor.text}`}>
                        {initial}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[var(--ds-text)]">
                          {toTitleCase(patient.prenom)} {toTitleCase(patient.nom)}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--ds-text-muted)]">
                          {formatPhoneNumber(patient.telephone)}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--ds-text-muted)]">
                          Dernière visite : {formatDate(patient.derniereVisite)}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1.5 pl-2">
                      <a
                        href={`https://wa.me/${patient.telephone
                          .replace(/\s/g, "")
                          .replace(/^0/, "213")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 transition-all hover:bg-emerald-500 hover:text-white"
                        title="WhatsApp"
                      >
                        <svg
                          className="h-3.5 w-3.5"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          aria-hidden
                        >
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                        </svg>
                      </a>
                      <ChevronRight
                        className="h-5 w-5 shrink-0 text-[var(--ds-text-muted)]"
                        aria-hidden
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <AddPatientModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleAddPatient}
      />
    </div>
  );
}

export default function PatientsPage() {
  return (
    <Suspense fallback={null}>
      <PatientsPageContent />
    </Suspense>
  );
}
