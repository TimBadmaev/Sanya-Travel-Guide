import { loadPlaces, loadConfig, loadErrorMessage } from "../data.js";
import { storage } from "../storage.js";
import {
  FLAG_FILTERS,
  FLAG_LABELS,
  EFFORT_LABELS,
  parseFilters,
  serializeFilters,
  toggleFilter,
  applyFilters,
  suggestFilterToRemove,
  sortByDistance,
  filterWithinRadius,
  formatDuration,
  NEAR_RADIUS_KM,
} from "../logic/filters.js";
import { haversineKm, formatDistance } from "../logic/distance.js";
import { ORIGIN_PRECISION, resolveOrigin } from "../logic/trip.js";

// Ключ иконки категории (config.categories[].icon) → эмодзи. Деталь
// отображения, как ICONS в info.js (PLACES-IMPLEMENTATION.md [PI-7], [OQ-14]).
const CATEGORY_ICONS = {
  beach: "🏖️",
  nature: "🌿",
  culture: "🏛️",
  entertainment: "🎭",
  market: "🛒",
  shopping: "🛍️",
};

const DEFAULT_ICON = "📍";

function renderErrorState(container, message, onRetry) {
  container.innerHTML = "";
  const heading = document.createElement("h2");
  heading.className = "view-title";
  heading.textContent = "Места";
  container.appendChild(heading);

  const wrap = document.createElement("div");
  wrap.className = "error-state";
  const p = document.createElement("p");
  p.textContent = message;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn btn--primary";
  btn.textContent = "Повторить";
  btn.addEventListener("click", onRetry);
  wrap.append(p, btn);
  container.appendChild(wrap);
}

// Фильтры живут только в URL (PLACES-IMPLEMENTATION.md §11): #/places?f=a,b.
// Радиус сценариев «Сейчас» — тоже в URL (near=1) и переживает смену чипов.
function placesHash(tokens, near) {
  const params = [];
  if (tokens.length) params.push(`f=${serializeFilters(tokens)}`);
  if (near) params.push("near=1");
  return params.length ? `#/places?${params.join("&")}` : "#/places";
}

// Плашка радиуса (Q-21): список ограничен, и это видно; «Показать все»
// снимает ограничение без навигации — как снятие чипа.
function renderNearNotice(precision, onShowAll) {
  const notice = document.createElement("p");
  notice.className = "area-notice near-notice";
  const from = precision === ORIGIN_PRECISION.EXACT ? "от места проживания" : "от центра района";
  notice.append(`Показаны места в радиусе ${NEAR_RADIUS_KM} км ${from}. `);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "area-notice__link area-notice__button";
  button.textContent = "Показать все";
  button.addEventListener("click", onShowAll);
  notice.appendChild(button);
  return notice;
}

function renderPlaceRow(place, category, distanceText) {
  const card = document.createElement("a");
  card.href = `#/place/${place.id}`;
  card.className = "info-card";

  const icon = document.createElement("span");
  icon.className = "info-card__icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = (category && CATEGORY_ICONS[category.icon]) || DEFAULT_ICON;

  const body = document.createElement("span");
  body.className = "info-card__body";

  const title = document.createElement("span");
  title.className = "info-card__title";
  title.textContent = place.name.ru;

  const summary = document.createElement("span");
  summary.className = "info-card__summary";
  // Порядок значений — как в MVP-UX-SPEC §4: расстояние перед длительностью
  // ([OQ3-1]). Без выбранного района расстояния в строке просто нет.
  summary.textContent = [distanceText, formatDuration(place.durationHours), EFFORT_LABELS[place.effort]]
    .filter(Boolean)
    .join(" · ");

  body.append(title, summary);
  card.append(icon, body);
  return card;
}

// Плашка над результатами — три случая (§10 + ITERATION-3-LOCATION-REVIEW §8).
// Приглашение — обычная ссылка: запись в истории создаёт пользователь.
// Для района без центра ("other") приглашение выбрать район неуместно —
// район уже выбран ([I3-15]), поэтому там нейтральное пояснение без ссылки.
function renderAreaNotice(precision, selectedArea) {
  // Точка проживания известна — ничего объяснять не нужно.
  if (precision === ORIGIN_PRECISION.EXACT) return null;
  const notice = document.createElement("p");
  notice.className = "area-notice";
  if (precision === ORIGIN_PRECISION.AREA) {
    // Расстояния считаются, но от условной точки протяжённого района —
    // говорим об этом прямо и предлагаем уточнить (R12).
    notice.append("Расстояния — от центра района, это приблизительно. ");
    const link = document.createElement("a");
    link.href = "#/settings";
    link.className = "area-notice__link";
    link.textContent = "Уточнить, где вы живёте";
    notice.appendChild(link);
    return notice;
  }
  if (selectedArea) {
    notice.textContent = `Для района «${selectedArea.name}» расстояние не считается — у него нет центра на карте.`;
    return notice;
  }
  const link = document.createElement("a");
  link.href = "#/settings";
  link.className = "area-notice__link";
  link.textContent = "Выберите район, чтобы видеть расстояние";
  notice.appendChild(link);
  return notice;
}

function renderEmptyState(message, buttonText, onClick) {
  const wrap = document.createElement("div");
  wrap.className = "empty-state";
  const p = document.createElement("p");
  p.textContent = message;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn btn--primary";
  btn.textContent = buttonText;
  btn.addEventListener("click", onClick);
  wrap.append(p, btn);
  return wrap;
}

export async function renderPlaces(container, ctx) {
  container.innerHTML = '<p class="loading">Загрузка мест…</p>';

  let places;
  let config;
  try {
    [places, config] = await Promise.all([loadPlaces(), loadConfig()]);
  } catch (e) {
    console.error(e);
    if (ctx.isCurrent()) {
      renderErrorState(container, loadErrorMessage(e), () => {
        renderPlaces(container, ctx);
      });
    }
    return;
  }

  if (!ctx.isCurrent()) {
    // Пользователь уже переключился на другой экран, пока грузились JSON.
    return;
  }

  // Состояние экрана — только в замыкании рендера; источник истины — URL.
  let tokens = parseFilters(ctx.query.get("f"), config.categories.map((c) => c.id));
  const savedIds = storage.getSavedIds();
  // Точка отсчёта: stg:trip даёт район и точку проживания, справочные данные
  // — всегда из config (D-20, [I3-3]). Правило приоритета источников — целиком
  // в resolveOrigin(), экран знает только точку и её точность.
  const trip = storage.getTrip();
  const selectedArea = config.areas.find((area) => area.id === trip.area) || null;
  const { point: origin, precision } = resolveOrigin(trip, config);
  // Радиус сценариев «Сейчас» (Q-21): near=1 в URL ограничивает список местами
  // не дальше NEAR_RADIUS_KM. Только при известной точке отсчёта — без неё
  // ограничивать не от чего, и параметр молча игнорируется.
  let near = ctx.query.get("near") === "1" && Boolean(origin);
  const nearPlaces = near ? filterWithinRadius(places, origin) : places;
  // База для фильтров, счётчика и подсказки при 0 результатах.
  const basePlaces = () => (near ? nearPlaces : places);
  // Расстояние считается один раз на место за рендер экрана ([I3-14]);
  // ничего не кэшируется между рендерами ([I3-2]).
  const distanceTexts = new Map();
  if (origin) {
    places.forEach((place) => distanceTexts.set(place.id, formatDistance(haversineKm(origin, place.location))));
  }
  const categoriesById = new Map(config.categories.map((c) => [c.id, c]));
  const kidsTag = config.tags.find((t) => t.id === "kids");

  function labelFor(token) {
    if (categoriesById.has(token)) return categoriesById.get(token).name;
    if (token === "kids" && kidsTag) return kidsTag.name;
    return FLAG_LABELS[token];
  }

  container.innerHTML = "";

  const heading = document.createElement("h2");
  heading.className = "view-title";
  heading.textContent = "Места";
  container.appendChild(heading);

  if (!places.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Пока нет проверенных мест. Загляните позже — а пока полезное есть в «Справке».";
    container.appendChild(empty);
    return;
  }

  const chipsRow = document.createElement("div");
  chipsRow.className = "chips";
  chipsRow.setAttribute("role", "group");
  chipsRow.setAttribute("aria-label", "Фильтры");

  const chipTokens = [...config.categories.map((c) => c.id), ...FLAG_FILTERS];
  const chips = chipTokens.map((token) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.dataset.token = token;
    chip.setAttribute("aria-pressed", String(tokens.includes(token)));
    chip.textContent = labelFor(token);
    chip.addEventListener("click", () => toggle(token));
    chipsRow.appendChild(chip);
    return chip;
  });
  container.appendChild(chipsRow);

  const notice = renderAreaNotice(precision, selectedArea);
  if (notice) container.appendChild(notice);

  let nearNotice = null;
  if (near) {
    nearNotice = renderNearNotice(precision, showAll);
    container.appendChild(nearNotice);
  }

  const results = document.createElement("div");
  results.className = "places-results";
  container.appendChild(results);

  function renderResults() {
    results.innerHTML = "";
    // Сначала радиус и фильтрация, потом сортировка ([I3-13]). При origin ===
    // null sortByDistance возвращает копию — порядок places.json.
    const found = sortByDistance(applyFilters(basePlaces(), tokens, { savedIds }), origin);

    const count = document.createElement("p");
    count.className = "places-count";
    count.textContent = `Найдено ${found.length}`;
    results.appendChild(count);

    if (found.length) {
      const list = document.createElement("div");
      list.className = "info-list";
      found.forEach((place) => {
        list.appendChild(renderPlaceRow(place, categoriesById.get(place.category), distanceTexts.get(place.id)));
      });
      results.appendChild(list);
      return;
    }

    // Сохранённые id, которых нет среди verified-мест, молча игнорируются
    // (PRODUCT.md 9.7), поэтому «ничего не сохранено» считаем по пересечению.
    const hasSaved = places.some((place) => savedIds.includes(place.id));
    if (tokens.includes("saved") && !hasSaved) {
      results.appendChild(
        renderEmptyState(
          "Вы пока ничего не сохранили. Откройте место и нажмите ♡ — оно появится здесь.",
          `Снять «${labelFor("saved")}»`,
          () => removeAndFocus("saved")
        )
      );
      return;
    }

    // Пусто без единого фильтра — значит, пуст сам радиус: снимать нечего,
    // кроме ограничения по расстоянию.
    if (!tokens.length) {
      results.appendChild(renderEmptyState(`В радиусе ${NEAR_RADIUS_KM} км мест не найдено.`, "Показать все", showAll));
      return;
    }

    const suggestion = suggestFilterToRemove(basePlaces(), tokens, { savedIds });
    results.appendChild(
      renderEmptyState("Ничего не найдено.", `Снять «${labelFor(suggestion)}»`, () => removeAndFocus(suggestion))
    );
  }

  // Переключение без навигации (ITERATION-2-FOUNDATION.md §3.3): ряд чипов не
  // перерисовывается (его прокрутка и фокус сохраняются), query меняется
  // через replaceState с текущим history.state — история не растёт, key/from
  // записи остаются.
  function toggle(token) {
    if (!ctx.isCurrent()) return;
    tokens = toggleFilter(tokens, token);
    chips.forEach((chip) => {
      chip.setAttribute("aria-pressed", String(tokens.includes(chip.dataset.token)));
    });
    renderResults();
    history.replaceState(history.state, "", placesHash(tokens, near));
  }

  // Снять радиус (Q-21) — так же без навигации, как снятие чипа. Фокус — на
  // первый чип: кнопка плашки исчезает вместе с ней.
  function showAll() {
    if (!ctx.isCurrent() || !near) return;
    near = false;
    if (nearNotice) nearNotice.remove();
    renderResults();
    history.replaceState(history.state, "", placesHash(tokens, near));
    if (chips.length) chips[0].focus();
  }

  // Кнопка подсказки исчезает при перерисовке результатов — фокус переводим
  // на соответствующий чип.
  function removeAndFocus(token) {
    toggle(token);
    const chip = chips.find((c) => c.dataset.token === token);
    if (chip) chip.focus();
  }

  renderResults();
}
