/* Only this public offline document and branding enter Cache Storage.
 * Auth, API, assessment pages, RSC responses and submitted answers never do. */
const CACHE = "mtech-qms-public-v1";
const PUBLIC_ASSETS = ["/offline.html", "/m-tech-hub-logo.jpg", "/pwa/icon/192", "/pwa/icon/512"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PUBLIC_ASSETS)));
  // An updated worker waits until all old tabs close, or the user chooses Update.
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith("mtech-qms-public-") && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener("message", event => {
  if (event.data?.type === "ACTIVATE_UPDATE") event.waitUntil(self.skipWaiting());
});
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => {
      const offline = await caches.match("/offline.html", { cacheName: CACHE });
      const headers = new Headers(offline?.headers);
      headers.set("Content-Type", "text/html; charset=utf-8");
      headers.set("Cache-Control", "no-store");
      headers.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
      return new Response(offline ? await offline.text() : "You are offline. Reconnect and reload to continue.", { status: 503, headers });
    }));
  } else if (!url.search && PUBLIC_ASSETS.includes(url.pathname)) {
    event.respondWith(caches.match(request, { cacheName: CACHE }).then(cached => cached || fetch(request)));
  }
});
