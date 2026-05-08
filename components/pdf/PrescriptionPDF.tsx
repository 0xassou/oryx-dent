import React from "react";
import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

const MM_TO_PT = 2.834645669;

// Variable font (TTF) source officielle Google Fonts (GitHub).
// Note: on enregistre 2 "poids" pour permettre `fontWeight: 700`.
Font.register({
  family: "Sora",
  fonts: [
    {
      src: "https://github.com/google/fonts/raw/main/ofl/sora/Sora%5Bwght%5D.ttf",
      fontWeight: 400,
    },
    {
      src: "https://github.com/google/fonts/raw/main/ofl/sora/Sora%5Bwght%5D.ttf",
      fontWeight: 700,
    },
  ],
});

export type PrescriptionPDFMedication = {
  nom: string;
  dosage?: string;
  posologie?: string;
  duree?: string;
};

export type PrescriptionPDFCabinet = {
  nom?: string;
  adresse?: string;
  telephone?: string;
  numeroCnam?: string;
};

export type PrescriptionPDFPraticien = {
  nom?: string;
  specialite?: string;
};

export type PrescriptionPDFPatient = {
  nomComplet: string;
  age?: number;
  sexe?: string;
};

export type PrescriptionPDFProps = {
  cabinet?: PrescriptionPDFCabinet;
  praticien?: PrescriptionPDFPraticien;
  patient: PrescriptionPDFPatient;
  dateLabel: string;
  items: PrescriptionPDFMedication[];
};

const styles = StyleSheet.create({
  page: {
    fontFamily: "Sora",
    fontSize: 11,
    color: "#0f172a",
    padding: 20 * MM_TO_PT,
  },
  header: {
    gap: 4,
  },
  cabinetName: {
    fontSize: 14,
    fontWeight: 700,
  },
  muted: {
    color: "#64748b",
  },
  sep: {
    marginTop: 10,
    marginBottom: 10,
    height: 1,
    backgroundColor: "#e2e8f0",
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  practitioner: {
    fontSize: 11,
  },
  date: {
    fontSize: 10,
    color: "#64748b",
  },
  patientBlock: {
    marginTop: 6,
    gap: 2,
  },
  ordonnanceTitle: {
    marginTop: 10,
    marginBottom: 10,
    fontSize: 16,
    fontWeight: 700,
    textAlign: "center",
    textDecoration: "underline",
  },
  medsList: {
    gap: 6,
    marginTop: 2,
    flexGrow: 1,
  },
  medLine: {
    fontSize: 11,
    lineHeight: 1.25,
  },
  footer: {
    marginTop: 18,
    gap: 10,
  },
  footerTop: {
    fontSize: 10,
    color: "#64748b",
  },
  signatureRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  signatureBox: {
    width: 180,
    gap: 6,
  },
  signatureLine: {
    height: 1,
    backgroundColor: "#94a3b8",
  },
  signatureLabel: {
    fontSize: 10,
    color: "#64748b",
    textAlign: "center",
  },
});

function formatMedicationLine(it: PrescriptionPDFMedication): string {
  const nom = it.nom?.trim() || "—";
  const dosage = it.dosage?.trim();
  const posologie = it.posologie?.trim();
  const duree = it.duree?.trim();

  const left = dosage ? `${nom} ${dosage}` : nom;
  const parts = [posologie, duree].filter(Boolean);
  if (parts.length === 0) return left;
  return `${left} — ${parts.join(" — ")}`;
}

export function PrescriptionPDF({
  cabinet,
  praticien,
  patient,
  dateLabel,
  items,
}: PrescriptionPDFProps) {
  const cabinetNom = cabinet?.nom?.trim() || "Cabinet Dentaire";

  const praticienNom = praticien?.nom?.trim()
    ? `Dr. ${praticien.nom.trim()}`
    : "Dr. —";
  const specialite = praticien?.specialite?.trim() || "Chirurgien-Dentiste";

  const ageLabel =
    typeof patient.age === "number" && patient.age > 0
      ? `${patient.age} ans`
      : undefined;
  const sexeLabel = patient.sexe?.trim() || undefined;

  return (
    <Document>
      <Page size="A5" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.cabinetName}>{cabinetNom}</Text>
          {cabinet?.adresse?.trim() ? (
            <Text style={styles.muted}>{cabinet.adresse.trim()}</Text>
          ) : null}
          <View style={styles.rowBetween}>
            <View>
              {cabinet?.telephone?.trim() ? (
                <Text style={styles.muted}>Tél : {cabinet.telephone.trim()}</Text>
              ) : null}
              {cabinet?.numeroCnam?.trim() ? (
                <Text style={styles.muted}>
                  N° CNAM : {cabinet.numeroCnam.trim()}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        <View style={styles.sep} />

        <View style={styles.rowBetween}>
          <View>
            <Text style={styles.practitioner}>
              {praticienNom} · {specialite}
            </Text>
          </View>
          <Text style={styles.date}>{dateLabel}</Text>
        </View>

        <View style={styles.patientBlock}>
          <Text>
            <Text style={styles.muted}>Patient : </Text>
            <Text>{patient.nomComplet?.trim() || "—"}</Text>
          </Text>
          <Text>
            <Text style={styles.muted}>Âge : </Text>
            <Text>{ageLabel ?? "—"}</Text>
            <Text style={styles.muted}> · Sexe : </Text>
            <Text>{sexeLabel ?? "—"}</Text>
          </Text>
        </View>

        <Text style={styles.ordonnanceTitle}>ORDONNANCE</Text>

        <View style={styles.medsList}>
          {items.length === 0 ? (
            <Text style={styles.muted}>Aucun médicament.</Text>
          ) : (
            items.map((it, idx) => (
              <Text key={`${idx}-${it.nom}`} style={styles.medLine}>
                {formatMedicationLine(it)}
              </Text>
            ))
          )}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerTop}>Bon pour ordonnance</Text>
          <View style={styles.signatureRow}>
            <View style={styles.signatureBox}>
              <View style={styles.signatureLine} />
              <Text style={styles.signatureLabel}>Signature + cachet</Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}

