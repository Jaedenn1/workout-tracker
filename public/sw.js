const CACHE = "workout-tracker-v1.2.3-r2";
const CORE_SHELL = ["/", "/offline", "/icon.svg"];
const OPTIONAL_SHELL = ["/gym", "/history", "/progress", "/bodyweight", "/data", "/health", "/watch"];

async function putInCache(request, response) {
  if (!response || !response.ok) return;
  const cache = await caches.open(CACHE);
  await cache.put(request, response);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(CORE_SHELL);
      await Promise.allSettled(OPTIONAL_SHELL.map((path) => cache.add(path)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok) {
            event.waitUntil(putInCache(request, response.clone()).catch(() => undefined));
          }
          return response;
        } catch {
          return (
            (await caches.match(request)) ||
            (await caches.match(url.pathname)) ||
            (await caches.match("/offline"))
          );
        }
      })(),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        const refresh = fetch(request)
          .then(async (response) => {
            if (response.ok) {
              await putInCache(request, response.clone());
            }
            return response;
          })
          .catch(() => cached);

        if (cached) {
          event.waitUntil(refresh.then(() => undefined).catch(() => undefined));
          return cached;
        }
        return refresh;
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      try {
        const response = await fetch(request);
        if (response.ok) {
          event.waitUntil(putInCache(request, response.clone()).catch(() => undefined));
        }
        return response;
      } catch {
        return cached || Response.error();
      }
    })(),
  );
});
