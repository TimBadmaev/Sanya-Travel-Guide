// Независимый офлайн-кэш данеток, редакция классики.
const CACHE = 'danetki-100-curated-v2';
const ASSETS = ['./', './index.html', './icon.svg', './manifest.webmanifest'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('danetki-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => { const r=event.request; if(r.method !== 'GET' || new URL(r.url).origin !== location.origin) return; event.respondWith(caches.match(r,{ignoreSearch:true}).then(hit => hit || fetch(r))); });
