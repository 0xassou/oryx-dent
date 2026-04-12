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

export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "violet";
  return (localStorage.getItem(THEME_KEY) as Theme) ?? "violet";
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_KEY, theme);
}
