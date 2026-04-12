import jsPDF from "jspdf";

export interface OrdonnancePDFData {
  patient: string;
  age?: number;
  date: string;
  items: {
    medicament: string;
    posologie: string;
    duree: string;
  }[];
  cabinetNom?: string;
  cabinetAdresse?: string;
  cabinetTel?: string;
  praticienNom?: string;
  mentionLegale?: string;
  logoBase64?: string;
}

export function generateOrdonnancePDF(data: OrdonnancePDFData) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const W = 210;
  const margin = 20;
  const violet = [124, 58, 237] as [number, number, number];
  const gris = [100, 116, 139] as [number, number, number];
  const noir = [15, 23, 42] as [number, number, number];
  let y = margin;

  // ── HEADER ──
  doc.setFillColor(...violet);
  doc.rect(0, 0, W, 45, "F");

  // Logo ou nom cabinet
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(data.cabinetNom ?? "Cabinet Dentaire", margin, 18);

  if (data.praticienNom) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Dr. ${data.praticienNom}`, margin, 26);
  }
  if (data.cabinetAdresse) {
    doc.setFontSize(9);
    doc.text(data.cabinetAdresse, margin, 32);
  }
  if (data.cabinetTel) {
    doc.text(`Tél : ${data.cabinetTel}`, margin, 37);
  }

  // ORDONNANCE à droite
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("ORDONNANCE", W - margin, 20, { align: "right" });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Date : ${data.date}`, W - margin, 28, { align: "right" });

  y = 58;

  // ── INFOS PATIENT ──
  doc.setFillColor(245, 243, 255);
  doc.roundedRect(margin, y, W - margin * 2, 18, 3, 3, "F");
  doc.setTextColor(...gris);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("PATIENT", margin + 5, y + 6);
  doc.setTextColor(...noir);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(data.patient, margin + 5, y + 13);
  if (data.age) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...gris);
    doc.text(`${data.age} ans`, W - margin - 5, y + 13, { align: "right" });
  }

  y += 26;

  // ── MÉDICAMENTS ──
  doc.setTextColor(...noir);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Prescription médicale", margin, y);
  doc.setDrawColor(...violet);
  doc.setLineWidth(0.5);
  doc.line(margin, y + 2, W - margin, y + 2);

  y += 10;

  data.items.forEach((item, i) => {
    // Numéro
    doc.setFillColor(...violet);
    doc.circle(margin + 4, y + 3, 4, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text(String(i + 1), margin + 4, y + 5, { align: "center" });

    // Médicament
    doc.setTextColor(...noir);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(item.medicament, margin + 12, y + 5);

    y += 8;

    // Posologie
    doc.setTextColor(...gris);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Posologie : ${item.posologie}`, margin + 12, y + 2);

    y += 6;

    // Durée
    doc.text(`Durée : ${item.duree}`, margin + 12, y + 2);

    y += 10;

    // Séparateur
    if (i < data.items.length - 1) {
      doc.setDrawColor(235, 233, 254);
      doc.setLineWidth(0.2);
      doc.line(margin + 10, y, W - margin, y);
      y += 4;
    }
  });

  y += 10;

  // ── SIGNATURE ──
  const sigY = Math.max(y, 230);
  doc.setDrawColor(...gris);
  doc.setLineWidth(0.3);
  doc.line(W - margin - 60, sigY, W - margin, sigY);
  doc.setTextColor(...gris);
  doc.setFontSize(9);
  doc.text("Signature & cachet", W - margin - 30, sigY + 5, { align: "center" });

  if (data.praticienNom) {
    doc.setFontSize(8);
    doc.text(`Dr. ${data.praticienNom}`, W - margin - 30, sigY + 10, {
      align: "center",
    });
  }

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

  const filename = `Ordonnance_${data.patient.replace(/\s+/g, "_")}_${data.date.replace(/\//g, "-")}.pdf`;
  doc.save(filename);
}
