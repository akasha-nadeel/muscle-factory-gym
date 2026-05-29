// Minimal service worker — exists ONLY to satisfy PWA installability so
// Chrome/Edge reliably show the "Install" icon in the address bar.
//
// It deliberately does NOT cache any responses. This is a live admin/auth
// app (members, payments, check-ins) where serving stale cached data would
// be harmful. The empty fetch listener lets every request go straight to
// the network — its mere presence is what makes the app installable.
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);

self.addEventListener("fetch", () => {
  // Intentionally no-op: pass through to the network. No caching.
});
