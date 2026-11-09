// Explicitly saved narration lives in its own cache, separate from PWA precache.
// Do not use a "sanya-guide-" prefix: sw.js removes old app caches on upgrade.
export const AUDIO_CACHE = "sanya-audio-offline-v1";
export const AUDIO_MIN_BYTES = 10000;

export function guideAudioUrl(guide) {
  if (!guide || !/^assets\/audio\/[a-z0-9-]+\.mp3$/.test(guide.audio || "")) {
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
  // GitHub Pages serves the prerecorded MP3s. Reject an HTML error page.
  if (blob.size < AUDIO_MIN_BYTES || /text\/html|application\/json/i.test(blob.type)) {
    throw new Error("Вместо аудиофайла пришёл неверный ответ.");
  }
  try {
    await cache.put(url, new Response(blob, {
      status: 200,
      headers: { "Content-Type": "audio/mpeg", "Content-Length": String(blob.size) }
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
