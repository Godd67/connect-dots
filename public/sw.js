const CACHE_NAME = 'connect-dots-v22';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    if (typeof caches === 'undefined') {
        console.warn('Caches API not available (Incognito mode?)');
        return;
    }
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('Opened cache');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

self.addEventListener('activate', (event) => {
    if (typeof caches === 'undefined') {
        return;
    }
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
    const url = new URL(event.request.url);

    // Skip API requests and cross-origin requests (e.g., Cloudflare Insights)
    // Intercepting cross-origin requests often triggers CORS/SRI failures.
    if (url.origin !== self.location.origin || url.pathname.includes('/api/')) {
        return;
    }

    if (typeof caches === 'undefined') {
        event.respondWith(fetch(event.request));
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
                    // For non-navigation non-cached requests, return a 503
                    return new Response('Service Unavailable', { status: 503 });
                });
            })
    );
});
