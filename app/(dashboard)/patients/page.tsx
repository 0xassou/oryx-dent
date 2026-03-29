"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, Search, UserPlus, FileText } from "lucide-react";
import {
  AddPatientModal,
  type AddPatientPayload,
} from "@/components/patients/AddPatientModal";
import { formatDate, formatPhoneNumber } from "@/utils/formatters";
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

export default function PatientsPage() {
  const router = useRouter();
  const [patients, setPatients] = useState<DentalPatientRecord[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [openActionsId, setOpenActionsId] = useState<string | null>(null);

  const reload = useCallback(() => {
    setPatients(readPatientsFromStorage());
  }, []);

  useEffect(() => {
    ensurePatientsHydrated();
    setPatients(readPatientsFromStorage());
    setHydrated(true);
  }, []);

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
    if (!q) return patients;
    return patients.filter((p) => {
      const name = displayPatientName(p).toLowerCase();
      return (
        name.includes(q) ||
        p.nom.toLowerCase().includes(q) ||
        p.prenom.toLowerCase().includes(q) ||
        p.telephone.replace(/\s/g, "").includes(q.replace(/\s/g, ""))
      );
    });
  }, [patients, search]);

  function goToPatient(patientId: string) {
    router.push(`/patients/${patientId}`);
    setOpenActionsId(null);
  }

  function handleAddPatient(payload: AddPatientPayload) {
    if (!payload.nom.trim() || !payload.prenom.trim()) return;
    const newId = newPatientId();
    const record: DentalPatientRecord = {
      id: newId,
      nom: payload.nom.trim(),
      prenom: payload.prenom.trim(),
      telephone: payload.telephone.trim() || "—",
      derniereVisite: new Date().toISOString(),
    };
    upsertPatientInStorage(record);

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
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
        Chargement des patients…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Patients</h1>
          <p className="mt-1 text-sm text-slate-500">
            Total : {patients.length} patient{patients.length !== 1 ? "s" : ""}{" "}
            enregistré{patients.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-sky-600"
        >
          <UserPlus className="h-4 w-4" />
          Ajouter un patient
        </button>
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher par nom, prénom ou téléphone…"
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-800 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
        />
      </div>

      <div className="rounded-3xl bg-white p-6 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="pb-3 text-left text-sm font-medium text-slate-500">
                  Prénom
                </th>
                <th className="pb-3 text-left text-sm font-medium text-slate-500">
                  Nom
                </th>
                <th className="pb-3 text-left text-sm font-medium text-slate-500">
                  Téléphone
                </th>
                <th className="pb-3 text-left text-sm font-medium text-slate-500">
                  Dernière visite
                </th>
                <th className="pb-3 text-right text-sm font-medium text-slate-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="py-12 text-center text-sm text-slate-500"
                  >
                    Aucun patient ne correspond à votre recherche.
                  </td>
                </tr>
              ) : (
                filtered.map((patient) => {
                  const isActionsOpen = openActionsId === patient.id;
                  return (
                    <tr
                      key={patient.id}
                      onClick={() => goToPatient(patient.id)}
                      className="cursor-pointer border-b border-slate-100 last:border-0 transition-colors hover:bg-sky-50/50"
                    >
                      <td className="py-4 text-sm font-medium text-slate-800">
                        {patient.prenom || "—"}
                      </td>
                      <td className="py-4 text-sm font-medium text-slate-800">
                        {patient.nom || "—"}
                      </td>
                      <td className="py-4 text-sm text-slate-600">
                        {formatPhoneNumber(patient.telephone)}
                      </td>
                      <td className="py-4 text-sm text-slate-600">
                        {formatDate(patient.derniereVisite)}
                      </td>
                      <td className="relative py-4 text-right">
                        <button
                          type="button"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-2xl text-slate-500 transition-colors hover:bg-sky-50 hover:text-sky-700"
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
                            <div className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-3xl bg-white py-2 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  goToPatient(patient.id);
                                }}
                                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-sky-50/50"
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
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AddPatientModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleAddPatient}
      />
    </div>
  );
}
