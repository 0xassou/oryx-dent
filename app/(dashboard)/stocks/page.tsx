"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Clock,
  MoreVertical,
  Package,
  PackageOpen,
  Plus,
  Search,
  X,
} from "lucide-react";
import { formatDateShort } from "@/utils/formatters";
import {
  DENTAL_STOCK_LS_KEY,
  saveDentalStock,
  type StockLine,
} from "@/utils/stockLogic";

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
      return "bg-emerald-50 text-emerald-700";
    case "Faible":
      return "bg-amber-50 text-amber-700";
    case "Rupture":
      return "bg-red-50 text-red-600";
  }
}

function peremptionProcheCount(produits: Produit[]) {
  const thresholdDays = 210; // ~7 mois, pour un rendu stable sur la maquette
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() + thresholdDays);

  return produits.filter((p) => {
    const d = parsePeremptionDisplayToDate(p.peremption);
    if (!d) return false;
    return d >= now && d <= cutoff;
  }).length;
}

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
        className="w-full max-w-2xl rounded-3xl bg-white/95 shadow-[0_8px_30px_rgba(0,0,0,0.08)] backdrop-blur-md"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200/60 px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold tracking-tight text-[color:var(--ds-text)]">
              {mode === "create" ? "Ajouter un produit" : "Modifier le produit"}
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Renseignez les informations requises.
            </p>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Nom du produit
              </label>
              <input
                type="text"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                placeholder="Ex: Résine Composite A2 - Filtek"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                Catégorie
              </label>
              <select
                value={categorie}
                onChange={(e) => setCategorie(e.target.value as Categorie)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                Quantité Actuelle
              </label>
              <input
                type="number"
                min={0}
                value={quantite}
                onChange={(e) => setQuantite(Number(e.target.value))}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">
                Quantité Max/Idéale
              </label>
              <input
                type="number"
                min={0}
                value={quantiteMax}
                onChange={(e) => setQuantiteMax(Number(e.target.value))}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
              />
            </div>

            <div className="sm:col-span-2 space-y-2">
              <div>
                <p className="text-sm font-medium text-slate-700">
                  Mode de déduction au fauteuil
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Détermine si la consommation est déduite automatiquement lors des actes ou suivie
                  manuellement (multi-doses).
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label
                  className={[
                    "flex cursor-pointer gap-3 rounded-xl border p-3.5 transition-colors",
                    gestion === "unitaire"
                      ? "border-[color:var(--ds-primary)] bg-sky-50/60 ring-1 ring-[color:var(--ds-primary)]/15"
                      : "border-slate-200 bg-white/80 hover:border-slate-300",
                  ].join(" ")}
                >
                  <input
                    type="radio"
                    name="gestion-stock-modal"
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[color:var(--ds-primary)]"
                    checked={gestion === "unitaire"}
                    onChange={() => setGestion("unitaire")}
                  />
                  <span className="min-w-0 text-sm leading-snug text-slate-800">
                    <span className="font-medium">Automatique (Unitaire)</span>
                    <span className="mt-1 block text-xs font-normal text-slate-500">
                      Ex. : gants, aiguilles
                    </span>
                  </span>
                </label>
                <label
                  className={[
                    "flex cursor-pointer gap-3 rounded-xl border p-3.5 transition-colors",
                    gestion === "multidose"
                      ? "border-[color:var(--ds-primary)] bg-sky-50/60 ring-1 ring-[color:var(--ds-primary)]/15"
                      : "border-slate-200 bg-white/80 hover:border-slate-300",
                  ].join(" ")}
                >
                  <input
                    type="radio"
                    name="gestion-stock-modal"
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[color:var(--ds-primary)]"
                    checked={gestion === "multidose"}
                    onChange={() => setGestion("multidose")}
                  />
                  <span className="min-w-0 text-sm leading-snug text-slate-800">
                    <span className="font-medium">Manuelle (Multi-doses)</span>
                    <span className="mt-1 block text-xs font-normal text-slate-500">
                      Ex. : tubes, flacons
                    </span>
                  </span>
                </label>
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700">
                Date de péremption
              </label>
              <input
                type="date"
                value={peremptionIso}
                onChange={(e) => setPeremptionIso(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-200/60 px-6 py-4">
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-colors hover:bg-slate-50"
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
  const [openActionsId, setOpenActionsId] = useState<string | null>(null);

  const [editingStock, setEditingStock] = useState<Produit | null>(null);
  const [stockActionType, setStockActionType] = useState<"add" | "remove">("add");
  const [stockAdjustValue, setStockAdjustValue] = useState<string>("1");
  const [stockReason, setStockReason] = useState<string>("");
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [hasHydrated, setHasHydrated] = useState(false);
  const [stockToast, setStockToast] = useState<string | null>(null);

  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Produit | null>(null);
  const modalMode = editingProduct ? "edit" : "create";

  // Hydratation Next.js-safe : on recharge le stock (et l'historique) depuis localStorage au montage.
  useEffect(() => {
    try {
      const rawStock = localStorage.getItem(DENTAL_STOCK_LS_KEY);
      if (!rawStock) {
        setProduits(INITIAL_PRODUITS);
      } else {
        const parsed = JSON.parse(rawStock);
        if (Array.isArray(parsed)) {
          setProduits(
            (parsed as Produit[]).map((row) => ({
              ...row,
              categorie: normalizeCategorie(row.categorie),
              gestion:
                row.gestion === "multidose" ? "multidose" : "unitaire",
            })),
          );
        }
      }

      const rawHistory = localStorage.getItem(STOCK_HISTORY_LS_KEY);
      if (!rawHistory) {
        setStockHistory([]);
      } else {
        const parsedHistory = JSON.parse(rawHistory);
        if (Array.isArray(parsedHistory)) {
          setStockHistory(parsedHistory as StockHistoryItem[]);
        }
      }
    } catch {
      // En cas d'erreur (JSON invalide), on retombe sur les mocks.
      setProduits(INITIAL_PRODUITS);
      setStockHistory([]);
    } finally {
      setHasHydrated(true);
    }
  }, []);

  // Persistance : sauvegarde à chaque modification.
  useEffect(() => {
    if (!hasHydrated) return;
    try {
      localStorage.setItem(DENTAL_STOCK_LS_KEY, JSON.stringify(produits));
    } catch {
      // Ignore : quota / navigateur privé, etc.
    }
  }, [produits, hasHydrated]);

  useEffect(() => {
    if (!hasHydrated) return;
    try {
      localStorage.setItem(
        STOCK_HISTORY_LS_KEY,
        JSON.stringify(stockHistory),
      );
    } catch {
      // Ignore : quota / navigateur privé, etc.
    }
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
      return matchSearch && matchCat;
    });
  }, [produits, search, filtre]);

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

  function openCreateModal() {
    setEditingProduct(null);
    setIsProductModalOpen(true);
    setOpenActionsId(null);
  }

  function openEditModal(product: Produit) {
    setEditingProduct(product);
    setIsProductModalOpen(true);
    setOpenActionsId(null);
  }

  function handleSaveProduct(draft: Omit<Produit, "id">, id?: string) {
    const merged: Omit<Produit, "id"> = {
      ...draft,
      categorie: normalizeCategorie(draft.categorie),
      gestion: draft.gestion === "multidose" ? "multidose" : "unitaire",
    };

    if (id) {
      setProduits((prev) => {
        const next = prev.map((p) =>
          p.id === id ? { ...p, ...merged } : p,
        );
        saveDentalStock(next as StockLine[]);
        return next;
      });
    } else {
      setProduits((prev) => {
        const newId = `p-${uid()}`;
        const next = [{ id: newId, ...merged }, ...prev];
        saveDentalStock(next as StockLine[]);
        return next;
      });
    }
    setIsProductModalOpen(false);
  }

  function handleOpenMultidoseUnit(productId: string) {
    setProduits((prev) => {
      const item = prev.find((x) => x.id === productId);
      if (!item) return prev;

      const newQty = Math.max(0, item.quantite - 1);
      const next = prev.map((prod) =>
        prod.id === productId ? { ...prod, quantite: newQty } : prod,
      );
      saveDentalStock(next as StockLine[]);
      return next;
    });
    setStockToast("Une unité a été retirée du stock central.");
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[color:var(--ds-text)]">
            Gestion des Stocks
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Vue d&apos;ensemble du matériel et des consommables
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[color:var(--ds-primary)] px-4 py-2.5 text-xs font-medium text-white shadow-sm transition-colors hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Ajouter un produit
        </button>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex items-center gap-4 rounded-2xl bg-white p-5 shadow-sm">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-[color:var(--ds-primary)]">
            <Package className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[11px] font-medium tracking-tight text-slate-500">
              Total Produits
            </p>
            <p className="mt-0.5 text-xl font-semibold tracking-tight text-[color:var(--ds-text)]">
              {totalProduits}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-2xl bg-white p-5 shadow-sm">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-500">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[11px] font-medium tracking-tight text-slate-500">
              En rupture
            </p>
            <p className="mt-0.5 text-xl font-semibold tracking-tight text-red-600">
              {enRupture}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-2xl bg-white p-5 shadow-sm">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-500">
            <Clock className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[11px] font-medium tracking-tight text-slate-500">
              Péremption proche
            </p>
            <p className="mt-0.5 text-xl font-semibold tracking-tight text-amber-600">
              {peremptionProche}
            </p>
          </div>
        </div>
      </div>

      {/* Recherche & Filtres */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un produit…"
            className="w-full rounded-xl border border-slate-200 bg-white/80 py-2.5 pl-9 pr-3 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
          />
        </div>
        <select
          value={filtre}
          onChange={(e) => setFiltre(e.target.value as Categorie | "")}
          className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm text-slate-700 outline-none transition-colors focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
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
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-[color:var(--ds-text)] sm:w-auto sm:ml-2"
          aria-label="Historique des mouvements de stock"
        >
          <Clock className="h-4 w-4" />
          Historique des mouvements
        </button>
      </div>

      {/* Tableau */}
      <div className="rounded-2xl bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Produit
                </th>
                <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Quantité
                </th>
                <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Statut
                </th>
                <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Péremption
                </th>
                <th className="px-5 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Options
                </th>
                <th className="px-5 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const pct =
                  p.quantiteMax > 0
                    ? Math.round((p.quantite / p.quantiteMax) * 100)
                    : 0;
                const statut = computeStatut(p);
                const isActionsOpen = openActionsId === p.id;

                return (
                  <tr
                    key={p.id}
                    className="border-b border-slate-50 last:border-0 transition-colors hover:bg-slate-50/60"
                  >
                    {/* Produit */}
                    <td className="px-5 py-4">
                      <p className="text-sm font-medium text-slate-800">
                        {p.nom}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {p.categorie}
                      </p>
                    </td>

                    {/* Quantité (jauge) */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full rounded-full transition-all ${progressBarClass(p)}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold tabular-nums text-slate-700">
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
                    <td className="px-5 py-4 text-sm text-slate-600">
                      {formatPeremptionForDisplay(p.peremption)}
                    </td>

                    {/* Actions */}
                    <td className="relative px-5 py-4 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          setOpenActionsId(isActionsOpen ? null : p.id)
                        }
                        className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                        aria-label={`Actions pour ${p.nom}`}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>

                      {isActionsOpen && (
                        <>
                          <div
                            className="fixed inset-0 z-40"
                            aria-hidden="true"
                            onClick={() => setOpenActionsId(null)}
                          />
                          <div className="absolute right-5 top-full z-50 mt-1 w-40 overflow-hidden rounded-2xl bg-white py-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
                            <button
                              type="button"
                              onClick={() => openEditModal(p)}
                              className="flex w-full items-center px-4 py-2 text-left text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                            >
                              Modifier
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                console.log("Suppression du produit", p.id);
                                setProduits((prev) =>
                                  prev.filter((x) => x.id !== p.id),
                                );
                                setOpenActionsId(null);
                              }}
                              className="flex w-full items-center px-4 py-2 text-left text-xs font-medium text-red-600 transition-colors hover:bg-red-50/60"
                            >
                              Supprimer
                            </button>
                          </div>
                        </>
                      )}
                    </td>

                    {/* Actions rapides (multidose + / -) */}
                    <td className="px-5 py-4 text-right">
                      <div className="inline-flex flex-wrap items-center justify-end gap-2">
                        {p.gestion === "multidose" ? (
                          <button
                            type="button"
                            onClick={() => {
                              handleOpenMultidoseUnit(p.id);
                              setOpenActionsId(null);
                            }}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-sky-50 text-sky-600 transition-colors hover:bg-sky-100"
                            title="Ouvrir une unité (Multidose)"
                            aria-label={`Ouvrir une unité — ${p.nom}`}
                          >
                            <PackageOpen className="h-4 w-4 shrink-0" aria-hidden />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingStock(p);
                            setStockActionType("remove");
                            setStockAdjustValue("1");
                            setStockReason("");
                            setOpenActionsId(null);
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
                            setOpenActionsId(null);
                          }}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-sky-50 text-sky-700 transition-colors hover:bg-sky-50/80"
                          aria-label={`Ajouter du stock : ${p.nom}`}
                        >
                          +
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-12 text-center text-sm text-slate-400"
                  >
                    Aucun produit trouvé.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold tracking-tight text-[color:var(--ds-text)]">
              {stockActionType === "add"
                ? "Ajouter du stock"
                : "Retirer du stock"}
            </h3>
            <p className="mt-1 text-sm text-slate-800">{editingStock.nom}</p>
            <p className="mt-1 text-xs text-slate-500">
              Stock actuel :{" "}
              <span className="font-semibold text-slate-700">
                {editingStockCurrentQty}
              </span>{" "}
              / {editingStock.quantiteMax}
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">
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
                    "mt-1.5 w-full rounded-2xl border bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20",
                    stockRemoveExceedsAvailable
                      ? "border-red-300"
                      : "border-slate-200",
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
                <label className="block text-sm font-medium text-slate-700">
                  Raison (optionnel)
                </label>
                <input
                  type="text"
                  value={stockReason}
                  onChange={(e) => setStockReason(e.target.value)}
                  placeholder="Ex: correction inventaire"
                  className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-200/60 px-1 pt-4">
              <button
                type="button"
                onClick={() => setEditingStock(null)}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-colors hover:bg-slate-50"
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
            className="w-full max-w-4xl rounded-3xl bg-white p-6 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold tracking-tight text-[color:var(--ds-text)]">
                  Registre des mouvements de stock
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Ajustements récents enregistrés localement sur cet appareil.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="rounded-2xl p-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5">
              {stockHistory.length === 0 ? (
                <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center text-sm text-slate-400">
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
                          <span className="absolute top-0 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full bg-white ring-4 ring-slate-100" />
                          {!isLast ? (
                            <span className="absolute top-3 left-1/2 h-full w-px -translate-x-1/2 bg-slate-100" />
                          ) : null}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="text-xs font-medium text-slate-500 tabular-nums">
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
                          <p className="mt-2 text-sm italic text-slate-500">
                            {h.reason ? h.reason : "—"}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-200/60 px-1 pt-4">
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-colors hover:bg-slate-50"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
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
          className="fixed bottom-6 right-6 z-[100] max-w-sm rounded-2xl border border-sky-100 bg-white px-4 py-3 text-sm font-medium text-sky-800 shadow-lg shadow-sky-100/50"
        >
          {stockToast}
        </div>
      ) : null}
    </div>
  );
}

