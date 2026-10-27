/* Only public installation assets are cached. Never cache APIs, authenticated
   HTML, customer records, photos, navigation destinations or Clerk requests. */
const CACHE = "alagua-shell-v1";
const ASSETS = ["/offline.html", "/app-icons/icon-192.png", "/app-icons/icon-512.png", "/app-icons/maskable-512.png", "/app-icons/apple-touch-icon.png"];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("alagua-shell-") && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => (await caches.match("/offline.html")) || new Response("Sin conexión. Vuelve a conectarte para abrir AL’AGUA DOGS.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } })));
  } else if (!url.search && ASSETS.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
  }
});
