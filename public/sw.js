/**
 * ChaletWeShare — Service Worker
 * Handles Web Push notifications and basic offline asset caching.
 */

const CACHE_NAME = 'chalet-cache-v10';
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './favicon-v2.svg',
  './favicon-v2.png',
  './app-icon-180-v2.png',
  './app-icon-192-v2.png',
  './app-icon-512-v2.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[SW] Pre-caching warning (non-fatal):', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// Network-First with Cache Fallback for navigation & static assets
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // 1. Never intercept non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // 2. Bypass Service Worker cache completely for API endpoints and version polling
  if (url.pathname.includes('/api/') || url.pathname.endsWith('version.json') || url.searchParams.has('nocache')) {
    return;
  }

  // 3. Navigation requests (HTML document): Network-first, fallback to cached index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const fallback = await caches.match('./index.html') || await caches.match('./');
          return fallback || Response.error();
        })
    );
    return;
  }

  // 4. Static assets (JS, CSS, fonts, images): Network-first with cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache valid 200 responses from same-origin or fonts (cors/opaque)
        if (response && (response.status === 200 || response.type === 'opaque')) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) {
          return cached;
        }
        return Response.error();
      })
  );
});

// Push notification received
self.addEventListener('push', (event) => {
  let data = {
    title: 'Chalet Zahler',
    body: 'Neue Aktivität im Chalet Zahler.',
  };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (err) {
      data.body = event.data.text();
    }
  }

  const title = data.title || 'Chalet Zahler';
  const dynamicTag = data.tag || (data.data && data.data.tag) || (data.data && data.data.reservation_id ? 'res-' + data.data.reservation_id : 'chalet-' + Date.now());
  const isSilent = !!(data.silent || (data.data && data.data.silent));
  const shouldRenotify = typeof data.renotify === 'boolean' 
    ? data.renotify 
    : (data.data && typeof data.data.renotify === 'boolean' ? data.data.renotify : !isSilent);

  const options = {
    body: data.body || 'Neue Benachrichtigung.',
    icon: './app-icon-192-v2.png',
    badge: './app-icon-192-v2.png',
    data: data.data || {},
    vibrate: isSilent ? [] : [100, 50, 100],
    tag: dynamicTag,
    renotify: shouldRenotify,
    silent: isSilent,
  };

  // Broadcast to open clients
  self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    clients.forEach((client) => {
      client.postMessage({
        type: 'PUSH_RECEIVED',
        data: data
      });
    });
  });

  // Update App Badge in background (iOS Safari 16.4+ / desktop PWA)
  const unreadCount = (data.data && typeof data.data.unread_count === 'number')
    ? data.data.unread_count
    : undefined;

  const badgePromise = (async () => {
    if ('setAppBadge' in navigator) {
      try {
        if (typeof unreadCount === 'number') {
          if (unreadCount > 0) {
            await navigator.setAppBadge(unreadCount);
          } else {
            await navigator.clearAppBadge();
          }
        } else {
          await navigator.setAppBadge();
        }
      } catch (e) {
        // Silently ignore if badging is not permitted or fails
      }
    }
  })();

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      badgePromise
    ])
  );
});

// Notification click — deep-link to relevant reservation/date
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const notifData = event.notification.data || {};

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Try to focus an existing window and send it the deep-link payload
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.postMessage({
            type: 'NOTIFICATION_CLICK',
            data: notifData
          });
          return client.focus();
        }
      }
      // No existing window — open new one with deep-link hash
      let url = './';
      if (notifData.reservation_id) {
        url = `./#/reservation/${notifData.reservation_id}`;
      } else if (notifData.date) {
        url = `./#/date/${notifData.date}`;
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});
