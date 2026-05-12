"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  List,
  Pencil,
  Phone,
  Plus,
} from "lucide-react";
import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { PlanningContentSkeleton } from "@/components/ui/page-skeletons";
import {
  createAppointmentAction,
  getAppointmentsAction,
  updateAppointmentAction,
} from "@/app/actions/appointments";
import {
  createConsultationAction,
  getConsultationsDuJourAction,
  type ConsultationRow,
  type ConsultationStatut,
} from "@/app/actions/consultations";
import {
  NewAppointmentModal,
  type NewAppointmentPayload,
} from "@/components/planning/NewAppointmentModal";
import {
  type AppointmentRdv as Rdv,
  APPOINTMENTS_UPDATED_EVENT,
  appointmentJoinedRowToRdv,
  composeAppointmentNotes,
  formatDateKeyLocal,
  isValidDateKeyString,
  notifyAppointmentsUpdated,
  safeDate,
} from "@/utils/appointmentData";

// ─── Types ────────────────────────────────────────────────────────────────────

// "liste" est la vue par défaut
type ViewMode = "liste" | "calendar";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function formatAppointmentTrace(rdv: Rdv): string | null {
  const a = rdv.createdByDisplayName?.trim();
  const b = rdv.updatedByDisplayName?.trim();
  if (!a && !b) return null;
  const sameUser =
    rdv.createdByUserId &&
    rdv.updatedByUserId &&
    rdv.createdByUserId === rdv.updatedByUserId;
  if (a && b && b !== a && !sameUser) {
    return `Créé par ${a} · Modifié par ${b}`;
  }
  if (a) return `Créé par ${a}`;
  if (b) return `Modifié par ${b}`;
  return null;
}

// ─── Helpers date ─────────────────────────────────────────────────────────────

function formatDateKey(d: Date): string {
  return formatDateKeyLocal(safeDate(d));
}

const WEEK_DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function isWeekend(iso: string): boolean {
  const dow = new Date(`${iso}T12:00:00`).getDay();
  return dow === 0 || dow === 6;
}

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

// ─── Helpers date ─────────────────────────────────────────────────────────────
type CareAccentKind = "soin" | "chirurgie" | "ortho";

function careAccentFromSoin(soin: string): CareAccentKind {
  const s = soin.toLowerCase();
  if (/orthodont|bague|gouttier|visalign|réduit|orthop/.test(s)) return "ortho";
  if (/\bextract|implant|greffe|chirurg|apicect/.test(s)) return "chirurgie";
  return "soin";
}

const CARE_BAND_COLOR: Record<CareAccentKind, string> = {
  soin: "#06b6d4",
  chirurgie: "#f97316",
  ortho: "#10b981",
};

/** Plage affichée sous le titre (lun. xx → yy mai), Sora 400 / muted — sans nombre de RDV. */
function formatPlanningDateRangeSubtitle(centerDate: Date): string {
  const cols = buildSlidingDayColumns(safeDate(centerDate));
  const d0 = safeDate(new Date(`${cols[0].iso}T12:00:00`));
  const d1 = safeDate(new Date(`${cols[cols.length - 1].iso}T12:00:00`));
  const w0 = cols[0].weekdayShort.toLowerCase().replace(/\.$/, "");
  const mo0short = d0
    .toLocaleDateString("fr-FR", { month: "short" })
    .replace(/\.$/, "")
    .toLowerCase();
  const mo1long = d1
    .toLocaleDateString("fr-FR", { month: "long" })
    .replace(/^./, (c) => c.toUpperCase());
  const left = `${w0}. ${d0.getDate()} ${mo0short}`;
  let right = `${d1.getDate()} ${mo1long}`;
  if (d0.getFullYear() !== d1.getFullYear()) {
    right += ` ${d1.getFullYear()}`;
  } else if (d1.getFullYear() !== new Date().getFullYear()) {
    right += ` ${d1.getFullYear()}`;
  }
  return `${left} → ${right}`;
}

function appointmentStatusBadge(
  rdv: Rdv,
): { label: string; className: string } | null {
  const st = rdv.status ?? "confirmed";
  if (st === "pending") {
    return {
      label: "En attente",
      className:
        "border border-[#fde68a] bg-[#fffbeb] px-2.5 py-0.5 text-[11px] font-medium text-[#d97706]",
    };
  }
  if (st === "done") {
    return {
      label: "Au fauteuil",
      className:
        "border border-[#a5f3fc] bg-[#ecfeff] px-2.5 py-0.5 text-[11px] font-medium text-[#0891b2]",
    };
  }
  return {
    label: "Confirmé",
    className:
      "border border-[#bbf7d0] bg-[#f0fdf4] px-2.5 py-0.5 text-[11px] font-medium text-[#16a34a]",
  };
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
  if (rdv.rdvType === "direct") {
    return {
      ...text,
      backgroundColor: "rgba(124, 58, 237, 0.78)",
      borderLeft: "3px solid #7c3aed",
    };
  }
  if (rdv.urgence) {
    return { ...text, backgroundColor: "rgba(239, 68, 68, 0.75)", borderLeft: "3px solid rgba(239, 68, 68, 1)" };
  }
  const care = careAccentFromSoin(rdv.soin);
  const acc = CARE_BAND_COLOR[care];
  const bgTint: Record<CareAccentKind, string> = {
    soin: "rgba(6, 182, 212, 0.82)",
    chirurgie: "rgba(249, 115, 22, 0.82)",
    ortho: "rgba(16, 185, 129, 0.82)",
  };
  return { ...text, backgroundColor: bgTint[care], borderLeft: `3px solid ${acc}` };
}

function scrollDayColumnIntoView(scrollRoot: HTMLElement, columnHeaderEl: HTMLElement): void {
  const rect = columnHeaderEl.getBoundingClientRect();
  const rootRect = scrollRoot.getBoundingClientRect();
  const left = rect.left - rootRect.left + scrollRoot.scrollLeft - HOUR_COL_WIDTH_PX;
  scrollRoot.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
}

// ─── Vue Liste ────────────────────────────────────────────────────────────────

const CONSULT_BADGE: Record<ConsultationStatut, { label: string; cls: string }> = {
  en_attente: { label: "En attente", cls: "border-[#fde68a] bg-[#fffbeb] text-[#d97706]" },
  arrive: { label: "Arrivé", cls: "border-[#bbf7d0] bg-[#f0fdf4] text-[#16a34a]" },
  en_consultation: { label: "Au fauteuil", cls: "border-[#a5f3fc] bg-[#ecfeff] text-[#0891b2]" },
  termine: { label: "Terminé", cls: "border-[#e2e8f0] bg-[#f8fafc] text-[#475569]" },
  absent: { label: "Absent", cls: "border-[#fecaca] bg-[#fef2f2] text-[#dc2626]" },
};

function ListView({
  rdvs,
  centerDate,
  onDaySelect,
  selectedDayIso,
  consultations,
  onRegisterArrival,
}: {
  rdvs: Rdv[];
  centerDate: Date;
  onDaySelect: (iso: string) => void;
  selectedDayIso: string;
  consultations: ConsultationRow[];
  onRegisterArrival: (rdvId: string, patientId: string) => void;
}) {
  const weekCols = buildWeekColumns(centerDate);

  const dayRdvs = rdvs
    .filter((r) => r.dateKey === selectedDayIso)
    .sort((a, b) => a.start.localeCompare(b.start));

  const selectedDate = safeDate(new Date(`${selectedDayIso}T12:00:00`));
  const todayIso = formatDateKey(new Date());
  const dayTitleUpper = selectedDate
    .toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    })
    .toUpperCase();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
      {/* Bande 7 jours — compacte (densité type Linear) */}
      <div className="grid grid-cols-7 gap-0.5 rounded-[20px] border border-[var(--ds-border)] bg-[var(--ds-surface)] px-2.5 py-1.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        {weekCols.map((col) => {
          const rdvCount = rdvs.filter((r) => r.dateKey === col.iso).length;
          const isSelected = col.iso === selectedDayIso;
          const isTodayStrip = col.iso === todayIso;
          return (
            <button
              key={col.iso}
              type="button"
              onClick={() => onDaySelect(col.iso)}
              className={[
                "flex flex-col items-center gap-0.5 rounded-lg px-0.5 py-1 transition-all outline-none focus-visible:ring-2 focus-visible:ring-[#06b6d4]/35 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ds-bg)]",
                isSelected
                  ? "bg-[color:var(--ds-primary)] text-white shadow-[0_2px_8px_rgba(124,58,237,0.2)]"
                  : cn(
                      "hover:bg-[var(--ds-primary-soft)]/65",
                      isTodayStrip &&
                        !isSelected &&
                        "ring-[1px] ring-inset ring-[#06b6d4]/40",
                    ),
              ].join(" ")}
            >
              <span
                className={cn(
                  "text-xs font-medium uppercase leading-none tracking-widest text-[var(--ds-text-subtle)]",
                  isSelected && "text-white/95",
                )}
              >
                {col.weekdayShort.toUpperCase()}
              </span>
              <span
                className={cn(
                  "flex h-6 min-w-[1.375rem] items-center justify-center rounded-md text-[13px] font-medium tabular-nums leading-none font-mono",
                  isSelected
                    ? "text-white"
                    : "text-[var(--ds-text)]",
                )}
              >
                {col.dayOfMonth}
              </span>
              {rdvCount > 0 ? (
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-1.5 py-px text-[9px] font-medium leading-tight",
                    isSelected
                      ? "bg-white/25 text-white ring-1 ring-white/30"
                      : "bg-[#ecfeff] text-[#0891b2] ring-1 ring-[#a5f3fc]/70",
                  )}
                >
                  <span className="font-mono font-medium tabular-nums">{rdvCount}</span>
                  <span className="font-sans"> RDV</span>
                </span>
              ) : (
                <span className="flex h-3 items-center" aria-hidden>
                  <span className="h-0.5 w-0.5 rounded-full bg-[var(--ds-border)] opacity-80" />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Liste des RDV */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <p className="mb-4 flex items-center gap-2 border-l-[3px] border-[#06b6d4] pl-4 text-sm font-semibold uppercase tracking-[0.08em] text-[color:var(--ds-primary)]">
          <span>Rendez-vous — {dayTitleUpper}</span>
        </p>

        {dayRdvs.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-[20px] border border-dashed border-[var(--ds-primary-border)]/80 bg-[var(--ds-surface)]/70 py-16 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <p className="font-normal text-sm text-[var(--ds-text-muted)]">
              Aucun rendez-vous ce jour
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {dayRdvs.map((rdv) => {
              const trace = formatAppointmentTrace(rdv);
              const care = careAccentFromSoin(rdv.soin);
              const stBadge = appointmentStatusBadge(rdv);
              return (
                <div
                  key={rdv.id}
                  role="presentation"
                  style={{
                    borderLeftWidth: 4,
                    borderLeftStyle: "solid",
                    borderLeftColor: CARE_BAND_COLOR[care],
                  }}
                  className={cn(
                    "group relative flex gap-4 rounded-[20px] border-y border-r border-[var(--ds-border)] bg-[var(--ds-surface)] py-4 pl-[18px] pr-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]",
                    "transition-all hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)]",
                    "cursor-pointer",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-mono text-[14px] font-medium tabular-nums text-[var(--ds-text)]">
                        {rdv.start}
                      </span>
                      <span className="text-[15px] font-bold tracking-tight text-[var(--ds-text)]">
                        {rdv.patient}
                      </span>
                      {rdv.urgence ? (
                        <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-red-700">
                          Urgence
                        </span>
                      ) : null}
                      {rdv.rdvType === "direct" ? (
                        <span className="rounded-full border border-[var(--ds-primary-border)] bg-[var(--ds-primary-soft)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[color:var(--ds-primary)]">
                          Direct
                        </span>
                      ) : null}
                      {stBadge ? (
                        <span
                          className={[
                            "shrink-0 rounded-full tracking-tight",
                            stBadge.className,
                          ].join(" ")}
                        >
                          {stBadge.label}
                        </span>
                      ) : null}
                      {(() => {
                        const isToday = rdv.dateKey === formatDateKey(new Date());
                        const consult = consultations.find(
                          (c) => c.appointment_id === rdv.id,
                        );
                        if (consult) {
                          const b = CONSULT_BADGE[consult.statut];
                          return (
                            <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${b.cls}`}>
                              {b.label}
                            </span>
                          );
                        }
                        if (isToday && rdv.patientId) {
                          return (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onRegisterArrival(rdv.id, rdv.patientId!);
                              }}
                              className="shrink-0 rounded-full border border-[#a5f3fc] bg-[#ecfeff] px-2.5 py-0.5 text-[11px] font-medium text-[#0891b2] transition-colors hover:bg-[#cffafe]"
                            >
                              + Arrivée
                            </button>
                          );
                        }
                        return null;
                      })()}
                    </div>
                    <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <p className="text-[13px] font-normal text-[var(--ds-text-muted)]">
                        {rdv.soin}
                      </p>
                      <span className="font-mono text-[12px] font-normal tabular-nums text-[var(--ds-text-muted)]">
                        Dent {rdv.dent ?? "—"}
                      </span>
                    </div>
                    <span className="mt-3 inline-flex rounded-[12px] border border-[var(--ds-border)] bg-[var(--ds-bg)] px-2.5 py-1 font-mono text-[11px] font-medium tabular-nums text-[var(--ds-text-muted)]">
                      {rdv.durationMinutes} min
                    </span>
                    {trace ? (
                      <p className="mt-2 text-[10.5px] leading-snug text-[var(--ds-text-subtle)]">
                        {trace}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-start gap-1 pt-0.5 opacity-85 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      className="flex h-9 w-9 items-center justify-center rounded-xl text-[var(--ds-text-subtle)] transition-colors hover:bg-[var(--ds-primary-soft)] hover:text-[color:var(--ds-primary)]"
                      aria-label="Appeler"
                    >
                      <Phone className="h-4 w-4 stroke-[1.75]" />
                    </button>
                    <button
                      type="button"
                      className="flex h-9 w-9 items-center justify-center rounded-xl text-[var(--ds-text-subtle)] transition-colors hover:bg-[var(--ds-primary-soft)] hover:text-[color:var(--ds-primary)]"
                      aria-label="Modifier"
                    >
                      <Pencil className="h-4 w-4 stroke-[1.75]" />
                    </button>
                  </div>
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
  persistMove,
}: {
  items: Rdv[];
  onItemsChange: Dispatch<SetStateAction<Rdv[]>>;
  columns: SlidingDayColumn[];
  scrollAnchorIso: string | null;
  onScrollAnchorConsumed: () => void;
  persistMove?: (
    appointmentId: string,
    columnIso: string,
    slotStart: string,
  ) => Promise<boolean>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const todayScrollDoneRef = useRef(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);

  const [nowMinutes, setNowMinutes] = useState(() => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  });
  useEffect(() => {
    const id = setInterval(() => {
      const n = new Date();
      setNowMinutes(n.getHours() * 60 + n.getMinutes());
    }, 60_000);
    return () => clearInterval(id);
  }, []);
  const todayIso = formatDateKey(new Date());

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

  async function handleDrop(columnIso: string, slotStart: string) {
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
    const timeNorm =
      slotStart.length >= 5 ? slotStart.slice(0, 5) : slotStart;
    if (persistMove) {
      const ok = await persistMove(dragId, columnIso, timeNorm);
      if (!ok) {
        setDragId(null);
        setDropKey(null);
        return;
      }
    }
    onItemsChange((prev) =>
      prev.map((r) =>
        r.id === dragId
          ? { ...r, dateKey: columnIso, start: timeNorm }
          : r,
      ),
    );
    setDragId(null);
    setDropKey(null);
  }

  const colCount = columns.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[20px] border border-[var(--ds-border)] bg-[var(--ds-surface)] shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
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
              className={[
                "sticky top-0 z-[35] border-b border-[var(--ds-primary-border)] px-3 py-2 shadow-[0_1px_0_0_rgb(241_245_249)]",
                isWeekend(col.iso) ? "bg-slate-50 dark:bg-slate-800/60" : "bg-[var(--ds-surface)]",
              ].join(" ")}
              style={{ gridColumn: j + 2, gridRow: 1 }}
            >
              <p className="text-xs font-medium uppercase tracking-widest text-[var(--ds-text-subtle)]">
                {col.weekdayShort}
              </p>
              <p className="font-mono text-sm font-medium tabular-nums leading-tight text-[color:var(--ds-text)]">
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
                  const wknd = isWeekend(col.iso);
                  return (
                    <div
                      key={key}
                      className={[
                        "border-b border-[var(--ds-primary-border)]/80 hover:bg-[var(--ds-primary-soft)]/40",
                        wknd ? "bg-slate-100/60 dark:bg-slate-700/20" : "bg-[var(--ds-bg)]/40",
                        isOver ? "ring-2 ring-inset ring-[var(--ds-primary-border)]/70" : "",
                      ].join(" ")}
                      style={{ position: "absolute", left: 0, right: 0, top: slotIdx * SLOT_HEIGHT_PX, height: SLOT_HEIGHT_PX, zIndex: 10 }}
                      onDragOver={(e) => { e.preventDefault(); setDropKey(key); }}
                      onDragLeave={() => setDropKey(null)}
                      onDrop={() => void handleDrop(col.iso, slotStart)}
                      aria-label={`Créneau ${slotStart}`}
                    />
                  );
                })}
                {dayRdvs.map((rdv) => {
                  const calStyle = calendarRdvSurfaceStyle(rdv);
                  const trace = formatAppointmentTrace(rdv);
                  return (
                    <div
                      key={rdv.id}
                      title={trace ?? undefined}
                      draggable
                      onDragStart={() => setDragId(rdv.id)}
                      onDragEnd={() => { setDragId(null); setDropKey(null); }}
                      style={{
                        top: timeToGridTop(rdv.start, startMinutes),
                        height: durationToGridHeight(rdv.durationMinutes),
                        backgroundColor: calStyle.backgroundColor,
                        borderLeft: calStyle.borderLeft,
                      }}
                      className="absolute left-1.5 right-1.5 z-20 overflow-hidden rounded-xl p-2 shadow-[0_1px_3px_rgba(0,0,0,0.08)] cursor-grab select-none active:cursor-grabbing"
                    >
                      <div className="flex min-w-0 flex-wrap items-baseline gap-1">
                        <p className="min-w-0 truncate text-xs leading-tight" style={calStyle.patientStyle}>
                          {rdv.patient.length > 15 ? rdv.patient.slice(0, 15) + "…" : rdv.patient}
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
                {col.iso === todayIso && nowMinutes >= startMinutes && nowMinutes <= endMinutes && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute left-0 right-0 z-30 flex items-center"
                    style={{ top: ((nowMinutes - startMinutes) / GRID_STEP) * SLOT_HEIGHT_PX }}
                  >
                    <div className="h-2 w-2 shrink-0 -translate-x-1 rounded-full bg-red-500" />
                    <div className="flex-1 border-t-2 border-red-500" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

function PlanningPageContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);

  // "liste" est la vue par défaut (remplace "calendar" comme vue principale)
  const [view, setView] = useState<ViewMode>("liste");

  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [listSelectedDay, setListSelectedDay] = useState<string>(() =>
    formatDateKey(new Date())
  );
  const [isNewRdvModalOpen, setIsNewRdvModalOpen] = useState(false);
  const [newRdvDefaultPatientName, setNewRdvDefaultPatientName] = useState("");
  const [newRdvDefaultPatientId, setNewRdvDefaultPatientId] = useState<
    string | undefined
  >(undefined);
  const [appointments, setAppointments] = useState<Rdv[]>([]);
  const [consultations, setConsultations] = useState<ConsultationRow[]>([]);
  const [scrollAnchorIso, setScrollAnchorIso] = useState<string | null>(null);
  const handleScrollAnchorConsumed = useCallback(
    () => setScrollAnchorIso(null),
    [],
  );

  const reloadConsultations = useCallback(async () => {
    const res = await getConsultationsDuJourAction();
    if (res.ok) setConsultations(res.data);
  }, []);

  const handleRegisterArrival = useCallback(
    async (rdvId: string, patientId: string) => {
      const res = await createConsultationAction({
        appointment_id: rdvId,
        patient_id: patientId,
      });
      if (res.ok) {
        setConsultations((prev) => [...prev, res.data]);
      }
    },
    [],
  );

  const patientFilterId = useMemo(() => {
    return (
      searchParams.get("patient")?.trim() ||
      searchParams.get("patientId")?.trim() ||
      ""
    );
  }, [searchParams]);
  const visibleAppointments = useMemo(() => {
    if (!patientFilterId) return appointments;
    return appointments.filter((a) => (a.patientId ?? "").trim() === patientFilterId);
  }, [appointments, patientFilterId]);
  const reloadAppointments = useCallback(async () => {
    const res = await getAppointmentsAction();
    if (!res.ok) return;
    setAppointments(res.data.map(appointmentJoinedRowToRdv));
  }, []);
  const persistAppointmentMove = useCallback(
    async (
      appointmentId: string,
      columnIso: string,
      slotStart: string,
    ): Promise<boolean> => {
      const hhmm =
        slotStart.length >= 5 ? slotStart.slice(0, 5) : slotStart;
      const res = await updateAppointmentAction(appointmentId, {
        date: columnIso,
        heure: hhmm,
      });
      if (!res.ok) {
        alert(`Impossible : ${res.error}`);
        await reloadAppointments();
        return false;
      }
      notifyAppointmentsUpdated();
      return true;
    },
    [reloadAppointments],
  );
  const handleNewRdv = useCallback(
    async (payload: NewAppointmentPayload) => {
      const rawDate = payload.date?.trim() ?? "";
      const dateKeyFinal =
        rawDate && isValidDateKeyString(rawDate)
          ? rawDate
          : formatDateKeyLocal(new Date());
      const timeNorm =
        payload.time.length >= 5
          ? payload.time.slice(0, 5)
          : payload.time;
      const pid = payload.patientId?.trim();
      const notes = composeAppointmentNotes(payload.notes, {
        urgence: payload.motifs.some((m) =>
          m.toLowerCase().includes("urgence"),
        ),
        rdvType: "planned",
        displayPatient: pid ? undefined : payload.patient.trim() || undefined,
      });
      const res = await createAppointmentAction({
        patient_id: pid || null,
        date: dateKeyFinal,
        heure: timeNorm,
        duree: Number(payload.dureeMinutes) || 30,
        type_acte: payload.motifs.length
          ? payload.motifs.join(", ")
          : "Consultation",
        notes,
      });
      if (!res.ok) {
        alert(res.error);
        return;
      }
      const row = appointmentJoinedRowToRdv(res.data);
      setAppointments((prev) => [...prev, row]);
      notifyAppointmentsUpdated();
      const [y, m, d] = dateKeyFinal.split("-").map(Number);
      const center = new Date(y, m - 1, d);
      if (dateKeyFinal && !isNaN(center.getTime())) {
        setCurrentDate(center);
        setListSelectedDay(dateKeyFinal);
      } else {
        setCurrentDate(new Date());
      }
      setScrollAnchorIso(dateKeyFinal);
      if (view !== "calendar") setView("liste");
    },
    [view],
  );
  const [planningReady, setPlanningReady] = useState(false);

  // Paramètre 't' pour forcer le rechargement quand on arrive depuis une fiche patient
  const refreshTimestamp = searchParams.get("t") ?? "";

  useEffect(() => {
    setMounted(true);
    setPlanningReady(false);
    void (async () => {
      await Promise.all([reloadAppointments(), reloadConsultations()]);
      setPlanningReady(true);
    })();
  }, [reloadAppointments, reloadConsultations, pathname, refreshTimestamp]);

  // Recharger les RDV quand l'utilisateur revient sur la page (navigation ou retour d'onglet)
  useEffect(() => {
    if (!mounted) return;
    const handleFocus = () => {
      void reloadAppointments();
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [mounted, reloadAppointments]);

  useEffect(() => {
    const patientId =
      searchParams.get("patient")?.trim() ||
      searchParams.get("patientId")?.trim() ||
      "";
    const patientName = searchParams.get("patientName");
    setNewRdvDefaultPatientId(patientId || undefined);
    if (patientName) setNewRdvDefaultPatientName(patientName);
    else setNewRdvDefaultPatientName("");
    if (searchParams.get("newRdv") === "true") setIsNewRdvModalOpen(true);

    const listDay = searchParams.get("listDay")?.trim() ?? "";
    if (listDay && isValidDateKeyString(listDay)) {
      setListSelectedDay(listDay);
      const [y, m, d] = listDay.split("-").map(Number);
      setCurrentDate(new Date(y, (m ?? 1) - 1, d ?? 1));
      setScrollAnchorIso(listDay);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!mounted) return;
    const h = () => {
      void reloadAppointments();
    };
    window.addEventListener(APPOINTMENTS_UPDATED_EVENT, h);
    return () =>
      window.removeEventListener(APPOINTMENTS_UPDATED_EVENT, h);
  }, [mounted, reloadAppointments]);

  const slidingColumns = buildSlidingDayColumns(currentDate);

  function goPrev() {
    if (view === "calendar") {
      setCurrentDate((d) => { const n = new Date(d); n.setDate(n.getDate() - 1); return n; });
    } else {
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
    setListSelectedDay(todayIso);
  }

  // Date affichée dans le picker selon la vue active
  const activeDateForPicker =
    view === "liste"
      ? safeDate(new Date(`${listSelectedDay}T12:00:00`))
      : currentDate;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--ds-bg)]">
      {/* ── Header ── */}
      <header className="mb-5 flex shrink-0 flex-col gap-3 pb-1 pt-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-start gap-x-4 gap-y-2 sm:flex-nowrap sm:items-center">
          <div className="min-w-0">
            <h1 className="text-[28px] font-bold leading-tight tracking-tight text-[var(--ds-text)]">
              Planning
            </h1>
            <p className="mt-0.5 font-normal text-sm text-[var(--ds-text-muted)] sm:text-base">
              {formatPlanningDateRangeSubtitle(currentDate)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            <button
              type="button"
              onClick={goPrev}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--ds-primary-border)] bg-transparent transition-colors hover:bg-[var(--ds-primary-soft)]"
              aria-label="Précédent"
            >
              <ChevronLeft className="h-4 w-4 text-[var(--ds-text-muted)]" />
            </button>
            <label className="relative flex cursor-pointer items-center gap-2 rounded-xl border border-[var(--ds-border)] bg-[var(--ds-surface)] px-3.5 py-2 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-colors hover:border-[var(--ds-primary-border)]/80 hover:shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
              <CalendarDays
                className="h-[18px] w-[18px] shrink-0 text-[#06b6d4]"
                aria-hidden
                strokeWidth={2}
              />
              <span className="text-[13px] font-medium tracking-tight text-[var(--ds-text)]">
                {new Intl.DateTimeFormat("fr-DZ", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                }).format(activeDateForPicker)}
              </span>
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
                  } else {
                    setCurrentDate(nextDate);
                    setListSelectedDay(formatDateKey(nextDate));
                  }
                }}
                className="absolute inset-0 h-full w-full cursor-pointer rounded-xl opacity-0"
                aria-label="Sélectionner une date"
              />
            </label>
            <button
              type="button"
              onClick={goNext}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--ds-primary-border)] bg-transparent transition-colors hover:bg-[var(--ds-primary-soft)]"
              aria-label="Suivant"
            >
              <ChevronRight className="h-4 w-4 text-[var(--ds-text-muted)]" />
            </button>
            <button
              type="button"
              onClick={goToday}
              className="rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-surface)] px-4 py-2 text-[13px] font-medium text-[var(--ds-text-muted)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-colors hover:bg-[var(--ds-primary-soft)] hover:text-[var(--ds-text)]"
            >
              Aujourd&apos;hui
            </button>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <div
            className="inline-flex rounded-xl border border-[var(--ds-primary-border)] bg-[var(--ds-bg)] p-1 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
            role="group"
            aria-label="Vue planning"
          >
            <button
              type="button"
              onClick={() => {
                setListSelectedDay(formatDateKey(currentDate));
                setView("liste");
              }}
              className={cn(
                "flex h-10 items-center gap-2 rounded-[10px] px-5 text-[13px] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#06b6d4]/35 focus-visible:ring-offset-2",
                view === "liste"
                  ? "bg-[color:var(--ds-primary)] font-semibold text-white shadow-[0_4px_16px_rgba(124,58,237,0.25)]"
                  : "font-medium text-[var(--ds-text-muted)] hover:bg-[var(--ds-primary-soft)]/55 hover:text-[var(--ds-text)]",
              )}
              aria-label="Vue liste"
            >
              <List className="h-4 w-4" strokeWidth={2} />
              <span className="hidden sm:inline">Liste</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (view === "liste") {
                  setCurrentDate(safeDate(new Date(`${listSelectedDay}T12:00:00`)));
                }
                setView("calendar");
              }}
              className={cn(
                "hidden h-10 items-center gap-2 rounded-[10px] px-5 text-[13px] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#06b6d4]/35 focus-visible:ring-offset-2 lg:flex",
                view === "calendar"
                  ? "bg-[color:var(--ds-primary)] font-semibold text-white shadow-[0_4px_16px_rgba(124,58,237,0.25)]"
                  : "font-medium text-[var(--ds-text-muted)] hover:bg-[var(--ds-primary-soft)]/55 hover:text-[var(--ds-text)]",
              )}
              aria-label="Vue calendrier"
            >
              <CalendarDays className="h-4 w-4 text-[#06b6d4]" strokeWidth={2} />
              <span>Calendrier</span>
            </button>
          </div>

          <PrimaryButton
            type="button"
            onClick={() => setIsNewRdvModalOpen(true)}
            className="h-11 min-h-11 rounded-xl px-6 font-semibold shadow-[0_4px_16px_rgba(124,58,237,0.25)]"
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            Nouveau RDV
          </PrimaryButton>
        </div>
      </header>

      {/* ── Modal ── */}
      <NewAppointmentModal
        open={isNewRdvModalOpen}
        onClose={() => setIsNewRdvModalOpen(false)}
        defaultPatientName={newRdvDefaultPatientName}
        defaultPatientId={newRdvDefaultPatientId}
        onConfirm={(payload: NewAppointmentPayload) => void handleNewRdv(payload)}
      />

      {/* ── Contenu ── */}
      <div className="mt-2 flex min-h-0 flex-1 flex-col overflow-hidden">
        {!planningReady ? (
          <PlanningContentSkeleton />
        ) : (
          <>
        {/* Vue Liste — visible sur tous les écrans */}
        {view === "liste" && (
          <ListView
            rdvs={visibleAppointments}
            centerDate={currentDate}
            selectedDayIso={listSelectedDay}
            consultations={consultations}
            onRegisterArrival={handleRegisterArrival}
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
              items={visibleAppointments}
              onItemsChange={setAppointments}
              columns={slidingColumns}
              scrollAnchorIso={scrollAnchorIso}
              onScrollAnchorConsumed={handleScrollAnchorConsumed}
              persistMove={persistAppointmentMove}
            />
          </div>
        )}
        {/* Fallback mobile: afficher la liste si calendrier demandé */}
        {view === "calendar" && (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:hidden">
            <ListView
              rdvs={visibleAppointments}
              centerDate={currentDate}
              selectedDayIso={listSelectedDay}
              consultations={consultations}
              onRegisterArrival={handleRegisterArrival}
              onDaySelect={(iso) => {
                setListSelectedDay(iso);
                setCurrentDate(safeDate(new Date(`${iso}T12:00:00`)));
              }}
            />
          </div>
        )}
          </>
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
