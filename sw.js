// ============================================================================
// SERVICE WORKER - Offline Mode & Caching Strategy
// ============================================================================

const CACHE_NAME = 'pedi-locator-v1';
const RUNTIME_CACHE = 'pedi-runtime-v1';
const API_CACHE = 'pedi-api-v1';
const IMAGE_CACHE = 'pedi-images-v1';

const URLS_TO_CACHE = [
  '/',
  '/index.html',
  '/app.js',
  '/style.css',
  '/manifest.json',
  '/sw.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet.markercluster@1.5.0/dist/MarkerCluster.css',
  'https://unpkg.com/leaflet.markercluster@1.5.0/dist/MarkerCluster.Default.css',
  'https://unpkg.com/leaflet.markercluster@1.5.0/dist/leaflet.markercluster.js',
  'https://unpkg.com/opening_hours/build/opening_hours.min.js'
];

// Install event - cache core files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(URLS_TO_CACHE).catch(err => {
          console.warn('Some assets failed to cache on install:', err);
          // Continue even if some fail
          return Promise.resolve();
        });
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME && 
              cacheName !== RUNTIME_CACHE && 
              cacheName !== API_CACHE &&
              cacheName !== IMAGE_CACHE) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - caching strategies
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin requests and chrome extensions
  if (url.origin !== location.origin && url.protocol !== 'chrome-extension:') {
    // For external resources, use network first with cache fallback
    return event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.status === 200) {
            // Cache images separately
            if (request.destination === 'image' || url.pathname.includes('png') || url.pathname.includes('jpg')) {
              const cache = caches.open(IMAGE_CACHE).then(c => {
                c.put(request, response.clone());
                return response;
              });
              return cache;
            } else if (url.hostname.includes('openstreetmap') || url.hostname.includes('arcgisonline') || url.hostname.includes('opentopomap')) {
              // Cache map tiles
              const cache = caches.open(RUNTIME_CACHE).then(c => {
                c.put(request, response.clone());
                return response;
              });
              return cache;
            }
          }
          return response;
        })
        .catch(() => {
          // Network failed, try cache
          return caches.match(request).then(response => {
            if (response) {
              return response;
            }
            // Return offline page/response for images
            if (request.destination === 'image') {
              return new Response(
                '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="#f0f0f0" width="100" height="100"/><text x="50" y="50" text-anchor="middle" dy=".3em" font-family="Arial" font-size="12" fill="#999">Offline</text></svg>',
                { headers: { 'Content-Type': 'image/svg+xml' } }
              );
            }
            return response;
          });
        })
    );
  }

  // Handle API calls
  if (url.pathname.includes('/api/') || url.hostname.includes('overpass')) {
    return event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.status === 200 && request.method === 'GET') {
            caches.open(API_CACHE).then(cache => {
              cache.put(request, response.clone());
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(request).then(response => {
            if (response) {
              return response;
            }
            return new Response(
              JSON.stringify({ offline: true, message: 'You are offline. Cached data will be used.' }),
              { 
                headers: { 'Content-Type': 'application/json' },
                status: 503
              }
            );
          });
        })
    );
  }

  // Handle document requests
  if (request.mode === 'navigate' || request.destination === 'document') {
    return event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.status === 200) {
            caches.open(RUNTIME_CACHE).then(cache => {
              cache.put(request, response.clone());
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(request).then(response => {
            return response || caches.match('/index.html');
          });
        })
    );
  }

  // For everything else, try network first, then cache
  return event.respondWith(
    fetch(request)
      .then(response => {
        if (response && response.status === 200 && request.method === 'GET') {
          const cache = request.url.includes('overpass') ? API_CACHE : RUNTIME_CACHE;
          caches.open(cache).then(c => {
            c.put(request, response.clone());
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(request).then(response => {
          if (response) {
            return response;
          }
          // Return a basic offline response
          return new Response('Offline - Resource not available', {
            status: 503,
            statusText: 'Service Unavailable'
          });
        });
      })
  );
});

// Background sync for user reports (when connectivity returns)
self.addEventListener('sync', event => {
  if (event.tag === 'sync-reports') {
    event.waitUntil(
      clients.matchAll().then(clientList => {
        clientList.forEach(client => {
          client.postMessage({
            type: 'SYNC_REPORTS',
            message: 'Syncing reports from offline queue...'
          });
        });
      })
    );
  }
});

// Message handler for clearing caches
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then(cacheNames => {
      Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    });
  }
});

// Version check
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'CHECK_UPDATE') {
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'UPDATE_AVAILABLE',
          message: 'New version available. Please refresh.'
        });
      });
    });
  }
});
