'use strict';

const CACHE_NAME = 'plama-v3';

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

// Installation : mise en cache initiale de tous les assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activation : suppression des anciens caches
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

// Fetch : cache-first (hors-ligne d'abord, réseau en secours)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then(
      (cached) => cached || fetch(event.request)
    )
  );
});
