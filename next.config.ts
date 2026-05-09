import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Ne pas bundler `pg` pour le runtime Node — évite des doublons / warnings. */
  serverExternalPackages: ["pg", "pg-native"],

  /**
   * Évite que des dépendances transitives (`pg` → `pg-connection-string` → `fs`)
   * soient résolues pour le bundle client si un module serveur est analysé par erreur.
   * Pour que cette config s’applique au build prod : `next build --webpack` (voir package.json).
   */
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        dns: false,
        pg: false,
        "pg-native": false,
      };
    }
    return config;
  },
};

export default nextConfig;
