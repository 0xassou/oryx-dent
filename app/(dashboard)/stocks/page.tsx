"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Edit2,
  Package,
  PackageOpen,
  Plus,
  Search,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import AnimatedButton from "@/components/ui/AnimatedButton";
import { formatDateShort } from "@/utils/formatters";
import {
  createStockAction,
  deleteStockAction,
  getStocksAction,
  updateStockAction,
} from "@/app/actions/stocks";
import {
  notifyStockUpdated,
  type StockLine,
} from "@/utils/stockLogic";
import {
  stockRowToStockLine,
  stockLineToStockInput,
} from "@/utils/stockDbMapping";
import {
  getCabinetValue,
  persistCabinetPartial,
} from "@/lib/client/cabinetBlob";
import { StocksListSkeleton } from "@/components/ui/page-skeletons";

const CATEGORIES = [
  "Composites & Ciments",
  "Anesthésiques",
  "Consommables jetables",
  "Endodontie",
  "Empreintes & Prothèse",
  "Chirurgie & Implants",
  "Hygiène & Désinfection",
] as const;

type Categorie = (typeof CATEGORIES)[number];

const DEFAULT_CATEGORIE: Categorie = CATEGORIES[0];

/** Anciennes étiquettes → libellés cliniques actuels (localStorage hérité). */
const LEGACY_CATEGORIE_MAP: Record<string, Categorie> = {
  Composites: "Composites & Ciments",
  Anesthésiques: "Anesthésiques",
  Consommables: "Consommables jetables",
  Implants: "Chirurgie & Implants",
};

function normalizeCategorie(raw: string | undefined): Categorie {
  const s = (raw ?? "").trim();
  if (!s) return DEFAULT_CATEGORIE;
  if ((CATEGORIES as readonly string[]).includes(s)) return s as Categorie;
  return LEGACY_CATEGORIE_MAP[s] ?? DEFAULT_CATEGORIE;
}

type Statut = "En stock" | "Faible" | "Rupture";

interface Produit extends Pick<StockLine, "gestion"> {
  id: string;
  nom: string;
  categorie: Categorie;
  quantite: number;
  quantiteMax: number;
  peremption: string; // ISO 8601 ou "—"
}

interface StockHistoryItem {
  id: string;
  date: string; // format lisible avec heure
  productName: string;
  changeAmount: string; // ex: '-20' ou '+50'
  reason: string;
}

const STOCK_HISTORY_LS_KEY = "dental_stock_history";

const INITIAL_PRODUITS: Produit[] = [
  {
    id: "1",
    nom: "Résine Composite A2 - Filtek",
    categorie: "Composites & Ciments",
    gestion: "multidose",
    quantite: 34,
    quantiteMax: 50,
    peremption: "2026-10-12T00:00:00.000Z",
  },
  {
    id: "2",
    nom: "Résine Composite B1 - Filtek",
    categorie: "Composites & Ciments",
    gestion: "multidose",
    quantite: 8,
    quantiteMax: 50,
    peremption: "2026-08-05T00:00:00.000Z",
  },
  {
    id: "3",
    nom: "Articaïne 4% - Septanest",
    categorie: "Anesthésiques",
    gestion: "unitaire",
    quantite: 120,
    quantiteMax: 200,
    peremption: "2027-01-22T00:00:00.000Z",
  },
  {
    id: "4",
    nom: "Lidocaïne 2% - Xylocaïne",
    categorie: "Anesthésiques",
    gestion: "unitaire",
    quantite: 0,
    quantiteMax: 100,
    peremption: "—",
  },
  {
    id: "5",
    nom: "Gants nitrile (M) - Medicom",
    categorie: "Consommables jetables",
    gestion: "unitaire",
    quantite: 450,
    quantiteMax: 500,
    peremption: "2027-06-30T00:00:00.000Z",
  },
  {
    id: "6",
    nom: "Masques chirurgicaux - Kolmi",
    categorie: "Consommables jetables",
    gestion: "unitaire",
    quantite: 15,
    quantiteMax: 200,
    peremption: "2026-04-15T00:00:00.000Z",
  },
  {
    id: "7",
    nom: "Implant Straumann BLT Ø4.1",
    categorie: "Chirurgie & Implants",
    gestion: "unitaire",
    quantite: 6,
    quantiteMax: 20,
    peremption: "2027-12-18T00:00:00.000Z",
  },
  {
    id: "8",
    nom: "Implant Nobel Active Ø3.5",
    categorie: "Chirurgie & Implants",
    gestion: "unitaire",
    quantite: 0,
    quantiteMax: 15,
    peremption: "—",
  },
  {
    id: "9",
    nom: "Ciment verre-ionomère - GC Fuji",
    categorie: "Composites & Ciments",
    gestion: "multidose",
    quantite: 22,
    quantiteMax: 40,
    peremption: "2026-09-09T00:00:00.000Z",
  },
  {
    id: "10",
    nom: "Rouleaux de coton salivaire",
    categorie: "Consommables jetables",
    gestion: "unitaire",
    quantite: 3,
    quantiteMax: 300,
    peremption: "2026-05-01T00:00:00.000Z",
  },
  {
    id: "11",
    nom: "Anesthésique topique - Hurricaine",
    categorie: "Anesthésiques",
    gestion: "multidose",
    quantite: 18,
    quantiteMax: 30,
    peremption: "2026-11-20T00:00:00.000Z",
  },
  {
    id: "12",
    nom: "Pilier implantaire Ø4.1",
    categorie: "Chirurgie & Implants",
    gestion: "unitaire",
    quantite: 0,
    quantiteMax: 10,
    peremption: "—",
  },
];

function uid() {
  return Math.random().toString(16).slice(2);
}

function produitToStockLine(p: Produit): StockLine {
  return {
    id: p.id,
    nom: p.nom,
    quantite: p.quantite,
    quantiteMax: p.quantiteMax,
    categorie: p.categorie,
    peremption: p.peremption,
    gestion: p.gestion,
  };
}

function stockLineToProduit(line: StockLine): Produit {
  return {
    id: line.id,
    nom: line.nom,
    categorie: normalizeCategorie(line.categorie),
    gestion: line.gestion === "multidose" ? "multidose" : "unitaire",
    quantite: line.quantite,
    quantiteMax: line.quantiteMax,
    peremption:
      !line.peremption || line.peremption === "—"
        ? "—"
        : line.peremption.trim(),
  };
}

function parsePeremptionDisplayToIso(display: string): string {
  if (!display || display === "—") return "";
  const trimmed = display.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  const parts = display.split("/");
  if (parts.length !== 3) return "";
  const [dd, mm, yyyy] = parts;
  if (!dd || !mm || !yyyy) return "";
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

function parsePeremptionDisplayToDate(display: string): Date | null {
  if (!display || display === "—") return null;
  const trimmed = display.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const d = new Date(trimmed);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const iso = parsePeremptionDisplayToIso(display);
  if (!iso) return null;
  const d = new Date(iso + "T12:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatPeremptionForDisplay(raw: string): string {
  if (!raw || raw === "—") return "—";
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return formatDateShort(trimmed);
  const ymd = parsePeremptionDisplayToIso(raw);
  if (!ymd) return raw;
  return formatDateShort(`${ymd}T12:00:00.000Z`);
}

function getPct(p: Produit) {
  if (p.quantiteMax <= 0) return 0;
  return (p.quantite / p.quantiteMax) * 100;
}

function computeStatut(p: Produit): Statut {
  const pct = getPct(p);
  if (pct === 0) return "Rupture";
  if (pct < 50) return "Faible";
  return "En stock";
}

function progressBarClass(p: Produit) {
  const pct = getPct(p);
  if (pct === 0) return "bg-red-400";
  if (pct < 20) return "bg-amber-400";
  if (pct > 50) return "bg-emerald-400";
  return "bg-amber-400";
}

function badgeClass(statut: Statut) {
  switch (statut) {
    case "En stock":
      return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20 dark:bg-emerald-950/45 dark:text-emerald-300 dark:ring-emerald-400/20";
    case "Faible":
      return "bg-amber-50 text-amber-700 ring-1 ring-amber-600/20 dark:bg-amber-950/50 dark:text-amber-200 dark:ring-amber-400/20";
    case "Rupture":
      return "bg-red-50 text-red-700 ring-1 ring-red-600/20 font-semibold dark:bg-red-950/50 dark:text-red-200 dark:ring-red-400/20";
  }
}

const PEREMPTION_PROCHE_JOURS = 90;

/** Péremption dans les 90 jours (date d’expiration future ou aujourd’hui). */
function isPeremptionProche(p: Produit): boolean {
  const d = parsePeremptionDisplayToDate(p.peremption);
  if (!d) return false;
  const today = new Date();
  const start = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const exp = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = (exp.getTime() - start.getTime()) / 86400000;
  return diffDays >= 0 && diffDays <= PEREMPTION_PROCHE_JOURS;
}

/** Fond / bordure de ligne — classes Tailwind uniquement (dark mode lisible). */
function getRowTrClassName(statut: Statut, peremptionProche: boolean): string {
  const base =
    "border-b border-slate-50 last:border-0 transition-[filter] hover:brightness-[0.985] dark:border-[var(--ds-primary-border)]";

  if (statut === "Rupture") {
    if (peremptionProche) {
      return `${base} bg-[#FEF2F2] [background-image:linear-gradient(0deg,rgba(255,251,235,0.78),rgba(255,251,235,0.78))] dark:bg-red-950/40 dark:[background-image:none] dark:border-red-800/30`;
    }
    return `${base} bg-[#FEF2F2] dark:bg-red-950/40 dark:border-red-800/30`;
  }
  if (statut === "Faible") {
    if (peremptionProche) {
      return `${base} bg-[#FFF7ED] [background-image:linear-gradient(0deg,rgba(255,251,235,0.78),rgba(255,251,235,0.78))] dark:bg-amber-950/40 dark:[background-image:none] dark:border-amber-800/30`;
    }
    return `${base} bg-[#FFF7ED] dark:bg-amber-950/40 dark:border-amber-800/30`;
  }
  if (peremptionProche) {
    return `${base} bg-[#FFFBEB] dark:bg-amber-950/30`;
  }
  return base;
}

/** Retourne l'urgence de péremption : "rouge" (<30j), "orange" (<90j), null sinon. */
function getPeremptionUrgency(peremption: string): "rouge" | "orange" | null {
  if (!peremption || peremption === "—") return null;
  const d = parsePeremptionDisplayToDate(peremption);
  if (!d) return null;
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const exp = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = (exp.getTime() - start.getTime()) / 86400000;
  if (diffDays < 0) return null;
  if (diffDays < 30) return "rouge";
  if (diffDays < 90) return "orange";
  return null;
}

function peremptionProcheCount(produits: Produit[]) {
  return produits.filter((p) => isPeremptionProche(p)).length;
}

const STOCK_COLLAPSED_CATS_LS_KEY = "oryx_stock_collapsed_cats";

function formatDateTimeFR(d: Date) {
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface ProductModalProps {
  open: boolean;
  mode: "create" | "edit";
  product?: Produit | null;
  onClose: () => void;
  onSave: (draft: Omit<Produit, "id">, id?: string) => void;
}

function ProductModal({
  open,
  mode,
  product,
  onClose,
  onSave,
}: ProductModalProps) {
  const [nom, setNom] = useState("");
  const [categorie, setCategorie] = useState<Categorie>(DEFAULT_CATEGORIE);
  const [gestion, setGestion] = useState<"unitaire" | "multidose">("unitaire");
  const [quantite, setQuantite] = useState<number>(0);
  const [quantiteMax, setQuantiteMax] = useState<number>(0);
  const [peremptionIso, setPeremptionIso] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    const defaultPeremption = (() => {
      const d = new Date();
      d.setDate(d.getDate() + 180);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    })();

    setNom(product?.nom ?? "");
    setCategorie(normalizeCategorie(product?.categorie));
    setGestion(product?.gestion === "multidose" ? "multidose" : "unitaire");
    setQuantite(product?.quantite ?? 0);
    setQuantiteMax(product?.quantiteMax ?? 0);
    setPeremptionIso(parsePeremptionDisplayToIso(product?.peremption ?? "—") || defaultPeremption);
  }, [open, product]);

  if (!open) return null;

  function handleCancel() {
    onClose();
  }

  function handleSubmit() {
    const trimmedNom = nom.trim();
    if (!trimmedNom) return;

    const draft: Omit<Produit, "id"> = {
      nom: trimmedNom,
      categorie,
      gestion,
      quantite: Number.isFinite(quantite) ? quantite : 0,
      quantiteMax: Number.isFinite(quantiteMax) ? quantiteMax : 0,
      peremption: peremptionIso
        ? `${peremptionIso}T00:00:00.000Z`
        : "—",
    };

    onSave(draft, product?.id);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={mode === "create" ? "Ajouter un produit" : "Modifier un produit"}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-2xl rounded-3xl bg-[var(--ds-surface)]/95 shadow-[0_8px_30px_rgba(0,0,0,0.08)] backdrop-blur-md"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--ds-primary-border)]/60 px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold tracking-tight text-[color:var(--ds-text)]">
              {mode === "create" ? "Ajouter un produit" : "Modifier le produit"}
            </h3>
            <p className="mt-1 text-xs text-[var(--ds-text-muted)]">
              Renseignez les informations requises.
            </p>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-xl p-2 text-[var(--ds-text-muted)] transition-colors hover:bg-[var(--ds-primary-soft)] hover:text-[var(--ds-text)]"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-[var(--ds-text)]">
                Nom du produit
              </label>
              <input
                type="text"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)]/80 px-3 py-2.5 text-sm text-[var(--ds-text)] outline-none transition-colors placeholder:text-[var(--ds-text-muted)] focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                placeholder="Ex: Résine Composite A2 - Filtek"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--ds-text)]">
                Catégorie
              </label>
              <select
                value={categorie}
                onChange={(e) => setCategorie(e.target.value as Categorie)}
                className="mt-1.5 w-full rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)]/80 px-3 py-2.5 text-sm text-[var(--ds-text)] outline-none transition-colors focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--ds-text)]">
                Quantité Actuelle
              </label>
              <input
                type="number"
                min={0}
                value={quantite}
                onChange={(e) => setQuantite(Number(e.target.value))}
                className="mt-1.5 w-full rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)]/80 px-3 py-2.5 text-sm text-[var(--ds-text)] outline-none transition-colors focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--ds-text)]">
                Quantité Max/Idéale
              </label>
              <input
                type="number"
                min={0}
                value={quantiteMax}
                onChange={(e) => setQuantiteMax(Number(e.target.value))}
                className="mt-1.5 w-full rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)]/80 px-3 py-2.5 text-sm text-[var(--ds-text)] outline-none transition-colors focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
              />
            </div>

            <div className="sm:col-span-2 space-y-2">
              <div>
                <p className="text-sm font-medium text-[var(--ds-text)]">
                  Mode de déduction au fauteuil
                </p>
                <p className="mt-0.5 text-xs text-[var(--ds-text-muted)]">
                  Détermine si la consommation est déduite automatiquement lors des actes ou suivie
                  manuellement (multi-doses).
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label
                  className={[
                    "flex cursor-pointer gap-3 rounded-xl border p-3.5 transition-colors",
                    gestion === "unitaire"
                      ? "border-[color:var(--ds-primary)] bg-[var(--ds-primary-soft)]/60 ring-1 ring-[color:var(--ds-primary)]/15"
                      : "border-[var(--ds-primary-border)] bg-[var(--ds-surface)]/80 hover:border-[var(--ds-primary-border)]",
                  ].join(" ")}
                >
                  <input
                    type="radio"
                    name="gestion-stock-modal"
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[color:var(--ds-primary)]"
                    checked={gestion === "unitaire"}
                    onChange={() => setGestion("unitaire")}
                  />
                  <span className="min-w-0 text-sm leading-snug text-[var(--ds-text)]">
                    <span className="font-medium">Automatique (Unitaire)</span>
                    <span className="mt-1 block text-xs font-normal text-[var(--ds-text-muted)]">
                      Ex. : gants, aiguilles
                    </span>
                  </span>
                </label>
                <label
                  className={[
                    "flex cursor-pointer gap-3 rounded-xl border p-3.5 transition-colors",
                    gestion === "multidose"
                      ? "border-[color:var(--ds-primary)] bg-[var(--ds-primary-soft)]/60 ring-1 ring-[color:var(--ds-primary)]/15"
                      : "border-[var(--ds-primary-border)] bg-[var(--ds-surface)]/80 hover:border-[var(--ds-primary-border)]",
                  ].join(" ")}
                >
                  <input
                    type="radio"
                    name="gestion-stock-modal"
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[color:var(--ds-primary)]"
                    checked={gestion === "multidose"}
                    onChange={() => setGestion("multidose")}
                  />
                  <span className="min-w-0 text-sm leading-snug text-[var(--ds-text)]">
                    <span className="font-medium">Manuelle (Multi-doses)</span>
                    <span className="mt-1 block text-xs font-normal text-[var(--ds-text-muted)]">
                      Ex. : tubes, flacons
                    </span>
                  </span>
                </label>
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-[var(--ds-text)]">
                Date de péremption
              </label>
              <input
                type="date"
                value={peremptionIso}
                onChange={(e) => setPeremptionIso(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)]/80 px-3 py-2.5 text-sm text-[var(--ds-text)] outline-none transition-colors focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-[var(--ds-primary-border)]/60 px-6 py-4">
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-4 py-2.5 text-sm font-medium text-[var(--ds-text-muted)] shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-colors hover:bg-[var(--ds-bg)]"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="rounded-xl bg-[color:var(--ds-primary)] px-4 py-2.5 text-sm font-medium text-white shadow-[0_8px_30px_rgba(0,0,0,0.08)] transition-colors hover:opacity-90"
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

export default function StocksPage() {
  const [produits, setProduits] = useState<Produit[]>(INITIAL_PRODUITS);
  const [stockHistory, setStockHistory] = useState<StockHistoryItem[]>([]);
  const [search, setSearch] = useState("");
  const [filtre, setFiltre] = useState<Categorie | "">("");
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(
    () => new Set(),
  );

  const [editingStock, setEditingStock] = useState<Produit | null>(null);
  const [stockActionType, setStockActionType] = useState<"add" | "remove">("add");
  const [stockAdjustValue, setStockAdjustValue] = useState<string>("1");
  const [stockReason, setStockReason] = useState<string>("");
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [stockToast, setStockToast] = useState<string | null>(null);

  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Produit | null>(null);
  const [hoveredProductId, setHoveredProductId] = useState<string | null>(null);
  const [showOnlyRupture, setShowOnlyRupture] = useState(false);
  const [sortCol, setSortCol] = useState<"quantite" | "peremption" | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const modalMode = editingProduct ? "edit" : "create";

  // PostgreSQL pour le stock ; historique et UI dans cabinet_settings (JSONB).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        let hist = getCabinetValue<StockHistoryItem[]>(STOCK_HISTORY_LS_KEY);
        if (!Array.isArray(hist) && typeof window !== "undefined") {
          const rawHistory = localStorage.getItem(STOCK_HISTORY_LS_KEY);
          if (rawHistory) {
            try {
              const parsedHistory = JSON.parse(rawHistory) as unknown;
              if (Array.isArray(parsedHistory)) {
                hist = parsedHistory as StockHistoryItem[];
                void persistCabinetPartial({
                  [STOCK_HISTORY_LS_KEY]: hist,
                });
                localStorage.removeItem(STOCK_HISTORY_LS_KEY);
              }
            } catch {
              /* ignore */
            }
          }
        }
        if (!cancelled) {
          setStockHistory(Array.isArray(hist) ? hist : []);
        }

        const res = await getStocksAction();
        if (cancelled) return;
        if (res.ok && res.data.length > 0) {
          setProduits(
            res.data.map((row) =>
              stockLineToProduit(stockRowToStockLine(row)),
            ),
          );
        } else if (res.ok) {
          setProduits(INITIAL_PRODUITS);
        }
      } catch {
        if (!cancelled) {
          setProduits(INITIAL_PRODUITS);
          setStockHistory([]);
        }
      } finally {
        if (!cancelled) setHasHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      let parsed: unknown = getCabinetValue<string[]>(
        STOCK_COLLAPSED_CATS_LS_KEY,
      );
      if (!Array.isArray(parsed) && typeof window !== "undefined") {
        const raw = localStorage.getItem(STOCK_COLLAPSED_CATS_LS_KEY);
        if (raw) {
          parsed = JSON.parse(raw) as unknown;
          if (Array.isArray(parsed)) {
            void persistCabinetPartial({
              [STOCK_COLLAPSED_CATS_LS_KEY]: parsed,
            });
            localStorage.removeItem(STOCK_COLLAPSED_CATS_LS_KEY);
          }
        }
      }
      if (Array.isArray(parsed)) {
        setCollapsedCats(
          new Set(
            parsed.filter((x): x is string => typeof x === "string"),
          ),
        );
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!hasHydrated) return;
    void persistCabinetPartial({
      [STOCK_HISTORY_LS_KEY]: stockHistory,
    });
  }, [stockHistory, hasHydrated]);

  useEffect(() => {
    if (!stockToast) return;
    const t = window.setTimeout(() => setStockToast(null), 2800);
    return () => window.clearTimeout(t);
  }, [stockToast]);

  const filtered = useMemo(() => {
    return produits.filter((p) => {
      const matchSearch =
        search === "" ||
        p.nom.toLowerCase().includes(search.toLowerCase());
      const matchCat = filtre === "" || p.categorie === filtre;
      const matchRupture = !showOnlyRupture || computeStatut(p) === "Rupture";
      return matchSearch && matchCat && matchRupture;
    });
  }, [produits, search, filtre, showOnlyRupture]);

  const groupedByCategory = useMemo(() => {
    const map = new Map<Categorie, Produit[]>();
    for (const p of filtered) {
      const c = normalizeCategorie(p.categorie);
      if (!map.has(c)) map.set(c, []);
      map.get(c)!.push(p);
    }
    const order: Categorie[] = [];
    for (const cat of CATEGORIES) {
      if (map.has(cat)) order.push(cat);
    }
    for (const cat of map.keys()) {
      if (!order.includes(cat)) order.push(cat);
    }
    return order.map((cat) => {
      let items = map.get(cat)!;
      if (sortCol) {
        items = [...items].sort((a, b) => {
          let va: number;
          let vb: number;
          if (sortCol === "quantite") {
            va = a.quantite;
            vb = b.quantite;
          } else {
            va = parsePeremptionDisplayToDate(a.peremption)?.getTime() ?? Infinity;
            vb = parsePeremptionDisplayToDate(b.peremption)?.getTime() ?? Infinity;
          }
          return sortDir === "asc" ? va - vb : vb - va;
        });
      }
      return [cat, items] as const;
    });
  }, [filtered, sortCol, sortDir]);

  const totalProduits = produits.length;
  const enRupture = produits.filter(
    (p) => computeStatut(p) === "Rupture",
  ).length;
  const peremptionProche = peremptionProcheCount(produits);

  const editingStockCurrentQty = useMemo(() => {
    if (!editingStock) return 0;
    return (
      produits.find((p) => p.id === editingStock.id)?.quantite ??
      editingStock.quantite
    );
  }, [editingStock, produits]);

  const stockAdjustQtyNum = Number(stockAdjustValue);
  const stockAdjustQtyValid =
    Number.isFinite(stockAdjustQtyNum) && stockAdjustQtyNum > 0;
  const stockRemoveExceedsAvailable =
    stockActionType === "remove" &&
    stockAdjustQtyValid &&
    stockAdjustQtyNum > editingStockCurrentQty;
  const canSubmitStockAdjust =
    editingStock != null &&
    stockAdjustQtyValid &&
    !stockRemoveExceedsAvailable;

  function handleRuptureKpiClick() {
    const ruptureCategories = new Set(
      produits
        .filter((p) => computeStatut(p) === "Rupture")
        .map((p) => p.categorie),
    );
    setCollapsedCats((prev) => {
      const next = new Set(prev);
      for (const cat of ruptureCategories) next.delete(cat);
      void persistCabinetPartial({
        [STOCK_COLLAPSED_CATS_LS_KEY]: [...next],
      });
      return next;
    });
    setFiltre("");
    setSearch("");
    setShowOnlyRupture(true);
  }

  function handleSort(col: "quantite" | "peremption") {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  }

  function openCreateModal() {
    setEditingProduct(null);
    setIsProductModalOpen(true);
  }

  function openEditModal(product: Produit) {
    setEditingProduct(product);
    setIsProductModalOpen(true);
  }

  function toggleCategorySection(cat: string) {
    setCollapsedCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      void persistCabinetPartial({
        [STOCK_COLLAPSED_CATS_LS_KEY]: [...next],
      });
      return next;
    });
  }

  function handleDeleteProduct(p: Produit) {
    if (
      !window.confirm(
        `Supprimer le produit « ${p.nom} » ? Cette action est irréversible.`,
      )
    ) {
      return;
    }
    void (async () => {
      const res = await deleteStockAction(p.id);
      if (!res.ok) {
        console.error(res.error);
        return;
      }
      setProduits((prev) => prev.filter((x) => x.id !== p.id));
      notifyStockUpdated();
    })();
  }

  function handleSaveProduct(draft: Omit<Produit, "id">, id?: string) {
    const merged: Omit<Produit, "id"> = {
      ...draft,
      categorie: normalizeCategorie(draft.categorie),
      gestion: draft.gestion === "multidose" ? "multidose" : "unitaire",
    };

    void (async () => {
      if (id) {
        const line = produitToStockLine({ id, ...merged } as Produit);
        const payload = stockLineToStockInput(line);
        const res = await updateStockAction(id, payload);
        if (!res.ok) {
          console.error(res.error);
          return;
        }
        setProduits((prev) =>
          prev.map((p) =>
            p.id === id
              ? stockLineToProduit(stockRowToStockLine(res.data))
              : p,
          ),
        );
      } else {
        const tmp = produitToStockLine({
          id: "",
          ...merged,
        } as Produit);
        const payload = stockLineToStockInput(tmp);
        const res = await createStockAction(payload);
        if (!res.ok) {
          console.error(res.error);
          return;
        }
        const produit = stockLineToProduit(stockRowToStockLine(res.data));
        setProduits((prev) => [produit, ...prev]);
      }
      notifyStockUpdated();
      setIsProductModalOpen(false);
    })();
  }

  function handleOpenMultidoseUnit(productId: string) {
    void (async () => {
      const item = produits.find((x) => x.id === productId);
      if (!item) return;
      const newQty = Math.max(0, item.quantite - 1);
      const res = await updateStockAction(productId, {
        quantite: newQty,
      });
      if (!res.ok) {
        console.error(res.error);
        return;
      }
      setProduits((prev) =>
        prev.map((prod) =>
          prod.id === productId
            ? stockLineToProduit(stockRowToStockLine(res.data))
            : prod,
        ),
      );
      notifyStockUpdated();
      setStockToast("Une unité a été retirée du stock central.");
    })();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[color:var(--ds-text)]">
            Gestion des Stocks
          </h1>
          <p className="mt-1 text-xs text-[var(--ds-text-muted)]">
            Vue d&apos;ensemble du matériel et des consommables
          </p>
        </div>
        <AnimatedButton onClick={openCreateModal}>
          <Plus className="h-4 w-4" strokeWidth={2} />
          Ajouter un produit
        </AnimatedButton>
      </div>

      {!hasHydrated ? (
        <StocksListSkeleton />
      ) : (
        <>
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3 lg:grid-cols-3">
        <div className="kpi-card flex items-center gap-4 rounded-2xl border border-violet-200 bg-violet-50 px-6 py-3 shadow-sm">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-[color:var(--ds-primary)]">
            <Package className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-base font-semibold uppercase tracking-wider text-[var(--ds-text-muted)]">
              Total Produits
            </p>
            <p className="mt-1 font-['DM_Mono',monospace] text-4xl font-bold text-[color:var(--ds-text)]">
              {totalProduits}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleRuptureKpiClick}
          className={[
            "kpi-card flex w-full items-center gap-4 rounded-2xl border px-6 py-3 shadow-sm text-left transition-shadow hover:shadow-md",
            showOnlyRupture
              ? "border-red-400 bg-red-100 ring-2 ring-red-300"
              : "border-red-200 bg-red-50",
          ].join(" ")}
          title="Voir les produits en rupture"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-100 text-red-600">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-base font-semibold uppercase tracking-wider text-[var(--ds-text-muted)]">
              En rupture
            </p>
            <p className="mt-1 font-['DM_Mono',monospace] text-4xl font-bold text-red-600">
              {enRupture}
            </p>
          </div>
        </button>

        <div className="kpi-card flex items-center gap-4 rounded-2xl border border-amber-200 bg-amber-50 px-6 py-3 shadow-sm">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
            <Clock className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-base font-semibold uppercase tracking-wider text-[var(--ds-text-muted)]">
              Péremption proche
            </p>
            <p className="mt-1 font-['DM_Mono',monospace] text-4xl font-bold text-amber-600">
              {peremptionProche}
            </p>
          </div>
        </div>
      </div>

      {/* Recherche & Filtres */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setShowOnlyRupture(false); }}
            placeholder="Rechercher un produit…"
            className="w-full rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)]/80 py-2.5 pl-9 pr-3 text-sm text-[var(--ds-text)] outline-none transition-colors placeholder:text-[var(--ds-text-muted)] focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
          />
        </div>
        <select
          value={filtre}
          onChange={(e) => { setFiltre(e.target.value as Categorie | ""); setShowOnlyRupture(false); }}
          className="rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)]/80 px-3 py-2.5 text-sm text-[var(--ds-text)] outline-none transition-colors focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
        >
          <option value="">Toutes les catégories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => setShowHistoryModal(true)}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-4 py-2.5 text-xs font-medium text-[var(--ds-text-muted)] shadow-sm transition-colors hover:bg-[var(--ds-bg)] hover:text-[color:var(--ds-text)] sm:w-auto sm:ml-2"
          aria-label="Historique des mouvements de stock"
        >
          <Clock className="h-4 w-4" />
          Historique des mouvements
        </button>
      </div>

      {/* Tableau */}
      <div className="overflow-x-auto rounded-2xl bg-[var(--ds-surface)] shadow-sm">
        <table className="w-full min-w-[720px]">
            <thead>
              <tr className="border-b border-[var(--ds-primary-border)]">
                <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--ds-text-muted)]">
                  Produit
                </th>
                <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--ds-text-muted)]">
                  <button
                    type="button"
                    onClick={() => handleSort("quantite")}
                    className="inline-flex items-center gap-1 transition-colors hover:text-[var(--ds-text)]"
                  >
                    Quantité
                    {sortCol === "quantite" ? (
                      sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronUp className="h-3 w-3 opacity-30" />
                    )}
                  </button>
                </th>
                <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--ds-text-muted)]">
                  Statut
                </th>
                <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--ds-text-muted)]">
                  <button
                    type="button"
                    onClick={() => handleSort("peremption")}
                    className="inline-flex items-center gap-1 transition-colors hover:text-[var(--ds-text)]"
                  >
                    Péremption
                    {sortCol === "peremption" ? (
                      sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronUp className="h-3 w-3 opacity-30" />
                    )}
                  </button>
                </th>
                <th className="px-5 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ds-text-muted)]">
                  Édition
                </th>
                <th className="px-5 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--ds-text-muted)]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {groupedByCategory.map(([categorie, items]) => {
                const isCollapsed = collapsedCats.has(categorie);
                return (
                  <Fragment key={categorie}>
                    <tr className="border-b border-[var(--ds-primary-border)] bg-[var(--ds-bg)]/80">
                      <td colSpan={6} className="px-2 py-2">
                        <button
                          type="button"
                          onClick={() => toggleCategorySection(categorie)}
                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-[color:var(--ds-text)] transition-colors hover:bg-[var(--ds-surface)]"
                          aria-expanded={!isCollapsed}
                        >
                          {isCollapsed ? (
                            <ChevronRight className="h-4 w-4 shrink-0 text-[var(--ds-text-muted)]" />
                          ) : (
                            <ChevronDown className="h-4 w-4 shrink-0 text-[var(--ds-text-muted)]" />
                          )}
                          <Tag className="h-3.5 w-3.5 text-[var(--ds-text-muted)]" />
                          <span>{categorie}</span>
                          <span className="text-xs font-medium text-[var(--ds-text-muted)]">
                            ({items.length}{" "}
                            {items.length === 1 ? "produit" : "produits"})
                          </span>
                        </button>
                      </td>
                    </tr>
                    {!isCollapsed &&
                      items.map((p) => {
                        const pct =
                          p.quantiteMax > 0
                            ? Math.round((p.quantite / p.quantiteMax) * 100)
                            : 0;
                        const statut = computeStatut(p);
                        const peremptionProche = isPeremptionProche(p);
                        const rowClass = getRowTrClassName(statut, peremptionProche);
                        return (
                          <tr
                            key={p.id}
                            className={rowClass}
                            onMouseEnter={() => setHoveredProductId(p.id)}
                            onMouseLeave={() => setHoveredProductId(null)}
                          >
                            {/* Produit */}
                            <td className="px-5 py-4">
                              <div className="flex items-start gap-2">
                                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--ds-primary-soft)]">
                                  <Package className="h-3.5 w-3.5 text-[color:var(--ds-primary)]" aria-hidden />
                                </div>
                                <p
                                  className={[
                                    "min-w-0 text-sm font-medium text-[var(--ds-text)]",
                                    statut === "Faible" || statut === "Rupture"
                                      ? "dark:text-gray-200"
                                      : "",
                                  ].join(" ")}
                                >
                                  {p.nom}
                                </p>
                              </div>
                            </td>

                            {/* Quantité (jauge) */}
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-3">
                                <div className="h-2 w-24 overflow-hidden rounded-full bg-[var(--ds-primary-soft)]">
                                  <div
                                    className={`h-full rounded-full transition-all ${progressBarClass(p)}`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <span className="text-xs font-semibold tabular-nums text-[var(--ds-text)]">
                                  {p.quantite}/{p.quantiteMax}
                                </span>
                              </div>
                            </td>

                            {/* Statut */}
                            <td className="px-5 py-4">
                              <span
                                className={`inline-flex rounded-lg px-2.5 py-0.5 text-[11px] font-medium ${badgeClass(statut)}`}
                              >
                                {statut}
                              </span>
                            </td>

                            {/* Péremption */}
                            <td className="px-5 py-4">
                              {(() => {
                                const urgency = getPeremptionUrgency(p.peremption);
                                const label = formatPeremptionForDisplay(p.peremption);
                                if (urgency === "rouge") {
                                  return (
                                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:border-red-800/40 dark:bg-red-950/45 dark:text-red-300">
                                      <Clock className="h-3.5 w-3.5" aria-hidden />
                                      {label}
                                    </span>
                                  );
                                }
                                if (urgency === "orange") {
                                  return (
                                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-800 dark:border-orange-800/40 dark:bg-orange-950/45 dark:text-orange-200">
                                      <Clock className="h-3.5 w-3.5" aria-hidden />
                                      {label}
                                    </span>
                                  );
                                }
                                return (
                                  <span className="text-sm text-[var(--ds-text-muted)]">
                                    {label}
                                  </span>
                                );
                              })()}
                            </td>

                            {/* Édition */}
                            <td className="px-5 py-4 text-right">
                              <div
                                className={`inline-flex items-center justify-end gap-1 transition-opacity ${
                                  hoveredProductId === p.id
                                    ? "opacity-100"
                                    : "opacity-0"
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => openEditModal(p)}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-[var(--ds-text-muted)] transition-colors hover:bg-[var(--ds-primary-soft)] hover:text-[var(--ds-text)]"
                                  aria-label={`Modifier ${p.nom}`}
                                  title="Modifier"
                                >
                                  <Edit2 className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteProduct(p)}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-red-600/90 transition-colors hover:bg-red-50"
                                  aria-label={`Supprimer ${p.nom}`}
                                  title="Supprimer"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </td>

                            {/* Actions rapides (multidose + / -) */}
                            <td className="px-5 py-4 text-right">
                              <div className="inline-flex flex-wrap items-center justify-end gap-2">
                                {p.gestion === "multidose" ? (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenMultidoseUnit(p.id)}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--ds-primary-soft)] text-[var(--ds-primary)] transition-colors hover:bg-[var(--ds-primary-border)]"
                                    title="Ouvrir une unité (Multidose)"
                                    aria-label={`Ouvrir une unité — ${p.nom}`}
                                  >
                                    <PackageOpen
                                      className="h-4 w-4 shrink-0"
                                      aria-hidden
                                    />
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingStock(p);
                                    setStockActionType("remove");
                                    setStockAdjustValue("1");
                                    setStockReason("");
                                  }}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-red-50 text-red-700 transition-colors hover:bg-red-50/80"
                                  aria-label={`Retirer du stock : ${p.nom}`}
                                >
                                  -
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingStock(p);
                                    setStockActionType("add");
                                    setStockAdjustValue("1");
                                    setStockReason("");
                                  }}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--ds-primary-soft)] text-[var(--ds-primary)] transition-colors hover:bg-[var(--ds-primary-soft)]/80"
                                  aria-label={`Ajouter du stock : ${p.nom}`}
                                >
                                  +
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </Fragment>
                );
              })}

              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-12 text-center text-sm text-[var(--ds-text-muted)]"
                  >
                    Aucun produit trouvé.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
      </div>

      {editingStock && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={
            stockActionType === "add"
              ? `Ajouter du stock : ${editingStock.nom}`
              : `Retirer du stock : ${editingStock.nom}`
          }
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setEditingStock(null);
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-[var(--ds-surface)] p-6 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold tracking-tight text-[color:var(--ds-text)]">
              {stockActionType === "add"
                ? "Ajouter du stock"
                : "Retirer du stock"}
            </h3>
            <p className="mt-1 text-sm text-[var(--ds-text)]">{editingStock.nom}</p>
            <p className="mt-1 text-xs text-[var(--ds-text-muted)]">
              Stock actuel :{" "}
              <span className="font-semibold text-[var(--ds-text)]">
                {editingStockCurrentQty}
              </span>{" "}
              / {editingStock.quantiteMax}
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--ds-text)]">
                  {stockActionType === "add"
                    ? "Quantité à ajouter"
                    : "Quantité à retirer"}
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={
                    stockActionType === "remove"
                      ? editingStockCurrentQty
                      : undefined
                  }
                  step={1}
                  value={stockAdjustValue}
                  onChange={(e) => setStockAdjustValue(e.target.value)}
                  className={[
                    "mt-1.5 w-full rounded-2xl border bg-[var(--ds-surface)] px-3 py-2.5 text-sm text-[var(--ds-text)] outline-none transition-colors focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20",
                    stockRemoveExceedsAvailable
                      ? "border-red-300"
                      : "border-[var(--ds-primary-border)]",
                  ].join(" ")}
                />
                {stockRemoveExceedsAvailable ? (
                  <p className="mt-1.5 text-xs font-medium text-red-600">
                    La quantité à retirer ne peut pas dépasser le stock actuel (
                    {editingStockCurrentQty}).
                  </p>
                ) : null}
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--ds-text)]">
                  Raison (optionnel)
                </label>
                <input
                  type="text"
                  value={stockReason}
                  onChange={(e) => setStockReason(e.target.value)}
                  placeholder="Ex: correction inventaire"
                  className="mt-1.5 w-full rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 py-2.5 text-sm text-[var(--ds-text)] outline-none transition-colors placeholder:text-[var(--ds-text-muted)] focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-[var(--ds-primary-border)]/60 px-1 pt-4">
              <button
                type="button"
                onClick={() => setEditingStock(null)}
                className="rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-4 py-2.5 text-sm font-medium text-[var(--ds-text-muted)] shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-colors hover:bg-[var(--ds-bg)]"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={!canSubmitStockAdjust}
                onClick={() => {
                  if (!editingStock || !canSubmitStockAdjust) return;
                  const qty = Number(stockAdjustValue);
                  if (!Number.isFinite(qty) || qty <= 0) return;
                  if (
                    stockActionType === "remove" &&
                    qty > editingStockCurrentQty
                  ) {
                    return;
                  }

                  const delta = stockActionType === "add" ? qty : -qty;
                  const changeAmount = `${delta >= 0 ? "+" : ""}${delta}`;
                  const reason = stockReason.trim();
                  const dateNow = new Date();
                  setProduits((prev) =>
                    prev.map((prod) =>
                      prod.id === editingStock.id
                        ? {
                            ...prod,
                            quantite: Math.max(0, prod.quantite + delta),
                          }
                        : prod,
                    ),
                  );
                  setStockHistory((prev) => [
                    {
                      id: `h-${uid()}`,
                      date: formatDateTimeFR(dateNow),
                      productName: editingStock.nom,
                      changeAmount,
                      reason,
                    },
                    ...prev,
                  ]);
                  setEditingStock(null);
                }}
                className="rounded-2xl bg-[color:var(--ds-primary)] px-4 py-2.5 text-sm font-medium text-white shadow-[0_8px_30px_rgba(0,0,0,0.08)] transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {stockActionType === "add" ? "Ajouter" : "Retirer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showHistoryModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Registre des mouvements de stock"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowHistoryModal(false);
          }}
        >
          <div
            className="w-full max-w-4xl rounded-3xl bg-[var(--ds-surface)] p-6 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold tracking-tight text-[color:var(--ds-text)]">
                  Registre des mouvements de stock
                </h3>
                <p className="mt-1 text-xs text-[var(--ds-text-muted)]">
                  Ajustements récents enregistrés localement sur cet appareil.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="rounded-2xl p-2 text-[var(--ds-text-muted)] transition-colors hover:bg-[var(--ds-bg)] hover:text-[var(--ds-text)]"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5">
              {stockHistory.length === 0 ? (
                <div className="rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-8 text-center text-sm text-[var(--ds-text-muted)]">
                  Aucun mouvement récent
                </div>
              ) : (
                <div className="space-y-4">
                  {stockHistory.map((h, idx) => {
                    const isIncrease = h.changeAmount.trim().startsWith("+");
                    const isLast = idx === stockHistory.length - 1;
                    return (
                      <div key={h.id} className="flex gap-4">
                        <div className="relative mt-1 flex w-6 justify-center">
                          <span className="absolute top-0 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full bg-[var(--ds-surface)] ring-4 ring-[var(--ds-primary-border)]" />
                          {!isLast ? (
                            <span className="absolute top-3 left-1/2 h-full w-px -translate-x-1/2 bg-[var(--ds-primary-soft)]" />
                          ) : null}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="text-xs font-medium text-[var(--ds-text-muted)] tabular-nums">
                              {h.date}
                            </span>
                            <span className="text-sm font-semibold text-[color:var(--ds-text)]">
                              {h.productName}
                            </span>
                            <span
                              className={[
                                "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
                                isIncrease
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-red-50 text-red-600",
                              ].join(" ")}
                            >
                              {h.changeAmount}
                            </span>
                          </div>
                          <p className="mt-2 text-sm italic text-[var(--ds-text-muted)]">
                            {h.reason ? h.reason : "—"}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-[var(--ds-primary-border)]/60 px-1 pt-4">
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-4 py-2.5 text-sm font-medium text-[var(--ds-text-muted)] shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-colors hover:bg-[var(--ds-bg)]"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

        </>
      )}

      <ProductModal
        open={isProductModalOpen}
        mode={modalMode}
        product={editingProduct}
        onClose={() => setIsProductModalOpen(false)}
        onSave={(draft, id) => handleSaveProduct(draft, id)}
      />

      {stockToast ? (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-[100] max-w-sm rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-4 py-3 text-sm font-medium text-[var(--ds-primary-hover)] shadow-lg shadow-[var(--ds-primary-border)]/50"
        >
          {stockToast}
        </div>
      ) : null}
    </div>
  );
}

