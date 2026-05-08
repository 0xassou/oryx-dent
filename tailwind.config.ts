import type { Config } from "tailwindcss";

/** Complète @theme dans app/globals.css (Tailwind v4). */
export default {
  theme: {
    extend: {
      fontFamily: {
        sans: ["Sora", "sans-serif"],
        mono: ["DM Mono", "monospace"],
      },
    },
  },
} satisfies Config;
