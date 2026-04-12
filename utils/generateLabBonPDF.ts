import jsPDF from "jspdf";

export function generateLabBonPDF(commande: {
  patient?: string;
  acte?: string;
  laboratoire?: string;
  dateRetour?: string;
  notes?: string;
  id?: string;
}) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const W = 210;
  const margin = 20;
  const violet = [124, 58, 237] as [number, number, number];

  // Header
  doc.setFillColor(...violet);
  doc.rect(0, 0, W, 35, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("BON DE COMMANDE LABORATOIRE", margin, 20);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Oryx · ${new Date().toLocaleDateString("fr-DZ")}`, margin, 28);

  let y = 50;

  const field = (label: string, value: string) => {
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(label, margin, y);
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(value || "—", margin, y + 6);
    y += 16;
  };

  field("Patient", commande.patient ?? "");
  field("Acte / Prothèse", commande.acte ?? "");
  field("Laboratoire", commande.laboratoire ?? "");
  field("Date de retour prévue", commande.dateRetour ?? "");

  if (commande.notes) {
    field("Notes", commande.notes);
  }

  // Footer
  doc.setDrawColor(235, 233, 254);
  doc.setLineWidth(0.3);
  doc.line(margin, 270, W - margin, 270);
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(8);
  doc.text(
    "Oryx · Gestion Dentaire · Algérie",
    W / 2,
    277,
    { align: "center" },
  );

  const safePatient = (commande.patient ?? "patient").replace(
    /[/\\?%*:|"<>]/g,
    "-",
  );
  const dateStr = new Date()
    .toLocaleDateString("fr-DZ")
    .replace(/\//g, "-");
  doc.save(`BonLabo_${safePatient}_${dateStr}.pdf`);
}
