// Lharmonie Dashboard service worker — cache pasivo de la shell.
// No cachea ni APIs ni Sheets — solo assets estáticos del shell.
const CACHE = 'lharmonie-dash-v1';
const SHELL = ['/', '/icon-192.png', '/icon-512.png', '/manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Nunca cachear APIs, OAuth ni Sheets.
  if (
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('accounts.google.com') ||
    url.hostname.includes('fonts.g')
  ) {
    return;
  }
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
