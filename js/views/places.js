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
  nearbyPlaces,
  NEAR_RADIUS_KM,
  TIME_BUDGETS,
  EFFORT_BUDGETS,
  PICKER_TIME_TOKEN_3H,
  PICKER_EFFORT_TOKEN_MODERATE,
} from "../logic/filters.js";
import { haversineKm, formatDistance } from "../logic/distance.js";
import { ORIGIN_PRECISION, resolveOrigin } from "../logic/trip.js";
import { setKnownPosition } from "../logic/geo.js";
import { formatDayMonth, isIsoDate } from "../logic/plan.js";
import { renderFoodSection, renderModeSwitcher, MODE } from "./food.js";

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
// Итерация 6 (S1): выбор места для дня «Моего плана» — addTo=<дата> — тоже
// живёт в URL и переживает смену чипов и «Показать все».
function placesHash(tokens, near, addTo) {
  const params = [];
  if (tokens.length) params.push(`f=${serializeFilters(tokens)}`);
  if (near) params.push("near=1");
  if (addTo) params.push(`addTo=${addTo}`);
  return params.length ? `#/places?${params.join("&")}` : "#/places";
}

// Плашка режима выбора (S1): «Отмена» возвращает в день без новой записи.
function renderAddToNotice(addTo, onCancel) {
  const notice = document.createElement("p");
  notice.className = "area-notice addto-notice";
  notice.append(`Выбираете место на ${formatDayMonth(addTo)}. `);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "area-notice__link area-notice__button";
  button.textContent = "Отмена";
  button.addEventListener("click", onCancel);
  notice.appendChild(button);
  return notice;
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

function renderPlaceRow(place, category, distanceText, addTo) {
  const card = document.createElement("a");
  card.href = addTo ? `#/place/${place.id}?addTo=${addTo}` : `#/place/${place.id}`;
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

// === «Рядом со мной» (Итерация 8, первая функциональная часть) ===========
// Отдельный, самодостаточный блок над списком: работает поверх browser
// Geolocation API по явному действию пользователя, координаты живут только в
// замыкании renderPlaces() на время текущего экрана — в localStorage не
// пишутся (в отличие от stg:trip.stay, D-11, который остаётся точкой
// «проживания», а не текущей позицией на прогулке) и никуда не отправляются.
// Радиус — тот же NEAR_RADIUS_KM, что у сценариев «Сейчас» (Q-21).

const NEARBY_STATUS = {
  IDLE: "idle",
  LOADING: "loading",
  SUCCESS: "success",
  EMPTY: "empty",
  DENIED: "denied",
  ERROR: "error",
};

// Стандартные коды GeolocationPositionError (MDN): 1 — пользователь отказал,
// 2 — координаты недоступны, 3 — истекло время ожидания.
const GEO_ERROR = { PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 };
const GEO_TIMEOUT_MS = 10000;

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject({ code: "unsupported" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      (error) => reject(error),
      { enableHighAccuracy: false, timeout: GEO_TIMEOUT_MS, maximumAge: 60000 }
    );
  });
}

// Пользовательский текст без технических деталей (состояние F задания).
function describeGeoError(error) {
  const code = error && error.code;
  if (code === GEO_ERROR.POSITION_UNAVAILABLE) {
    return "Не удалось определить координаты. Проверьте, включена ли геолокация на телефоне, и попробуйте ещё раз.";
  }
  if (code === GEO_ERROR.TIMEOUT) {
    return "Определение местоположения заняло слишком много времени. Попробуйте ещё раз.";
  }
  if (code === "unsupported") {
    return "Этот браузер не поддерживает определение местоположения.";
  }
  return "Не удалось определить местоположение. Попробуйте ещё раз.";
}

export async function renderPlaces(container, ctx) {
  // S1: режим выбора открывается только поверх самого дня (#/plan/<дата>).
  // Так карточка места после добавления может вернуться в день на две записи
  // назад (plan.js, renderAddToDayBlock). Иначе — глубокая ссылка: replace на
  // день, откуда выбор и начинается.
  const addTo = ctx.query.get("addTo");
  if (addTo !== null) {
    if (!isIsoDate(addTo)) {
      window.location.replace("#/plan");
      return;
    }
    const fromPath = (ctx.from || "").replace(/^#/, "").split("?")[0];
    if (fromPath !== `/plan/${addTo}`) {
      window.location.replace(`#/plan/${addTo}`);
      return;
    }
  }

  // Режим «Еда» (ITERATION-8-CONTENT-ARCHITECTURE.md, Batch D): второй режим
  // того же #/places, не отдельный маршрут (D-07 — пятой вкладки нет).
  // Недоступен в режиме выбора места для дня (addTo) — в «Мой план»
  // добавляются только places.json-места, еда туда не ведёт.
  if (addTo === null && ctx.query.get("mode") === "food") {
    return renderFoodSection(container, ctx);
  }

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

  if (!addTo) {
    container.appendChild(renderModeSwitcher(MODE.PLACES));
  }

  if (addTo) {
    container.appendChild(renderAddToNotice(addTo, () => ctx.back(`#/plan/${addTo}`)));
  }

  if (!places.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Пока нет проверенных мест. Загляните позже — а пока полезное есть в «Справке».";
    container.appendChild(empty);
    return;
  }

  // «Рядом со мной» (Итерация 8): состояние живёт только в замыкании этого
  // рендера — своя точка, не resolveOrigin() и не stg:trip.stay.
  let nearbyStatus = NEARBY_STATUS.IDLE;
  let nearbyOrigin = null;
  let nearbyResults = [];
  let nearbyErrorText = "";

  const nearbyPanel = document.createElement("div");
  nearbyPanel.className = "nearby";
  container.appendChild(nearbyPanel);

  function resetNearby() {
    if (!ctx.isCurrent()) return;
    nearbyStatus = NEARBY_STATUS.IDLE;
    nearbyOrigin = null;
    nearbyResults = [];
    renderNearbyPanel();
  }

  function requestNearby() {
    if (!ctx.isCurrent()) return;
    nearbyStatus = NEARBY_STATUS.LOADING;
    renderNearbyPanel();
    getCurrentPosition()
      .then((point) => {
        // Один и тот же грант разрешения — карточки Place/Food (geo.js)
        // получают ту же позицию, не запрашивая её ещё раз.
        setKnownPosition(point);
        if (!ctx.isCurrent()) return;
        nearbyOrigin = point;
        nearbyResults = nearbyPlaces(places, point);
        nearbyStatus = nearbyResults.length ? NEARBY_STATUS.SUCCESS : NEARBY_STATUS.EMPTY;
        renderNearbyPanel();
      })
      .catch((error) => {
        if (!ctx.isCurrent()) return;
        nearbyStatus = error && error.code === GEO_ERROR.PERMISSION_DENIED ? NEARBY_STATUS.DENIED : NEARBY_STATUS.ERROR;
        nearbyErrorText = describeGeoError(error);
        renderNearbyPanel();
      });
  }

  function renderNearbyPanel() {
    nearbyPanel.innerHTML = "";

    if (nearbyStatus === NEARBY_STATUS.LOADING) {
      const p = document.createElement("p");
      p.className = "loading";
      p.textContent = "Определяем ваше местоположение…";
      nearbyPanel.appendChild(p);
      return;
    }

    if (nearbyStatus === NEARBY_STATUS.SUCCESS) {
      const title = document.createElement("p");
      title.className = "nearby__title";
      title.textContent = `Рядом с вами · в радиусе ${NEAR_RADIUS_KM} км`;
      nearbyPanel.appendChild(title);

      const list = document.createElement("div");
      list.className = "info-list";
      nearbyResults.forEach((place) => {
        const distanceText = formatDistance(haversineKm(nearbyOrigin, place.location));
        list.appendChild(renderPlaceRow(place, categoriesById.get(place.category), distanceText, addTo));
      });
      nearbyPanel.appendChild(list);

      const collapse = document.createElement("button");
      collapse.type = "button";
      collapse.className = "btn btn--secondary nearby__collapse";
      collapse.textContent = "Свернуть";
      collapse.addEventListener("click", resetNearby);
      nearbyPanel.appendChild(collapse);
      return;
    }

    if (nearbyStatus === NEARBY_STATUS.EMPTY) {
      nearbyPanel.appendChild(
        renderEmptyState(`В радиусе ${NEAR_RADIUS_KM} км от вас проверенных мест не нашлось.`, "Свернуть", resetNearby)
      );
      return;
    }

    if (nearbyStatus === NEARBY_STATUS.DENIED) {
      nearbyPanel.appendChild(
        renderEmptyState(
          "Чтобы показать места рядом с вами, нужен доступ к геолокации браузера — без него нельзя определить, где вы сейчас. Можно пользоваться обычным списком мест ниже.",
          "Свернуть",
          resetNearby
        )
      );
      return;
    }

    if (nearbyStatus === NEARBY_STATUS.ERROR) {
      nearbyPanel.appendChild(renderEmptyState(nearbyErrorText, "Попробовать снова", requestNearby));
      return;
    }

    // IDLE — состояние A до первого запроса геолокации.
    const cta = document.createElement("button");
    cta.type = "button";
    cta.className = "btn btn--secondary nearby__cta";
    cta.textContent = "📍 Показать места рядом со мной";
    cta.addEventListener("click", requestNearby);
    nearbyPanel.appendChild(cta);
  }

  renderNearbyPanel();

  // === Подборщик «Время + интерес + нагрузка» (Итерация 8, вторая часть
  // строки 8 таблицы 11.2 PRODUCT.md) =======================================
  // Не отдельный список: подборщик только вычисляет 1–3 токена (время,
  // интерес, опционально нагрузка) и подставляет их в тот же `tokens`, что и
  // обычные чипы ниже — дальше работает уже существующая цепочка
  // applyFilters() → sortByDistance() → renderPlaceRow() без единого нового
  // рендер-пути. «Рядом со мной» (радиус) и `tokens` (что искать) — разные
  // независимые переменные, поэтому подборщик не мешает и не подменяет near.
  const pickerPanel = document.createElement("div");
  pickerPanel.className = "picker";
  container.appendChild(pickerPanel);

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
        list.appendChild(renderPlaceRow(place, categoriesById.get(place.category), distanceTexts.get(place.id), addTo));
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
    // toggle() — единственное место, где токен без своего чипа (medium3h,
    // moderate) может исчезнуть из tokens в обход самого подборщика
    // («Снять «До 3 часов»» из подсказки при 0 результатах) — плашку
    // «Подбор: …» нужно перерисовать вместе с результатами, иначе она
    // разойдётся с tokens.
    renderPickerPanel();
    history.replaceState(history.state, "", placesHash(tokens, near, addTo));
  }

  // Снять радиус (Q-21) — так же без навигации, как снятие чипа. Фокус — на
  // первый чип: кнопка плашки исчезает вместе с ней.
  function showAll() {
    if (!ctx.isCurrent() || !near) return;
    near = false;
    if (nearNotice) nearNotice.remove();
    renderResults();
    history.replaceState(history.state, "", placesHash(tokens, near, addTo));
    if (chips.length) chips[0].focus();
  }

  // Кнопка подсказки исчезает при перерисовке результатов — фокус переводим
  // на соответствующий чип.
  function removeAndFocus(token) {
    toggle(token);
    const chip = chips.find((c) => c.dataset.token === token);
    if (chip) chip.focus();
  }

  // Форма открыта/закрыта — единственное собственное состояние подборщика;
  // что уже подобрано — не хранится отдельно, а всегда читается из tokens
  // (тот же принцип «источник истины — URL», что и у остального экрана),
  // поэтому плашка «Подбор: …» верна и сразу после обычной перезагрузки
  // #/places?f=nature,medium3h, а не только сразу после нажатия «Подобрать».
  let pickerOpen = false;
  let pickedTime;
  let pickedInterest;
  let pickedEffort;

  function pickerSummaryParts() {
    const parts = [];
    if (tokens.includes(PICKER_TIME_TOKEN_3H)) parts.push(FLAG_LABELS[PICKER_TIME_TOKEN_3H]);
    if (tokens.includes(PICKER_EFFORT_TOKEN_MODERATE)) parts.push(FLAG_LABELS[PICKER_EFFORT_TOKEN_MODERATE]);
    return parts;
  }

  // «Сбросить подбор» снимает только два токена без собственного чипа
  // (medium3h/moderate) — категория интереса остаётся обычным, видимым и
  // управляемым чипом в общем ряду, снимать его отдельной кнопкой не нужно.
  function removePickerTokens() {
    if (!ctx.isCurrent()) return;
    tokens = tokens.filter((t) => t !== PICKER_TIME_TOKEN_3H && t !== PICKER_EFFORT_TOKEN_MODERATE);
    renderPickerPanel();
    renderResults();
    history.replaceState(history.state, "", placesHash(tokens, near, addTo));
  }

  // Подбор — не слияние с уже нажатыми чипами, а замена: пользователь явно
  // задаёт «время + интерес + нагрузка» целиком, так предсказуемее, чем
  // тихо объединять с тем, что было выбрано раньше.
  function applyPicker() {
    if (!ctx.isCurrent() || pickedTime === undefined || !pickedInterest) return;
    tokens = [pickedTime, pickedInterest, pickedEffort].filter(Boolean);
    chips.forEach((chip) => chip.setAttribute("aria-pressed", String(tokens.includes(chip.dataset.token))));
    pickerOpen = false;
    renderPickerPanel();
    renderResults();
    history.replaceState(history.state, "", placesHash(tokens, near, addTo));
  }

  // Одна группа радио-чипов (в отличие от общего ряда — выбор один из
  // вариантов, не несколько): переиспользует внешний вид `.chip`, но не сам
  // компонент общего ряда — там нужно было бы различать выбор одного
  // значения и переключение нескольких.
  function renderPickerGroup(label, options, selected, onSelect) {
    const group = document.createElement("div");
    group.className = "picker__group";
    const groupLabel = document.createElement("p");
    groupLabel.className = "picker__label";
    groupLabel.textContent = label;
    group.appendChild(groupLabel);

    const row = document.createElement("div");
    row.className = "picker__options";
    row.setAttribute("role", "group");
    row.setAttribute("aria-label", label);
    options.forEach(({ token, label: optionLabel }) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip";
      btn.setAttribute("aria-pressed", String(token === selected));
      btn.textContent = optionLabel;
      btn.addEventListener("click", () => onSelect(token));
      row.appendChild(btn);
    });
    group.appendChild(row);
    return group;
  }

  function renderPickerPanel() {
    pickerPanel.innerHTML = "";

    if (!pickerOpen) {
      const cta = document.createElement("button");
      cta.type = "button";
      cta.className = "btn btn--secondary picker__cta";
      cta.textContent = "🎯 Подобрать по времени и интересу";
      cta.addEventListener("click", () => {
        pickedTime = undefined;
        pickedInterest = undefined;
        pickedEffort = null;
        pickerOpen = true;
        renderPickerPanel();
      });
      pickerPanel.appendChild(cta);

      const parts = pickerSummaryParts();
      if (parts.length) {
        const summary = document.createElement("p");
        summary.className = "area-notice picker__summary";
        summary.append(`Подбор: ${parts.join(" · ")}. `);
        const reset = document.createElement("button");
        reset.type = "button";
        reset.className = "area-notice__link area-notice__button";
        reset.textContent = "Сбросить подбор";
        reset.addEventListener("click", removePickerTokens);
        summary.appendChild(reset);
        pickerPanel.appendChild(summary);
      }
      return;
    }

    const form = document.createElement("div");
    form.className = "picker__form";

    const title = document.createElement("p");
    title.className = "picker__title";
    title.textContent = "Подобрать место";
    form.appendChild(title);

    form.appendChild(
      renderPickerGroup("Сколько у вас времени?", TIME_BUDGETS, pickedTime, (value) => {
        pickedTime = value;
        renderPickerPanel();
      })
    );
    form.appendChild(
      renderPickerGroup(
        "Что вам интересно?",
        config.categories.map((c) => ({ token: c.id, label: c.name })),
        pickedInterest,
        (value) => {
          pickedInterest = value;
          renderPickerPanel();
        }
      )
    );
    form.appendChild(
      renderPickerGroup("Нагрузка (необязательно)", EFFORT_BUDGETS, pickedEffort, (value) => {
        pickedEffort = value;
        renderPickerPanel();
      })
    );

    const actions = document.createElement("div");
    actions.className = "picker__actions";
    const submit = document.createElement("button");
    submit.type = "button";
    submit.className = "btn btn--primary picker__submit";
    submit.textContent = "Подобрать";
    submit.disabled = pickedTime === undefined || !pickedInterest;
    submit.addEventListener("click", applyPicker);
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "btn btn--secondary picker__cancel";
    cancel.textContent = "Отмена";
    cancel.addEventListener("click", () => {
      pickerOpen = false;
      renderPickerPanel();
    });
    actions.append(submit, cancel);
    form.appendChild(actions);

    pickerPanel.appendChild(form);
  }

  renderPickerPanel();
  renderResults();
}
