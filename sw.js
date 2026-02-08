const CACHE_NAME = 'connect-dots-v6';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './src/style.css',
    './src/main.js',
    './src/Grid.js',
    './src/Generator.js',
    './src/Random.js',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './manifest.json'
];

self.addEventListener('install', (event) => {
    self.skipWaiting(); // Force this SW to become active immediately
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('Opened cache');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        Promise.all([
            self.clients.claim(), // Take control of all open clients immediately
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME) {
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
        ])
    );
});

self.addEventListener('fetch', (event) => {
    // Skip API requests - let the browser handle them directly
    if (event.request.url.includes('/api/')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                // If network fetch succeeds, update the cache and return
                return caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, networkResponse.clone());
                    return networkResponse;
                });
            })
            .catch(() => {
                // If network fails (offline), return from cache
                return caches.match(event.request).then((cachedResponse) => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    // Fallback for navigation (offline SPA support)
                    if (event.request.mode === 'navigate') {
                        return caches.match('./index.html');
                    }
                });
            })
    );
});
