// Minimal service worker: makes the app installable. Requests go straight to
// the network; offline support is out of scope for V1.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
