// Explicitly saved narration lives in its own cache, separate from PWA precache.
// Do not use a "sanya-guide-" prefix: sw.js removes old app caches on upgrade.
export const AUDIO_CACHE = "sanya-audio-offline-v1";
export const AUDIO_MIN_BYTES = 10000;

export function guideAudioUrl(guide) {
  if (!guide || !/^assets\/audio-v3\/[a-z0-9-]+\.m4a$/.test(guide.audio || "")) {
    throw new Error("Некорректный путь к аудиогиду");
  }
  return new URL(guide.audio, document.baseURI).href;
}

export function audioCacheAvailable() {
  return "caches" in window && window.isSecureContext;
}

export async function isAudioSaved(guide) {
  if (!audioCacheAvailable()) return false;
  const cache = await caches.open(AUDIO_CACHE);
  return Boolean(await cache.match(guideAudioUrl(guide)));
}

export async function savedAudioBlob(guide) {
  if (!audioCacheAvailable()) return null;
  const cache = await caches.open(AUDIO_CACHE);
  const response = await cache.match(guideAudioUrl(guide));
  return response ? response.blob() : null;
}

export async function offlineGuideIds(guides) {
  if (!audioCacheAvailable()) return new Set();
  const cache = await caches.open(AUDIO_CACHE);
  const keys = await cache.keys();
  const saved = new Set(keys.map((req) => new URL(req.url).pathname));
  return new Set(Object.entries(guides).filter(([, guide]) =>
    saved.has(new URL(guideAudioUrl(guide)).pathname)).map(([id]) => id));
}

export async function saveAudio(guide, { signal } = {}) {
  if (!audioCacheAvailable()) {
    throw new Error("На этом устройстве недоступно офлайн-хранилище. Откройте приложение через HTTPS или с домашнего экрана.");
  }
  const url = guideAudioUrl(guide);
  const cache = await caches.open(AUDIO_CACHE);
  if (await cache.match(url)) return 0;
  const response = await fetch(url, { signal, cache: "no-store" });
  if (!response.ok) throw new Error(`Аудиофайл не найден (HTTP ${response.status}).`);
  const blob = await response.blob();
  // GitHub Pages serves original recorded M4A files. Reject HTML error pages.
  if (blob.size < AUDIO_MIN_BYTES || /text\/html|application\/json/i.test(blob.type)) {
    throw new Error("Вместо аудиофайла пришёл неверный ответ.");
  }
  try {
    await cache.put(url, new Response(blob, {
      status: 200,
      headers: { "Content-Type": "audio/mp4", "Content-Length": String(blob.size) }
    }));
  } catch {
    throw new Error("Недостаточно свободного места для сохранения аудио.");
  }
  return blob.size;
}

export async function removeAudio(guide) {
  if (!audioCacheAvailable()) return false;
  const cache = await caches.open(AUDIO_CACHE);
  return cache.delete(guideAudioUrl(guide));
}

// Retired v31 recordings are NEVER erased silently. The user can choose to
// reclaim their storage from the audio-guide catalog when online and ready.
export async function legacyAudioCacheInfo() {
  if (!audioCacheAvailable()) return {count:0,bytes:0};
  const cache=await caches.open(AUDIO_CACHE);
  const entries=(await cache.keys()).filter(req=>/\/assets\/audio(?:-v2)?\/[a-z0-9-]+\.(?:mp3|m4a)$/.test(new URL(req.url).pathname));
  let bytes=0;
  for(const req of entries) {
    const r=await cache.match(req);
    if(r)bytes+=(await r.blob()).size;
  }
  return {count:entries.length,bytes};
}
export async function clearLegacyAudioCache() {
  if (!audioCacheAvailable()) return 0;
  const cache=await caches.open(AUDIO_CACHE);
  const entries=(await cache.keys()).filter(req=>/\/assets\/audio(?:-v2)?\/[a-z0-9-]+\.(?:mp3|m4a)$/.test(new URL(req.url).pathname));
  for(const req of entries)await cache.delete(req);
  return entries.length;
}
