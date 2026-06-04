// Service worker — ระบบพนักงาน (PWA) — network-only กันแอปค้างเวอร์ชันเก่า
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
