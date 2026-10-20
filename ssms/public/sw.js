// Service worker — push notifications, an offline page, and the few pages that
// work without a network: roll call and grade entry for teachers, and the
// exam page (an exam that loses its connection keeps going). Those pages are
// always loaded from the network when there is one; the copy kept here is
// used only when there is not. Their data is kept by the pages themselves
// (lib/education/client, app/exam). Other pages are never kept.

const CACHE = 'hamere-hiwot-shell-v2';
/** Pages that open offline — dropped on sign-out (lib/education/client resetEducation) */
const PAGES = 'hamere-hiwot-pages-v1';
/** The app's own JavaScript, CSS and fonts (file names change with every version) */
const STATIC = 'hamere-hiwot-static-v1';
const OFFLINE_URL = '/offline.html';
const OFFLINE_PAGES = ['/dashboard/education/attendance/roll-call', '/dashboard/education/grades', '/dashboard/education/attendance', '/exam'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([OFFLINE_URL, '/icons/icon-192.png'])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => ![CACHE, PAGES, STATIC].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // The app's files: kept once loaded (their names change when they change)
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.open(STATIC).then((cache) =>
        cache.match(request).then(
          (hit) =>
            hit ||
            fetch(request).then((res) => {
              if (res.ok) cache.put(request, res.clone());
              return res;
            })
        )
      )
    );
    return;
  }

  if (request.mode !== 'navigate') return;
  const offlinePage = OFFLINE_PAGES.includes(url.pathname.replace(/\/$/, ''));
  event.respondWith(
    fetch(request)
      .then((res) => {
        // Keep a fresh copy of the offline pages (not a redirect to the sign-in page)
        if (offlinePage && res.ok && !res.redirected) {
          const copy = res.clone();
          caches.open(PAGES).then((cache) => cache.put(url.pathname, copy));
        }
        return res;
      })
      .catch(async () => (offlinePage && (await caches.open(PAGES).then((c) => c.match(url.pathname)))) || caches.match(OFFLINE_URL))
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Hamere Hiwot', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      tag: data.tag,
      data: { url: data.url || '/dashboard' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/dashboard', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => w.url.startsWith(self.location.origin));
      if (open) return open.focus().then((w) => (w && 'navigate' in w ? w.navigate(url) : w));
      return self.clients.openWindow(url);
    })
  );
});
