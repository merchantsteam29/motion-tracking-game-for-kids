// Service worker: lets the web version open offline and be installed on phones/tablets.
// Game code: network first (so updates show up), cached copy when offline.
// Big tracker files, icons and fonts: cached after the first download.
const VERSION = "move-and-play-v1.5.0";
const GAMES = ["fruit", "dodge", "bubbles", "goalie", "moles", "balloon", "freeze", "jacks", "knees", "simon", "jumprope", "rocket", "ski", "wash", "boxing"];
const SHELL = [
  "./", "index.html", "share.html", "style.css", "manifest.webmanifest",
  "js/main.js", "js/fx.js", "js/tracker.js", "js/config.js", "js/share.js", "js/settings.js", "js/settings-ui.js", "js/profile.js", "js/progress.js",
  ...GAMES.map((g) => `js/games/${g}.js`),
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png",
  "vendor/qrcode.js", "vendor/fonts/baloo-2-latin-600-normal.woff2", "vendor/fonts/baloo-2-latin-800-normal.woff2",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => null)))));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;

  if (/\/(vendor|icons)\//.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      }))
    );
    return;
  }

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }))
  );
});
