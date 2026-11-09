// Optional high-detail OSM neighborhoods. These files are deliberately NOT
// in Service Worker precache. Download only after a human taps a button.
// A separate cache survives normal v35 app updates and stays offline until
// the browser evicts it or the user explicitly deletes it.
export const MAP_DETAIL_IDS = ["yalong", "city", "dadonghai", "haitang", "tianya"];
export const MAP_DETAIL_CACHE = "sanya-detail-v35";

function urlFor(id) {
  if (!MAP_DETAIL_IDS.includes(id)) throw new Error("Неизвестный район карты");
  return new URL("data/sanya-detail-" + id + ".json", document.baseURI).href;
}
function validate(data, id) {
  if (data?.version !== 1 || data?.area !== id ||
      !Array.isArray(data.land) || !Array.isArray(data.buildings) ||
      !Array.isArray(data.coast) || !String(data.source).includes("OpenStreetMap")) {
    throw new Error("Детализация района повреждена: " + id);
  }
  return data;
}
export async function loadCachedMapDetail(id) {
  const cache = await caches.open(MAP_DETAIL_CACHE);
  const response = await cache.match(urlFor(id));
  return response ? validate(await response.json(), id) : null;
}
export async function downloadMapDetail(id) {
  const url = urlFor(id);
  // Read from network only on explicit request; validate before retaining.
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("Не удалось загрузить район: HTTP " + response.status);
  const data = validate(await response.clone().json(), id);
  const cache = await caches.open(MAP_DETAIL_CACHE);
  await cache.put(url, response);
  return data;
}
export async function clearCachedMapDetails() {
  await caches.delete(MAP_DETAIL_CACHE);
}
