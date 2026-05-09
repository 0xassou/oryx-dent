"use client";

import { getCabinetValue, persistCabinetPartial } from "@/lib/client/cabinetBlob";

export type Theme = "violet" | "blue" | "emerald" | "dark";

export const THEMES: {
  id: Theme;
  label: string;
  color: string;
  bg: string;
}[] = [
  {
    id: "violet",
    label: "Violet",
    color: "#7c3aed",
    bg: "#ddd6fe",
  },
  {
    id: "blue",
    label: "Bleu ardoise",
    color: "#2563eb",
    bg: "#bfdbfe",
  },
  {
    id: "emerald",
    label: "Émeraude",
    color: "#059669",
    bg: "#a7f3d0",
  },
  {
    id: "dark",
    label: "Dark Mode",
    color: "#7c3aed",
    bg: "#0a0a0f",
  },
];

const THEME_KEY = "oryx_theme";

function isTheme(v: string | null): v is Theme {
  return v === "violet" || v === "blue" || v === "emerald" || v === "dark";
}

/** Thème courant : attribut DOM (ex. hérité de la page login), puis réglages cabinet (PostgreSQL). */
export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "violet";
  const attr = document.documentElement.getAttribute("data-theme");
  if (isTheme(attr)) return attr;
  const fromCabinet = getCabinetValue<string>(THEME_KEY);
  if (typeof fromCabinet === "string" && isTheme(fromCabinet)) return fromCabinet;
  return "violet";
}

export function applyTheme(theme: Theme, options?: { persist?: boolean }) {
  document.documentElement.setAttribute("data-theme", theme);
  if (options?.persist) {
    void persistCabinetPartial({ [THEME_KEY]: theme });
  }
}
