import { loadConfig, loadPassport, loadPlaces, loadErrorMessage } from "../data.js";
import { storage } from "../storage.js";
import {
  NOTE_MAX_LENGTH,
  earnedStickerIds,
  evaluatePassport,
  getVisit,
  isRewardPlace,
  prepareContent,
} from "../logic/passport.js";
import { layoutMarkers, orderForMap, projectPoint } from "../logic/passport-map.js";
import { formatDayMonth, formatPeriod } from "../logic/plan.js";
import { getTodayIso, pluralizeRu, resolveOrigin } from "../logic/trip.js";
import { CATEGORY_ICONS, DEFAULT_ICON } from "./places.js";
import { appendBackLink, createConfirm, renderPlanError } from "./plan.js";
import { CATEGORY_INK, PART_BADGES, createMapSvg, createStickerArt, el, tiltOf } from "./passport-art.js";

// «Паспорт исследователя» (EXPLORER-PASSPORT-SPEC.md): экран #/passport со
// схемой побережья, экраны частей побережья #/passport/zone/<id>, альбом
// наклеек #/passport/album и блок «Паспорт» в карточке места. Отметка
// ставится вручную, без геолокации; награды и прогресс считает
// logic/passport.js по отметкам и актуальному каталогу — карта, части и
// альбом читают один и тот же расчёт, своего состояния у них нет.

const SAVE_FAILED_TEXT = "Не удалось сохранить: хранилище браузера недоступно или переполнено.";
const NO_STORAGE_TEXT = "Отметки не сохраняются: память браузера недоступна.";
const NEAREST_STICKERS = 2;
const KEEPSAKE_TEXT = "Покупки можно отмечать на память, но в прогресс и наклейки паспорта они не входят.";
// Постоянная подпись схемы (спецификация 4.4): схема — не навигация.
export const MAP_CAPTION = "Схема для отметок. Форма берега и расстояния условны. Дорога — в карточке места.";
const OVERVIEW_BOX = { x: 0, y: 150, w: 1000, h: 850 };

function appendText(parent, tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.textContent = text;
  parent.appendChild(el);
  return el;
}

// «Отмечено · 19 ноября 2026». Это дата отметки по часам телефона, а не
// подтверждённая дата посещения — так и подписано.
function markedLine(visit) {
  return `Отмечено · ${formatDayMonth(visit.date)} ${visit.date.slice(0, 4)}`;
}

function placeIcon(place) {
  return CATEGORY_ICONS[place.category] || DEFAULT_ICON;
}

function placeLink(place, className) {
  const link = document.createElement("a");
  link.href = `#/place/${place.id}`;
  link.className = className;
  link.textContent = place.name.ru;
  return link;
}

function progressBar(parent, value, max, label) {
  const bar = document.createElement("div");
  bar.className = "progress";
  bar.setAttribute("role", "progressbar");
  bar.setAttribute("aria-label", label);
  bar.setAttribute("aria-valuemin", "0");
  bar.setAttribute("aria-valuemax", String(max));
  bar.setAttribute("aria-valuenow", String(value));
  const fill = document.createElement("div");
  fill.className = "progress__fill";
  fill.style.width = max ? `${(value / max) * 100}%` : "0%";
  bar.appendChild(fill);
  parent.appendChild(bar);
  return bar;
}

// Общая загрузка трёх экранов паспорта: места, справочники, контент паспорта
// и расчёт по текущим отметкам. null — экран уже показал ошибку или устарел.
async function loadPassportData(container, ctx, title, retry) {
  container.innerHTML = '<p class="loading">Загрузка паспорта…</p>';
  let places;
  let config;
  let raw;
  try {
    [places, config, raw] = await Promise.all([loadPlaces(), loadConfig(), loadPassport()]);
  } catch (e) {
    console.error(e);
    if (ctx.isCurrent()) renderPlanError(container, title, loadErrorMessage(e), retry);
    return null;
  }
  if (!ctx.isCurrent()) return null;
  const content = prepareContent(raw, config);
  if (content.problems.length) console.error(`data/passport.json: ${content.problems.join("; ")}`);
  const trip = storage.getTrip();
  const { point } = resolveOrigin(trip, config);
  const state = storage.getPassport();
  const result = evaluatePassport({ state, places, content, origin: point });
  container.innerHTML = "";
  const page = document.createElement("div");
  page.className = "passport";
  container.appendChild(page);
  return { places, config, content, trip, state, result, page };
}

// ------------------------------------------------------------ #/passport

export async function renderPassport(container, ctx) {
  const data = await loadPassportData(container, ctx, "Паспорт исследователя", () => renderPassport(container, ctx));
  if (!data) return;
  const { page, trip, result, content, places, state, config } = data;

  // Паспорт открывается с Главной и из карточки места: «← Назад» ведёт туда,
  // откуда пришли (ctx.back, история не растёт).
  const fromPath = (ctx.from || "").replace(/^#/, "").split("?")[0];
  const parent = /^\/place\/[^/]+$/.test(fromPath) ? ctx.from : "#/";
  appendBackLink(page, "← Назад", parent, ctx);
  appendText(page, "h2", "view-title", "Паспорт исследователя");
  const period = trip.start && trip.end ? formatPeriod({ startDate: trip.start, endDate: trip.end }) : "";
  if (period) appendText(page, "p", "passport__period", `Санья · ${period}`);
  appendText(
    page,
    "p",
    "settings__intro",
    "Отмечайте места, где побывали, — паспорт соберёт ваши посещения, заметки и наклейки. Отметка ставится вручную в карточке места, без геолокации."
  );
  if (!storage.isAvailable()) appendText(page, "p", "area-notice", NO_STORAGE_TEXT);

  renderStats(page, result);
  renderOverview(page, { result, content, places, state });
  renderStickerPreview(page, result, config);
  renderVisits(page, result);
  renderOtherPlaces(page, { places, result });

  const footer = document.createElement("section");
  footer.className = "settings-section";
  appendText(footer, "p", "settings__hint", "Отметки и заметки хранятся только на этом телефоне и входят в копию «Мои данные».");
  const backupLink = appendText(footer, "a", "home-link", "Сохранить копию ›");
  backupLink.href = "#/data";
  page.appendChild(footer);
}

function renderStats(page, result) {
  const list = document.createElement("ul");
  list.className = "passport-stats";
  const { reward, stickerCounts, coastParts, coastPartsVisited } = result;
  const stats = [
    [reward.visited, `из ${reward.total} ${pluralizeRu(reward.total, ["места", "мест", "мест"])}`],
    [stickerCounts.earned, `из ${stickerCounts.total} ${pluralizeRu(stickerCounts.total, ["наклейки", "наклеек", "наклеек"])}`],
    [coastPartsVisited, `из ${coastParts.length} ${pluralizeRu(coastParts.length, ["части побережья", "частей побережья", "частей побережья"])}`],
  ];
  stats.forEach(([value, label]) => {
    const item = document.createElement("li");
    item.className = "passport-stat";
    appendText(item, "span", "passport-stat__value", String(value));
    appendText(item, "span", "passport-stat__label", label);
    list.appendChild(item);
  });
  page.appendChild(list);
  const notes = [];
  if (stickerCounts.optionalEarned) {
    notes.push(`И ещё ${stickerCounts.optionalEarned} ${pluralizeRu(stickerCounts.optionalEarned, ["необязательная наклейка", "необязательные наклейки", "необязательных наклеек"])}.`);
  }
  notes.push(KEEPSAKE_TEXT);
  appendText(page, "p", "settings__hint passport__note", notes.join(" "));
}

function mapFigure(parent, svg, legendExtra) {
  const figure = document.createElement("figure");
  figure.className = "passport-map";
  figure.appendChild(svg);
  const caption = appendText(figure, "figcaption", "passport-map__caption", MAP_CAPTION);
  caption.setAttribute("lang", "ru");
  parent.appendChild(figure);
  const legend = document.createElement("p");
  legend.className = "passport-map__legend";
  appendText(legend, "span", "passport-map__key passport-map__key--visited", "отмечено");
  appendText(legend, "span", "passport-map__key", "ещё не отмечено");
  if (legendExtra) appendText(legend, "span", "passport-map__note", legendExtra);
  parent.appendChild(legend);
  return figure;
}

// Обзорная схема: все места точками (без нажатия — на обзоре они слишком
// плотные), семь значков частей побережья — ссылки на их экраны. Под схемой
// — тот же переход списком (доступная альтернатива).
function renderOverview(page, { result, content, places, state }) {
  const section = document.createElement("section");
  section.className = "settings-section";
  appendText(section, "h3", "settings-section__title", "Схема побережья");
  const svg = createMapSvg({
    viewBox: OVERVIEW_BOX,
    parts: content.coastParts,
    label: "Декоративная схема побережья Саньи: части побережья и отмеченные места",
  });
  const dots = el("g", { class: "pp-dots", "aria-hidden": "true" }, svg);
  places.forEach((place) => {
    const point = projectPoint(place.location);
    if (!point || !result.partOf(place)) return;
    const visited = Boolean(getVisit(state, place.id));
    el("circle", {
      cx: point.x,
      cy: point.y,
      r: visited ? 16 : 9,
      class: `pp-dot${visited ? " pp-dot--visited" : ""}`,
      style: `--ink: ${CATEGORY_INK[place.category] || "#0b6e6e"}`,
      "data-place": place.id,
    }, dots);
  });

  const badges = el("g", { class: "pp-badges" }, svg);
  const shown = result.coastParts;
  shown.forEach((part) => {
    const number = content.coastParts.findIndex((p) => p.id === part.id) + 1;
    const conf = PART_BADGES[part.id] || centroidBadge(part.id, places, result);
    if (!conf) return;
    const link = el("a", {
      href: `#/passport/zone/${part.id}`,
      class: `pp-badge${part.visited ? " pp-badge--visited" : ""}`,
      "aria-label": `${number}. ${part.name}: отмечено ${part.visited} из ${part.total}`,
      "data-part": part.id,
    }, badges);
    const g = el("g", { transform: `translate(${conf.x},${conf.y})` }, link);
    el("circle", { r: 80, class: "pp-badge__hit" }, g);
    el("circle", { r: 40, class: "pp-badge__disc" }, g);
    const length = 2 * Math.PI * 40;
    el("circle", {
      r: 40,
      class: "pp-badge__ring",
      "stroke-dasharray": `${((part.visited / part.total) * length).toFixed(1)} ${length.toFixed(1)}`,
      transform: "rotate(-90)",
    }, g);
    const num = el("text", { y: 1, class: "pp-badge__num" }, g);
    num.textContent = String(number);
    const short = (content.coastParts.find((p) => p.id === part.id) || {}).short || part.name;
    const pos = { below: [0, 84, "middle"], above: [0, -56, "middle"], right: [52, 12, "start"] }[conf.label || "below"];
    const label = el("text", { x: pos[0], y: pos[1], "text-anchor": pos[2], class: "pp-badge__label" }, g);
    label.textContent = short;
  });
  mapFigure(section, svg);

  const list = document.createElement("ol");
  list.className = "passport-parts";
  shown.forEach((part) => {
    const number = content.coastParts.findIndex((p) => p.id === part.id) + 1;
    const li = document.createElement("li");
    const link = document.createElement("a");
    link.href = `#/passport/zone/${part.id}`;
    link.className = "passport-part";
    appendText(link, "span", `passport-part__num${part.visited ? " passport-part__num--visited" : ""}`, String(number)).setAttribute("aria-hidden", "true");
    appendText(link, "span", "passport-part__name", part.name);
    appendText(link, "span", "passport-part__count", `${part.visited} из ${part.total} ›`);
    li.appendChild(link);
    list.appendChild(li);
  });
  section.appendChild(list);
  appendText(
    section,
    "p",
    "settings__hint passport-parts__hint",
    "Части побережья — условное деление только для паспорта, не районы из настроек поездки. Считаются места без покупок."
  );
  page.appendChild(section);
}

// Значок части без строки в PART_BADGES — в центре её мест.
function centroidBadge(partId, places, result) {
  const points = places.filter((p) => result.partOf(p) === partId).map((p) => projectPoint(p.location)).filter(Boolean);
  if (!points.length) return null;
  return {
    x: points.reduce((s, p) => s + p.x, 0) / points.length,
    y: points.reduce((s, p) => s + p.y, 0) / points.length,
    label: "below",
  };
}

// Verified-места без части побережья (нет координат или вне границ частей):
// показываются отдельным списком, позиция не придумывается.
function renderOtherPlaces(page, { places, result }) {
  const others = places.filter((place) => !result.partOf(place));
  if (!others.length) return;
  const section = document.createElement("section");
  section.className = "settings-section";
  appendText(section, "h3", "settings-section__title", "Другие места");
  appendText(section, "p", "settings__hint", "Эти места не попали ни в одну часть побережья — на схеме их нет.");
  const list = document.createElement("ul");
  list.className = "passport-visits";
  others.forEach((place) => {
    const li = document.createElement("li");
    li.className = "passport-visit";
    li.appendChild(placeLink(place, "passport-visit__link"));
    list.appendChild(li);
  });
  section.appendChild(list);
  page.appendChild(section);
}

function renderVisits(page, result) {
  const section = document.createElement("section");
  section.className = "settings-section";
  const count = result.visits.length;
  appendText(section, "h3", "settings-section__title", count ? `Мои посещения · ${count}` : "Мои посещения");
  if (!count) {
    const empty = document.createElement("div");
    empty.className = "empty-state passport-empty";
    appendText(empty, "p", "", "Здесь появятся места, которые вы отметите, и ваши заметки к ним.");
    appendText(empty, "p", "", "Откройте карточку места и нажмите «Отметить посещение».");
    const link = appendText(empty, "a", "btn btn--secondary passport-empty__action", "К местам");
    link.href = "#/places";
    section.appendChild(empty);
    page.appendChild(section);
    return;
  }
  const list = document.createElement("ul");
  list.className = "passport-visits";
  result.visits.forEach(({ place, visit }) => {
    const item = document.createElement("li");
    item.className = "passport-visit";
    const link = placeLink(place, "passport-visit__link");
    const icon = document.createElement("span");
    icon.className = "passport-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = placeIcon(place);
    link.prepend(icon);
    item.appendChild(link);
    appendText(item, "p", "passport-visit__date", markedLine(visit));
    if (visit.note) {
      appendText(item, "p", "passport-visit__note", `«${visit.note}»`);
    } else {
      appendText(item, "p", "passport-visit__note passport-visit__note--empty", "Заметки нет — её можно добавить в карточке места.");
    }
    if (!isRewardPlace(place)) appendText(item, "p", "passport-visit__keepsake", "На память — не входит в прогресс и наклейки.");
    list.appendChild(item);
  });
  section.appendChild(list);
  page.appendChild(section);
}

function collectedNames(sticker, config, result) {
  if (sticker.type === "distinctCategories") {
    return sticker.collected.map((id) => {
      const category = config.categories.find((c) => c.id === id);
      return category ? category.name : id;
    });
  }
  if (sticker.type === "distinctCoastParts") {
    return sticker.collected.map((id) => {
      const part = result.coastParts.find((p) => p.id === id);
      return part ? part.name : id;
    });
  }
  return [];
}

// Две закрытые наклейки, ближайшие к получению (спецификация 3.2).
function nearestStickers(result) {
  return result.stickers
    .filter((sticker) => !sticker.earned && sticker.hints.length)
    .map((sticker, index) => ({ sticker, index, left: sticker.target - sticker.progress }))
    .sort((a, b) => a.left - b.left || a.index - b.index)
    .slice(0, NEAREST_STICKERS)
    .map(({ sticker }) => sticker);
}

// Карточка наклейки — одна для альбома и для «Ближайших наклеек».
// hints: "list" — подсказки списком, "details" — свёрнуты, false — нет.
function stickerCard(sticker, { config, result, hints }) {
  const item = document.createElement("li");
  item.className = `passport-sticker${sticker.earned ? " passport-sticker--earned" : ""}`;
  item.dataset.sticker = sticker.id;
  const art = document.createElement("span");
  art.className = "passport-sticker__art";
  if (sticker.earned) art.style.transform = `rotate(${tiltOf(sticker.id)}deg)`;
  art.appendChild(createStickerArt(sticker.id, sticker.earned));
  item.appendChild(art);
  const body = document.createElement("div");
  body.className = "passport-sticker__body";
  appendText(body, "h4", "passport-sticker__title", sticker.title);
  if (sticker.optional) appendText(body, "p", "passport-sticker__optional", "Необязательная");
  if (sticker.earned) {
    appendText(body, "p", "passport-sticker__state passport-sticker__state--earned", "✓ Получена");
  } else {
    appendText(body, "p", "passport-sticker__state", `Ещё впереди · ${sticker.progress} из ${sticker.target}`);
    progressBar(body, sticker.progress, sticker.target, sticker.title);
  }
  appendText(body, "p", "passport-sticker__text", sticker.description);
  const names = collectedNames(sticker, config, result);
  if (names.length) appendText(body, "p", "passport-sticker__text", `Уже есть: ${names.join(", ")}.`);
  if (!sticker.earned && sticker.hints.length && hints) {
    const links = document.createElement("ul");
    links.className = "passport-sticker__hints";
    sticker.hints.forEach((place) => {
      const li = document.createElement("li");
      li.appendChild(placeLink(place, "passport-sticker__hint"));
      links.appendChild(li);
    });
    if (hints === "details") {
      const details = document.createElement("details");
      details.className = "passport-sticker__more";
      appendText(details, "summary", "passport-sticker__summary", "Какие места подойдут");
      details.appendChild(links);
      body.appendChild(details);
    } else {
      appendText(body, "p", "passport-sticker__hints-title", "Подойдут, например:");
      body.appendChild(links);
    }
  }
  item.appendChild(body);
  return item;
}

// На главном экране паспорта — лента всех наклеек, вход в альбом и две
// ближайшие наклейки с подсказками.
function renderStickerPreview(page, result, config) {
  const section = document.createElement("section");
  section.className = "settings-section";
  const { earned, total } = result.stickerCounts;
  appendText(section, "h3", "settings-section__title", `Наклейки · ${earned} из ${total}`);
  const strip = document.createElement("div");
  strip.className = "passport-strip";
  strip.setAttribute("aria-hidden", "true");
  result.stickers.forEach((sticker) => {
    const art = document.createElement("span");
    art.className = "passport-strip__item";
    art.appendChild(createStickerArt(sticker.id, sticker.earned));
    strip.appendChild(art);
  });
  section.appendChild(strip);
  const album = appendText(section, "a", "btn btn--secondary passport-album-link", "Открыть альбом наклеек");
  album.href = "#/passport/album";
  const nearest = nearestStickers(result);
  if (nearest.length) {
    appendText(section, "p", "passport-subtitle", "Ближайшие наклейки");
    const list = document.createElement("ul");
    list.className = "passport-stickers";
    nearest.forEach((sticker) => list.appendChild(stickerCard(sticker, { config, result, hints: "list" })));
    section.appendChild(list);
  }
  page.appendChild(section);
}

// ------------------------------------------------------------ #/passport/album

export async function renderPassportAlbum(container, ctx) {
  const data = await loadPassportData(container, ctx, "Альбом наклеек", () => renderPassportAlbum(container, ctx));
  if (!data) return;
  const { page, result, config } = data;
  appendBackLink(page, "← К паспорту", "#/passport", ctx);
  appendText(page, "h2", "view-title", "Альбом наклеек");
  const { earned, total, optionalEarned } = result.stickerCounts;
  const summary = `Получено ${earned} из ${total}${optionalEarned ? ` и ${optionalEarned} необязательная` : ""}.`;
  appendText(page, "p", "passport-album__summary", summary);
  appendText(
    page,
    "p",
    "settings__intro",
    "Наклейки открываются сами, когда отмеченные места подходят под условие, и закрываются, если отметку снять. Покупки в наклейки не входят."
  );
  const list = document.createElement("ul");
  list.className = "passport-stickers passport-album";
  result.stickers.forEach((sticker) => list.appendChild(stickerCard(sticker, { config, result, hints: "details" })));
  page.appendChild(list);
}

// ------------------------------------------------------------ #/passport/zone/<id>

export async function renderPassportZone(container, ctx) {
  const data = await loadPassportData(container, ctx, "Паспорт исследователя", () => renderPassportZone(container, ctx));
  if (!data) return;
  const { page, result, content, places, state } = data;
  const part = content.coastParts.find((p) => p.id === ctx.params.zone);
  if (!part) {
    // Неизвестная часть — к паспорту, без записи в истории.
    window.location.replace("#/passport");
    return;
  }
  const number = content.coastParts.indexOf(part) + 1;
  const progress = result.coastParts.find((p) => p.id === part.id) || { visited: 0, total: 0 };
  const ordered = orderForMap(places.filter((place) => result.partOf(place) === part.id));

  appendBackLink(page, "← К паспорту", "#/passport", ctx);
  appendText(page, "p", "passport-zone__kicker", `Часть побережья · ${number}`);
  appendText(page, "h2", "view-title", part.name);
  appendText(page, "p", "passport-zone__progress", progress.total ? `Отмечено ${progress.visited} из ${progress.total}` : "Мест для прогресса здесь нет");
  if (progress.total) progressBar(page, progress.visited, progress.total, `Отмечено в части «${part.name}»`);

  const points = ordered.filter((o) => o.point).map((o) => ({ id: o.place.id, x: o.point.x, y: o.point.y }));
  if (points.length) {
    const layout = layoutMarkers(points);
    const svg = createMapSvg({ viewBox: layout.viewBox, parts: content.coastParts, currentPart: part.id, label: `Декоративная схема: ${part.name}` });
    const layer = el("g", { class: "pp-markers" }, svg);
    const r = layout.hitR;
    layout.markers.forEach((marker) => {
      const index = ordered.findIndex((o) => o.place.id === marker.id);
      const place = ordered[index].place;
      const visited = Boolean(getVisit(state, place.id));
      const link = el("a", {
        href: `#/place/${place.id}`,
        class: `pp-marker${visited ? " pp-marker--visited" : ""}`,
        "aria-label": `${index + 1}. ${place.name.ru} — ${visited ? "отмечено" : "ещё не отмечено"}`,
        "data-place": place.id,
        style: `--ink: ${CATEGORY_INK[place.category] || "#0b6e6e"}`,
      }, layer);
      if (marker.moved) {
        el("line", { x1: marker.tx, y1: marker.ty, x2: marker.x, y2: marker.y, class: "pp-marker__leader", "stroke-width": r * 0.08 }, link);
        el("circle", { cx: marker.tx, cy: marker.ty, r: r * 0.16, class: "pp-marker__true" }, link);
      }
      el("circle", { cx: marker.x, cy: marker.y, r, class: "pp-marker__hit" }, link);
      el("circle", { cx: marker.x, cy: marker.y, r: r * 0.62, class: "pp-marker__disc", "stroke-width": r * 0.12 }, link);
      const num = el("text", { x: marker.x, y: marker.y + r * 0.02, class: "pp-marker__num", "font-size": r * 0.62 }, link);
      num.textContent = String(index + 1);
      if (visited) {
        el("circle", { cx: marker.x + r * 0.5, cy: marker.y - r * 0.5, r: r * 0.3, class: "pp-marker__check-bg" }, link);
        const check = el("text", { x: marker.x + r * 0.5, y: marker.y - r * 0.48, class: "pp-marker__check", "font-size": r * 0.4 }, link);
        check.textContent = "✓";
      }
    });
    const moved = layout.markers.some((m) => m.moved);
    mapFigure(page, svg, moved ? "Близкие места раздвинуты: тонкая линия ведёт к точке из карточки места." : "");
  }

  const section = document.createElement("section");
  section.className = "settings-section";
  appendText(section, "h3", "settings-section__title", `Места этой части · ${ordered.length}`);
  const list = document.createElement("ol");
  list.className = "passport-zone-list";
  ordered.forEach(({ place, point }, index) => {
    const visit = getVisit(state, place.id);
    const li = document.createElement("li");
    li.className = `passport-zone-item${visit ? " passport-zone-item--visited" : ""}`;
    li.dataset.place = place.id;
    appendText(li, "span", "passport-zone-item__num", String(index + 1)).setAttribute("aria-hidden", "true");
    const body = document.createElement("div");
    body.className = "passport-zone-item__body";
    const link = placeLink(place, "passport-visit__link");
    const icon = document.createElement("span");
    icon.className = "passport-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = placeIcon(place);
    link.prepend(icon);
    body.appendChild(link);
    appendText(body, "p", `passport-zone-item__state${visit ? " passport-zone-item__state--visited" : ""}`, visit ? `✓ ${markedLine(visit)}` : "Ещё не отмечено");
    if (visit && visit.note) appendText(body, "p", "passport-visit__note", `«${visit.note}»`);
    if (!isRewardPlace(place)) appendText(body, "p", "passport-visit__keepsake", "Покупки — только на память, без наград.");
    if (!point) appendText(body, "p", "passport-visit__keepsake", "Нет на схеме: координаты места вне охвата схемы.");
    li.appendChild(body);
    list.appendChild(li);
  });
  section.appendChild(list);
  page.appendChild(section);
}

// ------------------------------------------------------------ карточка места

// Компактный блок «Паспорт» в карточке места: состояние, отметка и снятие,
// заметка. content — результат loadPassport() или null (файл не загрузился:
// отмечать можно, сообщение о новой наклейке просто не показывается).
// Блок стоит в потоке карточки и не трогает закреплённые действия.
export function renderPassportBlock(container, { place, places, config, content }) {
  const block = document.createElement("section");
  block.className = "passport-block";
  block.setAttribute("aria-labelledby", "passport-block-title");
  const title = appendText(block, "h3", "passport-block__title", "Паспорт исследователя");
  title.id = "passport-block-title";
  const body = document.createElement("div");
  body.className = "passport-block__body";
  block.appendChild(body);
  const status = appendText(block, "p", "passport-block__status", "");
  status.setAttribute("role", "status");
  const link = appendText(block, "a", "passport-block__link", "Паспорт ›");
  link.href = "#/passport";
  container.appendChild(block);

  if (!storage.isAvailable()) {
    appendText(body, "p", "passport-block__muted", NO_STORAGE_TEXT);
    return;
  }

  const prepared = content && config ? prepareContent(content, config) : null;
  const earnedNow = () =>
    prepared ? earnedStickerIds(evaluatePassport({ state: storage.getPassport(), places, content: prepared })) : [];
  const stickerTitle = (id) => prepared.stickers.find((s) => s.id === id).title;
  // Снятая отметка целиком (с датой и заметкой) — для «Вернуть».
  let removed = null;

  const button = (parent, label, className, onClick) => {
    const el = appendText(parent, "button", className, label);
    el.type = "button";
    el.addEventListener("click", onClick);
    return el;
  };

  function draw() {
    body.innerHTML = "";
    const visit = getVisit(storage.getPassport(), place.id);
    if (!isRewardPlace(place)) appendText(body, "p", "passport-block__muted", KEEPSAKE_TEXT);

    if (!visit) {
      appendText(body, "p", "passport-block__state", "Ещё не отмечено");
      const mark = button(body, "Отметить посещение", "btn btn--secondary passport-block__button", () => {
        const before = earnedNow();
        if (!storage.markPassportVisit(place.id, getTodayIso(), new Date().toISOString())) {
          status.textContent = SAVE_FAILED_TEXT;
          return;
        }
        removed = null;
        const fresh = earnedNow().filter((id) => !before.includes(id));
        status.textContent = fresh.length
          ? `Отмечено. Новая наклейка: ${fresh.map((id) => `«${stickerTitle(id)}»`).join(", ")}.`
          : "Отмечено.";
        draw();
        body.querySelector("button").focus();
      });
      if (removed) {
        const restoreVisit = removed;
        button(body, "Вернуть отметку", "settings-actions__skip passport-block__undo", () => {
          if (!storage.restorePassportVisit(place.id, restoreVisit)) {
            status.textContent = SAVE_FAILED_TEXT;
            return;
          }
          removed = null;
          status.textContent = "Отметка возвращена.";
          draw();
          body.querySelector("button").focus();
        });
      }
      return mark;
    }

    appendText(body, "p", "passport-block__state passport-block__state--done", `✓ ${markedLine(visit)}`);
    if (visit.note) {
      appendText(body, "p", "passport-block__note", `Заметка: «${visit.note}»`);
    } else {
      appendText(body, "p", "passport-block__muted", "Заметки пока нет.");
    }

    const actions = document.createElement("div");
    actions.className = "passport-block__actions";
    body.appendChild(actions);
    const edit = button(actions, visit.note ? "Изменить заметку" : "Добавить заметку", "btn btn--secondary passport-block__button", () => {
      actions.hidden = true;
      openEditor(visit);
    });
    const remove = () => {
      if (!storage.removePassportVisit(place.id)) {
        status.textContent = SAVE_FAILED_TEXT;
        return;
      }
      removed = visit;
      status.textContent = "Отметка снята.";
      draw();
      body.querySelector("button").focus();
    };
    const unmark = button(actions, "Снять отметку", "settings-actions__skip passport-block__unmark", () => {
      if (!visit.note) {
        remove();
        return;
      }
      // С заметкой — сначала встроенное подтверждение (без confirm()).
      actions.hidden = true;
      const box = createConfirm("Снять отметку и удалить заметку?", [{ label: "Снять отметку и заметку", primary: true, onClick: remove }], () => {
        box.remove();
        actions.hidden = false;
        unmark.focus();
      });
      body.appendChild(box);
      box.querySelector("button").focus();
    });
    return edit;
  }

  function openEditor(visit) {
    const form = document.createElement("div");
    form.className = "passport-note";
    const label = appendText(form, "label", "settings-field__label", `Заметка (до ${NOTE_MAX_LENGTH} символов)`);
    label.htmlFor = "passport-note-text";
    const textarea = document.createElement("textarea");
    textarea.id = "passport-note-text";
    textarea.className = "settings-field__input passport-note__input";
    textarea.rows = 3;
    textarea.maxLength = NOTE_MAX_LENGTH;
    textarea.value = visit.note || "";
    const counter = appendText(form, "p", "passport-note__counter", "");
    counter.id = "passport-note-counter";
    textarea.setAttribute("aria-describedby", counter.id);
    const updateCounter = () => {
      counter.textContent = `${textarea.value.length} / ${NOTE_MAX_LENGTH}`;
    };
    textarea.addEventListener("input", updateCounter);
    updateCounter();
    form.insertBefore(textarea, counter);
    const buttons = document.createElement("div");
    buttons.className = "passport-note__buttons";
    button(buttons, "Сохранить заметку", "btn btn--primary", () => {
      if (!storage.setPassportNote(place.id, textarea.value)) {
        status.textContent = SAVE_FAILED_TEXT;
        return;
      }
      const saved = getVisit(storage.getPassport(), place.id);
      status.textContent = saved && saved.note ? "Заметка сохранена." : "Заметка удалена.";
      draw().focus();
    });
    button(buttons, "Отмена", "btn btn--secondary", () => {
      draw().focus();
    });
    form.appendChild(buttons);
    body.appendChild(form);
    textarea.focus();
  }

  draw();
}
