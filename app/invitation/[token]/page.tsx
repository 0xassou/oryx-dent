"use client";

import { use, useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, Lock, ShieldCheck, User } from "lucide-react";
import {
  acceptInvitationAction,
  parseInvitationTokenAction,
} from "@/app/actions/team";
import type { InvitationTokenPayload } from "@/lib/types/invitation-token";
import { ROLE_LABEL, setCurrentRole, setCurrentUser, type Role } from "@/utils/roles";
import { authClient } from "@/lib/auth-client";
import { PrimaryButton } from "@/components/ui/PrimaryButton";

type Stage = "loading" | "invalid" | "form" | "done";

export default function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("loading");
  const [invitation, setInvitation] = useState<InvitationTokenPayload | null>(
    null,
  );
  const [parseError, setParseError] = useState<string | null>(null);
  const [nom, setNom] = useState("");
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await parseInvitationTokenAction(token);
      if (cancelled) return;
      if (!res.ok) {
        setParseError(res.error);
        setStage("invalid");
        return;
      }
      setInvitation(res.data);
      setStage("form");
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const strength = useMemo(() => {
    let s = 0;
    if (pwd.length >= 8) s++;
    if (/[A-Z]/.test(pwd)) s++;
    if (/[0-9]/.test(pwd)) s++;
    if (/[^A-Za-z0-9]/.test(pwd)) s++;
    return s;
  }, [pwd]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!nom.trim()) {
      setError("Entrez votre nom complet");
      return;
    }
    if (pwd.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères");
      return;
    }
    if (pwd !== pwd2) {
      setError("Les mots de passe ne correspondent pas");
      return;
    }
    setSubmitting(true);
    const res = await acceptInvitationAction(token, nom, pwd);
    if (!res.ok) {
      setError(res.error);
      setSubmitting(false);
      return;
    }
    const signIn = await authClient.signIn.email({
      email: res.email,
      password: pwd,
    });
    const signErr =
      signIn &&
      typeof signIn === "object" &&
      "error" in signIn &&
      signIn.error &&
      typeof signIn.error === "object" &&
      signIn.error !== null &&
      "message" in signIn.error
        ? String((signIn.error as { message?: string }).message ?? "")
        : "";
    if (signErr) {
      setError(signErr || "Connexion impossible après inscription.");
      setSubmitting(false);
      return;
    }
    setCurrentRole(res.role as Role);
    setCurrentUser({
      email: res.email,
      nom: nom.trim(),
      role: res.role as Role,
    });
    setStage("done");
  }

  return (
    <div className="fixed inset-0 flex min-h-screen items-center justify-center bg-[var(--ds-bg)] p-4">
      <div className="w-full max-w-md rounded-[24px] border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-9 shadow-[0_8px_40px_rgba(124,58,237,0.10),0_2px_8px_rgba(0,0,0,0.06)]">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{
              background:
                "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)",
              color: "white",
            }}
          >
            <ShieldCheck className="h-7 w-7" strokeWidth={2} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[var(--ds-text)]">
              Rejoindre Oryx
            </h1>
            <p className="mt-1 text-sm text-[var(--ds-text-muted)]">
              Configurez votre accès en quelques secondes
            </p>
          </div>
        </div>

        {stage === "loading" && (
          <p className="text-center text-sm text-[var(--ds-text-muted)]">
            Vérification de l&apos;invitation…
          </p>
        )}

        {stage === "invalid" && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-5 text-center">
            <p className="text-sm font-semibold text-red-700">
              {parseError ?? "Invitation invalide ou expirée"}
            </p>
            <p className="mt-1 text-xs text-red-600">
              Demandez un nouveau lien à l&apos;administrateur du cabinet.
            </p>
          </div>
        )}

        {stage === "done" && (
          <div className="space-y-5 rounded-xl border border-emerald-200/80 bg-emerald-50/90 p-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-white">
              <Check className="h-6 w-6" strokeWidth={2.5} />
            </div>
            <p className="text-[15px] font-semibold leading-snug text-emerald-900">
              <span aria-hidden>✅ </span>
              Compte créé ! Notez votre email et mot de passe pour vos
              prochaines connexions.
            </p>
            <p className="text-xs leading-relaxed text-emerald-800/90">
              Sur la page de connexion, utilisez le même identifiant — vous
              n&apos;avez plus besoin de ce lien d&apos;invitation.
            </p>
            <PrimaryButton
              type="button"
              onClick={() => router.push("/")}
              className="h-11 w-full text-sm font-bold shadow-md"
            >
              Accéder à Oryx
            </PrimaryButton>
          </div>
        )}

        {stage === "form" && invitation && (
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div className="rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-primary-soft)] px-4 py-3 text-sm">
              <p className="text-[var(--ds-text)]">
                <span className="font-semibold">{invitation.email}</span>
              </p>
              <p className="mt-0.5 text-xs text-[var(--ds-text-muted)]">
                Rôle attribué :{" "}
                <span className="font-semibold text-[var(--ds-primary)]">
                  {ROLE_LABEL[invitationRoleToAppRole(invitation.role)]}
                </span>
              </p>
            </div>

            <Field label="Nom complet" htmlFor="inv-nom">
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-text-muted)]" />
                <input
                  id="inv-nom"
                  type="text"
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  placeholder="Sofia Benali"
                  autoFocus
                  className={INPUT_CLS}
                  autoComplete="name"
                />
              </div>
            </Field>

            <Field label="Mot de passe" htmlFor="inv-pwd">
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-text-muted)]" />
                <input
                  id="inv-pwd"
                  type="password"
                  value={pwd}
                  onChange={(e) => setPwd(e.target.value)}
                  placeholder="Min. 8 caractères"
                  className={INPUT_CLS}
                  autoComplete="new-password"
                />
              </div>
              <PwdStrength score={strength} />
            </Field>

            <Field label="Confirmation" htmlFor="inv-pwd2">
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-text-muted)]" />
                <input
                  id="inv-pwd2"
                  type="password"
                  value={pwd2}
                  onChange={(e) => setPwd2(e.target.value)}
                  placeholder="Répétez le mot de passe"
                  className={INPUT_CLS}
                  autoComplete="new-password"
                />
              </div>
            </Field>

            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                {error}
              </p>
            )}

            <PrimaryButton
              type="submit"
              disabled={submitting}
              isLoading={submitting}
              className="mt-2 h-11 w-full text-sm font-bold shadow-[0_4px_14px_rgba(124,58,237,0.35)]"
            >
              Accéder à Oryx
            </PrimaryButton>
          </form>
        )}
      </div>
    </div>
  );
}

function invitationRoleToAppRole(
  role: InvitationTokenPayload["role"],
): Role {
  return role === "replacant" ? "remplacant" : role;
}

const INPUT_CLS =
  "h-11 w-full rounded-xl border-[1.5px] border-[var(--ds-primary-border)] bg-[var(--ds-bg)] pl-10 pr-3 text-sm text-[var(--ds-text)] outline-none transition-colors focus:border-[var(--ds-primary)]";

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-xs font-semibold text-[var(--ds-text-muted)]"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function PwdStrength({ score }: { score: number }) {
  const colors = ["#ef4444", "#f97316", "#f59e0b", "#10b981"];
  return (
    <div className="mt-1.5 flex gap-1">
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="h-[3px] flex-1 rounded-[2px] transition-colors"
          style={{
            backgroundColor:
              i <= score && score > 0
                ? colors[score - 1]
                : "var(--ds-primary-border)",
          }}
        />
      ))}
    </div>
  );
}
