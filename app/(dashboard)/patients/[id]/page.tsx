"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar,
  ChevronLeft,
  CreditCard,
  DownloadCloud,
  MoreVertical,
  Receipt,
  Download,
  ExternalLink,
  Eye,
  FileImage,
  FileText,
  Mail,
  Phone,
  Plus,
  Pencil,
  Sparkles,
  UploadCloud,
  X,
  Loader2,
  Search,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Trash2,
} from "lucide-react";
import { submitClinicalActAction } from "@/app/actions/clinicalAct";
import { CatalogActCombobox } from "@/components/catalog/CatalogActCombobox";
import {
  buildProtocolesFromSeed,
  loadProtocolsFromStorage,
  saveProtocolsToStorage,
  type ProtocolForSettings,
} from "@/lib/onboarding/seedDefaultProtocols";
import { consumableLabelToStockProductId } from "@/lib/mapping/consumableNameToStockProductId";
import {
  consumeStockForAct,
  loadDentalStock,
  loadProtocols,
  saveDentalStock,
} from "@/utils/stockLogic";
import {
  PrescriptionModal,
  type PrescriptionItem,
} from "@/components/patients/PrescriptionModal";
import { formatDZD, formatDate, formatPhoneNumber } from "@/utils/formatters";
import { generateOrdonnancePDF } from "@/utils/generateOrdonnancePDF";
import {
  readFacturesFromStorage,
  writeFacturesToStorage,
} from "@/utils/factureDocuments";
import {
  ensureCatalogSeeded,
  readCatalogFromStorage,
  type DentalCatalogAct,
} from "@/utils/dentalCatalogActs";
import {
  ensurePatientsHydrated,
  readPatientsFromStorage,
  syncPatientFromProfile,
  touchPatientDerniereVisite,
} from "@/utils/patientData";
import {
  addPatientDocument,
  ensurePatientDocumentsForPatient,
  fileToDataUrl,
  inferDroppedFileKind,
  listDocumentsForPatient,
  removePatientDocument,
  defaultCategoryForDropped,
  type PatientDocument,
} from "@/utils/patientDocuments";
import {
  DentalChart as DentalChartComponent,
  type ToothId,
  type ToothStatus,
} from "@/components/dentition/DentalChart";

function getSettings(): Record<string, unknown> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem("dental_settings");
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const STERILIZATION_LS_KEY = "dental_sterilization_data";

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
function tryMarkSterilizationKitSale(protocolCategory: string):
  | { used: true; typeLabel: string; numero: number }
  | { used: false; typeLabel: string } {
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
    const raw = localStorage.getItem(STERILIZATION_LS_KEY);
    const sterData: SterilizationStorage = raw
      ? (JSON.parse(raw) as SterilizationStorage)
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
      localStorage.setItem(STERILIZATION_LS_KEY, JSON.stringify(sterData));
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

    localStorage.setItem(STERILIZATION_LS_KEY, JSON.stringify(sterData));
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
  email: string;
  dateNaissance: string;
  alerts: string[];
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
    email: "karim.haddad@email.fr",
    dateNaissance: "1982-04-14",
    alerts: ["Allergie Pénicilline", "Hypertendu"],
  },
  "2": {
    id: "2",
    nom: "Sarah Benali",
    age: 31,
    genre: "Femme",
    profession: "Assistante médicale",
    adresse: "45 avenue Emir Abdelkader, Oran",
    telephone: "06 98 76 54 32",
    email: "sarah.benali@email.fr",
    dateNaissance: "1995-08-03",
    alerts: ["Allergie Latex"],
  },
  "3": {
    id: "3",
    nom: "Marie Dupont",
    age: 42,
    genre: "Femme",
    profession: "Cadre administratif",
    adresse: "8 boulevard Zighout Youcef, Constantine",
    telephone: "07 11 22 33 44",
    email: "marie.dupont@email.fr",
    dateNaissance: "1984-01-27",
    alerts: ["Diabète de type 2"],
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

function computeAgeFromDate(dateValue: string) {
  if (!dateValue) return 0;
  const dob = new Date(dateValue);
  if (Number.isNaN(dob.getTime())) return 0;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
  return Math.max(0, age);
}

function formatDateDDMMYYYY(date: Date) {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = String(date.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

function formatAmountDA(value: number) {
  return `${new Intl.NumberFormat("fr-FR").format(value)} DA`;
}

type PatientTreatmentRow = {
  tooth: number;
  category: string;
  acte: string;
  date: string;
  notes?: string;
  lt?: string;
};

/** Schéma dentaire aligné sur l’historique des actes (localStorage / cockpit). */
function buildDentsStatusFromTreatments(
  treatments: PatientTreatmentRow[],
): Record<ToothId, ToothStatus> {
  const next = Object.fromEntries(
    ALL_TOOTH_IDS.map((tid) => [tid, "healthy" as ToothStatus]),
  ) as Record<ToothId, ToothStatus>;
  for (const t of treatments) {
    if (!ALL_TOOTH_IDS.includes(t.tooth as ToothId)) continue;
    next[t.tooth as ToothId] = protocolCategoryToToothStatus(t.category);
  }
  return next;
}

const MOCK_ALL_TREATMENTS: PatientTreatmentRow[] = [
  {
    tooth: 21,
    category: "Chirurgie",
    acte: "Extraction simple",
    date: "2026-03-21T09:00:00Z",
    notes:
      "Extraction sous AL (Articaïne 4%). Détorsion/luxation contrôlées. Alvéole nettoyée, saignement maîtrisé. Pansement mis en place + consignes post-opératoires remises.",
    lt: "",
  },
  {
    tooth: 16,
    category: "Soins",
    acte: "Composite 2 faces",
    date: "2026-03-17T10:00:00Z",
    notes:
      "Mise en place de digue. Préparation et conditionnement de la cavité. Insertion composite, finition/polissage. Contrôle de l'occlusion.",
    lt: "",
  },
  {
    tooth: 15,
    category: "Soins",
    acte: "Traitement canalaire (Prémolaire)",
    date: "2026-03-15T10:00:00Z",
    notes:
      "Accès canalaire, mise en forme, irrigation et obturation provisoire. Contrôle radiographique de la longueur de travail.",
    lt: "18.5",
  },
  {
    tooth: 35,
    category: "Orthopédie",
    acte: "Gouttière occlusale",
    date: "2026-03-10T10:00:00Z",
    notes:
      "Empreinte et conception. Ajustement initial sur articulateur. Conseils d'utilisation et rappel pour re-évaluation à J+10.",
    lt: "",
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
  const isCbct =
    doc.type === "cbct" || doc.nom.toLowerCase().includes("cbct");
  if (isCbct) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[var(--ds-primary-border)]">
        <FileText className="h-10 w-10 text-[var(--ds-text-muted)]" aria-hidden />
      </div>
    );
  }
  if (doc.type === "pdf") {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[var(--ds-primary-soft)]">
        {/* icône fichier PDF (asset demandé) */}
        <img
          src="/image_1.png"
          alt=""
          className="h-16 w-16 object-contain opacity-90"
        />
      </div>
    );
  }
  if (doc.type === "image" && doc.url) {
    return (
      <img
        src={doc.url}
        alt=""
        className="h-full w-full object-cover"
      />
    );
  }
  if (doc.type === "image") {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[var(--ds-primary-soft)]">
        <img
          src="/image_0.png"
          alt=""
          className="h-16 w-16 object-contain opacity-90"
        />
      </div>
    );
  }
  if (doc.url) {
    return (
      <img
        src={doc.url}
        alt=""
        className="h-full w-full object-cover"
      />
    );
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-[var(--ds-primary-border)]">
      <FileImage className="h-10 w-10 text-[var(--ds-text-muted)]" aria-hidden />
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
    email: "—",
    dateNaissance: "",
    alerts: [],
  });
  const [editPatientName, setEditPatientName] = useState("");
  const [editPatientGender, setEditPatientGender] = useState("");
  const [editPatientProfession, setEditPatientProfession] = useState("");
  const [editPatientAddress, setEditPatientAddress] = useState("");
  const [editPatientPhone, setEditPatientPhone] = useState("");
  const [editPatientEmail, setEditPatientEmail] = useState("");
  const [editPatientDob, setEditPatientDob] = useState("");
  const [editPatientAlerts, setEditPatientAlerts] = useState("");

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
  const [financesHydrated, setFinancesHydrated] = useState(false);

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

  const [allTreatments, setAllTreatments] = useState<PatientTreatmentRow[]>(
    [],
  );

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !id) return;
    ensurePatientsHydrated();
    const list = readPatientsFromStorage();
    if (list.some((p) => p.id === id)) return;
    const rawProfile = localStorage.getItem(`patient_profile_${id}`);
    if (rawProfile) {
      try {
        const p = JSON.parse(rawProfile) as {
          nom?: string;
          telephone?: string;
        };
        if (typeof p.nom === "string") {
          syncPatientFromProfile({
            id,
            nomComplet: p.nom,
            telephone:
              typeof p.telephone === "string" ? p.telephone : "—",
          });
        }
      } catch {
        /* ignore */
      }
      return;
    }
    const mock = MOCK_PROFILES[id];
    if (mock) {
      syncPatientFromProfile({
        id,
        nomComplet: mock.nom,
        telephone: mock.telephone,
      });
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const fallback: PatientProfile = MOCK_PROFILES[id] ?? {
      id,
      nom: `Patient #${id}`,
      age: 0,
      genre: "—",
      profession: "—",
      adresse: "—",
      telephone: "—",
      email: "—",
      dateNaissance: "",
      alerts: [],
    };
    if (typeof window === "undefined") {
      setPatientProfile(fallback);
      return;
    }
    const raw = localStorage.getItem(`patient_profile_${id}`);
    if (!raw) {
      setPatientProfile(fallback);
      return;
    }
    try {
      const saved = JSON.parse(raw) as Partial<PatientProfile>;
      setPatientProfile({ ...fallback, ...saved, id });
    } catch {
      setPatientProfile(fallback);
    }
  }, [id]);

  useEffect(() => {
    if (typeof window === "undefined" || !id) return;
    const saved = localStorage.getItem(`patient_acts_${id}`);
    if (saved) {
      setAllTreatments(JSON.parse(saved) as PatientTreatmentRow[]);
    } else {
      setAllTreatments(MOCK_ALL_TREATMENTS);
    }
  }, [id]);

  useEffect(() => {
    if (typeof window === "undefined" || !id) return;
    const savedFinances = localStorage.getItem(`patient_finances_${id}`);
    if (savedFinances) {
      try {
        const parsed = JSON.parse(savedFinances) as FinanceLine[];
        setFinances(
          parsed.map((l) => ({
            ...(l as FinanceLine),
            statut: financeStatutFromReste(
              (l as FinanceLine).montantTotal,
              (l as FinanceLine).resteACharge,
            ),
          })),
        );
      } catch {
        setFinances([]);
      }
    } else {
      setFinances([]);
    }
    setFinancesHydrated(true);
  }, [id]);

  useEffect(() => {
    if (isMounted && allTreatments.length > 0) {
      localStorage.setItem(
        `patient_acts_${id}`,
        JSON.stringify(allTreatments),
      );
    }
  }, [allTreatments, isMounted, id]);

  useEffect(() => {
    if (typeof window === "undefined" || !id || !financesHydrated) return;
    localStorage.setItem(`patient_finances_${id}`, JSON.stringify(finances));
  }, [finances, financesHydrated, id]);

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

  useEffect(() => {
    setDentsStatus(buildDentsStatusFromTreatments(allTreatments));
  }, [allTreatments]);

  // Slide-over Cockpit — protocoles (20) + ajustement consommables
  const [selectedTooth, setSelectedTooth] = useState<number | null>(null);
  const [clinicalProtocolsList, setClinicalProtocolsList] = useState<
    ProtocolForSettings[]
  >([]);
  const [drawerProtocolId, setDrawerProtocolId] = useState<string>("");
  const [protocolSearchQuery, setProtocolSearchQuery] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    () => new Set(),
  );
  const prevProtocolSearchRef = useRef("");
  const [qtyByConsumableId, setQtyByConsumableId] = useState<
    Record<string, number>
  >({});
  const [toothNotes, setToothNotes] = useState("");
  const WATCHED_KEY = `oryx_watched_${id}`;
  const [watchedTeeth, setWatchedTeeth] = useState<Set<number>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = localStorage.getItem(WATCHED_KEY);
      return raw ? new Set(JSON.parse(raw) as number[]) : new Set();
    } catch {
      return new Set();
    }
  });
  const [confirmAbsent, setConfirmAbsent] = useState<number | null>(null);
  const [validateSoinLoading, setValidateSoinLoading] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const [showTreatmentPlan, setShowTreatmentPlan] = useState(false);
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

  const [timeline, setTimeline] = useState<
    { date: string; titre: string; note: string }[]
  >([
    {
      date: "2026-03-12T10:00:00Z",
      titre: "Détartrage et polissage",
      note: "Contrôle parodontite léger + conseils d’hygiène bucco-dentaire.",
    },
    {
      date: "2026-02-05T10:00:00Z",
      titre: "Urgence pulpite dent 46",
      note: "Analgésie, traitement initial et planification du suivi.",
    },
    {
      date: "2026-01-18T10:00:00Z",
      titre: "Contrôle & radiographie",
      note: "Bilan périapical et revue du plan de soins.",
    },
  ]);
  const [isAiAssistantModalOpen, setIsAiAssistantModalOpen] = useState(false);
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [aiGeneratedText, setAiGeneratedText] = useState("");

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
    let list = loadProtocolsFromStorage(localStorage);
    if (!list || list.length === 0) {
      list = buildProtocolesFromSeed();
      saveProtocolsToStorage(localStorage, list);
    }
    setClinicalProtocolsList(list);
  }, []);

  useEffect(() => {
    if (selectedTooth !== null) return;
    setDrawerProtocolId("");
    setQtyByConsumableId({});
    setToothNotes("");
  }, [selectedTooth]);

  useEffect(() => {
    setConfirmAbsent(null);
  }, [selectedTooth]);

  useEffect(() => {
    if (typeof window === "undefined" || !id) return;
    try {
      const raw = localStorage.getItem(`oryx_watched_${id}`);
      setWatchedTeeth(raw ? new Set(JSON.parse(raw) as number[]) : new Set());
    } catch {
      setWatchedTeeth(new Set());
    }
  }, [id]);

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

  useEffect(() => {
    if (selectedTooth !== null) {
      setProtocolSearchQuery("");
      setExpandedCategories(new Set());
    }
  }, [selectedTooth]);

  const protocolsByCategory = useMemo(() => {
    const q = protocolSearchQuery.trim().toLowerCase();
    const filtered = clinicalProtocolsList.filter((p) =>
      q === "" ? true : p.nom.toLowerCase().includes(q),
    );
    const order: string[] = [];
    const map = new Map<string, ProtocolForSettings[]>();
    for (const p of filtered) {
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
  }, [clinicalProtocolsList, protocolSearchQuery]);

  /** Recherche active : ouvrir toutes les catégories qui ont des résultats ; effacement : tout replier. */
  useEffect(() => {
    const q = protocolSearchQuery.trim();
    if (q !== "") {
      setExpandedCategories(
        new Set(protocolsByCategory.map((x) => x.category)),
      );
    } else if (prevProtocolSearchRef.current.trim() !== "") {
      setExpandedCategories(new Set());
    }
    prevProtocolSearchRef.current = protocolSearchQuery;
  }, [protocolSearchQuery, protocolsByCategory]);

  const displayFullName = `${capitalize(patientProfile.prenom ?? "")} ${capitalize(patientProfile.nom ?? "")}`.trim();

  function openEditPatientModal() {
    setEditPatientName(patientProfile.nom);
    setEditPatientGender(patientProfile.genre);
    setEditPatientProfession(patientProfile.profession);
    setEditPatientAddress(patientProfile.adresse);
    setEditPatientPhone(patientProfile.telephone);
    setEditPatientEmail(patientProfile.email);
    setEditPatientDob(patientProfile.dateNaissance);
    setEditPatientAlerts(patientProfile.alerts.join(", "));
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
      email: editPatientEmail.trim() || "—",
      dateNaissance: editPatientDob,
      age: editPatientDob ? computeAgeFromDate(editPatientDob) : patientProfile.age,
      alerts: editPatientAlerts
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    };
    setPatientProfile(nextProfile);
    localStorage.setItem(`patient_profile_${id}`, JSON.stringify(nextProfile));
    syncPatientFromProfile({
      id,
      nomComplet: nextProfile.nom,
      telephone: nextProfile.telephone,
    });
    setIsEditPatientModalOpen(false);
  }

  const selectedDrawerProtocol =
    drawerProtocolId !== ""
      ? clinicalProtocolsList.find((p) => p.id === drawerProtocolId) ?? null
      : null;

  const totalFacture = finances.reduce((acc, f) => acc + f.montantTotal, 0);
  const totalResteACharge = finances.reduce(
    (acc, f) => acc + f.resteACharge,
    0
  );

  async function handleValidateClinicalAct() {
    if (selectedTooth === null || !selectedDrawerProtocol) return;
    const clinicId = process.env.NEXT_PUBLIC_CLINIC_ID;
    if (!clinicId) {
      setToast({
        type: "error",
        message: "Erreur de configuration : ID du cabinet manquant",
      });
      return;
    }
    const protocol = selectedDrawerProtocol;
    const consumables: { stockProductId: string; quantity: number }[] = [];
    for (const c of protocol.consommables) {
      const qty = qtyByConsumableId[c.id] ?? c.quantite;
      if (qty <= 0) continue;
      const sid = consumableLabelToStockProductId(c.nom);
      consumables.push({ stockProductId: sid, quantity: qty });
    }
    const toothNum = selectedTooth;
    setValidateSoinLoading(true);
    try {
      const res = await submitClinicalActAction({
        patientId: id,
        protocolId: protocol.id,
        clinicId,
        consumables,
      });
      if (res.ok) {
        const protocolsMap = loadProtocols();
        const currentStock = loadDentalStock();
        const nextStock = consumeStockForAct(
          protocol.nom,
          currentStock,
          protocolsMap,
        );
        saveDentalStock(nextStock);

        const kitDeduction = tryMarkSterilizationKitSale(protocol.categorie);
        const toastMessage = kitDeduction.used
          ? `Acte enregistré avec succès. Kit ${kitDeduction.typeLabel} #${kitDeduction.numero} marqué comme sale.`
          : `Acte enregistré avec succès. Attention : Aucun kit ${kitDeduction.typeLabel} stérile disponible !`;
        setToast({
          type: kitDeduction.used ? "success" : "error",
          message: toastMessage,
        });
        setDentsStatus((prev) => ({
          ...prev,
          [toothNum as ToothId]: protocolCategoryToToothStatus(protocol.categorie),
        }));
        setAllTreatments((prev) => {
          const row = {
            tooth: toothNum,
            category: protocol.categorie,
            acte: protocol.nom,
            date: new Date().toISOString(),
            notes: toothNotes || undefined,
          };
          const exists = prev.some((t) => t.tooth === toothNum);
          if (exists) {
            return prev.map((t) => (t.tooth === toothNum ? row : t));
          }
          return [row, ...prev];
        });
        setTimeline((prev) => [
          {
            date: new Date().toISOString(),
            titre: protocol.nom,
            note: `Dent ${toothNum}. ${toothNotes.trim() || "Acte enregistré via protocole."}`,
          },
          ...prev,
        ]);
        touchPatientDerniereVisite(id);
        // Création automatique de la ligne finance
        const autoFinanceLine: FinanceLine = {
          id: res.data.invoiceLineId,
          acteName: protocol.nom,
          date: new Date().toISOString(),
          montantTotal: Math.round(res.data.amountCents / 100),
          resteACharge: Math.round(res.data.amountCents / 100),
          statut: "En attente",
          catalogActId: protocol.id,
        };
        setFinances((prev) => {
          const exists = prev.some((f) => f.id === autoFinanceLine.id);
          if (exists) return prev;
          return [autoFinanceLine, ...prev];
        });
        upsertGlobalFactureFromFinanceLine(autoFinanceLine);
        setSelectedTooth(null);
        setShowTreatmentPlan(false);
      } else {
        setToast({ type: "error", message: res.error });
      }
    } finally {
      setValidateSoinLoading(false);
    }
  }

  /** Synchronise la liste globale des factures (même clé que l'onglet Recettes / Finances). */
  function upsertGlobalFactureFromFinanceLine(line: FinanceLine) {
    if (typeof window === "undefined") return;
    const docs = readFacturesFromStorage();
    const paye = Math.min(
      Math.max(0, line.montantTotal - line.resteACharge),
      line.montantTotal,
    );
    const idx = docs.findIndex((d) => d.financeLineId === line.id);
    const dateStr = formatDateDDMMYYYY(new Date(line.date));
    if (idx >= 0) {
      docs[idx] = {
        ...docs[idx],
        patient: displayFullName,
        patientId: id,
        date: dateStr,
        montantTotal: line.montantTotal,
        montantPaye: paye,
        financeLineId: line.id,
      };
    } else {
      docs.unshift({
        id: `FCT-2026-${Math.floor(Math.random() * 900 + 100)}`,
        date: dateStr,
        patient: displayFullName,
        patientId: id,
        montantTotal: line.montantTotal,
        montantPaye: paye,
        financeLineId: line.id,
      });
    }
    writeFacturesToStorage(docs);
  }

  function removeGlobalFactureByFinanceLineId(financeLineId: string) {
    if (typeof window === "undefined") return;
    const docs = readFacturesFromStorage().filter(
      (d) => d.financeLineId !== financeLineId,
    );
    writeFacturesToStorage(docs);
  }

  function openAiAssistantModal() {
    setIsAiAssistantModalOpen(true);
    setIsAiGenerating(true);
    setAiGeneratedText("");
    window.setTimeout(() => {
      const latestFinance = finances[0] as
        | (FinanceLine & { description?: string })
        | undefined;
      const motif = latestFinance?.description ?? "Consultation de suivi";
      const acte = latestFinance?.acteName ?? "Contrôle dentaire";
      const generated = `Compte-rendu du ${new Date().toLocaleDateString()} :
Patient(e) ${displayFullName}, ${patientProfile.age} ans.
Motif : ${motif}.
Examen clinique : Muqueuses saines, absence d'inflammation notable.
Acte réalisé : ${acte}.
Recommandations : Poursuite du protocole d'hygiène actuel. Prochain rendez-vous de contrôle dans 6 mois.`;
      setAiGeneratedText(generated);
      setIsAiGenerating(false);
    }, 2500);
  }

  function handleInsertAiSummary() {
    if (!aiGeneratedText.trim()) return;
    setTimeline((prev) => [
      {
        date: new Date().toISOString(),
        titre: "Compte-rendu IA",
        note: aiGeneratedText,
      },
      ...prev,
    ]);
    setIsAiAssistantModalOpen(false);
    setToast({
      type: "success",
      message: "Le compte-rendu IA a été ajouté au dossier médical.",
    });
  }

  return (
    <div className="bg-[var(--ds-bg)] min-h-screen p-6">
      <div className="flex flex-col gap-6">
        {/* En-tête */}
        <div className="flex items-center gap-3">
          <Link
            href="/patients"
            className="inline-flex items-center gap-2 text-xs font-medium text-[var(--ds-text-muted)] hover:text-[color:var(--ds-primary)]"
          >
            <ChevronLeft className="h-4 w-4" />
            Retour aux patients
          </Link>
        </div>

        {/* Section Haut : Profil + Fiche Clinique (gauche) / Schéma Dentaire (droite) */}
        <div className="grid lg:grid-cols-12 gap-6 items-stretch">
          {/* Colonne patient (gauche) */}
          <aside className="lg:col-span-4 flex flex-col gap-4 h-full">
            {/* Profil Patient */}
            <section className="rounded-3xl bg-[var(--ds-surface)] p-4 shadow-sm h-full">
              <div className="flex flex-col gap-3 h-full">
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-[var(--ds-primary)] text-white text-lg font-bold">
                    {capitalize(patientProfile.prenom ?? "").charAt(0)}
                    {capitalize(patientProfile.nom ?? "").charAt(0)}
                  </div>

                  <div className="flex flex-col gap-2 min-w-0">
                    <h1 className="text-xl font-bold text-[var(--ds-text)] leading-tight">
                      {capitalize(patientProfile.prenom ?? "")}{" "}
                      {capitalize(patientProfile.nom ?? "")}
                    </h1>

                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() =>
                          router.push(
                            `/planning?patientId=${id}&patientName=${encodeURIComponent(
                              `${patientProfile.prenom ?? ""} ${patientProfile.nom}`.trim(),
                            )}`,
                          )
                        }
                        className="flex items-center gap-2 rounded-xl border border-[var(--ds-primary)]/30 px-4 py-1.5 text-sm font-medium text-[var(--ds-primary)] hover:bg-[var(--ds-primary-soft)] transition-all"
                      >
                        <Calendar className="h-4 w-4" />
                        Planifier un RDV
                      </button>

                      <button
                        type="button"
                        onClick={openEditPatientModal}
                        className="inline-flex items-center gap-1 text-xs font-medium text-[var(--ds-text-muted)] transition-colors hover:text-[var(--ds-primary)]"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Modifier
                      </button>
                    </div>
                  </div>
                </div>

                <p className="mt-1 text-xs text-[var(--ds-text-muted)]">
                  {patientProfile.age ? `${patientProfile.age} ans` : "Âge inconnu"} ·{" "}
                  {patientProfile.profession}
                </p>

                {/* Contact */}
                <div className="space-y-2">
                  <div className="w-full rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 py-2">
                    <p className="text-xs font-medium text-[var(--ds-text-muted)]">
                      Numéro de téléphone :
                    </p>
                    <div className="mt-1 flex items-center justify-between">
                      <div className="flex min-w-0 flex-1 items-center gap-2 text-sm text-[var(--ds-text)]">
                        <Phone
                          className="h-4 w-4 shrink-0 text-[var(--ds-text-muted)]"
                          aria-hidden
                        />
                        <span className="truncate">
                          {formatPhoneNumber(patientProfile.telephone)}
                        </span>
                      </div>

                      <div className="flex flex-shrink-0 items-center gap-1.5">
                        <a
                          href={`tel:${patientProfile.telephone.replace(/\s/g, "")}`}
                          className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--ds-primary-soft)] text-[var(--ds-primary)] transition-all hover:bg-[var(--ds-primary)] hover:text-white"
                          title="Appeler"
                        >
                          <Phone className="h-3.5 w-3.5" />
                        </a>

                        <a
                          href={`https://wa.me/${patientProfile.telephone
                            .replace(/\s/g, "")
                            .replace(/^0/, "213")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 transition-all hover:bg-emerald-500 hover:text-white"
                          title="WhatsApp"
                        >
                          <svg
                            className="h-3.5 w-3.5"
                            viewBox="0 0 16 16"
                            fill="currentColor"
                            aria-hidden
                          >
                            <path d="M13.601 2.326A7.85 7.85 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.9 7.9 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.9 7.9 0 0 0 13.6 2.326zM7.994 14.521a6.6 6.6 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.56 6.56 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592m3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.73.73 0 0 0-.529.247c-.182.198-.691.677-.691 1.654s.71 1.916.81 2.049c.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232" />
                          </svg>
                        </a>
                      </div>
                    </div>
                  </div>

                  <div className="w-full rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 py-2">
                    <p className="text-xs font-medium text-[var(--ds-text-muted)]">
                      Adresse email :
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-sm text-[var(--ds-text)]">
                      <Mail className="h-4 w-4 text-[var(--ds-text-muted)]" aria-hidden />
                      <span className="truncate">{patientProfile.email}</span>
                    </div>
                  </div>
                </div>

                {/* Alertes Médicales (remontées sous l'email) */}
                <div className="mt-2 w-full">
                  <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-3 w-full">
                    <p className="text-xs font-semibold uppercase tracking-wider text-red-400">
                      Alertes Médicales
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {patientProfile.alerts.length === 0 ? (
                        <span className="text-xs text-red-400/70">Aucune</span>
                      ) : (
                        patientProfile.alerts.map((a) => (
                          <span
                            key={a}
                            className="inline-flex rounded-lg bg-red-500/10 px-2.5 py-1 text-[11px] font-semibold text-red-400"
                          >
                            {a}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Fiche Clinique Multi-Actes (La Liste) — contenu LS après hydratation */}
            {allTreatments.length > 0 && (
              <section className="w-full bg-[var(--ds-surface)] rounded-3xl p-6 shadow-sm">
                <h2 className="text-base font-semibold tracking-tight text-[color:var(--ds-text)]">
                  Cockpit Clinique / Actes Enregistrés
                </h2>

                <div className="mt-4 space-y-4 pr-2 overflow-y-auto max-h-80">
                  {isMounted ? (
                    allTreatments.map((acte, idx) => {
                    const isSoins =
                      acte.category === "Soins" ||
                      acte.category === "Endodontie";
                    const isOrthopedie = acte.category === "Orthopédie";
                    const isChirurgie = acte.category === "Chirurgie";

                    const bgClass = isSoins
                      ? "bg-red-500/10"
                      : isOrthopedie
                        ? "bg-blue-500/10"
                        : isChirurgie
                          ? "bg-yellow-500/10"
                          : acte.category === "Absente"
                            ? "bg-[var(--ds-primary-soft)]/40"
                            : "bg-[var(--ds-primary-soft)]/20";

                    const badgeTextClass = isOrthopedie
                      ? "text-blue-400"
                      : isChirurgie
                        ? "text-yellow-400"
                        : isSoins
                          ? "text-red-400"
                          : "text-[var(--ds-text)]";

                    const badgeBgClass = isOrthopedie
                      ? "bg-blue-500/10"
                      : isChirurgie
                        ? "bg-yellow-500/10"
                        : isSoins
                          ? "bg-red-500/10"
                          : acte.category === "Absente"
                            ? "bg-[var(--ds-primary-soft)]/40"
                            : "bg-[var(--ds-primary-soft)]/20";

                    return (
                      <div
                        key={`${acte.tooth}-${acte.acte}-${idx}`}
                        className={`flex items-center gap-3 p-3 ${bgClass} border border-[var(--ds-primary-border)] rounded-xl shadow-sm`}
                      >
                        <div
                          className={[
                            "size-10 shrink-0 rounded-full flex flex-col items-center justify-center",
                            badgeBgClass,
                            badgeTextClass,
                          ].join(" ")}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M7 3c-2.2 0-4 2.2-3.3 4.5l1.1 3.2c.4 1.3.6 2.5.7 3.9.2 2.6 1.1 6.4 4.5 6.4 1.3 0 2.1-.6 2.6-1.2.5.6 1.3 1.2 2.6 1.2 3.4 0 4.3-3.8 4.5-6.4.1-1.4.3-2.6.7-3.9l1.1-3.2C23 5.2 21.2 3 19 3H7z" />
                            <path d="M9 12c.5 1 1.5 1.8 3 1.8S14.5 13 15 12" />
                          </svg>
                          <span className="mt-0.5 text-sm font-bold leading-none">
                            {acte.tooth}
                          </span>
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[var(--ds-text)] truncate">
                            {acte.acte}
                          </p>
                          <p className="text-xs font-medium text-[var(--ds-text-muted)]">
                            {formatDate(acte.date)}
                          </p>
                          <p className="text-xs text-[var(--ds-text-muted)] truncate">
                            {acte.notes
                              ? acte.notes.length > 50
                                ? acte.notes.slice(0, 50) + "…"
                                : acte.notes
                              : "—"}
                          </p>
                        </div>
                      </div>
                    );
                  })
                  ) : (
                    <div className="rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-bg)] px-4 py-6 text-center text-sm text-[var(--ds-text-muted)]">
                      Chargement des actes…
                    </div>
                  )}
                </div>
              </section>
            )}
          </aside>

          {/* Schéma Dentaire (droite) */}
          <section className="lg:col-span-8 w-full h-full overflow-hidden rounded-3xl bg-[var(--ds-surface)] p-6 shadow-sm">
            {isMounted ? (
              <DentalChartComponent
                value={dentsStatus}
                watchedTeeth={watchedTeeth}
                onValueChange={setDentsStatus}
                onToothClick={(tooth) => {
                  const existingTreatment = allTreatments.find(
                    (t) => t.tooth === tooth,
                  );
                  setSelectedTooth(tooth);
                  if (existingTreatment) {
                    setToothNotes(existingTreatment.notes || "");
                    const match = clinicalProtocolsList.find(
                      (p) => p.nom === existingTreatment.acte,
                    );
                    setDrawerProtocolId(match?.id ?? "");
                  } else {
                    setToothNotes("");
                    setDrawerProtocolId("");
                  }
                }}
              />
            ) : (
              <div className="flex min-h-[280px] items-center justify-center rounded-2xl border border-dashed border-[var(--ds-primary-border)] bg-[var(--ds-bg)] text-sm text-[var(--ds-text-muted)]">
                Chargement du schéma dentaire…
              </div>
            )}
          </section>
        </div>

        {/* Section Bas : onglets + contenu pleine largeur */}
        <section className="w-full bg-[var(--ds-surface)] rounded-3xl p-6 shadow-sm">
          {/* Menu des onglets */}
          <div className="w-full overflow-x-auto">
            <div className="flex flex-row flex-nowrap overflow-x-auto gap-2 w-full scrollbar-hide whitespace-nowrap [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <button
                type="button"
                onClick={() => setTab("historique")}
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
                onClick={() => setTab("radios")}
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
                onClick={() => setTab("finances")}
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
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-base font-semibold tracking-tight text-[color:var(--ds-text)]">
                    Timeline des consultations
                  </h2>
                  <button
                    type="button"
                    onClick={openAiAssistantModal}
                    className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[var(--ds-primary)] to-[var(--ds-primary-hover)] px-3 py-2 text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
                  >
                    <Sparkles className="h-4 w-4" />
                    Assistant IA
                  </button>
                </div>
                <div className="mt-4 relative pl-6">
                  <div className="absolute left-2 top-0 bottom-0 w-px bg-[var(--ds-primary-border)]" />
                  <div className="space-y-4">
                    {timeline.map((t, idx) => (
                      <div
                        key={t.date + idx}
                        className="relative flex gap-4"
                      >
                        <div className="absolute left-[-34px] top-0 h-2 w-2 rounded-full bg-[color:var(--ds-primary)] shadow-[0_0_12px_rgba(8,145,178,0.35)]" />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-[var(--ds-text-muted)]">
                            {formatDate(t.date)}
                          </p>
                          <p className="mt-1 text-sm font-semibold text-[var(--ds-text)]">
                            {t.titre}
                          </p>
                          <p className="mt-1 text-sm text-[var(--ds-text-muted)]">
                            {t.note}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
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
                    <button
                      type="button"
                      onClick={() => setIsPrescriptionModalOpen(true)}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--ds-primary-border)]/80 bg-[var(--ds-surface)] px-4 py-2.5 text-sm font-medium text-[var(--ds-text)] shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-colors hover:bg-[var(--ds-bg)] hover:border-[var(--ds-primary-border)]/80"
                    >
                      <FileText className="h-4 w-4" />
                      Créer une ordonnance
                    </button>
                    <button
                      type="button"
                      onClick={() => radiosFileInputRef.current?.click()}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[color:var(--ds-primary)] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:opacity-90"
                    >
                      <Plus className="h-4 w-4" />
                      Ajouter un document
                    </button>
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
                    generateOrdonnancePDF({
                      patient: patientProfile.prenom
                        ? `${patientProfile.prenom} ${patientProfile.nom}`
                        : patientProfile.nom,
                      age:
                        patientProfile.age != null && patientProfile.age > 0
                          ? patientProfile.age
                          : undefined,
                      date: new Date().toLocaleDateString("fr-DZ"),
                      items: items.map(({ medicament, posologie, duree }) => ({
                        medicament,
                        posologie,
                        duree,
                      })),
                      cabinetNom:
                        (settings.nomCabinet ?? settings.cabinetNom) as
                          | string
                          | undefined,
                      cabinetAdresse: settings.adresse as string | undefined,
                      cabinetTel: settings.telephone as string | undefined,
                      praticienNom: praticienFromSettings,
                      mentionLegale: settings.mentionLegale as string | undefined,
                      logoBase64: settings.logoBase64 as string | undefined,
                    });
                  }}
                />

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
                            className="h-[min(85vh,900px)] w-[min(96vw,720px)] rounded-lg bg-white shadow-xl"
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
              </section>
            )}

            {tab === "finances" && (
              <div>
                <Link
                  href="/finances"
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
                        if (!line) return;

                        const montantVersé = parseMoney(paymentMontant);
                        if (montantVersé <= 0) return;

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
      </div>

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

      {isAiAssistantModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/20 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl bg-[var(--ds-surface)] p-6 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold tracking-tight text-[color:var(--ds-text)]">
                  ✨ Assistant IA
                </h3>
                <p className="mt-1 text-xs text-[var(--ds-text-muted)]">
                  Analyse des dernières interventions pour {displayFullName}...
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAiAssistantModalOpen(false)}
                className="rounded-2xl p-2 text-[var(--ds-text-muted)] transition-colors hover:bg-[var(--ds-bg)] hover:text-[var(--ds-text)]"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {isAiGenerating ? (
              <div className="mt-6 space-y-3">
                <div className="flex items-center gap-3 text-sm text-[var(--ds-text-muted)]">
                  <Loader2 className="h-4 w-4 animate-spin text-[var(--ds-primary)]" />
                  Analyse en cours...
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--ds-primary-soft)]">
                  <div className="h-2 w-1/2 animate-pulse rounded-full bg-[var(--ds-primary)]" />
                </div>
              </div>
            ) : (
              <div className="mt-6">
                <textarea
                  value={aiGeneratedText}
                  onChange={(e) => setAiGeneratedText(e.target.value)}
                  rows={9}
                  className="w-full rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-primary-soft)]/50 px-4 py-3 text-sm text-[var(--ds-text)] outline-none transition-colors focus:border-[var(--ds-primary)] focus:ring-2 focus:ring-[var(--ds-primary-border)]"
                />
              </div>
            )}

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-[var(--ds-primary-border)]/60 pt-4">
              <button
                type="button"
                onClick={() => setIsAiAssistantModalOpen(false)}
                className="rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-4 py-2.5 text-sm font-medium text-[var(--ds-text-muted)] transition-colors hover:bg-[var(--ds-bg)]"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={isAiGenerating || !aiGeneratedText.trim()}
                onClick={handleInsertAiSummary}
                className="rounded-2xl bg-[var(--ds-primary)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--ds-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Insérer dans le dossier
              </button>
            </div>
          </div>
        </div>
      )}

      {isEditPatientModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/20 p-4 backdrop-blur-sm">
          <form
            className="w-full max-w-xl rounded-2xl bg-[var(--ds-surface)] p-6 shadow-xl"
            onSubmit={(e) => {
              e.preventDefault();
              handleUpdatePatient();
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold tracking-tight text-[color:var(--ds-text)]">
                  Modifier les informations du patient
                </h3>
                <p className="mt-1 text-xs text-[var(--ds-text-muted)]">
                  Mettez a jour les coordonnees et les alertes medicales.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditPatientModalOpen(false)}
                className="rounded-2xl p-2 text-[var(--ds-text-muted)] transition-colors hover:bg-[var(--ds-bg)] hover:text-[var(--ds-text)]"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-[var(--ds-text)]">
                  Adresse physique
                </label>
                <input
                  type="text"
                  value={editPatientAddress}
                  onChange={(e) => setEditPatientAddress(e.target.value)}
                  className="mt-1.5 w-full rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 py-2.5 text-sm text-[var(--ds-text)] outline-none transition-colors focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--ds-text)]">Telephone</label>
                <input
                  type="text"
                  value={editPatientPhone}
                  onChange={(e) => setEditPatientPhone(e.target.value)}
                  className="mt-1.5 w-full rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 py-2.5 text-sm text-[var(--ds-text)] outline-none transition-colors focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--ds-text)]">Email</label>
                <input
                  type="email"
                  value={editPatientEmail}
                  onChange={(e) => setEditPatientEmail(e.target.value)}
                  className="mt-1.5 w-full rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 py-2.5 text-sm text-[var(--ds-text)] outline-none transition-colors focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-[var(--ds-text)]">
                  Date de naissance
                </label>
                <input
                  type="date"
                  value={editPatientDob}
                  onChange={(e) => setEditPatientDob(e.target.value)}
                  className="mt-1.5 w-full rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 py-2.5 text-sm text-[var(--ds-text)] outline-none transition-colors focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-[var(--ds-text)]">
                  Alertes Medicales (separees par des virgules)
                </label>
                <textarea
                  rows={3}
                  value={editPatientAlerts}
                  onChange={(e) => setEditPatientAlerts(e.target.value)}
                  className="mt-1.5 w-full resize-none rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 py-2.5 text-sm text-[var(--ds-text)] outline-none transition-colors focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-[var(--ds-primary-border)]/60 pt-4">
              <button
                type="button"
                onClick={() => setIsEditPatientModalOpen(false)}
                className="rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-4 py-2.5 text-sm font-medium text-[var(--ds-text-muted)] transition-colors hover:bg-[var(--ds-bg)]"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="rounded-2xl bg-[var(--ds-primary)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--ds-primary-hover)]"
              >
                Enregistrer
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Tiroir Cockpit — protocole + consommables (override ponctuel) ── */}
      <>
        <div
          className={[
            "fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-sm transition-opacity duration-300",
            selectedTooth !== null ? "opacity-100" : "pointer-events-none opacity-0",
          ].join(" ")}
          onClick={() => {
            setSelectedTooth(null);
            setShowTreatmentPlan(false);
          }}
        />

        {/* Panel Plan de traitement — à gauche du cockpit */}
        <div
          className={[
            "fixed top-4 bottom-4 w-full max-w-md",
            "bg-[var(--ds-surface)] rounded-2xl",
            "border border-[var(--ds-primary-border)]",
            "flex flex-col overflow-hidden",
            "transform transition-all duration-300 ease-out",
            showTreatmentPlan && selectedTooth !== null
              ? "right-[460px] opacity-100 scale-100 z-[55] shadow-2xl"
              : "right-4 opacity-0 scale-95 z-[45] shadow-none pointer-events-none",
          ].join(" ")}
        >
          <div className="flex-shrink-0 p-5 border-b border-[var(--ds-primary-border)] bg-gradient-to-r from-[var(--ds-primary-soft)] to-[var(--ds-surface)]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowTreatmentPlan(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--ds-text-muted)] hover:bg-[var(--ds-primary-soft)] transition-all"
                  aria-label="Retour"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <div>
                  <h3 className="text-base font-bold text-[var(--ds-text)]">
                    Plan de traitement
                  </h3>
                  <p className="text-xs text-[var(--ds-text-muted)]">Dent {selectedTooth}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowTreatmentPlan(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--ds-text-muted)] hover:bg-[var(--ds-primary-soft)] transition-all"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {treatmentPlan.length > 0 && (
              <div className="flex gap-3">
                <div className="flex-1 rounded-xl bg-[var(--ds-surface)] border border-[var(--ds-primary-border)] p-3 text-center">
                  <p className="text-xs text-[var(--ds-text-muted)]">Total estimé</p>
                  <p className="text-sm font-bold text-[var(--ds-text)] tabular-nums">
                    {treatmentPlan
                      .reduce((s, x) => s + x.cout, 0)
                      .toLocaleString("fr-DZ")}{" "}
                    DA
                  </p>
                </div>
                <div className="flex-1 rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-center">
                  <p className="text-xs text-emerald-600">Terminées</p>
                  <p className="text-sm font-bold text-emerald-700 tabular-nums">
                    {treatmentPlan.filter((s) => s.done).length}/
                    {treatmentPlan.length}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-3 min-h-0">
            {treatmentPlan.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <ClipboardList className="mb-3 h-10 w-10 text-[var(--ds-primary-border)]" />
                <p className="text-sm text-[var(--ds-text-muted)] font-medium">
                  Aucune séance planifiée
                </p>
                <p className="mt-1 text-xs text-[var(--ds-text-muted)]">
                  Ajoutez les étapes ci-dessous
                </p>
              </div>
            ) : (
              treatmentPlan.map((s, i) => (
                <div
                  key={s.id}
                  className={`rounded-xl border p-4 transition-all ${
                    s.done
                      ? "border-emerald-100 bg-emerald-50"
                      : "border-[var(--ds-primary-border)] bg-[var(--ds-surface)] shadow-sm"
                  }`}
                >
                  <div className="flex items-start gap-3">
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
                      className="mt-0.5 h-4 w-4 flex-shrink-0 cursor-pointer accent-[var(--ds-primary)]"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-sm font-semibold ${
                            s.done
                              ? "line-through text-[var(--ds-text-muted)]"
                              : "text-[var(--ds-text)]"
                          }`}
                        >
                          Séance {i + 1} — {s.label}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setTreatmentPlan((prev) =>
                              prev.filter((x) => x.id !== s.id),
                            )
                          }
                          className="flex-shrink-0 text-[var(--ds-text-muted)] transition-all hover:text-red-400"
                          aria-label="Supprimer"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {s.acte && (
                        <p className="text-xs text-[var(--ds-text-muted)] mt-0.5">{s.acte}</p>
                      )}
                      <p className="text-xs font-bold text-[var(--ds-primary)] mt-1.5 tabular-nums">
                        {s.cout.toLocaleString("fr-DZ")} DA
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex-shrink-0 border-t border-[var(--ds-primary-border)] bg-[var(--ds-bg)]/80 p-5 space-y-3">
            <p className="text-xs font-semibold text-[var(--ds-text-muted)] uppercase tracking-wide">
              Nouvelle séance
            </p>
            <input
              type="text"
              value={newSeanceLabel}
              onChange={(e) => setNewSeanceLabel(e.target.value)}
              placeholder="Ex: Détartrage, Composite..."
              className="w-full h-9 rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 text-sm outline-none focus:border-[var(--ds-primary)] focus:shadow-[0_0_0_3px_var(--ds-primary-soft)]"
            />
            <div className="flex gap-2">
              <input
                type="text"
                value={newSeanceActe}
                onChange={(e) => setNewSeanceActe(e.target.value)}
                placeholder="Protocole prévu"
                className="flex-1 h-9 rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 text-sm outline-none focus:border-[var(--ds-primary)]"
              />
              <input
                type="number"
                value={newSeanceCout}
                onChange={(e) => setNewSeanceCout(e.target.value)}
                placeholder="DA"
                className="w-20 h-9 rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 text-sm outline-none focus:border-[var(--ds-primary)]"
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
              className="w-full h-10 rounded-xl bg-[var(--ds-primary)] text-white text-sm font-semibold hover:bg-[var(--ds-primary-hover)] disabled:opacity-40 transition-all"
            >
              + Ajouter cette séance
            </button>
          </div>
        </div>

        <div
          className={[
            "fixed top-4 right-4 bottom-4 w-full max-w-md",
            "bg-[var(--ds-surface)] rounded-2xl shadow-2xl",
            "border border-[var(--ds-primary-border)]",
            "transform transition-all duration-300 ease-in-out z-50",
            "flex flex-col overflow-hidden",
            selectedTooth !== null
              ? "translate-x-0 opacity-100"
              : "translate-x-[110%] opacity-0",
          ].join(" ")}
        >
          {/* EN-TÊTE AMÉLIORÉ */}
          <div className="flex-shrink-0 p-5 border-b border-[var(--ds-primary-border)] bg-gradient-to-r from-[var(--ds-primary-soft)] to-[var(--ds-surface)]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--ds-primary)] text-white font-bold text-sm shadow-md shadow-[color-mix(in_srgb,var(--ds-primary)_25%,transparent)]">
                  {selectedTooth}
                </div>
                <div>
                  <h3 className="text-base font-bold text-[var(--ds-text)]">
                    Dent {selectedTooth}
                  </h3>
                  <p className="text-xs text-[var(--ds-text-muted)]">Cockpit clinique</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedTooth(null);
                  setShowTreatmentPlan(false);
                }}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--ds-text-muted)] hover:bg-[var(--ds-primary-soft)] hover:text-[var(--ds-text-muted)] transition-all"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {selectedTooth !== null &&
              dentsStatus[selectedTooth as ToothId] && (
                <>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-[var(--ds-text-muted)]">État actuel :</span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        dentsStatus[selectedTooth as ToothId] === "healthy"
                          ? "bg-green-50 text-green-700"
                          : dentsStatus[selectedTooth as ToothId] === "chirurgie"
                            ? "bg-orange-50 text-orange-700"
                            : dentsStatus[selectedTooth as ToothId] === "absente"
                              ? "bg-[var(--ds-primary-soft)] text-[var(--ds-text-muted)]"
                              : "bg-cyan-50 text-cyan-700"
                      }`}
                    >
                      {dentsStatus[selectedTooth as ToothId] === "healthy" &&
                        "✓ Saine"}
                      {dentsStatus[selectedTooth as ToothId] === "carie" &&
                        "⚠ Soins requis"}
                      {dentsStatus[selectedTooth as ToothId] === "couronne" &&
                        "◈ Prothèse"}
                      {dentsStatus[selectedTooth as ToothId] === "chirurgie" &&
                        "✦ Chirurgie"}
                      {dentsStatus[selectedTooth as ToothId] === "absente" &&
                        "○ Absente"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {(
                      [
                        ["healthy", "✓ Saine", "green"],
                        ["carie", "⚠ Soins", "cyan"],
                        ["couronne", "◈ Prothèse", "purple"],
                        ["chirurgie", "✦ Chirurgie", "orange"],
                      ] as const
                    ).map(([status, label, color]) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => {
                          if (selectedTooth !== null) {
                            setDentsStatus((prev) => ({
                              ...prev,
                              [selectedTooth as ToothId]: status,
                            }));
                          }
                        }}
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium border transition-all ${
                          dentsStatus[selectedTooth as ToothId] === status
                            ? color === "green"
                              ? "bg-green-100 border-green-300 text-green-700"
                              : color === "cyan"
                                ? "bg-cyan-100 border-cyan-300 text-cyan-700"
                                : color === "purple"
                                  ? "border-[var(--ds-primary-border)] bg-[var(--ds-primary-soft)] text-[var(--ds-primary)]"
                                  : "bg-orange-100 border-orange-300 text-orange-700"
                            : "border-[var(--ds-primary-border)] bg-[var(--ds-surface)] text-[var(--ds-text-muted)] hover:border-[var(--ds-primary-border)]"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-5 gap-5">
            <div className="space-y-5">
                {/* Historique de cette dent */}
                {selectedTooth !== null && (() => {
                  const toothHistory = allTreatments.filter(
                    (t) => t.tooth === selectedTooth
                  );
                  return toothHistory.length > 0 ? (
                    <div className="rounded-xl border border-[var(--ds-primary-border)] 
      bg-[var(--ds-bg)] p-4 space-y-2">
                      <p className="text-xs font-semibold text-[var(--ds-text-muted)] 
        uppercase tracking-wide">
                        Historique de cette dent
                      </p>
                      {toothHistory.slice(0, 3).map((t, i) => (
                        <div key={i} className="flex items-center 
          justify-between">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-1.5 rounded-full 
              bg-[var(--ds-primary)]" />
                            <span className="text-xs text-[var(--ds-text)] 
              font-medium">
                              {t.acte}
                            </span>
                          </div>
                          <span className="text-xs text-[var(--ds-text-muted)]">
                            {new Date(t.date).toLocaleDateString("fr-DZ")}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed 
      border-[var(--ds-primary-border)] p-4 text-center">
                      <p className="text-xs text-[var(--ds-text-muted)]">
                        Aucun acte enregistré sur cette dent
                      </p>
                    </div>
                  );
                })()}

                {selectedTooth !== null && (
                  <button
                    type="button"
                    onClick={() => setShowTreatmentPlan(true)}
                    className="w-full flex items-center justify-between rounded-xl border-2 border-[var(--ds-primary)]/30 px-4 py-3.5 text-sm font-semibold text-[var(--ds-text-muted)] bg-[var(--ds-primary-soft)] hover:bg-[var(--ds-primary)] hover:text-white hover:border-[var(--ds-primary)] hover:shadow-xl hover:shadow-[color-mix(in_srgb,var(--ds-primary)_35%,transparent)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 group"
                  >
                    <div className="flex items-center gap-2">
                      <ClipboardList className="h-4 w-4 text-[var(--ds-text-muted)] group-hover:text-white group-hover:scale-110 transition-all duration-200" />
                      Plan de traitement
                    </div>
                    <div className="flex items-center gap-2">
                      {treatmentPlan.length > 0 && (
                        <span className="text-xs bg-[var(--ds-primary)] text-white rounded-full px-2 py-0.5">
                          {treatmentPlan.filter((s) => s.done).length}/
                          {treatmentPlan.length}
                        </span>
                      )}
                      <ChevronRight className="h-4 w-4 text-[var(--ds-text-muted)] group-hover:text-white group-hover:translate-x-1.5 transition-all duration-200" />
                    </div>
                  </button>
                )}

                {/* Séparateur */}
                <div className="h-px bg-[var(--ds-primary-soft)]" />

                {selectedTooth !== null && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-[var(--ds-text-muted)] uppercase tracking-wide">
                      Note rapide
                    </p>
                    <textarea
                      value={toothNotes}
                      onChange={(e) => setToothNotes(e.target.value)}
                      placeholder="Observation, remarque sur cette dent..."
                      rows={2}
                      className="w-full rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-bg)] px-3 py-2 text-sm text-[var(--ds-text)] outline-none resize-none transition-all placeholder:text-[var(--ds-text-muted)] focus:border-[var(--ds-primary)] focus:bg-[var(--ds-surface)] focus:shadow-[0_0_0_3px_var(--ds-primary-soft)]"
                    />
                  </div>
                )}

                {selectedTooth !== null && (
                  <button
                    type="button"
                    onClick={() =>
                      setWatchedTeeth((prev) => {
                        const next = new Set(prev);
                        if (next.has(selectedTooth)) {
                          next.delete(selectedTooth);
                        } else {
                          next.add(selectedTooth);
                        }
                        if (typeof window !== "undefined") {
                          localStorage.setItem(
                            WATCHED_KEY,
                            JSON.stringify([...next]),
                          );
                        }
                        return next;
                      })
                    }
                    className={`w-full flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all ${
                      watchedTeeth.has(selectedTooth)
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : "border-[var(--ds-primary-border)] bg-[var(--ds-surface)] text-[var(--ds-text-muted)] hover:border-amber-200 hover:bg-amber-50 hover:text-amber-700"
                    }`}
                  >
                    <span>
                      {watchedTeeth.has(selectedTooth)
                        ? "⚠ Dent surveillée"
                        : "Marquer à surveiller"}
                    </span>
                  </button>
                )}

                {selectedTooth !== null &&
                  dentsStatus[selectedTooth as ToothId] !== "absente" &&
                  (confirmAbsent === selectedTooth ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-3 space-y-2">
                      <p className="text-xs text-red-700 font-medium text-center">
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
                            setShowTreatmentPlan(false);
                          }}
                          className="flex-1 rounded-lg bg-red-600 text-white text-xs font-semibold py-2 hover:bg-red-700 transition-all"
                        >
                          Confirmer
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmAbsent(null)}
                          className="flex-1 rounded-lg border border-[var(--ds-primary-border)] text-[var(--ds-text-muted)] text-xs font-semibold py-2 hover:bg-[var(--ds-primary-soft)] transition-all"
                        >
                          Annuler
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmAbsent(selectedTooth)}
                      className="w-full flex items-center justify-center gap-2 rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-4 py-2.5 text-sm font-medium text-[var(--ds-text-muted)] transition-all hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                    >
                      ○ Marquer comme absente
                    </button>
                  ))}

                {selectedTooth !== null &&
                  dentsStatus[selectedTooth as ToothId] === "absente" && (
                    <button
                      type="button"
                      onClick={() => {
                        setDentsStatus((prev) => ({
                          ...prev,
                          [selectedTooth as ToothId]: "healthy",
                        }));
                        setSelectedTooth(null);
                        setShowTreatmentPlan(false);
                      }}
                      className="w-full flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700 transition-all hover:bg-emerald-100"
                    >
                      ✓ Restaurer cette dent
                    </button>
                  )}

                <div className="space-y-2">
                  <label
                    className="text-xs font-semibold text-[var(--ds-text-muted)]"
                    htmlFor="cockpit-protocol-search"
                  >
                    Rechercher un protocole
                  </label>
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-text-muted)]"
                      aria-hidden
                    />
                    <input
                      id="cockpit-protocol-search"
                      type="search"
                      value={protocolSearchQuery}
                      onChange={(e) => setProtocolSearchQuery(e.target.value)}
                      placeholder="Filtrer par nom…"
                      autoComplete="off"
                      className="w-full rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] py-2.5 pl-10 pr-4 text-sm text-[var(--ds-text)] transition-colors placeholder:text-[var(--ds-text-muted)] focus:border-[color:var(--ds-primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                    />
                  </div>
                </div>

                {protocolsByCategory.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-[var(--ds-primary-border)] bg-[var(--ds-bg)]/80 px-4 py-6 text-center text-sm text-[var(--ds-text-muted)]">
                    Aucun protocole ne correspond à votre recherche.
                  </p>
                ) : (
                  protocolsByCategory.map(({ category, protocols }) => {
                    const isOpen = expandedCategories.has(category);
                    return (
                      <section
                        key={category}
                        className="overflow-hidden rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)]"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedCategories((prev) => {
                              const next = new Set(prev);
                              if (next.has(category)) next.delete(category);
                              else next.add(category);
                              return next;
                            })
                          }
                          aria-expanded={isOpen}
                          className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left transition-colors hover:bg-[var(--ds-bg)]"
                        >
                          <span className="text-xs font-bold uppercase tracking-wide text-[var(--ds-text)]">
                            {category}
                          </span>
                          <ChevronDown
                            className={[
                              "h-4 w-4 shrink-0 text-[var(--ds-text-muted)] transition-transform duration-300 ease-out",
                              isOpen ? "rotate-180" : "rotate-0",
                            ].join(" ")}
                            aria-hidden
                          />
                        </button>
                        <div
                          className={[
                            "grid transition-[grid-template-rows] duration-300 ease-out",
                            isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                          ].join(" ")}
                        >
                          <div className="min-h-0 overflow-hidden">
                            <div className="space-y-2 border-t border-[var(--ds-primary-border)] px-3.5 pb-3 pt-2">
                              {protocols.map((p) => {
                                const isSelected = drawerProtocolId === p.id;
                                return (
                                  <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => setDrawerProtocolId(p.id)}
                                    className={[
                                      "w-full rounded-2xl border px-3.5 py-3 text-left text-sm leading-snug transition-colors",
                                      isSelected
                                        ? "border-[color:var(--ds-primary)] bg-[color:var(--ds-primary)]/8 text-[color:var(--ds-text)] shadow-sm ring-1 ring-[color:var(--ds-primary)]/25"
                                        : "border-[var(--ds-primary-border)] bg-[var(--ds-bg)] text-[var(--ds-text)] hover:border-[var(--ds-primary-border)] hover:bg-[var(--ds-surface)]",
                                    ].join(" ")}
                                  >
                                    <span className="font-medium">{p.nom}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </section>
                    );
                  })
                )}

                {selectedDrawerProtocol && (
                  <>
                  <div className="rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-bg)]/80 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ds-text-muted)]">
                      Consommables (défaut ±)
                    </p>
                    <ul className="mt-3 space-y-2">
                      {selectedDrawerProtocol.consommables.map((c) => {
                        const q = qtyByConsumableId[c.id] ?? c.quantite;
                        return (
                          <li
                            key={c.id}
                            className="flex items-center justify-between gap-2 rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 py-2"
                          >
                            <span className="min-w-0 flex-1 text-sm text-[var(--ds-text)]">
                              {c.nom}
                            </span>
                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  setQtyByConsumableId((prev) => ({
                                    ...prev,
                                    [c.id]: Math.max(0, (prev[c.id] ?? c.quantite) - 1),
                                  }))
                                }
                                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--ds-primary-border)] bg-[var(--ds-bg)] text-sm font-semibold text-[var(--ds-text)] transition-colors hover:bg-[var(--ds-primary-soft)]"
                                aria-label="Diminuer"
                              >
                                −
                              </button>
                              <span className="w-8 text-center text-sm font-semibold tabular-nums text-[var(--ds-text)]">
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
                                className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--ds-primary-border)] bg-[var(--ds-bg)] text-sm font-semibold text-[var(--ds-text)] transition-colors hover:bg-[var(--ds-primary-soft)]"
                                aria-label="Augmenter"
                              >
                                +
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-[var(--ds-text-muted)]">
                      Notes cliniques
                    </label>
                    <textarea
                      value={toothNotes}
                      onChange={(e) => setToothNotes(e.target.value)}
                      rows={4}
                      placeholder="Observations, complications, plan de suivi…"
                      className="w-full resize-none rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-4 py-3 text-sm text-[var(--ds-text)] transition-colors placeholder:text-[var(--ds-text-muted)] focus:border-[color:var(--ds-primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                    />
                  </div>
                  </>
                )}
              </div>
            </div>

          <div className="flex-shrink-0 p-5 border-t border-[var(--ds-primary-border)] bg-[var(--ds-bg)]/80 backdrop-blur-sm space-y-2">
            <button
              type="button"
              disabled={!selectedDrawerProtocol || validateSoinLoading}
              onClick={() => void handleValidateClinicalAct()}
              className="w-full h-11 rounded-xl bg-[var(--ds-primary)] text-white text-sm font-semibold transition-all hover:bg-[var(--ds-primary-hover)] disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-[color-mix(in_srgb,var(--ds-primary)_25%,transparent)]"
            >
              {validateSoinLoading ? "Enregistrement..." : "✓ Valider le soin"}
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedTooth(null);
                setShowTreatmentPlan(false);
              }}
              className="w-full h-9 rounded-xl text-sm text-[var(--ds-text-muted)] hover:bg-[var(--ds-primary-soft)] transition-all"
            >
              Annuler
            </button>
          </div>
        </div>
      </>

      {toast ? (
        <div
          role="status"
          className={[
            "fixed bottom-6 right-6 z-[100] max-w-sm rounded-2xl px-4 py-3 text-sm font-medium shadow-lg",
            toast.type === "success"
              ? "bg-emerald-600 text-white"
              : "bg-red-600 text-white",
          ].join(" ")}
        >
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}

