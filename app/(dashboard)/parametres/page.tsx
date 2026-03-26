"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  Building2,
  Calendar,
  Check,
  CreditCard,
  FileText,
  Image,
  Layers,
  Lock,
  Pencil,
  Plus,
  Stethoscope,
  Trash2,
  Upload,
  User,
  Users,
  X,
} from "lucide-react";
import {
  loadProtocols,
  saveProtocols,
  type ActProtocolMap,
  type ProtocolItem,
  INITIAL_STOCK_FALLBACK,
} from "@/utils/stockLogic";

// ─── Types ────────────────────────────────────────────────────────────────────

type OngletId =
  | "compte"
  | "cabinet"
  | "equipe"
  | "agenda"
  | "facturation"
  | "clinique";

/** Lignes stock mock (ids alignés sur `consumeStockForAct` / page Stocks). */
const STOCK_PRODUCT_OPTIONS = INITIAL_STOCK_FALLBACK.map((p) => ({
  id: p.id,
  label: p.nom,
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatQty(q: number) {
  return Number.isInteger(q) ? String(q) : q.toFixed(2).replace(/\.?0+$/, "");
}

const inputBase =
  "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20";

const cardBase =
  "rounded-2xl border border-slate-100 bg-white p-6 shadow-sm mb-6";

const protocolQtyInputClass =
  "w-14 rounded-xl border border-slate-200 bg-white px-2 py-2 text-center text-sm text-slate-800 outline-none [appearance:textfield] focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

// ─── Sous-composant : Onglet Protocoles (Clinique) ───────────────────────────

function ProtocolesTab() {
  const [protocoles, setProtocoles] = useState<ActProtocolMap>(() =>
    typeof window !== "undefined" ? loadProtocols() : {},
  );
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [storageReady, setStorageReady] = useState(false);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newProductId, setNewProductId] = useState(
    () => STOCK_PRODUCT_OPTIONS[0]?.id ?? "1",
  );
  const [newQty, setNewQty] = useState<number>(1);
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [editQty, setEditQty] = useState<number>(1);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const map = loadProtocols();
    setProtocoles(map);
    const keys = Object.keys(map).sort();
    setSelectedKey(keys[0] ?? null);
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (!storageReady || typeof window === "undefined") return;
    saveProtocols(protocoles);
  }, [protocoles, storageReady]);

  useEffect(() => {
    if (selectedKey != null && !(selectedKey in protocoles)) {
      const keys = Object.keys(protocoles).sort((a, b) =>
        a.localeCompare(b, "fr"),
      );
      setSelectedKey(keys[0] ?? null);
    }
  }, [protocoles, selectedKey]);

  const protocolKeysSorted = useMemo(
    () => Object.keys(protocoles).sort((a, b) => a.localeCompare(b, "fr")),
    [protocoles],
  );

  const selectedLines: ProtocolItem[] | null =
    selectedKey != null && selectedKey in protocoles
      ? protocoles[selectedKey] ?? []
      : null;

  function productLabel(productId: string): string {
    return (
      STOCK_PRODUCT_OPTIONS.find((o) => o.id === productId)?.label ?? productId
    );
  }

  function addProtocole() {
    const n = Object.keys(protocoles).length + 1;
    const key = `Nouveau protocole ${n}`;
    setProtocoles((prev) => ({ ...prev, [key]: [] }));
    setSelectedKey(key);
  }

  function deleteSelectedProtocol() {
    if (!selectedKey) return;
    setEditingItemIndex(null);
    setProtocoles((prev) => {
      const next = { ...prev };
      delete next[selectedKey];
      return next;
    });
  }

  function removeConsommableLine(index: number) {
    if (!selectedKey) return;
    setEditingItemIndex((prev) => {
      if (prev === null) return null;
      if (prev === index) return null;
      if (prev > index) return prev - 1;
      return prev;
    });
    setProtocoles((prev) => ({
      ...prev,
      [selectedKey]: (prev[selectedKey] ?? []).filter((_, i) => i !== index),
    }));
  }

  function addConsommable() {
    if (!selectedKey) return;
    const newItem: ProtocolItem = {
      productId: newProductId,
      quantity: newQty,
    };
    setProtocoles((prev) => ({
      ...prev,
      [selectedKey]: [...(prev[selectedKey] ?? []), newItem],
    }));
    setNewQty(1);
    setShowAddForm(false);
  }

  function commitEditQty() {
    if (!selectedKey || editingItemIndex === null) return;
    const q = Math.max(1, Math.round(editQty));
    setProtocoles((prev) => {
      const lines = [...(prev[selectedKey] ?? [])];
      const item = lines[editingItemIndex];
      if (!item) return prev;
      lines[editingItemIndex] = { ...item, quantity: q };
      return { ...prev, [selectedKey]: lines };
    });
    setEditingItemIndex(null);
  }

  function cancelEditQty() {
    setEditingItemIndex(null);
  }

  return (
    <div className="flex min-h-[540px] overflow-hidden rounded-3xl border border-slate-100 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
      <aside className="flex w-64 shrink-0 flex-col bg-slate-50">
        <div className="border-b border-slate-200/60 px-4 py-4">
          <button
            type="button"
            onClick={addProtocole}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[color:var(--ds-primary)] py-2.5 text-xs font-medium text-white shadow-sm transition-colors hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Nouveau Protocole
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto p-3">
          {protocolKeysSorted.map((key) => {
            const lines = protocoles[key] ?? [];
            return (
            <button
              key={key}
              type="button"
              onClick={() => {
                setSelectedKey(key);
                setShowAddForm(false);
                setEditingItemIndex(null);
              }}
              className={[
                "w-full rounded-xl px-3 py-3 text-left text-sm font-medium transition-colors",
                selectedKey === key
                  ? "bg-white text-[color:var(--ds-primary)] shadow-sm"
                  : "text-slate-600 hover:bg-white/70 hover:text-slate-800",
              ].join(" ")}
            >
              {key}
              <span className="mt-0.5 block text-[11px] font-normal text-slate-400">
                {lines.length} consommable
                {lines.length !== 1 ? "s" : ""}
              </span>
            </button>
            );
          })}
        </nav>
      </aside>

      <main className="flex flex-1 flex-col bg-white">
        {selectedKey != null && selectedLines ? (
          <>
            <div className="border-b border-slate-100 px-6 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold tracking-tight text-[color:var(--ds-text)]">
                    {selectedKey}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={deleteSelectedProtocol}
                  className="shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
                  aria-label="Supprimer le protocole"
                  title="Supprimer le protocole"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Consommables utilisés par acte (id produit stock)
              </p>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="space-y-2">
                {selectedLines.length === 0 && (
                  <p className="text-sm text-slate-400">
                    Aucun consommable. Ajoutez-en un ci-dessous.
                  </p>
                )}
                {selectedLines.map((c, idx) => (
                  <div
                    key={`${c.productId}-${idx}`}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3"
                  >
                    {editingItemIndex === idx ? (
                      <>
                        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
                          <span className="text-sm font-medium text-slate-800">
                            {productLabel(c.productId)}
                          </span>
                          <span className="text-[11px] text-slate-400 tabular-nums">
                            ({c.productId})
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                setEditQty((q) =>
                                  Math.max(1, Math.round(q) - 1),
                                )
                              }
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100"
                            >
                              −
                            </button>
                            <input
                              type="number"
                              min={1}
                              step={1}
                              value={editQty}
                              onChange={(e) => {
                                const v = parseInt(e.target.value, 10);
                                setEditQty(
                                  Number.isFinite(v) && v >= 1 ? v : 1,
                                );
                              }}
                              className={protocolQtyInputClass}
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setEditQty((q) => Math.round(q) + 1)
                              }
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100"
                            >
                              +
                            </button>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={commitEditQty}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-emerald-600 transition-colors hover:bg-emerald-50"
                            aria-label="Valider la quantité"
                            title="Valider"
                          >
                            <Check className="h-4 w-4" strokeWidth={2.5} />
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditQty}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-red-500"
                            aria-label="Annuler"
                            title="Annuler"
                          >
                            <X className="h-4 w-4" strokeWidth={2.5} />
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[color:var(--ds-primary-soft)] text-xs font-semibold text-[color:var(--ds-primary)]">
                            {formatQty(c.quantity)}x
                          </span>
                          <span className="text-sm font-medium text-slate-800">
                            {productLabel(c.productId)}
                          </span>
                          <span className="text-[11px] text-slate-400 tabular-nums">
                            ({c.productId})
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingItemIndex(idx);
                              setEditQty(
                                Math.max(1, Math.round(c.quantity)) || 1,
                              );
                            }}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-[color:var(--ds-primary)]"
                            aria-label={`Modifier la quantité — ${productLabel(c.productId)}`}
                            title="Modifier"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeConsommableLine(idx)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
                            aria-label={`Retirer ${productLabel(c.productId)}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>

              {showAddForm ? (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Ajouter un consommable
                  </p>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-slate-700">
                        Produit
                      </label>
                      <select
                        value={newProductId}
                        onChange={(e) => setNewProductId(e.target.value)}
                        className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                      >
                        {STOCK_PRODUCT_OPTIONS.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="w-32">
                      <label className="block text-xs font-medium text-slate-700">
                        Quantité
                      </label>
                      <div className="mt-1.5 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            setNewQty((q) => Math.max(1, Math.round(q) - 1))
                          }
                          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={newQty}
                          onChange={(e) => {
                            const v = parseInt(e.target.value, 10);
                            setNewQty(Number.isFinite(v) && v >= 1 ? v : 1);
                          }}
                          className={protocolQtyInputClass}
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setNewQty((q) => Math.round(q) + 1)
                          }
                          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={addConsommable}
                      className="rounded-xl bg-[color:var(--ds-primary)] px-4 py-2 text-xs font-medium text-white shadow-sm transition-colors hover:opacity-90"
                    >
                      Valider
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddForm(false);
                        setEditingItemIndex(null);
                      }}
                      className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(true);
                    setEditingItemIndex(null);
                  }}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 py-3 text-sm font-medium text-slate-500 transition-colors hover:border-[color:var(--ds-primary)]/50 hover:text-[color:var(--ds-primary)]"
                >
                  <Plus className="h-4 w-4" />
                  Ajouter un consommable
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-slate-400">
              Sélectionnez un protocole à gauche.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Sous-composant : Onglet Équipe (CONSERVÉ INTÉGRALEMENT) ─────────────────

function EquipeTab() {
  type MemberRole = "Admin" | "Assistante" | "Praticien";
  type MemberStatus = "Actif" | "En attente";
  type Member = {
    id: number;
    name: string;
    email: string;
    role: MemberRole;
    status: MemberStatus;
    isAdmin: boolean;
  };

  const initialMembers: Member[] = [
    {
      id: 1,
      name: "Dr. Assil Messaoudi",
      email: "assil@cabinet.com",
      role: "Admin",
      status: "Actif",
      isAdmin: true,
    },
    {
      id: 2,
      name: "Mme Sarah",
      email: "sarah@cabinet.com",
      role: "Assistante",
      status: "Actif",
      isAdmin: false,
    },
  ];

  const [teamMembers, setTeamMembers] = useState<Member[]>(initialMembers);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [deletingMember, setDeletingMember] = useState<Member | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState<MemberRole>("Assistante");

  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<MemberRole>("Assistante");

  const ROLE_CARDS: Array<{
    id: MemberRole;
    title: string;
    subtitle: string;
  }> = [
    {
      id: "Admin",
      title: "Administrateur",
      subtitle:
        "Accès total (Tableau de bord, Finances, Paramètres, Patients)",
    },
    {
      id: "Assistante",
      title: "Assistante",
      subtitle:
        "Opérationnel (Agenda, Salle d\u2019attente, Labo, Stock). Pas d\u2019accès aux statistiques financières.",
    },
    {
      id: "Praticien",
      title: "Remplaçant / Collaborateur",
      subtitle:
        "Accès uniquement à l\u2019agenda et aux dossiers médicaux des patients.",
    },
  ];

  function openInvite() {
    setNewMemberName("");
    setNewMemberEmail("");
    setNewMemberRole("Assistante");
    setIsInviteModalOpen(true);
  }

  function handleInvite() {
    const trimmedName = newMemberName.trim();
    const trimmedEmail = newMemberEmail.trim();
    if (!trimmedName || !trimmedEmail) return;

    const nextId =
      teamMembers.length > 0
        ? Math.max(...teamMembers.map((member) => member.id)) + 1
        : 1;

    const newMember: Member = {
      id: nextId,
      name: trimmedName,
      email: trimmedEmail,
      role: newMemberRole,
      status: "En attente",
      isAdmin: false,
    };

    setTeamMembers((prev) => [...prev, newMember]);
    setIsInviteModalOpen(false);
    setNewMemberName("");
    setNewMemberEmail("");
    setNewMemberRole("Assistante");
  }

  function roleBadgeClass(role: MemberRole) {
    if (role === "Admin") return "bg-blue-50 text-blue-700";
    if (role === "Assistante") return "bg-emerald-50 text-emerald-700";
    return "bg-violet-50 text-violet-700";
  }

  return (
    <div className="rounded-3xl bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">
            Gestion de l&apos;équipe et des accès
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Gérez qui peut voir et modifier les informations de votre cabinet.
          </p>
        </div>

        <button
          type="button"
          onClick={openInvite}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[color:var(--ds-primary)] px-4 py-2.5 text-xs font-medium text-white shadow-sm transition-colors hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          + Inviter un membre
        </button>
      </div>

      <div className="mt-6 overflow-visible rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="hidden border-b border-slate-100 bg-slate-50/60 px-6 py-4 sm:grid sm:grid-cols-[2fr_2fr_1fr_1.5fr] sm:items-center sm:gap-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            NOM
          </p>
          <p className="text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            EMAIL
          </p>
          <p className="text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            RÔLE
          </p>
          <p className="text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            ACTIONS
          </p>
        </div>

        <div>
          {teamMembers.map((m, idx) => (
            <div
              key={m.id}
              className={[
                "grid grid-cols-1 gap-3 px-6 py-4 sm:grid-cols-[2fr_2fr_1fr_1.5fr] sm:items-center sm:gap-4",
                idx !== teamMembers.length - 1 ? "border-b border-slate-100" : "",
              ].join(" ")}
            >
              <div>
                <p
                  className={[
                    "text-sm font-semibold text-slate-800",
                    m.status === "En attente" ? "opacity-70" : "",
                  ].join(" ")}
                >
                  {m.name}
                </p>
              </div>

              <div className="text-center">
                <p
                  className={[
                    "text-sm text-slate-600",
                    m.status === "En attente" ? "opacity-70" : "",
                  ].join(" ")}
                >
                  {m.email}
                </p>
              </div>

              <div className="text-center">
                <span
                  className={[
                    "inline-flex items-center rounded-lg px-3 py-1 text-[11px] font-semibold",
                    roleBadgeClass(m.role),
                  ].join(" ")}
                >
                  {m.role}
                </span>
                <div className="mt-1 flex items-center justify-center gap-2">
                  {m.status === "Actif" ? (
                    <span
                      className="inline-flex h-2 w-2 rounded-full bg-emerald-400"
                      aria-label="Membre actif"
                      title="Actif"
                    />
                  ) : (
                    <span className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-600">
                      ⏳ En attente
                    </span>
                  )}
                </div>
              </div>

              <div className="relative sm:text-right">
                {m.isAdmin ? (
                  <span className="inline-flex h-8 items-center text-xs text-slate-400">
                    —
                  </span>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setOpenMenuId((prev) => (prev === m.id ? null : m.id))
                      }
                      className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white/80 text-slate-500 transition-colors hover:bg-slate-50 hover:text-[color:var(--ds-primary)]"
                      aria-label={`Gérer ${m.name}`}
                      title="Gérer / Supprimer"
                    >
                      <span aria-hidden className="text-lg leading-none">
                        ...
                      </span>
                    </button>

                    {openMenuId === m.id && (
                      <>
                        <div
                          className="fixed inset-0 z-40"
                          aria-hidden="true"
                          onClick={() => setOpenMenuId(null)}
                        />
                        <div className="absolute right-0 top-full z-[100] mt-2 min-w-[200px] rounded-xl border border-slate-100 bg-white shadow-xl">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingMember(m);
                              setEditName(m.name);
                              setEditEmail(m.email);
                              setEditRole(m.role);
                              setOpenMenuId(null);
                            }}
                            className="w-full px-4 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50"
                          >
                            Modifier le membre
                          </button>
                          <div className="border-t border-slate-100" />
                          <button
                            type="button"
                            onClick={() => {
                              setDeletingMember(m);
                              setOpenMenuId(null);
                            }}
                            className="w-full px-4 py-2 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                          >
                            Supprimer le membre
                          </button>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {editingMember && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Modifier le membre"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setEditingMember(null);
          }}
        >
          <div
            className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold tracking-tight text-[color:var(--ds-text)]">
              Modifier le membre
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Mettez à jour les informations et le niveau d&apos;accès.
            </p>

            <form
              className="mt-5 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                setTeamMembers((prev) =>
                  prev.map((member) =>
                    member.id === editingMember.id
                      ? {
                          ...member,
                          name: editName.trim() || member.name,
                          email: editEmail.trim() || member.email,
                          role: editRole,
                        }
                      : member,
                  ),
                );
                setEditingMember(null);
              }}
            >
              <div>
                <label className="block text-sm font-medium text-slate-700">Nom</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Email</label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Rôle</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as MemberRole)}
                  className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                >
                  <option value="Admin">Admin</option>
                  <option value="Assistante">Assistante</option>
                  <option value="Praticien">Praticien</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-slate-200/60 px-1 pt-4">
                <button
                  type="button"
                  onClick={() => setEditingMember(null)}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-colors hover:bg-slate-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="rounded-2xl bg-[color:var(--ds-primary)] px-4 py-2.5 text-sm font-medium text-white shadow-[0_8px_30px_rgba(0,0,0,0.08)] transition-colors hover:opacity-90"
                >
                  Enregistrer les modifications
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deletingMember && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Confirmer la suppression"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDeletingMember(null);
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold tracking-tight text-[color:var(--ds-text)]">
              Confirmer la suppression
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Voulez-vous vraiment supprimer le membre {deletingMember.name} ?
            </p>

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-200/60 px-1 pt-4">
              <button
                type="button"
                onClick={() => setDeletingMember(null)}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-colors hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => {
                  setTeamMembers((prev) =>
                    prev.filter((member) => member.id !== deletingMember.id),
                  );
                  setDeletingMember(null);
                }}
                className="rounded-2xl bg-red-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-red-700"
              >
                Supprimer le membre
              </button>
            </div>
          </div>
        </div>
      )}

      {isInviteModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Inviter un membre"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setIsInviteModalOpen(false);
          }}
        >
          <div
            className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold tracking-tight text-[color:var(--ds-text)]">
                  Inviter un membre
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  Choisissez un rôle et envoyez l&apos;invitation.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsInviteModalOpen(false)}
                className="rounded-2xl p-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
                aria-label="Fermer"
              >
                <span aria-hidden className="text-lg leading-none">
                  ×
                </span>
              </button>
            </div>

            <form
              className="mt-5 space-y-5"
              onSubmit={(e) => {
                e.preventDefault();
                handleInvite();
              }}
            >
              <div>
                <label htmlFor="inviteName" className="block text-sm font-medium text-slate-700">
                  Nom complet du collaborateur
                </label>
                <input
                  id="inviteName"
                  type="text"
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  placeholder="Ex: Dr. Maxime"
                  className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                  required
                />
              </div>
              <div>
                <label htmlFor="inviteEmail" className="block text-sm font-medium text-slate-700">
                  Adresse Email du collaborateur
                </label>
                <input
                  id="inviteEmail"
                  type="email"
                  value={newMemberEmail}
                  onChange={(e) => setNewMemberEmail(e.target.value)}
                  placeholder="ex: collaborateur@cabinet.com"
                  className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                  required
                />
              </div>

              <div>
                <p className="text-sm font-medium text-slate-700">Sélection du Rôle</p>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                  {ROLE_CARDS.map((r) => {
                    const active = newMemberRole === r.id;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setNewMemberRole(r.id)}
                        className={[
                          "rounded-2xl border p-4 text-left transition-all cursor-pointer",
                          "hover:border-slate-300",
                          active
                            ? "border-[color:var(--ds-primary)] bg-[color:var(--ds-primary)]/5"
                            : "border-slate-200 bg-white",
                        ].join(" ")}
                        aria-pressed={active}
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className={[
                              "mt-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                              active
                                ? "border-[color:var(--ds-primary)] bg-[color:var(--ds-primary)]"
                                : "border-slate-300 bg-white",
                            ].join(" ")}
                            aria-hidden
                          >
                            {active ? (
                              <span className="h-1.5 w-1.5 rounded-full bg-white" />
                            ) : null}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-800">{r.title}</p>
                            <p className="mt-1 text-xs font-normal text-slate-500">{r.subtitle}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-slate-200/60 px-1 pt-4">
                <button
                  type="button"
                  onClick={() => setIsInviteModalOpen(false)}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-colors hover:bg-slate-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="rounded-2xl bg-[color:var(--ds-primary)] px-4 py-2.5 text-sm font-medium text-white shadow-[0_8px_30px_rgba(0,0,0,0.08)] transition-colors hover:opacity-90"
                >
                  Envoyer l&apos;invitation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Toggle Helper ────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={[
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors",
        checked ? "bg-[color:var(--ds-primary)]" : "bg-slate-200",
      ].join(" ")}
    >
      <span
        className={[
          "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-6" : "translate-x-1",
        ].join(" ")}
      />
    </button>
  );
}

// ─── Onglets config ───────────────────────────────────────────────────────────

const ONGLETS: { id: OngletId; label: string; icon: typeof User }[] = [
  { id: "compte", label: "Mon Compte", icon: User },
  { id: "cabinet", label: "Le Cabinet", icon: Building2 },
  { id: "equipe", label: "Équipe & Accès", icon: Users },
  { id: "agenda", label: "Agenda & Rappels", icon: Calendar },
  { id: "facturation", label: "Facturation", icon: CreditCard },
  { id: "clinique", label: "Protocoles", icon: Stethoscope },
];

// ─── Page principale Paramètres ───────────────────────────────────────────────

export default function ParametresPage() {
  const [onglet, setOnglet] = useState<OngletId>("compte");

  const [twoFA, setTwoFA] = useState(false);
  const [smsRappel, setSmsRappel] = useState(true);
  const [emailConfirm, setEmailConfirm] = useState(true);

  const [whatsappOn, setWhatsappOn] = useState(false);
  const [viberOn, setViberOn] = useState(false);
  const [telegramOn, setTelegramOn] = useState(false);
  const [smsStdOn, setSmsStdOn] = useState(true);

  const logoRef = useRef<HTMLInputElement | null>(null);
  const [logoName, setLogoName] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[color:var(--ds-text)]">
          Paramètres
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Configuration du cabinet, de l&apos;équipe et des préférences
        </p>
      </div>

      {/* Onglets */}
      <div className="flex items-center gap-1 overflow-x-auto rounded-2xl border border-slate-200/60 bg-white p-1 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
        {ONGLETS.map((o) => {
          const Icon = o.icon;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => setOnglet(o.id)}
              className={[
                "inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all",
                onglet === o.id
                  ? "bg-[color:var(--ds-primary)] text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-700",
              ].join(" ")}
            >
              <Icon className="h-4 w-4" />
              {o.label}
            </button>
          );
        })}
      </div>

      {/* ────── MON COMPTE ────── */}
      {onglet === "compte" && (
        <div className="space-y-6">
          {/* Profil */}
          <div className={cardBase}>
            <h2 className="text-lg font-semibold text-slate-800">Profil</h2>
            <p className="mt-1 text-sm text-slate-500">
              Informations personnelles de votre compte praticien.
            </p>
            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700">Nom complet</label>
                <input type="text" defaultValue="Dr. Assil Messaoudi" className={inputBase} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Email de connexion</label>
                <input type="email" defaultValue="assil@cabinet.com" className={inputBase} />
              </div>
            </div>
          </div>

          {/* Sécurité */}
          <div className={cardBase}>
            <h2 className="text-lg font-semibold text-slate-800">Sécurité</h2>
            <p className="mt-1 text-sm text-slate-500">
              Protégez l&apos;accès à votre compte.
            </p>
            <div className="mt-6 space-y-5">
              <div>
                <button
                  type="button"
                  className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  <Lock className="mr-2 inline-block h-4 w-4" />
                  Changer le mot de passe
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-700">
                    Authentification à double facteur (2FA)
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Ajoutez une couche de sécurité supplémentaire.
                  </p>
                </div>
                <Toggle checked={twoFA} onChange={setTwoFA} />
              </div>
            </div>
          </div>

          {/* Préférences */}
          <div className={cardBase}>
            <h2 className="text-lg font-semibold text-slate-800">Préférences</h2>
            <p className="mt-1 text-sm text-slate-500">
              Personnalisez l&apos;interface à votre goût.
            </p>
            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700">Langue</label>
                <select defaultValue="fr" className={inputBase}>
                  <option value="fr">Français</option>
                  <option value="en">English</option>
                  <option value="ar">العربية</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Thème</label>
                <select defaultValue="light" className={inputBase}>
                  <option value="light">Clair</option>
                  <option value="dark">Sombre</option>
                </select>
              </div>
            </div>
          </div>

          {/* Intégrations & Messagerie */}
          <div className={cardBase}>
            <h2 className="text-lg font-semibold text-slate-800">
              Intégrations &amp; Messagerie
            </h2>
            <p className="mb-4 mt-1 text-sm text-slate-500">
              Connectez vos comptes pour l&apos;envoi des rappels aux patients.
            </p>

            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50/50 px-5 py-4">
                <p className="shrink-0 text-sm font-semibold text-slate-800">
                  WhatsApp Business
                </p>
                <input
                  type="text"
                  placeholder="+213 ..."
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                />
                <Toggle checked={whatsappOn} onChange={setWhatsappOn} />
              </div>

              <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50/50 px-5 py-4">
                <p className="shrink-0 text-sm font-semibold text-slate-800">
                  Viber
                </p>
                <input
                  type="text"
                  placeholder="+213 ..."
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                />
                <Toggle checked={viberOn} onChange={setViberOn} />
              </div>

              <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50/50 px-5 py-4">
                <p className="shrink-0 text-sm font-semibold text-slate-800">
                  Telegram
                </p>
                <input
                  type="text"
                  placeholder="@nom_du_bot"
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-[color:var(--ds-primary)] focus:ring-2 focus:ring-[color:var(--ds-primary)]/20"
                />
                <Toggle checked={telegramOn} onChange={setTelegramOn} />
              </div>

              <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50/50 px-5 py-4">
                <p className="shrink-0 text-sm font-semibold text-slate-800">
                  SMS Standard (Réseau)
                </p>
                <Toggle checked={smsStdOn} onChange={setSmsStdOn} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ────── LE CABINET ────── */}
      {onglet === "cabinet" && (
        <div className="space-y-6">
          {/* Identité */}
          <div className={cardBase}>
            <h2 className="text-lg font-semibold text-slate-800">Identité du cabinet</h2>
            <p className="mt-1 text-sm text-slate-500">
              Ces informations apparaissent sur vos documents officiels.
            </p>
            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700">Nom du cabinet</label>
                <input type="text" defaultValue="Cabinet Dr. Assil" className={inputBase} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Spécialité</label>
                <input type="text" defaultValue="Dentisterie générale" className={inputBase} />
              </div>
            </div>
            <div className="mt-5">
              <p className="text-sm font-medium text-slate-700">Logo du cabinet</p>
              <div
                className="mt-2 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/70 p-8 text-center transition-colors hover:border-[color:var(--ds-primary)]/40"
                onClick={() => logoRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) setLogoName(f.name);
                }}
                role="button"
                tabIndex={0}
                aria-label="Uploader le logo"
              >
                <Upload className="h-5 w-5 text-slate-400" />
                <p className="text-xs font-medium text-slate-600">Glisser-déposer ou cliquer</p>
                <p className="text-[11px] text-slate-500">(PNG/JPG)</p>
                {logoName && (
                  <p className="mt-1 text-[11px] font-medium text-[color:var(--ds-primary)]">
                    {logoName}
                  </p>
                )}
              </div>
              <input
                ref={logoRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setLogoName(f.name);
                }}
              />
            </div>
          </div>

          {/* Coordonnées */}
          <div className={cardBase}>
            <h2 className="text-lg font-semibold text-slate-800">Coordonnées</h2>
            <p className="mt-1 text-sm text-slate-500">
              Adresse et moyens de contact du cabinet.
            </p>
            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700">Adresse</label>
                <input type="text" defaultValue="12 rue des Lilas, 75001 Paris" className={inputBase} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Téléphone</label>
                <input type="tel" defaultValue="01 23 45 67 89" className={inputBase} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Email de contact</label>
                <input type="email" defaultValue="contact@cabinet-assil.com" className={inputBase} />
              </div>
            </div>
          </div>

          {/* Légale */}
          <div className={cardBase}>
            <h2 className="text-lg font-semibold text-slate-800">Informations légales</h2>
            <p className="mt-1 text-sm text-slate-500">
              Numéros d&apos;identification officiels de votre cabinet.
            </p>
            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  N° d&apos;Identification Fiscale (NIF)
                </label>
                <input type="text" defaultValue="" placeholder="Ex: 000216001234567" className={inputBase} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Registre de Commerce (RC)
                </label>
                <input type="text" defaultValue="" placeholder="Ex: 16/00-0123456B00" className={inputBase} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  N° au Conseil de l&apos;Ordre
                </label>
                <input type="text" defaultValue="" placeholder="Ex: 12345" className={inputBase} />
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                className="rounded-2xl bg-[color:var(--ds-primary)] px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:opacity-90"
              >
                Sauvegarder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ────── ÉQUIPE (CONSERVÉ) ────── */}
      {onglet === "equipe" && <EquipeTab />}

      {/* ────── AGENDA & RAPPELS ────── */}
      {onglet === "agenda" && (
        <div className="space-y-6">
          {/* Configuration */}
          <div className={cardBase}>
            <h2 className="text-lg font-semibold text-slate-800">Configuration de l&apos;agenda</h2>
            <p className="mt-1 text-sm text-slate-500">
              Paramètres par défaut pour la prise de rendez-vous.
            </p>
            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Durée standard d&apos;un RDV
                </label>
                <select defaultValue="30" className={inputBase}>
                  <option value="15">15 minutes</option>
                  <option value="30">30 minutes</option>
                  <option value="45">45 minutes</option>
                  <option value="60">60 minutes</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Horaires d&apos;ouverture
                </label>
                <div className="mt-1.5 flex items-center gap-2">
                  <input type="time" defaultValue="09:00" className={inputBase + " !w-auto"} />
                  <span className="text-sm text-slate-500">à</span>
                  <input type="time" defaultValue="18:00" className={inputBase + " !w-auto"} />
                </div>
              </div>
            </div>
          </div>

          {/* Notifications */}
          <div className={cardBase}>
            <h2 className="text-lg font-semibold text-slate-800">Notifications & Rappels</h2>
            <p className="mt-1 text-sm text-slate-500">
              Configurez les rappels automatiques envoyés à vos patients.
            </p>
            <div className="mt-6 space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                    <Bell className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-slate-700">SMS de rappel 24h avant</p>
                    <p className="text-xs text-slate-500">
                      Un SMS automatique est envoyé la veille du rendez-vous.
                    </p>
                  </div>
                </div>
                <Toggle checked={smsRappel} onChange={setSmsRappel} />
              </div>
              <div className="border-t border-slate-100" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                    <Bell className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-slate-700">Email de confirmation immédiat</p>
                    <p className="text-xs text-slate-500">
                      Un email est envoyé dès la confirmation du rendez-vous.
                    </p>
                  </div>
                </div>
                <Toggle checked={emailConfirm} onChange={setEmailConfirm} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ────── FACTURATION ────── */}
      {onglet === "facturation" && (
        <div className="space-y-6">
          {/* Configuration */}
          <div className={cardBase}>
            <h2 className="text-lg font-semibold text-slate-800">Configuration de la facturation</h2>
            <p className="mt-1 text-sm text-slate-500">
              Paramètres financiers par défaut appliqués à vos devis et factures.
            </p>
            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700">Devise par défaut</label>
                <select defaultValue="DA" className={inputBase}>
                  <option value="DA">Dinar Algérien (DA)</option>
                  <option value="EUR">Euro (EUR)</option>
                  <option value="USD">Dollar US ($)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">TVA par défaut (%)</label>
                <input type="number" defaultValue="19" min={0} max={100} className={inputBase} />
              </div>
            </div>
          </div>

          {/* Coordonnées bancaires */}
          <div className={cardBase}>
            <h2 className="text-lg font-semibold text-slate-800">Coordonnées bancaires</h2>
            <p className="mt-1 text-sm text-slate-500">
              Informations bancaires affichées sur vos factures.
            </p>
            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700">RIB / IBAN</label>
                <input type="text" defaultValue="" placeholder="Ex: DZ12 0001 0000 1234 5678 9012 34" className={inputBase} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Banque</label>
                <input type="text" defaultValue="" placeholder="Ex: Banque Nationale d'Algérie" className={inputBase} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Titulaire du compte</label>
                <input type="text" defaultValue="" placeholder="Dr. Assil Messaoudi" className={inputBase} />
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                className="rounded-2xl bg-[color:var(--ds-primary)] px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:opacity-90"
              >
                Sauvegarder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ────── PROTOCOLES (CLINIQUE) ────── */}
      {onglet === "clinique" && (
        <div className="space-y-6">
          {/* Protocoles de soins */}
          <div className={cardBase}>
            <h2 className="text-lg font-semibold text-slate-800">Protocoles de soins</h2>
            <p className="mt-1 text-sm text-slate-500">
              Définissez les consommables utilisés pour chaque type d&apos;acte.
            </p>
            <div className="mt-6">
              <ProtocolesTab />
            </div>
          </div>

          {/* Modèles de documents */}
          <div className={cardBase}>
            <h2 className="text-lg font-semibold text-slate-800">Modèles de documents</h2>
            <p className="mt-1 text-sm text-slate-500">
              Personnalisez vos documents cliniques.
            </p>
            <div className="mt-6 space-y-3">
              {[
                { label: "Modèle d'Ordonnance standard", icon: FileText },
                { label: "Modèle de Certificat Médical", icon: FileText },
                { label: "Consentement éclairé", icon: FileText },
              ].map((doc) => (
                <div
                  key={doc.label}
                  className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/50 px-5 py-4 transition-colors hover:bg-slate-50"
                >
                  <div className="flex items-center gap-3">
                    <doc.icon className="h-4 w-4 text-slate-500" />
                    <span className="text-sm font-medium text-slate-700">{doc.label}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => alert(`Édition de : ${doc.label}`)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-[color:var(--ds-primary)]"
                  >
                    Éditer
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
