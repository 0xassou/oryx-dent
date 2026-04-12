import jsPDF from "jspdf";

export interface FacturePDFData {
  id: string;
  date: string;
  patient: string;
  montantTotal: number;
  montantPaye: number;
  statut: string;
  acte?: string;
  cabinetNom?: string;
  cabinetAdresse?: string;
  cabinetTel?: string;
  mentionLegale?: string;
  logoBase64?: string;
}

export function generateFacturePDF(data: FacturePDFData) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const W = 210;
  const margin = 20;
  let y = margin;

  // ── Couleur primaire violet ──
  const violet = [124, 58, 237] as [number, number, number];
  const gris = [100, 116, 139] as [number, number, number];
  const noir = [15, 23, 42] as [number, number, number];

  // ── HEADER ──
  // Bande violette en haut
  doc.setFillColor(...violet);
  doc.rect(0, 0, W, 40, "F");

  // Logo ou nom cabinet
  if (data.logoBase64) {
    try {
      doc.addImage(data.logoBase64, "PNG", margin, 8, 30, 20);
    } catch {
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text(data.cabinetNom ?? "Cabinet Dentaire", margin, 22);
    }
  } else {
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text(data.cabinetNom ?? "Cabinet Dentaire", margin, 18);
    if (data.cabinetAdresse) {
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(data.cabinetAdresse, margin, 25);
    }
    if (data.cabinetTel) {
      doc.text(`Tél : ${data.cabinetTel}`, margin, 30);
    }
  }

  // Titre FACTURE à droite
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.text("FACTURE", W - margin, 18, { align: "right" });
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(data.id, W - margin, 26, { align: "right" });
  doc.text(`Date : ${data.date}`, W - margin, 32, { align: "right" });

  y = 52;

  // ── INFOS PATIENT ──
  doc.setFillColor(245, 243, 255);
  doc.roundedRect(margin, y, W - margin * 2, 22, 3, 3, "F");
  doc.setTextColor(...gris);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("PATIENT", margin + 5, y + 7);
  doc.setTextColor(...noir);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(data.patient, margin + 5, y + 15);

  y += 32;

  // ── TABLEAU ACTE ──
  // Header tableau
  doc.setFillColor(...violet);
  doc.rect(margin, y, W - margin * 2, 10, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("DESCRIPTION", margin + 5, y + 7);
  doc.text("MONTANT", W - margin - 5, y + 7, { align: "right" });

  y += 10;

  // Ligne acte
  doc.setFillColor(250, 249, 255);
  doc.rect(margin, y, W - margin * 2, 12, "F");
  doc.setTextColor(...noir);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(data.acte ?? "Soins dentaires", margin + 5, y + 8);
  doc.text(
    `${data.montantTotal.toLocaleString("fr-DZ")} DA`,
    W - margin - 5,
    y + 8,
    { align: "right" },
  );

  y += 20;

  // ── TOTAUX ──
  const totauxX = W - margin - 80;

  // Total
  doc.setFontSize(10);
  doc.setTextColor(...gris);
  doc.text("Sous-total :", totauxX, y);
  doc.setTextColor(...noir);
  doc.text(
    `${data.montantTotal.toLocaleString("fr-DZ")} DA`,
    W - margin,
    y,
    { align: "right" },
  );

  y += 8;

  // Montant payé
  doc.setTextColor(...gris);
  doc.text("Montant payé :", totauxX, y);
  doc.setTextColor(16, 185, 129);
  doc.text(
    `- ${data.montantPaye.toLocaleString("fr-DZ")} DA`,
    W - margin,
    y,
    { align: "right" },
  );

  y += 8;

  // Ligne séparatrice
  doc.setDrawColor(...violet);
  doc.setLineWidth(0.5);
  doc.line(totauxX, y, W - margin, y);

  y += 6;

  // Reste à payer
  const resteAPayer = data.montantTotal - data.montantPaye;
  doc.setFillColor(...violet);
  doc.roundedRect(totauxX - 5, y - 4, W - margin - totauxX + 5, 12, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Reste à payer :", totauxX, y + 4);
  doc.text(
    `${resteAPayer.toLocaleString("fr-DZ")} DA`,
    W - margin - 2,
    y + 4,
    { align: "right" },
  );

  y += 20;

  // ── STATUT ──
  const statutColor =
    data.statut === "Payé"
      ? ([16, 185, 129] as [number, number, number])
      : data.statut === "En attente"
        ? ([245, 158, 11] as [number, number, number])
        : ([124, 58, 237] as [number, number, number]);

  doc.setFillColor(...statutColor);
  doc.roundedRect(margin, y, 50, 10, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(data.statut.toUpperCase(), margin + 25, y + 7, { align: "center" });

  // ── PIED DE PAGE ──
  const footerY = 277;
  doc.setDrawColor(235, 233, 254);
  doc.setLineWidth(0.3);
  doc.line(margin, footerY, W - margin, footerY);

  doc.setTextColor(...gris);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");

  const mention =
    data.mentionLegale ??
    "Document généré par Oryx · Gestion Dentaire · Algérie";
  doc.text(mention, W / 2, footerY + 5, { align: "center" });
  doc.text(
    `Oryx · oryx.dz · ${new Date().getFullYear()}`,
    W / 2,
    footerY + 10,
    { align: "center" },
  );

  // ── TÉLÉCHARGER ──
  const filename = `Facture_${data.id}_${data.patient.replace(/\s+/g, "_")}.pdf`;
  doc.save(filename);
}
