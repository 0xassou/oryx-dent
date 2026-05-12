"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CreditCard,
  DownloadCloud,
  MoreVertical,
  Receipt,
  Download,
  ExternalLink,
  Eye,
  File,
  FileText,
  ImageIcon,
  Plus,
  UploadCloud,
  X,
  ChevronRight,
  Trash2,
} from "lucide-react";
import { submitClinicalActAction } from "@/app/actions/clinicalAct";
import type { ClientProtocolBackfill } from "@/lib/server/clinical-act/types";
import { CatalogActCombobox } from "@/components/catalog/CatalogActCombobox";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import {
  buildProtocolesFromSeed,
  loadProtocolsFromStorage,
  saveProtocolsToStorage,
  type ProtocolForSettings,
} from "@/lib/onboarding/seedDefaultProtocols";
import { consumableLabelToStockProductId } from "@/lib/mapping/consumableNameToStockProductId";
import {
  consumeStockForAct,
  STOCK_UPDATED_EVENT,
  loadProtocols,
  notifyStockUpdated,
  type StockLine,
} from "@/utils/stockLogic";
import {
  PrescriptionModal,
  type PrescriptionItem,
} from "@/components/patients/PrescriptionModal";
import { RoleGate } from "@/components/auth/RoleGate";
import { formatDZD, formatDate } from "@/utils/formatters";
import { generateOrdonnancePDF } from "@/utils/generateOrdonnancePDF";
import {
  FACTURES_UPDATED_EVENT,
  notifyFacturesUpdated,
} from "@/utils/factureDocuments";
import { stockRowToStockLine } from "@/utils/stockDbMapping";
import {
  extractFinanceLineIdFromActes,
  montantsToStatutPostgreSQL,
} from "@/utils/factureDbMapping";
import type { FactureRowJoined } from "@/lib/types/factures-db";
import { getStocksAction, updateStockAction } from "@/app/actions/stocks";
import {
  createFactureAction,
  deleteFactureByFinanceLineIdAction,
  getFacturesByPatientAction,
  updateFactureAction,
} from "@/app/actions/factures";
import {
  ensureCatalogSeeded,
  readCatalogFromStorage,
  type DentalCatalogAct,
} from "@/utils/dentalCatalogActs";
import {
  createPatientAction,
  deletePatientAction,
  getPatientByIdAction,
  updatePatientAction,
} from "@/app/actions/patients";
import {
  deletePatientUiStateAction,
  getPatientUiStateAction,
  mergePatientUiStateAction,
} from "@/app/actions/patient-ui-state";
import {
  getCabinetBlob,
  getCabinetValue,
  persistCabinetPartial,
} from "@/lib/client/cabinetBlob";
import { getCabinetProtocolsStorage } from "@/lib/client/cabinetProtocolStorage";
import {
  computeAgeFromDateIso,
  patientRowToDentalPatientRecord,
  resolvePatientDisplayParts,
  splitNomComplet,
  type DentalPatientRecord,
} from "@/utils/patientData";
import {
  addPatientDocument,
  clearPatientDocuments,
  ensurePatientDocumentsForPatient,
  fileToDataUrl,
  inferDroppedFileKind,
  listDocumentsForPatient,
  removePatientDocument,
  defaultCategoryForDropped,
  type PatientDocument,
} from "@/utils/patientDocuments";
import type { ToothId, ToothStatus } from "@/components/dentition/DentalChart";
import PatientFicheView, {
  PatientSoinsTimeline,
  type PatientFicheAlerte,
  type PatientFicheData,
  type PatientFicheTimelineItem,
} from "@/components/patients/PatientFicheView";
import {
  createAppointmentAction,
  getAppointmentsByPatientAction,
} from "@/app/actions/appointments";
import {
  APPOINTMENTS_UPDATED_EVENT,
  appointmentJoinedRowToRdv,
  type AppointmentRdv,
} from "@/utils/appointmentData";
import { clearPatientRadios } from "@/utils/patientRadios";
import { RadiologiesSection } from "@/components/patients/RadiologiesSection";

function getSettings(): Record<string, unknown> {
  if (typeof window === "undefined") return {};
  try {
    return getCabinetBlob() as Record<string, unknown>;
  } catch {
    return {};
  }
}

const STERILIZATION_CABINET_KEY = "dental_sterilization_data";

type SterilizationKitRow = {
  id: string;
  kitType: string;
  status: string;
  numero: number;
};

type KitStockSlice = {
  disponible: number;
  sale: number;
  enCours: number;
};

type SterilizationStorage = {
  cycles?: unknown[];
  kits?: SterilizationKitRow[];
  stockByType?: Record<string, KitStockSlice>;
  nextKitNumero?: number;
};

/**
 * Déduit un kit stérile (→ sale) selon la catégorie du protocole.
 * Chirurgie / extraction → kit chirurgie ; sinon → kit examen.
 */
async function tryMarkSterilizationKitSale(protocolCategory: string): Promise<
  | { used: true; typeLabel: string; numero: number }
  | { used: false; typeLabel: string }
> {
  const cat = protocolCategory.toLowerCase();
  const targetType =
    cat.includes("chirurgie") || cat.includes("extraction")
      ? "chirurgie"
      : "examen";
  const typeLabel = targetType === "chirurgie" ? "Chirurgie" : "Examen";

  if (typeof window === "undefined") {
    return { used: false, typeLabel };
  }

  try {
    const existing = getCabinetValue<SterilizationStorage>(
      STERILIZATION_CABINET_KEY,
    );
    const sterData: SterilizationStorage = existing
      ? { ...existing, cycles: existing.cycles ?? [], kits: existing.kits ?? [] }
      : { cycles: [], kits: [] };

    const stock = sterData.stockByType?.[targetType];
    if (
      stock &&
      typeof stock.disponible === "number" &&
      stock.disponible > 0
    ) {
      if (!sterData.stockByType) sterData.stockByType = {};
      const st = sterData.stockByType[targetType] ?? {
        disponible: 0,
        sale: 0,
        enCours: 0,
      };
      sterData.stockByType[targetType] = {
        disponible: st.disponible - 1,
        sale: st.sale + 1,
        enCours: st.enCours,
      };
      if (!sterData.cycles) sterData.cycles = [];
      await persistCabinetPartial({
        [STERILIZATION_CABINET_KEY]: sterData,
      });
      return {
        used: true,
        typeLabel,
        numero: Date.now() % 100000,
      };
    }

    if (!Array.isArray(sterData.kits)) sterData.kits = [];
    const idx = sterData.kits.findIndex(
      (k) => k.kitType === targetType && k.status === "sterile",
    );
    if (idx === -1) {
      return { used: false, typeLabel };
    }

    sterData.kits[idx] = { ...sterData.kits[idx], status: "sale" };
    if (!sterData.cycles) sterData.cycles = [];

    await persistCabinetPartial({
      [STERILIZATION_CABINET_KEY]: sterData,
    });
    return {
      used: true,
      typeLabel,
      numero: sterData.kits[idx].numero,
    };
  } catch {
    return { used: false, typeLabel };
  }
}



// ── Actes par catégorie clinique ─────────────────────────────────────────────
const ACTES_PAR_CATEGORIE: Record<string, string[]> = {
  Saine: [],
  Soins: [
    "Composite 1 face",
    "Composite 2 faces",
    "Composite 3 faces",
    "Soin Verre Ionomère (CVI)",
    "Détartrage & polissage",
    "Scellement de sillon",
    "Désensibilisation cervicale",
    "Traitement canalaire (Incisive/Canine)",
    "Traitement canalaire (Prémolaire)",
    "Traitement canalaire (Molaire)",
    "Reprise endodontique",
    "Pulpotomie",
    "Coiffage pulpaire direct",
    "Apexification",
  ],
  Endodontie: [
    "Traitement canalaire (Incisive/Canine)",
    "Traitement canalaire (Prémolaire)",
    "Traitement canalaire (Molaire)",
    "Reprise endodontique",
    "Pulpotomie",
    "Coiffage pulpaire direct",
    "Apexification",
  ],
  Orthopédie: [
    "Couronne Céramique-Zircone",
    "Couronne Métal-Céramique",
    "Couronne Provisoire",
    "Inlay/Onlay Céramique",
    "Facette en céramique",
    "Bridge 3 éléments",
    "Gouttière occlusale",
  ],
  Chirurgie: [
    "Extraction simple",
    "Avulsion dent de sagesse (simple)",
    "Avulsion dent de sagesse (chirurgicale)",
    "Alvéoloplastie",
    "Pose d'implant",
    "Greffe osseuse",
    "Frénectomie",
  ],
  Absente: [],
};

// Mock de prix pour la facturation (affichage uniquement)
const ACTES_PRIX_DEVIS: Record<string, number> = {
  "Composite 1 face": 220,
  "Composite 2 faces": 450,
  "Composite 3 faces": 600,
  "Soin Verre Ionomère (CVI)": 180,
  "Détartrage & polissage": 260,
  "Scellement de sillon": 150,
  "Désensibilisation cervicale": 120,
  "Traitement canalaire (Incisive/Canine)": 320,
  "Traitement canalaire (Prémolaire)": 480,
  "Traitement canalaire (Molaire)": 620,
  "Reprise endodontique": 650,
  Pulpotomie: 400,
  "Coiffage pulpaire direct": 240,
  Apexification: 700,
  "Couronne Céramique-Zircone": 1200,
  "Couronne Métal-Céramique": 980,
  "Couronne Provisoire": 260,
  "Inlay/Onlay Céramique": 780,
  "Facette en céramique": 620,
  "Bridge 3 éléments": 1800,
  "Gouttière occlusale": 600,
  "Extraction simple": 150,
  "Avulsion dent de sagesse (simple)": 180,
  "Avulsion dent de sagesse (chirurgicale)": 260,
  Alvéoloplastie: 120,
  "Pose d'implant": 900,
  "Greffe osseuse": 1500,
  Frénectomie: 90,
};

// Mapping catégorie -> statut de la dent dans le schéma
const CATEGORY_TO_STATUS: Record<string, ToothStatus> = {
  Saine: "healthy",
  Soins: "carie",
  Endodontie: "carie",
  Orthopédie: "couronne",
  Chirurgie: "chirurgie",
  Absente: "absente",
};

/** Statut dentaire déduit de la catégorie du protocole (liste des 20 protocoles). */
function protocolCategoryToToothStatus(category: string): ToothStatus {
  const c = category.toLowerCase();
  if (c.includes("absente")) return "absente";
  if (c.includes("chirurgie") || c.includes("implant")) return "chirurgie";
  if (c.includes("prothèse") || c.includes("prothese") || c.includes("orthopédie"))
    return "couronne";
  if (c.includes("endodontie")) return "carie";
  return "carie";
}

// Toutes les IDs de dents pour l'état initial
const ALL_TOOTH_IDS: ToothId[] = [
  18, 17, 16, 15, 14, 13, 12, 11,
  21, 22, 23, 24, 25, 26, 27, 28,
  48, 47, 46, 45, 44, 43, 42, 41,
  31, 32, 33, 34, 35, 36, 37, 38,
];

type TabId = "historique" | "radios" | "finances";

const BLOOD_GROUP_OPTIONS = [
  "A+",
  "A-",
  "B+",
  "B-",
  "AB+",
  "AB-",
  "O+",
  "O-",
] as const;

type PatientAlertLevel = "danger" | "warning";

interface PatientAlertItem {
  label: string;
  level: PatientAlertLevel;
}

function normalizePatientAlerts(input: unknown): PatientAlertItem[] {
  if (!Array.isArray(input)) return [];
  const out: PatientAlertItem[] = [];
  for (const item of input) {
    if (typeof item === "string") {
      const label = item.trim();
      if (!label) continue;
      const low = label.toLowerCase();
      const level: PatientAlertLevel =
        low.includes("allergie") ||
        low.includes("pénicilline") ||
        low.includes("penicilline") ||
        low.includes("latex") ||
        low.includes("anaphyla")
          ? "danger"
          : "warning";
      out.push({ label, level });
    } else if (item && typeof item === "object" && "label" in item) {
      const label = String((item as { label: unknown }).label).trim();
      if (!label) continue;
      const lv = (item as { level?: unknown }).level;
      const level: PatientAlertLevel =
        lv === "danger" || lv === "warning" ? lv : "warning";
      out.push({ label, level });
    }
  }
  return out;
}

interface PatientProfile {
  id: string;
  /** Optionnel : utilisé pour les liens (ex. planning) ; sinon seul `nom` suffit. */
  prenom?: string;
  nom: string;
  age: number;
  genre: string;
  profession: string;
  adresse: string;
  telephone: string;
  /** Téléphone secondaire ou domicile */
  telephoneSecondaire: string;
  email: string;
  dateNaissance: string;
  groupeSanguin: string;
  mutuelle: string;
  /** ISO YYYY-MM-DD — affichée en fiche ; si vide, repli sur `patientRecord.createdAt`. */
  premiereVisite: string;
  /** Statut administratif affiché sur la fiche (badge). */
  statut: "actif" | "inactif";
  alerts: PatientAlertItem[];
}

const MOCK_PROFILES: Record<string, PatientProfile> = {
  "1": {
    id: "1",
    nom: "Karim Haddad",
    age: 44,
    genre: "Homme",
    profession: "Chirurgien-dentiste",
    adresse: "12 rue Didouche Mourad, Alger",
    telephone: "06 12 34 56 78",
    telephoneSecondaire: "",
    email: "karim.haddad@email.fr",
    dateNaissance: "1982-04-14",
    groupeSanguin: "A+",
    mutuelle: "CNAS",
    premiereVisite: "",
    statut: "actif",
    alerts: [
      { label: "Allergie Pénicilline", level: "danger" },
      { label: "Hypertendu", level: "warning" },
    ],
  },
  "2": {
    id: "2",
    nom: "Sarah Benali",
    age: 31,
    genre: "Femme",
    profession: "Assistante médicale",
    adresse: "45 avenue Emir Abdelkader, Oran",
    telephone: "06 98 76 54 32",
    telephoneSecondaire: "",
    email: "sarah.benali@email.fr",
    dateNaissance: "1995-08-03",
    groupeSanguin: "",
    mutuelle: "",
    premiereVisite: "",
    statut: "actif",
    alerts: [{ label: "Allergie Latex", level: "danger" }],
  },
  "3": {
    id: "3",
    nom: "Marie Dupont",
    age: 42,
    genre: "Femme",
    profession: "Cadre administratif",
    adresse: "8 boulevard Zighout Youcef, Constantine",
    telephone: "07 11 22 33 44",
    telephoneSecondaire: "",
    email: "marie.dupont@email.fr",
    dateNaissance: "1984-01-27",
    groupeSanguin: "O+",
    mutuelle: "Privée",
    premiereVisite: "",
    statut: "actif",
    alerts: [{ label: "Diabète de type 2", level: "warning" }],
  },
};

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const second = parts.length > 1 ? parts[parts.length - 1]?.[0] : "";
  return (first + second).toUpperCase();
}

function parseMoney(input: string) {
  const normalized = input.replace(/\s/g, "").replace(",", ".");
  const num = Number(normalized);
  return Number.isFinite(num) ? num : 0;
}

function uid() {
  return Math.random().toString(16).slice(2);
}

function parseDateToISO(dateValue: string) {
  // Accepte ISO complet, "YYYY-MM-DD" ou "DD/MM/YYYY"
  if (/^\d{4}-\d{2}-\d{2}T/.test(dateValue)) return dateValue.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return dateValue;

  const match = dateValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return "";

  const [, d, m, y] = match;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(
    2,
    "0"
  )}`;
}

/** Formate la saisie en JJ/MM/AAAA (auto-insertion des /) */
function formatDateInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** Convertit une date ISO (YYYY-MM-DD) en JJ/MM/AAAA pour l'affichage */
function isoToDisplayDate(isoDate: string): string {
  if (!isoDate) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    const [y, m, d] = isoDate.split("-");
    return `${d}/${m}/${y}`;
  }
  // Si déjà au format JJ/MM/AAAA, retourner tel quel
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(isoDate)) return isoDate;
  return "";
}

/** Valide le format JJ/MM/AAAA */
function isValidDateFormat(value: string): boolean {
  if (!value) return true; // Optionnel
  const regex = /^(0[1-9]|[12]\d|3[01])\/(0[1-9]|1[0-2])\/(19|20)\d{2}$/;
  if (!regex.test(value)) return false;
  const [day, month, year] = value.split("/").map(Number);
  const date = new Date(year!, month! - 1, day);
  return (
    date.getDate() === day &&
    date.getMonth() === month! - 1 &&
    date.getFullYear() === year
  );
}

function isoTimestampToFacturePgDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    const n = new Date();
    const y = n.getFullYear();
    const mo = String(n.getMonth() + 1).padStart(2, "0");
    const dd = String(n.getDate()).padStart(2, "0");
    return `${y}-${mo}-${dd}`;
  }
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${dd}`;
}

function financeLineMontantPayeDb(
  montantTotal: number,
  resteACharge: number,
): number {
  return Math.min(
    Math.max(0, montantTotal - resteACharge),
    montantTotal,
  );
}

function formatAmountDA(value: number) {
  return `${new Intl.NumberFormat("fr-FR").format(value)} DA`;
}

type PatientActAuditStamp = {
  userId: string;
  displayName: string;
  role: string;
  at: string;
};

type PatientTreatmentRow = {
  tooth: number;
  kind?: "act" | "state";
  category: string;
  acte: string;
  date: string;
  notes?: string;
  lt?: string;
  material?: string;
  faces?: ToothFace[];
  montant?: number;
  praticien?: string;
  _audit?: PatientActAuditStamp;
  // ---- état clinique (sauvegardé dans `patient_acts_${id}` via kind:"state") ----
  mobilite?: MobiliteGrade;
  sensibilite?: SensibiliteKind[];
  vitalite?: VitaliteKind;
  prochaine_etape?: string | null;
  controle_prevu?: string | null; // yyyy-mm-dd
  seances_notes?: ClinicalSessionNote[];
};

type ToothFace = "M" | "D" | "V" | "L" | "O";
type MobiliteGrade = "stable" | "mobile" | "tres_mobile";
type SensibiliteKind = "aucune" | "froid" | "chaud" | "percussion";
type VitaliteKind = "vivante" | "depulpee" | "incertaine";
type CockpitTab =
  | "Saine"
  | "Soins"
  | "Endodontie"
  | "Prothèse"
  | "Chirurgie"
  ;

/** Fond/texte des onglets cockpit actifs — palette états dent Oryx. */
const COCKPIT_TAB_ACTIVE_CN: Record<CockpitTab, string> = {
  Saine: "border-transparent bg-[#10b981] text-white shadow-sm",
  Soins: "border-transparent bg-[#7c3aed] text-white shadow-sm",
  Endodontie: "border-transparent bg-[#7c3aed] text-white shadow-sm",
  Prothèse: "border-transparent bg-[#06b6d4] text-white shadow-sm",
  Chirurgie: "border-transparent bg-[#f97316] text-white shadow-sm",
};
type ClinicalSessionNote = {
  date: string; // ISO
  praticien?: string;
  texte: string;
};

/** Schéma dentaire aligné sur l’historique des actes (localStorage / cockpit). */
function buildDentsStatusFromTreatments(
  treatments: PatientTreatmentRow[],
): Record<ToothId, ToothStatus> {
  const next = Object.fromEntries(
    ALL_TOOTH_IDS.map((tid) => [tid, "healthy" as ToothStatus]),
  ) as Record<ToothId, ToothStatus>;
  const seen = new Set<number>();
  for (const t of treatments) {
    if (t.kind === "state") continue;
    if (!ALL_TOOTH_IDS.includes(t.tooth as ToothId)) continue;
    if (seen.has(t.tooth)) continue; // on garde le plus récent (liste triée desc)
    next[t.tooth as ToothId] = protocolCategoryToToothStatus(t.category);
    seen.add(t.tooth);
  }
  return next;
}

function formatClinicalDateFr(rawIso: string): string {
  const d = new Date(rawIso);
  if (Number.isNaN(d.getTime())) return rawIso;
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function toggleFace(list: ToothFace[], face: ToothFace): ToothFace[] {
  return list.includes(face) ? list.filter((f) => f !== face) : [...list, face];
}

function upsertToothStateRow(
  rows: PatientTreatmentRow[],
  tooth: number,
  patch: Partial<PatientTreatmentRow>,
): PatientTreatmentRow[] {
  const idx = rows.findIndex((r) => r.kind === "state" && r.tooth === tooth);
  const base: PatientTreatmentRow =
    idx >= 0
      ? rows[idx]!
      : {
          tooth,
          kind: "state",
          category: "__state__",
          acte: "__state__",
          date: new Date().toISOString(),
          mobilite: "stable",
          sensibilite: ["aucune"],
          vitalite: "incertaine",
          controle_prevu: null,
          prochaine_etape: null,
          seances_notes: [],
        };
  const nextRow: PatientTreatmentRow = {
    ...base,
    ...patch,
    kind: "state",
    category: "__state__",
    acte: "__state__",
    tooth,
  };
  if (idx >= 0) {
    return rows.map((r, i) => (i === idx ? nextRow : r));
  }
  return [...rows, nextRow];
}

function getToothState(rows: PatientTreatmentRow[], tooth: number): PatientTreatmentRow | null {
  return rows.find((r) => r.kind === "state" && r.tooth === tooth) ?? null;
}

function ToothFacesPicker({
  value,
  onChange,
  ariaLabel,
}: {
  value: ToothFace[];
  onChange: (next: ToothFace[]) => void;
  ariaLabel: string;
}) {
  const cellBase =
    "flex h-6 w-6 items-center justify-center rounded-md border text-[10px] font-semibold transition-colors";
  const active =
    "border-[var(--ds-primary)] bg-[var(--ds-primary)] text-white";
  const idle =
    "border-[var(--ds-primary-border)] bg-[var(--ds-bg)] text-[var(--ds-text-muted)] hover:bg-[var(--ds-primary-soft)]";

  const Cell = ({ face }: { face: ToothFace }) => {
    const isOn = value.includes(face);
    return (
      <button
        type="button"
        aria-pressed={isOn}
        onClick={() => onChange(toggleFace(value, face))}
        className={[cellBase, isOn ? active : idle].join(" ")}
      >
        {face}
      </button>
    );
  };

  return (
    <div className="flex justify-center">
      <div
        className="grid h-[80px] w-[80px] grid-cols-3 grid-rows-3 gap-1"
        role="group"
        aria-label={ariaLabel}
      >
        <div />
        <Cell face="V" />
        <div />
        <Cell face="M" />
        <Cell face="O" />
        <Cell face="D" />
        <div />
        <Cell face="L" />
        <div />
      </div>
    </div>
  );
}

function pillBase(active: boolean) {
  return [
    "rounded-[var(--radius-md)] px-3 py-1.5 text-xs font-medium transition-colors border",
    active
      ? "text-white font-semibold"
      : "border-[var(--ds-primary-border)] bg-transparent text-[var(--ds-text-muted)] hover:bg-[var(--ds-primary-soft)]",
  ].join(" ");
}

function MobilitePills({
  value,
  onChange,
}: {
  value: MobiliteGrade;
  onChange: (next: MobiliteGrade) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        type="button"
        onClick={() => onChange("stable")}
        className={[
          pillBase(value === "stable"),
          value === "stable" ? "border-emerald-500 bg-[#10b981]" : "",
        ].join(" ")}
      >
        Stable
      </button>
      <button
        type="button"
        onClick={() => onChange("mobile")}
        className={[
          pillBase(value === "mobile"),
          value === "mobile" ? "border-amber-500 bg-[#f59e0b]" : "",
        ].join(" ")}
      >
        Mobile
      </button>
      <button
        type="button"
        onClick={() => onChange("tres_mobile")}
        className={[
          pillBase(value === "tres_mobile"),
          value === "tres_mobile" ? "border-red-500 bg-[#ef4444]" : "",
        ].join(" ")}
      >
        Très mobile
      </button>
    </div>
  );
}

function SensibilitePills({
  value,
  onChange,
}: {
  value: SensibiliteKind[];
  onChange: (next: SensibiliteKind[]) => void;
}) {
  const has = (k: SensibiliteKind) => value.includes(k);
  const toggle = (k: SensibiliteKind) => {
    if (k === "aucune") return ["aucune"] as SensibiliteKind[];
    const withoutAucune = value.filter((x) => x !== "aucune");
    const next = withoutAucune.includes(k)
      ? withoutAucune.filter((x) => x !== k)
      : [...withoutAucune, k];
    return next.length ? next : (["aucune"] as SensibiliteKind[]);
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        type="button"
        onClick={() => onChange(toggle("aucune"))}
        className={[
          pillBase(has("aucune")),
          has("aucune") ? "border-slate-400 bg-slate-400" : "",
        ].join(" ")}
      >
        Aucune
      </button>
      <button
        type="button"
        onClick={() => onChange(toggle("froid"))}
        className={[
          pillBase(has("froid")),
          has("froid") ? "border-cyan-500 bg-[#06b6d4]" : "",
        ].join(" ")}
      >
        Froid
      </button>
      <button
        type="button"
        onClick={() => onChange(toggle("chaud"))}
        className={[
          pillBase(has("chaud")),
          has("chaud") ? "border-orange-500 bg-[#f97316]" : "",
        ].join(" ")}
      >
        Chaud
      </button>
      <button
        type="button"
        onClick={() => onChange(toggle("percussion"))}
        className={[
          pillBase(has("percussion")),
          has("percussion") ? "border-red-500 bg-[#ef4444]" : "",
        ].join(" ")}
      >
        Percussion
      </button>
    </div>
  );
}

function VitalitePills({
  value,
  onChange,
}: {
  value: VitaliteKind;
  onChange: (next: VitaliteKind) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        type="button"
        onClick={() => onChange("vivante")}
        className={[
          pillBase(value === "vivante"),
          value === "vivante" ? "border-emerald-500 bg-[#10b981]" : "",
        ].join(" ")}
      >
        Vivante
      </button>
      <button
        type="button"
        onClick={() => onChange("depulpee")}
        className={[
          pillBase(value === "depulpee"),
          value === "depulpee"
            ? "border-[var(--ds-primary-border)] bg-[var(--ds-text-muted)]"
            : "",
        ].join(" ")}
      >
        Dépulpée
      </button>
      <button
        type="button"
        onClick={() => onChange("incertaine")}
        className={[
          pillBase(value === "incertaine"),
          value === "incertaine" ? "border-amber-500 bg-[#f59e0b]" : "",
        ].join(" ")}
      >
        Incertaine
      </button>
    </div>
  );
}

function normalizeCockpitTabFromToothStatus(s: ToothStatus | undefined): CockpitTab {
  if (s === "chirurgie") return "Chirurgie";
  if (s === "couronne") return "Prothèse";
  if (s === "carie") return "Soins";
  return "Saine";
}

function protocolOptionsForTab(
  protocols: ProtocolForSettings[],
  tab: CockpitTab,
): ProtocolForSettings[] {
  const endoNames = new Set<string>([
    "Traitement canalaire (monoradiculé)",
    "Traitement canalaire (pluriradiculé)",
    "Reprise de traitement canalaire",
    "Pulpotomie",
    "Pulpectomie",
    "Coiffe pulpaire directe",
    "Coiffe pulpaire indirecte",
  ]);
  if (tab === "Endodontie") {
    return protocols.filter((p) => endoNames.has(p.nom));
  }
  if (tab === "Soins") return protocols.filter((p) => p.categorie === "Soins");
  if (tab === "Chirurgie")
    return protocols.filter((p) => p.categorie === "Chirurgie");
  if (tab === "Prothèse")
    return protocols.filter((p) => p.categorie === "Prothèse");
  return protocols;
}

/** Acte sans entrée catalogue : id stable côté UI, résolu en UUID DB sur le serveur. */
function cockpitTabToVirtualProtocol(tab: CockpitTab): ProtocolForSettings {
  const categorie: string =
    tab === "Saine"
      ? "Saine"
      : tab === "Soins"
        ? "Soins"
        : tab === "Endodontie"
          ? "Endodontie"
          : tab === "Prothèse"
            ? "Prothèse"
            : tab === "Chirurgie"
              ? "Chirurgie"
              : "Soins";
  return {
    id: `cockpit:virtual:${tab}`,
    nom: `Soin — ${tab}`,
    categorie,
    consommables: [],
  };
}

const MOCK_ALL_TREATMENTS: PatientTreatmentRow[] = [
  {
    tooth: 21,
    kind: "act",
    category: "Chirurgie",
    acte: "Extraction simple",
    date: "2026-03-21T09:00:00Z",
    notes:
      "Extraction sous AL (Articaïne 4%). Détorsion/luxation contrôlées. Alvéole nettoyée, saignement maîtrisé. Pansement mis en place + consignes post-opératoires remises.",
    lt: "",
    praticien: "Dr. Cabinet",
    material: "Autre",
    faces: ["O"],
    montant: 4500,
  },
  {
    tooth: 16,
    kind: "act",
    category: "Soins",
    acte: "Composite 2 faces",
    date: "2026-03-17T10:00:00Z",
    notes:
      "Mise en place de digue. Préparation et conditionnement de la cavité. Insertion composite, finition/polissage. Contrôle de l'occlusion.",
    lt: "",
    praticien: "Dr. Cabinet",
    material: "Composite",
    faces: ["O", "M"],
    montant: 3500,
  },
  {
    tooth: 15,
    kind: "act",
    category: "Soins",
    acte: "Traitement canalaire (Prémolaire)",
    date: "2026-03-15T10:00:00Z",
    notes:
      "Accès canalaire, mise en forme, irrigation et obturation provisoire. Contrôle radiographique de la longueur de travail.",
    lt: "18.5",
    praticien: "Dr. Cabinet",
    material: "IRM",
    faces: ["O"],
    montant: 9000,
  },
  {
    tooth: 35,
    kind: "act",
    category: "Orthopédie",
    acte: "Gouttière occlusale",
    date: "2026-03-10T10:00:00Z",
    notes:
      "Empreinte et conception. Ajustement initial sur articulateur. Conseils d'utilisation et rappel pour re-évaluation à J+10.",
    lt: "",
    praticien: "Dr. Cabinet",
    material: "Résine",
    faces: ["O"],
    montant: 12000,
  },
];

type FinanceStatut = "Payé" | "Partiellement Payé" | "En attente";

function financeStatutFromReste(
  montantTotal: number,
  resteACharge: number,
): FinanceStatut {
  if (resteACharge <= 0) return "Payé";
  if (resteACharge < montantTotal) return "Partiellement Payé";
  return "En attente";
}

function PatientDocumentThumbnail({ doc }: { doc: PatientDocument }) {
  const isImagerie =
    doc.type === "image" ||
    doc.type === "cbct" ||
    doc.nom.toLowerCase().includes("cbct");

  // Image ou CBCT avec URL réelle → aperçu photo
  if (isImagerie && doc.url) {
    return <img src={doc.url} alt="" className="h-full w-full object-cover" />;
  }

  // Image / CBCT sans URL → fond bleu + icône imagerie
  if (isImagerie) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-blue-50">
        <ImageIcon className="h-10 w-10 text-blue-400" aria-hidden />
        <span className="text-[10px] font-medium uppercase tracking-wide text-blue-400">
          Imagerie
        </span>
      </div>
    );
  }

  // PDF → fond blanc + icône rouge
  if (doc.type === "pdf") {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 border border-[var(--ds-primary-border)] bg-white">
        <FileText className="h-10 w-10 text-red-400" aria-hidden />
        <span className="text-[10px] font-medium uppercase tracking-wide text-red-400">
          PDF
        </span>
      </div>
    );
  }

  // Autre type avec URL prévisualisable
  if (doc.url) {
    return <img src={doc.url} alt="" className="h-full w-full object-cover" />;
  }

  // Fallback générique → fond slate + icône File
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-slate-50">
      <File className="h-10 w-10 text-slate-400" aria-hidden />
      <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
        Fichier
      </span>
    </div>
  );
}

export default function PatientDetailPage() {
  const capitalize = (s: string) =>
    s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : "";
  const params = useParams();
  const router = useRouter();
  const id = (params?.id as string) ?? "";
  const [isMounted, setIsMounted] = useState(false);
  const [isEditPatientModalOpen, setIsEditPatientModalOpen] = useState(false);
  const [patientProfile, setPatientProfile] = useState<PatientProfile>({
    id,
    nom: `Patient #${id}`,
    age: 0,
    genre: "—",
    profession: "—",
    adresse: "—",
    telephone: "—",
    telephoneSecondaire: "",
    email: "—",
    dateNaissance: "",
    groupeSanguin: "",
    mutuelle: "",
    premiereVisite: "",
    statut: "actif",
    alerts: [],
  });
  const [patientRecord, setPatientRecord] = useState<DentalPatientRecord | null>(
    null,
  );
  const [appointmentsTick, setAppointmentsTick] = useState(0);
  const [patientAppointments, setPatientAppointments] = useState<
    AppointmentRdv[]
  >([]);
  const [editPatientName, setEditPatientName] = useState("");
  const [editPatientGender, setEditPatientGender] = useState("");
  const [editPatientProfession, setEditPatientProfession] = useState("");
  const [editPatientAddress, setEditPatientAddress] = useState("");
  const [editPatientPhone, setEditPatientPhone] = useState("");
  const [editPatientPhoneSecond, setEditPatientPhoneSecond] = useState("");
  const [editPatientEmail, setEditPatientEmail] = useState("");
  const [editPatientDob, setEditPatientDob] = useState("");
  const [editPatientGroupeSanguin, setEditPatientGroupeSanguin] = useState("");
  const [editPatientMutuelle, setEditPatientMutuelle] = useState("");
  const [editPatientPremiereVisite, setEditPatientPremiereVisite] = useState("");
  const [editAlertInput, setEditAlertInput] = useState("");
  const [editAlertLevel, setEditAlertLevel] =
    useState<PatientAlertLevel>("warning");
  const [editAlertsDraft, setEditAlertsDraft] = useState<PatientAlertItem[]>(
    [],
  );
  const [editPatientStatut, setEditPatientStatut] = useState<
    "actif" | "inactif"
  >("actif");

  const [tab, setTab] = useState<TabId>("historique");
  const [isPrescriptionModalOpen, setIsPrescriptionModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);

  const [patientDocuments, setPatientDocuments] = useState<PatientDocument[]>(
    [],
  );
  const [docFilter, setDocFilter] = useState<
    "tout" | "imagerie" | "documents"
  >("tout");
  const [lightboxDocument, setLightboxDocument] =
    useState<PatientDocument | null>(null);
  const [radiosDragOver, setRadiosDragOver] = useState(false);
  const radiosFileInputRef = useRef<HTMLInputElement>(null);
  const [documentPendingDelete, setDocumentPendingDelete] =
    useState<PatientDocument | null>(null);

  type FinanceLine = {
    id: string;
    acteName: string;
    date: string; // ISO 8601
    montantTotal: number;
    resteACharge: number;
    statut: FinanceStatut;
    /** Référence optionnelle vers `dental_catalog_acts` (traçabilité tarif). */
    catalogActId?: string;
  };

  const [finances, setFinances] = useState<FinanceLine[]>([]);

  const [financesPgTick, setFinancesPgTick] = useState(0);
  const [clinicalStockLines, setClinicalStockLines] = useState<StockLine[]>(
    [],
  );
  const [stockReloadTick, setStockReloadTick] = useState(0);

  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);
  const [editingFinance, setEditingFinance] = useState<FinanceLine | null>(
    null
  );

  const [editDate, setEditDate] = useState<string>("");
  const [editActeName, setEditActeName] = useState<string>("");
  const [editMontantTotal, setEditMontantTotal] = useState<string>("");
  const [editResteAPayer, setEditResteAPayer] = useState<string>("");
  const [editCatalogActId, setEditCatalogActId] = useState<string>("");
  const [catalogActsForEdit, setCatalogActsForEdit] = useState<
    DentalCatalogAct[]
  >([]);

  // Formulaires modals — facturation liée au catalogue d'actes
  const [quoteCatalogActId, setQuoteCatalogActId] = useState<string>("");
  const [quoteCatalogActs, setQuoteCatalogActs] = useState<DentalCatalogAct[]>(
    [],
  );
  const [quoteComboKey, setQuoteComboKey] = useState(0);
  const [quoteMontantTotal, setQuoteMontantTotal] = useState<string>("");
  const [quoteDate, setQuoteDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10),
  );

  const [paymentLineId, setPaymentLineId] = useState<string>("");
  const [paymentMontant, setPaymentMontant] = useState<string>("");

  // État contrôlé du schéma dentaire
  const [dentsStatus, setDentsStatus] = useState<Record<ToothId, ToothStatus>>(
    () =>
      Object.fromEntries(
        ALL_TOOTH_IDS.map((id) => [id, "healthy" as ToothStatus])
      ) as Record<ToothId, ToothStatus>
  );

  // Onglet cockpit (Saine/Soins/Endodontie/Prothèse/Chirurgie)
  const [cockpitTab, setCockpitTab] = useState<CockpitTab>("Saine");

  const [allTreatments, setAllTreatments] = useState<PatientTreatmentRow[]>(
    [],
  );
  const [watchedTeeth, setWatchedTeeth] = useState<Set<number>>(
    () => new Set(),
  );

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!id || !isMounted) return;
    let cancelled = false;
    void (async () => {
      const res = await getAppointmentsByPatientAction(id);
      if (cancelled || !res.ok) return;
      setPatientAppointments(res.data.map(appointmentJoinedRowToRdv));
    })();
    return () => {
      cancelled = true;
    };
  }, [id, isMounted, appointmentsTick]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onUp = () => setAppointmentsTick((t) => t + 1);
    window.addEventListener(APPOINTMENTS_UPDATED_EVENT, onUp);
    return () =>
      window.removeEventListener(APPOINTMENTS_UPDATED_EVENT, onUp);
  }, []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void (async () => {
      let r = await getPatientByIdAction(id);
      if (cancelled) return;
      if (r.ok && r.data) {
        setPatientRecord(patientRowToDentalPatientRecord(r.data));
        return;
      }
      if (typeof window !== "undefined") {
        let createdFromProfile = false;
        const uiBootstrap = await getPatientUiStateAction(id);
        if (uiBootstrap.ok && uiBootstrap.data.profile) {
          const pr = uiBootstrap.data.profile as Record<string, unknown>;
          const nomRaw = typeof pr.nom === "string" ? pr.nom : null;
          if (nomRaw) {
            const { prenom, nom } = splitNomComplet(nomRaw);
            const tel =
              typeof pr.telephone === "string" ? pr.telephone : "—";
            await createPatientAction({
              id,
              prenom: prenom || nomRaw.trim(),
              nom: nom || "",
              telephone: tel,
            });
            createdFromProfile = true;
          }
        }
        if (!createdFromProfile) {
          const rawProfile = localStorage.getItem(`patient_profile_${id}`);
          if (rawProfile) {
            try {
              const p = JSON.parse(rawProfile) as {
                nom?: string;
                telephone?: string;
              };
              if (typeof p.nom === "string") {
                const { prenom, nom } = splitNomComplet(p.nom);
                await createPatientAction({
                  id,
                  prenom: prenom || p.nom.trim(),
                  nom: nom || "",
                  telephone:
                    typeof p.telephone === "string" ? p.telephone : "—",
                });
              }
            } catch {
              /* ignore */
            }
          } else {
            const mock = MOCK_PROFILES[id];
            if (mock) {
              const { prenom, nom } = splitNomComplet(mock.nom);
              await createPatientAction({
                id,
                prenom: prenom || mock.nom.trim(),
                nom: nom || "",
                telephone: mock.telephone,
              });
            }
          }
        }
      }
      if (cancelled) return;
      r = await getPatientByIdAction(id);
      if (cancelled) return;
      if (r.ok && r.data) {
        setPatientRecord(patientRowToDentalPatientRecord(r.data));
      } else {
        setPatientRecord(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    const fallbackProfile: PatientProfile = MOCK_PROFILES[id] ?? {
      id,
      nom: `Patient #${id}`,
      age: 0,
      genre: "—",
      profession: "—",
      adresse: "—",
      telephone: "—",
      telephoneSecondaire: "",
      email: "—",
      dateNaissance: "",
      groupeSanguin: "",
      mutuelle: "",
      premiereVisite: "",
      statut: "actif",
      alerts: [],
    };

    void (async () => {
      const uiRes = await getPatientUiStateAction(id);
      if (cancelled) return;

      let profileRaw: Partial<PatientProfile> | null = null;
      if (
        uiRes.ok &&
        uiRes.data.profile &&
        typeof uiRes.data.profile === "object"
      ) {
        profileRaw = uiRes.data.profile as Partial<PatientProfile>;
      }
      if (!profileRaw && typeof window !== "undefined") {
        const raw = localStorage.getItem(`patient_profile_${id}`);
        if (raw) {
          try {
            profileRaw = JSON.parse(raw) as Partial<PatientProfile>;
            await mergePatientUiStateAction(id, { profile: profileRaw });
            localStorage.removeItem(`patient_profile_${id}`);
          } catch {
            profileRaw = null;
          }
        }
      }
      if (profileRaw) {
        const merged: PatientProfile = {
          ...fallbackProfile,
          ...profileRaw,
          id,
        };
        merged.alerts = normalizePatientAlerts(
          profileRaw.alerts ?? fallbackProfile.alerts,
        );
        merged.statut =
          profileRaw.statut === "inactif" ? "inactif" : "actif";
        setPatientProfile(merged);
      } else {
        setPatientProfile(fallbackProfile);
      }

      let acts: PatientTreatmentRow[] | undefined;
      if (uiRes.ok && Array.isArray(uiRes.data.acts)) {
        acts = uiRes.data.acts as PatientTreatmentRow[];
      } else if (typeof window !== "undefined") {
        const rawActs = localStorage.getItem(`patient_acts_${id}`);
        if (rawActs) {
          try {
            acts = JSON.parse(rawActs) as PatientTreatmentRow[];
            await mergePatientUiStateAction(id, { acts });
            localStorage.removeItem(`patient_acts_${id}`);
          } catch {
            acts = undefined;
          }
        }
      }
      if (acts !== undefined) {
        setAllTreatments(acts);
      } else {
        setAllTreatments(MOCK_ALL_TREATMENTS);
      }

      let watchedArr: number[] | null = null;
      if (uiRes.ok && Array.isArray(uiRes.data.watched_teeth)) {
        watchedArr = uiRes.data.watched_teeth as number[];
      } else if (typeof window !== "undefined") {
        const rawW = localStorage.getItem(`oryx_watched_${id}`);
        if (rawW) {
          try {
            watchedArr = JSON.parse(rawW) as number[];
            await mergePatientUiStateAction(id, {
              watched_teeth: watchedArr,
            });
            localStorage.removeItem(`oryx_watched_${id}`);
          } catch {
            watchedArr = null;
          }
        }
      }
      setWatchedTeeth(watchedArr ? new Set(watchedArr) : new Set());
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!isMounted || typeof window === "undefined") return;
    let cancelled = false;
    void (async () => {
      const res = await getStocksAction();
      if (cancelled || !res.ok) return;
      setClinicalStockLines(res.data.map(stockRowToStockLine));
    })();
    return () => {
      cancelled = true;
    };
  }, [isMounted, stockReloadTick]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStock = () => setStockReloadTick((t) => t + 1);
    window.addEventListener(STOCK_UPDATED_EVENT, onStock);
    return () => window.removeEventListener(STOCK_UPDATED_EVENT, onStock);
  }, []);

  useEffect(() => {
    if (!id || !isMounted) return;
    let cancelled = false;
    void (async () => {
      const res = await getFacturesByPatientAction(id);
      if (cancelled) return;
      if (!res.ok) {
        console.error(res.error);
        setFinances([]);
        return;
      }

      function joinedRowToFinanceLine(
        r: FactureRowJoined,
      ): FinanceLine | null {
        const lineId = extractFinanceLineIdFromActes(r.actes);
        if (!lineId) return null;
        const act = r.actes as {
          acteName?: unknown;
          catalogActId?: unknown;
        };
        const mt = Number.parseFloat(String(r.montant ?? "0")) || 0;
        const paye =
          Number.parseFloat(String(r.montant_paye ?? "0")) || 0;
        const reste = Math.max(0, mt - paye);
        return {
          id: lineId,
          acteName:
            typeof act.acteName === "string" ? act.acteName : "Acte",
          catalogActId:
            typeof act.catalogActId === "string"
              ? act.catalogActId
              : undefined,
          date: `${r.date}T12:00:00.000Z`,
          montantTotal: mt,
          resteACharge: reste,
          statut: financeStatutFromReste(mt, reste),
        };
      }

      const lines = res.data
        .map(joinedRowToFinanceLine)
        .filter((l): l is FinanceLine => l != null)
        .sort(
          (a, b) =>
            new Date(b.date).getTime() - new Date(a.date).getTime(),
        );
      setFinances(lines);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, isMounted, financesPgTick]);

  useEffect(() => {
    if (typeof window === "undefined" || !id) return;
    const onFactures = () => setFinancesPgTick((t) => t + 1);
    window.addEventListener(FACTURES_UPDATED_EVENT, onFactures);
    return () =>
      window.removeEventListener(FACTURES_UPDATED_EVENT, onFactures);
  }, [id]);

  useEffect(() => {
    if (!isMounted || !id || allTreatments.length === 0) return;
    void mergePatientUiStateAction(id, { acts: allTreatments });
  }, [allTreatments, isMounted, id]);

  useEffect(() => {
    if (!isQuoteModalOpen || typeof window === "undefined") return;
    ensureCatalogSeeded();
    setQuoteCatalogActs(readCatalogFromStorage());
    setQuoteComboKey((k) => k + 1);
  }, [isQuoteModalOpen]);

  useEffect(() => {
    if (!editingFinance || typeof window === "undefined") return;
    ensureCatalogSeeded();
    setCatalogActsForEdit(readCatalogFromStorage());
    setEditCatalogActId(editingFinance.catalogActId ?? "");
  }, [editingFinance]);

  const treatmentsActsKey = useMemo(() => {
    return allTreatments
      .filter((t) => t.kind !== "state")
      .map((t) => `${t.tooth}:${t.category}:${t.acte}:${t.date}`)
      .join("|");
  }, [allTreatments]);

  useEffect(() => {
    // IMPORTANT: ne pas reseter l’onglet cockpit lors des changements d’état clinique.
    // On recalcule le statut dentaire UNIQUEMENT quand la liste des **actes** change
    // (`treatmentsActsKey`), pas à chaque mutation de `allTreatments` (ex. mobilité /
    // sensibilité en `kind:"state"`), sinon les onglets cockpit qui appellent
    // `setDentsStatus` sont immédiatement écrasés et l’odontogramme ne « réagit » pas.
    setDentsStatus(buildDentsStatusFromTreatments(allTreatments));
    // `allTreatments` volontairement omis : le recalcul ne doit pas suivre les seules
    // lignes d’état clinique (`kind:"state"`), sinon l’effet écrase `setDentsStatus` du cockpit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treatmentsActsKey]);

  // Slide-over Cockpit — protocoles (20) + ajustement consommables
  const [selectedTooth, setSelectedTooth] = useState<number | null>(null);
  const [clinicalProtocolsList, setClinicalProtocolsList] = useState<
    ProtocolForSettings[]
  >([]);
  const [drawerProtocolId, setDrawerProtocolId] = useState<string>("");
  const [drawerMontant, setDrawerMontant] = useState<string>("");
  const [qtyByConsumableId, setQtyByConsumableId] = useState<
    Record<string, number>
  >({});
  const [toothNotes, setToothNotes] = useState("");
  const [mobilite, setMobilite] = useState<MobiliteGrade>("stable");
  const [sensibilite, setSensibilite] = useState<SensibiliteKind[]>(["aucune"]);
  const [vitalite, setVitalite] = useState<VitaliteKind>("incertaine");
  const [controlePrevu, setControlePrevu] = useState<string>("");
  const [prochaineEtape, setProchaineEtape] = useState<string>("");
  const [seancesNotes, setSeancesNotes] = useState<ClinicalSessionNote[]>([]);
  const [newSeanceNote, setNewSeanceNote] = useState("");

  const [actMaterial, setActMaterial] = useState<string>("");
  const [actFaces, setActFaces] = useState<ToothFace[]>([]);
  const [actPraticien, setActPraticien] = useState<string>("");

  // Champs spécifiques Endodontie
  const [endoCanaux, setEndoCanaux] = useState<string>("1");
  const [endoLt, setEndoLt] = useState<string>("");
  const [endoObturation, setEndoObturation] = useState<string>("Gutta-percha");

  const cockpitProtocolOptions = useMemo(() => {
    return protocolOptionsForTab(clinicalProtocolsList, cockpitTab);
  }, [clinicalProtocolsList, cockpitTab]);
  const [confirmAbsent, setConfirmAbsent] = useState<number | null>(null);
  const [validateSoinLoading, setValidateSoinLoading] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error" | "warning";
    message: string;
  } | null>(null);

  const [treatmentPlan, setTreatmentPlan] = useState<
    {
      id: string;
      label: string;
      acte: string;
      cout: number;
      done: boolean;
    }[]
  >([]);
  const [newSeanceLabel, setNewSeanceLabel] = useState("");
  const [newSeanceActe, setNewSeanceActe] = useState("");
  const [newSeanceCout, setNewSeanceCout] = useState("");

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const handleConfirmDeletePatient = useCallback(() => {
    if (!id) return;
    void (async () => {
      const del = await deletePatientAction(id);
      if (!del.ok) {
        console.error(del.error);
        return;
      }
      try {
        await deletePatientUiStateAction(id);
        clearPatientDocuments(id);
        clearPatientRadios(id);
      } catch {
        /* ignore */
      }
      setDeleteConfirmOpen(false);
      router.push("/patients");
    })();
  }, [id, router]);

  useEffect(() => {
    if (!isMounted || !id) return;
    setPatientDocuments(ensurePatientDocumentsForPatient(id));
  }, [isMounted, id]);

  useEffect(() => {
    if (!lightboxDocument) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLightboxDocument(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxDocument]);

  useEffect(() => {
    if (!isEditPatientModalOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setIsEditPatientModalOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isEditPatientModalOpen]);

  const handleRadiosFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length || !id) return;
      for (const file of Array.from(files)) {
        try {
          const kind = inferDroppedFileKind(file);
          const url = await fileToDataUrl(file);
          addPatientDocument(id, {
            type: kind,
            nom: file.name,
            date: new Date().toISOString(),
            url,
            categorie: defaultCategoryForDropped(kind),
          });
        } catch (e) {
          alert(e instanceof Error ? e.message : "Import impossible.");
        }
      }
      setPatientDocuments(listDocumentsForPatient(id));
    },
    [id],
  );

  const filteredPatientDocuments = useMemo(() => {
    if (docFilter === "tout") return patientDocuments;
    if (docFilter === "imagerie") {
      return patientDocuments.filter((d) => d.categorie === "Imagerie");
    }
    return patientDocuments.filter((d) => d.categorie !== "Imagerie");
  }, [patientDocuments, docFilter]);

  const handleConfirmDeletePatientDocument = useCallback(() => {
    if (!id || !documentPendingDelete) return;
    const removedId = documentPendingDelete.id;
    removePatientDocument(id, removedId);
    setPatientDocuments(listDocumentsForPatient(id));
    setDocumentPendingDelete(null);
    setLightboxDocument((prev) => (prev?.id === removedId ? null : prev));
    setToast({ type: "success", message: "Document supprimé" });
  }, [id, documentPendingDelete]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storage = getCabinetProtocolsStorage();
    let list = loadProtocolsFromStorage(storage);
    if (!list || list.length === 0) {
      list = buildProtocolesFromSeed();
      saveProtocolsToStorage(storage, list);
    }
    setClinicalProtocolsList(list);
  }, []);

  useEffect(() => {
    if (selectedTooth !== null) return;
    setDrawerProtocolId("");
    setQtyByConsumableId({});
    setToothNotes("");
    setDrawerMontant("");
  }, [selectedTooth]);

  useEffect(() => {
    setConfirmAbsent(null);
  }, [selectedTooth]);

  useEffect(() => {
    if (!drawerProtocolId) {
      setQtyByConsumableId({});
      return;
    }
    const p = clinicalProtocolsList.find((x) => x.id === drawerProtocolId);
    if (!p) return;
    const next: Record<string, number> = {};
    for (const c of p.consommables) {
      next[c.id] = c.quantite;
    }
    setQtyByConsumableId(next);
  }, [drawerProtocolId, clinicalProtocolsList]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  /** Liste groupée par catégorie (filtrée par onglet) pour le `<select>` du cockpit. */
  const drawerProtocolsGrouped = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, ProtocolForSettings[]>();
    for (const p of cockpitProtocolOptions) {
      const cat = p.categorie.trim() || "Autres";
      if (!map.has(cat)) {
        map.set(cat, []);
        order.push(cat);
      }
      map.get(cat)!.push(p);
    }
    return order.map((category) => ({
      category,
      protocols: map.get(category)!,
    }));
  }, [cockpitProtocolOptions]);

  const resolvedName = useMemo(() => {
    const { prenom, nom } = resolvePatientDisplayParts(
      patientRecord,
      patientProfile,
    );
    const displayFullName =
      `${capitalize(prenom)} ${capitalize(nom)}`.trim() || "Patient";
    const appointmentFullName = `${prenom} ${nom}`.trim();
    return { prenom, nom, displayFullName, appointmentFullName };
  }, [patientRecord, patientProfile]);

  const displayFullName = resolvedName.displayFullName;

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.title =
      displayFullName && displayFullName !== "Patient"
        ? `${displayFullName} · DentiSmart`
        : `Fiche patient · DentiSmart`;
  }, [displayFullName]);

  function openEditPatientModal() {
    setEditPatientName(
      resolvedName.appointmentFullName.trim() || patientProfile.nom,
    );
    setEditPatientGender(patientProfile.genre);
    setEditPatientProfession(patientProfile.profession);
    setEditPatientAddress(patientProfile.adresse);
    setEditPatientPhone(patientProfile.telephone);
    setEditPatientPhoneSecond(patientProfile.telephoneSecondaire);
    setEditPatientEmail(patientProfile.email);
    setEditPatientDob(patientProfile.dateNaissance);
    setEditPatientGroupeSanguin(patientProfile.groupeSanguin);
    setEditPatientMutuelle(patientProfile.mutuelle);
    setEditPatientPremiereVisite(patientProfile.premiereVisite?.trim() ?? "");
    setEditAlertsDraft(
      normalizePatientAlerts(patientProfile.alerts ?? []),
    );
    setEditAlertInput("");
    setEditAlertLevel("warning");
    setEditPatientStatut(
      patientProfile.statut === "inactif" ? "inactif" : "actif",
    );
    setIsEditPatientModalOpen(true);
  }

  function handleUpdatePatient() {
    const nextProfile: PatientProfile = {
      ...patientProfile,
      nom: editPatientName.trim() || patientProfile.nom,
      genre: editPatientGender.trim() || "—",
      profession: editPatientProfession.trim() || "—",
      adresse: editPatientAddress.trim() || "—",
      telephone: editPatientPhone.trim() || "—",
      telephoneSecondaire: editPatientPhoneSecond.trim(),
      email: editPatientEmail.trim() || "—",
      dateNaissance: editPatientDob,
      groupeSanguin: editPatientGroupeSanguin.trim(),
      mutuelle: editPatientMutuelle.trim(),
      premiereVisite: editPatientPremiereVisite.trim(),
      age: editPatientDob ? computeAgeFromDateIso(editPatientDob) : patientProfile.age,
      alerts: editAlertsDraft.map((a) => ({
        label: a.label.trim(),
        level: a.level,
      })).filter((a) => a.label.length > 0),
      statut: editPatientStatut === "inactif" ? "inactif" : "actif",
    };
    setPatientProfile(nextProfile);
    void mergePatientUiStateAction(id, { profile: nextProfile });
    const { prenom, nom } = splitNomComplet(nextProfile.nom);
    const g = nextProfile.genre.trim();
    const sexe =
      g === "Femme" ? "F" : g === "Homme" ? "M" : g === "—" ? null : g || null;
    const antecedents =
      nextProfile.alerts.map((a) => a.label.trim()).filter(Boolean).join("; ") ||
      null;
    void (async () => {
      const res = await updatePatientAction(id, {
        prenom: prenom || nextProfile.nom.trim(),
        nom: nom || "",
        telephone: nextProfile.telephone.trim() || "—",
        email: nextProfile.email.trim() || null,
        date_naissance: nextProfile.dateNaissance.trim() || null,
        sexe,
        adresse: nextProfile.adresse.trim() || null,
        mutuelle: nextProfile.mutuelle.trim() || null,
        antecedents,
      });
      if (!res.ok) {
        console.error(res.error);
        return;
      }
      setPatientRecord(patientRowToDentalPatientRecord(res.data));
    })();
    setIsEditPatientModalOpen(false);
  }

  const selectedDrawerProtocol =
    drawerProtocolId !== ""
      ? cockpitProtocolOptions.find((p) => p.id === drawerProtocolId) ?? null
      : null;

  const totalFacture = finances.reduce((acc, f) => acc + f.montantTotal, 0);
  const totalResteACharge = finances.reduce(
    (acc, f) => acc + f.resteACharge,
    0
  );

  async function handleValidateClinicalAct() {
    if (selectedTooth === null) return;
    // Protocole catalogue optionnel : sans sélection, on enregistre un acte lié à l’onglet cockpit.
    const protocol =
      selectedDrawerProtocol ?? cockpitTabToVirtualProtocol(cockpitTab);
    const manualMoney = parseMoney(drawerMontant);
    const manualCents =
      manualMoney > 0 ? Math.max(0, Math.round(manualMoney * 100)) : null;
    const consumables: { stockProductId: string; quantity: number }[] = [];
    for (const c of protocol.consommables) {
      const qty = qtyByConsumableId[c.id] ?? c.quantite;
      if (qty <= 0) continue;
      const sid = consumableLabelToStockProductId(c.nom);
      consumables.push({ stockProductId: sid, quantity: qty });
    }
    const devHint = ACTES_PRIX_DEVIS[protocol.nom];
    const basePriceCentsForBackfill = Math.round(
      (typeof devHint === "number" ? devHint : 0) * 100,
    );
    const clientProtocol: ClientProtocolBackfill = {
      name: protocol.nom,
      category: protocol.categorie,
      basePriceCents:
        manualCents != null && manualCents > 0
          ? manualCents
          : basePriceCentsForBackfill,
    };
    const toothNum = selectedTooth;
    setValidateSoinLoading(true);
    try {
      const res = await submitClinicalActAction({
        patientId: id,
        protocolId: protocol.id,
        consumables,
        customPriceOverrideCents: manualCents,
        clientProtocol,
      });
      if (res.ok) {
        const stockPgWarnings = res.data.stockWarnings ?? [];
        // Sync stock local uniquement si le serveur a tout déstocké (sinon décalage avec déductions partielles / 0).
        if (stockPgWarnings.length === 0) {
          const protocolsMap = loadProtocols();
          const currentStock = clinicalStockLines;
          const nextStock = consumeStockForAct(
            protocol.nom,
            currentStock,
            protocolsMap,
          );
          for (const row of nextStock) {
            const prev = currentStock.find((p) => p.id === row.id);
            if (!prev || prev.quantite === row.quantite) continue;
            const up = await updateStockAction(row.id, {
              quantite: row.quantite,
            });
            if (!up.ok) console.error(up.error);
          }
          setClinicalStockLines(nextStock);
          notifyStockUpdated();
        }

        const kitDeduction = await tryMarkSterilizationKitSale(
          protocol.categorie,
        );
        let toastType: "success" | "error" | "warning" = kitDeduction.used
          ? "success"
          : "error";
        let toastMessage = kitDeduction.used
          ? `Acte enregistré avec succès. Kit ${kitDeduction.typeLabel} #${kitDeduction.numero} marqué comme sale.`
          : `Acte enregistré avec succès. Attention : Aucun kit ${kitDeduction.typeLabel} stérile disponible !`;
        if (stockPgWarnings.length > 0) {
          toastType = "warning";
          toastMessage = [toastMessage, ...stockPgWarnings].join(" ");
        }
        setToast({
          type: toastType,
          message: toastMessage,
        });
        setDentsStatus((prev) => ({
          ...prev,
          [toothNum as ToothId]:
            cockpitTab === "Saine"
              ? "healthy"
              : protocolCategoryToToothStatus(protocol.categorie),
        }));
        setAllTreatments((prev) => {
          const manualMontant = parseMoney(drawerMontant);
          const montantFinal =
            manualMontant > 0
              ? manualMontant
              : Math.round(res.data.amountCents / 100);

          const row: PatientTreatmentRow = {
            tooth: toothNum,
            kind: "act",
            category:
              cockpitTab === "Endodontie"
                ? "Endodontie"
                  : protocol.categorie,
            acte: protocol.nom,
            date: new Date().toISOString(),
            notes:
              cockpitTab === "Endodontie"
                ? [
                    toothNotes?.trim() ? toothNotes.trim() : null,
                    `Canaux: ${Math.min(4, Math.max(1, Number(endoCanaux) || 1))}`,
                    endoLt.trim() ? `LT: ${endoLt.trim()} mm` : null,
                    endoObturation.trim()
                      ? `Obturation: ${endoObturation.trim()}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || undefined
                  : toothNotes || undefined,
            material: actMaterial || undefined,
            faces: actFaces.length ? actFaces : undefined,
            montant: montantFinal > 0 ? montantFinal : undefined,
            praticien: actPraticien.trim() || undefined,
          };

          const withState = upsertToothStateRow(prev, toothNum, {
            mobilite,
            sensibilite,
            vitalite,
            prochaine_etape: prochaineEtape.trim()
              ? prochaineEtape.trim()
              : null,
            controle_prevu: controlePrevu.trim() ? controlePrevu.trim() : null,
            seances_notes: seancesNotes,
          });

          return [row, ...withState];
        });
        await updatePatientAction(id, {});
        const manualMontant = parseMoney(drawerMontant);
        const montantFinal =
          manualMontant > 0
            ? manualMontant
            : Math.round(res.data.amountCents / 100);
        // Création automatique de la ligne finance
        const autoFinanceLine: FinanceLine = {
          id: res.data.invoiceLineId,
          acteName: protocol.nom,
          date: new Date().toISOString(),
          montantTotal: montantFinal,
          resteACharge: montantFinal,
          statut: "En attente",
          catalogActId: protocol.id,
        };
        setFinances((prev) => {
          const exists = prev.some((f) => f.id === autoFinanceLine.id);
          if (exists) return prev;
          return [autoFinanceLine, ...prev];
        });
        upsertGlobalFactureFromFinanceLine(autoFinanceLine, {
          toastOnCreate: true,
        });
        setDrawerMontant("");
        setSelectedTooth(null);
      } else {
        setToast({ type: "error", message: res.error });
      }
    } catch (e) {
      setToast({
        type: "error",
        message:
          e instanceof Error ? e.message : "Erreur inattendue lors de l’enregistrement du soin.",
      });
    } finally {
      setValidateSoinLoading(false);
    }
  }

  /** Synchronise la facture PostgreSQL liée à une ligne finance (fiche patient). */
  function upsertGlobalFactureFromFinanceLine(
    line: FinanceLine,
    opts?: { toastOnCreate?: boolean },
  ) {
    if (typeof window === "undefined" || !id) return;
    void (async () => {
      const listRes = await getFacturesByPatientAction(id);
      if (!listRes.ok) {
        console.error(listRes.error);
        return;
      }
      const paye = financeLineMontantPayeDb(
        line.montantTotal,
        line.resteACharge,
      );
      const pgDate = isoTimestampToFacturePgDate(line.date);
      const statut = montantsToStatutPostgreSQL(line.montantTotal, paye);
      const actes = {
        financeLineId: line.id,
        acteName: line.acteName,
        ...(line.catalogActId ? { catalogActId: line.catalogActId } : {}),
      };
      const matched = listRes.data.find(
        (r) => extractFinanceLineIdFromActes(r.actes) === line.id,
      );

      const patch = {
        patient_id: id,
        date: pgDate,
        montant: line.montantTotal,
        montant_paye: paye,
        // Spéc : facture auto en attente si non payée.
        statut: paye <= 0 ? "en_attente" : statut,
        actes,
      };

      if (matched) {
        const up = await updateFactureAction(matched.id, patch);
        if (!up.ok) console.error(up.error);
        else notifyFacturesUpdated();
      } else {
        const cr = await createFactureAction(patch);
        if (!cr.ok) console.error(cr.error);
        else {
          notifyFacturesUpdated();
          if (opts?.toastOnCreate) {
            // Laisse le toast "acte enregistré" vivre, puis affiche la confirmation facture.
            setTimeout(() => {
              setToast({ type: "success", message: "Facture créée automatiquement" });
            }, 800);
          }
        }
      }
    })();
  }

  function removeGlobalFactureByFinanceLineId(financeLineId: string) {
    if (typeof window === "undefined") return;
    void (async () => {
      const r = await deleteFactureByFinanceLineIdAction(financeLineId);
      if (!r.ok) console.error(r.error);
      else notifyFacturesUpdated();
    })();
  }

  // ── Construction des données de la fiche (palette Oryx + 2 colonnes) ───────

  const ficheAlertes = useMemo<PatientFicheAlerte[]>(() => {
    return (patientProfile.alerts ?? []).map((a, i) => {
      const low = a.label.toLowerCase();
      const isAllergy =
        low.includes("allergie") ||
        low.includes("pénicilline") ||
        low.includes("latex") ||
        low.includes("anaphyla");
      const isTreatment =
        low.includes("traitement") ||
        low.includes("médicament") ||
        low.includes("metformine");
      const severite: PatientFicheAlerte["severite"] =
        a.level === "danger" ? "danger" : "warning";
      const icon: PatientFicheAlerte["icon"] = isAllergy
        ? "allergy"
        : isTreatment
          ? "pill"
          : "warning";
      return {
        id: `${i}-${a.label}`,
        severite,
        titre: a.label,
        icon,
      };
    });
  }, [patientProfile.alerts]);

  const ficheStats = useMemo(() => {
    const total = finances.reduce((s, l) => s + l.montantTotal, 0);
    const consultations = allTreatments.length;
    let presence = "—";
    let presenceTooltip: string | undefined = undefined;
    if (isMounted) {
      const fullName = resolvedName.appointmentFullName;
      const mine = patientAppointments.filter(
        (a) =>
          (a.patientId && a.patientId === id) ||
          (a.patient ?? "").toLowerCase() === fullName.toLowerCase(),
      );
      const totalRdv = mine.length;
      if (totalRdv === 0) {
        presence = "—";
        presenceTooltip = "Aucun rendez-vous enregistré";
      } else {
        const honored = mine.filter((a) => a.status === "done").length;
        if (honored === 0) {
          presence = "0%";
          presenceTooltip = undefined;
        } else {
          const pct = Math.round((honored / totalRdv) * 100);
          presence = `${pct}%`;
          presenceTooltip = undefined;
        }
      }
    }
    return {
      consultations,
      presence,
      presenceTooltip,
      totalDA: new Intl.NumberFormat("fr-FR").format(total),
    };
  }, [
    finances,
    allTreatments,
    isMounted,
    id,
    resolvedName.appointmentFullName,
    appointmentsTick,
    patientAppointments,
  ]);

  const ficheProchainRdv = useMemo(() => {
    if (!isMounted) return undefined;
    const fullName = resolvedName.appointmentFullName;
    const mine = patientAppointments
      .filter(
        (a) =>
          (a.patientId && a.patientId === id) ||
          (a.patient ?? "").toLowerCase() === fullName.toLowerCase(),
      )
      .filter((a) => a.dateKey >= new Date().toISOString().slice(0, 10))
      .sort((a, b) =>
        a.dateKey === b.dateKey
          ? a.start.localeCompare(b.start)
          : a.dateKey.localeCompare(b.dateKey),
      );
    const next = mine[0];
    if (!next) return undefined;
    const d = new Date(next.dateKey + "T00:00:00");
    if (Number.isNaN(d.getTime())) return undefined;
    return {
      jour: String(d.getDate()).padStart(2, "0"),
      mois: d
        .toLocaleDateString("fr-FR", { month: "short" })
        .replace(".", "")
        .slice(0, 3),
      acte: next.soin || "Rendez-vous",
      detail: `${next.start} — ${next.durationMinutes} min`,
    };
  }, [
    isMounted,
    id,
    resolvedName.appointmentFullName,
    appointmentsTick,
    patientAppointments,
  ]);

  const ficheTimeline = useMemo<PatientFicheTimelineItem[]>(() => {
    type Entry = { row: PatientTreatmentRow; src: "acts" };
    const entries: Entry[] = allTreatments
      .filter((row) => row.kind !== "state")
      .map((row) => ({ row, src: "acts" }));
    const normalized: PatientFicheTimelineItem[] = entries.map((e, idx) => {
      const row = e.row;
      const cat = row.category as PatientFicheTimelineItem["categorie"];
      const allowed: PatientFicheTimelineItem["categorie"][] = [
        "Soins",
        "Chirurgie",
        "Orthopédie",
        "Endodontie",
        "Autres",
        "Absente",
      ];
      const catFinal: PatientFicheTimelineItem["categorie"] = allowed.includes(cat)
        ? cat
        : "Autres";
      const cout = ACTES_PRIX_DEVIS[row.acte];
      const fin = finances.find(
        (f) => f.acteName.toLowerCase() === row.acte.toLowerCase(),
      );
      const statut: PatientFicheTimelineItem["statut"] = fin
        ? fin.resteACharge <= 0
          ? "paye"
          : fin.resteACharge < fin.montantTotal
            ? "partiel"
            : "attente"
        : undefined;
      return {
        id: `acte-${row.tooth}-${idx}`,
        date: row.date,
        acteLabel: row.acte,
        note: row.notes,
        categorie: catFinal,
        praticien: undefined,
        montant: fin?.montantTotal ?? cout,
        statut,
        toothNumber: row.tooth,
        actor: row._audit
          ? {
              userId: row._audit.userId,
              displayName: row._audit.displayName,
              role: row._audit.role,
            }
          : undefined,
      };
    });
    normalized.sort((a, b) => (a.date > b.date ? -1 : 1));
    return normalized;
  }, [allTreatments, finances]);

  const ficheData: PatientFicheData = {
    patient: {
      id,
      prenom: capitalize(resolvedName.prenom ?? ""),
      nom: capitalize(resolvedName.nom ?? ""),
      genre: patientProfile.genre,
      age: patientProfile.age,
      dateNaissance: patientProfile.dateNaissance,
      profession: patientProfile.profession,
      adresse: patientProfile.adresse,
      telephone: patientProfile.telephone,
      telephoneSecondaire: patientProfile.telephoneSecondaire,
      email: patientProfile.email,
      groupeSanguin: patientProfile.groupeSanguin.trim() || undefined,
      mutuelle: patientProfile.mutuelle.trim() || undefined,
      premiereVisite:
        patientProfile.premiereVisite.trim() ||
        patientRecord?.createdAt ||
        undefined,
      derniereVisite: patientRecord?.derniereVisite,
      publicId: `ORX-${new Date().getFullYear()}-${String(id).slice(-4).padStart(4, "0").toUpperCase()}`,
    },
    statut: {
      actif: patientProfile.statut === "actif",
      label:
        patientProfile.statut === "actif"
          ? "Patient actif"
          : "Patient inactif",
    },
    alertes: ficheAlertes,
    stats: ficheStats,
    prochainRdv: ficheProchainRdv,
    dentsStatus,
    watchedTeeth,
    timeline: ficheTimeline,
  };

  const ficheHandlers = {
    onEditPatient: openEditPatientModal,
    onOpenOrdonnance: () => {
      setIsPrescriptionModalOpen(true);
    },
    onNewAppointment: () => {
      // Utiliser window.location pour forcer un rechargement complet de la page
      window.location.href = `/planning?patientId=${id}&patientName=${encodeURIComponent(displayFullName)}`;
    },
    onDeletePatient: () => setDeleteConfirmOpen(true),
    onToothClick: (tooth: ToothId) => {
      const existingTreatment = allTreatments.find(
        (t) => t.tooth === tooth && t.kind !== "state",
      );
      setSelectedTooth(tooth);
      setCockpitTab(normalizeCockpitTabFromToothStatus(dentsStatus[tooth]));
      const settings = getSettings();
      const praticienFromSettings =
        (typeof settings.praticien === "string" && settings.praticien.trim()) ||
        `${String(settings.praticienPrenom ?? "").trim()} ${String(settings.praticienNom ?? "").trim()}`.trim() ||
        "";

      const state = getToothState(allTreatments, tooth);
      setMobilite(state?.mobilite ?? "stable");
      setSensibilite(
        state?.sensibilite?.length ? state.sensibilite : ["aucune"],
      );
      setVitalite(state?.vitalite ?? "incertaine");
      setControlePrevu(state?.controle_prevu ?? "");
      setProchaineEtape(state?.prochaine_etape ?? "");
      setSeancesNotes(state?.seances_notes ?? []);

      if (existingTreatment) {
        setToothNotes(existingTreatment.notes || "");
        const match = clinicalProtocolsList.find(
          (p) => p.nom === existingTreatment.acte,
        );
        setDrawerProtocolId(match?.id ?? "");
        setActMaterial(existingTreatment.material ?? "");
        setActFaces(existingTreatment.faces ?? []);
        setActPraticien(existingTreatment.praticien ?? praticienFromSettings);
      } else {
        setToothNotes("");
        setDrawerProtocolId("");
        setActMaterial("");
        setActFaces([]);
        setActPraticien(praticienFromSettings);
      }

      // reset champs spécifiques (non persistés tant que non validés)
      setEndoCanaux("1");
      setEndoLt("");
      setEndoObturation("Gutta-percha");
    },
    onAddActe: () => {
      setToast({
        type: "success",
        message: "Cliquez sur une dent du schéma pour ajouter un acte.",
      });
    },
    onEditAlertes: openEditPatientModal,
  };

  return (
    <div className="min-h-screen bg-[var(--ds-bg)] p-6">
      <PatientFicheView
        data={ficheData}
        handlers={ficheHandlers}
        footer={<div className="flex flex-col gap-6">
        {/* Section détaillée : onglets (historique complet / radios / finances) */}
        <section className="w-full bg-[var(--ds-surface)] rounded-3xl p-6 shadow-sm border border-[var(--ds-primary-border)]">
          {/* Menu des onglets */}
          <div className="w-full overflow-x-auto">
            <div className="flex flex-row flex-nowrap overflow-x-auto gap-2 w-full scrollbar-hide whitespace-nowrap [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setTab("historique");
                }}
                className={[
                  "whitespace-nowrap flex-shrink-0 rounded-2xl px-3 py-2 text-sm font-medium transition-all",
                  tab === "historique"
                    ? "bg-[color:var(--ds-primary)] text-white shadow-sm"
                    : "text-[var(--ds-text-muted)] hover:text-[var(--ds-text)]",
                ].join(" ")}
              >
                Historique
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setTab("radios");
                }}
                className={[
                  "whitespace-nowrap flex-shrink-0 rounded-2xl px-3 py-2 text-sm font-medium transition-all",
                  tab === "radios"
                    ? "bg-[color:var(--ds-primary)] text-white shadow-sm"
                    : "text-[var(--ds-text-muted)] hover:text-[var(--ds-text)]",
                ].join(" ")}
              >
                Radios/Documents
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setTab("finances");
                }}
                className={[
                  "whitespace-nowrap flex-shrink-0 rounded-2xl px-3 py-2 text-sm font-medium transition-all",
                  tab === "finances"
                    ? "bg-[color:var(--ds-primary)] text-white shadow-sm"
                    : "text-[var(--ds-text-muted)] hover:text-[var(--ds-text)]",
                ].join(" ")}
              >
                Finances
              </button>
            </div>
          </div>

          <div className="mt-5">
            {tab === "historique" && (
              <div>
                <h2 className="text-base font-semibold tracking-tight text-[color:var(--ds-text)]">
                  Historique des soins
                </h2>
                <div className="mt-4">
                  <PatientSoinsTimeline items={ficheTimeline} />
                </div>
              </div>
            )}

            {tab === "radios" && (
              <section className="relative flex flex-col gap-6">
                <input
                  ref={radiosFileInputRef}
                  type="file"
                  accept="image/*,.pdf,application/pdf"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    handleRadiosFiles(e.target.files);
                    e.target.value = "";
                  }}
                />

                {/* En-tête de l'onglet */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h2 className="text-base font-semibold tracking-tight text-[color:var(--ds-text)]">
                    Imagerie &amp; Documents
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    <PrimaryButton
                      type="button"
                      onClick={() => radiosFileInputRef.current?.click()}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium shadow-sm"
                    >
                      <Plus className="h-4 w-4" />
                      Ajouter un document
                    </PrimaryButton>
                  </div>
                </div>

                {/* Zone Drag & Drop */}
                <div
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ")
                      radiosFileInputRef.current?.click();
                  }}
                  onClick={() => radiosFileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setRadiosDragOver(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setRadiosDragOver(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setRadiosDragOver(false);
                    handleRadiosFiles(e.dataTransfer.files);
                  }}
                  className={[
                    "flex cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed p-8 text-center transition-colors",
                    radiosDragOver
                      ? "border-[var(--ds-primary)] bg-[var(--ds-primary-border)]/70"
                      : "border-[var(--ds-primary-border)] bg-[var(--ds-primary-soft)]/50 hover:border-[var(--ds-primary-border)]",
                  ].join(" ")}
                >
                  <UploadCloud className="h-8 w-8 text-[var(--ds-primary)]" />
                  <div>
                    <p className="text-sm font-semibold text-[var(--ds-text)]">
                      Glissez la radio panoramique ici ou cliquez pour parcourir
                    </p>
                    <p className="mt-1 text-xs text-[var(--ds-text-muted)]">
                      ou fichiers PDF (max 10 Mo)
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      radiosFileInputRef.current?.click();
                    }}
                    className="inline-flex items-center justify-center rounded-2xl bg-[var(--ds-surface)] px-4 py-2.5 text-sm font-medium text-[var(--ds-text)] shadow-sm transition-colors hover:bg-[var(--ds-bg)]"
                  >
                    Parcourir
                  </button>
                </div>

                {/* Galerie des radios */}
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-[var(--ds-text-muted)]">
                    Derniers examens
                  </h3>
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {(
                      [
                        { id: "tout" as const, label: "Tout" },
                        { id: "imagerie" as const, label: "Imagerie" },
                        { id: "documents" as const, label: "Documents" },
                      ] as const
                    ).map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setDocFilter(f.id)}
                        className={[
                          "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                          docFilter === f.id
                            ? "bg-[var(--ds-primary)] text-white"
                            : "bg-[var(--ds-primary-soft)] text-[var(--ds-text-muted)] hover:bg-[var(--ds-primary-border)]/80 hover:text-[var(--ds-text)]",
                        ].join(" ")}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                  {filteredPatientDocuments.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-[var(--ds-primary-border)] bg-[var(--ds-bg)]/80 py-10 text-center text-sm text-[var(--ds-text-muted)]">
                      Aucun document dans cette vue.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                      {filteredPatientDocuments.map((doc) => (
                        <div
                          key={doc.id}
                          className="group/card flex flex-col gap-2"
                        >
                          <div className="relative aspect-video w-full">
                            <button
                              type="button"
                              onClick={() => setLightboxDocument(doc)}
                              className="group/view relative aspect-video w-full overflow-hidden rounded-lg bg-[var(--ds-primary-border)] text-left outline-none ring-[var(--ds-primary-border)] transition-shadow focus-visible:ring-2"
                            >
                              <PatientDocumentThumbnail doc={doc} />
                              <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 bg-slate-900/40 opacity-0 transition-opacity group-hover/view:pointer-events-auto group-hover/view:opacity-90 group-focus-visible/view:pointer-events-auto group-focus-visible/view:opacity-90">
                                <span className="pointer-events-auto inline-flex items-center gap-1.5 rounded-xl bg-[var(--ds-surface)] px-3 py-1.5 text-xs font-medium text-[var(--ds-text)] shadow">
                                  <Eye className="h-3.5 w-3.5" />
                                  Voir
                                </span>
                                {doc.url ? (
                                  <a
                                    href={doc.url}
                                    download={doc.nom}
                                    onClick={(e) => e.stopPropagation()}
                                    className="pointer-events-auto inline-flex items-center gap-1.5 rounded-xl bg-[var(--ds-surface)] px-3 py-1.5 text-xs font-medium text-[var(--ds-text)] shadow"
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                  </a>
                                ) : null}
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setDocumentPendingDelete(doc);
                              }}
                              className="absolute right-2 top-2 z-20 flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--ds-surface)]/80 text-red-600 opacity-0 shadow-sm backdrop-blur-sm transition-opacity hover:bg-[var(--ds-surface)] focus-visible:opacity-100 group-hover/card:opacity-100"
                              aria-label="Supprimer ce document"
                            >
                              <Trash2 className="h-4 w-4" strokeWidth={2} />
                            </button>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-[var(--ds-text)]">
                              {doc.nom}
                            </p>
                            <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--ds-text-muted)]">
                              {doc.categorie}
                            </p>
                            <p className="text-xs text-[var(--ds-text-muted)]">
                              {formatDate(doc.date)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {documentPendingDelete ? (
                  <div
                    className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="delete-doc-title"
                    onClick={() => setDocumentPendingDelete(null)}
                  >
                    <div
                      className="w-full max-w-sm rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-6 shadow-xl"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <h2
                        id="delete-doc-title"
                        className="text-lg font-semibold text-[var(--ds-text)]"
                      >
                        Supprimer ce document ?
                      </h2>
                      <p className="mt-2 line-clamp-2 text-sm text-[var(--ds-text-muted)]">
                        {documentPendingDelete.nom}
                      </p>
                      <div className="mt-6 flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setDocumentPendingDelete(null)}
                          className="rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-4 py-2 text-sm font-medium text-[var(--ds-text)] transition-colors hover:bg-[var(--ds-bg)]"
                        >
                          Annuler
                        </button>
                        <button
                          type="button"
                          onClick={handleConfirmDeletePatientDocument}
                          className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700"
                        >
                          Supprimer
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}

                {lightboxDocument ? (
                  <div
                    className="fixed inset-0 z-[100] flex flex-col"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Aperçu document"
                  >
                    <button
                      type="button"
                      className="absolute inset-0 bg-black/95"
                      aria-label="Fermer l’aperçu"
                      onClick={() => setLightboxDocument(null)}
                    />
                    <div className="relative z-10 flex min-h-0 flex-1 flex-col">
                      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-black/40 px-4 py-3 text-white backdrop-blur-sm">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">
                            {lightboxDocument.nom}
                          </p>
                          <p className="text-xs text-white/60">
                            {lightboxDocument.categorie} ·{" "}
                            {formatDate(lightboxDocument.date)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {lightboxDocument.url ? (
                            <a
                              href={lightboxDocument.url}
                              download={lightboxDocument.nom}
                              className="rounded-xl bg-white/10 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-white/20"
                              onClick={(e) => e.stopPropagation()}
                            >
                              Télécharger
                            </a>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => setLightboxDocument(null)}
                            className="rounded-xl p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                            aria-label="Fermer"
                          >
                            <X className="h-6 w-6" />
                          </button>
                        </div>
                      </div>
                      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
                        {!lightboxDocument.url ? (
                          <p className="rounded-xl bg-white/10 px-6 py-8 text-center text-sm text-white/90">
                            Aucun fichier associé (aperçu indisponible).
                          </p>
                        ) : lightboxDocument.type === "pdf" ||
                          lightboxDocument.url.startsWith(
                            "data:application/pdf",
                          ) ? (
                          <iframe
                            title={lightboxDocument.nom}
                            src={lightboxDocument.url}
                            className="h-[min(85vh,900px)] w-[min(96vw,720px)] rounded-lg bg-[var(--ds-surface)] shadow-xl"
                          />
                        ) : (
                          <img
                            src={lightboxDocument.url}
                            alt=""
                            className="max-h-[85vh] max-w-full object-contain shadow-xl"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* ---- Section Radiologies ---- */}
                <div className="mt-8 border-t border-[var(--ds-primary-border)] pt-6">
                  <RadiologiesSection patientId={id} />
                </div>
              </section>
            )}

            {tab === "finances" && (
              <div>
                <Link
                  href={`/finances?patient=${encodeURIComponent(id)}`}
                  className="text-xs text-[var(--ds-primary)] hover:underline flex items-center gap-1"
                >
                  <ExternalLink className="h-3 w-3" />
                  Voir dans le module Finances
                </Link>
                <div className="flex justify-between items-start mb-6 gap-4">
                  <h2 className="text-lg font-semibold text-[color:var(--ds-text)]">
                    Facturation
                  </h2>

                  <div className="flex gap-2 flex-wrap justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setIsQuoteModalOpen(true);
                        setQuoteCatalogActId("");
                        setQuoteMontantTotal("");
                        setQuoteDate(new Date().toISOString().slice(0, 10));
                      }}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-4 py-2.5 text-sm font-medium text-[var(--ds-text)] shadow-sm transition-colors hover:bg-[var(--ds-bg)]"
                    >
                      <Plus className="h-4 w-4" />
                      Nouvelle facture
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsPaymentModalOpen(true);
                        setPaymentLineId("");
                        setPaymentMontant("");
                      }}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--ds-primary-hover)] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[var(--ds-primary-hover)]"
                    >
                      <CreditCard className="h-4 w-4" />
                      Enregistrer un paiement
                    </button>
                  </div>
                </div>

                {/* KPIs (2 cartes) */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="rounded-2xl bg-[var(--ds-surface)] border border-[var(--ds-primary-border)] p-4 shadow-sm flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--ds-primary-soft)] text-[var(--ds-primary)]">
                      <Receipt className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-[var(--ds-text-muted)]">Total facturé</p>
                        <p className="mt-1 text-lg font-semibold text-[var(--ds-text)]">{formatDZD(totalFacture)}</p>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-red-50/50 border border-red-100 p-4 shadow-sm flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-red-700">
                      <Receipt className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-[var(--ds-text-muted)]">
                        Reste à payer
                      </p>
                        <p className="mt-1 text-lg font-semibold text-red-600">{formatDZD(totalResteACharge)}</p>
                    </div>
                  </div>
                </div>

                {/* Tableau d'historique */}
                <div className="bg-[var(--ds-surface)] rounded-3xl p-4 shadow-sm border border-[var(--ds-primary-border)] overflow-x-auto">
                  <table className="table-auto w-full text-sm">
                    <thead>
                      <tr className="text-left">
                        <th className="pb-3 text-xs font-semibold text-[var(--ds-text-muted)]">Date</th>
                        <th className="pb-3 text-xs font-semibold text-[var(--ds-text-muted)]">Acte</th>
                        <th className="pb-3 text-xs font-semibold text-[var(--ds-text-muted)]">Montant</th>
                        <th className="pb-3 text-xs font-semibold text-[var(--ds-text-muted)]">
                          Reste à payer
                        </th>
                        <th className="pb-3 text-xs font-semibold text-[var(--ds-text-muted)]">Statut</th>
                        <th className="pb-3 text-xs font-semibold text-[var(--ds-text-muted)]">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {finances.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="py-10 text-center text-sm text-[var(--ds-text-muted)]"
                          >
                            Aucune facturation pour le moment.
                          </td>
                        </tr>
                      ) : (
                        finances.map((row) => {
                          const badgeClass =
                            row.statut === "Payé"
                              ? "bg-emerald-50 text-emerald-700"
                              : row.statut === "Partiellement Payé"
                                ? "bg-cyan-50 text-cyan-800"
                                : "bg-amber-50 text-amber-800";

                          return (
                            <tr
                              key={row.id}
                              className="border-b border-[var(--ds-primary-border)] align-top last:border-b-0"
                            >
                              <td className="py-3 text-[var(--ds-text-muted)]">
                                {formatDate(row.date)}
                              </td>
                              <td className="py-3 text-[var(--ds-text)] font-medium">
                                {row.acteName}
                              </td>
                              <td className="py-3 text-[var(--ds-text)]">
                                {formatAmountDA(row.montantTotal)}
                              </td>
                              <td className="py-3 text-[var(--ds-text)]">
                                {formatAmountDA(row.resteACharge)}
                              </td>
                              <td className="py-3">
                                <span
                                  className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${badgeClass}`}
                                >
                                  {row.statut}
                                </span>
                              </td>
                              <td className="py-3">
                                <div className="flex items-center gap-2 justify-end">
                                  <button
                                    type="button"
                                    title="Télécharger le PDF"
                                    onClick={() => {
                                      setActiveDropdownId(null);
                                      alert(
                                        "Génération du PDF de la facture en cours..."
                                      );
                                    }}
                                    className="inline-flex items-center justify-center rounded-xl bg-[var(--ds-bg)] p-2 text-[var(--ds-text-muted)] hover:bg-[var(--ds-primary-soft)] hover:text-[var(--ds-primary)] transition-colors"
                                    aria-label="Télécharger le PDF"
                                  >
                                    <DownloadCloud className="h-4 w-4" />
                                  </button>
                                  <div className="relative">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setActiveDropdownId((prev) =>
                                          prev === row.id ? null : row.id
                                        )
                                      }
                                      className="inline-flex items-center justify-center rounded-xl p-2 text-[var(--ds-text-muted)] hover:bg-[var(--ds-primary-soft)] hover:text-[var(--ds-primary)] transition-colors"
                                      aria-label="Options"
                                    >
                                      <MoreVertical className="h-4 w-4" />
                                    </button>

                                    {activeDropdownId === row.id && (
                                      <div
                                        className="absolute right-0 z-20 mt-2 w-40 overflow-hidden rounded-xl bg-[var(--ds-surface)] shadow-md border border-[var(--ds-primary-border)]"
                                        role="menu"
                                      >
                                        <button
                                          type="button"
                                          role="menuitem"
                                          onClick={() => {
                                            setEditingFinance(row);
                                            setEditDate(parseDateToISO(row.date));
                                            setEditActeName(row.acteName);
                                            setEditMontantTotal(
                                              String(row.montantTotal)
                                            );
                                            setEditResteAPayer(
                                              String(row.resteACharge)
                                            );
                                            setActiveDropdownId(null);
                                          }}
                                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--ds-text)] hover:bg-[var(--ds-primary-soft)] transition-colors"
                                        >
                                          ✏️ Modifier
                                        </button>
                                        <button
                                          type="button"
                                          role="menuitem"
                                          onClick={() => {
                                            setFinances((prev) =>
                                              prev.filter(
                                                (item) => item.id !== row.id,
                                              ),
                                            );
                                            removeGlobalFactureByFinanceLineId(
                                              row.id,
                                            );
                                            if (paymentLineId === row.id) {
                                              setPaymentLineId("");
                                            }
                                            setActiveDropdownId(null);
                                          }}
                                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition-colors"
                                        >
                                          🗑️ Supprimer
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Modals (mock) */}
                {isPaymentModalOpen && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 backdrop-blur-sm p-4">
                    <form
                      className="w-full max-w-md rounded-3xl bg-[var(--ds-surface)] p-6 shadow-xl"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const line = finances.find(
                          (f) => f.id === paymentLineId
                        );
                        const montantVersé = parseMoney(paymentMontant);
                        if (!line || montantVersé <= 0) {
                          setToast({
                            type: "error",
                            message: "Veuillez entrer un montant valide",
                          });
                          return;
                        }

                        const newReste = Math.max(
                          0,
                          line.resteACharge - montantVersé,
                        );
                        const nextStatut = financeStatutFromReste(
                          line.montantTotal,
                          newReste,
                        );
                        const updatedLine: FinanceLine = {
                          ...line,
                          resteACharge: newReste,
                          statut: nextStatut,
                        };

                        setFinances((prev) =>
                          prev.map((f) =>
                            f.id === line.id ? updatedLine : f,
                          ),
                        );
                        upsertGlobalFactureFromFinanceLine(updatedLine);
                        setToast({
                          type: "success",
                          message: "Paiement enregistré.",
                        });

                        setIsPaymentModalOpen(false);
                        setPaymentLineId("");
                        setPaymentMontant("");
                      }}
                    >
                      <div className="flex items-center justify-between border-b border-[var(--ds-primary-border)] p-6">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wider text-[var(--ds-text-muted)]">
                            Paiement
                          </p>
                          <h3 className="mt-0.5 text-lg font-semibold text-[color:var(--ds-text)]">
                            Enregistrer un paiement
                          </h3>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsPaymentModalOpen(false)}
                          className="flex h-9 w-9 items-center justify-center rounded-2xl text-[var(--ds-text-muted)] hover:bg-[var(--ds-primary-soft)] hover:text-[var(--ds-text-muted)] transition-colors"
                          aria-label="Fermer"
                        >
                          <X className="h-5 w-5" />
                        </button>
                      </div>
                      <div className="space-y-5">
                        <div>
                          <label
                            className="block text-sm font-medium text-[var(--ds-text)]"
                            htmlFor="payment-line"
                          >
                            Sélectionner l&apos;acte à payer
                          </label>
                          <select
                            id="payment-line"
                            value={paymentLineId}
                            onChange={(e) => setPaymentLineId(e.target.value)}
                            className="mt-1 w-full rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-4 py-2.5 text-sm text-[var(--ds-text)] outline-none transition-colors focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary-border)]"
                          >
                            <option value="" disabled>
                              — Choisir un acte —{" "}
                            </option>
                            {finances
                              .filter((f) => f.resteACharge > 0)
                              .map((f) => (
                                <option key={f.id} value={f.id}>
                                  {f.acteName} (reste: {formatDZD(f.resteACharge)})
                                </option>
                              ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-[var(--ds-text)]">
                            Montant versé (DA)
                          </label>
                          <input
                            value={paymentMontant}
                            onChange={(e) => setPaymentMontant(e.target.value)}
                            inputMode="decimal"
                            className="mt-1 w-full rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-4 py-2.5 text-sm text-[var(--ds-text)] outline-none transition-colors focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary-border)]"
                          />
                        </div>
                      </div>

                      <div className="mt-6 flex justify-end gap-3 rounded-xl bg-[var(--ds-bg)] px-0 py-0">
                        <button
                          type="button"
                          onClick={() => setIsPaymentModalOpen(false)}
                          className="rounded-2xl px-5 py-2.5 text-sm font-medium text-[var(--ds-text-muted)] transition-colors hover:bg-[var(--ds-primary-soft)]"
                        >
                          Annuler
                        </button>
                        <button
                          type="submit"
                          className="rounded-2xl bg-[var(--ds-primary-hover)] px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[var(--ds-primary-hover)]"
                        >
                          Valider
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {isQuoteModalOpen && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 backdrop-blur-sm p-4">
                    <form
                      className="w-full max-w-2xl rounded-3xl bg-[var(--ds-surface)] p-6 shadow-xl"
                      onSubmit={(e) => {
                        e.preventDefault();

                        const catalogAct = quoteCatalogActs.find(
                          (a) => a.id === quoteCatalogActId,
                        );
                        if (!catalogAct) {
                          setToast({
                            type: "error",
                            message:
                              "Choisissez un acte dans le catalogue (Réglages → Actes & tarifs).",
                          });
                          return;
                        }
                        const montantTotal = parseMoney(quoteMontantTotal);
                        if (montantTotal <= 0) return;

                        const newLine: FinanceLine = {
                          id: uid(),
                          acteName: catalogAct.nom,
                          catalogActId: catalogAct.id,
                          date: `${quoteDate}T12:00:00.000Z`,
                          montantTotal,
                          resteACharge: montantTotal,
                          statut: "En attente",
                        };

                        setFinances((prev) => [newLine, ...prev]);
                        upsertGlobalFactureFromFinanceLine(newLine);
                        setToast({
                          type: "success",
                          message: "Facture enregistrée.",
                        });

                        setIsQuoteModalOpen(false);
                        setQuoteCatalogActId("");
                        setQuoteMontantTotal("");
                        setQuoteDate(new Date().toISOString().slice(0, 10));
                      }}
                    >
                      <div className="flex items-center justify-between border-b border-[var(--ds-primary-border)] p-6">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wider text-[var(--ds-text-muted)]">
                            Facture
                          </p>
                          <h3 className="mt-0.5 text-lg font-semibold text-[color:var(--ds-text)]">
                            Ajouter un soin / acte
                          </h3>
                          <p className="mt-1 text-xs text-[var(--ds-text-muted)]">
                            Tarif issu du catalogue ; le montant reste ajustable.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setIsQuoteModalOpen(false);
                            setQuoteCatalogActId("");
                            setQuoteMontantTotal("");
                            setQuoteDate(new Date().toISOString().slice(0, 10));
                          }}
                          className="flex h-9 w-9 items-center justify-center rounded-2xl text-[var(--ds-text-muted)] hover:bg-[var(--ds-primary-soft)] hover:text-[var(--ds-text-muted)] transition-colors"
                          aria-label="Fermer"
                        >
                          <X className="h-5 w-5" />
                        </button>
                      </div>
                      <div className="space-y-5 p-0">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="sm:col-span-2">
                            <CatalogActCombobox
                              key={quoteComboKey}
                              id="quote-catalog-act"
                              label="Acte du catalogue"
                              acts={quoteCatalogActs}
                              selectedId={quoteCatalogActId}
                              onSelect={(a) => {
                                setQuoteCatalogActId(a.id);
                                setQuoteMontantTotal(String(a.prix_par_defaut));
                              }}
                              onClearSelection={() => {
                                setQuoteCatalogActId("");
                                setQuoteMontantTotal("");
                              }}
                            />
                          </div>

                          <div>
                            <label
                              className="block text-sm font-medium text-[var(--ds-text)]"
                              htmlFor="quote-montant"
                            >
                              Montant total (DA)
                            </label>
                            <input
                              id="quote-montant"
                              value={quoteMontantTotal}
                              onChange={(e) =>
                                setQuoteMontantTotal(e.target.value)
                              }
                              inputMode="decimal"
                              placeholder="Ex: 600"
                              className="mt-1 w-full rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-4 py-2.5 text-sm text-[var(--ds-text)] outline-none transition-colors focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary-border)]"
                            />
                          </div>

                          <div>
                            <label
                              className="block text-sm font-medium text-[var(--ds-text)]"
                              htmlFor="quote-date"
                            >
                              Date
                            </label>
                            <input
                              id="quote-date"
                              type="date"
                              value={quoteDate}
                              onChange={(e) => setQuoteDate(e.target.value)}
                              className="mt-1 w-full rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-4 py-2.5 text-sm text-[var(--ds-text)] outline-none transition-colors focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary-border)]"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="mt-6 flex justify-end gap-3 border-t border-[var(--ds-primary-border)] pt-4">
                        <button
                          type="button"
                          onClick={() => {
                            setIsQuoteModalOpen(false);
                            setQuoteCatalogActId("");
                            setQuoteMontantTotal("");
                            setQuoteDate(new Date().toISOString().slice(0, 10));
                          }}
                          className="rounded-2xl px-5 py-2.5 text-sm font-medium text-[var(--ds-text-muted)] transition-colors hover:bg-[var(--ds-primary-soft)]"
                        >
                          Annuler
                        </button>
                        <button
                          type="submit"
                          className="rounded-2xl bg-[var(--ds-primary-hover)] px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[var(--ds-primary-hover)]"
                        >
                          Enregistrer la facture
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </div>}
      />

      <RoleGate role={["admin", "praticien"]}>
      <PrescriptionModal
        open={isPrescriptionModalOpen}
        patientName={displayFullName}
        patientAge={patientProfile.age ? `${patientProfile.age} ans` : "—"}
        onClose={() => setIsPrescriptionModalOpen(false)}
        onGeneratePdf={(items: PrescriptionItem[]) => {
          const settings = getSettings();
          const praticienFromSettings =
            (typeof settings.praticien === "string" &&
              settings.praticien.trim()) ||
            `${String(settings.praticienPrenom ?? "").trim()} ${String(settings.praticienNom ?? "").trim()}`.trim() ||
            undefined;
          void generateOrdonnancePDF({
            patient: displayFullName,
            age:
              patientProfile.age != null && patientProfile.age > 0
                ? patientProfile.age
                : undefined,
            sexe: patientProfile.genre && patientProfile.genre !== "—" ? patientProfile.genre : undefined,
            date: new Date().toLocaleDateString("fr-DZ", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            }),
            items: items.map(({ nom, dosage, posologie, duree }) => ({
              nom,
              dosage,
              posologie,
              duree,
            })),
            cabinetNom:
              (settings.nomCabinet ?? settings.cabinetNom) as
                | string
                | undefined,
            cabinetAdresse: settings.adresse as string | undefined,
            cabinetTel: settings.telephone as string | undefined,
            cabinetNumeroCnam:
              (settings.numeroCnam ?? settings.numeroCNAM ?? settings.cabinetNumeroCnam) as
                | string
                | undefined,
            praticienNom: praticienFromSettings,
            mentionLegale: settings.mentionLegale as string | undefined,
            logoBase64: settings.logoBase64 as string | undefined,
          });
        }}
      />
      </RoleGate>

      {deleteConfirmOpen ? (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-patient-title"
          onClick={() => setDeleteConfirmOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="delete-patient-title"
              className="text-lg font-semibold text-[var(--ds-text)]"
            >
              Supprimer ce patient ?
            </h2>
            <p className="mt-2 text-sm text-[var(--ds-text-muted)]">
              {displayFullName} — toutes les données locales associées seront supprimées (actes, finances, documents…). Cette action est irréversible.
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(false)}
                className="rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-4 py-2 text-sm font-medium text-[var(--ds-text)] transition-colors hover:bg-[var(--ds-bg)]"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmDeletePatient}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700"
              >
                Supprimer le patient
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editingFinance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 backdrop-blur-sm p-4">
          <form
            className="w-full max-w-2xl rounded-3xl bg-[var(--ds-surface)] p-6 shadow-xl"
            onSubmit={(e) => {
              e.preventDefault();

              const nouveauTotal = parseMoney(editMontantTotal);
              const nouveauReste = parseMoney(editResteAPayer);
              const nouvelleDate = `${editDate}T12:00:00.000Z`;
              const nouvelActe = editActeName;

              if (!editingFinance?.id) return;
              if (nouveauTotal <= 0) return;
              if (!editDate) return;
              if (!nouvelActe) return;

              const newStatus = financeStatutFromReste(
                nouveauTotal,
                nouveauReste,
              );

              const updated: FinanceLine = {
                ...editingFinance,
                acteName: nouvelActe,
                date: nouvelleDate,
                montantTotal: nouveauTotal,
                resteACharge: nouveauReste,
                statut: newStatus,
                catalogActId: editCatalogActId || undefined,
              };

              setFinances((prev) =>
                prev.map((f) => (f.id === editingFinance.id ? updated : f)),
              );
              upsertGlobalFactureFromFinanceLine(updated);

              setEditingFinance(null);
            }}
          >
            <div className="flex items-center justify-between border-b border-[var(--ds-primary-border)] p-6">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-[var(--ds-text-muted)]">
                  Facturation
                </p>
                <h3 className="mt-0.5 text-lg font-semibold text-[color:var(--ds-text)]">
                  Modifier la facturation
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingFinance(null)}
                className="flex h-9 w-9 items-center justify-center rounded-2xl text-[var(--ds-text-muted)] hover:bg-[var(--ds-primary-soft)] hover:text-[var(--ds-text-muted)] transition-colors"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5 p-0">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label
                    className="block text-sm font-medium text-[var(--ds-text)]"
                    htmlFor="edit-date"
                  >
                    Date
                  </label>
                  <input
                    id="edit-date"
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-4 py-2.5 text-sm text-[var(--ds-text)] outline-none transition-colors focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary-border)]"
                  />
                </div>

                <div className="sm:col-span-2">
                  <CatalogActCombobox
                    key={editingFinance.id}
                    id="edit-catalog-act"
                    label="Acte du catalogue"
                    acts={catalogActsForEdit}
                    selectedId={editCatalogActId}
                    onSelect={(a) => {
                      setEditCatalogActId(a.id);
                      setEditActeName(a.nom);
                      setEditMontantTotal(String(a.prix_par_defaut));
                    }}
                    onClearSelection={() => setEditCatalogActId("")}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label
                    className="block text-sm font-medium text-[var(--ds-text)]"
                    htmlFor="edit-acte-libelle"
                  >
                    Libellé sur la facture
                  </label>
                  <input
                    id="edit-acte-libelle"
                    type="text"
                    value={editActeName}
                    onChange={(e) => setEditActeName(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-4 py-2.5 text-sm text-[var(--ds-text)] outline-none transition-colors focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary-border)]"
                  />
                </div>

                <div>
                  <label
                    className="block text-sm font-medium text-[var(--ds-text)]"
                    htmlFor="edit-total"
                  >
                    Montant Total (DA)
                  </label>
                  <input
                    id="edit-total"
                    value={editMontantTotal}
                    onChange={(e) => setEditMontantTotal(e.target.value)}
                    inputMode="decimal"
                    className="mt-1 w-full rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-4 py-2.5 text-sm text-[var(--ds-text)] outline-none transition-colors focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary-border)]"
                  />
                </div>

                <div>
                  <label
                    className="block text-sm font-medium text-[var(--ds-text)]"
                    htmlFor="edit-reste"
                  >
                    Reste à payer (DA)
                  </label>
                  <input
                    id="edit-reste"
                    value={editResteAPayer}
                    onChange={(e) => setEditResteAPayer(e.target.value)}
                    inputMode="decimal"
                    className="mt-1 w-full rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-4 py-2.5 text-sm text-[var(--ds-text)] outline-none transition-colors focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary-border)]"
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t border-[var(--ds-primary-border)] pt-4">
              <button
                type="button"
                onClick={() => setEditingFinance(null)}
                className="rounded-2xl px-5 py-2.5 text-sm font-medium text-[var(--ds-text-muted)] transition-colors hover:bg-[var(--ds-primary-soft)]"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="rounded-2xl bg-[var(--ds-primary-hover)] px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[var(--ds-primary-hover)]"
              >
                Enregistrer
              </button>
            </div>
          </form>
        </div>
      )}

      {isEditPatientModalOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/20 p-4 backdrop-blur-sm"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsEditPatientModalOpen(false);
          }}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-patient-modal-title"
            className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-[var(--ds-surface)] shadow-xl"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              handleUpdatePatient();
            }}
          >
            <header className="sticky top-0 z-10 flex shrink-0 items-start justify-between gap-3 border-b border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-6 pt-6 pb-4">
              <div className="min-w-0 flex-1 pr-2">
                <h3
                  id="edit-patient-modal-title"
                  className="text-lg font-semibold tracking-tight text-[color:var(--ds-text)]"
                >
                  Modifier les informations du patient
                </h3>
                <p className="mt-1 text-xs text-[var(--ds-text-muted)]">
                  Mettez a jour les coordonnees et les alertes medicales.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditPatientModalOpen(false)}
                className="shrink-0 rounded-2xl p-2 text-[var(--ds-text-muted)] transition-colors hover:bg-[var(--ds-bg)] hover:text-[var(--ds-text)]"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-[var(--ds-text)]">
                  Nom complet
                </label>
                <input
                  type="text"
                  value={editPatientName}
                  onChange={(e) => setEditPatientName(e.target.value)}
                  className="mt-1.5 w-full rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 py-2.5 text-sm text-[var(--ds-text)] outline-none transition-colors focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-[var(--ds-text)]">
                  Statut patient
                </label>
                <select
                  value={editPatientStatut}
                  onChange={(e) =>
                    setEditPatientStatut(
                      e.target.value === "inactif" ? "inactif" : "actif",
                    )
                  }
                  className="mt-1.5 w-full rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 py-2.5 text-sm text-[var(--ds-text)] outline-none transition-colors focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                >
                  <option value="actif">Actif</option>
                  <option value="inactif">Inactif</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--ds-text)]">
                  Sexe / Genre
                </label>
                <select
                  value={editPatientGender}
                  onChange={(e) => setEditPatientGender(e.target.value)}
                  className="mt-1.5 w-full rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 py-2.5 text-sm text-[var(--ds-text)] outline-none transition-colors focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                >
                  <option value="">Non renseigné</option>
                  <option value="Homme">Homme</option>
                  <option value="Femme">Femme</option>
                  <option value="Autre">Autre</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--ds-text)]">
                  Profession
                </label>
                <input
                  type="text"
                  value={editPatientProfession}
                  onChange={(e) => setEditPatientProfession(e.target.value)}
                  className="mt-1.5 w-full rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 py-2.5 text-sm text-[var(--ds-text)] outline-none transition-colors focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--ds-text)]">
                  Groupe sanguin
                </label>
                <select
                  value={editPatientGroupeSanguin}
                  onChange={(e) => setEditPatientGroupeSanguin(e.target.value)}
                  className="mt-1.5 w-full rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 py-2.5 text-sm text-[var(--ds-text)] outline-none transition-colors focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                >
                  <option value="">Non renseigné</option>
                  {BLOOD_GROUP_OPTIONS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--ds-text)]">
                  Mutuelle
                </label>
                <input
                  type="text"
                  value={editPatientMutuelle}
                  onChange={(e) => setEditPatientMutuelle(e.target.value)}
                  placeholder="Ex. CNAS, CASNOS, Privée…"
                  className="mt-1.5 w-full rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 py-2.5 text-sm text-[var(--ds-text)] outline-none transition-colors placeholder:text-[var(--ds-text-muted)]/60 focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-[var(--ds-text)]">
                  Adresse complète
                </label>
                <input
                  type="text"
                  value={editPatientAddress}
                  onChange={(e) => setEditPatientAddress(e.target.value)}
                  className="mt-1.5 w-full rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 py-2.5 text-sm text-[var(--ds-text)] outline-none transition-colors focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--ds-text)]">
                  Téléphone principal
                </label>
                <input
                  type="text"
                  value={editPatientPhone}
                  onChange={(e) => setEditPatientPhone(e.target.value)}
                  className="mt-1.5 w-full rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 py-2.5 text-sm text-[var(--ds-text)] outline-none transition-colors focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--ds-text)]">
                  Téléphone secondaire / domicile
                </label>
                <input
                  type="text"
                  value={editPatientPhoneSecond}
                  onChange={(e) => setEditPatientPhoneSecond(e.target.value)}
                  className="mt-1.5 w-full rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 py-2.5 text-sm text-[var(--ds-text)] outline-none transition-colors focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-[var(--ds-text)]">Email</label>
                <input
                  type="email"
                  value={editPatientEmail}
                  onChange={(e) => setEditPatientEmail(e.target.value)}
                  className="mt-1.5 w-full rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 py-2.5 text-sm text-[var(--ds-text)] outline-none transition-colors focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--ds-text)]">
                  Date de naissance
                </label>
                <input
                  type="text"
                  value={isoToDisplayDate(editPatientDob)}
                  onChange={(e) => {
                    const formatted = formatDateInput(e.target.value);
                    // Convertir l'affichage JJ/MM/AAAA en ISO pour le stockage
                    const iso = parseDateToISO(formatted);
                    setEditPatientDob(iso || formatted);
                  }}
                  className="mt-1.5 w-full rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 py-2.5 text-sm text-[var(--ds-text)] outline-none transition-colors focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                  placeholder="ex: 15/03/1990"
                  maxLength={10}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--ds-text)]">
                  Date de première visite
                </label>
                <input
                  type="date"
                  value={editPatientPremiereVisite}
                  onChange={(e) => setEditPatientPremiereVisite(e.target.value)}
                  className="mt-1.5 w-full rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 py-2.5 text-sm text-[var(--ds-text)] outline-none transition-colors focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-[var(--ds-text)]">
                  Alertes médicales
                </label>
                <div className="mt-1.5 flex min-h-[2.5rem] flex-wrap gap-2 rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-bg)]/40 px-3 py-2.5">
                  {editAlertsDraft.length === 0 ? (
                    <span className="text-sm text-[var(--ds-text-muted)]">
                      Aucune alerte — ajoutez-en ci-dessous.
                    </span>
                  ) : (
                    editAlertsDraft.map((a, idx) => (
                      <span
                        key={`${idx}-${a.label}`}
                        className={[
                          "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-medium",
                          a.level === "danger"
                            ? "border-red-200 bg-red-50 text-red-800"
                            : "border-amber-200 bg-amber-50 text-amber-900",
                        ].join(" ")}
                      >
                        {a.label}
                        <button
                          type="button"
                          onClick={() =>
                            setEditAlertsDraft((prev) =>
                              prev.filter((_, i) => i !== idx),
                            )
                          }
                          className="ml-0.5 rounded-full p-0.5 leading-none hover:bg-black/10"
                          aria-label={`Retirer ${a.label}`}
                        >
                          ×
                        </button>
                      </span>
                    ))
                  )}
                </div>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="sm:w-44">
                    <label className="block text-[11px] font-medium text-[var(--ds-text-muted)]">
                      Niveau
                    </label>
                    <select
                      value={editAlertLevel}
                      onChange={(e) =>
                        setEditAlertLevel(e.target.value as PatientAlertLevel)
                      }
                      className="mt-1 w-full rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 py-2 text-sm text-[var(--ds-text)] outline-none transition-colors focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                    >
                      <option value="danger">Danger (rouge)</option>
                      <option value="warning">Attention (orange)</option>
                    </select>
                  </div>
                  <div className="min-w-0 flex-1">
                    <label className="block text-[11px] font-medium text-[var(--ds-text-muted)]">
                      Libellé
                    </label>
                    <input
                      type="text"
                      value={editAlertInput}
                      onChange={(e) => setEditAlertInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const label = editAlertInput.trim();
                          if (!label) return;
                          setEditAlertsDraft((prev) => [
                            ...prev,
                            { label, level: editAlertLevel },
                          ]);
                          setEditAlertInput("");
                        }
                      }}
                      placeholder="Ex. Allergie pénicilline"
                      className="mt-1 w-full rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 py-2 text-sm text-[var(--ds-text)] outline-none transition-colors placeholder:text-[var(--ds-text-muted)]/60 focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const label = editAlertInput.trim();
                      if (!label) return;
                      setEditAlertsDraft((prev) => [
                        ...prev,
                        { label, level: editAlertLevel },
                      ]);
                      setEditAlertInput("");
                    }}
                    className="shrink-0 rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-primary-soft)] px-4 py-2 text-sm font-medium text-[var(--ds-primary)] transition-colors hover:bg-[var(--ds-primary)]/15"
                  >
                    Ajouter
                  </button>
                </div>
              </div>
            </div>
            </div>

            <footer className="sticky bottom-0 z-10 flex shrink-0 items-center justify-end gap-3 border-t border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-6 py-4">
              <button
                type="button"
                onClick={() => setIsEditPatientModalOpen(false)}
                className="rounded-2xl px-4 py-2.5 text-sm font-medium text-[var(--ds-text-muted)] transition-colors hover:bg-[var(--ds-primary-soft)]"
              >
                Annuler
              </button>
              <PrimaryButton type="submit" className="rounded-2xl px-4 py-2.5 text-sm font-medium shadow-sm">
                Enregistrer
              </PrimaryButton>
            </footer>
          </form>
        </div>
      )}

      {/* ── Tiroir Cockpit — protocole + consommables (un seul panneau) ── */}
      <>
        <div
          aria-hidden
          className={[
            "fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-sm transition-opacity duration-300",
            // Ne pas intercepter les clics : l’odontogramme reste à gauche sous ce voile ;
            // sans `pointer-events-none`, aucun clic dent n’atteint la fiche tant que le cockpit est ouvert.
            selectedTooth !== null
              ? "pointer-events-none opacity-100"
              : "pointer-events-none opacity-0",
          ].join(" ")}
        />

        <aside
          role="dialog"
          aria-modal="true"
          aria-labelledby="cockpit-title"
          className={[
            "fixed right-4 top-[5vh] z-50 flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] shadow-2xl transition-all duration-300 ease-in-out",
            selectedTooth !== null
              ? "translate-x-0 opacity-100"
              : "pointer-events-none translate-x-[110%] opacity-0",
          ].join(" ")}
          style={{ maxHeight: "90vh" }}
        >
          {/* HEADER */}
          <header className="shrink-0 border-b border-[var(--ds-primary-border)] bg-gradient-to-r from-[var(--ds-primary-soft)] to-[var(--ds-surface)] px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--ds-primary)] text-sm font-bold text-white shadow-md shadow-[color-mix(in_srgb,var(--ds-primary)_25%,transparent)]">
                  {selectedTooth ?? "—"}
                </div>
                <div className="min-w-0">
                  <h3
                    id="cockpit-title"
                    className="truncate text-[15px] font-bold text-[var(--ds-text)]"
                  >
                    🦷 Dent {selectedTooth ?? "—"} · Cockpit clinique
                  </h3>
                  {selectedTooth !== null && dentsStatus[selectedTooth as ToothId] && (
                    <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--ds-text-muted)]">
                      <span>État actuel :</span>
                      <span
                        className={[
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
                          dentsStatus[selectedTooth as ToothId] === "healthy"
                            ? "bg-[color-mix(in_srgb,#10b981_16%,transparent)] text-[#10b981]"
                            : dentsStatus[selectedTooth as ToothId] === "carie"
                              ? "bg-[color-mix(in_srgb,#7c3aed_16%,transparent)] text-[#7c3aed]"
                              : dentsStatus[selectedTooth as ToothId] === "chirurgie"
                                ? "bg-[color-mix(in_srgb,#f97316_18%,transparent)] text-[#f97316]"
                                : dentsStatus[selectedTooth as ToothId] === "absente"
                                  ? "bg-[color-mix(in_srgb,#94a3b8_22%,transparent)] text-[#64748b]"
                                  : "bg-[color-mix(in_srgb,#06b6d4_16%,transparent)] text-[#06b6d4]",
                        ].join(" ")}
                      >
                        ●{" "}
                        {dentsStatus[selectedTooth as ToothId] === "healthy" && "Saine"}
                        {dentsStatus[selectedTooth as ToothId] === "carie" && "Soins"}
                        {dentsStatus[selectedTooth as ToothId] === "couronne" && "Prothèse"}
                        {dentsStatus[selectedTooth as ToothId] === "chirurgie" && "Chirurgie"}
                        {dentsStatus[selectedTooth as ToothId] === "absente" && "Absente"}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTooth(null)}
                aria-label="Fermer"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--ds-text-muted)] transition-colors hover:bg-[var(--ds-primary-soft)] hover:text-[var(--ds-text)]"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            {/* Onglets cockpit (catégories) */}
            {selectedTooth !== null && (
              <div className="mt-3 grid grid-cols-5 gap-1.5">
                {(
                  [
                    ["Saine", "Saine"],
                    ["Soins", "Soins"],
                    ["Endodontie", "Endodontie"],
                    ["Prothèse", "Prothèse"],
                    ["Chirurgie", "Chirurgie"],
                  ] as const
                ).map(([key, label]) => {
                  const active = cockpitTab === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setCockpitTab(key);
                        // Le statut dentaire ne change QUE si l'utilisateur clique sur un onglet.
                        if (key === "Saine") {
                          setDentsStatus((prev) => ({
                            ...prev,
                            [selectedTooth as ToothId]: "healthy",
                          }));
                        } else if (key === "Chirurgie") {
                          setDentsStatus((prev) => ({
                            ...prev,
                            [selectedTooth as ToothId]: "chirurgie",
                          }));
                        } else if (key === "Prothèse") {
                          setDentsStatus((prev) => ({
                            ...prev,
                            [selectedTooth as ToothId]: "couronne",
                          }));
                        } else if (key === "Soins" || key === "Endodontie") {
                          setDentsStatus((prev) => ({
                            ...prev,
                            [selectedTooth as ToothId]: "carie",
                          }));
                        }

                        // Reset du protocole sélectionné lors du changement d'onglet
                        setDrawerProtocolId("");
                      }}
                      className={[
                        "rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors",
                        active
                          ? COCKPIT_TAB_ACTIVE_CN[key]
                          : "border-[var(--ds-primary-border)] bg-[var(--ds-surface)] text-[var(--ds-text-muted)] hover:bg-[var(--ds-primary-soft)]",
                      ].join(" ")}
                    >
                      <span className="block truncate">{label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </header>

          {/* CORPS scrollable (overflow uniquement si dépassement) */}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {selectedTooth !== null && (
              <>
                {/* SECTION 1 — ÉTAT CLINIQUE */}
                <section className="space-y-2">
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ds-text-muted)]">
                    État clinique
                  </h4>

                  <div className="rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 py-3 space-y-3">
                    <div className="space-y-2">
                      <p className="text-xs font-medium uppercase tracking-wider text-[var(--ds-text-subtle)]">
                        Mobilité
                      </p>
                      <MobilitePills
                        value={mobilite}
                        onChange={(next) => {
                          setMobilite(next);
                          setAllTreatments((prev) =>
                            upsertToothStateRow(prev, selectedTooth, {
                              mobilite: next,
                            }),
                          );
                        }}
                      />
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-medium uppercase tracking-wider text-[var(--ds-text-subtle)]">
                        Sensibilité
                      </p>
                      <SensibilitePills
                        value={sensibilite}
                        onChange={(next) => {
                          setSensibilite(next);
                          setAllTreatments((prev) =>
                            upsertToothStateRow(prev, selectedTooth, {
                              sensibilite: next,
                            }),
                          );
                        }}
                      />
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-medium uppercase tracking-wider text-[var(--ds-text-subtle)]">
                        Vitalité
                      </p>
                      <VitalitePills
                        value={vitalite}
                        onChange={(next) => {
                          setVitalite(next);
                          setAllTreatments((prev) =>
                            upsertToothStateRow(prev, selectedTooth, {
                              vitalite: next,
                            }),
                          );
                        }}
                      />
                    </div>
                  </div>
                </section>

                <hr className="border-[var(--ds-primary-border)]" />

                {/* Actes enregistrés */}
                <section>
                  <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--ds-text-muted)]">
                    Actes enregistrés
                  </h4>
                  {(() => {
                    const toothHistory = allTreatments
                      .filter(
                      (t) => t.tooth === selectedTooth,
                      )
                      .filter((t) => t.kind !== "state")
                      .sort(
                        (a, b) =>
                          new Date(b.date).getTime() - new Date(a.date).getTime(),
                      );
                    if (toothHistory.length === 0) {
                      return (
                        <p className="rounded-xl border border-dashed border-[var(--ds-primary-border)] bg-[var(--ds-bg)]/60 px-3 py-2.5 text-center text-[11.5px] text-[var(--ds-text-muted)]">
                          Aucun acte
                        </p>
                      );
                    }
                    return (
                      <ul className="space-y-1.5">
                        {toothHistory.slice(0, 4).map((t, i) => (
                          <li
                            key={i}
                            className="rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-bg)] px-3 py-2"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex min-w-0 items-center gap-2">
                                  <span
                                    className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--ds-primary)]"
                                    aria-hidden
                                  />
                                  <div className="min-w-0">
                                    <div className="truncate text-xs font-semibold text-[var(--ds-text)]">
                                      {t.acte}
                                    </div>
                                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--ds-text-muted)]">
                                      <span className="font-mono">
                                        {formatClinicalDateFr(t.date)}
                                      </span>
                                      {t.material ? (
                                        <span>{t.material}</span>
                                      ) : null}
                                      {t.faces?.length ? (
                                        <span className="flex items-center gap-1">
                                          {t.faces.map((f) => (
                                            <span
                                              key={f}
                                              className="rounded-md border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--ds-text)]"
                                            >
                                              {f}
                                            </span>
                                          ))}
                                        </span>
                                      ) : null}
                                    </div>
                                    {t.praticien ? (
                                      <div className="mt-0.5 text-[11px] text-[var(--ds-text-muted)]">
                                        {t.praticien}
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                              {typeof t.montant === "number" && t.montant > 0 ? (
                                <div className="shrink-0 text-right">
                                  <div className="font-mono text-[11px] font-semibold text-[var(--ds-primary)]">
                                    {Math.round(t.montant).toLocaleString("fr-FR")} DA
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </li>
                        ))}
                      </ul>
                    );
                  })()}
                </section>

                <hr className="border-[var(--ds-primary-border)]" />

                {/* Ajouter un acte */}
                <section className="space-y-2">
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ds-text-muted)]">
                    Ajouter un acte
                  </h4>

                  <div>
                    <label
                      className="block text-[11px] font-medium text-[var(--ds-text-muted)]"
                      htmlFor="cockpit-protocol-select"
                    >
                      Protocole
                    </label>
                    <select
                      id="cockpit-protocol-select"
                      value={drawerProtocolId}
                      onChange={(e) => setDrawerProtocolId(e.target.value)}
                      className="mt-1 h-9 w-full rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 text-sm text-[var(--ds-text)] outline-none transition-colors focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary)]/20"
                    >
                      <option value="">— Sélectionner un protocole —</option>
                      {drawerProtocolsGrouped.map(({ category, protocols }) => (
                        <optgroup key={category} label={category}>
                          {protocols.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nom}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  {cockpitTab === "Endodontie" && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label
                          className="block text-[11px] font-medium text-[var(--ds-text-muted)]"
                          htmlFor="endo-canaux"
                        >
                          Nombre de canaux
                        </label>
                        <input
                          id="endo-canaux"
                          type="number"
                          min={1}
                          max={4}
                          value={endoCanaux}
                          onChange={(e) => setEndoCanaux(e.target.value)}
                          className="mt-1 h-9 w-full rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 text-sm text-[var(--ds-text)] outline-none transition-colors focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary)]/20"
                        />
                      </div>
                      <div>
                        <label
                          className="block text-[11px] font-medium text-[var(--ds-text-muted)]"
                          htmlFor="endo-lt"
                        >
                          Longueur de travail
                        </label>
                        <div className="relative mt-1">
                          <input
                            id="endo-lt"
                            type="number"
                            inputMode="decimal"
                            value={endoLt}
                            onChange={(e) => setEndoLt(e.target.value)}
                            placeholder="__"
                            className="h-9 w-full rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 pr-10 text-sm text-[var(--ds-text)] outline-none transition-colors placeholder:text-[var(--ds-text-muted)] focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary)]/20"
                          />
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10.5px] text-[var(--ds-text-muted)]">
                            mm
                          </span>
                        </div>
                      </div>
                      <div className="col-span-2">
                        <label
                          className="block text-[11px] font-medium text-[var(--ds-text-muted)]"
                          htmlFor="endo-obturation"
                        >
                          Obturation
                        </label>
                        <select
                          id="endo-obturation"
                          value={endoObturation}
                          onChange={(e) => setEndoObturation(e.target.value)}
                          className="mt-1 h-9 w-full rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 text-sm text-[var(--ds-text)] outline-none transition-colors focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary)]/20"
                        >
                          {(
                            [
                              "Gutta-percha",
                              "MTA",
                              "Biodentine",
                              "Autre",
                            ] as const
                          ).map((x) => (
                            <option key={x} value={x}>
                              {x}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Orthopédie supprimée (doublon Prothèse) */}

                  <div>
                    <label
                      className="block text-[11px] font-medium text-[var(--ds-text-muted)]"
                      htmlFor="cockpit-material"
                    >
                      Matériau
                    </label>
                    <select
                      id="cockpit-material"
                      value={actMaterial}
                      onChange={(e) => setActMaterial(e.target.value)}
                      className="mt-1 h-9 w-full rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 text-sm text-[var(--ds-text)] outline-none transition-colors focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary)]/20"
                    >
                      <option value="">—</option>
                      {(
                        [
                          "Composite",
                          "Amalgame",
                          "Zircone",
                          "Céramique",
                          "IRM",
                          "Cavit",
                          "CVI",
                          "Résine",
                          "Or",
                          "Autre",
                        ] as const
                      ).map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <p className="block text-[11px] font-medium text-[var(--ds-text-muted)]">
                      Faces concernées
                    </p>
                    <div className="mt-2 rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-bg)] px-3 py-3">
                      <ToothFacesPicker
                        value={actFaces}
                        onChange={(next) => setActFaces(next)}
                        ariaLabel={`Faces acte dent ${selectedTooth}`}
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      className="block text-[11px] font-medium text-[var(--ds-text-muted)]"
                      htmlFor="cockpit-note"
                    >
                      Note clinique
                    </label>
                    <textarea
                      id="cockpit-note"
                      value={toothNotes}
                      onChange={(e) => setToothNotes(e.target.value)}
                      rows={3}
                      placeholder="Observation clinique détaillée..."
                      className="mt-1 w-full resize-none rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 py-2 text-sm text-[var(--ds-text)] outline-none transition-colors placeholder:text-[var(--ds-text-muted)] focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary)]/20"
                    />
                  </div>

                  <div>
                    <label
                      className="block text-[11px] font-medium text-[var(--ds-text-muted)]"
                      htmlFor="cockpit-praticien"
                    >
                      Praticien
                    </label>
                    <input
                      id="cockpit-praticien"
                      type="text"
                      value={actPraticien}
                      onChange={(e) => setActPraticien(e.target.value)}
                      placeholder="Nom du praticien"
                      className="mt-1 h-9 w-full rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 text-sm text-[var(--ds-text)] outline-none transition-colors placeholder:text-[var(--ds-text-muted)] focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary)]/20"
                    />
                  </div>

                  <div>
                    <label
                      className="block text-[11px] font-medium text-[var(--ds-text-muted)]"
                      htmlFor="cockpit-montant"
                    >
                      Montant
                    </label>
                    <div className="relative mt-1">
                      <input
                        id="cockpit-montant"
                        type="text"
                        inputMode="decimal"
                        value={drawerMontant}
                        onChange={(e) => setDrawerMontant(e.target.value)}
                        placeholder="Automatique"
                        className="h-9 w-full rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 pr-12 text-sm text-[var(--ds-text)] outline-none transition-colors placeholder:text-[var(--ds-text-muted)] focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary)]/20"
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10.5px] uppercase tracking-wider text-[var(--ds-text-muted)]">
                        DA
                      </span>
                    </div>
                  </div>

                  {selectedDrawerProtocol && selectedDrawerProtocol.consommables.length > 0 && (
                    <details className="rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-bg)]/60 text-xs">
                      <summary className="cursor-pointer select-none px-3 py-2 font-medium text-[var(--ds-text)]">
                        Consommables ({selectedDrawerProtocol.consommables.length})
                      </summary>
                      <ul className="space-y-1.5 border-t border-[var(--ds-primary-border)] px-3 py-2">
                        {selectedDrawerProtocol.consommables.map((c) => {
                          const q = qtyByConsumableId[c.id] ?? c.quantite;
                          return (
                            <li
                              key={c.id}
                              className="flex items-center justify-between gap-2"
                            >
                              <span className="min-w-0 flex-1 truncate text-[var(--ds-text)]">
                                {c.nom}
                              </span>
                              <div className="flex shrink-0 items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setQtyByConsumableId((prev) => ({
                                      ...prev,
                                      [c.id]: Math.max(
                                        0,
                                        (prev[c.id] ?? c.quantite) - 1,
                                      ),
                                    }))
                                  }
                                  className="flex h-6 w-6 items-center justify-center rounded-md border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] text-xs font-semibold text-[var(--ds-text)] transition-colors hover:bg-[var(--ds-primary-soft)]"
                                  aria-label="Diminuer"
                                >
                                  −
                                </button>
                                <span className="w-6 text-center font-semibold tabular-nums text-[var(--ds-text)]">
                                  {q}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setQtyByConsumableId((prev) => ({
                                      ...prev,
                                      [c.id]: (prev[c.id] ?? c.quantite) + 1,
                                    }))
                                  }
                                  className="flex h-6 w-6 items-center justify-center rounded-md border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] text-xs font-semibold text-[var(--ds-text)] transition-colors hover:bg-[var(--ds-primary-soft)]"
                                  aria-label="Augmenter"
                                >
                                  +
                                </button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </details>
                  )}
                </section>

                <hr className="border-[var(--ds-primary-border)]" />

                {/* SECTION 4 — SUIVI & CONTRÔLE */}
                <section className="space-y-2">
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ds-text-muted)]">
                    Suivi &amp; contrôle
                  </h4>

                  <div className="rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 py-3 space-y-2">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-[var(--ds-text-subtle)]">
                        Prochaine étape
                      </p>
                      <input
                        type="text"
                        value={prochaineEtape}
                        onChange={(e) => {
                          const v = e.target.value;
                          setProchaineEtape(v);
                          setAllTreatments((prev) =>
                            upsertToothStateRow(prev, selectedTooth, {
                              prochaine_etape: v.trim() ? v : null,
                            }),
                          );
                        }}
                        placeholder="Ex: Empreinte, Pose couronne, Détartrage..."
                        className="mt-1 h-9 w-full rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 text-sm text-[var(--ds-text)] outline-none transition-colors placeholder:text-[var(--ds-text-muted)] focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary)]/20"
                      />
                    </div>

                    <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                      <div>
                        <label
                          className="block text-[11px] font-medium text-[var(--ds-text-muted)]"
                          htmlFor="cockpit-controle"
                        >
                          Contrôle prévu
                        </label>
                        <input
                          id="cockpit-controle"
                          type="date"
                          value={controlePrevu}
                          onChange={(e) => {
                            const v = e.target.value;
                            setControlePrevu(v);
                            setAllTreatments((prev) =>
                              upsertToothStateRow(prev, selectedTooth, {
                                controle_prevu: v.trim() ? v.trim() : null,
                              }),
                            );
                          }}
                          className="mt-1 h-9 w-full rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 text-sm text-[var(--ds-text)] outline-none transition-colors focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary)]/20"
                        />
                      </div>
                      <PrimaryButton
                        type="button"
                        disabled={!controlePrevu.trim()}
                        onClick={() => {
                          const day = controlePrevu.trim();
                          if (!day) return;
                          void (async () => {
                            const settings = getSettings();
                            const praticienFromSettings =
                              (typeof settings.praticien === "string" &&
                                settings.praticien.trim()) ||
                              `${String(settings.praticienPrenom ?? "").trim()} ${String(settings.praticienNom ?? "").trim()}`.trim() ||
                              null;
                            const res = await createAppointmentAction({
                              patient_id: id,
                              date: day,
                              heure: "09:00",
                              duree: 15,
                              type_acte: `Contrôle - Dent ${selectedTooth}`,
                              statut: "confirme",
                              notes: `Contrôle planifié depuis le cockpit clinique (dent ${selectedTooth}).`,
                              praticien: praticienFromSettings,
                              salle: null,
                            });
                            if (!res.ok) {
                              setToast({ type: "error", message: res.error });
                              return;
                            }
                            window.dispatchEvent(new Event(APPOINTMENTS_UPDATED_EVENT));
                            setToast({
                              type: "success",
                              message: "Contrôle planifié dans le planning.",
                            });
                          })();
                        }}
                        className="h-9 rounded-xl px-4 text-xs font-semibold"
                      >
                        Planifier
                      </PrimaryButton>
                    </div>
                  </div>
                </section>

                <hr className="border-[var(--ds-primary-border)]" />

                {/* SECTION 5 — NOTES CLINIQUES PAR SÉANCE */}
                <section className="space-y-2">
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ds-text-muted)]">
                    Notes cliniques par séance
                  </h4>

                  <div className="rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 py-3">
                    {seancesNotes.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-[var(--ds-primary-border)] bg-[var(--ds-bg)]/60 px-3 py-2.5 text-center text-[11.5px] text-[var(--ds-text-muted)]">
                        Aucune note
                      </p>
                    ) : (
                      <div className="space-y-3 border-l-2 border-[var(--ds-primary)] pl-3">
                        {seancesNotes
                          .slice()
                          .sort(
                            (a, b) =>
                              new Date(b.date).getTime() -
                              new Date(a.date).getTime(),
                          )
                          .map((n, idx) => (
                            <div key={`${n.date}-${idx}`} className="space-y-1">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="font-mono text-[10.5px] text-[var(--ds-text-muted)]">
                                  {formatClinicalDateFr(n.date)}
                                </span>
                                {n.praticien ? (
                                  <span className="text-[11px] text-[var(--ds-text-muted)]">
                                    {n.praticien}
                                  </span>
                                ) : null}
                              </div>
                              <div className="text-[12px] text-[var(--ds-text)]">
                                {n.texte}
                              </div>
                              <div className="h-px w-full bg-[var(--ds-primary-border)]" />
                            </div>
                          ))}
                      </div>
                    )}

                    <div className="mt-3 space-y-2">
                      <textarea
                        value={newSeanceNote}
                        onChange={(e) => setNewSeanceNote(e.target.value)}
                        rows={2}
                        placeholder="Ajouter une note…"
                        className="w-full resize-none rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 py-2 text-sm text-[var(--ds-text)] outline-none transition-colors placeholder:text-[var(--ds-text-muted)] focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary)]/20"
                      />
                      <button
                        type="button"
                        disabled={!newSeanceNote.trim()}
                        onClick={() => {
                          const txt = newSeanceNote.trim();
                          if (!txt) return;
                          const settings = getSettings();
                          const praticienFromSettings =
                            (typeof settings.praticien === "string" &&
                              settings.praticien.trim()) ||
                            `${String(settings.praticienPrenom ?? "").trim()} ${String(settings.praticienNom ?? "").trim()}`.trim() ||
                            undefined;

                          const entry: ClinicalSessionNote = {
                            date: new Date().toISOString(),
                            praticien: actPraticien.trim() || praticienFromSettings,
                            texte: txt,
                          };
                          const next = [entry, ...seancesNotes];
                          setSeancesNotes(next);
                          setNewSeanceNote("");
                          setAllTreatments((prev) =>
                            upsertToothStateRow(prev, selectedTooth, {
                              seances_notes: next,
                            }),
                          );
                        }}
                        className="h-9 w-full rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-bg)] text-xs font-semibold text-[var(--ds-text)] transition-colors hover:bg-[var(--ds-primary-soft)] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        + Ajouter une note
                      </button>
                    </div>
                  </div>
                </section>

                {/* Plan de traitement (inline) */}
                <section className="space-y-2">
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ds-text-muted)]">
                    Plan de traitement
                  </h4>

                  {treatmentPlan.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-[var(--ds-primary-border)] bg-[var(--ds-bg)]/60 px-3 py-2.5 text-center text-[11.5px] text-[var(--ds-text-muted)]">
                      Aucune séance planifiée
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {treatmentPlan.map((s, i) => (
                        <li
                          key={s.id}
                          className={[
                            "flex items-center gap-2 rounded-xl border px-3 py-2",
                            s.done
                              ? "border-emerald-100 bg-emerald-50"
                              : "border-[var(--ds-primary-border)] bg-[var(--ds-bg)]",
                          ].join(" ")}
                        >
                          <input
                            type="checkbox"
                            checked={s.done}
                            onChange={() =>
                              setTreatmentPlan((prev) =>
                                prev.map((x) =>
                                  x.id === s.id ? { ...x, done: !x.done } : x,
                                ),
                              )
                            }
                            className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-[var(--ds-primary)]"
                          />
                          <span
                            className={[
                              "min-w-0 flex-1 truncate text-xs",
                              s.done
                                ? "text-[var(--ds-text-muted)] line-through"
                                : "text-[var(--ds-text)]",
                            ].join(" ")}
                          >
                            Séance {i + 1} — {s.label}
                          </span>
                          {s.cout > 0 && (
                            <span className="shrink-0 font-mono text-[11px] font-semibold tabular-nums text-[var(--ds-primary)]">
                              {s.cout.toLocaleString("fr-DZ")} DA
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              setTreatmentPlan((prev) =>
                                prev.filter((x) => x.id !== s.id),
                              )
                            }
                            aria-label="Supprimer"
                            className="shrink-0 text-[var(--ds-text-muted)] transition-colors hover:text-red-500"
                          >
                            <X className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newSeanceLabel}
                      onChange={(e) => setNewSeanceLabel(e.target.value)}
                      placeholder="Nouvelle séance"
                      className="h-9 min-w-0 flex-1 rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 text-sm text-[var(--ds-text)] outline-none focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary)]/20"
                    />
                    <input
                      type="number"
                      value={newSeanceCout}
                      onChange={(e) => setNewSeanceCout(e.target.value)}
                      placeholder="DA"
                      className="h-9 w-24 rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 text-sm text-[var(--ds-text)] outline-none focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary)]/20"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!newSeanceLabel.trim()) return;
                      setTreatmentPlan((prev) => [
                        ...prev,
                        {
                          id: Date.now().toString(),
                          label: newSeanceLabel.trim(),
                          acte: newSeanceActe.trim(),
                          cout: parseInt(newSeanceCout, 10) || 0,
                          done: false,
                        },
                      ]);
                      setNewSeanceLabel("");
                      setNewSeanceActe("");
                      setNewSeanceCout("");
                    }}
                    disabled={!newSeanceLabel.trim()}
                    className="h-9 w-full rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-bg)] text-xs font-medium text-[var(--ds-text)] transition-colors hover:bg-[var(--ds-primary-soft)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    + Ajouter cette séance
                  </button>
                </section>

                {/* Actions secondaires : Marquer absente + Surveiller */}
                {confirmAbsent === selectedTooth ? (
                  <div className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-3">
                    <p className="text-center text-xs font-medium text-red-700">
                      Confirmer que la dent {selectedTooth} est absente ?
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setDentsStatus((prev) => ({
                            ...prev,
                            [selectedTooth as ToothId]: "absente",
                          }));
                          setConfirmAbsent(null);
                          setSelectedTooth(null);
                        }}
                        className="flex-1 rounded-lg bg-red-600 px-2 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-700"
                      >
                        Confirmer
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmAbsent(null)}
                        className="flex-1 rounded-lg border border-[var(--ds-primary-border)] px-2 py-1.5 text-xs font-medium text-[var(--ds-text-muted)] transition-colors hover:bg-[var(--ds-primary-soft)]"
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    {dentsStatus[selectedTooth as ToothId] !== "absente" ? (
                      <button
                        type="button"
                        onClick={() => setConfirmAbsent(selectedTooth)}
                        className="flex-1 rounded-lg border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-2 py-1.5 text-xs font-medium text-[var(--ds-text-muted)] transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                      >
                        ○ Marquer absente
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setDentsStatus((prev) => ({
                            ...prev,
                            [selectedTooth as ToothId]: "healthy",
                          }));
                          setSelectedTooth(null);
                        }}
                        className="flex-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
                      >
                        ✓ Restaurer
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setWatchedTeeth((prev) => {
                          const next = new Set(prev);
                          if (next.has(selectedTooth)) next.delete(selectedTooth);
                          else next.add(selectedTooth);
                          if (id) {
                            void mergePatientUiStateAction(id, {
                              watched_teeth: [...next],
                            });
                          }
                          return next;
                        })
                      }
                      className={[
                        "flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors",
                        watchedTeeth.has(selectedTooth)
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : "border-[var(--ds-primary-border)] bg-[var(--ds-surface)] text-[var(--ds-text-muted)] hover:border-amber-200 hover:bg-amber-50 hover:text-amber-700",
                      ].join(" ")}
                    >
                      ◎{" "}
                      {watchedTeeth.has(selectedTooth) ? "Surveillée" : "Surveiller"}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* FOOTER */}
          <footer className="shrink-0 space-y-1.5 border-t border-[var(--ds-primary-border)] bg-[var(--ds-bg)]/80 px-5 py-3 backdrop-blur-sm">
            <RoleGate
              role={["admin", "praticien"]}
              fallback={
                <div className="rounded-xl border border-dashed border-[var(--ds-primary-border)] bg-[var(--ds-primary-soft)]/40 px-3 py-2 text-center text-xs text-[var(--ds-text-muted)]">
                  Odontogramme en lecture seule pour votre rôle
                </div>
              }
            >
              <PrimaryButton
                type="button"
                disabled={validateSoinLoading}
                isLoading={validateSoinLoading}
                onClick={() => void handleValidateClinicalAct()}
                className="h-11 w-full rounded-xl text-sm font-semibold shadow-lg shadow-[color-mix(in_srgb,var(--ds-primary)_25%,transparent)] disabled:shadow-none"
              >
                ✓ Valider le soin
              </PrimaryButton>
            </RoleGate>
            <button
              type="button"
              onClick={() => setSelectedTooth(null)}
              className="h-8 w-full rounded-xl text-xs text-[var(--ds-text-muted)] transition-colors hover:bg-[var(--ds-primary-soft)]"
            >
              Annuler
            </button>
          </footer>
        </aside>
      </>

      {toast ? (
        <div
          role="status"
          className={[
            "fixed bottom-6 right-6 z-[100] max-w-sm rounded-2xl px-4 py-3 text-sm font-medium shadow-lg",
            toast.type === "success"
              ? "bg-emerald-600 text-white"
              : toast.type === "warning"
                ? "bg-amber-600 text-white"
                : "bg-red-600 text-white",
          ].join(" ")}
        >
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}

