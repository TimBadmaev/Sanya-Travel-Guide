import { loadExcursions, loadPlaces, loadConfig, loadErrorMessage } from "../data.js";
import { storage } from "../storage.js";
import {
  EFFORT_LABELS,
  SETTING_LABELS,
  EXCURSION_FORMAT_LABELS,
  EXCURSION_FILTERS,
  EXCURSION_SEARCH_FIELDS,
  FLAG_LABELS,
  applyExcursionFilters,
  applySearch,
  parseExcursionFilters,
  serializeFilters,
  toggleFilter,
  formatDuration,
} from "../logic/filters.js";
import { haversineKm, formatDistance } from "../logic/distance.js";
import { formatVerifiedDate } from "../logic/checklist.js";
import { ORIGIN_PRECISION, resolveOrigin } from "../logic/trip.js";
import { EXCURSION_ICON, excursionSummary } from "./plan.js";

// «Экскурсии» (пятая вкладка, PRODUCT.md 8.11): #/excursions и
// #/excursion/<id>. Экскурсия — готовый сценарий выезда из Саньи
// (data/excursions.json), а не место: связанные места открываются обычными
// карточками #/place/<id>, их текст здесь не повторяется. Выбор дня —
// #/excursion/<id>/plan (views/plan.js).

const TITLE = "Экскурсии";

function appendText(parent, tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.textContent = text;
  parent.appendChild(el);
  return el;
}

function renderErrorState(container, message, onRetry) {
  container.innerHTML = "";
  appendText(container, "h2", "view-title", TITLE);
  const wrap = document.createElement("div");
  wrap.className = "error-state";
  appendText(wrap, "p", "", message);
  const btn = appendText(wrap, "button", "btn btn--primary", "Повторить");
  btn.type = "button";
  btn.addEventListener("click", onRetry);
  container.appendChild(wrap);
}

function renderEmptyState(message, buttonText, onClick) {
  const wrap = document.createElement("div");
  wrap.className = "empty-state";
  appendText(wrap, "p", "", message);
  const btn = appendText(wrap, "button", "btn btn--primary", buttonText);
  btn.type = "button";
  btn.addEventListener("click", onClick);
  return wrap;
}

function filterLabel(token) {
  return EXCURSION_FORMAT_LABELS[token] || FLAG_LABELS[token];
}

// Фильтры — в URL, как у «Мест» (f=), чтобы «Назад» с карточки вернул их.
function excursionsHash(tokens) {
  return tokens.length ? `#/excursions?f=${serializeFilters(tokens)}` : "#/excursions";
}

function renderExcursionRow(excursion) {
  const card = document.createElement("a");
  card.href = `#/excursion/${excursion.id}`;
  card.className = "info-card";
  appendText(card, "span", "info-card__icon", EXCURSION_ICON).setAttribute("aria-hidden", "true");
  const body = document.createElement("span");
  body.className = "info-card__body";
  appendText(body, "span", "info-card__title", excursion.title.ru);
  appendText(body, "span", "info-card__text", excursion.summary);
  appendText(body, "span", "info-card__summary", excursionSummary(excursion));
  card.appendChild(body);
  return card;
}

// ---------------------------------------------------------------- #/excursions

export async function renderExcursions(container, ctx) {
  container.innerHTML = '<p class="loading">Загрузка экскурсий…</p>';
  let excursions;
  try {
    excursions = await loadExcursions();
  } catch (e) {
    console.error(e);
    if (ctx.isCurrent()) renderErrorState(container, loadErrorMessage(e), () => renderExcursions(container, ctx));
    return;
  }
  if (!ctx.isCurrent()) return;

  let tokens = parseExcursionFilters(ctx.query.get("f"));
  // Поиск — как в «Местах»: только в замыкании рендера, не в URL.
  let searchQuery = "";

  container.innerHTML = "";
  appendText(container, "h2", "view-title", TITLE);
  appendText(container, "p", "plan-subtitle", "Куда съездить из Саньи и что там посмотреть.");

  if (!excursions.length) {
    appendText(container, "p", "empty-state", "Пока нет проверенных экскурсий. Загляните позже.");
    return;
  }

  const searchBar = document.createElement("div");
  searchBar.className = "search-bar";
  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.className = "search-bar__input";
  searchInput.placeholder = "Поиск по названию экскурсии";
  searchInput.setAttribute("aria-label", "Поиск по названию экскурсии");
  searchInput.autocomplete = "off";
  const searchClear = appendText(searchBar, "button", "search-bar__clear", "✕");
  searchClear.type = "button";
  searchClear.setAttribute("aria-label", "Очистить поиск");
  searchClear.hidden = true;
  searchBar.prepend(searchInput);
  container.appendChild(searchBar);

  const chipsRow = document.createElement("div");
  chipsRow.className = "chips";
  chipsRow.setAttribute("role", "group");
  chipsRow.setAttribute("aria-label", "Фильтры");
  const chips = EXCURSION_FILTERS.map((token) => {
    const chip = appendText(chipsRow, "button", "chip", filterLabel(token));
    chip.type = "button";
    chip.dataset.token = token;
    chip.setAttribute("aria-pressed", String(tokens.includes(token)));
    chip.addEventListener("click", () => toggle(token));
    return chip;
  });
  container.appendChild(chipsRow);

  const results = document.createElement("div");
  results.className = "places-results";
  container.appendChild(results);

  function renderResults() {
    results.innerHTML = "";
    const searched = applySearch(excursions, searchQuery, EXCURSION_SEARCH_FIELDS, "title");
    const found = applyExcursionFilters(searched, tokens);
    appendText(results, "p", "places-count", `Найдено ${found.length}`);
    if (found.length) {
      const list = document.createElement("div");
      list.className = "info-list";
      found.forEach((excursion) => list.appendChild(renderExcursionRow(excursion)));
      results.appendChild(list);
      return;
    }
    const trimmed = searchQuery.trim();
    if (trimmed) {
      results.appendChild(renderEmptyState(`Ничего не найдено по запросу «${trimmed}».`, "Очистить поиск", clearSearch));
      return;
    }
    const last = tokens[tokens.length - 1];
    results.appendChild(
      renderEmptyState("Ничего не найдено.", `Снять «${filterLabel(last)}»`, () => {
        toggle(last);
        const chip = chips.find((c) => c.dataset.token === last);
        if (chip) chip.focus();
      })
    );
  }

  function toggle(token) {
    if (!ctx.isCurrent()) return;
    tokens = toggleFilter(tokens, token);
    chips.forEach((chip) => chip.setAttribute("aria-pressed", String(tokens.includes(chip.dataset.token))));
    renderResults();
    history.replaceState(history.state, "", excursionsHash(tokens));
  }

  function clearSearch() {
    if (!ctx.isCurrent()) return;
    searchQuery = "";
    searchInput.value = "";
    searchClear.hidden = true;
    renderResults();
    searchInput.focus();
  }

  searchInput.addEventListener("input", () => {
    if (!ctx.isCurrent()) return;
    searchQuery = searchInput.value;
    searchClear.hidden = !searchQuery;
    renderResults();
  });
  searchClear.addEventListener("click", clearSearch);

  renderResults();
}

// ---------------------------------------------------------------- #/excursion/<id>

function appendPoints(container, title, points) {
  if (!Array.isArray(points) || !points.length) return;
  appendText(container, "h3", "place-detail__subtitle", title);
  const list = document.createElement("ul");
  list.className = "info-detail__points";
  points.forEach((point) => appendText(list, "li", "", point));
  container.appendChild(list);
}

export async function renderExcursion(container, ctx) {
  const { id } = ctx.params;
  container.innerHTML = '<p class="loading">Загрузка экскурсии…</p>';
  let excursions;
  let places;
  let config;
  try {
    [excursions, places, config] = await Promise.all([loadExcursions(), loadPlaces(), loadConfig()]);
  } catch (e) {
    console.error(e);
    if (ctx.isCurrent()) renderErrorState(container, loadErrorMessage(e), () => renderExcursion(container, ctx));
    return;
  }
  if (!ctx.isCurrent()) return;

  const excursion = excursions.find((e) => e.id === id);
  if (!excursion) {
    // Неизвестный или черновой id — к списку, без записи в истории.
    window.location.replace("#/excursions");
    return;
  }

  container.innerHTML = "";

  // Возврат: из дня плана или рекомендации — в этот день, иначе — к списку
  // (со списка ctx.back сохраняет его фильтры через history.back()).
  const fromHash = ctx.from || "";
  const fromPath = fromHash.replace(/^#/, "").split("?")[0];
  const fromDay = /^\/(plan|recommended)\/[^/]+$/.test(fromPath);
  const parentHash = fromDay ? fromHash : fromPath === "/excursions" ? fromHash : "#/excursions";
  const back = appendText(container, "a", "place-detail__back", fromDay ? "← Назад" : "← К экскурсиям");
  back.href = parentHash;
  back.addEventListener("click", (event) => {
    event.preventDefault();
    ctx.back(parentHash);
  });

  // 1. Название и китайское название (для таксиста и поиска на месте).
  appendText(container, "h2", "view-title", excursion.title.ru);
  if (excursion.title.zh) {
    const zh = appendText(container, "p", "place-detail__zh", excursion.title.zh);
    zh.lang = "zh-CN";
  }

  // 2. Короткое описание.
  appendText(container, "p", "place-detail__summary", excursion.summary);

  // 3–5. Формат, длительность, нагрузка, на улице / в помещении.
  const params = document.createElement("ul");
  params.className = "place-params";
  [
    EXCURSION_FORMAT_LABELS[excursion.format],
    `${formatDuration(excursion.durationHours)} на месте`,
    EFFORT_LABELS[excursion.effort],
    SETTING_LABELS[excursion.setting],
  ]
    .filter(Boolean)
    .forEach((text) => appendText(params, "li", "", text));
  container.appendChild(params);
  appendText(container, "p", "task__meta", "Время указано без дороги.");

  // 6–8. Что увидишь, кому подходит, когда ехать и советы.
  appendPoints(container, "Что увидите", excursion.whatToSee);
  appendPoints(container, "Кому подходит", excursion.goodFor);
  if (excursion.bestTime) appendText(container, "p", "", `Когда ехать: ${excursion.bestTime}`);
  appendPoints(container, "Советы", excursion.tips);

  // 9. Связанные места — обычные карточки мест; расстояние — от точки
  // проживания по тому же правилу, что и в списке мест (D-11).
  const linked = (excursion.placeIds || []).map((placeId) => places.find((p) => p.id === placeId)).filter(Boolean);
  if (linked.length) {
    appendText(container, "h3", "place-detail__subtitle", "Места этой экскурсии");
    const { point: origin, precision } = resolveOrigin(storage.getTrip(), config);
    const list = document.createElement("div");
    list.className = "info-list";
    linked.forEach((place) => {
      const card = document.createElement("a");
      card.href = `#/place/${place.id}`;
      card.className = "info-card";
      const body = document.createElement("span");
      body.className = "info-card__body";
      appendText(body, "span", "info-card__title", place.name.ru);
      const distance = origin ? formatDistance(haversineKm(origin, place.location)) : "";
      appendText(body, "span", "info-card__summary", [distance, formatDuration(place.durationHours), EFFORT_LABELS[place.effort]].filter(Boolean).join(" · "));
      card.appendChild(body);
      list.appendChild(card);
    });
    container.appendChild(list);
    if (origin) {
      const from = precision === ORIGIN_PRECISION.EXACT ? "от места проживания" : "от центра района";
      appendText(container, "p", "task__meta", `Расстояния — по прямой ${from}. Часы работы, цены и «Показать таксисту» — в карточках мест.`);
    } else {
      appendText(container, "p", "task__meta", "Часы работы, цены и «Показать таксисту» — в карточках мест.");
    }
  }

  // 11. Подвал: дата проверки и источники.
  appendText(container, "p", "task__meta", `Проверено: ${formatVerifiedDate(excursion.verifiedAt)}`);
  appendText(container, "p", "task__meta task__meta--volatile", "Может измениться — проверьте актуальность перед поездкой.");
  appendText(container, "p", "task__meta sources__label", "Источник:");
  const sources = document.createElement("div");
  sources.className = "sources__list";
  excursion.sources.forEach((src) => {
    const a = appendText(sources, "a", "sources__link", src.title);
    a.href = src.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  });
  container.appendChild(sources);

  // 10. «Добавить в мой план» — закреплённое действие внизу, как «Показать
  // таксисту» у места: главное действие карточки, всегда под рукой.
  const actions = document.createElement("div");
  actions.className = "place-actions";
  const planLink = appendText(actions, "a", "btn btn--primary", "Добавить в мой план");
  planLink.href = `#/excursion/${excursion.id}/plan`;
  container.appendChild(actions);
}
