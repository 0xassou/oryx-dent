"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  CreditCard,
  DownloadCloud,
  MoreVertical,
  Receipt,
  Download,
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
} from "lucide-react";
import { submitClinicalActAction } from "@/app/actions/clinicalAct";
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
import {
  readFacturesFromStorage,
  writeFacturesToStorage,
} from "@/utils/factureDocuments";
import {
  ensurePatientsHydrated,
  readPatientsFromStorage,
  syncPatientFromProfile,
  touchPatientDerniereVisite,
} from "@/utils/patientData";
import {
  DentalChart as DentalChartComponent,
  type ToothId,
  type ToothStatus,
} from "@/components/dentition/DentalChart";

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

export default function PatientDetailPage() {
  const params = useParams();
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

  type FinanceLine = {
    id: string;
    acteName: string;
    date: string; // ISO 8601
    montantTotal: number;
    resteACharge: number;
    statut: FinanceStatut;
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

  // Formulaires modals
  const [quoteActeTooth, setQuoteActeTooth] = useState<number | "">("");
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
            ...l,
            statut: financeStatutFromReste(l.montantTotal, l.resteACharge),
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
  const [validateSoinLoading, setValidateSoinLoading] = useState(false);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

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

  const initials = getInitials(patientProfile.nom);

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
        console.log("🚀 --- DÉBUT DÉDUCTION STOCK ---");
        console.log("1. Nom de l'acte validé :", protocol.nom);
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
        setSelectedTooth(null);
      } else {
        setToast({ type: "error", message: res.error });
      }
    } finally {
      setValidateSoinLoading(false);
    }
  }

  /** Synchronise la liste globale des factures (même clé que la page Factures). */
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
        patient: patientProfile.nom,
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
        patient: patientProfile.nom,
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
Patient(e) ${patientProfile.nom}, ${patientProfile.age} ans.
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
    <div className="bg-slate-50 min-h-screen p-6">
      <div className="flex flex-col gap-6">
        {/* En-tête */}
        <div className="flex items-center gap-3">
          <Link
            href="/patients"
            className="inline-flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-[color:var(--ds-primary)]"
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
            <section className="rounded-3xl bg-white p-4 shadow-sm h-full">
              <div className="flex flex-col gap-3 h-full">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-teal-500 text-white shadow-[0_10px_30px_rgba(14,165,233,0.25)]">
                    <span className="text-sm font-semibold">{initials}</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-lg font-semibold text-[color:var(--ds-text)]">
                        {patientProfile.nom}
                      </p>
                      <button
                        type="button"
                        onClick={openEditPatientModal}
                        className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 transition-colors hover:text-indigo-600"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Modifier
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {patientProfile.age ? `${patientProfile.age} ans` : "Âge inconnu"} ·{" "}
                      {patientProfile.profession}
                    </p>
                  </div>
                </div>

                {/* Contact */}
                <div className="space-y-2">
                  <div className="w-full rounded-2xl border border-slate-100 bg-white px-3 py-2">
                    <p className="text-xs font-medium text-slate-500">
                      Numéro de téléphone :
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-sm text-slate-700">
                      <Phone className="h-4 w-4 text-slate-400" aria-hidden />
                      <span className="truncate">
                        {formatPhoneNumber(patientProfile.telephone)}
                      </span>
                    </div>
                  </div>

                  <div className="w-full rounded-2xl border border-slate-100 bg-white px-3 py-2">
                    <p className="text-xs font-medium text-slate-500">
                      Adresse email :
                    </p>
                    <div className="mt-1 flex items-center gap-2 text-sm text-slate-700">
                      <Mail className="h-4 w-4 text-slate-400" aria-hidden />
                      <span className="truncate">{patientProfile.email}</span>
                    </div>
                  </div>
                </div>

                {/* Alertes Médicales (remontées sous l'email) */}
                <div className="mt-2 w-full">
                  <div className="rounded-2xl border border-red-100 bg-red-50 p-3 w-full">
                    <p className="text-xs font-semibold uppercase tracking-wider text-red-600">
                      Alertes Médicales
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {patientProfile.alerts.length === 0 ? (
                        <span className="text-xs text-red-600/70">Aucune</span>
                      ) : (
                        patientProfile.alerts.map((a) => (
                          <span
                            key={a}
                            className="inline-flex rounded-lg bg-red-100 px-2.5 py-1 text-[11px] font-semibold text-red-700"
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
              <section className="w-full bg-white rounded-3xl p-6 shadow-sm">
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
                      ? "bg-red-50"
                      : isOrthopedie
                        ? "bg-blue-50"
                        : isChirurgie
                          ? "bg-yellow-50"
                          : acte.category === "Absente"
                            ? "bg-slate-100"
                            : "bg-gray-50";

                    const badgeTextClass = isOrthopedie
                      ? "text-blue-700"
                      : isChirurgie
                        ? "text-yellow-800"
                        : isSoins
                          ? "text-red-700"
                          : acte.category === "Absente"
                            ? "text-slate-800"
                            : "text-slate-800";

                    const badgeBgClass = isOrthopedie
                      ? "bg-blue-50"
                      : isChirurgie
                        ? "bg-yellow-50"
                        : isSoins
                          ? "bg-red-50"
                          : acte.category === "Absente"
                            ? "bg-slate-100"
                            : "bg-gray-50";

                    return (
                      <div
                        key={`${acte.tooth}-${acte.acte}-${idx}`}
                        className={`flex items-center gap-3 p-3 ${bgClass} rounded-xl shadow-sm`}
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
                          <p className="text-sm font-semibold text-slate-700 truncate">
                            {acte.acte}
                          </p>
                          <p className="text-xs font-medium text-slate-500">
                            {formatDate(acte.date)}
                          </p>
                          <p className="text-xs text-slate-400 truncate">
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
                    <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                      Chargement des actes…
                    </div>
                  )}
                </div>
              </section>
            )}
          </aside>

          {/* Schéma Dentaire (droite) */}
          <section className="lg:col-span-8 w-full h-full overflow-hidden rounded-3xl bg-white p-6 shadow-sm">
            {isMounted ? (
              <DentalChartComponent
                value={dentsStatus}
                onValueChange={setDentsStatus}
                onChange={(state) => {
                  console.log("DentalChart change", { patientId: id, state });
                }}
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
              <div className="flex min-h-[280px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
                Chargement du schéma dentaire…
              </div>
            )}
          </section>
        </div>

        {/* Section Bas : onglets + contenu pleine largeur */}
        <section className="w-full bg-white rounded-3xl p-6 shadow-sm">
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
                    : "text-slate-500 hover:text-slate-700",
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
                    : "text-slate-500 hover:text-slate-700",
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
                    : "text-slate-500 hover:text-slate-700",
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
                    className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
                  >
                    <Sparkles className="h-4 w-4" />
                    Assistant IA
                  </button>
                </div>
                <div className="mt-4 relative pl-6">
                  <div className="absolute left-2 top-0 bottom-0 w-px bg-slate-200" />
                  <div className="space-y-4">
                    {timeline.map((t, idx) => (
                      <div
                        key={t.date + idx}
                        className="relative flex gap-4"
                      >
                        <div className="absolute left-[-34px] top-0 h-2 w-2 rounded-full bg-[color:var(--ds-primary)] shadow-[0_0_12px_rgba(8,145,178,0.35)]" />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-500">
                            {formatDate(t.date)}
                          </p>
                          <p className="mt-1 text-sm font-semibold text-slate-800">
                            {t.titre}
                          </p>
                          <p className="mt-1 text-sm text-slate-600">
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
              <section className="flex flex-col gap-6">
                {/* En-tête de l'onglet */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h2 className="text-base font-semibold tracking-tight text-[color:var(--ds-text)]">
                    Imagerie &amp; Documents
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setIsPrescriptionModalOpen(true)}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200/80 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-colors hover:bg-slate-50 hover:border-slate-300/80"
                    >
                      <FileText className="h-4 w-4" />
                      Créer une ordonnance
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[color:var(--ds-primary)] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:opacity-90"
                    >
                      <Plus className="h-4 w-4" />
                      Ajouter un document
                    </button>
                  </div>
                </div>

                {/* Zone Drag & Drop */}
                <div className="flex cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-sky-200 bg-sky-50/50 p-8 text-center transition-colors hover:border-sky-300">
                  <UploadCloud className="h-8 w-8 text-sky-500" />
                  <div>
                    <p className="text-sm font-semibold text-slate-700">
                      Glissez la radio panoramique ici ou cliquez pour parcourir
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      ou fichiers PDF (Max 10MB)
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => console.log("Parcourir radios/documents")}
                    className="inline-flex items-center justify-center rounded-2xl bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                  >
                    Parcourir
                  </button>
                </div>

                {/* Galerie des radios */}
                <div>
                  <h3 className="mb-3 text-sm font-semibold text-slate-600">
                    Derniers examens
                  </h3>
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                    {/* Carte Radio 1 */}
                    <div className="flex flex-col gap-2">
                      <div className="group relative aspect-video overflow-hidden rounded-lg bg-slate-200">
                        <div className="flex h-full w-full items-center justify-center">
                          <FileImage className="h-10 w-10 text-slate-400" />
                        </div>
                        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-slate-900/40 opacity-0 transition-opacity group-hover:opacity-90">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow transition-colors hover:bg-slate-50"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Voir
                          </button>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow transition-colors hover:bg-slate-50"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-700">Panoramique de contrôle</p>
                        <p className="text-xs text-slate-400">
                          {formatDate("2026-03-12T10:00:00Z")}
                        </p>
                      </div>
                    </div>

                    {/* Carte Radio 2 */}
                    <div className="flex flex-col gap-2">
                      <div className="group relative aspect-video overflow-hidden rounded-lg bg-slate-200">
                        <div className="flex h-full w-full items-center justify-center">
                          <FileImage className="h-10 w-10 text-slate-400" />
                        </div>
                        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-slate-900/40 opacity-0 transition-opacity group-hover:opacity-90">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow transition-colors hover:bg-slate-50"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Voir
                          </button>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow transition-colors hover:bg-slate-50"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-700">Scanner 3D</p>
                        <p className="text-xs text-slate-400">
                          {formatDate("2026-04-01T10:00:00Z")}
                        </p>
                      </div>
                    </div>

                    {/* Carte Radio 3 */}
                    <div className="flex flex-col gap-2">
                      <div className="group relative aspect-video overflow-hidden rounded-lg bg-slate-200">
                        <div className="flex h-full w-full items-center justify-center">
                          <FileText className="h-10 w-10 text-slate-400" />
                        </div>
                        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-slate-900/40 opacity-0 transition-opacity group-hover:opacity-90">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow transition-colors hover:bg-slate-50"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Voir
                          </button>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow transition-colors hover:bg-slate-50"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-700">CBCT</p>
                        <p className="text-xs text-slate-400">
                          {formatDate("2026-05-02T10:00:00Z")}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <PrescriptionModal
                  open={isPrescriptionModalOpen}
                  patientName={patientProfile.nom}
                  patientAge={patientProfile.age ? `${patientProfile.age} ans` : "—"}
                  onClose={() => setIsPrescriptionModalOpen(false)}
                  onGeneratePdf={(items: PrescriptionItem[]) => {
                    console.log("Prescription PDF", {
                      patient: patientProfile.nom,
                      items,
                    });
                  }}
                />
              </section>
            )}

            {tab === "finances" && (
              <div>
                <div className="flex justify-between items-start mb-6 gap-4">
                  <h2 className="text-lg font-semibold text-[color:var(--ds-text)]">
                    Facturation
                  </h2>

                  <div className="flex gap-2 flex-wrap justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setIsQuoteModalOpen(true);
                        setQuoteActeTooth("");
                        setQuoteMontantTotal("");
                        setQuoteDate(new Date().toISOString().slice(0, 10));
                      }}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
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
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-sky-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-sky-700"
                    >
                      <CreditCard className="h-4 w-4" />
                      Enregistrer un paiement
                    </button>
                  </div>
                </div>

                {/* KPIs (2 cartes) */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="rounded-2xl bg-white border border-slate-100 p-4 shadow-sm flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
                      <Receipt className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-500">Total facturé</p>
                        <p className="mt-1 text-lg font-semibold text-slate-800">{formatDZD(totalFacture)}</p>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-red-50/50 border border-red-100 p-4 shadow-sm flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-red-700">
                      <Receipt className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-500">
                        Reste à payer
                      </p>
                        <p className="mt-1 text-lg font-semibold text-red-600">{formatDZD(totalResteACharge)}</p>
                    </div>
                  </div>
                </div>

                {/* Tableau d'historique */}
                <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100 overflow-x-auto">
                  <table className="table-auto w-full text-sm">
                    <thead>
                      <tr className="text-left">
                        <th className="pb-3 text-xs font-semibold text-slate-500">Date</th>
                        <th className="pb-3 text-xs font-semibold text-slate-500">Acte</th>
                        <th className="pb-3 text-xs font-semibold text-slate-500">Montant</th>
                        <th className="pb-3 text-xs font-semibold text-slate-500">
                          Reste à payer
                        </th>
                        <th className="pb-3 text-xs font-semibold text-slate-500">Statut</th>
                        <th className="pb-3 text-xs font-semibold text-slate-500">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {finances.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="py-10 text-center text-sm text-slate-500"
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
                              className="border-b border-slate-100 align-top last:border-b-0"
                            >
                              <td className="py-3 text-slate-600">
                                {formatDate(row.date)}
                              </td>
                              <td className="py-3 text-slate-700 font-medium">
                                {row.acteName}
                              </td>
                              <td className="py-3 text-slate-700">
                                {formatAmountDA(row.montantTotal)}
                              </td>
                              <td className="py-3 text-slate-700">
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
                                    className="inline-flex items-center justify-center rounded-xl bg-slate-50 p-2 text-slate-600 hover:bg-slate-100 hover:text-sky-600 transition-colors"
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
                                      className="inline-flex items-center justify-center rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-sky-600 transition-colors"
                                      aria-label="Options"
                                    >
                                      <MoreVertical className="h-4 w-4" />
                                    </button>

                                    {activeDropdownId === row.id && (
                                      <div
                                        className="absolute right-0 z-20 mt-2 w-40 overflow-hidden rounded-xl bg-white shadow-md border border-slate-100"
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
                                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 transition-colors"
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
                      className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl"
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
                      <div className="flex items-center justify-between border-b border-slate-100 p-6">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                            Paiement
                          </p>
                          <h3 className="mt-0.5 text-lg font-semibold text-[color:var(--ds-text)]">
                            Enregistrer un paiement
                          </h3>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsPaymentModalOpen(false)}
                          className="flex h-9 w-9 items-center justify-center rounded-2xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                          aria-label="Fermer"
                        >
                          <X className="h-5 w-5" />
                        </button>
                      </div>
                      <div className="space-y-5">
                        <div>
                          <label
                            className="block text-sm font-medium text-slate-700"
                            htmlFor="payment-line"
                          >
                            Sélectionner l&apos;acte à payer
                          </label>
                          <select
                            id="payment-line"
                            value={paymentLineId}
                            onChange={(e) => setPaymentLineId(e.target.value)}
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none transition-colors focus:border-sky-200 focus:ring-2 focus:ring-sky-100"
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
                          <label className="block text-sm font-medium text-slate-700">
                            Montant versé (DA)
                          </label>
                          <input
                            value={paymentMontant}
                            onChange={(e) => setPaymentMontant(e.target.value)}
                            inputMode="decimal"
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none transition-colors focus:border-sky-200 focus:ring-2 focus:ring-sky-100"
                          />
                        </div>
                      </div>

                      <div className="mt-6 flex justify-end gap-3 rounded-xl bg-slate-50 px-0 py-0">
                        <button
                          type="button"
                          onClick={() => setIsPaymentModalOpen(false)}
                          className="rounded-2xl px-5 py-2.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100"
                        >
                          Annuler
                        </button>
                        <button
                          type="submit"
                          className="rounded-2xl bg-sky-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-sky-700"
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
                      className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-xl"
                      onSubmit={(e) => {
                        e.preventDefault();

                        const selected =
                          typeof quoteActeTooth === "number"
                            ? allTreatments.find(
                                (t) => t.tooth === quoteActeTooth
                              )
                            : null;

                        if (!selected) return;
                        const montantTotal = parseMoney(quoteMontantTotal);
                        if (montantTotal <= 0) return;

                        const newLine: FinanceLine = {
                          id: uid(),
                          acteName: `Dent ${selected.tooth} - ${selected.acte}`,
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
                        setQuoteActeTooth("");
                        setQuoteMontantTotal("");
                        setQuoteDate(new Date().toISOString().slice(0, 10));
                      }}
                    >
                      <div className="flex items-center justify-between border-b border-slate-100 p-6">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                            Facture
                          </p>
                          <h3 className="mt-0.5 text-lg font-semibold text-[color:var(--ds-text)]">
                            Nouvelle facture / acte
                          </h3>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setIsQuoteModalOpen(false);
                            setQuoteActeTooth("");
                            setQuoteMontantTotal("");
                            setQuoteDate(new Date().toISOString().slice(0, 10));
                          }}
                          className="flex h-9 w-9 items-center justify-center rounded-2xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                          aria-label="Fermer"
                        >
                          <X className="h-5 w-5" />
                        </button>
                      </div>
                      <div className="space-y-5 p-0">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="sm:col-span-2">
                            <label
                              className="block text-sm font-medium text-slate-700"
                              htmlFor="quote-acte"
                            >
                              Acte réalisé
                            </label>
                            <select
                              id="quote-acte"
                              value={
                                quoteActeTooth === ""
                                  ? ""
                                  : String(quoteActeTooth)
                              }
                              onChange={(e) =>
                                setQuoteActeTooth(
                                  e.target.value === ""
                                    ? ""
                                    : Number(e.target.value)
                                )
                              }
                              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none transition-colors focus:border-sky-200 focus:ring-2 focus:ring-sky-100"
                            >
                              <option value="" disabled>
                                — Choisir un acte —{" "}
                              </option>
                              {allTreatments.map((t) => (
                                <option key={`${t.tooth}-${t.acte}`} value={t.tooth}>
                                  Dent {t.tooth} - {t.acte}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label
                              className="block text-sm font-medium text-slate-700"
                              htmlFor="quote-montant"
                            >
                              Montant Total (DA)
                            </label>
                            <input
                              id="quote-montant"
                              value={quoteMontantTotal}
                              onChange={(e) =>
                                setQuoteMontantTotal(e.target.value)
                              }
                              inputMode="decimal"
                              placeholder="Ex: 600"
                              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none transition-colors focus:border-sky-200 focus:ring-2 focus:ring-sky-100"
                            />
                          </div>

                          <div>
                            <label
                              className="block text-sm font-medium text-slate-700"
                              htmlFor="quote-date"
                            >
                              Date
                            </label>
                            <input
                              id="quote-date"
                              type="date"
                              value={quoteDate}
                              onChange={(e) => setQuoteDate(e.target.value)}
                              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none transition-colors focus:border-sky-200 focus:ring-2 focus:ring-sky-100"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-4">
                        <button
                          type="button"
                          onClick={() => {
                            setIsQuoteModalOpen(false);
                            setQuoteActeTooth("");
                            setQuoteMontantTotal("");
                            setQuoteDate(new Date().toISOString().slice(0, 10));
                          }}
                          className="rounded-2xl px-5 py-2.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100"
                        >
                          Annuler
                        </button>
                        <button
                          type="submit"
                          className="rounded-2xl bg-sky-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-sky-700"
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
            className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-xl"
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
              };

              setFinances((prev) =>
                prev.map((f) => (f.id === editingFinance.id ? updated : f)),
              );
              upsertGlobalFactureFromFinanceLine(updated);

              setEditingFinance(null);
            }}
          >
            <div className="flex items-center justify-between border-b border-slate-100 p-6">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  Facturation
                </p>
                <h3 className="mt-0.5 text-lg font-semibold text-[color:var(--ds-text)]">
                  Modifier la facturation
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingFinance(null)}
                className="flex h-9 w-9 items-center justify-center rounded-2xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5 p-0">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label
                    className="block text-sm font-medium text-slate-700"
                    htmlFor="edit-date"
                  >
                    Date
                  </label>
                  <input
                    id="edit-date"
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none transition-colors focus:border-sky-200 focus:ring-2 focus:ring-sky-100"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label
                    className="block text-sm font-medium text-slate-700"
                    htmlFor="edit-acte"
                  >
                    Acte réalisé
                  </label>
                  <select
                    id="edit-acte"
                    value={editActeName}
                    onChange={(e) => setEditActeName(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none transition-colors focus:border-sky-200 focus:ring-2 focus:ring-sky-100"
                  >
                    <option value="" disabled>
                      — Choisir un acte —
                    </option>
                    {allTreatments.map((t) => {
                      const acteName = `Dent ${t.tooth} - ${t.acte}`;
                      return (
                        <option key={acteName} value={acteName}>
                          {acteName}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label
                    className="block text-sm font-medium text-slate-700"
                    htmlFor="edit-total"
                  >
                    Montant Total (DA)
                  </label>
                  <input
                    id="edit-total"
                    value={editMontantTotal}
                    onChange={(e) => setEditMontantTotal(e.target.value)}
                    inputMode="decimal"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none transition-colors focus:border-sky-200 focus:ring-2 focus:ring-sky-100"
                  />
                </div>

                <div>
                  <label
                    className="block text-sm font-medium text-slate-700"
                    htmlFor="edit-reste"
                  >
                    Reste à payer (DA)
                  </label>
                  <input
                    id="edit-reste"
                    value={editResteAPayer}
                    onChange={(e) => setEditResteAPayer(e.target.value)}
                    inputMode="decimal"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 outline-none transition-colors focus:border-sky-200 focus:ring-2 focus:ring-sky-100"
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setEditingFinance(null)}
                className="rounded-2xl px-5 py-2.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="rounded-2xl bg-sky-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-sky-700"
              >
                Enregistrer
              </button>
            </div>
          </form>
        </div>
      )}

      {isAiAssistantModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/20 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold tracking-tight text-[color:var(--ds-text)]">
                  ✨ Assistant IA
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Analyse des dernières interventions pour {patientProfile.nom}...
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAiAssistantModalOpen(false)}
                className="rounded-2xl p-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {isAiGenerating ? (
              <div className="mt-6 space-y-3">
                <div className="flex items-center gap-3 text-sm text-slate-600">
                  <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
                  Analyse en cours...
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-indigo-100">
                  <div className="h-2 w-1/2 animate-pulse rounded-full bg-indigo-600" />
                </div>
              </div>
            ) : (
              <div className="mt-6">
                <textarea
                  value={aiGeneratedText}
                  onChange={(e) => setAiGeneratedText(e.target.value)}
                  rows={9}
                  className="w-full rounded-2xl border border-indigo-100 bg-indigo-50/50 px-4 py-3 text-sm text-slate-800 outline-none transition-colors focus:border-indigo-300 focus:ring-2 focus:ring-indigo-200"
                />
              </div>
            )}

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-200/60 pt-4">
              <button
                type="button"
                onClick={() => setIsAiAssistantModalOpen(false)}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={isAiGenerating || !aiGeneratedText.trim()}
                onClick={handleInsertAiSummary}
                className="rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
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
            className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl"
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
                <p className="mt-1 text-xs text-slate-500">
                  Mettez a jour les coordonnees et les alertes medicales.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditPatientModalOpen(false)}
                className="rounded-2xl p-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700">
                  Nom complet
                </label>
                <input
                  type="text"
                  value={editPatientName}
                  onChange={(e) => setEditPatientName(e.target.value)}
                  className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Sexe / Genre
                </label>
                <select
                  value={editPatientGender}
                  onChange={(e) => setEditPatientGender(e.target.value)}
                  className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                >
                  <option value="">Non renseigné</option>
                  <option value="Homme">Homme</option>
                  <option value="Femme">Femme</option>
                  <option value="Autre">Autre</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Profession
                </label>
                <input
                  type="text"
                  value={editPatientProfession}
                  onChange={(e) => setEditPatientProfession(e.target.value)}
                  className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700">
                  Adresse physique
                </label>
                <input
                  type="text"
                  value={editPatientAddress}
                  onChange={(e) => setEditPatientAddress(e.target.value)}
                  className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Telephone</label>
                <input
                  type="text"
                  value={editPatientPhone}
                  onChange={(e) => setEditPatientPhone(e.target.value)}
                  className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Email</label>
                <input
                  type="email"
                  value={editPatientEmail}
                  onChange={(e) => setEditPatientEmail(e.target.value)}
                  className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700">
                  Date de naissance
                </label>
                <input
                  type="date"
                  value={editPatientDob}
                  onChange={(e) => setEditPatientDob(e.target.value)}
                  className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700">
                  Alertes Medicales (separees par des virgules)
                </label>
                <textarea
                  rows={3}
                  value={editPatientAlerts}
                  onChange={(e) => setEditPatientAlerts(e.target.value)}
                  className="mt-1.5 w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-200/60 pt-4">
              <button
                type="button"
                onClick={() => setIsEditPatientModalOpen(false)}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
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
          onClick={() => setSelectedTooth(null)}
        />

        <div
          className={[
            "fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl transform transition-transform duration-300 ease-in-out z-50 flex flex-col",
            selectedTooth !== null ? "translate-x-0" : "translate-x-full",
          ].join(" ")}
        >
            <div className="flex items-center justify-between border-b border-slate-100 p-6">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  Cockpit patient
                </p>
                <h2 className="mt-0.5 text-lg font-semibold text-[color:var(--ds-text)]">
                  Dent {selectedTooth ?? "—"}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Protocole clinique (réglages) — quantités ajustables pour ce patient
                  uniquement.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTooth(null)}
                className="flex h-9 w-9 items-center justify-center rounded-2xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
              <div className="space-y-5">
                <div className="space-y-2">
                  <label
                    className="text-xs font-semibold text-slate-500"
                    htmlFor="cockpit-protocol-search"
                  >
                    Rechercher un protocole
                  </label>
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                      aria-hidden
                    />
                    <input
                      id="cockpit-protocol-search"
                      type="search"
                      value={protocolSearchQuery}
                      onChange={(e) => setProtocolSearchQuery(e.target.value)}
                      placeholder="Filtrer par nom…"
                      autoComplete="off"
                      className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-700 transition-colors placeholder:text-slate-400 focus:border-[color:var(--ds-primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                    />
                  </div>
                </div>

                {protocolsByCategory.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-6 text-center text-sm text-slate-500">
                    Aucun protocole ne correspond à votre recherche.
                  </p>
                ) : (
                  protocolsByCategory.map(({ category, protocols }) => {
                    const isOpen = expandedCategories.has(category);
                    return (
                      <section
                        key={category}
                        className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
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
                          className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left transition-colors hover:bg-slate-50"
                        >
                          <span className="text-xs font-bold uppercase tracking-wide text-slate-800">
                            {category}
                          </span>
                          <ChevronDown
                            className={[
                              "h-4 w-4 shrink-0 text-slate-500 transition-transform duration-300 ease-out",
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
                            <div className="space-y-2 border-t border-slate-100 px-3.5 pb-3 pt-2">
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
                                        : "border-slate-200 bg-slate-50 text-slate-800 hover:border-slate-300 hover:bg-white",
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
                  <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Consommables (défaut ±)
                    </p>
                    <ul className="mt-3 space-y-2">
                      {selectedDrawerProtocol.consommables.map((c) => {
                        const q = qtyByConsumableId[c.id] ?? c.quantite;
                        return (
                          <li
                            key={c.id}
                            className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-white px-3 py-2"
                          >
                            <span className="min-w-0 flex-1 text-sm text-slate-800">
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
                                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                                aria-label="Diminuer"
                              >
                                −
                              </button>
                              <span className="w-8 text-center text-sm font-semibold tabular-nums text-slate-800">
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
                                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
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
                    <label className="text-xs font-semibold text-slate-500">
                      Notes cliniques
                    </label>
                    <textarea
                      value={toothNotes}
                      onChange={(e) => setToothNotes(e.target.value)}
                      rows={4}
                      placeholder="Observations, complications, plan de suivi…"
                      className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 transition-colors placeholder:text-slate-300 focus:border-[color:var(--ds-primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                    />
                  </div>
                  </>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50 p-6">
              <button
                type="button"
                disabled={selectedTooth === null || validateSoinLoading || !selectedDrawerProtocol}
                onClick={() => void handleValidateClinicalAct()}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[color:var(--ds-primary)] py-3.5 text-sm font-semibold text-white shadow-sm transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {validateSoinLoading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Enregistrement…
                  </>
                ) : (
                  "Valider le soin"
                )}
              </button>
              <button
                type="button"
                onClick={() => setSelectedTooth(null)}
                className="w-full rounded-2xl px-5 py-2.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100"
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

