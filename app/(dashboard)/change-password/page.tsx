"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { Lock } from "lucide-react";
import { completeFirstPasswordChangeAction } from "@/app/actions/team";

const INPUT_CLS =
  "h-11 w-full rounded-xl border-[1.5px] border-[var(--ds-primary-border)] bg-[var(--ds-surface)] pl-10 pr-3 text-sm text-[var(--ds-text)] outline-none transition-colors focus:border-[var(--ds-primary)]";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);

  const strength = useMemo(() => {
    let s = 0;
    if (pwd.length >= 8) s++;
    if (/[A-Z]/.test(pwd)) s++;
    if (/[0-9]/.test(pwd)) s++;
    if (/[^A-Za-z0-9]/.test(pwd)) s++;
    return s;
  }, [pwd]);

  const verifyGate = useCallback(async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/team/must-change-password", {
        cache: "no-store",
      });
      const data: unknown = await res.json().catch(() => null);
      const must =
        data &&
        typeof data === "object" &&
        (data as { mustChangePassword?: boolean }).mustChangePassword === true;
      if (!must) {
        router.replace("/");
        return;
      }
    } catch {
      router.replace("/");
      return;
    } finally {
      setChecking(false);
    }
  }, [router]);

  useEffect(() => {
    void verifyGate();
  }, [verifyGate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    if (pwd.length < 8) {
      setErr("Le mot de passe doit contenir au moins 8 caractères");
      return;
    }
    if (pwd !== pwd2) {
      setErr("Les mots de passe ne correspondent pas");
      return;
    }
    setBusy(true);
    const res = await completeFirstPasswordChangeAction(pwd);
    setBusy(false);
    if (!res.ok) {
      setErr(res.error);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  if (checking) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6">
        <p className="text-sm text-[var(--ds-text-muted)]">Chargement…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center p-4 md:p-8">
      <div
        className="w-full max-w-md rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] p-8 shadow-lg"
        style={{ boxShadow: "var(--shadow-lg, 0 10px 40px rgba(15,23,42,0.08))" }}
      >
        <h1 className="text-2xl font-bold tracking-tight text-[var(--ds-text)]">
          Bienvenue sur Oryx 👋
        </h1>
        <p className="mt-2 text-sm text-[var(--ds-text-muted)]">
          Choisissez votre mot de passe pour sécuriser votre compte
        </p>

        <form onSubmit={(e) => void onSubmit(e)} className="mt-8 space-y-4">
          <Field label="Nouveau mot de passe" htmlFor="cp-pwd">
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-text-muted)]" />
              <input
                id="cp-pwd"
                type="password"
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                className={INPUT_CLS}
                autoComplete="new-password"
              />
            </div>
            <PwdStrength score={strength} />
          </Field>

          <Field label="Confirmer le mot de passe" htmlFor="cp-pwd2">
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ds-text-muted)]" />
              <input
                id="cp-pwd2"
                type="password"
                value={pwd2}
                onChange={(e) => setPwd2(e.target.value)}
                className={INPUT_CLS}
                autoComplete="new-password"
              />
            </div>
          </Field>

          {err ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
              {err}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="h-12 w-full rounded-xl bg-[color:var(--ds-primary)] text-sm font-bold text-white shadow-md transition-opacity hover:opacity-95 disabled:opacity-50"
          >
            {busy ? "Enregistrement…" : "Confirmer"}
          </button>
        </form>
      </div>
    </div>
  );
}

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
