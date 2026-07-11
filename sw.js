const CACHE_NAME = 'orbitaprs-v2.6';
const TILE_CACHE = 'orbitaprs-tiles-v1';
const TILE_MAX = 2000;

const ASSETS = [
    'index.html',
    'manifest.json',
    'js/app.js',
    'js/ui.js',
    'js/nav.js',
    'js/satellite.js',
    'js/satellite-lib.js',
    'js/aprs.js',
    'js/tnc.js',
    'js/logging.js',
    'js/map.js',
    'css/style.css',
    'icons/icon-192.png',
    'icons/icon-512.png',
];

let tileCacheEnabled = true;

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((k) => k !== CACHE_NAME && k !== TILE_CACHE).map((k) => caches.delete(k))
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SET_TILE_CACHE') {
        tileCacheEnabled = event.data.enabled;
    }
    if (event.data && event.data.type === 'CLEAR_TILE_CACHE') {
        caches.delete(TILE_CACHE);
    }
});

function trimCache(cacheName, maxItems) {
    caches.open(cacheName).then((cache) => {
        cache.keys().then((keys) => {
            if (keys.length > maxItems) {
                cache.delete(keys[0]).then(() => trimCache(cacheName, maxItems));
            }
        });
    });
}

self.addEventListener('fetch', (event) => {
    var url = event.request.url;

    if (url.indexOf('basemaps.cartocdn.com') !== -1 || url.indexOf('tile.openstreetmap.org') !== -1) {
        if (!tileCacheEnabled) {
            event.respondWith(fetch(event.request));
            return;
        }
        event.respondWith(
            caches.open(TILE_CACHE).then((cache) => {
                return cache.match(event.request).then((cached) => {
                    var fetchPromise = fetch(event.request).then((response) => {
                        if (response && response.status === 200) {
                            cache.put(event.request, response.clone());
                            trimCache(TILE_CACHE, TILE_MAX);
                        }
                        return response;
                    }).catch(function () {
                        return cached;
                    });
                    return cached || fetchPromise;
                });
            })
        );
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                if (response && response.status === 200 && response.type === 'basic') {
                    var clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                }
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});
