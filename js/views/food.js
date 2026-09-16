import { loadFood, loadConfig, loadErrorMessage } from "../data.js";
import { renderShowScreen } from "./taxi.js";
import { isValidLocation, buildAmapWalkingUrl } from "../logic/amap.js";
import { userDistanceText, primeCurrentPosition } from "../logic/geo.js";

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

// Режим «Еда» внутри #/places (?mode=food). Свои фильтры Places (время,
// интерес, effort, «Рядом со мной») сюда не попадают — экран не читает f=/
// near= и не трогает places.json.
export async function renderFoodSection(container, ctx) {
  container.innerHTML = '<p class="loading">Загрузка…</p>';

  let food;
  let config;
  try {
    // primeCurrentPosition() — тот же единственный за сессию, кэшированный
    // промис, что и в app.js при старте (geo.js): ждём его здесь наравне с
    // данными, а не запускаем ещё один запрос геолокации.
    [food, config] = await Promise.all([loadFood(), loadConfig(), primeCurrentPosition()]);
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
    // Черновики (сейчас все 4 записи food.json) не доходят до этого массива
    // (loadFood(), D-18) — пустое состояние честно объясняет, почему список
    // пуст, без технических деталей и без фиктивных мест.
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent =
      "Пока нет проверенных мест еды. Мы добавим их после проверки актуальных данных — загляните позже.";
    container.appendChild(empty);
    return;
  }

  const areasById = new Map(config.areas.map((a) => [a.id, a]));
  const list = document.createElement("div");
  list.className = "food-list";
  food.forEach((item) => list.appendChild(renderFoodCard(item, areasById.get(item.area))));
  container.appendChild(list);
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
