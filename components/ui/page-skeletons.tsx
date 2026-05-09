/**
 * Skeletons de chargement instantané (0 ms) — animate-pulse + bg-muted + rounded.
 */

export const skeletonBlock = "animate-pulse rounded-lg bg-muted";

export function PatientsListSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className={`h-8 w-48 ${skeletonBlock} rounded-xl`} />
          <div className={`h-4 w-64 ${skeletonBlock}`} />
        </div>
        <div className={`h-10 w-44 ${skeletonBlock} rounded-xl`} />
      </div>
      <div className={`h-11 w-full ${skeletonBlock} rounded-xl`} />
      <div className="flex flex-wrap gap-2">
        <div className={`h-8 w-20 ${skeletonBlock} rounded-full`} />
        <div className={`h-8 w-20 ${skeletonBlock} rounded-full`} />
        <div className={`h-8 w-20 ${skeletonBlock} rounded-full`} />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 rounded-xl border border-[var(--ds-border)] bg-[var(--ds-surface)] p-4"
          >
            <div className={`h-12 w-12 shrink-0 rounded-full ${skeletonBlock}`} />
            <div className="min-w-0 flex-1 space-y-2">
              <div className={`h-4 w-[45%] max-w-xs ${skeletonBlock}`} />
              <div className={`h-3 w-[30%] max-w-[180px] ${skeletonBlock}`} />
            </div>
            <div className={`h-8 w-24 shrink-0 ${skeletonBlock} rounded-lg`} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function PlanningContentSkeleton() {
  return (
    <div className="mt-2 flex min-h-[420px] flex-1 flex-col gap-4 overflow-hidden">
      <div className="grid grid-cols-7 gap-2 max-lg:hidden">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="space-y-2">
            <div className={`h-6 ${skeletonBlock} rounded-md`} />
            <div className={`min-h-[200px] ${skeletonBlock} rounded-xl`} />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-3 lg:hidden">
        <div className={`h-24 ${skeletonBlock} rounded-xl`} />
        <div className={`h-24 ${skeletonBlock} rounded-xl`} />
        <div className={`h-24 ${skeletonBlock} rounded-xl`} />
      </div>
    </div>
  );
}

export function WorkflowKanbanSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }, (_, col) => (
        <div
          key={col}
          className="flex min-h-[280px] flex-col rounded-2xl border border-[var(--ds-border)] bg-[var(--ds-surface-2)]"
        >
          <div className="flex items-center gap-2 border-b border-[var(--ds-border)] px-4 py-3">
            <div className={`h-4 w-4 ${skeletonBlock} rounded`} />
            <div className={`h-4 w-24 ${skeletonBlock}`} />
            <div className={`ml-auto h-5 w-6 ${skeletonBlock} rounded-full`} />
          </div>
          <div className="flex flex-1 flex-col gap-2.5 p-3">
            {Array.from({ length: 3 }, (_, i) => (
              <div
                key={i}
                className={`min-h-[88px] rounded-xl border border-[var(--ds-border)] bg-[var(--ds-surface)] ${skeletonBlock}`}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function FinancesFacturesTableSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between">
        <div className="space-y-2">
          <div className={`h-7 w-32 ${skeletonBlock} rounded-lg`} />
          <div className={`h-4 w-72 max-w-full ${skeletonBlock}`} />
        </div>
        <div className={`h-10 w-40 ${skeletonBlock} rounded-lg`} />
      </div>
      <div className="overflow-hidden rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] shadow-sm">
        <div className="space-y-3 p-5">
          <div className={`h-10 w-full ${skeletonBlock} rounded-lg`} />
          <div className="flex flex-wrap gap-2">
            <div className={`h-8 w-28 ${skeletonBlock} rounded-md`} />
            <div className={`h-8 w-28 ${skeletonBlock} rounded-md`} />
            <div className={`h-8 w-20 ${skeletonBlock} rounded-md`} />
            <div className={`h-8 w-24 ${skeletonBlock} rounded-md`} />
          </div>
        </div>
        <div className="border-t border-[var(--ds-border)] p-4">
          {Array.from({ length: 6 }, (_, i) => (
            <div
              key={i}
              className="flex gap-4 border-b border-[var(--ds-border)] py-3 last:border-0"
            >
              <div className={`h-4 flex-1 ${skeletonBlock}`} />
              <div className={`h-4 w-20 ${skeletonBlock}`} />
              <div className={`h-4 w-24 ${skeletonBlock}`} />
              <div className={`h-4 w-16 ${skeletonBlock}`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function LaboratoireListSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className={`h-[88px] ${skeletonBlock} rounded-2xl`} />
        ))}
      </div>
      <div className={`h-10 w-full max-w-md ${skeletonBlock} rounded-xl`} />
      <div className="space-y-3">
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            className={`min-h-[100px] rounded-2xl border border-[var(--ds-border)] ${skeletonBlock}`}
          />
        ))}
      </div>
    </div>
  );
}

export function StocksListSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className={`h-28 ${skeletonBlock} rounded-2xl`} />
        ))}
      </div>
      <div className={`h-10 w-full ${skeletonBlock} rounded-xl`} />
      <div className="space-y-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-2">
            <div className={`h-6 w-40 ${skeletonBlock} rounded-md`} />
            <div className={`min-h-[72px] ${skeletonBlock} rounded-xl`} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardKpiSkeleton() {
  return (
    <div className="flex min-h-[40vh] flex-col gap-4 bg-[var(--ds-bg)] p-6">
      <div className="rounded-3xl border border-[var(--ds-primary-border)]/80 bg-[var(--ds-surface)] p-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className={`h-12 w-12 ${skeletonBlock} rounded-2xl`} />
          <div className="space-y-2">
            <div className={`h-7 w-64 ${skeletonBlock} rounded-lg`} />
            <div className={`h-4 w-48 ${skeletonBlock}`} />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className={`h-[92px] ${skeletonBlock} rounded-2xl`} />
        ))}
      </div>
      <div className={`min-h-[200px] flex-1 ${skeletonBlock} rounded-2xl`} />
    </div>
  );
}
