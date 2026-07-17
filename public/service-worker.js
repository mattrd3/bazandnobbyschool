const CACHE_NAME = "weekend-golf-v63-push-beta";
const STATIC_ASSETS = [
  "/offline.html",
  "/manifest.webmanifest",
  "/icons/icon-192-v2.png",
  "/icons/icon-512-v2.png",
  "/icons/maskable-512-v2.png",
  "/icons/apple-touch-icon-v2.png"
];
self.addEventListener("install", event => { event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener("activate", event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) { event.respondWith(fetch(request)); return; }
  if (request.mode === "navigate") {
    event.respondWith(fetch(request, { cache: "no-store" }).catch(() => caches.match("/offline.html")));
    return;
  }
  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(caches.match(request).then(cached => cached || fetch(request)));
  }
});

self.addEventListener("push", event => {
  let data = { title:"Weekend Golf", body:"You have a new Weekend Golf notification.", url:"/simple/", tag:"weekend-golf" };
  try { if (event.data) data = { ...data, ...event.data.json() }; } catch (e) { try { data.body = event.data.text(); } catch (_) {} }
  event.waitUntil(self.registration.showNotification(data.title || "Weekend Golf", { body:data.body || "", icon:"/icons/icon-192-v2.png", badge:"/icons/icon-192-v2.png", tag:data.tag || "weekend-golf", data:{ url:data.url || "/simple/" } }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close(); const target = new URL((event.notification.data && event.notification.data.url) || "/simple/", self.location.origin).href;
  event.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(list => { for (const client of list) { if (client.url.startsWith(self.location.origin) && "focus" in client) { client.navigate(target); return client.focus(); } } return clients.openWindow(target); }));
});
