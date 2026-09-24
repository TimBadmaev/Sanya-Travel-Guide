import { loadConfig, loadExcursions, loadPlaces, loadPlan, loadErrorMessage } from "../data.js";
import { storage } from "../storage.js";
import { EFFORT_LABELS, NEAR_RADIUS_KM, SETTING_LABELS, applyFilters, formatDuration } from "../logic/filters.js";
import { formatDistance } from "../logic/distance.js";
import { formatOpenStatus, getOpenStatus, localMoment, formatClock, OPEN_STATE } from "../logic/hours.js";
import { ORIGIN_PRECISION, pluralizeRu, resolveOrigin } from "../logic/trip.js";
import { TODAY_STATE, formatShortDate, getPeriodDates, isDayEmpty, resolveDayTitle, resolveToday } from "../logic/plan.js";
import { dayItems, isDepartureDay, nextItem, nowCandidates, rhythmNow } from "../logic/today.js";
import { CATEGORY_ICONS, DEFAULT_ICON } from "./places.js";
import { EXCURSION_ICON, appendBackLink, createTypeChip, excursionSummary, renderPlanError, typesMap } from "./plan.js";

// «Сегодня» на «Сейчас» и экран «Что делать сейчас» (#/now) — Iteration 9,
// ITERATION-9-IMPLEMENTATION-2026-09.md §2. Второго источника истины нет:
// день — из stg:myplan, отметки «сделано» — из stg:plandone, часы — из
// places.json; всё остальное считается при показе и нигде не хранится.

function appendText(parent, tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.textContent = text;
  parent.appendChild(el);
  return el;
}

function shiftIso(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

// «Открыто до 18:00» только для мест с подтверждёнными часами; без них —
// ничего (пункт плана не превращается в предупреждение).
function knownStatusText(place, moment) {
  const status = getOpenStatus(place.openingHours, moment);
  return status.state === OPEN_STATE.UNKNOWN ? "" : formatOpenStatus(status);
}

// ------------------------------------------------------------ день вылета

// Только проверенные карточки «Справки» и итог расходов — фактов об
// аэропорте, которых нет в контенте, здесь не появляется.
export function renderDepartureBlock(container) {
  const block = document.createElement("div");
  block.className = "today-departure";
  appendText(block, "p", "today-departure__title", "✈️ День вылета");
  const links = document.createElement("div");
  links.className = "home-help";
  [
    ["Сдать багаж в отеле и забрать в аэропорту", "#/info/luggage-delivery"],
    ["Покупки duty free — выдача в аэропорту", "#/info/duty-free-shopping"],
    ["Возврат НДС при выезде", "#/info/tax-refund"],
    ["Итоги расходов поездки", "#/expenses"],
  ].forEach(([label, href]) => {
    appendText(links, "a", "home-link", label).href = href;
  });
  block.appendChild(links);
  container.appendChild(block);
}

// ------------------------------------------------------------ «Сегодня»

// Карточка «Сегодня» на «Сейчас»: что по плану сейчас и дальше, пункты дня с
// отметкой «сделано», завтрашний день. Возвращает false, если сегодня нет в
// периоде плана или день пуст — тогда Главная показывает прежний блок плана.
export function renderTodayCard(container, { plan, places, excursions, config, trip, now = new Date() }) {
  if (!plan) return false;
  const moment = localMoment(now);
  const today = moment.date;
  if (resolveToday(plan.meta, today).state !== TODAY_STATE.DURING) return false;
  const day = storage.getMyPlan().days[today];
  if (isDayEmpty(day)) return false;

  const card = document.createElement("section");
  card.className = "today";
  card.setAttribute("aria-label", "Сегодня");

  const draw = () => {
    card.innerHTML = "";
    const head = document.createElement("a");
    head.className = "today__head";
    head.href = `#/plan/${today}`;
    appendText(head, "span", "home-plan__label", `Сегодня по плану · ${formatShortDate(today)}`);
    const title = appendText(head, "span", "home-plan__title", resolveDayTitle(day, places, excursions));
    const chip = createTypeChip(day.type, typesMap(config));
    if (chip) title.append(" ", chip);
    // Заголовок — вход в день; отдельной ссылки «Открыть день» нет, чтобы
    // карточка помещалась на первый экран 320×568.
    appendText(title, "span", "today__chevron", " ›").setAttribute("aria-hidden", "true");
    head.setAttribute("aria-label", `Открыть день: ${resolveDayTitle(day, places, excursions)}`);
    card.appendChild(head);

    const { now: part, next } = rhythmNow(day, moment.minutes);
    const rhythmLine = (className, lead, text) => {
      const line = appendText(card, "p", className, "");
      appendText(line, "strong", "", `${lead}: `);
      line.append(text);
    };
    if (part) rhythmLine("today__rhythm", `Сейчас, ${part.when}`, part.text);
    if (next) rhythmLine("today__rhythm today__rhythm--next", `Дальше, ${next.when}`, next.text);

    const items = dayItems(day, { places, excursions, doneKeys: storage.getPlanDone().days[today] });
    const upcoming = nextItem(items);
    if (items.length) {
      const list = document.createElement("ul");
      list.className = "today__items";
      items.forEach((item) => list.appendChild(renderItemRow(item, { upcoming, moment, date: today, onChange: draw })));
      card.appendChild(list);
    }
    if (items.length && !upcoming) appendText(card, "p", "today__done", "Всё из плана на сегодня отмечено ✓");

    const tomorrow = shiftIso(today, 1);
    if (getPeriodDates(plan.meta).includes(tomorrow)) {
      const tomorrowDay = storage.getMyPlan().days[tomorrow];
      const text = isDayEmpty(tomorrowDay) ? "ничего не запланировано" : resolveDayTitle(tomorrowDay, places, excursions);
      appendText(card, "p", "today__tomorrow", `Завтра: ${text}`);
    }

    if (isDepartureDay(day, today, trip && trip.end)) renderDepartureBlock(card);
  };
  draw();
  container.appendChild(card);
  return true;
}

// Строка пункта дня: кнопка «сделано» (≥44 px) и ссылка на карточку.
// Используется и на экране дня плана (views/plan.js).
// details — подпись пункта, как у карточек дня («Экскурсия · Целый день ·
// 4–7 ч · …» / «1–2 ч · Лёгкая нагрузка»): на экране дня она нужна, на
// компактной карточке «Сегодня» — нет.
export function renderItemRow(item, { upcoming, moment, date, onChange, details = false }) {
  const li = document.createElement("li");
  li.className = `today__item${item.done ? " is-done" : ""}`;
  const check = document.createElement("button");
  check.type = "button";
  check.className = "today__check";
  check.setAttribute("aria-pressed", String(item.done));
  check.setAttribute("aria-label", item.done ? `Снять отметку «сделано»: ${item.title}` : `Отметить как сделанное: ${item.title}`);
  check.textContent = "✓";
  check.addEventListener("click", () => {
    if (!storage.setPlanItemDone(date, item.key, !item.done)) {
      window.alert("Не удалось сохранить: хранилище браузера недоступно.");
      return;
    }
    onChange();
  });
  const link = document.createElement("a");
  link.className = "today__link";
  link.href = item.href;
  appendText(link, "span", "today__title", `${item.kind === "excursion" ? `${EXCURSION_ICON} ` : ""}${item.title}`);
  const meta = [
    item.done ? "Сделано" : upcoming && upcoming.key === item.key ? "Следующее" : "",
    item.kind === "place" && !item.done && moment ? knownStatusText(item.item, moment) : "",
    details && item.kind === "excursion" ? excursionSummary(item.item, "Экскурсия") : "",
    details && item.kind === "place" ? [formatDuration(item.item.durationHours), EFFORT_LABELS[item.item.effort]].filter(Boolean).join(" · ") : "",
  ].filter(Boolean);
  if (meta.length) appendText(link, "span", "today__meta", meta.join(" · "));
  li.append(check, link);
  return li;
}

// ------------------------------------------------------------ «Подходит сейчас»

function candidateRow(entry, categoriesById) {
  const { place, status, km } = entry;
  const card = document.createElement("a");
  card.href = `#/place/${place.id}`;
  card.className = "info-card now-row";
  const category = categoriesById.get(place.category);
  appendText(card, "span", "info-card__icon", (category && CATEGORY_ICONS[category.icon]) || DEFAULT_ICON).setAttribute("aria-hidden", "true");
  const body = document.createElement("span");
  body.className = "info-card__body";
  appendText(body, "span", "info-card__title", place.name.ru);
  appendText(body, "span", `now-row__status${status.state === OPEN_STATE.UNKNOWN ? " now-row__status--unknown" : ""}`, formatOpenStatus(status));
  appendText(
    body,
    "span",
    "info-card__summary",
    [km === null ? "" : formatDistance(km), formatDuration(place.durationHours), EFFORT_LABELS[place.effort], SETTING_LABELS[place.setting]]
      .filter(Boolean)
      .join(" · ")
  );
  card.appendChild(body);
  return card;
}

function todayPlacesIds(plan, date) {
  if (!plan || resolveToday(plan.meta, date).state !== TODAY_STATE.DURING) return [];
  const day = storage.getMyPlan().days[date];
  return day && Array.isArray(day.placeIds) ? day.placeIds : [];
}

const PREVIEW_LIMIT = 3;

// Компактный блок на «Сейчас»: до трёх мест, открытых сейчас по
// подтверждённым часам, и вход в полный экран #/now.
export function renderNowPreview(container, { places, config, trip, plan, now = new Date() }) {
  const moment = localMoment(now);
  const { point } = resolveOrigin(trip, config);
  const { suitable } = nowCandidates(places, { moment, origin: point, exclude: todayPlacesIds(plan, moment.date) });
  const block = document.createElement("section");
  block.className = "now-preview";
  appendText(block, "h3", "home-subtitle", `Подходит сейчас · ${formatClock(moment.minutes)}`);
  if (suitable.length) {
    const list = document.createElement("div");
    list.className = "info-list";
    const categoriesById = new Map(config.categories.map((c) => [c.id, c]));
    suitable.slice(0, PREVIEW_LIMIT).forEach((entry) => list.appendChild(candidateRow(entry, categoriesById)));
    block.appendChild(list);
  } else {
    appendText(block, "p", "plan-hint", "По подтверждённым часам сейчас ничего рядом не открыто.");
  }
  appendText(block, "a", "home-link", "Что ещё можно сделать сейчас ›").href = "#/now";
  container.appendChild(block);
}

// ------------------------------------------------------------ #/now

const NOW_FILTERS = [
  ["indoor", "В помещении"],
  ["easy", "Легко"],
  ["short", "До 2 ч"],
];
const UNCONFIRMED_LIMIT = 6;

function parseNowFilters(raw) {
  const allowed = NOW_FILTERS.map(([token]) => token);
  return [...new Set((raw || "").split(",").filter((token) => allowed.includes(token)))];
}

export async function renderNow(container, ctx) {
  container.innerHTML = '<p class="loading">Загрузка…</p>';
  let places;
  let config;
  let plan;
  let excursions;
  try {
    [places, config, plan, excursions] = await Promise.all([
      loadPlaces(),
      loadConfig(),
      loadPlan().catch(() => null),
      loadExcursions().catch(() => []),
    ]);
  } catch (e) {
    console.error(e);
    if (ctx.isCurrent()) renderPlanError(container, "Что делать сейчас", loadErrorMessage(e), () => renderNow(container, ctx));
    return;
  }
  if (!ctx.isCurrent()) return;

  const fromPath = (ctx.from || "").replace(/^#/, "").split("?")[0];
  const parent = fromPath === "/" || /^\/plan\/\d{4}-\d{2}-\d{2}$/.test(fromPath) ? ctx.from : "#/";
  const trip = storage.getTrip();
  const { point, precision } = resolveOrigin(trip, config);
  const moment = localMoment();
  const categoriesById = new Map(config.categories.map((c) => [c.id, c]));
  let tokens = parseNowFilters(ctx.query.get("f"));

  container.innerHTML = "";
  appendBackLink(container, "← Назад", parent, ctx);
  appendText(container, "h2", "view-title", "Что делать сейчас");
  appendText(container, "p", "plan-subtitle", `Сейчас ${formatClock(moment.minutes)} · ${formatShortDate(moment.date)} — по часам телефона`);

  // Что по плану сейчас — одна строка со ссылкой на день.
  if (plan && resolveToday(plan.meta, moment.date).state === TODAY_STATE.DURING) {
    const day = storage.getMyPlan().days[moment.date];
    if (!isDayEmpty(day)) {
      const { now: part } = rhythmNow(day, moment.minutes);
      const link = document.createElement("a");
      link.className = "home-plan";
      link.href = `#/plan/${moment.date}`;
      appendText(link, "span", "home-plan__label", "По плану на сегодня");
      appendText(link, "span", "home-plan__title", resolveDayTitle(day, places, excursions));
      if (part) appendText(link, "span", "today__rhythm", `${part.label}: ${part.text}`);
      container.appendChild(link);
    }
  }

  const chipsRow = document.createElement("div");
  chipsRow.className = "chips";
  chipsRow.setAttribute("role", "group");
  chipsRow.setAttribute("aria-label", "Фильтры");
  const chips = NOW_FILTERS.map(([token, label]) => {
    const chip = appendText(chipsRow, "button", "chip", label);
    chip.type = "button";
    chip.dataset.token = token;
    chip.addEventListener("click", () => {
      tokens = tokens.includes(token) ? tokens.filter((t) => t !== token) : [...tokens, token];
      history.replaceState(history.state, "", tokens.length ? `#/now?f=${tokens.join(",")}` : "#/now");
      drawResults();
    });
    return chip;
  });
  container.appendChild(chipsRow);

  const results = document.createElement("div");
  container.appendChild(results);

  function drawResults() {
    chips.forEach((chip) => chip.setAttribute("aria-pressed", String(tokens.includes(chip.dataset.token))));
    results.innerHTML = "";
    const base = applyFilters(places, tokens, { savedIds: [] });
    const { suitable, unconfirmed, closedCount } = nowCandidates(base, {
      moment,
      origin: point,
      exclude: todayPlacesIds(plan, moment.date),
    });

    if (precision === ORIGIN_PRECISION.NONE) {
      const notice = appendText(results, "p", "area-notice", "Не знаем, где вы живёте, — места не отсортированы по расстоянию. ");
      const link = appendText(notice, "a", "area-notice__link", "Указать район");
      link.href = "#/settings";
    } else {
      appendText(results, "p", "plan-hint now-radius", `В радиусе ${NEAR_RADIUS_KM} км от ${precision === ORIGIN_PRECISION.EXACT ? "места проживания" : "центра района"}, ближе — выше.`);
    }

    appendText(results, "h3", "place-detail__subtitle", "Открыто и успеете");
    if (suitable.length) {
      const list = document.createElement("div");
      list.className = "info-list";
      suitable.forEach((entry) => list.appendChild(candidateRow(entry, categoriesById)));
      results.appendChild(list);
    } else {
      appendText(results, "p", "plan-hint", "По подтверждённым часам сейчас ничего не подходит.");
    }
    if (closedCount) {
      const noun = pluralizeRu(closedCount, ["место", "места", "мест"]);
      appendText(results, "p", "plan-hint now-closed", `Не показаны: ${closedCount} ${noun} с известными часами — сейчас закрыто или закроется раньше, чем вы успеете.`);
    }

    if (unconfirmed.length) {
      appendText(results, "h3", "place-detail__subtitle", "Часы не подтверждены");
      appendText(results, "p", "plan-hint", "Могут быть открыты — проверьте часы в карточке перед выездом.");
      const list = document.createElement("div");
      list.className = "info-list";
      unconfirmed.slice(0, UNCONFIRMED_LIMIT).forEach((entry) => list.appendChild(candidateRow(entry, categoriesById)));
      results.appendChild(list);
      if (unconfirmed.length > UNCONFIRMED_LIMIT) {
        const all = appendText(results, "a", "home-link", "Все места ›");
        all.href = tokens.length ? `#/places?f=${tokens.join(",")}` : "#/places";
      }
    }

    appendText(
      results,
      "p",
      "task__meta",
      "Как подбираем: место открыто по подтверждённым часам, до закрытия хватает минимального времени на месте, ближе к жилью — выше. Время в пути не учитываем. Часы могут измениться — перед выездом проверьте карточку места."
    );
    appendText(results, "h3", "place-detail__subtitle", "Ещё варианты");
    const more = document.createElement("div");
    more.className = "home-help";
    [
      ["🌧 Готовые сценарии на дождь", "#/excursions?f=rain"],
      ["🌇 Куда сходить вечером", "#/excursions?f=evening"],
      ["🍜 Поесть рядом", "#/places?mode=food&near=1"],
    ].forEach(([label, href]) => {
      appendText(more, "a", "home-link", label).href = href;
    });
    results.appendChild(more);
  }
  drawResults();
}
