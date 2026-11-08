import { loadExcursions, loadExcursionStories, loadPlaces, loadConfig, loadErrorMessage } from "../data.js";
import { storage } from "../storage.js";
import {
  EFFORT_LABELS,
  SETTING_LABELS,
  EXCURSION_FORMAT_LABELS,
  EXCURSION_TAG_LABELS,
  EXCURSION_FILTERS,
  EXCURSION_SEARCH_FIELDS,
  FLAG_LABELS,
  applyExcursionFilters,
  applySearch,
  excursionSearchText,
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

// Активный чип может оказаться за правым краем горизонтального ряда (.chips —
// скроллер): при переходе с Главной по готовой ссылке ?f=… было видно только
// суженный список, но не то, чем он сужен. Подкручиваем ряд к первому
// нажатому чипу — двигается только сам ряд, страница остаётся на месте.
function revealActiveChip(chipsRow, chips, tokens) {
  const active = chips.find((chip) => tokens.includes(chip.dataset.token));
  if (!active) return;
  const delta = active.getBoundingClientRect().left - chipsRow.getBoundingClientRect().left;
  if (delta > 0) chipsRow.scrollLeft += delta;
}

function filterLabel(token) {
  return EXCURSION_FORMAT_LABELS[token] || EXCURSION_TAG_LABELS[token] || FLAG_LABELS[token];
}

// Фильтры — в URL, как у «Мест» (f=), чтобы «Назад» с карточки вернул их.
function excursionsHash(tokens) {
  return tokens.length ? `#/excursions?f=${serializeFilters(tokens)}` : "#/excursions";
}

// Photos are either existing licensed local place photos or explicitly credited
// Wikimedia Commons images. Nothing is generated/mislabelled as a real place.
function excursionPhotos(excursion, places, story = null) {
  const linked = (excursion.placeIds || []).map((id) => places.find((p) => p.id === id)).filter(Boolean);
  const local = linked.flatMap((p) => (p.photos || []).map((photo) => ({
    url: "assets/photos/" + photo.file,
    alt: photo.alt || p.name.ru,
    credit: [photo.author, photo.license].filter(Boolean).join(" · "),
    source: photo.sourceUrl || null,
    offline: true,
  })));
  const remote = Array.isArray(story?.photos) ? story.photos.filter((photo) =>
    photo.url.startsWith("https://commons.wikimedia.org/wiki/Special:FilePath/") && photo.source.startsWith("https://commons.wikimedia.org/")) : [];
  return [...local, ...remote].slice(0, 4);
}
function picture(parent, photo, className, eager = false) {
  const img = document.createElement("img");
  img.className = className;
  img.src = photo.url;
  img.alt = photo.alt;
  img.loading = eager ? "eager" : "lazy";
  img.decoding = "async";
  img.addEventListener("error", () => { img.classList.add("is-unavailable"); });
  parent.appendChild(img);
}
function renderExcursionRow(excursion, photos = [], story = null) {
  const card = document.createElement("a");
  card.href = `#/excursion/${excursion.id}`;
  card.className = "excursion-card";
  const cover = document.createElement("span");
  cover.className = "excursion-card__cover";
  if (photos[0]) picture(cover, photos[0], "excursion-card__photo");
  else appendText(cover, "span", "excursion-card__fallback", "🌴");
  appendText(cover, "span", "excursion-card__type", EXCURSION_FORMAT_LABELS[excursion.format] || "Экскурсия");
  card.appendChild(cover);
  const body = document.createElement("span");
  body.className = "excursion-card__body";
  appendText(body, "strong", "excursion-card__title", excursion.title.ru);
  appendText(body, "span", "excursion-card__text", story?.lead || excursion.summary);
  appendText(body, "span", "excursion-card__meta", excursionSummary(excursion));
  if (story?.videos?.length) appendText(body, "span", "excursion-card__video", "▶ Есть видеообзор");
  card.appendChild(body);
  return card;
}
function renderStory(parent, story) {
  if (!story) return;
  const block = document.createElement("section");
  block.className = "excursion-story";
  appendText(block, "p", "excursion-story__eyebrow", "📖 ИСТОРИЯ ПРИКЛЮЧЕНИЯ");
  appendText(block, "h3", "excursion-story__title", "Как может пройти твой день");
  const list = document.createElement("ol");
  list.className = "excursion-story__steps";
  (story.moments || []).forEach((moment) => appendText(list, "li", "", moment));
  block.appendChild(list);
  if (story.editorNote) {
    const note = document.createElement("div");
    note.className = "excursion-story__tip";
    appendText(note, "strong", "", "💡 Совет путешественнику");
    appendText(note, "p", "", story.editorNote);
    block.appendChild(note);
  }
  parent.appendChild(block);
  if (Array.isArray(story.videos) && story.videos.length) {
    const video = document.createElement("section");
    video.className = "excursion-reviews";
    appendText(video, "h3", "place-detail__subtitle", "▶ Посмотри глазами путешественников");
    appendText(video, "p", "excursion-reviews__intro", "Русскоязычные обзоры. Видео открывается на внешнем сайте при наличии интернета.");
    story.videos.forEach((item) => {
      const a = appendText(video, "a", "excursion-reviews__link", item.platform + " · " + item.title + " ↗");
      a.href = item.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    });
    parent.appendChild(video);
  }
  if (Array.isArray(story.references) && story.references.length) {
    const refs = document.createElement("div");
    refs.className = "excursion-reviews__references";
    appendText(refs, "strong", "", "Дополнительные материалы и отзывы:");
    story.references.forEach((source) => {
      const a = appendText(refs, "a", "", source.title + " ↗");
      a.href = source.url; a.target = "_blank"; a.rel = "noopener noreferrer";
    });
    parent.appendChild(refs);
  }
}
function renderGallery(container, photos) {
  if (!photos.length) return;
  const gallery = document.createElement("div");
  gallery.className = "excursion-gallery";
  photos.forEach((photo, i) => {
    const figure = document.createElement("figure");
    figure.className = "excursion-gallery__item" + (i === 0 ? " excursion-gallery__item--main" : "");
    picture(figure, photo, "excursion-gallery__photo", i === 0);
    const caption = document.createElement("figcaption");
    caption.className = "excursion-gallery__credit";
    if (photo.source) {
      const a = appendText(caption, "a", "", photo.credit + " ↗");
      a.href = photo.source; a.target = "_blank"; a.rel = "noopener noreferrer";
    } else caption.textContent = photo.credit || photo.alt;
    figure.appendChild(caption);
    gallery.appendChild(figure);
  });
  container.appendChild(gallery);
}

// ---------------------------------------------------------------- #/excursions

export async function renderExcursions(container, ctx) {
  container.innerHTML = '<p class="loading">Загрузка экскурсий…</p>';
  let excursions, stories, places;
  try {
    [excursions, stories, places] = await Promise.all([loadExcursions(), loadExcursionStories(), loadPlaces()]);
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
  appendText(container, "p", "excursion-list__eyebrow", "ВЫБИРАЙ ПРИКЛЮЧЕНИЕ");
  appendText(container, "h2", "view-title", "Куда отправимся?");
  appendText(container, "p", "plan-subtitle", "36 проверенных идей: фотографии, истории, реальные советы и видео там, где удалось проверить источник.");

  if (!excursions.length) {
    appendText(container, "p", "empty-state", "Пока нет проверенных экскурсий. Загляните позже.");
    return;
  }

  const searchBar = document.createElement("div");
  searchBar.className = "search-bar";
  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.className = "search-bar__input";
  searchInput.placeholder = "Название или что посмотреть";
  searchInput.setAttribute("aria-label", "Поиск экскурсий: название или описание");
  searchInput.autocomplete = "off";
  searchInput.enterKeyHint = "search";
  // Кнопка «Найти» на клавиатуре закрывает её: результаты уже обновляются
  // по мере ввода, поэтому дополнительный submit не нужен.
  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      searchInput.blur();
    }
  });
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
  revealActiveChip(chipsRow, chips, tokens);

  const results = document.createElement("div");
  results.className = "places-results";
  container.appendChild(results);

  function renderResults() {
    results.innerHTML = "";
    const searched = applySearch(excursions, searchQuery, EXCURSION_SEARCH_FIELDS, "title", excursionSearchText);
    const found = applyExcursionFilters(searched, tokens);
    appendText(results, "p", "places-count", `Найдено ${found.length}`);
    if (found.length) {
      const list = document.createElement("div");
      list.className = "info-list";
      found.forEach((excursion) => list.appendChild(renderExcursionRow(excursion, excursionPhotos(excursion, places, stories[excursion.id]), stories[excursion.id])));
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
  let stories;
  try {
    [excursions, places, config, stories] = await Promise.all([loadExcursions(), loadPlaces(), loadConfig(), loadExcursionStories()]);
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

  // Возврат: из дня плана или рекомендации — в этот день, с «Сейчас»
  // (карточка «Сегодня») — на «Сейчас», иначе — к списку (со списка ctx.back
  // сохраняет его фильтры через history.back()). Раньше экскурсия, открытая с
  // «Сейчас», возвращала в список экскурсий — пользователь терял свой день.
  const fromHash = ctx.from || "";
  const fromPath = fromHash.replace(/^#/, "").split("?")[0];
  const fromDay = /^\/(plan|recommended)\/[^/]+$/.test(fromPath) || fromPath === "/";
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

  // Фотографии с сохранением авторства и оригинальный редакционный текст.
  const story = stories[excursion.id] || null;
  renderGallery(container, excursionPhotos(excursion, places, story));
  if (story) appendText(container, "p", "excursion-detail__lead", story.lead);
  else appendText(container, "p", "place-detail__summary", excursion.summary);

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

  // 6–8. История, обзор, факты, кому подходит и советы.
  renderStory(container, story);
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
