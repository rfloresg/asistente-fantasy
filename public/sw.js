// Service worker mínimo: hace la web instalable. No guarda nada: los datos siempre son los de ahora.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
