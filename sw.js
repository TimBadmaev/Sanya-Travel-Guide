// Service Worker Sanya Travel Guide (Итерация 5 «Офлайн и публикация»).
// Лежит в корне: область действия SW — каталог скрипта, на GitHub Pages это
// папка репозитория (ITERATION-5-RESEARCH.md §8.2). Все пути — относительные
// к этому файлу, поэтому работает и в подпапке, и в корне домена.

// ЕДИНСТВЕННАЯ версия кэша. При каждой публикации обновления меняйте это
// значение (README.md, «Как выпустить новую версию»).
const CACHE_VERSION = "v14";

// Префикс нужен, чтобы activate удалял только кэши этого приложения: у всех
// репозиториев на <аккаунт>.github.io общий origin и общее хранилище кэшей.
const CACHE_PREFIX = "sanya-guide-";
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;

// Явный precache: всё, что нужно приложению для запуска без сети. Сборки нет
// (D-23) — новый файл приложения нужно вписать сюда вручную.
const PRECACHE = [
  "./index.html",
  "./manifest.webmanifest",
  "./css/styles.css",
  "./js/app.js",
  "./js/pwa.js",
  "./js/data.js",
  "./js/storage.js",
  "./js/logic/amap.js",
  "./js/logic/checklist.js",
  "./js/logic/distance.js",
  "./js/logic/expenses.js",
  "./js/logic/filters.js",
  "./js/logic/geo.js",
  "./js/logic/myplan.js",
  "./js/logic/plan.js",
  "./js/logic/trip.js",
  "./js/views/excursions.js",
  "./js/views/expenses.js",
  "./js/views/food.js",
  "./js/views/handy.js",
  "./js/views/home.js",
  "./js/views/info.js",
  "./js/views/place.js",
  "./js/views/places.js",
  "./js/views/plan.js",
  "./js/views/prepare.js",
  "./js/views/recommended.js",
  "./js/views/settings.js",
  "./js/views/task.js",
  "./js/views/taxi.js",
  "./data/checklist.json",
  "./data/config.json",
  "./data/contacts.json",
  "./data/excursions.json",
  "./data/food.json",
  "./data/info.json",
  "./data/phrases.json",
  "./data/places.json",
  "./data/plan.json",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-maskable-512.png",
  "./assets/icons/apple-touch-icon-180.png",
  // Фото мест (Итерация 7): каждый файл assets/photos/ — отдельной строкой.
  "./assets/photos/nanshan-cultural-zone-1.webp",
  "./assets/photos/tianya-haijiao-1.webp",
  "./assets/photos/tianya-haijiao-2.webp",
  "./assets/photos/wuzhizhou-island-1.webp",
  "./assets/photos/yalong-bay-beach-1.webp",
  "./assets/photos/yalong-tropical-forest-park-1.webp",
  // Итерация 8, Content Batch 1.
  "./assets/photos/luhuitou-park-1.webp",
  "./assets/photos/dadonghai-beach-1.webp",
  // Контентный проход 2026-09 (CONTENT-EXPANSION-2026-09.md).
  "./assets/photos/sanya-bay-beach-1.webp",
  "./assets/photos/daxiaodongtian-1.webp",
  // Контентный проход Batch 2 (CONTENT-EXPANSION-BATCH-2-2026-09.md).
  "./assets/photos/atlantis-aquaventure-1.webp",
  "./assets/photos/sanya-city-library-1.webp",
];

const INDEX_URL = "./index.html";

self.addEventListener("install", (event) => {
  // cache: "reload" — мимо HTTP-кэша браузера: GitHub Pages отдаёт файлы с
  // max-age=600, и без этого новая версия могла бы закэшировать старые файлы.
  // skipWaiting() здесь не вызывается: новая версия ждёт подтверждения
  // пользователя (сообщение SKIP_WAITING из js/pwa.js).
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: "reload" }))))
  );
});

self.addEventListener("activate", (event) => {
  // Старые версии кэша удаляются; clients.claim() берёт под контроль уже
  // открытую страницу первого визита — экраны, чьи JSON ещё не загружены,
  // тоже получат их из кэша, если сеть пропадёт в этой же сессии.
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
  } else if (data.type === "GET_VERSION" && event.ports[0]) {
    event.ports[0].postMessage(CACHE_VERSION);
  }
});

// Cache-first только для своих GET-запросов. Внешние запросы не
// перехватываются (их в приложении нет, D-28); в рантайме ничего не
// докладывается в кэш — только precache.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  if (new URL(request.url).origin !== self.location.origin) return;

  // Hash-роутинг (D-24): единственный документ приложения — index.html.
  const lookup = request.mode === "navigate" ? INDEX_URL : request;
  event.respondWith(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.match(lookup, { ignoreVary: true }))
      .then((cached) => cached || fetch(request))
  );
});
