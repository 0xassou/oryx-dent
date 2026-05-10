/**
 * Suspense / navigation : plein écran, fond --ds-background (alias de --ds-bg, voir globals.css).
 */
export default function Loading() {
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-[var(--ds-background)]"
      role="status"
      aria-busy="true"
      aria-label="Chargement"
    >
      <div
        className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--ds-primary-soft)] border-t-[var(--ds-primary)]"
        aria-hidden
      />
    </div>
  );
}
