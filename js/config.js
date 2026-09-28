// Where the game lives online. Change this if your GitHub name is different.
export const SITE_URL = "https://merchantsteam29.github.io/motion-tracking-game/";

// When the page is already online, use its real address so shared links always match.
export function siteUrl() {
  const local = /^(localhost|127\.|\[::1\])/.test(location.hostname);
  return location.protocol === "https:" && !local ? new URL("./", location.href).href : SITE_URL;
}

// Offline support + "install as an app" (only on real web pages, not inside the Windows app).
export function registerServiceWorker() {
  const ok = "serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost");
  if (ok) navigator.serviceWorker.register("sw.js").catch(() => { /* optional */ });
}
