// Service worker: app shell in cache, così l'app si apre anche offline (es. al supermercato senza campo).
// Cambia VERSION a ogni modifica dei file per forzare l'aggiornamento.
const VERSION = "v4";
const SHELL = ["./", "index.html", "css/app.css", "js/app.js", "js/store.js", "js/planner.js", "js/shopping.js",
  "js/util.js", "js/seed.js", "js/sync.js", "js/config.js", "manifest.webmanifest", "icons/icon-192.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// network-first: online prende sempre l'ultima versione, offline usa la cache
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  // libreria Supabase da CDN: versione fissa, quindi cache-first (serve per aprire l'app offline)
  if (url.hostname === "cdn.jsdelivr.net") {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return res;
    })));
    return;
  }
  if (url.origin !== location.origin) return; // le chiamate a Supabase non passano dalla cache
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
