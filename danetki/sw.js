// Независимый офлайн-кэш игры «Данетки».
const CACHE = 'danetki-100-v1';
const ASSETS = ['./', './index.html', './icon.svg', './manifest.webmanifest'];
self.addEventListener('install', event => {
 event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
 event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('danetki-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
 const req=event.request;
 if(req.method!=='GET' || new URL(req.url).origin!==location.origin) return;
 event.respondWith(caches.match(req,{ignoreSearch:true}).then(hit=>hit||fetch(req)));
});
