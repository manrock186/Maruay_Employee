// Service worker — ระบบพนักงาน (PWA)
// network-only กันแอปค้างเวอร์ชันเก่า + รองรับ push notification

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});

// ---- รับ push แล้วเด้งแจ้งเตือน ----
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'ระบบพนักงาน';
  const options = {
    body: data.body || '',
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: data.tag || undefined,        // แจ้งเตือนเรื่องเดียวกันรวมเป็นใบเดียว
    renotify: !!data.tag,
    data: { url: data.url || '/', type: data.type || null, businessId: data.businessId || null },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// ---- คลิกแจ้งเตือน → โฟกัสแอปเดิม หรือเปิดใหม่ ----
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          if ('navigate' in client && target && target !== '/') { try { client.navigate(target); } catch (e) {} }
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
