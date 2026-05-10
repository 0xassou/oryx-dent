"use client";

import { useRouter } from "next/navigation";

export default function Error({
  error: _error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--ds-background)] px-6 py-12">
      <p className="max-w-md text-center text-base font-medium leading-relaxed text-[var(--ds-text)]">
        Une erreur est survenue. Veuillez réessayer.
      </p>
      <div className="mt-8 flex w-full max-w-sm flex-col gap-3 sm:flex-row sm:justify-center">
        <button
          type="button"
          onClick={() => reset()}
          className="h-11 rounded-xl border-[1.5px] border-[var(--ds-primary-border)] bg-[var(--ds-surface)] text-sm font-semibold text-[var(--ds-primary)] shadow-sm transition-colors hover:border-[var(--ds-primary)] hover:bg-[var(--ds-primary-soft)]"
        >
          Réessayer
        </button>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="h-11 rounded-xl text-sm font-bold text-white shadow-[0_4px_14px_rgba(124,58,237,0.35)] transition-all hover:-translate-y-px hover:shadow-[0_6px_20px_rgba(124,58,237,0.45)]"
          style={{
            background: "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)",
          }}
        >
          Retour au tableau de bord
        </button>
      </div>
    </div>
  );
}
