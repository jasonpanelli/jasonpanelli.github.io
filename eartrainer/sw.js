const CACHE_NAME = 'harmony-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  'https://cdnjs.cloudflare.com/ajax/libs/tone/14.8.49/Tone.js',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('fetch', e => {
  // Pass-through for POST requests to Google Sheets
  if (e.request.method === 'POST') return;
  
  e.respondWith(
    caches.match(e.request).then(response => response || fetch(e.request))
  );
});