/* Lộc Ấn Điều Hành · service worker
 * 1. Android: nhận file chia sẻ từ app khác (Zalo, Gmail, Files…) rồi mở app để xếp vào đơn.
 * 2. Thông báo đẩy (Firebase Cloud Messaging) cho iPhone và Android; lưu lịch sử thông báo trên máy (Cache 'la-tb').
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
  e.waitUntil(Promise.all([
    self.registration.showNotification(d.title || 'Lộc Ấn', {
      body: d.body || '', icon: SCOPE + 'icon-192.png', badge: SCOPE + 'icon-192.png',
      tag: d.tag || undefined, renotify: !!d.tag, data: { link: d.link || '', tag: d.tag || '', nd: d.body || '' }
    }),
    luuTB(d)
  ]));
});

/* Lưu lịch sử thông báo trên máy (200 cái mới nhất) để chuông trong app hiện lại; báo app đang mở tải lại danh sách */
async function luuTB(d) {
  if (d.tag === 'thu') return;
  try {
    const c = await caches.open('la-tb'), k = SCOPE + '_tb', r = await c.match(k), ds = r ? await r.json() : [];
    ds.unshift({ t: Date.now(), td: d.title || 'Lộc Ấn', nd: d.body || '', link: d.link || '', tag: d.tag || '' });
    await c.put(k, new Response(JSON.stringify(ds.slice(0, 200)), { headers: { 'content-type': 'application/json' } }));
    (await self.clients.matchAll({ type: 'window', includeUncontrolled: true })).forEach((w) => w.postMessage({ tb: 1 }));
  } catch (x) {}
}

/* Bấm thông báo: ghi "đích" vào bộ nhớ máy (app đọc khi mở lại, phòng iPhone làm rơi tin nhắn lúc app đang ngủ), rồi đưa app lên và báo mở đúng phần của đơn */
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const dt = e.notification.data || {}, url = new URL(dt.link || '', SCOPE).href;
  const mo = { link: url, tag: dt.tag || '', nd: dt.nd || '', t: Date.now() };
  e.waitUntil((async () => {
    try { const c = await caches.open('la-tb'); await c.put(SCOPE + '_mo', new Response(JSON.stringify(mo), { headers: { 'content-type': 'application/json' } })); } catch (x) {}
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (c.url.startsWith(SCOPE)) { try { await c.focus(); } catch (x) {} c.postMessage({ mo: url, moTB: mo }); return; }
    }
    await self.clients.openWindow(url);
  })());
});
