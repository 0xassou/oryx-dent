import React from "react";
import { pdf } from "@react-pdf/renderer";
import { PrescriptionPDF } from "@/components/pdf/PrescriptionPDF";

export interface OrdonnancePDFData {
  patient: string;
  age?: number;
  sexe?: string;
  date: string;
  items: {
    nom: string;
    dosage?: string;
    posologie?: string;
    duree?: string;
  }[];
  cabinetNom?: string;
  cabinetAdresse?: string;
  cabinetTel?: string;
  cabinetNumeroCnam?: string;
  praticienNom?: string;
  mentionLegale?: string;
  logoBase64?: string;
}

function safeFilenamePart(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function formatIsoDateForFilename(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function generateOrdonnancePDF(
  data: OrdonnancePDFData,
): Promise<void> {
  const doc = (
    <PrescriptionPDF
      cabinet={{
        nom: data.cabinetNom,
        adresse: data.cabinetAdresse,
        telephone: data.cabinetTel,
        numeroCnam: data.cabinetNumeroCnam,
      }}
      praticien={{
        nom: data.praticienNom,
        specialite: "Chirurgien-Dentiste",
      }}
      patient={{
        nomComplet: data.patient,
        age: data.age,
        sexe: data.sexe,
      }}
      dateLabel={data.date}
      items={data.items}
    />
  );

  const blob = await pdf(doc).toBlob();
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `ordonnance-${safeFilenamePart(data.patient)}-${formatIsoDateForFilename(new Date())}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

