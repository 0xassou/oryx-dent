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
import { CalendarDays, ChevronLeft, ChevronRight, GitBranch, Plus } from "lucide-react";
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

type ViewMode = "calendar" | "tree";

// ─── Helpers date ─────────────────────────────────────────────────────────────

function formatDateLong(d: Date): string {
  return d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Clé locale YYYY-MM-DD (sans UTC), tolère une Date invalide. */
function formatDateKey(d: Date): string {
  return formatDateKeyLocal(safeDate(d));
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rdvColor(rdv: Rdv) {
  if (rdv.rdvType === "direct") {
    return {
      bg: "bg-violet-50",
      text: "text-violet-700",
      dot: "bg-violet-500",
      border: "border-violet-200/70",
    };
  }
  return rdv.urgence
    ? { bg: "bg-red-50", text: "text-red-600", dot: "bg-red-400", border: "border-red-200/60" }
    : { bg: "bg-[color:var(--ds-primary-soft)]/60", text: "text-[color:var(--ds-primary)]", dot: "bg-[var(--ds-primary)]", border: "border-[var(--ds-primary-border)]/40" };
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

/** Fond + bordure gauche des blocs RDV (vue calendrier) — contraste renforcé. */
function calendarRdvSurfaceStyle(rdv: Rdv): {
  backgroundColor: string;
  borderLeft: string;
  patientStyle: CSSProperties;
  timeStyle: CSSProperties;
  motifStyle: CSSProperties;
} {
  const text = {
    patientStyle: {
      color: "#ffffff",
      fontWeight: 700,
      textShadow: "0 1px 2px rgba(0,0,0,0.3)",
    } satisfies CSSProperties,
    timeStyle: {
      color: "rgba(255,255,255,0.95)",
    } satisfies CSSProperties,
    motifStyle: {
      color: "rgba(255,255,255,0.9)",
      fontWeight: 600,
    } satisfies CSSProperties,
  };
  if (rdv.urgence) {
    return {
      ...text,
      backgroundColor: "rgba(239, 68, 68, 0.75)",
      borderLeft: "3px solid rgba(239, 68, 68, 1)",
    };
  }
  return {
    ...text,
    backgroundColor: "rgba(124, 58, 237, 0.75)",
    borderLeft: "3px solid rgba(124, 58, 237, 1)",
  };
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
    <div className="relative mt-4">
      {/* Label branche — niveau 2 (+24px) */}
      <div className="relative mb-4 ml-6 flex items-center gap-6">
        <div className="flex w-10 shrink-0 justify-center">
          <span className="relative z-10 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[var(--ds-primary)]/70" />
        </div>
        <h3 className="text-xs font-bold tracking-widest text-[var(--ds-primary)]/70">
          {label}
        </h3>
      </div>

      {/* Feuilles (RDV) — niveau 3 (+48px) */}
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
                    <p className={`mt-0.5 text-[11px] font-medium ${c.text}`}>
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
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
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
                      className={[
                        "border-b border-[var(--ds-primary-border)]/80 bg-[var(--ds-bg)]/40 hover:bg-[var(--ds-primary-soft)]/40",
                        isOver ? "ring-2 ring-inset ring-[var(--ds-primary-border)]/70" : "",
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
                {dayRdvs.map((rdv) => {
                  const calStyle = calendarRdvSurfaceStyle(rdv);
                  return (
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
                        backgroundColor: calStyle.backgroundColor,
                        borderLeft: calStyle.borderLeft,
                      }}
                      className={[
                        "absolute left-1.5 right-1.5 z-20 overflow-hidden rounded-lg p-1.5 lg:p-2 shadow-sm",
                        "cursor-grab select-none active:cursor-grabbing",
                      ].join(" ")}
                    >
                      <div className="flex min-w-0 flex-wrap items-baseline gap-1">
                        <p
                          className="min-w-0 truncate text-xs leading-tight"
                          style={calStyle.patientStyle}
                        >
                          {rdv.patient}
                        </p>
                        {rdv.rdvType === "direct" ? (
                          <span className="shrink-0 rounded bg-white/15 px-1 text-[9px] font-bold uppercase text-white">
                            Direct
                          </span>
                        ) : null}
                      </div>
                      <p
                        className="mt-0.5 truncate text-[10px] leading-tight"
                        style={calStyle.motifStyle}
                      >
                        {rdv.soin}
                      </p>
                      <p
                        className="mt-0.5 text-[10px] tabular-nums"
                        style={calStyle.timeStyle}
                      >
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

// ─── Vue 2 : Timeline Arbre ───────────────────────────────────────────────────

function TreeView({ rdvs, currentDate }: { rdvs: Rdv[]; currentDate: Date }) {
  const dayLabel = formatDateLong(safeDate(currentDate));
  const todayRdvs = rdvs.filter(
    (r) => r.dateKey === formatDateKey(safeDate(currentDate)),
  );
  const matin = todayRdvs.filter((r) => Number(r.start.split(":")[0]) < 12);
  const apresmidi = todayRdvs.filter((r) => Number(r.start.split(":")[0]) >= 12);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl bg-[var(--ds-surface)] p-6 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          className="pointer-events-none absolute left-[19px] top-4 bottom-4 w-0.5 bg-[var(--ds-primary)]/30 lg:left-[23px]"
          aria-hidden
        />

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

// ─── Page principale ──────────────────────────────────────────────────────────

function formatSlidingRange(centerDate: Date): string {
  const cols = buildSlidingDayColumns(safeDate(centerDate));
  const first = cols[0];
  const last = cols[cols.length - 1];
  const d0 = safeDate(new Date(`${first.iso}T12:00:00`));
  const d1 = safeDate(new Date(`${last.iso}T12:00:00`));
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

function PlanningPageContent() {
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [view, setView] = useState<ViewMode>("calendar");
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [treeViewDate, setTreeViewDate] = useState<Date>(() => new Date());
  const [isNewRdvModalOpen, setIsNewRdvModalOpen] = useState(false);
  const [newRdvDefaultPatientName, setNewRdvDefaultPatientName] =
    useState("");
  const [appointments, setAppointments] = useState<Rdv[]>(INITIAL_APPOINTMENTS);
  const setWindowCenter = setCurrentDate;
  const [scrollAnchorIso, setScrollAnchorIso] = useState<string | null>(null);
  const handleScrollAnchorConsumed = useCallback(() => {
    setScrollAnchorIso(null);
  }, []);

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

    const newRdv = searchParams.get("newRdv");
    if (newRdv === "true") {
      setIsNewRdvModalOpen(true);
    }
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
      <div className="flex shrink-0 flex-col gap-2 border-b border-[var(--ds-primary-border)]/50 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2 sm:flex-nowrap sm:gap-x-4">
          <h1 className="shrink-0 text-xl font-semibold leading-none tracking-tight text-[color:var(--ds-text)]">
            Planning
          </h1>
          <p className="hidden min-w-0 truncate text-[11px] text-[var(--ds-text-muted)] sm:block">
            {formatSlidingRange(currentDate).replace(
              /— \d+ rendez-vous$/,
              `— ${appointments.length} rendez-vous`
            )}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={goPrev}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--ds-primary-border)]/60 bg-[var(--ds-surface)]/80 shadow-sm backdrop-blur-md transition-colors hover:bg-[var(--ds-bg)] hover:border-[var(--ds-primary-border)]/60"
              aria-label="Jour précédent"
            >
              <ChevronLeft className="h-3.5 w-3.5 text-[var(--ds-text-muted)]" />
            </button>
            <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--ds-primary-border)]/60 bg-[var(--ds-surface)]/80 px-2 py-1 shadow-sm backdrop-blur-md transition-colors hover:bg-[var(--ds-bg)] hover:border-[var(--ds-primary-border)]/60">
              <span className="text-sm leading-none" aria-hidden>
                📅
              </span>
              <input
                type="date"
                value={formatDateKey(view === "tree" ? treeViewDate : currentDate)}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) {
                    const [y, m, d] = v.split("-").map(Number);
                    if (!y || !m || !d) return;
                    const nextDate = new Date(y, m - 1, d);
                    if (Number.isNaN(nextDate.getTime())) return;
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
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--ds-primary-border)]/60 bg-[var(--ds-surface)]/80 shadow-sm backdrop-blur-md transition-colors hover:bg-[var(--ds-bg)] hover:border-[var(--ds-primary-border)]/60"
              aria-label="Jour suivant"
            >
              <ChevronRight className="h-3.5 w-3.5 text-[var(--ds-text-muted)]" />
            </button>
            <button
              type="button"
              onClick={goToday}
              className="rounded-lg border border-[var(--ds-primary-border)]/60 bg-[var(--ds-surface)]/80 px-2 py-1 text-[11px] font-medium text-[color:var(--ds-text)] shadow-sm backdrop-blur-md transition-colors hover:bg-[var(--ds-bg)] hover:border-[var(--ds-primary-border)]/60"
            >
              Aujourd&apos;hui
            </button>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-[var(--ds-primary-border)]/60 bg-[var(--ds-surface)] p-0.5 shadow-sm backdrop-blur-md">
            <button
              type="button"
              onClick={() => {
                setCurrentDate(treeViewDate);
                setView("calendar");
              }}
              className={[
                "hidden items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-all lg:flex",
                view === "calendar"
                  ? "bg-[color:var(--ds-primary)] text-white shadow-sm"
                  : "text-[var(--ds-text-muted)] hover:text-[var(--ds-text)]",
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
                  : "text-[var(--ds-text-muted)] hover:text-[var(--ds-text)]",
              ].join(" ")}
            >
              <GitBranch className="h-3 w-3" />
              Vue Arbre
            </button>
          </div>

          <AnimatedButton onClick={() => setIsNewRdvModalOpen(true)}>
            <Plus className="h-4 w-4" strokeWidth={2} />
            Nouveau RDV
          </AnimatedButton>
        </div>
      </div>

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

          const timeNorm =
            p.time.length >= 5 ? p.time.slice(0, 5) : p.time;
          const newRdv: Rdv = {
            id: `rdv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            dateKey: dateKeyFinal,
            start: timeNorm,
            durationMinutes: Number(p.dureeMinutes) || 30,
            patient: p.patient,
            soin: p.motifs.length ? p.motifs.join(", ") : "Consultation",
            urgence: p.motifs.some((m) =>
              m.toLowerCase().includes("urgence")
            ),
            rdvType: "planned",
          };
          setAppointments((prev) => [...prev, newRdv]);
          const [y, m, d] = dateKeyFinal.split("-").map(Number);
          const center = new Date(y, m - 1, d);
          if (dateKeyFinal && !isNaN(center.getTime())) {
            setWindowCenter(center);
          } else {
            setWindowCenter(new Date());
          }
          setScrollAnchorIso(dateKeyFinal);
        }}
      />

      {/* Contenu : calendrier semaine (desktop) + vue arbre (mobile par défaut ou mode arbre) */}
      <div className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          className={[
            "min-h-0 flex-1 flex-col overflow-hidden",
            view === "calendar" ? "hidden lg:flex lg:flex-col" : "hidden",
          ].join(" ")}
        >
          <CalendarView
            items={appointments}
            onItemsChange={setAppointments}
            columns={slidingColumns}
            scrollAnchorIso={scrollAnchorIso}
            onScrollAnchorConsumed={handleScrollAnchorConsumed}
          />
        </div>
        <div
          className={[
            "min-h-0 flex-1 flex-col overflow-hidden",
            view === "calendar" ? "flex flex-col lg:hidden" : "flex flex-col",
          ].join(" ")}
        >
          <TreeView rdvs={appointments} currentDate={treeViewDate} />
        </div>
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
