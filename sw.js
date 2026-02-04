const CACHE_NAME = 'connect-dots-v3';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './src/style.css',
    './src/main.js',
    './src/Grid.js',
    './src/Generator.js',
    './src/Random.js',
    './icon.png',
    './manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('Opened cache');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            // Cache hit - return response
            if (response) {
                return response;
            }
            // Validating if the request is for navigation (e.g. exact URL not found)
            // Return index.html for navigation requests (SPA support)
            if (event.request.mode === 'navigate') {
                return caches.match('./index.html');
            }
            return fetch(event.request);
        })
    );
});

self.addEventListener('activate', (event) => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});
