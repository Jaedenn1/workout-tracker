const CACHE = "workout-tracker-v1.9-live-training-os";
const CORE_SHELL = ["/", "/offline", "/icon.svg"];
const OPTIONAL_SHELL = ["/gym", "/history", "/progress", "/bodyweight", "/prs", "/routines", "/data", "/health", "/watch", "/plan", "/session", "/coach", "/live"];
async function putInCache(request, response) { if (!response || !response.ok) return; const cache = await caches.open(CACHE); await cache.put(request, response); }
self.addEventListener("install", (event) => { event.waitUntil((async () => { const cache = await caches.open(CACHE); await cache.addAll(CORE_SHELL); await Promise.allSettled(OPTIONAL_SHELL.map((path) => cache.add(path))); await self.skipWaiting(); })()); });
self.addEventListener("activate", (event) => { event.waitUntil((async () => { const keys = await caches.keys(); await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))); await self.clients.claim(); })()); });
self.addEventListener("fetch", (event) => { const request = event.request; if (request.method !== "GET") return; const url = new URL(request.url); if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") { const network = fetch(request); event.waitUntil(network.then((response) => response.ok ? putInCache(request, response.clone()) : undefined).catch(() => undefined)); event.respondWith(network.catch(async () => (await caches.match(request)) || (await caches.match(url.pathname)) || (await caches.match("/offline")))); return; }
  if (url.pathname.startsWith("/_next/static/")) { const network = fetch(request); event.waitUntil(network.then((response) => response.ok ? putInCache(request, response.clone()) : undefined).catch(() => undefined)); event.respondWith(caches.match(request).then((cached) => cached || network.catch(() => cached || Response.error()))); return; }
  const network = fetch(request); event.waitUntil(network.then((response) => response.ok ? putInCache(request, response.clone()) : undefined).catch(() => undefined)); event.respondWith(network.catch(async () => (await caches.match(request)) || Response.error()));
});
