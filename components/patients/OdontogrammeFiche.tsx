"use client";

import { useState, type ReactNode } from "react";
import type { ToothId, ToothStatus } from "@/components/dentition/DentalChart";

/** Facteur d’échelle d’affichage des silhouettes (+25 %). */
const S = 1.25;

function wh(w: number, h: number) {
  return { width: Math.round(w * S), height: Math.round(h * S) };
}

/**
 * Odontogramme stylisé — silhouettes SVG par type de dent.
 *
 * Aligné sur la palette Oryx (variables `--ds-*` + teintes Tailwind) et
 * sur les statuts `ToothStatus` déjà utilisés dans le projet.
 */

type ToothKind = "incisor" | "lateral" | "canine" | "premolar" | "molar" | "wisdom";

type ToothSpec = { n: ToothId; kind: ToothKind };

const UPPER: ToothSpec[] = [
  { n: 18, kind: "wisdom" },
  { n: 17, kind: "molar" },
  { n: 16, kind: "molar" },
  { n: 15, kind: "premolar" },
  { n: 14, kind: "premolar" },
  { n: 13, kind: "canine" },
  { n: 12, kind: "lateral" },
  { n: 11, kind: "incisor" },
  { n: 21, kind: "incisor" },
  { n: 22, kind: "lateral" },
  { n: 23, kind: "canine" },
  { n: 24, kind: "premolar" },
  { n: 25, kind: "premolar" },
  { n: 26, kind: "molar" },
  { n: 27, kind: "molar" },
  { n: 28, kind: "wisdom" },
];

const LOWER: ToothSpec[] = [
  { n: 48, kind: "wisdom" },
  { n: 47, kind: "molar" },
  { n: 46, kind: "molar" },
  { n: 45, kind: "premolar" },
  { n: 44, kind: "premolar" },
  { n: 43, kind: "canine" },
  { n: 42, kind: "lateral" },
  { n: 41, kind: "incisor" },
  { n: 31, kind: "incisor" },
  { n: 32, kind: "lateral" },
  { n: 33, kind: "canine" },
  { n: 34, kind: "premolar" },
  { n: 35, kind: "premolar" },
  { n: 36, kind: "molar" },
  { n: 37, kind: "molar" },
  { n: 38, kind: "wisdom" },
];

type Palette = { crown: string; stroke: string; root: string };

/**
 * Mapping statut → palette (teintes douces pour la couronne + liseré).
 * Les couleurs sont inspirées de la palette Oryx et complètent la variable
 * `--ds-primary` existante pour les soins (violet).
 */
function paletteFor(status: ToothStatus): Palette {
  switch (status) {
    case "carie":
      return {
        crown: "var(--tooth-soin-crown)",
        stroke: "var(--tooth-soin-stroke)",
        root: "var(--tooth-soin-root)",
      };
    case "couronne":
      return {
        crown: "var(--tooth-couronne-crown)",
        stroke: "var(--tooth-couronne-stroke)",
        root: "var(--tooth-couronne-root)",
      };
    case "chirurgie":
      return {
        crown: "var(--tooth-chirurgie-crown)",
        stroke: "var(--tooth-chirurgie-stroke)",
        root: "var(--tooth-chirurgie-root)",
      };
    case "absente":
      return {
        crown: "var(--tooth-absente-crown)",
        stroke: "var(--tooth-absente-stroke)",
        root: "var(--tooth-absente-root)",
      };
    case "healthy":
    default:
      return {
        crown: "var(--tooth-sain-crown)",
        stroke: "var(--tooth-sain-stroke)",
        root: "var(--tooth-sain-root)",
      };
  }
}

function Incisor({ fill }: { fill: Palette }) {
  const { width, height } = wh(18, 44);
  return (
    <svg width={width} height={height} viewBox="0 0 18 44" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 28 Q6 36 7 43 Q9 44 11 43 Q12 36 11 28Z" fill={fill.root} />
      <rect x="2" y="4" width="14" height="26" rx="5" fill={fill.crown} stroke={fill.stroke} strokeWidth={1.2} />
    </svg>
  );
}

function Lateral({ fill }: { fill: Palette }) {
  const { width, height } = wh(16, 44);
  return (
    <svg width={width} height={height} viewBox="0 0 16 44" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 27 Q5 36 6.5 43 Q8 44 9.5 43 Q11 36 10 27Z" fill={fill.root} />
      <rect x="2" y="5" width="12" height="24" rx="5" fill={fill.crown} stroke={fill.stroke} strokeWidth={1.2} />
    </svg>
  );
}

function Canine({ fill }: { fill: Palette }) {
  const { width, height } = wh(18, 50);
  return (
    <svg width={width} height={height} viewBox="0 0 18 50" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 32 Q6 41 8 49 Q9 50 10 49 Q12 41 11 32Z" fill={fill.root} />
      <path
        d="M2 32 Q2 10 9 3 Q16 10 16 32 Q13 36 9 36 Q5 36 2 32Z"
        fill={fill.crown}
        stroke={fill.stroke}
        strokeWidth={1.2}
      />
    </svg>
  );
}

function Premolar({ fill }: { fill: Palette }) {
  const { width, height } = wh(20, 46);
  return (
    <svg width={width} height={height} viewBox="0 0 20 46" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 30 Q4 38 5 45 Q7 46 8 44 Q9 38 8 30Z" fill={fill.root} />
      <path d="M12 30 Q11 38 12 44 Q13 46 15 45 Q16 38 14 30Z" fill={fill.root} />
      <path
        d="M2 30 L2 16 Q2 8 5 6 Q7 4 10 5 Q13 4 15 6 Q18 8 18 16 L18 30 Q15 34 10 34 Q5 34 2 30Z"
        fill={fill.crown}
        stroke={fill.stroke}
        strokeWidth={1.2}
      />
      <path
        d="M2 18 Q6 14 10 16 Q14 14 18 18"
        stroke={fill.stroke}
        strokeWidth={1}
        fill="none"
        opacity={0.35}
      />
    </svg>
  );
}

function Molar({ fill }: { fill: Palette }) {
  const { width, height } = wh(26, 44);
  return (
    <svg width={width} height={height} viewBox="0 0 26 44" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 28 Q3 36 4 43 Q6 44 7 43 Q8 36 7 28Z" fill={fill.root} />
      <path d="M12 29 Q11 37 12 43 Q13 44 14 43 Q15 37 14 29Z" fill={fill.root} />
      <path d="M19 28 Q18 36 19 43 Q21 44 22 43 Q23 36 21 28Z" fill={fill.root} />
      <rect x="2" y="6" width="22" height="24" rx="6" fill={fill.crown} stroke={fill.stroke} strokeWidth={1.2} />
      <line x1="13" y1="6" x2="13" y2="30" stroke={fill.stroke} strokeWidth={1} opacity={0.25} />
      <line x1="2" y1="18" x2="24" y2="18" stroke={fill.stroke} strokeWidth={1} opacity={0.25} />
    </svg>
  );
}

function Wisdom({ fill }: { fill: Palette }) {
  const { width, height } = wh(22, 42);
  return (
    <svg width={width} height={height} viewBox="0 0 22 42" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 27 Q4 34 5 40 Q7 42 8 40 Q9 34 8 27Z" fill={fill.root} />
      <path d="M13 27 Q13 34 14 40 Q15 42 16 40 Q17 34 16 27Z" fill={fill.root} />
      <rect x="2" y="6" width="18" height="22" rx="6" fill={fill.crown} stroke={fill.stroke} strokeWidth={1.2} />
      <line x1="11" y1="6" x2="11" y2="28" stroke={fill.stroke} strokeWidth={1} opacity={0.25} />
      <line x1="2" y1="17" x2="20" y2="17" stroke={fill.stroke} strokeWidth={1} opacity={0.25} />
    </svg>
  );
}

function Missing() {
  const { width, height } = wh(20, 44);
  return (
    <svg width={width} height={height} viewBox="0 0 20 44" xmlns="http://www.w3.org/2000/svg">
      <rect
        x="2"
        y="6"
        width="16"
        height="22"
        rx="5"
        fill="var(--tooth-absente-crown)"
        stroke="var(--tooth-absente-stroke)"
        strokeWidth={1}
        strokeDasharray="2 2"
      />
      <line
        x1="5"
        y1="10"
        x2="15"
        y2="24"
        stroke="var(--tooth-absente-stroke)"
        strokeWidth={1.5}
      />
      <line
        x1="15"
        y1="10"
        x2="5"
        y2="24"
        stroke="var(--tooth-absente-stroke)"
        strokeWidth={1.5}
      />
    </svg>
  );
}

function ToothNode({
  spec,
  status,
  isMandible,
  watched,
  waveIndex,
  isLifted,
  onLiftEnter,
  onLiftExit,
  onClick,
}: {
  spec: ToothSpec;
  status: ToothStatus;
  isMandible: boolean;
  watched: boolean;
  waveIndex: number;
  isLifted: boolean;
  onLiftEnter: () => void;
  onLiftExit: () => void;
  onClick: () => void;
}) {
  const palette = paletteFor(status);
  const isMissing = status === "absente";
  const label = (
    <span
      className={[
        "font-mono text-[9px] leading-none tracking-wide transition-colors duration-150",
        isLifted ? "text-[var(--ds-text)]" : "text-[var(--ds-text-muted)]",
      ].join(" ")}
      aria-hidden
    >
      {spec.n}
    </span>
  );

  const svg = (() => {
    if (isMissing) return <Missing />;
    switch (spec.kind) {
      case "incisor":
        return <Incisor fill={palette} />;
      case "lateral":
        return <Lateral fill={palette} />;
      case "canine":
        return <Canine fill={palette} />;
      case "premolar":
        return <Premolar fill={palette} />;
      case "molar":
        return <Molar fill={palette} />;
      case "wisdom":
        return <Wisdom fill={palette} />;
    }
  })();

  return (
    <button
      type="button"
      onClick={onClick}
      onPointerEnter={onLiftEnter}
      onPointerLeave={(e) => {
        if (e.currentTarget === document.activeElement) return;
        onLiftExit();
      }}
      onFocus={onLiftEnter}
      onBlur={onLiftExit}
      className={[
        "oryx-fade-up relative flex shrink-0 cursor-pointer select-none flex-col items-center gap-1 border-0 bg-transparent p-0 outline-none",
        "focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--ds-primary)_40%,transparent)]",
        isMissing ? "opacity-60" : "",
      ].join(" ")}
      style={{ animationDelay: `${waveIndex * 30}ms` }}
      title={`Dent ${spec.n}${isMissing ? " — absente" : ""}`}
      aria-label={`Dent ${spec.n}`}
    >
      <span
        className={[
          "inline-flex flex-col items-center gap-1 transition-transform duration-150 ease-out",
          isLifted ? "-translate-y-[3px]" : "translate-y-0",
        ].join(" ")}
      >
        {isMandible ? label : null}
        <span className="leading-none">{svg}</span>
        {!isMandible ? label : null}
      </span>
      {watched ? (
        <span
          className="absolute -top-1 right-0 h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_0_2px_var(--ds-surface)]"
          aria-hidden
        />
      ) : null}
    </button>
  );
}

export interface OdontogrammeFicheProps {
  value: Record<ToothId, ToothStatus>;
  watchedTeeth?: Set<number>;
  onToothClick?: (tooth: ToothId) => void;
}

export function OdontogrammeFiche({
  value,
  watchedTeeth,
  onToothClick,
}: OdontogrammeFicheProps) {
  const [liftedToothId, setLiftedToothId] = useState<ToothId | null>(null);

  const legend: { status: ToothStatus; label: string }[] = [
    { status: "healthy", label: "Saine" },
    { status: "carie", label: "Soins" },
    { status: "chirurgie", label: "Chirurgie" },
    { status: "couronne", label: "Orthopédie / Couronne" },
    { status: "absente", label: "Absente" },
  ];

  const renderRow = (arr: ToothSpec[], isMandible: boolean, waveBase: number) => {
    const nodes: ReactNode[] = [];
    let waveSeq = 0;
    arr.forEach((spec, i) => {
      if (i === 8) {
        nodes.push(
          <span
            key={`mid-${isMandible ? "m" : "x"}`}
            className="mx-1 h-[60px] w-px shrink-0 self-center bg-[var(--ds-primary-border)]"
            aria-hidden
          />,
        );
      }
      const waveIndex = waveBase + waveSeq;
      waveSeq += 1;
      nodes.push(
        <ToothNode
          key={spec.n}
          spec={spec}
          status={value[spec.n] ?? "healthy"}
          isMandible={isMandible}
          watched={watchedTeeth?.has(spec.n) ?? false}
          waveIndex={waveIndex}
          isLifted={liftedToothId === spec.n}
          onLiftEnter={() => setLiftedToothId(spec.n)}
          onLiftExit={() =>
            setLiftedToothId((t) => (t === spec.n ? null : t))
          }
          onClick={() => onToothClick?.(spec.n)}
        />,
      );
    });
    return (
      <div
        className={[
          "flex flex-nowrap justify-center gap-[3px] overflow-x-auto px-1",
          isMandible ? "items-start" : "items-end",
        ].join(" ")}
      >
        {nodes}
      </div>
    );
  };

  return (
    <div className="px-1 py-4">
      <div className="mb-3 text-center font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ds-text-muted)]">
        Maxillaire supérieur
      </div>

      {renderRow(UPPER, false, 0)}

      <div className="my-3 flex items-center gap-3">
        <div className="h-px flex-1 bg-[var(--ds-primary-border)]" />
        <span className="whitespace-nowrap font-mono text-[8px] uppercase tracking-[0.12em] text-[var(--ds-text-muted)]">
          Maxillaire ↑ · ↓ Mandibule
        </span>
        <div className="h-px flex-1 bg-[var(--ds-primary-border)]" />
      </div>

      {renderRow(LOWER, true, 16)}

      <div className="mt-3 text-center font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--ds-text-muted)]">
        Mandibule inférieure
      </div>

      <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2 border-t border-[var(--ds-primary-border)] pt-3">
        {legend.map((l) => {
          const pal = paletteFor(l.status);
          return (
            <div
              key={l.status}
              className="flex items-center gap-1.5 text-[11px] text-[var(--ds-text-muted)]"
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm border"
                style={{ background: pal.crown, borderColor: pal.stroke }}
                aria-hidden
              />
              {l.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default OdontogrammeFiche;
