"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Pencil, Trash2, UserPlus, X } from "lucide-react";
import {
  createTeamMemberAction,
  deleteTeamMemberAction,
  getTeamMembersAction,
  updateTeamMemberAction,
} from "@/app/actions/team";
import { useRole } from "@/hooks/useRole";
import type { TeamMemberRow, TeamMemberRole } from "@/lib/types/team-db";
import { getInitials, ROLE_LABEL } from "@/utils/roles";
import { showAppToast } from "@/utils/appToast";
import { PrimaryButton } from "@/components/ui/PrimaryButton";

const inputCls =
  "w-full min-w-0 rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-2.5 text-sm text-[var(--ds-text)] outline-none transition-colors focus:border-[color:var(--ds-primary)] focus-visible:ring-2 focus-visible:ring-[color:var(--ds-primary)]/20";

const ROLE_UI: Record<
  TeamMemberRole,
  { label: string; bg: string; color: string }
> = {
  admin: {
    label: ROLE_LABEL.admin,
    bg: "color-mix(in srgb, var(--ds-primary) 18%, transparent)",
    color: "var(--ds-primary)",
  },
  praticien: {
    label: ROLE_LABEL.praticien,
    bg: "color-mix(in srgb, #06b6d4 18%, transparent)",
    color: "#06b6d4",
  },
  assistant: {
    label: ROLE_LABEL.assistant,
    bg: "color-mix(in srgb, #10b981 18%, transparent)",
    color: "#10b981",
  },
  remplacant: {
    label: ROLE_LABEL.remplacant,
    bg: "color-mix(in srgb, #f59e0b 18%, transparent)",
    color: "#f59e0b",
  },
};

const ROLE_OPTIONS: { value: TeamMemberRole; label: string }[] = [
  { value: "admin", label: ROLE_LABEL.admin },
  { value: "praticien", label: ROLE_LABEL.praticien },
  { value: "assistant", label: ROLE_LABEL.assistant },
  { value: "remplacant", label: ROLE_LABEL.remplacant },
];

function roleBadge(role: TeamMemberRole) {
  const u = ROLE_UI[role];
  return (
    <span
      className="inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: u.bg, color: u.color }}
    >
      {u.label}
    </span>
  );
}

type CreatedAccountPayload = {
  prenom: string;
  nom: string;
  email: string;
  tempPassword: string;
};

export function TeamSection() {
  const { role: appRole, ready } = useRole();
  const [members, setMembers] = useState<TeamMemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState<TeamMemberRow | null>(null);
  const [createdAccount, setCreatedAccount] = useState<CreatedAccountPayload | null>(
    null,
  );
  const [credPopoverId, setCredPopoverId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await getTeamMembersAction();
    setLoading(false);
    if (res.ok) {
      setMembers(res.data);
    } else {
      showAppToast(res.error);
      setMembers([]);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (appRole === "admin") void refresh();
  }, [ready, appRole, refresh]);

  useEffect(() => {
    if (!credPopoverId) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      const el = document.getElementById(`cred-pop-${credPopoverId}`);
      if (el && !el.contains(t)) setCredPopoverId(null);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [credPopoverId]);

  if (!ready) {
    return (
      <p className="text-sm text-[var(--ds-text-muted)]">Chargement…</p>
    );
  }

  if (appRole !== "admin") {
    return (
      <p className="rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-primary-soft)]/40 px-4 py-3 text-sm text-[var(--ds-text-muted)]">
        La gestion de l&apos;équipe est réservée aux administrateurs.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-[var(--ds-text)]">
            Équipe
          </h2>
          <p className="mt-1 text-sm text-[var(--ds-text-muted)]">
            Membres du cabinet, rôles et comptes de connexion (Better Auth).
          </p>
        </div>
        <PrimaryButton
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
        >
          <UserPlus className="h-4 w-4" strokeWidth={2} />
          Ajouter un membre
        </PrimaryButton>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--ds-primary-border)]">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--ds-primary-border)] bg-[var(--ds-bg)]/60">
              <th className="px-3 py-2.5 font-semibold text-[var(--ds-text)]">
                Membre
              </th>
              <th className="px-3 py-2.5 font-semibold text-[var(--ds-text)]">
                Rôle
              </th>
              <th className="px-3 py-2.5 font-semibold text-[var(--ds-text)]">
                Email
              </th>
              <th className="px-3 py-2.5 font-semibold text-[var(--ds-text)]">
                Téléphone
              </th>
              <th className="px-3 py-2.5 font-semibold text-[var(--ds-text)]">
                Statut
              </th>
              <th className="px-3 py-2.5 text-right font-semibold text-[var(--ds-text)]">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-8 text-center text-[var(--ds-text-muted)]"
                >
                  Chargement…
                </td>
              </tr>
            ) : members.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-8 text-center text-[var(--ds-text-muted)]"
                >
                  Aucun membre. Ajoutez un collaborateur pour créer son compte.
                </td>
              </tr>
            ) : (
              members.map((m) => (
                <tr
                  key={m.id}
                  className="border-b border-[var(--ds-primary-border)]/80 last:border-0"
                >
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                        style={{ backgroundColor: "var(--ds-primary)" }}
                      >
                        {getInitials(`${m.prenom} ${m.nom}`)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-[var(--ds-text)]">
                          {m.prenom} {m.nom}
                        </p>
                        {m.specialite ? (
                          <p className="truncate text-[11px] text-[var(--ds-text-muted)]">
                            {m.specialite}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">{roleBadge(m.role)}</td>
                  <td className="px-3 py-3 text-[var(--ds-text-muted)]">
                    {m.email}
                  </td>
                  <td className="px-3 py-3 text-[var(--ds-text-muted)]">
                    {m.telephone ?? "—"}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-col gap-1.5">
                      {m.actif ? (
                        <span className="inline-flex w-fit items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                          Actif
                        </span>
                      ) : (
                        <span className="inline-flex w-fit items-center gap-1 rounded-full bg-slate-200 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
                          Inactif
                        </span>
                      )}
                      {m.must_change_password ? (
                        <span
                          className="inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                          style={{
                            backgroundColor: "color-mix(in srgb, #f59e0b 18%, transparent)",
                            color: "#f59e0b",
                          }}
                        >
                          Connexion en attente
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div
                      className="relative flex flex-wrap items-center justify-end gap-1"
                      id={`cred-pop-${m.id}`}
                    >
                      {m.must_change_password ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCredPopoverId((id) =>
                              id === m.id ? null : m.id,
                            );
                          }}
                          className="rounded-lg border border-[var(--ds-primary-border)] px-2 py-1 text-[11px] font-medium text-[var(--ds-text)] hover:bg-[var(--ds-primary-soft)]"
                        >
                          🔑 Voir identifiants
                        </button>
                      ) : null}
                      {credPopoverId === m.id && m.must_change_password ? (
                        <div
                          className="absolute right-0 top-full z-[50] mt-1 w-64 rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-3 text-left shadow-lg"
                          style={{
                            boxShadow: "var(--shadow-lg)",
                            borderRadius: "var(--radius-xl)",
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ds-text-muted)]">
                            Email
                          </p>
                          <p className="break-all text-xs text-[var(--ds-text)]">
                            {m.email}
                          </p>
                          <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--ds-text-muted)]">
                            Mot de passe temporaire
                          </p>
                          <p className="text-xs leading-relaxed text-[var(--ds-text-muted)]">
                            Pour des raisons de sécurité, le mot de passe en clair
                            n&apos;est affiché qu&apos;une fois, dans la fenêtre de
                            confirmation après création du compte.
                          </p>
                        </div>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setEditRow(m)}
                        className="rounded-lg border border-[var(--ds-primary-border)] p-1.5 text-[var(--ds-text)] hover:bg-[var(--ds-primary-soft)]"
                        aria-label="Modifier"
                      >
                        <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={m.actif}
                        onClick={async () => {
                          const res = await updateTeamMemberAction(m.id, {
                            actif: !m.actif,
                          });
                          if (res.ok) {
                            showAppToast(
                              m.actif ? "Membre désactivé" : "Membre réactivé",
                            );
                            void refresh();
                          } else showAppToast(res.error);
                        }}
                        className="rounded-lg border border-[var(--ds-primary-border)] px-2 py-1 text-[11px] font-medium text-[var(--ds-text)] hover:bg-[var(--ds-primary-soft)]"
                      >
                        {m.actif ? "Désactiver" : "Activer"}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (
                            !window.confirm(
                              `Supprimer définitivement ${m.prenom} ${m.nom} et son compte ?`,
                            )
                          ) {
                            return;
                          }
                          const res = await deleteTeamMemberAction(m.id);
                          if (res.ok) {
                            showAppToast("Membre supprimé");
                            void refresh();
                          } else showAppToast(res.error);
                        }}
                        className="rounded-lg border border-red-200 bg-red-50/60 p-1.5 text-red-600 hover:bg-red-100"
                        aria-label="Supprimer"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {createOpen ? (
        <CreateMemberModal
          onClose={() => setCreateOpen(false)}
          onCreated={(payload) => {
            setCreatedAccount(payload);
            setCreateOpen(false);
          }}
        />
      ) : null}

      {createdAccount ? (
        <AccountCreatedModal
          payload={createdAccount}
          onDismiss={() => {
            setCreatedAccount(null);
            void refresh();
          }}
        />
      ) : null}

      {editRow ? (
        <EditMemberModal
          member={editRow}
          onClose={() => setEditRow(null)}
          onSaved={() => {
            setEditRow(null);
            showAppToast("Membre mis à jour");
            void refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function AccountCreatedModal({
  payload,
  onDismiss,
}: {
  payload: CreatedAccountPayload;
  onDismiss: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  async function copyPwd() {
    try {
      await navigator.clipboard.writeText(payload.tempPassword);
      showAppToast("Mot de passe copié");
    } catch {
      showAppToast("Impossible de copier");
    }
  }

  const modal = (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal
      aria-labelledby="account-created-title"
    >
      <div
        className="w-full max-w-md border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-8"
        style={{
          borderRadius: "var(--radius-xl)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <div className="mb-2 flex items-center gap-2">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"
            aria-hidden
          >
            <Check className="h-5 w-5" strokeWidth={2.5} />
          </span>
          <h2
            id="account-created-title"
            className="text-lg font-bold text-[var(--ds-text)]"
          >
            Compte créé ✓
          </h2>
        </div>
        <p className="text-sm text-[var(--ds-text)]">
          <span className="font-semibold">
            {payload.prenom} {payload.nom}
          </span>
        </p>
        <p className="mt-1 break-all text-sm text-[var(--ds-text-muted)]">
          {payload.email}
        </p>
        <p className="mt-4 text-[10px] font-semibold uppercase tracking-wide text-[var(--ds-text-muted)]">
          Mot de passe temporaire
        </p>
        <p
          className="mt-1 font-mono text-2xl font-bold tracking-tight text-[color:var(--ds-primary)]"
          style={{ fontWeight: 700 }}
        >
          {payload.tempPassword}
        </p>
        <button
          type="button"
          onClick={() => void copyPwd()}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-primary-soft)] py-2.5 text-sm font-semibold text-[color:var(--ds-primary)] hover:opacity-90"
        >
          📋 Copier le mot de passe
        </button>
        <p className="mt-4 text-center text-xs text-[var(--ds-text-muted)]">
          Envoyez ces identifiants au membre par WhatsApp ou SMS
        </p>
        <PrimaryButton type="button" onClick={onDismiss} className="mt-6 h-11 w-full rounded-xl text-sm font-bold">
          J&apos;ai copié le mot de passe
        </PrimaryButton>
      </div>
    </div>
  );

  if (!mounted || typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}

function CreateMemberModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (payload: CreatedAccountPayload) => void;
}) {
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TeamMemberRole>("assistant");
  const [telephone, setTelephone] = useState("");
  const [specialite, setSpecialite] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    setErr("");
    setBusy(true);
    const res = await createTeamMemberAction({
      prenom,
      nom,
      email,
      role,
      telephone: telephone || null,
      specialite: specialite || null,
    });
    setBusy(false);
    if (res.ok) {
      if (!res.tempPassword?.trim()) {
        setErr(
          "Compte créé mais le mot de passe temporaire est manquant. Rechargez la page ou recréez le membre.",
        );
        return;
      }
      if (res.authWarning) {
        showAppToast(res.authWarning);
      }
      onCreated({
        prenom: res.member.prenom,
        nom: res.member.nom,
        email: res.member.email,
        tempPassword: res.tempPassword,
      });
    } else {
      setErr(
        typeof res.error === "string" && res.error.length > 0
          ? res.error
          : "Erreur inconnue lors de la création.",
      );
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal
    >
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-2">
          <h3 className="text-base font-bold text-[var(--ds-text)]">
            Nouveau membre
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-[var(--ds-text-muted)] hover:bg-[var(--ds-primary-soft)]"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <div className="mb-4 rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-primary-soft)] px-3 py-2.5 text-[11.5px] leading-snug text-[var(--ds-primary)]">
          Un mot de passe temporaire unique sera généré (format Oryx-••••••••).
          Communiquez-le au membre après création (aucun e-mail automatique pour
          l&apos;instant).
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ds-text-muted)]">
                Prénom
              </label>
              <input
                className={inputCls}
                value={prenom}
                onChange={(e) => setPrenom(e.target.value)}
                autoComplete="given-name"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ds-text-muted)]">
                Nom
              </label>
              <input
                className={inputCls}
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                autoComplete="family-name"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ds-text-muted)]">
              Email (connexion)
            </label>
            <input
              type="email"
              className={inputCls}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ds-text-muted)]">
              Rôle
            </label>
            <select
              className={inputCls}
              value={role}
              onChange={(e) => setRole(e.target.value as TeamMemberRole)}
            >
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ds-text-muted)]">
              Téléphone (optionnel)
            </label>
            <input
              type="tel"
              className={inputCls}
              value={telephone}
              onChange={(e) => setTelephone(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ds-text-muted)]">
              Spécialité (optionnel)
            </label>
            <input
              type="text"
              className={inputCls}
              value={specialite}
              onChange={(e) => setSpecialite(e.target.value)}
              placeholder="Ex. Orthodontiste"
            />
          </div>
          {err ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
              {err}
            </p>
          ) : null}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl border border-[var(--ds-primary-border)] px-4 py-2 text-sm font-medium text-[var(--ds-text)] hover:bg-[var(--ds-primary-soft)] disabled:opacity-50"
          >
            Annuler
          </button>
          <PrimaryButton
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            isLoading={busy}
            className="rounded-xl px-4 py-2 text-sm font-semibold"
          >
            Créer le membre
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

function EditMemberModal({
  member,
  onClose,
  onSaved,
}: {
  member: TeamMemberRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [prenom, setPrenom] = useState(member.prenom);
  const [nom, setNom] = useState(member.nom);
  const [role, setRole] = useState<TeamMemberRole>(member.role);
  const [telephone, setTelephone] = useState(member.telephone ?? "");
  const [specialite, setSpecialite] = useState(member.specialite ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    setErr("");
    setBusy(true);
    const res = await updateTeamMemberAction(member.id, {
      prenom,
      nom,
      role,
      telephone: telephone || null,
      specialite: specialite || null,
    });
    setBusy(false);
    if (res.ok) onSaved();
    else setErr(res.error);
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal
    >
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-2">
          <h3 className="text-base font-bold text-[var(--ds-text)]">
            Modifier le membre
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-[var(--ds-text-muted)] hover:bg-[var(--ds-primary-soft)]"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <p className="mb-3 text-xs text-[var(--ds-text-muted)]">
          Email (connexion) :{" "}
          <span className="font-medium text-[var(--ds-text)]">{member.email}</span>{" "}
          — non modifiable ici.
        </p>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ds-text-muted)]">
                Prénom
              </label>
              <input
                className={inputCls}
                value={prenom}
                onChange={(e) => setPrenom(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--ds-text-muted)]">
                Nom
              </label>
              <input
                className={inputCls}
                value={nom}
                onChange={(e) => setNom(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ds-text-muted)]">
              Rôle
            </label>
            <select
              className={inputCls}
              value={role}
              onChange={(e) => setRole(e.target.value as TeamMemberRole)}
            >
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ds-text-muted)]">
              Téléphone
            </label>
            <input
              type="tel"
              className={inputCls}
              value={telephone}
              onChange={(e) => setTelephone(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--ds-text-muted)]">
              Spécialité
            </label>
            <input
              type="text"
              className={inputCls}
              value={specialite}
              onChange={(e) => setSpecialite(e.target.value)}
            />
          </div>
          {err ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
              {err}
            </p>
          ) : null}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl border border-[var(--ds-primary-border)] px-4 py-2 text-sm font-medium text-[var(--ds-text)] hover:bg-[var(--ds-primary-soft)] disabled:opacity-50"
          >
            Annuler
          </button>
          <PrimaryButton
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            isLoading={busy}
            className="rounded-xl px-4 py-2 text-sm font-semibold"
          >
            Enregistrer
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
