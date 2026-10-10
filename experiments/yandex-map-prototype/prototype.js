// Изолированный прототип: настоящая карта Яндекса (JavaScript API 3.0) для
// «Паспорта исследователя». В приложение не подключён и его не меняет.
//
// Данные — только чтение актуальных файлов каталога (../../data/*.json);
// правило «какое место к какой части побережья относится» и разбор отметок
// берутся из модулей приложения (../../js/logic/*.js), копий здесь нет.
// API-ключ живёт в памяти страницы: не пишется в localStorage,
// sessionStorage, адрес страницы и консоль.

import { coastPartOf, getVisit, normalizePassportState, prepareContent } from "../../js/logic/passport.js";
import { isValidLocation } from "../../js/logic/amap.js";

const API_URL = "https://api-maps.yandex.ru/v3/";
// Официальные пакеты API грузятся с CDN — так в документации Яндекса
// (https://yandex.ru/maps-api/docs/js-api/ref/packages/index.html).
const PACKAGE_CDN = "https://cdn.jsdelivr.net/npm/{package}";
const CLUSTERER_PACKAGE = "@yandex/ymaps3-clusterer";
const CLUSTERER_VERSION = "0.0";
const API_TIMEOUT_MS = 25000;
const PACKAGE_TIMEOUT_MS = 12000;
const CLUSTER_GRID_PX = 64;
const FOCUS_ZOOM = 15;
const MAP_MARGIN = [48, 32, 48, 32];
const DEMO_EVERY = 3;

// Эмодзи категории — деталь отображения по ключу config.categories[].icon,
// как CATEGORY_ICONS в js/views/places.js.
const CATEGORY_ICONS = { beach: "🏖️", nature: "🌿", culture: "🏛️", entertainment: "🎭", market: "🛒", shopping: "🛍️" };
const DEFAULT_ICON = "📍";

const MARKS = { PASSPORT: "passport", DEMO: "demo", NONE: "none" };

const $ = (id) => document.getElementById(id);
const els = {
  keyPanel: $("key-panel"),
  keyInput: $("api-key"),
  loadButton: $("load-map"),
  status: $("status"),
  counter: $("counter"),
  views: $("views"),
  map: $("map"),
  placeholder: $("map-placeholder"),
  zoomIn: $("zoom-in"),
  zoomOut: $("zoom-out"),
  selected: $("selected"),
  selectedBody: $("selected-body"),
  marks: $("marks"),
  filter: $("list-filter"),
  list: $("list"),
};

const state = {
  places: [],
  located: [],
  categories: new Map(),
  parts: [],
  partOf: new Map(),
  passportVisits: new Set(),
  marksMode: MARKS.DEMO,
  selectedId: null,
  map: null,
  api: null,
  clustered: false,
  loading: false,
  markerEls: new Map(),
  filter: "",
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function setStatus(kind, text) {
  els.status.dataset.state = kind;
  els.status.textContent = text;
}

function setMapState(kind, text) {
  els.map.dataset.state = kind;
  if (text) els.placeholder.textContent = text;
}

// ------------------------------------------------------------ данные

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
}

// Отметки паспорта этого браузера — только чтение. Страница прототипа обычно
// открыта с другого адреса, чем приложение, и своего паспорта не видит.
function readPassportVisits(places) {
  let raw = null;
  try {
    raw = window.localStorage.getItem("stg:passport");
  } catch (e) {
    return new Set();
  }
  if (!raw) return new Set();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return new Set();
  }
  const normalized = normalizePassportState(parsed);
  return new Set(places.filter((place) => getVisit(normalized, place.id)).map((place) => place.id));
}

function isVisited(place) {
  if (state.marksMode === MARKS.PASSPORT) return state.passportVisits.has(place.id);
  if (state.marksMode === MARKS.DEMO) return state.places.indexOf(place) % DEMO_EVERY === 0;
  return false;
}

function boundsOf(places) {
  const lngs = places.map((p) => p.location.lng);
  const lats = places.map((p) => p.location.lat);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

async function loadData() {
  const [placesRaw, config, passportRaw] = await Promise.all([
    fetchJson("../../data/places.json"),
    fetchJson("../../data/config.json"),
    fetchJson("../../data/passport.json"),
  ]);
  // Как в js/data.js: пользователю показываются только verified-записи (D-18).
  state.places = placesRaw.filter((place) => place && place.status === "verified");
  state.located = state.places.filter((place) => isValidLocation(place.location));
  state.categories = new Map((config.categories || []).map((category) => [category.id, category]));
  const content = prepareContent({ coastParts: passportRaw.coastParts || [], stickers: passportRaw.stickers || [] }, config);
  state.parts = content.coastParts;
  state.places.forEach((place) => state.partOf.set(place.id, coastPartOf(place, state.parts)));
  state.passportVisits = readPassportVisits(state.places);
  state.marksMode = state.passportVisits.size ? MARKS.PASSPORT : MARKS.DEMO;
}

// ------------------------------------------------------------ отметки

function renderMarks() {
  els.marks.innerHTML = "";
  const options = [
    [MARKS.DEMO, `Тестовый набор: отмечено каждое ${DEMO_EVERY}-е место каталога. Это не настоящие данные паспорта.`],
    [MARKS.NONE, "Без отметок — все места «не отмечено»."],
  ];
  if (state.passportVisits.size) {
    options.unshift([MARKS.PASSPORT, `Отметки паспорта из этого браузера (${state.passportVisits.size}). Только чтение.`]);
  }
  options.forEach(([mode, text]) => {
    const label = el("label", "marks__option");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "marks";
    input.value = mode;
    input.checked = state.marksMode === mode;
    input.addEventListener("change", () => {
      state.marksMode = mode;
      refreshVisited();
    });
    label.append(input, el("span", "", text));
    els.marks.appendChild(label);
  });
  if (!state.passportVisits.size) {
    els.marks.appendChild(el("p", "hint", "В этом браузере по этому адресу отметок паспорта нет, поэтому показан тестовый набор."));
  }
}

function refreshVisited() {
  state.markerEls.forEach((node, id) => applyPinState(node, placeById(id)));
  renderList();
  renderSelected();
}

// ------------------------------------------------------------ места

function placeById(id) {
  return state.places.find((place) => place.id === id) || null;
}

function categoryName(place) {
  const category = state.categories.get(place.category);
  return category ? category.name : "";
}

function categoryIcon(place) {
  const category = state.categories.get(place.category);
  return (category && CATEGORY_ICONS[category.icon]) || DEFAULT_ICON;
}

function partName(place) {
  const part = state.parts.find((p) => p.id === state.partOf.get(place.id));
  return part ? part.name : "";
}

function visitedLabel() {
  return state.marksMode === MARKS.DEMO ? "✓ Отмечено (тестовая отметка)" : "✓ Отмечено в паспорте";
}

// Адрес карточки места в приложении — существующий маршрут #/place/<id>
// (js/app.js). Сервер прототипа (serve.py) отдаёт приложение только по
// 127.0.0.1, а прототип — по localhost: разные origin, Service Worker
// приложения на адрес прототипа не попадает.
function appPlaceUrl(place) {
  const base = window.location.hostname === "localhost" ? `http://127.0.0.1:${window.location.port}/` : new URL("../../", window.location.href).href;
  return `${base}index.html#/place/${encodeURIComponent(place.id)}`;
}

function renderSelected() {
  const body = els.selectedBody;
  body.innerHTML = "";
  const place = state.selectedId ? placeById(state.selectedId) : null;
  if (!place) {
    body.appendChild(el("p", "hint", "Нажмите на маркер или на строку списка."));
    return;
  }
  const card = el("div", "card");
  const name = place.name && place.name.ru;
  card.appendChild(el("p", "card__title", name || "Место без названия"));
  if (place.name && place.name.zh) {
    const zh = el("p", "card__zh", place.name.zh);
    zh.lang = "zh-CN";
    card.appendChild(zh);
  }
  const facts = [categoryName(place), partName(place)].filter(Boolean).join(" · ");
  if (facts) card.appendChild(el("p", "card__line", facts));
  card.appendChild(el("p", `card__line${isVisited(place) ? " card__state" : ""}`, isVisited(place) ? visitedLabel() : "Ещё не отмечено"));
  if (place.summary) card.appendChild(el("p", "card__line", place.summary));
  const located = isValidLocation(place.location);
  if (located) {
    card.appendChild(el("p", "row__meta", `Координаты каталога: ${place.location.lat}, ${place.location.lng}`));
  }
  // Недостаточно данных — говорим прямо, ничего не подставляем.
  const missing = [];
  if (!name) missing.push("названия");
  if (!categoryName(place)) missing.push("категории");
  if (!located) missing.push("координат — на карте его нет");
  if (missing.length) card.appendChild(el("p", "card__warn", `У этого места в каталоге нет ${missing.join(", ")}.`));

  const actions = el("div", "card__actions");
  if (located) {
    const show = el("button", "btn", "Показать на карте");
    show.type = "button";
    show.disabled = !state.map;
    show.addEventListener("click", () => focusPlace(place));
    actions.appendChild(show);
  }
  const open = el("a", "btn", "Карточка в приложении ↗");
  open.href = appPlaceUrl(place);
  open.target = "_blank";
  open.rel = "noopener noreferrer";
  actions.appendChild(open);
  card.appendChild(actions);
  body.appendChild(card);
}

function selectPlace(id, { focusMap = false, reveal = false } = {}) {
  state.selectedId = id;
  state.markerEls.forEach((node, markerId) => node.setAttribute("aria-pressed", String(markerId === id)));
  els.list.querySelectorAll(".row").forEach((row) => row.setAttribute("aria-pressed", String(row.dataset.id === id)));
  renderSelected();
  const place = placeById(id);
  if (focusMap && place) focusPlace(place);
  if (reveal) els.selected.scrollIntoView({ block: "nearest" });
}

function renderList() {
  els.list.innerHTML = "";
  const query = state.filter.trim().toLowerCase();
  const matches = (place) =>
    !query || [place.name && place.name.ru, place.name && place.name.en, place.name && place.name.zh].some((value) => typeof value === "string" && value.toLowerCase().includes(query));
  const groups = state.parts.map((part) => [part.name, state.places.filter((place) => state.partOf.get(place.id) === part.id)]);
  groups.push(["Вне частей побережья", state.places.filter((place) => !state.partOf.get(place.id))]);
  let shown = 0;
  groups.forEach(([title, places]) => {
    const visible = places.filter(matches);
    if (!visible.length) return;
    shown += visible.length;
    els.list.appendChild(el("h3", "group-title", `${title} · ${visible.length}`));
    const rows = el("ul", "rows");
    visible.forEach((place) => {
      const item = document.createElement("li");
      const row = el("button", "row");
      row.type = "button";
      row.dataset.id = place.id;
      row.setAttribute("aria-pressed", String(place.id === state.selectedId));
      const icon = el("span", "row__icon", categoryIcon(place));
      icon.setAttribute("aria-hidden", "true");
      const body = el("span", "row__body");
      body.appendChild(el("span", "row__title", (place.name && place.name.ru) || "Место без названия"));
      const meta = [categoryName(place), isValidLocation(place.location) ? "" : "нет координат"].filter(Boolean).join(" · ");
      if (meta) body.appendChild(el("span", "row__meta", meta));
      if (isVisited(place)) body.appendChild(el("span", "row__visited", visitedLabel()));
      row.append(icon, body);
      row.addEventListener("click", () => selectPlace(place.id, { focusMap: true, reveal: true }));
      item.appendChild(row);
      rows.appendChild(item);
    });
    els.list.appendChild(rows);
  });
  if (!shown) els.list.appendChild(el("p", "empty", query ? `Ничего не найдено по запросу «${state.filter.trim()}».` : "В каталоге нет проверенных мест."));
}

// ------------------------------------------------------------ счётчик и виды

function updateCounter() {
  const total = state.located.length;
  const without = state.places.length - total;
  const tail = without ? ` Ещё ${without} — без координат, только в списке.` : "";
  if (!state.map) {
    els.counter.textContent = `Мест с координатами: ${total}. Карта не загружена.${tail}`;
    return;
  }
  const [[lngA, latA], [lngB, latB]] = state.map.bounds;
  const inside = state.located.filter(({ location }) => {
    return location.lng >= Math.min(lngA, lngB) && location.lng <= Math.max(lngA, lngB) && location.lat >= Math.min(latA, latB) && location.lat <= Math.max(latA, latB);
  }).length;
  els.counter.textContent = `На карте видно ${inside} из ${total} мест.${tail}`;
}

function renderViews() {
  els.views.innerHTML = "";
  const views = [["Вся Санья", state.located]];
  state.parts.forEach((part) => {
    const places = state.located.filter((place) => state.partOf.get(place.id) === part.id);
    if (places.length) views.push([part.short || part.name, places]);
  });
  views.forEach(([label, places]) => {
    const button = el("button", "btn", label);
    button.type = "button";
    button.disabled = !state.map;
    button.addEventListener("click", () => showPlaces(places));
    els.views.appendChild(button);
  });
}

// ------------------------------------------------------------ карта

function showPlaces(places) {
  if (!state.map || !places.length) return;
  if (places.length === 1) {
    focusPlace(places[0]);
    return;
  }
  state.map.update({ location: { bounds: boundsOf(places), duration: 400 } });
}

function focusPlace(place) {
  if (!state.map || !isValidLocation(place.location)) return;
  state.map.update({
    location: { center: [place.location.lng, place.location.lat], zoom: Math.max(state.map.zoom, FOCUS_ZOOM), duration: 400 },
  });
}

function changeZoom(delta) {
  if (!state.map) return;
  state.map.update({ location: { center: state.map.center, zoom: state.map.zoom + delta, duration: 200 } });
}

function applyPinState(node, place) {
  if (!place) return;
  const visited = isVisited(place);
  const pin = node.firstElementChild;
  pin.classList.toggle("pin--visited", visited);
  pin.textContent = visited ? "✓" : "";
  node.setAttribute("aria-label", `${(place.name && place.name.ru) || "Место"} — ${visited ? "отмечено" : "не отмечено"}`);
  node.setAttribute("aria-pressed", String(place.id === state.selectedId));
}

function createPin(place) {
  const node = el("button", "pin-hit");
  node.type = "button";
  node.appendChild(el("span", "pin"));
  applyPinState(node, place);
  state.markerEls.set(place.id, node);
  return node;
}

function placeMarker(place) {
  const { YMapMarker } = state.api;
  return new YMapMarker(
    {
      coordinates: [place.location.lng, place.location.lat],
      onClick: () => selectPlace(place.id, { reveal: true }),
    },
    createPin(place)
  );
}

function clusterMarker(coordinates, features) {
  const { YMapMarker } = state.api;
  const node = el("button", "cluster-hit");
  node.type = "button";
  node.setAttribute("aria-label", `Несколько мест рядом: ${features.length}. Нажмите, чтобы приблизить`);
  node.appendChild(el("span", "cluster", String(features.length)));
  return new YMapMarker(
    {
      coordinates,
      onClick: () => showPlaces(features.map((feature) => placeById(feature.id)).filter(Boolean)),
    },
    node
  );
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

// Загрузка скрипта API по документации: один <script> с ключом и языком.
// Причину неудачи браузер не сообщает, поэтому различаем только «нет сети»,
// «скрипт не загрузился» и «скрипт загрузился, но API не появился».
function loadApiScript(key) {
  return new Promise((resolve, reject) => {
    if (window.ymaps3) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = `${API_URL}?apikey=${encodeURIComponent(key)}&lang=ru_RU`;
    script.async = true;
    const fail = (reason) => {
      clearTimeout(timer);
      script.remove();
      reject(new Error(reason));
    };
    const timer = setTimeout(() => fail("timeout"), API_TIMEOUT_MS);
    script.addEventListener("load", () => {
      if (window.ymaps3) {
        clearTimeout(timer);
        resolve();
      } else {
        fail("no-api");
      }
    });
    script.addEventListener("error", () => fail(navigator.onLine ? "script" : "offline"));
    document.head.appendChild(script);
  });
}

async function loadClusterer() {
  try {
    window.ymaps3.import.registerCdn(PACKAGE_CDN, [`${CLUSTERER_PACKAGE}@${CLUSTERER_VERSION}`]);
    const pack = await withTimeout(window.ymaps3.import(CLUSTERER_PACKAGE), PACKAGE_TIMEOUT_MS);
    return pack && pack.YMapClusterer && pack.clusterByGrid ? pack : null;
  } catch (e) {
    return null;
  }
}

const ERROR_TEXT = {
  offline: "Нет интернета: карта Яндекса без сети не работает. Список мест ниже доступен.",
  script:
    "Скрипт API не загрузился. Проверьте ключ (новый ключ включается до 15 минут), наличие localhost в его «Ограничении по HTTP Referer» и то, что сеть не блокирует api-maps.yandex.ru.",
  timeout: "API не ответил за 25 секунд. Проверьте соединение и попробуйте ещё раз.",
  "no-api": "Скрипт загрузился, но API карт не появился. Проверьте ключ и ограничение по HTTP Referer.",
  api: "API вернул ошибку при создании карты. Проверьте ключ, его ограничение по HTTP Referer и подключён ли к ключу пакет «JavaScript API».",
};

async function startMap() {
  if (state.loading || state.map) return;
  const key = els.keyInput.value.trim();
  if (!key) {
    setStatus("error", "Введите API-ключ — без него Яндекс карту не отдаёт.");
    els.keyInput.focus();
    return;
  }
  if (!state.located.length) {
    setStatus("error", "В каталоге нет мест с координатами — показывать на карте нечего.");
    return;
  }
  state.loading = true;
  els.loadButton.disabled = true;
  setStatus("loading", "Загружаем API Яндекс Карт…");
  setMapState("loading", "Загружаем карту…");
  try {
    await loadApiScript(key);
    await withTimeout(window.ymaps3.ready, API_TIMEOUT_MS);
  } catch (error) {
    failMap(ERROR_TEXT[error && error.message] || ERROR_TEXT.script);
    return;
  }
  try {
    await createMap();
  } catch (error) {
    if (state.map) {
      try {
        state.map.destroy();
      } catch (e) {
        // карта уже разрушена
      }
      state.map = null;
    }
    failMap(ERROR_TEXT.api);
    return;
  }
  state.loading = false;
  // Ключ больше не нужен: убираем поле вместе с его значением.
  els.keyInput.value = "";
  els.keyPanel.hidden = true;
  setMapState("ready");
  setStatus(
    "ready",
    state.clustered
      ? "Карта загружена. Близкие места объединены в группы с числом — нажмите на группу, чтобы приблизить."
      : "Карта загружена. Пакет кластеризации не загрузился (cdn.jsdelivr.net недоступен) — показаны отдельные маркеры."
  );
  els.zoomIn.disabled = false;
  els.zoomOut.disabled = false;
  renderViews();
  renderSelected();
  updateCounter();
}

function failMap(text) {
  state.loading = false;
  els.loadButton.disabled = false;
  setStatus(navigator.onLine ? "error" : "offline", navigator.onLine ? text : ERROR_TEXT.offline);
  setMapState("error", "Карта не загружена. Причина — в сообщении выше. Список мест ниже работает.");
}

async function createMap() {
  const api = window.ymaps3;
  state.api = api;
  const { YMap, YMapDefaultSchemeLayer, YMapDefaultFeaturesLayer, YMapListener } = api;
  // Параметры copyrights и distribution не трогаем: логотип, копирайты и
  // ссылка на Яндекс Карты остаются такими, какими их рисует API.
  const map = new YMap(els.map, { location: { bounds: boundsOf(state.located) }, margin: MAP_MARGIN, showScaleInCopyrights: true }, [
    new YMapDefaultSchemeLayer({}),
    new YMapDefaultFeaturesLayer({}),
  ]);
  state.map = map;
  map.addChild(new YMapListener({ onUpdate: updateCounter }));

  const pack = await loadClusterer();
  if (pack) {
    const features = state.located.map((place) => ({
      type: "Feature",
      id: place.id,
      geometry: { type: "Point", coordinates: [place.location.lng, place.location.lat] },
      properties: {},
    }));
    map.addChild(
      new pack.YMapClusterer({
        method: pack.clusterByGrid({ gridSize: CLUSTER_GRID_PX }),
        features,
        marker: (feature) => placeMarker(placeById(feature.id)),
        cluster: clusterMarker,
      })
    );
    state.clustered = true;
  } else {
    state.located.forEach((place) => map.addChild(placeMarker(place)));
  }
}

// ------------------------------------------------------------ запуск

function bindEvents() {
  els.loadButton.addEventListener("click", startMap);
  els.keyInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") startMap();
  });
  els.zoomIn.addEventListener("click", () => changeZoom(1));
  els.zoomOut.addEventListener("click", () => changeZoom(-1));
  els.filter.addEventListener("input", () => {
    state.filter = els.filter.value;
    renderList();
  });
  window.addEventListener("offline", () => {
    setStatus("offline", state.map ? "Сеть пропала: карта не обновляется, новые участки не загрузятся. Список мест работает." : ERROR_TEXT.offline);
  });
  window.addEventListener("online", () => {
    setStatus(state.map ? "ready" : "idle", state.map ? "Сеть вернулась, карта снова обновляется." : "Сеть вернулась. Введите ключ и нажмите «Загрузить карту».");
  });
}

async function init() {
  bindEvents();
  try {
    await loadData();
  } catch (error) {
    setStatus("error", "Не удалось прочитать каталог мест (data/places.json, config.json, passport.json). Запустите страницу через serve.py из README.");
    els.loadButton.disabled = true;
    return;
  }
  renderMarks();
  renderViews();
  renderList();
  renderSelected();
  updateCounter();
  setStatus("idle", navigator.onLine ? "Ключ не введён — карта не загружена. Список мест работает без неё." : ERROR_TEXT.offline);
}

init();
