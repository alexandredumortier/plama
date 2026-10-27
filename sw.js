'use strict';

const CACHE_NAME = 'plama-v7';

// Tous les fichiers à mettre en cache pour le mode hors-ligne
const ASSETS = [
  '.',
  'index.html',
  'js/maree.js',
  'js/ics.js',
  'js/app.js',
  'js/lib/leaflet.js',
  'js/lib/leaflet.css',
  'js/lib/images/marker-icon.png',
  'js/lib/images/marker-icon-2x.png',
  'js/lib/images/marker-shadow.png',
  'js/lib/images/layers.png',
  'js/lib/images/layers-2x.png',
  'data/ports.json',
  'data/cote.geojson',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

// Installation : mise en cache initiale — NE PAS appeler skipWaiting ici.
// Le client envoie { type: 'SKIP_WAITING' } quand l'utilisateur accepte la mise à jour.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
  );
});

// Activation : suppression des anciens caches, puis prise de contrôle immédiate.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Message du client : l'utilisateur a accepté la mise à jour.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch : cache-first (hors-ligne d'abord, réseau en secours)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then(
      (cached) => cached || fetch(event.request)
    )
  );
});
