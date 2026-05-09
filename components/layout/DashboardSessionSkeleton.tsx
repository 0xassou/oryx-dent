"use client";

/**
 * Placeholder affiché tant que le rôle de session n’est pas résolu (Better Auth + équipe).
 */
export function DashboardSessionSkeleton() {
  return (
    <div
      className="fixed inset-0 bg-[var(--ds-layout-bg)] p-2 lg:p-3 xl:p-4"
      style={{ backgroundColor: "var(--ds-layout-bg)" }}
    >
      <div
        className="flex h-full w-full overflow-hidden rounded-2xl border border-[var(--ds-primary-border)] bg-[var(--ds-bg)] shadow-xl"
        role="status"
        aria-busy="true"
        aria-label="Chargement de la session"
      >
        <div className="hidden w-64 flex-shrink-0 animate-pulse bg-[var(--ds-surface)] lg:block" />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="h-14 flex-shrink-0 animate-pulse border-b border-[var(--ds-primary-border)] bg-[var(--ds-surface)] xl:h-16" />
          <div className="flex flex-1 flex-col gap-4 p-6">
            <div className="h-8 w-1/3 max-w-xs animate-pulse rounded-lg bg-[var(--ds-primary-soft)]/40" />
            <div className="h-32 w-full max-w-2xl animate-pulse rounded-xl bg-[var(--ds-primary-soft)]/30" />
            <div className="h-48 w-full flex-1 animate-pulse rounded-xl bg-[var(--ds-primary-soft)]/20" />
          </div>
        </div>
      </div>
    </div>
  );
}
