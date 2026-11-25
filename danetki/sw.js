// Данетки 6.0: independent PWA cache, with automatic network refresh and offline fallback.
const CACHE = 'danetki-v6-party-20261125';
const ASSETS = ['./','./index.html','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('danetki-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('message',e=>{if(e.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('fetch',e=>{
 const r=e.request;if(r.method!=='GET'||new URL(r.url).origin!==self.location.origin)return;
 const path=new URL(r.url).pathname;
 if(path.endsWith('/danetki/sw.js')){e.respondWith(fetch(r));return}
 if(r.mode==='navigate'){
  e.respondWith(fetch(r).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(c=>c.put('./index.html',copy)).catch(()=>{});}return response}).catch(()=>caches.open(CACHE).then(c=>c.match('./index.html'))));return;
 }
 e.respondWith(caches.match(r,{ignoreSearch:true}).then(hit=>hit||fetch(r)));
});