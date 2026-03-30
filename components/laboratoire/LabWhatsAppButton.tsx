"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Phone } from "lucide-react";
import type { LabPhoneEntry } from "@/utils/labsDirectory";
import { whatsAppLabUrl } from "@/utils/laboratoireCommandes";

function digitsOk(numero: string): boolean {
  return numero.replace(/\D/g, "").length >= 8;
}

type LabWhatsAppButtonProps = {
  patientName: string;
  telephones: LabPhoneEntry[];
  className?: string;
};

/**
 * Un seul numéro valide → lien direct. Plusieurs → menu déroulant.
 */
export function LabWhatsAppButton({
  patientName,
  telephones,
  className = "",
}: LabWhatsAppButtonProps) {
  const valid = telephones.filter((t) => digitsOk(t.numero));
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const baseBtn =
    "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-emerald-600 transition-colors hover:bg-emerald-50/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/50 " +
    className;

  const fallback = (
    <a
      href={whatsAppLabUrl(patientName)}
      target="_blank"
      rel="noopener noreferrer"
      title="WhatsApp (aucun numéro — message seul)"
      className={baseBtn + " opacity-50"}
      onClick={(e) => e.stopPropagation()}
      aria-label="Ouvrir WhatsApp"
    >
      <Phone className="h-[18px] w-[18px]" strokeWidth={1.75} />
    </a>
  );

  if (valid.length === 0) {
    return fallback;
  }

  if (valid.length === 1) {
    return (
      <a
        href={whatsAppLabUrl(patientName, valid[0].numero)}
        target="_blank"
        rel="noopener noreferrer"
        title="WhatsApp laboratoire"
        className={baseBtn}
        onClick={(e) => e.stopPropagation()}
        aria-label="Ouvrir WhatsApp"
      >
        <Phone className="h-[18px] w-[18px]" strokeWidth={1.75} />
      </a>
    );
  }

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        title="Choisir le numéro WhatsApp"
        className={
          baseBtn +
          " gap-0.5 pr-1.5 pl-2 w-auto min-w-[2.25rem] shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
        }
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <Phone className="h-[18px] w-[18px]" strokeWidth={1.75} />
        <ChevronDown className="h-3 w-3 opacity-70" strokeWidth={2} />
      </button>
      {open ? (
        <ul
          className="absolute right-0 top-full z-50 mt-1.5 min-w-[13.5rem] overflow-hidden rounded-xl border border-slate-200/70 bg-white py-1 shadow-[0_8px_30px_rgba(15,23,42,0.08)]"
          role="listbox"
        >
          {valid.map((t, i) => (
            <li key={`${t.numero}-${i}`} role="option">
              <a
                href={whatsAppLabUrl(patientName, t.numero)}
                target="_blank"
                rel="noopener noreferrer"
                className="block px-3 py-2.5 text-left text-[13px] font-normal leading-snug text-slate-700 transition-colors hover:bg-slate-50"
                onClick={() => setOpen(false)}
              >
                <span className="font-medium text-slate-800">
                  {t.label || "Contact"}
                </span>
                <span className="mt-0.5 block text-xs font-light text-slate-500">
                  {t.numero}
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
