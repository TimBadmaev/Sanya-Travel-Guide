import { loadPlaces, loadConfig, loadExcursions, loadErrorMessage } from "../data.js";
import { storage } from "../storage.js";
import { EFFORT_LABELS, SETTING_LABELS, PRICE_LABELS, formatDuration } from "../logic/filters.js";
import { haversineKm, formatDistance } from "../logic/distance.js";
import { formatVerifiedDate } from "../logic/checklist.js";
import { ORIGIN_PRECISION, resolveOrigin } from "../logic/trip.js";
import { isValidLocation, buildAmapWalkingUrl } from "../logic/amap.js";
import { userDistanceText, primeCurrentPosition, getKnownPosition } from "../logic/geo.js";
import { bindCopyButton, renderShowScreen } from "./taxi.js";
import { renderAddToDayBlock } from "./plan.js";
import { OPEN_STATE, formatOpenStatus, getOpenStatus, localMoment } from "../logic/hours.js";

// Карточка места (#/place/<id>) и «Показать таксисту» (#/place/<id>/taxi).
// Список — в places.js (PRODUCT.md 10.2, PLACES-IMPLEMENTATION.md [PI-3]).
// Полноэкранный экран и копирование — в taxi.js (Итерация 4).

// onClose — только для экрана таксиста: в полноэкранном режиме нет нижней
// панели, поэтому выход должен быть на самом экране ([PI-13]).
function renderErrorState(container, message, onRetry, onClose) {
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

  if (onClose) {
    const actions = document.createElement("div");
    actions.className = "error-state__actions";
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "btn btn--secondary";
    closeBtn.textContent = "Закрыть";
    closeBtn.addEventListener("click", onClose);
    actions.append(btn, closeBtn);
    wrap.append(p, actions);
  } else {
    wrap.append(p, btn);
  }
  container.appendChild(wrap);
}

function appendParagraph(parent, className, text) {
  const p = document.createElement("p");
  if (className) p.className = className;
  p.textContent = text;
  parent.appendChild(p);
  return p;
}

function appendPoints(parent, title, points) {
  const subtitle = document.createElement("h3");
  subtitle.className = "place-detail__subtitle";
  subtitle.textContent = title;
  parent.appendChild(subtitle);

  const list = document.createElement("ul");
  list.className = "info-detail__points";
  points.forEach((point) => {
    const li = document.createElement("li");
    li.textContent = point;
    list.appendChild(li);
  });
  parent.appendChild(list);
}

export async function renderPlace(container, ctx) {
  const { id } = ctx.params;
  // S1 (Итерация 6): addTo=<дата> — карточка открыта из выбора места для дня.
  // Режим действует только при переходе со списка #/places?addTo=<та же
  // дата>; иначе параметр снимается replace-ом (обычная карточка).
  const addTo = ctx.query.get("addTo");
  const fromHash = ctx.from || "";
  const fromPath = fromHash.replace(/^#/, "").split("?")[0];
  if (addTo !== null && !(fromPath === "/places" && new URLSearchParams(fromHash.split("?")[1] || "").get("addTo") === addTo)) {
    window.location.replace(`#/place/${id}`);
    return;
  }
  container.innerHTML = '<p class="loading">Загрузка места…</p>';

  // Карточке нужен и справочник районов: без него не получить центр района
  // проживания для блока 3 (отменяет [PI-8], см. [I3-17]). Новых сетевых
  // запросов это не добавляет — config.json уже в Promise-кэше data.js.
  let places;
  let config;
  // Экскурсии — только для заголовка занятого дня в режиме addTo.
  let excursions = [];
  try {
    // Геолокацию здесь НЕ ждём (D-02 REAL-DEVICE-QA-2026-09.md): при выданном
    // разрешении и медленном GPS ожидание primeCurrentPosition() держало
    // карточку на «Загрузка места…» до 10 с. Контент рисуется сразу, строка
    // «N км от вас» дорисовывается позже — см. блок 3a.
    [places, config, excursions] = await Promise.all([
      loadPlaces(),
      loadConfig(),
      addTo ? loadExcursions().catch(() => []) : [],
    ]);
  } catch (e) {
    console.error(e);
    if (ctx.isCurrent()) {
      renderErrorState(container, loadErrorMessage(e), () => {
        renderPlace(container, ctx);
      });
    }
    return;
  }

  if (!ctx.isCurrent()) {
    return;
  }

  const place = places.find((p) => p.id === id);
  if (!place) {
    // Неизвестный или не-verified id — к списку (ITERATION-2-FOUNDATION.md
    // §3.4). replace, чтобы битый адрес не оставался в истории.
    window.location.replace("#/places");
    return;
  }

  container.innerHTML = "";

  // 0. «← К местам» — вверху: низ экрана занят sticky-блоком ([PI-5]).
  // Итерация 6: из дня «Моего плана» или рекомендации возврат — в этот день;
  // в режиме addTo — в список выбора с тем же addTo.
  // С карточки экскурсии (её «Связанные места») — тоже «← Назад» в неё.
  const fromDay = /^\/(plan|recommended|excursion)\/[^/]+$/.test(fromPath);
  const parentHash = fromDay ? fromHash : addTo ? `#/places?addTo=${addTo}` : "#/places";
  const backLink = document.createElement("a");
  backLink.href = parentHash;
  backLink.className = "place-detail__back";
  backLink.textContent = fromDay ? "← Назад" : "← К местам";
  // ctx.back вместо обычной ссылки (ITERATION-2-FOUNDATION.md §6.5): со списка
  // — history.back() с его фильтрами и прокруткой; с глубокой ссылки —
  // replace на список. История не растёт.
  backLink.addEventListener("click", (event) => {
    event.preventDefault();
    ctx.back(parentHash);
  });
  container.appendChild(backLink);

  // 1. Название, китайское название, избранное.
  const head = document.createElement("div");
  head.className = "place-detail__head";

  const titles = document.createElement("div");
  const heading = document.createElement("h2");
  heading.className = "view-title";
  heading.textContent = place.name.ru;
  const zh = document.createElement("p");
  zh.className = "place-detail__zh";
  zh.lang = "zh-CN";
  zh.textContent = place.name.zh;
  titles.append(heading, zh);

  let saved = storage.getSavedIds().includes(place.id);
  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "place-detail__save";
  saveBtn.setAttribute("aria-label", "В избранное");
  const updateSaveBtn = () => {
    saveBtn.setAttribute("aria-pressed", String(saved));
    saveBtn.textContent = saved ? "♥" : "♡";
  };
  updateSaveBtn();
  saveBtn.addEventListener("click", () => {
    const ok = storage.setPlaceSaved(place.id, !saved);
    if (!ok) {
      window.alert("Не удалось сохранить: хранилище браузера недоступно.");
      return;
    }
    saved = !saved;
    updateSaveBtn();
  });

  head.append(titles, saveBtn);
  container.appendChild(head);

  // 2. Чипы-параметры (неинтерактивные).
  const params = document.createElement("ul");
  params.className = "place-params";
  [
    formatDuration(place.durationHours),
    EFFORT_LABELS[place.effort],
    SETTING_LABELS[place.setting],
    PRICE_LABELS[place.price.type],
  ].forEach((text) => {
    const li = document.createElement("li");
    li.textContent = text;
    params.appendChild(li);
  });
  container.appendChild(params);

  // 3. «~N км от места проживания» / «…от центра района» — подпись зависит от
  // точности точки отсчёта (ITERATION-3-LOCATION-REVIEW §7.3): условную точку
  // нельзя подписывать так же, как известную. Без точки блока просто нет,
  // плашки на карточке не предусмотрено ([I3-16]). Считается до location
  // места — area самого места в расчёте не участвует (D-11, [К-4]).
  const trip = storage.getTrip();
  const { point: origin, precision } = resolveOrigin(trip, config);
  if (origin) {
    const distanceText = formatDistance(haversineKm(origin, place.location));
    const from = precision === ORIGIN_PRECISION.EXACT ? "от места проживания" : "от центра района";
    if (distanceText) appendParagraph(container, "place-detail__distance", `${distanceText} ${from}`);
  }

  // 3a. «X км от вас» — от текущей позиции устройства (geo.js), отдельно от
  // блока выше: не resolveOrigin(), не точка проживания, не участвует в
  // сортировке/фильтрах («Рядом со мной» не трогаем). Вторичный, немаркий
  // текст; без известной позиции или валидной location блока просто нет.
  // Карточка не ждёт геолокацию (D-02): пока позиция неизвестна, блока просто
  // нет, а когда она появится — текст дорисовывается на месте, без повторного
  // рендера экрана. primeCurrentPosition() — тот же единственный за сессию
  // кэшированный промис, что и в app.js при старте (geo.js): нового запроса
  // геолокации здесь не возникает.
  const userDistance = document.createElement("p");
  userDistance.className = "place-detail__user-distance";
  userDistance.hidden = true;
  container.appendChild(userDistance);
  const fillUserDistance = () => {
    const text = userDistanceText(place.location);
    userDistance.textContent = text;
    userDistance.hidden = !text;
  };
  fillUserDistance();
  if (!getKnownPosition()) {
    primeCurrentPosition().then(() => {
      // isConnected — карточка могла быть перерисована («Повторить») или
      // покинута; ctx.isCurrent() ловит только смену маршрута.
      if (ctx.isCurrent() && userDistance.isConnected) fillUserDistance();
    });
  }

  // 3b. Фото и «Больше фото и подробнее» (Итерация 7): после расстояния,
  // перед описанием. Файлы лежат в assets/photos/ и есть в PRECACHE; без
  // photos блока нет вообще. Подпись с автором и лицензией — условие CC BY.
  if (Array.isArray(place.photos) && place.photos.length) {
    const photos = document.createElement("div");
    photos.className = "place-photos";
    place.photos.forEach((photo) => {
      const figure = document.createElement("figure");
      figure.className = "place-photo";
      const img = document.createElement("img");
      img.className = "place-photo__img";
      img.src = `assets/photos/${photo.file}`;
      img.alt = photo.alt;
      // Файла нет или он повреждён (D-05): убираем всю фигуру вместе с
      // подписью — значок битой картинки и «висящий» копирайт хуже, чем
      // карточка без фото. Плейсхолдер не рисуем (D-14).
      img.addEventListener("error", () => {
        figure.remove();
        if (!photos.children.length) photos.remove();
      });
      const credit = document.createElement("figcaption");
      credit.className = "place-photo__credit";
      credit.append(`Фото: ${photo.author} · `);
      const license = document.createElement("a");
      license.href = photo.sourceUrl;
      license.target = "_blank";
      license.rel = "noopener noreferrer";
      license.textContent = photo.license;
      credit.appendChild(license);
      figure.append(img, credit);
      photos.appendChild(figure);
    });
    container.appendChild(photos);
  }
  if (place.more && place.more.url) {
    const more = document.createElement("a");
    more.href = place.more.url;
    more.target = "_blank";
    more.rel = "noopener noreferrer";
    more.className = "place-more";
    more.textContent = `Больше фото и подробнее — ${place.more.title}`;
    container.appendChild(more);
  }

  // 4. Описание и «Почему стоит».
  appendParagraph(container, "place-detail__summary", place.summary);
  appendPoints(container, "Почему стоит", place.why);

  // 4a. «Мой план» (Итерация 6): в режиме выбора — «Добавить на <дату>»,
  // иначе — переход к выбору дня. После описания, а не между расстоянием и
  // описанием (порядок блоков MVP-UX-SPEC §5), и не в закреплённом блоке:
  // «Показать таксисту» остаётся главной sticky-кнопкой (R6-4).
  if (addTo) {
    renderAddToDayBlock(container, ctx, { place, places, excursions, date: addTo });
  } else {
    const planLink = document.createElement("a");
    planLink.href = `#/place/${place.id}/plan`;
    planLink.className = "btn btn--secondary place-plan-link";
    planLink.textContent = "Добавить в мой план";
    container.appendChild(planLink);
  }

  // 5. Лучшее время, часы, цена — только непустые; у мест нет поля volatile,
  // пометка «может измениться» — всегда, когда блок показан ([PI-12]).
  const practical = [
    ["Лучшее время", place.bestTime],
    ["Часы работы", place.hours],
    ["Цена", place.price.note],
  ].filter(([, value]) => value);
  if (practical.length) {
    practical.forEach(([label, value]) => appendParagraph(container, "", `${label}: ${value}`));
    // Iteration 9: «сейчас открыто / закрыто» — только по подтверждённым
    // структурированным часам (openingHours) и часам телефона. Без них строки
    // нет: текст часов выше остаётся единственным источником.
    const status = getOpenStatus(place.openingHours, localMoment());
    if (status.state !== OPEN_STATE.UNKNOWN) {
      const line = appendParagraph(container, "place-open-status", `Сейчас: ${formatOpenStatus(status)}`);
      if (status.state === OPEN_STATE.OPEN || status.state === OPEN_STATE.ALWAYS) line.classList.add("place-open-status--open");
    }
    appendParagraph(
      container,
      "task__meta task__meta--volatile",
      "Может измениться — проверьте актуальность перед поездкой."
    );
  }

  // 6. Советы.
  if (Array.isArray(place.tips) && place.tips.length) {
    appendPoints(container, "Советы", place.tips);
  }

  // 6a. «Что здесь интересного» (Итерация 7): короткий рассказ, свёрнут при
  // каждом открытии карточки — состояние нигде не запоминается. Без story
  // блока нет.
  if (typeof place.story === "string" && place.story) {
    const story = document.createElement("section");
    story.className = "place-story";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "place-story__toggle";
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", "place-story-text");
    const toggleTitle = document.createElement("span");
    toggleTitle.textContent = "Что здесь интересного";
    const chevron = document.createElement("span");
    chevron.className = "place-story__chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.textContent = "⌄";
    toggle.append(toggleTitle, chevron);

    const text = document.createElement("p");
    text.className = "place-story__text";
    text.id = "place-story-text";
    text.hidden = true;
    text.textContent = place.story;

    toggle.addEventListener("click", () => {
      const open = text.hidden;
      text.hidden = !open;
      toggle.setAttribute("aria-expanded", String(open));
    });

    story.append(toggle, text);
    container.appendChild(story);
  }

  // 7. Подвал: дата проверки и источники.
  appendParagraph(container, "task__meta", `Проверено: ${formatVerifiedDate(place.verifiedAt)}`);
  appendParagraph(container, "task__meta sources__label", "Источник:");
  const sourcesList = document.createElement("div");
  sourcesList.className = "sources__list";
  place.sources.forEach((src) => {
    const a = document.createElement("a");
    a.href = src.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = src.title;
    a.className = "sources__link";
    sourcesList.appendChild(a);
  });
  container.appendChild(sourcesList);

  // 8. Закреплённые действия — последний прямой потомок #view, чтобы sticky
  // держался над нижней панелью до конца карточки (§14.1).
  const actions = document.createElement("div");
  actions.className = "place-actions";

  const taxiLink = document.createElement("a");
  taxiLink.href = `#/place/${place.id}/taxi`;
  taxiLink.className = "btn btn--primary";
  taxiLink.textContent = "Показать таксисту";

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "btn btn--secondary";
  copyBtn.textContent = "Скопировать название";

  const status = document.createElement("p");
  status.className = "place-actions__status";
  status.setAttribute("role", "status");

  bindCopyButton(copyBtn, status, () => place.name.zh);

  // «Как добраться» — маршрут в Amap (amap.js, разрешение Q-03). Отдельно от
  // «Показать таксисту» (D-02, D-12): та остаётся главной закреплённой
  // кнопкой, эта — второе, не конкурирующее с ней действие. Без валидной
  // location кнопки нет (координат не выдумываем).
  const buttons = [taxiLink];
  if (isValidLocation(place.location)) {
    const amapLink = document.createElement("a");
    amapLink.href = buildAmapWalkingUrl(place.location, place.name.ru);
    amapLink.target = "_blank";
    amapLink.rel = "noopener noreferrer";
    amapLink.className = "btn btn--secondary";
    amapLink.textContent = "Как добраться";
    buttons.push(amapLink);
  }
  buttons.push(copyBtn);

  actions.append(...buttons, status);
  container.appendChild(actions);
}

export async function renderPlaceTaxi(container, ctx) {
  const { id } = ctx.params;
  // Шапка и нижняя панель уже скрыты роутером (флаг fullscreen маршрута).
  container.innerHTML = '<p class="loading">Загрузка…</p>';

  let places;
  try {
    places = await loadPlaces();
  } catch (e) {
    console.error(e);
    if (ctx.isCurrent()) {
      renderErrorState(
        container,
        loadErrorMessage(e),
        () => {
          renderPlaceTaxi(container, ctx);
        },
        () => {
          ctx.back(`#/place/${id}`);
        }
      );
    }
    return;
  }

  if (!ctx.isCurrent()) {
    return;
  }

  const place = places.find((p) => p.id === id);
  if (!place) {
    // На список, а не на карточку: её тоже нет (PLACES-IMPLEMENTATION.md §4.2).
    window.location.replace("#/places");
    return;
  }

  renderShowScreen(container, {
    lines: [
      { text: place.name.zh, className: "taxi__name", lang: "zh-CN" },
      { text: place.addressZh, className: "taxi__address", lang: "zh-CN" },
      { text: place.name.ru, className: "taxi__ru" },
    ],
    getCopyText: () => `${place.name.zh}\n${place.addressZh}`,
    closeHref: `#/place/${place.id}`,
    onClose: () => ctx.back(`#/place/${place.id}`),
  });
}
