"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Mail, Power, Trash2, UserPlus, X } from "lucide-react";
import { showAppToast } from "@/utils/appToast";
import {
  createInvitation,
  getInitials,
  isInvitationValid,
  loadInvitations,
  loadTeam,
  removeMember,
  ROLE_LABEL,
  roleBadgeTone,
  setMemberStatus,
  type Invitation,
  type TeamMember,
} from "@/utils/roles";

type MemberRole = Exclude<TeamMember["role"], never>;

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function buildInviteLink(token: string): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/invitation/${encodeURIComponent(token)}`;
}

export function TeamSection() {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [showLink, setShowLink] = useState<string | null>(null);

  function reload() {
    setTeam(loadTeam());
    setInvitations(loadInvitations());
  }

  useEffect(() => {
    reload();
  }, []);

  const pendingCount = useMemo(
    () => team.filter((m) => m.statut === "invité").length,
    [team],
  );

  function handleInviteCreated(token: string) {
    reload();
    setInviteOpen(false);
    setShowLink(buildInviteLink(token));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-[var(--ds-text)]">
            Équipe &amp; accès
          </h2>
          <p className="mt-1 text-sm text-[var(--ds-text-muted)]">
            Invitez vos collaborateurs et contrôlez leurs accès.
            {pendingCount > 0 && (
              <span className="ml-1 text-[var(--ds-primary)]">
                {pendingCount} invitation{pendingCount > 1 ? "s" : ""} en attente.
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setInviteOpen(true)}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[color:var(--ds-primary)] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          <UserPlus className="h-4 w-4" strokeWidth={2} />
          Inviter un membre
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <MemberCard
          member={{
            id: "admin",
            email: "—",
            nom: "Vous (Administrateur)",
            role: "replacant",
            statut: "actif",
            dateInvitation: "",
          }}
          adminOverride
          onStatusChange={() => {}}
          onRemove={() => {}}
        />

        {team.map((m) => (
          <MemberCard
            key={m.id}
            member={m}
            invitations={invitations}
            onStatusChange={(statut) => {
              setMemberStatus(m.id, statut);
              reload();
            }}
            onRemove={() => {
              if (!window.confirm(`Supprimer ${m.nom || m.email} ?`)) return;
              removeMember(m.id);
              reload();
              showAppToast("Membre supprimé");
            }}
            onCopyLink={(t) => setShowLink(buildInviteLink(t))}
          />
        ))}
      </div>

      {team.length === 0 && (
        <p className="rounded-xl border border-dashed border-[var(--ds-primary-border)] px-5 py-6 text-center text-sm text-[var(--ds-text-muted)]">
          Aucun collaborateur pour l&apos;instant. Cliquez sur{" "}
          <span className="font-semibold text-[var(--ds-text)]">Inviter un membre</span>.
        </p>
      )}

      {inviteOpen && (
        <InviteModal
          onClose={() => setInviteOpen(false)}
          onCreated={handleInviteCreated}
        />
      )}

      {showLink && (
        <InviteLinkModal link={showLink} onClose={() => setShowLink(null)} />
      )}
    </div>
  );
}

/* ───────────────────────── Cards membre ───────────────────────── */

function StatusBadge({ statut }: { statut: TeamMember["statut"] }) {
  if (statut === "actif") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Actif
      </span>
    );
  }
  if (statut === "invité") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-700">
        <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
        Invitation envoyée
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
      Désactivé
    </span>
  );
}

function MemberCard({
  member,
  invitations = [],
  adminOverride = false,
  onStatusChange,
  onRemove,
  onCopyLink,
}: {
  member: TeamMember;
  invitations?: Invitation[];
  adminOverride?: boolean;
  onStatusChange: (statut: TeamMember["statut"]) => void;
  onRemove: () => void;
  onCopyLink?: (token: string) => void;
}) {
  const invitation = invitations.find(
    (i) =>
      i.email === member.email &&
      !i.consumed &&
      isInvitationValid(i),
  );
  const color = adminOverride ? roleBadgeTone("admin") : roleBadgeTone(member.role);
  const initials = getInitials(member.nom || member.email);

  return (
    <div className="group relative flex flex-col rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-4 transition-shadow hover:shadow-sm">
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ backgroundColor: color }}
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[var(--ds-text)]">
            {member.nom || member.email.split("@")[0]}
          </p>
          <p className="mt-0.5 truncate text-xs text-[var(--ds-text-muted)]">
            {adminOverride ? "Accès total" : member.email}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{
                backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
                color,
              }}
            >
              {adminOverride ? ROLE_LABEL.admin : ROLE_LABEL[member.role]}
            </span>
            {!adminOverride && <StatusBadge statut={member.statut} />}
          </div>
        </div>
      </div>

      {!adminOverride && (
        <div className="mt-4 flex flex-wrap items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
          {invitation && onCopyLink && (
            <button
              type="button"
              onClick={() => onCopyLink(invitation.token)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--ds-primary-border)] px-2.5 py-1 text-[11px] font-medium text-[var(--ds-text)] hover:bg-[var(--ds-primary-soft)]"
            >
              <Copy className="h-3 w-3" strokeWidth={2} />
              Copier le lien
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              onStatusChange(member.statut === "désactivé" ? "actif" : "désactivé")
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--ds-primary-border)] px-2.5 py-1 text-[11px] font-medium text-[var(--ds-text)] hover:bg-[var(--ds-primary-soft)]"
          >
            <Power className="h-3 w-3" strokeWidth={2} />
            {member.statut === "désactivé" ? "Réactiver" : "Désactiver"}
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50/60 px-2.5 py-1 text-[11px] font-medium text-red-600 hover:bg-red-100"
          >
            <Trash2 className="h-3 w-3" strokeWidth={2} />
            Supprimer
          </button>
        </div>
      )}

      {!adminOverride && invitation && (
        <p className="mt-3 text-[11px] text-[var(--ds-text-muted)]">
          Invité le {formatDate(invitation.dateInvitation)} · expire le{" "}
          {formatDate(invitation.expiresAt)}
        </p>
      )}
    </div>
  );
}

/* ───────────────────────── Modal d'invitation ───────────────────────── */

function InviteModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (token: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("assistant");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  async function submit() {
    setError("");
    const value = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError("Adresse e-mail invalide");
      return;
    }
    const existing = loadTeam().find((m) => m.email === value);
    if (existing) {
      setError("Ce membre est déjà invité");
      return;
    }
    setSending(true);
    try {
      const { invitation } = await createInvitation(value, role);
      showAppToast(`Invitation envoyée à ${value}`);
      onCreated(invitation.token);
    } catch {
      setError("Impossible de générer l'invitation");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal
    >
      <div className="w-full max-w-md rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-6 shadow-xl">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h3 className="text-base font-bold text-[var(--ds-text)]">
              Inviter un membre
            </h3>
            <p className="mt-1 text-xs text-[var(--ds-text-muted)]">
              Le lien d&apos;invitation est valable 48 heures.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-[var(--ds-text-muted)] hover:bg-[var(--ds-primary-soft)]"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="invite-email"
              className="mb-1.5 block text-xs font-semibold text-[var(--ds-text-muted)]"
            >
              Adresse e-mail
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-text-muted)]" />
              <input
                id="invite-email"
                type="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="assistant@cabinet.dz"
                className="h-11 w-full rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-bg)] pl-10 pr-3 text-sm text-[var(--ds-text)] outline-none transition-colors focus:border-[var(--ds-primary)]"
              />
            </div>
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-semibold text-[var(--ds-text-muted)]">
              Rôle
            </span>
            <div className="grid grid-cols-2 gap-2">
              <RoleOption
                active={role === "replacant"}
                label="Remplaçant"
                desc="Dentiste, accès aux soins"
                onClick={() => setRole("replacant")}
              />
              <RoleOption
                active={role === "assistant"}
                label="Assistante"
                desc="Gestion, planning, stocks"
                onClick={() => setRole("assistant")}
              />
            </div>
          </div>

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
              {error}
            </p>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="rounded-xl border border-[var(--ds-primary-border)] px-4 py-2 text-sm font-medium text-[var(--ds-text)] hover:bg-[var(--ds-primary-soft)] disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={sending}
            className="rounded-xl bg-[color:var(--ds-primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {sending ? "Envoi…" : "Envoyer l'invitation"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RoleOption({
  active,
  label,
  desc,
  onClick,
}: {
  active: boolean;
  label: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors ${
        active
          ? "border-[var(--ds-primary)] bg-[var(--ds-primary-soft)]"
          : "border-[var(--ds-primary-border)] hover:bg-[var(--ds-primary-soft)]/40"
      }`}
    >
      <span className="text-sm font-semibold text-[var(--ds-text)]">{label}</span>
      <span className="text-[11px] text-[var(--ds-text-muted)]">{desc}</span>
    </button>
  );
}

/* ───────────────────────── Modal lien d'invitation ───────────────────────── */

function InviteLinkModal({
  link,
  onClose,
}: {
  link: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  function copy() {
    try {
      navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
      showAppToast("Lien copié dans le presse-papier");
    } catch {
      /* noop */
    }
  }
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal
    >
      <div className="w-full max-w-md rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="text-base font-bold text-[var(--ds-text)]">
              Lien d&apos;invitation
            </h3>
            <p className="mt-1 text-xs text-[var(--ds-text-muted)]">
              Envoyez ce lien au membre. Il expire dans 48 heures.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-[var(--ds-text-muted)] hover:bg-[var(--ds-primary-soft)]"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-bg)] p-3">
          <span className="truncate text-xs text-[var(--ds-text)]">{link}</span>
          <button
            type="button"
            onClick={copy}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-[color:var(--ds-primary)] px-3 py-1.5 text-xs font-semibold text-white"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3" strokeWidth={2.5} /> Copié
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" strokeWidth={2} /> Copier
              </>
            )}
          </button>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-[color:var(--ds-primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Terminer
          </button>
        </div>
      </div>
    </div>
  );
}
