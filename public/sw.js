/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const CACHE_NAME = 'forfettario-pwa-cache-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/src/main.tsx',
  '/src/App.tsx',
  '/src/types.ts',
  '/src/index.css'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('Pre-caching assets failed in Service Worker:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const requestUrl = event.request.url;

  // Do not intercept mutations, Firestore database synchronization endpoints, auth flow, or dev server WebSockets
  // Only handle http/https requests
  if (
    !requestUrl.startsWith('http') ||
    event.request.method !== 'GET' ||
    requestUrl.includes('firestore.googleapis.com') ||
    requestUrl.includes('googleapis.com') ||
    requestUrl.includes('firebase') ||
    requestUrl.includes('identitytoolkit') ||
    requestUrl.includes('/ws') ||
    requestUrl.includes('localhost')
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Dynamic stale-while-revalidate background caching update
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse.status === 200 && event.request.url.startsWith('http')) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseToCache);
              }).catch(e => console.warn('Cache put failed', e));
            }
          })
          .catch(() => {
            // Silently ignore network down for stale-while-revalidate background fetches
          });
        return cachedResponse;
      }

      return fetch(event.request)
        .then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }

          const responseToCache = networkResponse.clone();
          
          // Verify URL is http/https before caching to prevent scheme errors
          if (event.request.url.startsWith('http')) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }

          return networkResponse;
        })
        .catch(() => {
          // If offline and request is page navigation, serve the SPA shell
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
    })
  );
});
