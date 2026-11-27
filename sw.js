/* Lộc Ấn Điều Hành · service worker
 * 1. Android: nhận file chia sẻ từ app khác (Zalo, Gmail, Files…) rồi mở app để xếp vào đơn.
 * 2. Thông báo đẩy (Firebase Cloud Messaging) cho iPhone và Android.
 * Không lưu tạm giao diện: app luôn lấy bản mới nhất từ mạng.
 */
const CHIA = 'la-chia';
const SCOPE = self.registration.scope;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  /* Mở app / tải lại: luôn lấy giao diện mới nhất từ mạng (bỏ qua bộ nhớ 10 phút của GitHub Pages) */
  if (e.request.mode === 'navigate' && e.request.method === 'GET' && u.origin === self.location.origin) {
    e.respondWith(fetch(e.request.url, { cache: 'no-store', credentials: 'same-origin' }).catch(() => fetch(e.request)));
    return;
  }
  if (e.request.method !== 'POST' || !u.pathname.endsWith('/chia-se')) return;
  e.respondWith((async () => {
    try {
      const fd = await e.request.formData(), t = Date.now();
      const files = fd.getAll('file').filter((f) => f && typeof f === 'object' && 'size' in f);
      const c = await caches.open(CHIA);
      await Promise.all(files.map((f, i) => c.put(new Request(SCOPE + '_chia/' + t + '-' + i), new Response(f, {
        headers: { 'content-type': f.type || 'application/octet-stream', 'x-ten': encodeURIComponent(f.name || 'file-' + (i + 1)), 'x-luc': String(t) }
      }))));
    } catch (err) { /* không đọc được file: vẫn mở app */ }
    return Response.redirect(SCOPE + '?chia=1', 303);
  })());
});

self.addEventListener('push', (e) => {
  let p = {};
  try { p = e.data ? e.data.json() : {}; } catch (x) { p = { data: { body: e.data ? e.data.text() : '' } }; }
  const d = Object.assign({}, p.notification || {}, p.data || {});
  e.waitUntil(self.registration.showNotification(d.title || 'Lộc Ấn', {
    body: d.body || '', icon: SCOPE + 'icon-192.png', badge: SCOPE + 'icon-192.png',
    tag: d.tag || undefined, renotify: !!d.tag, data: { link: d.link || '' }
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.link) || '', SCOPE).href;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (c.url.startsWith(SCOPE)) { try { await c.focus(); } catch (x) {} c.postMessage({ mo: url }); return; }
    }
    await self.clients.openWindow(url);
  })());
});
