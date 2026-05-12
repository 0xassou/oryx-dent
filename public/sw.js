/* Oryx — service worker PWA (basique) */
const STATIC_CACHE = "oryx-static-v1";
const RUNTIME_CACHE = "oryx-runtime-v1";

const OFFLINE_HTML =
  "<h1 style='font-family:sans-serif;text-align:center;margin-top:20vh'>Oryx — Mode hors ligne</h1><p style='text-align:center'>Vérifiez votre connexion internet.</p>";

/** URLs à tenter en précache (CSS/JS/fonts/images viennent surtout de /_next/static au fil des navigations). */
const PRECACHE_URLS = [
  "/",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      await Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch(() => {
            /* icônes ou page peuvent être indisponibles au build */
          }),
        ),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok && request.method === "GET") {
      const cache = await caches.open(STATIC_CACHE);
      void cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("", { status: 504, statusText: "Gateway Timeout" });
  }
}

async function networkFirst(request, url) {
  try {
    const response = await fetch(request);
    if (response.ok && request.method === "GET") {
      const cache = await caches.open(RUNTIME_CACHE);
      void cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;

    const accept = request.headers.get("Accept") || "";
    const isNavigate = request.mode === "navigate";
    const isHtml =
      isNavigate || accept.includes("text/html");

    if (isHtml) {
      return new Response(OFFLINE_HTML, {
        status: 503,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    if (url.pathname.startsWith("/api")) {
      return new Response(JSON.stringify({ error: "offline", message: "Pas de connexion" }), {
        status: 503,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    return new Response("", { status: 503, statusText: "Service Unavailable" });
  }
}

/** Ressources typiques (fonts, images) hors /_next/static : cache first après premier hit */
function isStaticAssetRequest(request) {
  const dest = request.destination;
  if (dest === "font" || dest === "image" || dest === "style") return true;
  return false;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (!isSameOrigin(url)) return;

  if (url.pathname.startsWith("/_next/static")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === "navigate" || url.pathname.startsWith("/api")) {
    event.respondWith(networkFirst(request, url));
    return;
  }

  if (isStaticAssetRequest(request)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  /* Laisser le réseau par défaut pour le reste */
});
