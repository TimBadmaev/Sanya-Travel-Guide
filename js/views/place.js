import { loadPlaces, loadConfig, loadErrorMessage } from "../data.js";
import { storage } from "../storage.js";
import { EFFORT_LABELS, SETTING_LABELS, PRICE_LABELS, formatDuration } from "../logic/filters.js";
import { haversineKm, formatDistance } from "../logic/distance.js";
import { formatVerifiedDate } from "../logic/checklist.js";
import { ORIGIN_PRECISION, resolveOrigin } from "../logic/trip.js";
import { bindCopyButton, renderShowScreen } from "./taxi.js";

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
  container.innerHTML = '<p class="loading">Загрузка места…</p>';

  // Карточке нужен и справочник районов: без него не получить центр района
  // проживания для блока 3 (отменяет [PI-8], см. [I3-17]). Новых сетевых
  // запросов это не добавляет — config.json уже в Promise-кэше data.js.
  let places;
  let config;
  try {
    [places, config] = await Promise.all([loadPlaces(), loadConfig()]);
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
  const backLink = document.createElement("a");
  backLink.href = "#/places";
  backLink.className = "place-detail__back";
  backLink.textContent = "← К местам";
  // ctx.back вместо обычной ссылки (ITERATION-2-FOUNDATION.md §6.5): со списка
  // — history.back() с его фильтрами и прокруткой; с глубокой ссылки —
  // replace на список. История не растёт.
  backLink.addEventListener("click", (event) => {
    event.preventDefault();
    ctx.back("#/places");
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

  // 4. Описание и «Почему стоит».
  appendParagraph(container, "place-detail__summary", place.summary);
  appendPoints(container, "Почему стоит", place.why);

  // 5. Лучшее время, часы, цена — только непустые; у мест нет поля volatile,
  // пометка «может измениться» — всегда, когда блок показан ([PI-12]).
  const practical = [
    ["Лучшее время", place.bestTime],
    ["Часы работы", place.hours],
    ["Цена", place.price.note],
  ].filter(([, value]) => value);
  if (practical.length) {
    practical.forEach(([label, value]) => appendParagraph(container, "", `${label}: ${value}`));
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

  actions.append(taxiLink, copyBtn, status);
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
