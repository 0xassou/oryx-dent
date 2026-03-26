"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical, UserPlus, FileText } from "lucide-react";
import {
  AddPatientModal,
  type AddPatientPayload,
} from "@/components/patients/AddPatientModal";

const PATIENTS = [
  {
    nom: "Marie Dupont",
    age: 42,
    dernierSoin: "Détartrage",
    statut: "payé",
  },
  {
    nom: "Jean Martin",
    age: 35,
    dernierSoin: "Extraction",
    statut: "non-payé",
  },
  {
    nom: "Sophie Bernard",
    age: 58,
    dernierSoin: "Couronne",
    statut: "payé",
  },
  {
    nom: "Pierre Leroy",
    age: 27,
    dernierSoin: "Détartrage",
    statut: "non-payé",
  },
  {
    nom: "Claire Moreau",
    age: 63,
    dernierSoin: "Blanchiment",
    statut: "payé",
  },
] as const;

export default function PatientsPage() {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [openActionsId, setOpenActionsId] = useState<string | null>(null);

  function goToPatient(patient: (typeof PATIENTS)[number]) {
    const id = PATIENTS.findIndex((p) => p.nom === patient.nom) + 1;
    router.push(`/patients/${id}`);
    setOpenActionsId(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold text-slate-800">Patients</h1>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-sky-600"
        >
          <UserPlus className="h-4 w-4" />
          Ajouter un patient
        </button>
      </div>

      <div className="rounded-3xl bg-white p-6 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[500px]">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="pb-3 text-left text-sm font-medium text-slate-500">
                  Nom
                </th>
                <th className="pb-3 text-left text-sm font-medium text-slate-500">
                  Âge
                </th>
                <th className="pb-3 text-left text-sm font-medium text-slate-500">
                  Dernier soin
                </th>
                <th className="pb-3 text-left text-sm font-medium text-slate-500">
                  Statut
                </th>
                <th className="pb-3 text-right text-sm font-medium text-slate-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {PATIENTS.map((patient) => {
                const isActionsOpen = openActionsId === patient.nom;
                return (
                  <tr
                    key={patient.nom}
                    onClick={() => goToPatient(patient)}
                    className="cursor-pointer border-b border-slate-100 last:border-0 transition-colors hover:bg-sky-50/50"
                  >
                    <td className="py-4 text-sm font-medium text-slate-800">
                      {patient.nom}
                    </td>
                    <td className="py-4 text-sm text-slate-600">{patient.age} ans</td>
                    <td className="py-4 text-sm text-slate-600">
                      {patient.dernierSoin}
                    </td>
                    <td className="py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          patient.statut === "payé"
                            ? "bg-teal-100 text-teal-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {patient.statut === "payé" ? "Payé" : "Non payé"}
                      </span>
                    </td>
                    <td className="relative py-4 text-right">
                      <button
                        type="button"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-2xl text-slate-500 transition-colors hover:bg-sky-50 hover:text-sky-700"
                        aria-label={`Actions pour ${patient.nom}`}
                        aria-expanded={isActionsOpen}
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenActionsId(isActionsOpen ? null : patient.nom);
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
                                goToPatient(patient);
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
              })}
            </tbody>
          </table>
        </div>
      </div>

      <AddPatientModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={(payload: AddPatientPayload) => {
          console.log("AddPatient", payload);
          setIsModalOpen(false);
        }}
      />
    </div>
  );
}
