"use client";

import { useId, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export type ToothId =
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18
  | 21
  | 22
  | 23
  | 24
  | 25
  | 26
  | 27
  | 28
  | 31
  | 32
  | 33
  | 34
  | 35
  | 36
  | 37
  | 38
  | 41
  | 42
  | 43
  | 44
  | 45
  | 46
  | 47
  | 48;

export type ToothStatus =
  | "healthy"
  | "carie"
  | "couronne"
  | "chirurgie"
  | "absente";

const UPPER_RIGHT: ToothId[] = [18, 17, 16, 15, 14, 13, 12, 11];
const UPPER_LEFT: ToothId[] = [21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_RIGHT: ToothId[] = [48, 47, 46, 45, 44, 43, 42, 41];
const LOWER_LEFT: ToothId[] = [31, 32, 33, 34, 35, 36, 37, 38];

const STATUS_LABELS: Record<ToothStatus, string> = {
  healthy: "Saine",
  carie: "Soins",
  couronne: "Orthopédie",
  chirurgie: "Chirurgie",
  absente: "Absente",
};

function toothClasses(status: ToothStatus) {
  switch (status) {
    case "carie":
      return "bg-red-500/20 ring-red-300/50 text-red-700";
    case "couronne":
      return "bg-blue-500/20 ring-blue-300/50 text-blue-700";
    case "chirurgie":
      return "bg-yellow-500/20 ring-yellow-400/60 text-yellow-800";
    case "absente":
      return "bg-slate-500/15 ring-slate-400/40 text-slate-700";
    default:
      return "bg-slate-200/60 ring-slate-200/70 text-slate-700";
  }
}

type ToothIconType = "incisor" | "canine" | "premolar" | "molar";

function getToothIconType(id: ToothId): ToothIconType {
  const last = id % 10;
  if (last === 1 || last === 2) return "incisor";
  if (last === 3) return "canine";
  if (last === 4 || last === 5) return "premolar";
  return "molar";
}

function ToothIcon({ id, status }: { id: ToothId; status: ToothStatus }) {
  const uid = useId();
  const opalGradId = `opal-teal-${uid}`;
  const opalAbsentId = `opal-absent-${uid}`;

  const showAbsent = status === "absente";
  const stroke =
    status === "absente" ? "rgba(100,116,139,0.5)" : "rgba(15,23,42,0.3)";
  const strokeWidth = 1.5;

  const gradientUrl =
    status === "absente"
      ? `url(#${opalAbsentId})`
      : status === "carie"
        ? "rgba(239,68,68,0.25)"
        : status === "couronne"
          ? "rgba(59,130,246,0.25)"
          : status === "chirurgie"
            ? "rgba(234,179,8,0.25)"
            : "rgba(148,163,184,0.25)";

  const type = getToothIconType(id);
  const defs = (
    <defs>
      <linearGradient id={opalGradId} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="rgba(255,255,255,0.9)" />
        <stop offset="50%" stopColor="rgba(204,251,241,0.5)" />
        <stop offset="100%" stopColor="rgba(94,234,212,0.35)" />
      </linearGradient>
      <linearGradient id={opalAbsentId} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="rgba(148,163,184,0.12)" />
        <stop offset="100%" stopColor="rgba(100,116,139,0.08)" />
      </linearGradient>
    </defs>
  );

  const absentLine = showAbsent ? (
    <path
      d="M16 48L48 16"
      stroke="rgba(239,68,68,0.5)"
      strokeWidth="2"
      strokeLinecap="round"
    />
  ) : null;

  switch (type) {
    case "incisor":
      return (
        <svg
          viewBox="0 0 64 64"
          className="h-8 w-8"
          aria-hidden="true"
          focusable="false"
        >
          {defs}
          <path
            d="M14 8h36v6c0 2-1 4-2 6l-3 10-2 22H21l-2-22-3-10c-1-2-2-4-2-6V8z"
            fill={gradientUrl}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
          {absentLine}
        </svg>
      );
    case "canine":
      return (
        <svg
          viewBox="0 0 64 64"
          className="h-8 w-8"
          aria-hidden="true"
          focusable="false"
        >
          {defs}
          <path
            d="M32 4L24 14v6c0 3 1 6 3 9l2 8 1 19h16l1-19 2-8c2-3 3-6 3-9v-6L32 4z"
            fill={gradientUrl}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
          {absentLine}
        </svg>
      );
    case "premolar":
      return (
        <svg
          viewBox="0 0 64 64"
          className="h-8 w-8"
          aria-hidden="true"
          focusable="false"
        >
          {defs}
          <path
            d="M18 10c2-2 6-3 14-3s12 1 14 3c1 1 2 4 1 7l-1 6c0 2-1 3-2 4l-2 3-1 17H24l-1-17-2-3c-1-1-2-2-2-4l-1-6c-1-3 0-6 1-7z"
            fill={gradientUrl}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
          <path
            d="M26 18c0-2 2-3 6-3s6 1 6 3"
            fill="none"
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          {absentLine}
        </svg>
      );
    case "molar":
      return (
        <svg
          viewBox="0 0 64 64"
          className="h-8 w-8"
          aria-hidden="true"
          focusable="false"
        >
          {defs}
          <path
            d="M10 10h44c1 0 2 1 2 4v5c0 3-1 6-2 8l-2 3-1 5-1 13H16l-1-13-1-5-2-3c-1-2-2-5-2-8v-5c0-3 1-4 2-4z"
            fill={gradientUrl}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
          <path
            d="M20 22h4M32 18h0M44 22h4M24 28h4M36 26h4M48 28h4"
            fill="none"
            stroke={stroke}
            strokeWidth={1}
            strokeLinecap="round"
          />
          {absentLine}
        </svg>
      );
  }
}

export interface DentalChartProps {
  initialState?: Partial<Record<ToothId, ToothStatus>>;
  onChange?: (state: Record<ToothId, ToothStatus>) => void;
  onToothClick?: (tooth: ToothId) => void;
  /** Mode contrôlé : état des dents géré par le parent */
  value?: Record<ToothId, ToothStatus>;
  onValueChange?: (state: Record<ToothId, ToothStatus>) => void;
}

export function DentalChart({ initialState, onChange, onToothClick, value, onValueChange }: DentalChartProps) {
  const initial = useMemo(() => {
    const all: Record<ToothId, ToothStatus> = {
      11: "healthy",
      12: "healthy",
      13: "healthy",
      14: "healthy",
      15: "healthy",
      16: "healthy",
      17: "healthy",
      18: "healthy",
      21: "healthy",
      22: "healthy",
      23: "healthy",
      24: "healthy",
      25: "healthy",
      26: "healthy",
      27: "healthy",
      28: "healthy",
      31: "healthy",
      32: "healthy",
      33: "healthy",
      34: "healthy",
      35: "healthy",
      36: "healthy",
      37: "healthy",
      38: "healthy",
      41: "healthy",
      42: "healthy",
      43: "healthy",
      44: "healthy",
      45: "healthy",
      46: "healthy",
      47: "healthy",
      48: "healthy",
    };
    if (initialState) {
      for (const [k, v] of Object.entries(initialState)) {
        const tooth = Number(k) as ToothId;
        if (v) all[tooth] = v;
      }
    }
    return all;
  }, [initialState]);

  const [internalState, setInternalState] = useState<Record<ToothId, ToothStatus>>(initial);
  const [openTooth, setOpenTooth] = useState<ToothId | null>(null);

  // En mode contrôlé, on utilise `value` (fourni par le parent) ; sinon l'état interne.
  const activeState: Record<ToothId, ToothStatus> = value ?? internalState;

  function setStatus(id: ToothId, status: ToothStatus) {
    if (value !== undefined) {
      // Mode contrôlé : on remonte au parent
      const next = { ...value, [id]: status };
      onValueChange?.(next);
      onChange?.(next);
    } else {
      // Mode non contrôlé : on met à jour l'état interne
      setInternalState((prev) => {
        const next = { ...prev, [id]: status };
        onChange?.(next);
        return next;
      });
    }
    setOpenTooth(null);
  }

  function Row({ teeth }: { teeth: ToothId[] }) {
    return (
      <div
        className="flex flex-nowrap items-center justify-center gap-1 md:gap-2 flex-shrink-0 whitespace-nowrap overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {teeth.map((id) => {
          const status = activeState[id];
          const isOpen = openTooth === id;
          return (
            <div key={id} className="relative">
              <button
                type="button"
                onClick={(e) => {
                  // Si le parent veut gérer le clic (slide-over), on désactive le menu interne
                  // afin d'éviter tout comportement "double clic" / interception.
                  if (onToothClick) {
                    e.preventDefault();
                    e.stopPropagation();
                    setOpenTooth(null);
                    onToothClick(id);
                    return;
                  }

                  setOpenTooth(isOpen ? null : id);
                }}
                className={[
                  "group relative flex flex-col items-center justify-center",
                  "rounded-3xl px-2.5 py-2",
                  "shadow-[0_8px_30px_rgba(0,0,0,0.04)] backdrop-blur-md transition",
                  "hover:-translate-y-0.5 hover:bg-white/60",
                  toothClasses(status),
                ].join(" ")}
                aria-label={`Dent ${id}`}
                aria-expanded={isOpen}
              >
                <ToothIcon id={id} status={status} />
                <span className="mt-1 text-[11px] font-semibold tracking-wide opacity-80">
                  {id}
                </span>
              </button>

              <AnimatePresence>
                {isOpen && !onToothClick && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      aria-hidden="true"
                      onClick={() => setOpenTooth(null)}
                    />
                    <motion.div
                      role="menu"
                      initial={{ opacity: 0, scale: 0.92, y: -4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.92, y: -4 }}
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                      className="absolute left-1/2 top-full z-50 mt-2 w-36 -translate-x-1/2 overflow-hidden rounded-3xl bg-white p-2 shadow-[0_8px_30px_rgba(0,0,0,0.04)]"
                    >
                      {(["healthy", "carie", "couronne", "chirurgie", "absente"] as const).map(
                        (s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setStatus(id, s)}
                            className={[
                              "flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left text-xs font-medium transition-colors",
                              status === s
                                ? s === "carie"
                                  ? "bg-red-50 text-red-700"
                                  : s === "couronne"
                                    ? "bg-blue-50 text-blue-700"
                                    : s === "chirurgie"
                                      ? "bg-yellow-50 text-yellow-800"
                                      : s === "absente"
                                        ? "bg-slate-100 text-slate-700"
                                        : "bg-slate-50 text-slate-700"
                                : "text-slate-700 hover:bg-slate-50",
                            ].join(" ")}
                          >
                            <span
                              className={`h-2 w-2 shrink-0 rounded-full ${
                                s === "healthy"
                                  ? "bg-slate-300"
                                  : s === "carie"
                                    ? "bg-red-500"
                                    : s === "couronne"
                                      ? "bg-blue-500"
                                      : s === "chirurgie"
                                        ? "bg-yellow-500"
                                        : "bg-slate-400"
                              }`}
                            />
                            {STATUS_LABELS[s]}
                          </button>
                        )
                      )}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4">
        <div className="rounded-3xl bg-white p-4 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold tracking-tight text-[color:var(--ds-text)]">
              Maxillaire (haut)
            </p>
            <p className="text-xs text-slate-500">
              Cliquez une dent pour changer l’état
            </p>
          </div>
          <div className="mt-3 flex flex-col gap-4">
            <div className="flex flex-row justify-center gap-2 flex-nowrap w-full flex-shrink-0 whitespace-nowrap">
              <Row teeth={UPPER_RIGHT} />
            </div>
            <div className="flex flex-row justify-center gap-2 flex-nowrap w-full flex-shrink-0 whitespace-nowrap">
              <Row teeth={UPPER_LEFT} />
            </div>
          </div>
        </div>

        <div className="rounded-3xl bg-white p-4 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
          <p className="text-sm font-semibold tracking-tight text-[color:var(--ds-text)]">
            Mandibule (bas)
          </p>
          <div className="mt-3 flex flex-col gap-4">
            <div className="flex flex-row justify-center gap-2 flex-nowrap w-full flex-shrink-0 whitespace-nowrap">
              <Row teeth={LOWER_RIGHT} />
            </div>
            <div className="flex flex-row justify-center gap-2 flex-nowrap w-full flex-shrink-0 whitespace-nowrap">
              <Row teeth={LOWER_LEFT} />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-3xl bg-white p-4 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
        <p className="text-sm font-semibold tracking-tight text-[color:var(--ds-text)]">
          Légende
        </p>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/40 px-3 py-1 ring-1 ring-white/30">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
            <span className="text-slate-700">Saine</span>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-white/40 px-3 py-1 ring-1 ring-red-200/50">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
            <span className="text-slate-700">Soins</span>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-white/40 px-3 py-1 ring-1 ring-blue-200/50">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
            <span className="text-slate-700">Orthopédie</span>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-white/40 px-3 py-1 ring-1 ring-yellow-200/50">
            <span className="h-2.5 w-2.5 rounded-full bg-yellow-500" />
            <span className="text-slate-700">Chirurgie</span>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-white/40 px-3 py-1 ring-1 ring-slate-200/40">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-400" />
            <span className="text-slate-700">Absente</span>
          </div>
        </div>
      </div>
    </div>
  );
}

