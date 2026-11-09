// Live street map — real WGS84 map tiles from OpenStreetMap (online only).
// No library, API key, geocoding or route simulation. Do not prefetch tiles:
// OSM tile policy permits viewport requests only and requires attribution.
// Existing SVG passport overview remains independently available offline.
import { getVisit } from "../logic/passport.js";

const TILE = 256;
const MIN_ZOOM = 8, MAX_ZOOM = 16;
const CENTER = { lat: 18.246, lng: 109.532 };
const ICONS = { beach: "🏖️", nature: "🌿", culture: "🏯", entertainment: "🎡",
  shopping: "🛍️", market: "🏮" };

export function worldPoint(lat, lng, zoom) {
  const size = TILE * 2 ** zoom;
  const la = Math.max(-85.05112878, Math.min(85.05112878, Number(lat)));
  const sin = Math.sin(la * Math.PI / 180);
  return { x: (Number(lng) + 180) / 360 * size,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size };
}
export function worldCoords(x, y, zoom) {
  const size = TILE * 2 ** zoom;
  return { lng: x / size * 360 - 180,
    lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * y / size))) * 180 / Math.PI };
}
export function classifyPin(place, visited, saved, planned) {
  if (visited.has(place.id)) return "visited";
  if (planned.has(place.id)) return "planned";
  if (saved.has(place.id)) return "saved";
  return "unknown";
}
function node(parent, tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  parent.appendChild(el);
  return el;
}

export function renderStreetMap(parent, { places = [], visits = {}, savedIds = [], myPlan = { days: {} } } = {}) {
  const section = node(parent, "section", "street-map");
  const head = node(section, "div", "street-map__head");
  node(head, "h3", "", "🗺️ Карта улиц — по желанию");
  node(head, "p", "", "Офлайн-карта выше работает без трафика. Улицы загружай, только когда нужны.");
  const consent = node(section, "div", "street-map__consent");
  const activate = node(consent, "button", "street-map__activate", "🌐 Загрузить карту улиц");
  activate.type = "button";
  node(consent, "p", "street-map__hint", "Использует интернет · только видимый участок · в Китае возможны ограничения");
  const categories = node(section, "div", "street-map__filters");
  categories.setAttribute("role", "group");
  categories.setAttribute("aria-label", "Какие точки показать");
  const options = [
    ["all", "Все"], ["visited", "✓ Открыто"], ["saved", "⭐ Избранное"],
    ["planned", "🗓️ В плане"], ["beach", "🏖️ Пляжи"], ["nature", "🌿 Природа"],
    ["culture", "🏯 Культура"], ["market", "🏮 Рынки"],
  ];
  let active = false;
  let filter = "all";
  let zoom = 10, center = { ...CENTER };
  let selected = null;
  const buttons = [];
  options.forEach(([value, label]) => {
    const btn = node(categories, "button", "street-map__filter", label);
    btn.type = "button";
    btn.setAttribute("aria-pressed", String(filter === value));
    btn.addEventListener("click", () => {
      filter = value;
      buttons.forEach(([k, b]) => b.setAttribute("aria-pressed", String(k === filter)));
      draw();
    });
    buttons.push([value, btn]);
  });

  const frame = node(section, "div", "street-map__frame");
  frame.hidden = true;
  activate.addEventListener("click", () => {
    if (active) return;
    active = true;
    frame.hidden = false;
    activate.hidden = true;
    draw();
  });
  frame.setAttribute("aria-label", "Интерактивная карта с реальными координатами мест");
  const tiles = node(frame, "div", "street-map__tiles");
  tiles.setAttribute("aria-hidden", "true");
  const pins = node(frame, "div", "street-map__pins");
  const controls = node(frame, "div", "street-map__controls");
  const plus = node(controls, "button", "", "+");
  plus.type = "button"; plus.setAttribute("aria-label", "Приблизить карту");
  const minus = node(controls, "button", "", "−");
  minus.type = "button"; minus.setAttribute("aria-label", "Отдалить карту");
  const reset = node(controls, "button", "street-map__reset", "⌖");
  reset.type = "button"; reset.setAttribute("aria-label", "Показать всю Санью");
  const preview = node(section, "div", "street-map__preview");
  preview.hidden = true;
  const note = node(section, "p", "street-map__note",
    "Карта улиц загружается с интернетом. Точки — ориентиры, не маршрут и не гарантия входа на территорию.");
  const fallback = node(section, "button", "street-map__offline", "🏝️ Открыть схему побережья без интернета ↓");
  fallback.type = "button";
  fallback.addEventListener("click", () => {
    const schematic = parent.querySelector(".passport-map");
    if (schematic) schematic.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  const credit = node(section, "p", "street-map__credit");
  const attribution = node(credit, "a", "", "© OpenStreetMap contributors");
  attribution.href = "https://www.openstreetmap.org/copyright";
  attribution.target = "_blank";
  attribution.rel = "noopener noreferrer";
  node(credit, "span", "", " · ");
  const issue = node(credit, "a", "", "Сообщить об ошибке на карте");
  issue.href = "https://www.openstreetmap.org/fixthemap";
  issue.target = "_blank";
  issue.rel = "noopener noreferrer";

  const visited = new Set(Object.keys(visits?.visits || visits || {}).filter((id) => Boolean(getVisit(visits, id))));
  const saved = new Set(savedIds);
  const planned = new Set(Object.values(myPlan?.days || {})
    .flatMap((day) => Array.isArray(day?.placeIds) ? day.placeIds : []));
  const pinItems = places.filter((p) => Number.isFinite(p?.location?.lat) &&
    Number.isFinite(p?.location?.lng) && p.status === "verified");

  function showPreview(place) {
    selected = place.id;
    preview.replaceChildren();
    const content = node(preview, "div", "street-map__preview-content");
    if (place.photos?.length) {
      const img = node(content, "img", "street-map__preview-img");
      img.src = "assets/photos/" + place.photos[0].file;
      img.alt = place.photos[0].alt || place.name.ru;
      img.loading = "lazy";
    }
    const copy = node(content, "div", "street-map__preview-copy");
    node(copy, "strong", "", place.name.ru);
    node(copy, "span", "", place.summary || "");
    const link = node(preview, "a", "street-map__open", "Открыть место ›");
    link.href = "#/place/" + encodeURIComponent(place.id);
    preview.hidden = false;
    drawPins();
  }
  function isVisible(place) {
    const kind = classifyPin(place, visited, saved, planned);
    return filter === "all" || kind === filter || place.category === filter;
  }
  function drawPins() {
    pins.replaceChildren();
    const { width, height } = frame.getBoundingClientRect();
    const c = worldPoint(center.lat, center.lng, zoom);
    const visible = pinItems.filter(isVisible);
    visible.forEach((p) => {
      const pos = worldPoint(p.location.lat, p.location.lng, zoom);
      const x = pos.x - c.x + width / 2, y = pos.y - c.y + height / 2;
      if (x < -30 || x > width + 30 || y < -30 || y > height + 30) return;
      const kind = classifyPin(p, visited, saved, planned);
      const btn = node(pins, "button", "street-map__pin street-map__pin--" + kind +
        (selected === p.id ? " is-selected" : ""), ICONS[p.category] || "📍");
      btn.type = "button";
      btn.style.left = x + "px";
      btn.style.top = y + "px";
      btn.title = p.name.ru;
      btn.setAttribute("aria-label", p.name.ru + (kind === "visited" ? " — посещено" : ""));
      btn.addEventListener("click", (ev) => { ev.stopPropagation(); showPreview(p); });
    });
    const count = section.querySelector(".street-map__count");
    if (count) count.textContent = visible.length + " точек в категории";
  }
  function drawTiles() {
    if (!active) return;
    tiles.replaceChildren();
    const { width, height } = frame.getBoundingClientRect();
    const c = worldPoint(center.lat, center.lng, zoom);
    const originX = c.x - width / 2, originY = c.y - height / 2;
    const x0 = Math.floor(originX / TILE), x1 = Math.floor((originX + width) / TILE);
    const y0 = Math.floor(originY / TILE), y1 = Math.floor((originY + height) / TILE);
    const size = 2 ** zoom;
    const frag = document.createDocumentFragment();
    // Only visible tiles, no automatic fetch of adjacent zoom levels or areas.
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (y < 0 || y >= size) continue;
      const img = document.createElement("img");
      img.className = "street-map__tile";
      img.src = "https://tile.openstreetmap.org/" + zoom + "/" + ((x % size + size) % size) + "/" + y + ".png";
      img.alt = "";
      img.draggable = false;
      img.decoding = "async";
      img.style.left = (x * TILE - originX) + "px";
      img.style.top = (y * TILE - originY) + "px";
      frag.appendChild(img);
    }
    tiles.appendChild(frag);
  }
  function draw() { if (!active) return; drawTiles(); drawPins(); }
  function changeZoom(delta) {
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom + delta));
    if (z === zoom) return;
    zoom = z; draw();
  }
  plus.addEventListener("click", () => changeZoom(1));
  minus.addEventListener("click", () => changeZoom(-1));
  reset.addEventListener("click", () => { zoom = 9; center = { ...CENTER }; draw(); });
  let drag = null;
  frame.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button, a")) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, center: worldPoint(center.lat, center.lng, zoom) };
    frame.setPointerCapture(event.pointerId);
  });
  frame.addEventListener("pointermove", (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    const newPoint = {
      x: drag.center.x - (event.clientX - drag.x),
      y: drag.center.y - (event.clientY - drag.y),
    };
    center = worldCoords(newPoint.x, newPoint.y, zoom);
    draw();
  });
  const endDrag = () => { drag = null; };
  frame.addEventListener("pointerup", endDrag);
  frame.addEventListener("pointercancel", endDrag);
  frame.addEventListener("lostpointercapture", endDrag);
  // Do not trap ordinary page scrolling or intercept browser pinch zoom.
  frame.addEventListener("wheel", (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    changeZoom(e.deltaY > 0 ? -1 : 1);
  }, { passive: false });
  // Clicking map background clears preview, not visits.
  frame.addEventListener("click", (e) => { if (!e.target.closest("button")) { selected = null; preview.hidden = true; drawPins(); } });
  const count = node(section, "p", "street-map__count");
  count.hidden = true;
  activate.addEventListener("click", () => { count.hidden = false; });
  // Rendering starts after CSS/layout. ResizeObserver keeps pins on the right POI.
  let lastWidth = 0;
  const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => {
    if (!frame.isConnected) { observer.disconnect(); return; }
    const w = frame.clientWidth;
    if (w && w !== lastWidth) { lastWidth = w; draw(); }
  }) : null;
  if (observer) observer.observe(frame);
  draw();
  return section;
}
