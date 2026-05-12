"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });
        console.warn("[PWA] Service worker enregistré:", registration.scope);
      } catch (err) {
        console.warn("[PWA] Échec enregistrement service worker:", err);
      }
    };

    void register();
  }, []);

  return null;
}
