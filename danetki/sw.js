// Данетки: отдельный офлайн-кэш, 184 загадки по темам.
const CACHE = 'danetki-184-themes-v4';
const ASSETS = ['./', './index.html', './icon.svg', './manifest.webmanifest'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('danetki-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('message', event => {if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('fetch', event=>{
 const req=event.request;
 if(req.method!=='GET'||new URL(req.url).origin!==self.location.origin)return;
 if(new URL(req.url).pathname.endsWith('/danetki/sw.js')){event.respondWith(fetch(req));return}
 event.respondWith(caches.match(req,{ignoreSearch:true}).then(hit=>hit||fetch(req)));
});
