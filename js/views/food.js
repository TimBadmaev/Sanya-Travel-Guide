import { loadFood, loadConfig, loadErrorMessage } from "../data.js";
import { renderShowScreen } from "./taxi.js";
import { isValidLocation, buildAmapWalkingUrl } from "../logic/amap.js";
import {
  userDistanceText,
  primeCurrentPosition,
  getKnownPosition,
  setKnownPosition,
  requestCurrentPosition,
  describeGeoError,
  GEO_ERROR,
} from "../logic/geo.js";
import { filterWithinRadius, sortByDistance, NEAR_RADIUS_KM, applySearch, FOOD_SEARCH_FIELDS } from "../logic/filters.js";

// Еда (ITERATION-8-CONTENT-ARCHITECTURE.md, Batch D): отдельный, короткий
// экран по образцу views/handy.js — не карточка места, у food-записей нет
// durationHours/effort/setting/«Мой план». Живёт внутри #/places как второй
// режим (?mode=food), не отдельная вкладка (D-07: пятой вкладки нет).
// loadFood() уже возвращает только status "verified" (D-18) — черновики
// сюда не доходят.

export const MODE = { PLACES: "places", FOOD: "food" };

// Переключатель режимов «Места» / «Еда» — обычные ссылки: клик меняет hash
// и запускает обычный render() роутера (ITERATION-2-FOUNDATION.md §3), без
// отдельного состояния. Переиспользуется views/places.js.
export function renderModeSwitcher(current) {
  const nav = document.createElement("div");
  nav.className = "mode-switch";
  nav.setAttribute("role", "tablist");
  nav.setAttribute("aria-label", "Раздел");

  [
    { mode: MODE.PLACES, label: "Места", href: "#/places" },
    { mode: MODE.FOOD, label: "Еда", href: "#/places?mode=food" },
  ].forEach(({ mode, label, href }) => {
    const tab = document.createElement("a");
    tab.href = href;
    tab.className = "mode-switch__tab";
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", String(mode === current));
    if (mode === current) tab.setAttribute("aria-current", "page");
    tab.textContent = label;
    nav.appendChild(tab);
  });

  return nav;
}

const FOOD_KIND_LABELS = {
  restaurant: "Ресторан",
  foodcourt: "Фудкорт",
  "street-food": "Уличная еда",
};

const FOOD_KIND_ICONS = {
  restaurant: "🍴",
  foodcourt: "🍜",
  "street-food": "🥢",
};

const DEFAULT_FOOD_ICON = "🍽️";

function renderErrorState(container, message, onRetry) {
  container.innerHTML = "";
  const heading = document.createElement("h2");
  heading.className = "view-title";
  heading.textContent = "Места";
  container.appendChild(heading);
  container.appendChild(renderModeSwitcher(MODE.FOOD));

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

// Пустое состояние с подсказкой сбросить поиск (§7) — тот же вид, что уже
// вручную собирают DENIED/ERROR-состояния «Рядом со мной» ниже, только с
// кнопкой действия, как renderEmptyState() в views/places.js.
function renderEmptyState(message, buttonText, onClick) {
  const wrap = document.createElement("div");
  wrap.className = "empty-state";
  const p = document.createElement("p");
  p.textContent = message;
  wrap.appendChild(p);
  if (buttonText) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn--primary";
    btn.textContent = buttonText;
    btn.addEventListener("click", onClick);
    wrap.appendChild(btn);
  }
  return wrap;
}

// Карточка food-записи — только поля, которые реально есть в схеме
// (ITERATION-8-CONTENT-ARCHITECTURE.md §2.2): название, тип, район, адрес,
// часы и note — только если есть. Никаких рейтингов/рекомендаций/score.
function renderFoodCard(item, area) {
  const card = document.createElement("div");
  card.className = "food-card";

  const head = document.createElement("div");
  head.className = "food-card__head";

  const icon = document.createElement("span");
  icon.className = "food-card__icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = FOOD_KIND_ICONS[item.kind] || DEFAULT_FOOD_ICON;

  const body = document.createElement("div");
  body.className = "food-card__body";

  const title = document.createElement("p");
  title.className = "food-card__title";
  title.textContent = item.name.ru;

  const meta = document.createElement("p");
  meta.className = "food-card__meta";
  meta.textContent = [FOOD_KIND_LABELS[item.kind], area && area.name].filter(Boolean).join(" · ");

  body.append(title, meta);

  // «X км от вас» — от текущей позиции устройства (geo.js), только для
  // валидной location и только при уже известной позиции; не влияет на
  // порядок карточек и не заменяет loader, скрывающий draft (D-18).
  const userDistance = userDistanceText(item.location);
  if (userDistance) {
    const distance = document.createElement("p");
    distance.className = "food-card__meta food-card__user-distance";
    distance.textContent = userDistance;
    body.appendChild(distance);
  }

  head.append(icon, body);
  card.appendChild(head);

  const address = document.createElement("p");
  address.className = "food-card__address";
  address.lang = "zh-CN";
  address.textContent = item.addressZh;
  card.appendChild(address);

  if (item.hours) {
    const hours = document.createElement("p");
    hours.className = "food-card__detail";
    hours.textContent = `Часы: ${item.hours}`;
    card.appendChild(hours);
  }

  if (item.note) {
    const note = document.createElement("p");
    note.className = "food-card__detail";
    note.textContent = item.note;
    card.appendChild(note);
  }

  // «Показать таксисту» переиспользует общий экран taxi.js без изменений
  // (нужны только name.zh и addressZh) — уже корректно поддержано архитектурой.
  if (item.addressZh) {
    const actions = document.createElement("div");
    actions.className = "food-card__actions";
    const taxiLink = document.createElement("a");
    taxiLink.href = `#/places/food/${item.id}/taxi`;
    taxiLink.className = "btn btn--primary";
    taxiLink.textContent = "Показать таксисту";
    actions.appendChild(taxiLink);

    // «Как добраться» — маршрут в Amap (amap.js), второе действие рядом с
    // таксистом, не заменяющее его. Без валидной location кнопки нет.
    if (isValidLocation(item.location)) {
      const amapLink = document.createElement("a");
      amapLink.href = buildAmapWalkingUrl(item.location, item.name.ru);
      amapLink.target = "_blank";
      amapLink.rel = "noopener noreferrer";
      amapLink.className = "btn btn--secondary";
      amapLink.textContent = "Как добраться";
      actions.appendChild(amapLink);
    }

    card.appendChild(actions);
  }

  return card;
}

// «Все» / «Рядом со мной» (Итерация 10): локальное состояние рендера, как и
// nearbyStatus «Рядом со мной» в местах (places.js) — не URL-параметр, сброс
// при каждом входе на экран. По умолчанию — «Все».
const FOOD_SCOPE = { ALL: "all", NEARBY: "nearby" };

// Вкладка «Рядом со мной» после возврата с экрана таксиста (D-03): помним
// только факт выбора в этом сеансе страницы, точка — общая позиция geo.js.
// Та же механика, что у «Рядом со мной» в местах (views/places.js).
let nearbyScopeActivated = false;

const FOOD_NEARBY_STATUS = {
  IDLE: "idle",
  LOADING: "loading",
  SUCCESS: "success",
  EMPTY: "empty",
  DENIED: "denied",
  ERROR: "error",
};

// Режим «Еда» внутри #/places (?mode=food). Свои фильтры Places (время,
// интерес, effort, «Рядом со мной») сюда не попадают — экран не читает f=/
// near= и не трогает places.json.
export async function renderFoodSection(container, ctx) {
  container.innerHTML = '<p class="loading">Загрузка…</p>';

  let food;
  let config;
  try {
    // Геолокацию здесь НЕ ждём (D-02 REAL-DEVICE-QA-2026-09.md): при выданном
    // разрешении и медленном GPS ожидание primeCurrentPosition() держало экран
    // на «Загрузка…» до 10 с. Список рисуется сразу, «N км от вас» на карточках
    // появляется позже — см. конец renderFoodSection().
    [food, config] = await Promise.all([loadFood(), loadConfig()]);
  } catch (e) {
    console.error(e);
    if (ctx.isCurrent()) {
      renderErrorState(container, loadErrorMessage(e), () => renderFoodSection(container, ctx));
    }
    return;
  }

  if (!ctx.isCurrent()) {
    // Пользователь уже переключился на другой экран, пока грузились JSON.
    return;
  }

  container.innerHTML = "";

  const heading = document.createElement("h2");
  heading.className = "view-title";
  heading.textContent = "Места";
  container.appendChild(heading);

  container.appendChild(renderModeSwitcher(MODE.FOOD));

  if (!food.length) {
    // Черновики не доходят до этого массива (loadFood(), D-18) — пустое
    // состояние честно объясняет, почему список пуст, без технических
    // деталей и без фиктивных мест.
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent =
      "Пока нет проверенных мест еды. Мы добавим их после проверки актуальных данных — загляните позже.";
    container.appendChild(empty);
    return;
  }

  const areasById = new Map(config.areas.map((a) => [a.id, a]));

  // === «Рядом со мной» для Food (Итерация 10) =============================
  // Тот же радиус, что у сценариев «Сейчас» и «Рядом со мной» в местах
  // (NEAR_RADIUS_KM, Q-21, js/logic/filters.js) — второй радиус не заводим.
  // filterWithinRadius()/sortByDistance() — уже существующие чистые функции
  // над `.location`, общие для мест и еды; собственной логики
  // расстояния/сортировки здесь нет. Состояние — только в замыкании этого
  // рендера, как nearbyStatus в places.js: своя точка, не resolveOrigin() и
  // не stg:trip.stay; координаты нигде не сохраняются (geo.js) и никуда не
  // отправляются.
  let scope = FOOD_SCOPE.ALL;
  let nearbyStatus = FOOD_NEARBY_STATUS.IDLE;
  let nearbyOrigin = null;
  let nearbyResults = [];
  let nearbyErrorText = "";

  // Поиск по названию (Should, PRODUCT.md §7) — только name.ru/zh для еды
  // (нет name.en в схеме food.json, D-06/9.6.4). Тот же принцип «И» с уже
  // активным режимом «Все»/«Рядом со мной», не отдельный маршрут и не URL
  // (как и остальное локальное состояние этого экрана — near/scope выше).
  let searchQuery = "";

  // Позиция уже известна (прайминг при старте приложения или прошлый запрос в
  // этом сеансе, geo.js) — используем её без нового запроса геолокации.
  function adoptKnownPosition() {
    const known = getKnownPosition();
    if (!known) return false;
    nearbyOrigin = known;
    computeNearbyResults();
    return true;
  }

  function computeNearbyResults() {
    // isValidLocation() исключает и отсутствующую точку, и заглушку {0,0}
    // (amap.js) — черновиков здесь и так уже нет (loadFood(), D-18).
    const usable = applySearch(
      food.filter((item) => isValidLocation(item.location)),
      searchQuery,
      FOOD_SEARCH_FIELDS
    );
    nearbyResults = sortByDistance(filterWithinRadius(usable, nearbyOrigin, NEAR_RADIUS_KM), nearbyOrigin);
    nearbyStatus = nearbyResults.length ? FOOD_NEARBY_STATUS.SUCCESS : FOOD_NEARBY_STATUS.EMPTY;
  }

  // Настоящий запрос геолокации — только по нажатию CTA/«Повторить», никогда
  // автоматически: выбор вкладки «Рядом со мной» сам по себе не должен
  // неожиданно показывать диалог разрешения браузера.
  function requestNearby() {
    if (!ctx.isCurrent()) return;
    nearbyStatus = FOOD_NEARBY_STATUS.LOADING;
    renderNearbyBody();
    requestCurrentPosition()
      .then((point) => {
        // Тот же грант разрешения — карточки («X км от вас») и «Рядом со
        // мной» в местах получают эту же позицию без повторного запроса.
        setKnownPosition(point);
        if (!ctx.isCurrent()) return;
        nearbyOrigin = point;
        computeNearbyResults();
        renderNearbyBody();
      })
      .catch((error) => {
        if (!ctx.isCurrent()) return;
        nearbyStatus =
          error && error.code === GEO_ERROR.PERMISSION_DENIED ? FOOD_NEARBY_STATUS.DENIED : FOOD_NEARBY_STATUS.ERROR;
        nearbyErrorText = describeGeoError(error);
        renderNearbyBody();
      });
  }

  function renderNearbyBody() {
    nearbyBody.innerHTML = "";

    if (nearbyStatus === FOOD_NEARBY_STATUS.LOADING) {
      const p = document.createElement("p");
      p.className = "loading";
      p.textContent = "Определяем ваше местоположение…";
      nearbyBody.appendChild(p);
      return;
    }

    if (nearbyStatus === FOOD_NEARBY_STATUS.SUCCESS) {
      const list = document.createElement("div");
      list.className = "food-list";
      nearbyResults.forEach((item) => list.appendChild(renderFoodCard(item, areasById.get(item.area))));
      nearbyBody.appendChild(list);
      return;
    }

    if (nearbyStatus === FOOD_NEARBY_STATUS.EMPTY) {
      // Не «нет ресторанов в городе» — только то, что рядом нет проверенных
      // мест в уже известном радиусе (D-18: черновики сюда не попадают).
      // Активный поиск без результатов рядом — отдельная подсказка со сбросом
      // именно поиска, а не общий текст про радиус (§7).
      const trimmedQuery = searchQuery.trim();
      if (trimmedQuery) {
        nearbyBody.appendChild(
          renderEmptyState(
            `Рядом не нашлось «${trimmedQuery}» в радиусе ${NEAR_RADIUS_KM} км.`,
            "Очистить поиск",
            clearSearch
          )
        );
        return;
      }
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = `Рядом нет проверенных мест еды в радиусе ${NEAR_RADIUS_KM} км.`;
      nearbyBody.appendChild(empty);
      return;
    }

    if (nearbyStatus === FOOD_NEARBY_STATUS.DENIED) {
      const wrap = document.createElement("div");
      wrap.className = "empty-state";
      const p = document.createElement("p");
      p.textContent =
        "Чтобы показать еду рядом с вами, нужен доступ к геолокации браузера — без него нельзя определить, где вы сейчас. Можно пользоваться списком «Все» выше.";
      wrap.appendChild(p);
      nearbyBody.appendChild(wrap);
      return;
    }

    if (nearbyStatus === FOOD_NEARBY_STATUS.ERROR) {
      const wrap = document.createElement("div");
      wrap.className = "empty-state";
      const p = document.createElement("p");
      p.textContent = nearbyErrorText;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn--primary";
      btn.textContent = "Повторить";
      btn.addEventListener("click", requestNearby);
      wrap.append(p, btn);
      nearbyBody.appendChild(wrap);
      return;
    }

    // IDLE — до первого запроса геолокации в этом сеансе экрана.
    const cta = document.createElement("button");
    cta.type = "button";
    cta.className = "btn btn--secondary nearby__cta";
    cta.textContent = "📍 Показать еду рядом со мной";
    cta.addEventListener("click", requestNearby);
    nearbyBody.appendChild(cta);
  }

  function renderAllBody() {
    allBody.innerHTML = "";
    const filtered = applySearch(food, searchQuery, FOOD_SEARCH_FIELDS);

    if (!filtered.length) {
      allBody.appendChild(
        renderEmptyState(`Ничего не найдено по запросу «${searchQuery.trim()}».`, "Очистить поиск", clearSearch)
      );
      return;
    }

    const list = document.createElement("div");
    list.className = "food-list";
    filtered.forEach((item) => list.appendChild(renderFoodCard(item, areasById.get(item.area))));
    allBody.appendChild(list);
  }

  function switchScope(next) {
    if (!ctx.isCurrent() || next === scope) return;
    scope = next;
    nearbyScopeActivated = scope === FOOD_SCOPE.NEARBY;
    scopeChips.forEach((chip) => chip.setAttribute("aria-pressed", String(chip.dataset.scope === scope)));
    allBody.hidden = scope !== FOOD_SCOPE.ALL;
    nearbyBody.hidden = scope !== FOOD_SCOPE.NEARBY;
    if (scope === FOOD_SCOPE.NEARBY) {
      if (!adoptKnownPosition() && nearbyStatus !== FOOD_NEARBY_STATUS.DENIED && nearbyStatus !== FOOD_NEARBY_STATUS.ERROR) {
        nearbyStatus = FOOD_NEARBY_STATUS.IDLE;
      }
      renderNearbyBody();
    }
  }

  // Поиск — та же .search-bar, что у Places (css/styles.css), перед
  // переключателем «Все»/«Рядом со мной»: вторичный инструмент над ним, не
  // заменяет его (§7 UX). Меняет то, что показывает уже выбранный scope, не
  // сам scope.
  const searchBar = document.createElement("div");
  searchBar.className = "search-bar";

  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.className = "search-bar__input";
  searchInput.placeholder = "Поиск по названию еды";
  searchInput.setAttribute("aria-label", "Поиск по названию еды");
  searchInput.autocomplete = "off";
  searchBar.appendChild(searchInput);

  const searchClear = document.createElement("button");
  searchClear.type = "button";
  searchClear.className = "search-bar__clear";
  searchClear.textContent = "✕";
  searchClear.setAttribute("aria-label", "Очистить поиск");
  searchClear.hidden = true;
  searchBar.appendChild(searchClear);

  container.appendChild(searchBar);

  function updateSearchClear() {
    searchClear.hidden = !searchQuery;
  }

  function refreshVisibleBody() {
    if (scope === FOOD_SCOPE.ALL) {
      renderAllBody();
      return;
    }
    // «Рядом со мной» пересчитывается только если позиция уже известна —
    // ввод в поиске не должен сам по себе запрашивать геолокацию.
    if (nearbyOrigin) {
      computeNearbyResults();
    }
    renderNearbyBody();
  }

  searchInput.addEventListener("input", () => {
    if (!ctx.isCurrent()) return;
    searchQuery = searchInput.value;
    updateSearchClear();
    refreshVisibleBody();
  });

  function clearSearch() {
    if (!ctx.isCurrent()) return;
    searchQuery = "";
    searchInput.value = "";
    updateSearchClear();
    refreshVisibleBody();
    searchInput.focus();
  }

  searchClear.addEventListener("click", clearSearch);

  // Переключатель — те же chip/chips, что уже использует ряд фильтров Places
  // (places.js): переиспользуем стиль и зону нажатия ≥44px без новой CSS.
  const scopeRow = document.createElement("div");
  scopeRow.className = "chips";
  scopeRow.setAttribute("role", "group");
  scopeRow.setAttribute("aria-label", "Еда рядом");
  const scopeChips = [
    { value: FOOD_SCOPE.ALL, label: "Все" },
    { value: FOOD_SCOPE.NEARBY, label: "Рядом со мной" },
  ].map(({ value, label }) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.dataset.scope = value;
    chip.setAttribute("aria-pressed", String(value === scope));
    chip.textContent = label;
    chip.addEventListener("click", () => switchScope(value));
    scopeRow.appendChild(chip);
    return chip;
  });
  container.appendChild(scopeRow);

  const allBody = document.createElement("div");
  allBody.className = "food-scope-body food-scope-body--all";
  const nearbyBody = document.createElement("div");
  nearbyBody.className = "food-scope-body food-scope-body--nearby";
  nearbyBody.hidden = true;
  container.append(allBody, nearbyBody);

  renderAllBody();

  // Точка входа «Поесть рядом» с Главной (PRODUCT.md 8.3): near=1 в URL —
  // тот же токен, что уже открывает «Рядом со мной» у Places (places.js,
  // home.js). Просто переключает тот же scope, что и клик по чипу «Рядом со
  // мной» выше, — второго способа управления Food Nearby не создаётся.
  // Второе условие — возврат в уже выбранный режим «Рядом со мной» после
  // экрана таксиста, если позиция всё ещё известна (D-03).
  if (ctx.query.get("near") === "1" || (nearbyScopeActivated && getKnownPosition())) {
    switchScope(FOOD_SCOPE.NEARBY);
  }

  // «N км от вас» на карточках — после отрисовки, а не до неё (D-02): когда
  // позиция станет известна, видимый список перерисовывается на месте. Если
  // разрешения нет, промис завершается молча и ничего не меняется.
  if (!getKnownPosition()) {
    primeCurrentPosition().then(() => {
      if (!ctx.isCurrent() || !allBody.isConnected || !getKnownPosition()) return;
      if (scope === FOOD_SCOPE.NEARBY && nearbyStatus === FOOD_NEARBY_STATUS.IDLE) adoptKnownPosition();
      refreshVisibleBody();
    });
  }
}

// «Показать таксисту» для food-записи (#/places/food/<id>/taxi). Тот же
// полноэкранный компонент, что у мест и «Под рукой» (taxi.js).
export async function renderFoodTaxi(container, ctx) {
  const { id } = ctx.params;
  container.innerHTML = '<p class="loading">Загрузка…</p>';

  let food;
  try {
    food = await loadFood();
  } catch (e) {
    console.error(e);
    if (ctx.isCurrent()) {
      renderErrorState(container, loadErrorMessage(e), () => renderFoodTaxi(container, ctx));
    }
    return;
  }

  if (!ctx.isCurrent()) {
    return;
  }

  const item = food.find((f) => f.id === id);
  if (!item) {
    // Неизвестный или не-verified id — к списку еды, а не к местам.
    window.location.replace("#/places?mode=food");
    return;
  }

  renderShowScreen(container, {
    lines: [
      { text: item.name.zh, className: "taxi__name", lang: "zh-CN" },
      { text: item.addressZh, className: "taxi__address", lang: "zh-CN" },
      { text: item.name.ru, className: "taxi__ru" },
    ],
    getCopyText: () => `${item.name.zh}\n${item.addressZh}`,
    closeHref: "#/places?mode=food",
    onClose: () => ctx.back("#/places?mode=food"),
  });
}
