"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useSearchParams } from "next/navigation";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  GitBranch,
  List,
  Plus,
} from "lucide-react";
import AnimatedButton from "@/components/ui/AnimatedButton";
import { syncAppointmentToDBAction } from "@/app/actions/appointments";
import {
  NewAppointmentModal,
  type NewAppointmentPayload,
} from "@/components/planning/NewAppointmentModal";
import {
  type AppointmentRdv as Rdv,
  ensureAppointmentsSeeded,
  formatDateKeyLocal,
  isValidDateKeyString,
  safeDate,
  writeAppointmentsToStorage,
} from "@/utils/appointmentData";

// ─── Types ────────────────────────────────────────────────────────────────────

// "liste" est la nouvelle vue ajoutée — vue par défaut
type ViewMode = "liste" | "calendar" | "tree";

// ─── Helpers date ─────────────────────────────────────────────────────────────

function formatDateLong(d: Date): string {
  return d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatDateKey(d: Date): string {
  return formatDateKeyLocal(safeDate(d));
}

const WEEK_DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

type SlidingDayColumn = {
  iso: string;
  weekdayShort: string;
  dayOfMonth: number;
};

function buildSlidingDayColumns(centerDate: Date): SlidingDayColumn[] {
  const columns: SlidingDayColumn[] = [];
  const c = new Date(safeDate(centerDate));
  c.setHours(0, 0, 0, 0);
  for (let i = -7; i <= 6; i++) {
    const d = new Date(c);
    d.setDate(d.getDate() + i);
    const dow = d.getDay();
    const idx = dow === 0 ? 6 : dow - 1;
    columns.push({
      iso: formatDateKey(d),
      weekdayShort: WEEK_DAYS[idx],
      dayOfMonth: d.getDate(),
    });
  }
  return columns;
}

/** 7 jours glissants centrés sur centerDate — pour la vue liste. */
function buildWeekColumns(centerDate: Date): SlidingDayColumn[] {
  const columns: SlidingDayColumn[] = [];
  const c = new Date(safeDate(centerDate));
  c.setHours(0, 0, 0, 0);
  for (let i = -3; i <= 3; i++) {
    const d = new Date(c);
    d.setDate(d.getDate() + i);
    const dow = d.getDay();
    const idx = dow === 0 ? 6 : dow - 1;
    columns.push({
      iso: formatDateKey(d),
      weekdayShort: WEEK_DAYS[idx],
      dayOfMonth: d.getDate(),
    });
  }
  return columns;
}

// ─── Données fictives ─────────────────────────────────────────────────────────

function mkDateKey(offsetDays: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return formatDateKey(d);
}

const INITIAL_APPOINTMENTS: Rdv[] = [
  { id: "1", dateKey: mkDateKey(-2), start: "08:30", durationMinutes: 30, patient: "Marie Dupont", soin: "Détartrage", rdvType: "planned" },
  { id: "2", dateKey: mkDateKey(-2), start: "10:00", durationMinutes: 45, patient: "Jean Martin", soin: "Extraction", urgence: true, rdvType: "planned" },
  { id: "3", dateKey: mkDateKey(-1), start: "11:30", durationMinutes: 60, patient: "Isabelle Roux", soin: "Couronne", rdvType: "planned" },
  { id: "4", dateKey: mkDateKey(0), start: "14:00", durationMinutes: 90, patient: "Sophie Bernard", soin: "Blanchiment", rdvType: "planned" },
  { id: "5", dateKey: mkDateKey(0), start: "09:00", durationMinutes: 30, patient: "Pierre Leroy", soin: "Détartrage", rdvType: "planned" },
  { id: "6", dateKey: mkDateKey(1), start: "14:30", durationMinutes: 45, patient: "Lucas Garnier", soin: "Consultation", rdvType: "planned" },
  { id: "7", dateKey: mkDateKey(2), start: "10:30", durationMinutes: 60, patient: "Claire Moreau", soin: "Implant", urgence: true, rdvType: "planned" },
  { id: "8", dateKey: mkDateKey(3), start: "09:30", durationMinutes: 30, patient: "Thomas Petit", soin: "Blanchiment", rdvType: "planned" },
  { id: "9", dateKey: mkDateKey(4), start: "11:00", durationMinutes: 45, patient: "Marie Dupont", soin: "Contrôle", rdvType: "planned" },
];

// ─── Helpers couleurs ─────────────────────────────────────────────────────────

function rdvColor(rdv: Rdv) {
  if (rdv.rdvType === "direct") {
    return {
      bg: "bg-violet-50",
      text: "text-violet-700",
      dot: "bg-violet-500",
      border: "border-violet-200/70",
      accent: "#7c3aed",
    };
  }
  return rdv.urgence
    ? { bg: "bg-red-50", text: "text-red-600", dot: "bg-red-400", border: "border-red-200/60", accent: "#ef4444" }
    : { bg: "bg-[color:var(--ds-primary-soft)]/60", text: "text-[color:var(--ds-primary)]", dot: "bg-[var(--ds-primary)]", border: "border-[var(--ds-primary-border)]/40", accent: "#7c3aed" };
}

function actBg(soin: string) {
  const s = soin.toLowerCase();
  if (s.includes("détartr")) return "bg-[color:var(--ds-primary-soft)]/60";
  if (s.includes("extract")) return "bg-red-50/70";
  if (s.includes("couronne") || s.includes("implant") || s.includes("proth"))
    return "bg-amber-50/80";
  if (s.includes("blanch")) return "bg-[var(--ds-primary-soft)]/70";
  return "bg-[var(--ds-bg)]/70";
}

const GRID_STEP = 30;
const SLOT_HEIGHT_PX = 52;
const HOUR_COL_WIDTH_PX = 72;

function durationToGridHeight(durationMinutes: number | string): number {
  const mins = Number(durationMinutes) || 30;
  return (mins / GRID_STEP) * SLOT_HEIGHT_PX;
}

function timeToGridTop(start: string, workStartMinutes: number): number {
  const parts = start.split(":");
  const startMin = Number(parts[0]) * 60 + Number(parts[1] ?? 0);
  return ((startMin - workStartMinutes) / GRID_STEP) * SLOT_HEIGHT_PX;
}

function calendarRdvSurfaceStyle(rdv: Rdv): {
  backgroundColor: string;
  borderLeft: string;
  patientStyle: CSSProperties;
  timeStyle: CSSProperties;
  motifStyle: CSSProperties;
} {
  const text = {
    patientStyle: { color: "#ffffff", fontWeight: 700, textShadow: "0 1px 2px rgba(0,0,0,0.3)" } satisfies CSSProperties,
    timeStyle: { color: "rgba(255,255,255,0.95)" } satisfies CSSProperties,
    motifStyle: { color: "rgba(255,255,255,0.9)", fontWeight: 600 } satisfies CSSProperties,
  };
  if (rdv.urgence) {
    return { ...text, backgroundColor: "rgba(239, 68, 68, 0.75)", borderLeft: "3px solid rgba(239, 68, 68, 1)" };
  }
  return { ...text, backgroundColor: "rgba(124, 58, 237, 0.75)", borderLeft: "3px solid rgba(124, 58, 237, 1)" };
}

function scrollDayColumnIntoView(scrollRoot: HTMLElement, columnHeaderEl: HTMLElement): void {
  const rect = columnHeaderEl.getBoundingClientRect();
  const rootRect = scrollRoot.getBoundingClientRect();
  const left = rect.left - rootRect.left + scrollRoot.scrollLeft - HOUR_COL_WIDTH_PX;
  scrollRoot.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
}

// ─── Composant Branch (Vue Arbre) ─────────────────────────────────────────────

function Branch({ label, items }: { label: string; items: Rdv[] }) {
  return (
    <div className="relative mt-4">
      <div className="relative mb-4 ml-6 flex items-center gap-6">
        <div className="flex w-10 shrink-0 justify-center">
          <span className="relative z-10 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[var(--ds-primary)]/70" />
        </div>
        <h3 className="text-sm font-semibold tracking-widest text-[var(--ds-primary)]/70">
          {label}
        </h3>
      </div>
      <div className="space-y-3">
        {items.length === 0 && (
          <div className="ml-12 flex items-start gap-4">
            <div className="flex w-10 shrink-0 justify-center" aria-hidden />
            <p className="text-xs text-[var(--ds-text-muted)]">Aucun rendez-vous</p>
          </div>
        )}
        {items.map((rdv) => {
          const c = rdvColor(rdv);
          return (
            <div key={rdv.id} className="relative ml-12 flex items-start gap-4">
              <div className="flex w-10 shrink-0 justify-center">
                <span className="relative z-10 mt-1.5 h-3 w-3 flex-shrink-0 rounded-full bg-[var(--ds-primary)]/50" />
              </div>
              <div className={["flex-1 rounded-2xl border px-4 py-3", "shadow-[0_8px_30px_rgba(0,0,0,0.04)] backdrop-blur-sm", actBg(rdv.soin), c.border].join(" ")}>
                <div className="flex items-center gap-3">
                  <p className="text-sm font-semibold tracking-tight text-[var(--ds-text)]">
                    {rdv.start}
                  </p>
                  <div className="h-px flex-1 rounded-full bg-[var(--ds-primary-border)]/70" />
                </div>
                <div className="mt-1 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-xs font-semibold tracking-tight text-[color:var(--ds-text)]">
                        {rdv.patient}
                      </p>
                      {rdv.rdvType === "direct" && (
                        <span className="shrink-0 rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-violet-800">
                          Direct
                        </span>
                      )}
                    </div>
                    <p className={`mt-0.5 text-xs font-medium ${c.text}`}>
                      {rdv.soin}
                    </p>
                  </div>
                  <p className="mt-0.5 text-[10px] text-[var(--ds-text-muted)]">
                    {rdv.durationMinutes} min
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Vue Liste ────────────────────────────────────────────────────────────────

function ListView({
  rdvs,
  centerDate,
  onDaySelect,
  selectedDayIso,
}: {
  rdvs: Rdv[];
  centerDate: Date;
  onDaySelect: (iso: string) => void;
  selectedDayIso: string;
}) {
  const weekCols = buildWeekColumns(centerDate);

  const dayRdvs = rdvs
    .filter((r) => r.dateKey === selectedDayIso)
    .sort((a, b) => a.start.localeCompare(b.start));

  const selectedDate = safeDate(new Date(`${selectedDayIso}T12:00:00`));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      {/* Bande 7 jours */}
      <div className="grid grid-cols-7 gap-2 rounded-2xl border border-[var(--ds-border)] bg-[var(--ds-surface)] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        {weekCols.map((col) => {
          const hasRdv = rdvs.some((r) => r.dateKey === col.iso);
          const isSelected = col.iso === selectedDayIso;
          return (
            <button
              key={col.iso}
              type="button"
              onClick={() => onDaySelect(col.iso)}
              className={[
                "flex flex-col items-center gap-1.5 rounded-xl px-1 py-2 transition-all",
                isSelected
                  ? "bg-[var(--ds-primary-soft)]"
                  : "hover:bg-[var(--ds-primary-soft)]/50",
              ].join(" ")}
            >
              <span className="text-sm font-medium uppercase tracking-[0.8px] text-[var(--ds-text-muted)]">
                {col.weekdayShort}
              </span>
              <span
                className={[
                  "flex h-8 w-8 items-center justify-center text-[18px] font-bold leading-none",
                  isSelected
                    ? "rounded-[10px] bg-[var(--ds-primary)] text-white"
                    : "text-[var(--ds-text)]",
                ].join(" ")}
              >
                {col.dayOfMonth}
              </span>
              <span
                className={[
                  "h-1 w-1 rounded-full transition-opacity",
                  hasRdv ? "bg-[var(--ds-info)] opacity-100" : "opacity-0",
                ].join(" ")}
              />
            </button>
          );
        })}
      </div>

      {/* Liste des RDV */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <p className="mb-4 text-xs font-bold uppercase tracking-[1px] text-[var(--ds-text-muted)]">
          Rendez-vous —{" "}
          {selectedDate.toLocaleDateString("fr-FR", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </p>

        {dayRdvs.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-16">
            <p className="text-sm text-[var(--ds-text-muted)]/60">
              Aucun rendez-vous ce jour
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {dayRdvs.map((rdv) => {
              const c = rdvColor(rdv);
              return (
                <div
                  key={rdv.id}
                  className={[
                    "flex items-center gap-3 rounded-2xl border px-5 py-4",
                    "bg-[var(--ds-surface)] shadow-[0_1px_3px_rgba(0,0,0,0.04)]",
                    "cursor-pointer transition-all hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)] hover:translate-x-0.5",
                    "border-[var(--ds-border)]",
                  ].join(" ")}
                >
                  {/* Accent bar */}
                  <div
                    className="h-9 w-0.5 flex-shrink-0 rounded-full"
                    style={{ background: c.accent }}
                  />

                  {/* Heure */}
                  <span className="min-w-[38px] font-mono text-[13px] font-medium tabular-nums text-[var(--ds-text-muted)]">
                    {rdv.start}
                  </span>

                  {/* Infos */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[14px] font-semibold tracking-tight text-[color:var(--ds-text)]">
                        {rdv.patient}
                      </span>
                      {rdv.urgence && (
                        <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-red-600">
                          Urgence
                        </span>
                      )}
                      {rdv.rdvType === "direct" && (
                        <span className="rounded-full border border-[var(--ds-primary-border)] bg-[var(--ds-primary-soft)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[color:var(--ds-primary)]">
                          Direct
                        </span>
                      )}
                    </div>
                    <p className={`mt-0.5 text-xs font-medium ${c.text}`}>
                      {rdv.soin}
                    </p>
                  </div>

                  {/* Durée */}
                  <span className="rounded-lg border border-[var(--ds-border)] bg-[var(--ds-bg)] px-2.5 py-1 font-mono text-[10px] font-medium tabular-nums text-[var(--ds-text-muted)]">
                    {rdv.durationMinutes} min
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Vue Calendrier ───────────────────────────────────────────────────────────

function CalendarView({
  items,
  onItemsChange,
  columns,
  scrollAnchorIso,
  onScrollAnchorConsumed,
}: {
  items: Rdv[];
  onItemsChange: Dispatch<SetStateAction<Rdv[]>>;
  columns: SlidingDayColumn[];
  scrollAnchorIso: string | null;
  onScrollAnchorConsumed: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const todayScrollDoneRef = useRef(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (todayScrollDoneRef.current) return;
    const scrollRoot = scrollRef.current;
    if (!scrollRoot) return;
    const todayIso = formatDateKey(new Date());
    const target = scrollRoot.querySelector<HTMLElement>(`[data-cal-head="${todayIso}"]`);
    if (!target) { todayScrollDoneRef.current = true; return; }
    scrollDayColumnIntoView(scrollRoot, target);
    todayScrollDoneRef.current = true;
  }, [columns]);

  useLayoutEffect(() => {
    if (!scrollAnchorIso) return;
    const scrollRoot = scrollRef.current;
    if (!scrollRoot) return;
    const target = scrollRoot.querySelector<HTMLElement>(`[data-cal-head="${scrollAnchorIso}"]`);
    if (target) scrollDayColumnIntoView(scrollRoot, target);
    onScrollAnchorConsumed();
  }, [scrollAnchorIso, columns, onScrollAnchorConsumed]);

  const stepMinutes = 30;
  const startMinutes = 8 * 60;
  const endMinutes = 18 * 60;

  const workSlots = Array.from(
    { length: (endMinutes - startMinutes) / stepMinutes + 1 },
    (_, i) => {
      const total = startMinutes + i * stepMinutes;
      const h = Math.floor(total / 60);
      const m = total % 60;
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
  );

  function handleDrop(columnIso: string, slotStart: string) {
    if (dragId === null) return;
    const moved = items.find((r) => r.id === dragId);
    if (!moved) return;
    const partsNew = slotStart.split(":");
    const newStartMin = Number(partsNew[0]) * 60 + Number(partsNew[1] ?? 0);
    const dur = Number(moved.durationMinutes) || 30;
    const newEndMin = newStartMin + dur;
    const others = items.filter((r) => r.id !== dragId && r.dateKey === columnIso);
    for (const o of others) {
      const partsO = o.start.split(":");
      const oStart = Number(partsO[0]) * 60 + Number(partsO[1] ?? 0);
      const oEnd = oStart + (Number(o.durationMinutes) || 30);
      if (newStartMin < oEnd && newEndMin > oStart) {
        alert("Impossible : Ce créneau chevauche un autre rendez-vous.");
        return;
      }
    }
    onItemsChange((prev) =>
      prev.map((r) => r.id === dragId ? { ...r, dateKey: columnIso, start: slotStart } : r)
    );
    setDragId(null);
    setDropKey(null);
  }

  const colCount = columns.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto [scrollbar-gutter:stable]">
        <div
          className="grid w-max min-w-full"
          style={{
            gridTemplateColumns: `72px repeat(${colCount}, minmax(168px, 1fr))`,
            gridTemplateRows: `auto repeat(${workSlots.length}, minmax(3.25rem, auto))`,
          }}
        >
          <div
            className="sticky left-0 top-0 z-[45] min-h-[3.25rem] border-b border-r border-[var(--ds-primary-border)] bg-[var(--ds-surface)] shadow-[1px_1px_0_0_rgb(241_245_249)]"
            style={{ gridColumn: 1, gridRow: 1 }}
          />
          {columns.map((col, j) => (
            <div
              key={`head-${col.iso}`}
              data-cal-head={col.iso}
              className="sticky top-0 z-[35] border-b border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-3 py-2 shadow-[0_1px_0_0_rgb(241_245_249)]"
              style={{ gridColumn: j + 2, gridRow: 1 }}
            >
              <p className="text-[10px] font-medium uppercase tracking-tight text-[var(--ds-text-muted)]">
                {col.weekdayShort}
              </p>
              <p className="text-sm font-semibold leading-tight tracking-tight text-[color:var(--ds-text)]">
                {col.dayOfMonth}
              </p>
            </div>
          ))}
          {workSlots.map((slotStart, rowIdx) => (
            <div
              key={`t-${slotStart}`}
              className="sticky left-0 z-[25] border-b border-r border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-2 py-1.5 text-right text-[11px] font-medium tabular-nums text-[var(--ds-text-muted)] shadow-[1px_0_0_0_rgb(241_245_249)]"
              style={{ gridColumn: 1, gridRow: rowIdx + 2 }}
            >
              {slotStart}
            </div>
          ))}
          {columns.map((col, j) => {
            const dayRdvs = items.filter((r) => r.dateKey === col.iso);
            return (
              <div
                key={`body-${col.iso}`}
                className="relative border-l border-[var(--ds-primary-border)]/80"
                style={{
                  gridColumn: j + 2,
                  gridRow: `2 / span ${workSlots.length}`,
                  minHeight: workSlots.length * SLOT_HEIGHT_PX,
                }}
              >
                {workSlots.map((slotStart, slotIdx) => {
                  const key = `${col.iso}-${slotStart}`;
                  const isOver = dropKey === key;
                  return (
                    <div
                      key={key}
                      className={["border-b border-[var(--ds-primary-border)]/80 bg-[var(--ds-bg)]/40 hover:bg-[var(--ds-primary-soft)]/40", isOver ? "ring-2 ring-inset ring-[var(--ds-primary-border)]/70" : ""].join(" ")}
                      style={{ position: "absolute", left: 0, right: 0, top: slotIdx * SLOT_HEIGHT_PX, height: SLOT_HEIGHT_PX, zIndex: 10 }}
                      onDragOver={(e) => { e.preventDefault(); setDropKey(key); }}
                      onDragLeave={() => setDropKey(null)}
                      onDrop={() => handleDrop(col.iso, slotStart)}
                      aria-label={`Créneau ${slotStart}`}
                    />
                  );
                })}
                {dayRdvs.map((rdv) => {
                  const calStyle = calendarRdvSurfaceStyle(rdv);
                  return (
                    <div
                      key={rdv.id}
                      draggable
                      onDragStart={() => setDragId(rdv.id)}
                      onDragEnd={() => { setDragId(null); setDropKey(null); }}
                      style={{
                        top: timeToGridTop(rdv.start, startMinutes),
                        height: durationToGridHeight(rdv.durationMinutes),
                        backgroundColor: calStyle.backgroundColor,
                        borderLeft: calStyle.borderLeft,
                      }}
                      className="absolute left-1.5 right-1.5 z-20 overflow-hidden rounded-lg p-1.5 lg:p-2 shadow-sm cursor-grab select-none active:cursor-grabbing"
                    >
                      <div className="flex min-w-0 flex-wrap items-baseline gap-1">
                        <p className="min-w-0 truncate text-xs leading-tight" style={calStyle.patientStyle}>
                          {rdv.patient}
                        </p>
                        {rdv.rdvType === "direct" && (
                          <span className="shrink-0 rounded bg-white/15 px-1 text-[9px] font-bold uppercase text-white">
                            Direct
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-[10px] leading-tight" style={calStyle.motifStyle}>
                        {rdv.soin}
                      </p>
                      <p className="mt-0.5 text-[10px] tabular-nums" style={calStyle.timeStyle}>
                        {rdv.start}
                      </p>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Vue Arbre ────────────────────────────────────────────────────────────────

function TreeView({ rdvs, currentDate }: { rdvs: Rdv[]; currentDate: Date }) {
  const dayLabel = formatDateLong(safeDate(currentDate));
  const todayRdvs = rdvs.filter((r) => r.dateKey === formatDateKey(safeDate(currentDate)));
  const matin = todayRdvs.filter((r) => Number(r.start.split(":")[0]) < 12);
  const apresmidi = todayRdvs.filter((r) => Number(r.start.split(":")[0]) >= 12);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl bg-[var(--ds-surface)] p-6 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="pointer-events-none absolute left-[19px] top-4 bottom-4 w-0.5 bg-[var(--ds-primary)]/30 lg:left-[23px]" aria-hidden />
        <div className="relative mb-4 flex shrink-0 items-center gap-6">
          <div className="flex w-10 shrink-0 justify-center">
            <span className="relative z-10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[var(--ds-primary)] text-white shadow-lg shadow-[var(--ds-primary)]/30">
              <span className="h-2 w-2 rounded-full bg-white" />
            </span>
          </div>
          <p className="text-sm font-semibold tracking-tight text-[color:var(--ds-text)]">
            {dayLabel}
          </p>
          <span className="rounded-full bg-[var(--ds-primary-soft)] px-2.5 py-0.5 text-[11px] font-medium text-[color:var(--ds-primary)]">
            {todayRdvs.length} RDV
          </span>
        </div>
        <div className="mt-2 min-h-0 flex-1 space-y-8 overflow-y-auto pr-3 scrollbar-thin scrollbar-thumb-[var(--ds-primary-border)] scrollbar-track-[var(--ds-primary-soft)]">
          <Branch label="Matin" items={matin} />
          <Branch label="Après-midi" items={apresmidi} />
        </div>
      </div>
    </div>
  );
}

// ─── Helpers header ───────────────────────────────────────────────────────────

function formatSlidingRange(centerDate: Date, count: number): string {
  const cols = buildSlidingDayColumns(safeDate(centerDate));
  const first = cols[0];
  const last = cols[cols.length - 1];
  const d0 = safeDate(new Date(`${first.iso}T12:00:00`));
  const d1 = safeDate(new Date(`${last.iso}T12:00:00`));
  const a = d0.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
  const b = d1.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  return `${a} → ${b} — ${count} rendez-vous`;
}

// ─── Page principale ──────────────────────────────────────────────────────────

function PlanningPageContent() {
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);

  // "liste" est la vue par défaut (remplace "calendar" comme vue principale)
  const [view, setView] = useState<ViewMode>("liste");

  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [treeViewDate, setTreeViewDate] = useState<Date>(() => new Date());
  const [listSelectedDay, setListSelectedDay] = useState<string>(() =>
    formatDateKey(new Date())
  );
  const [isNewRdvModalOpen, setIsNewRdvModalOpen] = useState(false);
  const [newRdvDefaultPatientName, setNewRdvDefaultPatientName] = useState("");
  const [appointments, setAppointments] = useState<Rdv[]>(INITIAL_APPOINTMENTS);
  const setWindowCenter = setCurrentDate;
  const [scrollAnchorIso, setScrollAnchorIso] = useState<string | null>(null);
  const handleScrollAnchorConsumed = useCallback(() => setScrollAnchorIso(null), []);

  useEffect(() => {
    setMounted(true);
    setAppointments(ensureAppointmentsSeeded(INITIAL_APPOINTMENTS));
  }, []);

  useEffect(() => {
    const patientId = searchParams.get("patientId");
    const patientName = searchParams.get("patientName");
    void patientId;
    if (patientName) setNewRdvDefaultPatientName(patientName);
    else setNewRdvDefaultPatientName("");
    if (searchParams.get("newRdv") === "true") setIsNewRdvModalOpen(true);
  }, [searchParams]);

  useEffect(() => {
    if (!mounted) return;
    writeAppointmentsToStorage(appointments);
    appointments.forEach((a) => {
      syncAppointmentToDBAction({
        id: a.id,
        patientId: a.patientId,
        patientName: a.patient,
        dateKey: a.dateKey,
        startTime: a.start,
        durationMinutes: a.durationMinutes,
        soin: a.soin,
        rdvType: a.rdvType,
        status: a.status,
        urgence: a.urgence,
      }).catch(console.error);
    });
  }, [mounted, appointments]);

  const slidingColumns = buildSlidingDayColumns(currentDate);

  function goPrev() {
    if (view === "calendar") {
      setCurrentDate((d) => { const n = new Date(d); n.setDate(n.getDate() - 1); return n; });
    } else if (view === "tree") {
      setTreeViewDate((d) => { const n = new Date(d); n.setDate(n.getDate() - 1); return n; });
    } else {
      // vue liste : décale le centre d'un jour, sélectionne le jour précédent
      setCurrentDate((d) => { const n = new Date(d); n.setDate(n.getDate() - 1); return n; });
      setListSelectedDay((prev) => {
        const d = new Date(`${prev}T12:00:00`);
        d.setDate(d.getDate() - 1);
        return formatDateKey(d);
      });
    }
  }

  function goNext() {
    if (view === "calendar") {
      setCurrentDate((d) => { const n = new Date(d); n.setDate(n.getDate() + 1); return n; });
    } else if (view === "tree") {
      setTreeViewDate((d) => { const n = new Date(d); n.setDate(n.getDate() + 1); return n; });
    } else {
      setCurrentDate((d) => { const n = new Date(d); n.setDate(n.getDate() + 1); return n; });
      setListSelectedDay((prev) => {
        const d = new Date(`${prev}T12:00:00`);
        d.setDate(d.getDate() + 1);
        return formatDateKey(d);
      });
    }
  }

  function goToday() {
    const now = new Date();
    const todayIso = formatDateKey(now);
    setCurrentDate(now);
    setTreeViewDate(now);
    setListSelectedDay(todayIso);
  }

  // Date affichée dans le picker selon la vue active
  const activeDateForPicker =
    view === "tree"
      ? treeViewDate
      : view === "liste"
        ? safeDate(new Date(`${listSelectedDay}T12:00:00`))
        : currentDate;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* ── Header ── */}
      <div className="mb-6 flex shrink-0 flex-col gap-4 border-b border-[var(--ds-primary-border)]/50 py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2 sm:flex-nowrap sm:gap-x-4">
          <h1 className="shrink-0 text-3xl font-bold leading-none tracking-tight text-[var(--ds-text)]">
            Planning
          </h1>
          <p className="ml-3 hidden min-w-0 truncate text-base text-[var(--ds-text-muted)] sm:block">
            {formatSlidingRange(currentDate, appointments.length)}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={goPrev}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--ds-primary-border)]/60 bg-[var(--ds-surface)]/80 text-lg shadow-sm backdrop-blur-md transition-colors hover:bg-[var(--ds-bg)]"
              aria-label="Précédent"
            >
              <ChevronLeft className="h-3.5 w-3.5 text-[var(--ds-text-muted)]" />
            </button>
            <label className="flex h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--ds-primary-border)]/60 bg-[var(--ds-surface)]/80 px-4 py-2.5 shadow-sm backdrop-blur-md transition-colors hover:bg-[var(--ds-bg)]">
              <span className="text-sm leading-none" aria-hidden>📅</span>
              <input
                type="date"
                value={formatDateKey(activeDateForPicker)}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  const [y, m, d] = v.split("-").map(Number);
                  if (!y || !m || !d) return;
                  const nextDate = new Date(y, m - 1, d);
                  if (Number.isNaN(nextDate.getTime())) return;
                  if (view === "calendar") {
                    setCurrentDate(nextDate);
                  } else if (view === "tree") {
                    setTreeViewDate(nextDate);
                  } else {
                    setCurrentDate(nextDate);
                    setListSelectedDay(formatDateKey(nextDate));
                  }
                }}
                className="h-11 min-w-[120px] border-0 bg-transparent px-4 py-2.5 text-base font-medium text-[color:var(--ds-text)] outline-none [color-scheme:light]"
              />
            </label>
            <button
              type="button"
              onClick={goNext}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--ds-primary-border)]/60 bg-[var(--ds-surface)]/80 text-lg shadow-sm backdrop-blur-md transition-colors hover:bg-[var(--ds-bg)]"
              aria-label="Suivant"
            >
              <ChevronRight className="h-3.5 w-3.5 text-[var(--ds-text-muted)]" />
            </button>
            <button
              type="button"
              onClick={goToday}
              className="h-11 rounded-lg border border-[var(--ds-primary-border)]/60 bg-[var(--ds-surface)]/80 px-4 py-2.5 text-base font-medium text-[color:var(--ds-text)] shadow-sm backdrop-blur-md transition-colors hover:bg-[var(--ds-bg)]"
            >
              Aujourd&apos;hui
            </button>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {/* Toggle 3 vues */}
          <div className="flex rounded-xl border border-[var(--ds-primary-border)]/60 bg-[var(--ds-surface)] p-0.5 shadow-sm backdrop-blur-md">
            {/* Vue Liste — visible sur tous les écrans, vue par défaut */}
            <button
              type="button"
              onClick={() => {
                setListSelectedDay(formatDateKey(
                  view === "tree" ? treeViewDate : currentDate
                ));
                setView("liste");
              }}
              className={[
                "flex h-11 items-center gap-1 rounded-lg px-4 py-2.5 text-base font-medium transition-all",
                view === "liste"
                  ? "bg-[color:var(--ds-primary)] text-white shadow-sm"
                  : "text-[var(--ds-text-muted)] hover:text-[var(--ds-text)]",
              ].join(" ")}
              aria-label="Vue liste"
            >
              <List className="h-3 w-3" />
              <span className="hidden sm:inline">Liste</span>
            </button>

            {/* Vue Calendrier — desktop uniquement */}
            <button
              type="button"
              onClick={() => {
                setCurrentDate(
                  view === "tree" ? treeViewDate
                  : view === "liste" ? safeDate(new Date(`${listSelectedDay}T12:00:00`))
                  : currentDate
                );
                setView("calendar");
              }}
              className={[
                "hidden h-11 items-center gap-1 rounded-lg px-4 py-2.5 text-base font-medium transition-all lg:flex",
                view === "calendar"
                  ? "bg-[color:var(--ds-primary)] text-white shadow-sm"
                  : "text-[var(--ds-text-muted)] hover:text-[var(--ds-text)]",
              ].join(" ")}
              aria-label="Vue calendrier"
            >
              <CalendarDays className="h-3 w-3" />
              <span>Calendrier</span>
            </button>

            {/* Vue Arbre */}
            <button
              type="button"
              onClick={() => {
                setTreeViewDate(
                  view === "calendar" ? currentDate
                  : view === "liste" ? safeDate(new Date(`${listSelectedDay}T12:00:00`))
                  : treeViewDate
                );
                setView("tree");
              }}
              className={[
                "flex h-11 items-center gap-1 rounded-lg px-4 py-2.5 text-base font-medium transition-all",
                view === "tree"
                  ? "bg-[color:var(--ds-primary)] text-white shadow-sm"
                  : "text-[var(--ds-text-muted)] hover:text-[var(--ds-text)]",
              ].join(" ")}
              aria-label="Vue arbre"
            >
              <GitBranch className="h-3 w-3" />
              <span className="hidden sm:inline">Vue Arbre</span>
            </button>
          </div>

          <AnimatedButton
            onClick={() => setIsNewRdvModalOpen(true)}
            className="h-11 px-5 py-2.5 text-base font-semibold"
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            Nouveau RDV
          </AnimatedButton>
        </div>
      </div>

      {/* ── Modal ── */}
      <NewAppointmentModal
        open={isNewRdvModalOpen}
        onClose={() => setIsNewRdvModalOpen(false)}
        defaultPatientName={newRdvDefaultPatientName}
        onConfirm={(payload: NewAppointmentPayload) => {
          const p = payload;
          const rawDate = p.date?.trim() ?? "";
          const dateKeyFinal =
            rawDate && isValidDateKeyString(rawDate)
              ? rawDate
              : formatDateKeyLocal(new Date());
          const timeNorm = p.time.length >= 5 ? p.time.slice(0, 5) : p.time;
          const newRdv: Rdv = {
            id: `rdv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            dateKey: dateKeyFinal,
            start: timeNorm,
            durationMinutes: Number(p.dureeMinutes) || 30,
            patient: p.patient,
            soin: p.motifs.length ? p.motifs.join(", ") : "Consultation",
            urgence: p.motifs.some((m) => m.toLowerCase().includes("urgence")),
            rdvType: "planned",
          };
          setAppointments((prev) => [...prev, newRdv]);
          const [y, m, d] = dateKeyFinal.split("-").map(Number);
          const center = new Date(y, m - 1, d);
          if (dateKeyFinal && !isNaN(center.getTime())) {
            setWindowCenter(center);
            // Sync la sélection liste aussi
            setListSelectedDay(dateKeyFinal);
          } else {
            setWindowCenter(new Date());
          }
          setScrollAnchorIso(dateKeyFinal);
          // Bascule vers la vue liste pour voir le nouveau RDV
          if (view !== "calendar") setView("liste");
        }}
      />

      {/* ── Contenu ── */}
      <div className="mt-2 flex min-h-0 flex-1 flex-col overflow-hidden">

        {/* Vue Liste — visible sur tous les écrans */}
        {view === "liste" && (
          <ListView
            rdvs={appointments}
            centerDate={currentDate}
            selectedDayIso={listSelectedDay}
            onDaySelect={(iso) => {
              setListSelectedDay(iso);
              setCurrentDate(safeDate(new Date(`${iso}T12:00:00`)));
            }}
          />
        )}

        {/* Vue Calendrier — desktop uniquement */}
        {view === "calendar" && (
          <div className="hidden min-h-0 flex-1 flex-col overflow-hidden lg:flex lg:flex-col">
            <CalendarView
              items={appointments}
              onItemsChange={setAppointments}
              columns={slidingColumns}
              scrollAnchorIso={scrollAnchorIso}
              onScrollAnchorConsumed={handleScrollAnchorConsumed}
            />
          </div>
        )}
        {/* Fallback mobile sur vue arbre si calendrier demandé */}
        {view === "calendar" && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:hidden">
            <TreeView rdvs={appointments} currentDate={treeViewDate} />
          </div>
        )}

        {/* Vue Arbre */}
        {view === "tree" && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <TreeView rdvs={appointments} currentDate={treeViewDate} />
          </div>
        )}

      </div>
    </div>
  );
}

export default function PlanningPage() {
  return (
    <Suspense fallback={null}>
      <PlanningPageContent />
    </Suspense>
  );
}
