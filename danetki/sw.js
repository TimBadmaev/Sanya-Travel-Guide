// Данетки: независимый офлайн-кэш, с ручным обновлением.
const CACHE = 'danetki-100-curated-v3-update-button';
const ASSETS = ['./', './index.html', './icon.svg', './manifest.webmanifest'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('danetki-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('message', event => {
  if(event.data && event.data.type==='SKIP_WAITING')self.skipWaiting();
});
self.addEventListener('fetch', event => {
  const request=event.request;
  if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin)return;
  // Файл версии всегда берём из сети, чтобы проверка не показала устаревший код.
  if(new URL(request.url).pathname.endsWith('/danetki/sw.js')){
    event.respondWith(fetch(request));return;
  }
  event.respondWith(caches.match(request,{ignoreSearch:true}).then(hit=>hit||fetch(request)));
});
