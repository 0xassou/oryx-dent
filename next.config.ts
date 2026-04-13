import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Pas de `webpack` ici : en Next 16, `next build` utilise Turbopack par défaut et une config webpack vide déclenche une erreur.
   Pour le dev sans Turbopack : `npm run dev` → `next dev --webpack` (voir package.json). */
};

export default nextConfig;
