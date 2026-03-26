"use client";

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { CalendarDays, ChevronLeft, ChevronRight, GitBranch, Plus } from "lucide-react";
import {
  NewAppointmentModal,
  type NewAppointmentPayload,
} from "@/components/planning/NewAppointmentModal";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Rdv {
  id: string;
  /** YYYY-MM-DD (local) — jour du créneau */
  dateKey: string;
  start: string;
  durationMinutes: number;
  patient: string;
  soin: string;
  urgence?: boolean;
}

type ViewMode = "calendar" | "tree";

// ─── Helpers date ─────────────────────────────────────────────────────────────

function formatDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatDateLong(d: Date): string {
  return d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Clé locale YYYY-MM-DD (sans UTC). */
function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const WEEK_DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

type SlidingDayColumn = {
  iso: string;
  weekdayShort: string;
  dayOfMonth: number;
};

/**
 * 14 jours glissants : 7 jours avant, la date centrale, 6 jours après.
 */
function buildSlidingDayColumns(centerDate: Date): SlidingDayColumn[] {
  const columns: SlidingDayColumn[] = [];
  const c = new Date(centerDate);
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

// ─── Données fictives ─────────────────────────────────────────────────────────

function mkDateKey(offsetDays: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return formatDateKey(d);
}

const INITIAL_APPOINTMENTS: Rdv[] = [
  { id: "1", dateKey: mkDateKey(-2), start: "08:30", durationMinutes: 30,  patient: "Marie Dupont",    soin: "Détartrage"    },
  { id: "2", dateKey: mkDateKey(-2), start: "10:00", durationMinutes: 45,  patient: "Jean Martin",     soin: "Extraction",   urgence: true },
  { id: "3", dateKey: mkDateKey(-1), start: "11:30", durationMinutes: 60,  patient: "Isabelle Roux",   soin: "Couronne"      },
  { id: "4", dateKey: mkDateKey(0), start: "14:00", durationMinutes: 90,  patient: "Sophie Bernard",  soin: "Blanchiment"   },
  { id: "5", dateKey: mkDateKey(0), start: "09:00", durationMinutes: 30,  patient: "Pierre Leroy",    soin: "Détartrage"    },
  { id: "6", dateKey: mkDateKey(1), start: "14:30", durationMinutes: 45,  patient: "Lucas Garnier",   soin: "Consultation"  },
  { id: "7", dateKey: mkDateKey(2), start: "10:30", durationMinutes: 60,  patient: "Claire Moreau",   soin: "Implant",      urgence: true },
  { id: "8", dateKey: mkDateKey(3), start: "09:30", durationMinutes: 30,  patient: "Thomas Petit",    soin: "Blanchiment"   },
  { id: "9", dateKey: mkDateKey(4), start: "11:00", durationMinutes: 45,  patient: "Marie Dupont",    soin: "Contrôle"      },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rdvColor(rdv: Rdv) {
  return rdv.urgence
    ? { bg: "bg-red-50", text: "text-red-600", dot: "bg-red-400", border: "border-red-200/60" }
    : { bg: "bg-[color:var(--ds-primary-soft)]/60", text: "text-[color:var(--ds-primary)]", dot: "bg-cyan-400", border: "border-cyan-200/40" };
}

function actBg(soin: string) {
  const s = soin.toLowerCase();
  if (s.includes("détartr")) return "bg-[color:var(--ds-primary-soft)]/60";
  if (s.includes("extract")) return "bg-red-50/70";
  if (s.includes("couronne") || s.includes("implant") || s.includes("proth"))
    return "bg-amber-50/80";
  if (s.includes("blanch")) return "bg-sky-50/70";
  return "bg-slate-50/70";
}

/** Grille horaire (logique d’affichage, pas de formatage de date). */
const GRID_STEP = 30;
const SLOT_HEIGHT_PX = 52;
const HOUR_COL_WIDTH_PX = 72;

function durationToGridHeight(durationMinutes: number | string): number {
  const mins = Number(durationMinutes) || 30;
  return (mins / GRID_STEP) * SLOT_HEIGHT_PX;
}

function timeToGridTop(start: string, workStartMinutes: number): number {
  const parts = start.split(":");
  const startMin =
    Number(parts[0]) * 60 + Number(parts[1] ?? 0);
  const rel = startMin - workStartMinutes;
  return (rel / GRID_STEP) * SLOT_HEIGHT_PX;
}

function scrollDayColumnIntoView(
  scrollRoot: HTMLElement,
  columnHeaderEl: HTMLElement
): void {
  const rect = columnHeaderEl.getBoundingClientRect();
  const rootRect = scrollRoot.getBoundingClientRect();
  const left =
    rect.left -
    rootRect.left +
    scrollRoot.scrollLeft -
    HOUR_COL_WIDTH_PX;
  scrollRoot.scrollTo({
    left: Math.max(0, left),
    behavior: "smooth",
  });
}

function Branch({
  label,
  items,
}: {
  label: string;
  items: Rdv[];
}) {
  return (
    <div className="relative mt-4 pl-12">
      {/* Tronc */}
      <div className="absolute left-3 top-0 bottom-0 w-px bg-gradient-to-b from-cyan-300/60 via-teal-300/40 to-transparent" />

      {/* Label branche */}
      <div className="relative mb-4 flex items-center gap-6">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-teal-400 shadow-[0_0_12px_rgba(34,211,238,0.35)]">
          <span className="h-1.5 w-1.5 rounded-full bg-white" />
        </span>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          {label}
        </h3>
      </div>

      {/* Feuilles (RDV) */}
      <div className="space-y-3 pl-4">
        {items.length === 0 && (
          <p className="text-xs text-slate-400">Aucun rendez-vous</p>
        )}
        {items.map((rdv) => {
          const c = rdvColor(rdv);
          return (
            <div key={rdv.id} className="relative flex items-start gap-4">
              {/* Branche horizontale */}
              <div className="absolute -left-4 top-4 h-px w-4 bg-gradient-to-r from-cyan-300/50 to-transparent" />

              {/* Point lumineux */}
              <span
                className={[
                  "mt-3.5 h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white shadow-[0_0_8px_rgba(34,211,238,0.5)]",
                  c.dot,
                ].join(" ")}
              />

              {/* Carte feuille */}
              <div
                className={[
                  "flex-1 rounded-2xl border px-4 py-3",
                  "shadow-[0_8px_30px_rgba(0,0,0,0.04)] backdrop-blur-sm",
                  actBg(rdv.soin),
                  c.border,
                ].join(" ")}
              >
                {/* Heure en premier, reliée visuellement à la branche */}
                <div className="flex items-center gap-3">
                  <p className="text-sm font-semibold tracking-tight text-slate-700">
                    {rdv.start}
                  </p>
                  <div className="h-px flex-1 rounded-full bg-slate-200/70" />
                </div>

                <div className="mt-1 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold tracking-tight text-[color:var(--ds-text)]">
                      {rdv.patient}
                    </p>
                    <p className={`mt-0.5 text-[11px] font-medium ${c.text}`}>
                      {rdv.soin}
                    </p>
                  </div>
                  <p className="mt-0.5 text-[10px] text-slate-400">
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

// ─── Vue 1 : Calendrier hebdomadaire ─────────────────────────────────────────

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
  // Colonnes de jours + cases horaires fixes (avec zones de drop)
  const scrollRef = useRef<HTMLDivElement>(null);
  const todayScrollDoneRef = useRef(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (todayScrollDoneRef.current) return;
    const scrollRoot = scrollRef.current;
    if (!scrollRoot) return;
    const todayIso = formatDateKey(new Date());
    const target = scrollRoot.querySelector<HTMLElement>(
      `[data-cal-head="${todayIso}"]`
    );
    if (!target) {
      todayScrollDoneRef.current = true;
      return;
    }
    scrollDayColumnIntoView(scrollRoot, target);
    todayScrollDoneRef.current = true;
  }, [columns]);

  useLayoutEffect(() => {
    if (!scrollAnchorIso) return;
    const scrollRoot = scrollRef.current;
    if (!scrollRoot) return;
    const target = scrollRoot.querySelector<HTMLElement>(
      `[data-cal-head="${scrollAnchorIso}"]`
    );
    if (target) {
      scrollDayColumnIntoView(scrollRoot, target);
    }
    onScrollAnchorConsumed();
  }, [scrollAnchorIso, columns, onScrollAnchorConsumed]);

  const stepMinutes = 30;
  const startMinutes = 8 * 60; // 08:00
  const endMinutes = 18 * 60; // 18:00

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
    const newStartMin =
      Number(partsNew[0]) * 60 + Number(partsNew[1] ?? 0);
    const dur = Number(moved.durationMinutes) || 30;
    const newEndMin = newStartMin + dur;

    const others = items.filter(
      (r) => r.id !== dragId && r.dateKey === columnIso
    );
    for (const o of others) {
      const partsO = o.start.split(":");
      const oStart =
        Number(partsO[0]) * 60 + Number(partsO[1] ?? 0);
      const oEnd = oStart + (Number(o.durationMinutes) || 30);
      if (newStartMin < oEnd && newEndMin > oStart) {
        alert("Impossible : Ce créneau chevauche un autre rendez-vous.");
        return;
      }
    }

    onItemsChange((prev) =>
      prev.map((r) =>
        r.id === dragId ? { ...r, dateKey: columnIso, start: slotStart } : r
      )
    );
    setDragId(null);
    setDropKey(null);
  }

  const colCount = columns.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto [scrollbar-gutter:stable]"
      >
        <div
          className="grid w-max min-w-full"
          style={{
            gridTemplateColumns: `72px repeat(${colCount}, minmax(168px, 1fr))`,
            gridTemplateRows: `auto repeat(${workSlots.length}, minmax(3.25rem, auto))`,
          }}
        >
          {/* Coin supérieur gauche : sticky horizontal + vertical */}
          <div
            className="sticky left-0 top-0 z-[45] min-h-[3.25rem] border-b border-r border-slate-100 bg-white shadow-[1px_1px_0_0_rgb(241_245_249)]"
            style={{ gridColumn: 1, gridRow: 1 }}
          />

          {columns.map((col, j) => (
            <div
              key={`head-${col.iso}`}
              data-cal-head={col.iso}
              className="sticky top-0 z-[35] border-b border-slate-100 bg-white px-3 py-2 shadow-[0_1px_0_0_rgb(241_245_249)]"
              style={{ gridColumn: j + 2, gridRow: 1 }}
            >
              <p className="text-[10px] font-medium uppercase tracking-tight text-slate-400">
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
              className="sticky left-0 z-[25] border-b border-r border-slate-100 bg-white px-2 py-1.5 text-right text-[11px] font-medium tabular-nums text-slate-500 shadow-[1px_0_0_0_rgb(241_245_249)]"
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
                className="relative border-l border-slate-100/80"
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
                      className={[
                        "border-b border-slate-100/80 bg-slate-50/40 hover:bg-slate-100/40",
                        isOver ? "ring-2 ring-inset ring-sky-200/70" : "",
                      ].join(" ")}
                      style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        top: slotIdx * SLOT_HEIGHT_PX,
                        height: SLOT_HEIGHT_PX,
                        zIndex: 10,
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDropKey(key);
                      }}
                      onDragLeave={() => {
                        setDropKey(null);
                      }}
                      onDrop={() => handleDrop(col.iso, slotStart)}
                      aria-label={`Créneau ${slotStart}`}
                    />
                  );
                })}
                {dayRdvs.map((rdv) => (
                  <div
                    key={rdv.id}
                    draggable
                    onDragStart={() => setDragId(rdv.id)}
                    onDragEnd={() => {
                      setDragId(null);
                      setDropKey(null);
                    }}
                    style={{
                      top: timeToGridTop(rdv.start, startMinutes),
                      height: durationToGridHeight(rdv.durationMinutes),
                    }}
                    className={[
                      "absolute left-1.5 right-1.5 z-20 overflow-hidden rounded-lg border-l-4 p-1.5 shadow-sm",
                      rdv.urgence
                        ? "border-red-500 bg-red-50 text-red-600"
                        : "border-sky-500 bg-sky-50 text-sky-900",
                      "cursor-grab select-none active:cursor-grabbing",
                    ].join(" ")}
                  >
                    <p className="text-xs font-semibold leading-tight">
                      {rdv.patient} — {rdv.soin}
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-600/80">
                      {rdv.start}
                    </p>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Vue 2 : Timeline Arbre ───────────────────────────────────────────────────

function TreeView({ rdvs, currentDate }: { rdvs: Rdv[]; currentDate: Date }) {
  const dayLabel = formatDateLong(currentDate);
  const todayRdvs = rdvs.filter(
    (r) => r.dateKey === formatDateKey(currentDate)
  );
  const matin = todayRdvs.filter((r) => Number(r.start.split(":")[0]) < 12);
  const apresmidi = todayRdvs.filter((r) => Number(r.start.split(":")[0]) >= 12);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl bg-white p-6 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
      {/* Tronc principal */}
      <div className="relative flex min-h-0 flex-1 flex-col pl-12">
        <div className="absolute left-3 top-0 bottom-0 w-0.5 rounded-full bg-gradient-to-b from-cyan-300/80 via-teal-200/50 to-transparent" />
        <div className="relative mb-4 flex shrink-0 items-center gap-6">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-teal-500 shadow-[0_0_18px_rgba(8,145,178,0.35)]">
            <span className="h-2 w-2 rounded-full bg-white" />
          </span>
          <p className="text-sm font-semibold tracking-tight text-[color:var(--ds-text)]">
            {dayLabel}
          </p>
          <span className="rounded-full bg-cyan-50 px-2.5 py-0.5 text-[11px] font-medium text-[color:var(--ds-primary)]">
            {todayRdvs.length} RDV
          </span>
        </div>

        <div className="mt-2 min-h-0 flex-1 space-y-8 overflow-y-auto pl-4 pr-3 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-slate-100">
          <Branch label="Matin" items={matin} />
          <Branch label="Après-midi" items={apresmidi} />
        </div>
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

function formatSlidingRange(centerDate: Date): string {
  const cols = buildSlidingDayColumns(centerDate);
  const first = cols[0];
  const last = cols[cols.length - 1];
  const d0 = new Date(`${first.iso}T12:00:00`);
  const d1 = new Date(`${last.iso}T12:00:00`);
  const a = d0.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const b = d1.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return `${a} → ${b} — ${INITIAL_APPOINTMENTS.length} rendez-vous`;
}

export default function PlanningPage() {
  const [view, setView] = useState<ViewMode>("calendar");
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [treeViewDate, setTreeViewDate] = useState<Date>(() => new Date());
  const [isNewRdvModalOpen, setIsNewRdvModalOpen] = useState(false);
  const [appointments, setAppointments] = useState<Rdv[]>(() => [
    ...INITIAL_APPOINTMENTS,
  ]);
  const setWindowCenter = setCurrentDate;
  const [scrollAnchorIso, setScrollAnchorIso] = useState<string | null>(null);
  const handleScrollAnchorConsumed = useCallback(() => {
    setScrollAnchorIso(null);
  }, []);

  const slidingColumns = buildSlidingDayColumns(currentDate);

  function goPrev() {
    if (view === "calendar") {
      setCurrentDate((d) => {
        const next = new Date(d);
        next.setDate(next.getDate() - 1);
        return next;
      });
      return;
    }

    setTreeViewDate((d) => {
      const next = new Date(d);
      next.setDate(next.getDate() - 1);
      return next;
    });
  }
  function goNext() {
    if (view === "calendar") {
      setCurrentDate((d) => {
        const next = new Date(d);
        next.setDate(next.getDate() + 1);
        return next;
      });
      return;
    }

    setTreeViewDate((d) => {
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      return next;
    });
  }
  function goToday() {
    const now = new Date();
    if (view === "calendar") {
      setCurrentDate(now);
      return;
    }

    setTreeViewDate(now);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Header slim : une ligne, padding vertical serré */}
      <div className="flex shrink-0 flex-col gap-2 border-b border-slate-200/50 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2 sm:flex-nowrap sm:gap-x-4">
          <h1 className="shrink-0 text-xl font-semibold leading-none tracking-tight text-[color:var(--ds-text)]">
            Planning
          </h1>
          <p className="hidden min-w-0 truncate text-[11px] text-slate-500 sm:block">
            {formatSlidingRange(currentDate).replace(
              /— \d+ rendez-vous$/,
              `— ${appointments.length} rendez-vous`
            )}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={goPrev}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200/60 bg-white/80 shadow-sm backdrop-blur-md transition-colors hover:bg-slate-50 hover:border-slate-300/60"
              aria-label="Jour précédent"
            >
              <ChevronLeft className="h-3.5 w-3.5 text-slate-600" />
            </button>
            <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200/60 bg-white/80 px-2 py-1 shadow-sm backdrop-blur-md transition-colors hover:bg-slate-50 hover:border-slate-300/60">
              <span className="text-sm leading-none" aria-hidden>
                📅
              </span>
              <input
                type="date"
                value={formatDateInput(view === "tree" ? treeViewDate : currentDate)}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) {
                    const [y, m, d] = v.split("-").map(Number);
                    const nextDate = new Date(y, m - 1, d);
                    if (view === "calendar") {
                      setCurrentDate(nextDate);
                      return;
                    }

                    setTreeViewDate(nextDate);
                  }
                }}
                className="min-w-[120px] border-0 bg-transparent text-xs font-medium text-[color:var(--ds-text)] outline-none [color-scheme:light]"
              />
            </label>
            <button
              type="button"
              onClick={goNext}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200/60 bg-white/80 shadow-sm backdrop-blur-md transition-colors hover:bg-slate-50 hover:border-slate-300/60"
              aria-label="Jour suivant"
            >
              <ChevronRight className="h-3.5 w-3.5 text-slate-600" />
            </button>
            <button
              type="button"
              onClick={goToday}
              className="rounded-lg border border-slate-200/60 bg-white/80 px-2 py-1 text-[11px] font-medium text-[color:var(--ds-text)] shadow-sm backdrop-blur-md transition-colors hover:bg-slate-50 hover:border-slate-300/60"
            >
              Aujourd&apos;hui
            </button>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-slate-200/60 bg-white p-0.5 shadow-sm backdrop-blur-md">
            <button
              type="button"
              onClick={() => {
                setCurrentDate(treeViewDate);
                setView("calendar");
              }}
              className={[
                "flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-all",
                view === "calendar"
                  ? "bg-[color:var(--ds-primary)] text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-700",
              ].join(" ")}
            >
              <CalendarDays className="h-3 w-3" />
              Calendrier
            </button>
            <button
              type="button"
              onClick={() => {
                setTreeViewDate(currentDate);
                setView("tree");
              }}
              className={[
                "flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-all",
                view === "tree"
                  ? "bg-[color:var(--ds-primary)] text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-700",
              ].join(" ")}
            >
              <GitBranch className="h-3 w-3" />
              Vue Arbre
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsNewRdvModalOpen(true)}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[color:var(--ds-primary)] px-3 py-1.5 text-[11px] font-medium text-white shadow-sm transition-colors hover:opacity-90"
          >
            <Plus className="h-3 w-3" />
            Nouveau RDV
          </button>
        </div>
      </div>

      <NewAppointmentModal
        open={isNewRdvModalOpen}
        onClose={() => setIsNewRdvModalOpen(false)}
        onConfirm={(payload: NewAppointmentPayload) => {
          const p = payload;
          const timeNorm =
            p.time.length >= 5 ? p.time.slice(0, 5) : p.time;
          const newRdv: Rdv = {
            id: `rdv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            dateKey: p.date,
            start: timeNorm,
            durationMinutes: Number(p.dureeMinutes) || 30,
            patient: p.patient,
            soin: p.motifs.length ? p.motifs.join(", ") : "Consultation",
            urgence: p.motifs.some((m) =>
              m.toLowerCase().includes("urgence")
            ),
          };
          setAppointments((prev) => [...prev, newRdv]);
          const [y, m, d] = p.date.split("-").map(Number);
          setWindowCenter(new Date(y, m - 1, d));
          setScrollAnchorIso(p.date);
        }}
      />

      {/* Contenu : occupe l’espace restant + scroll interne */}
      <div className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden">
        {view === "calendar" ? (
          <CalendarView
            items={appointments}
            onItemsChange={setAppointments}
            columns={slidingColumns}
            scrollAnchorIso={scrollAnchorIso}
            onScrollAnchorConsumed={handleScrollAnchorConsumed}
          />
        ) : (
          <TreeView rdvs={appointments} currentDate={treeViewDate} />
        )}
      </div>
    </div>
  );
}
