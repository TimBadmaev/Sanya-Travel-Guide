import { loadPlan, loadPlaces, loadConfig, loadExcursions, loadErrorMessage } from "../data.js";
import { storage } from "../storage.js";
import { EFFORT_LABELS, EXCURSION_FORMAT_LABELS, formatDuration } from "../logic/filters.js";
import { getTodayIso, pluralizeRu } from "../logic/trip.js";
import {
  findRecommendedDay,
  formatDayMonth,
  formatLongDate,
  formatPeriod,
  formatShortDate,
  countDayItems,
  getDayExcursions,
  getDayNumber,
  getDayPlaces,
  getPeriodDates,
  isDayEmpty,
  isInPeriod,
  isIsoDate,
  isSameAsRecommended,
  resolveDayTitle,
} from "../logic/plan.js";
import {
  ADD_PLACE_STATUS,
  ITEM_KIND,
  MAX_PLACES_PER_DAY,
  acceptDay,
  addItem,
  clearDay,
  countPlannedDays,
  getAddItemStatus,
  moveDay,
  replaceDayWithItem,
  swapDays,
} from "../logic/myplan.js";
import { filterByDate, formatBaseLine, formatByCurrency, summarize } from "../logic/expenses.js";

// «Мой план» (Итерация 6, ITERATION-6-RESEARCH.md §9): #/plan, #/plan/<date>,
// #/plan/<date>/move, #/place/<id>/plan. Рекомендация (data/plan.json) здесь
// только читается; всё, что меняет пользователь, пишется в stg:myplan через
// операции logic/myplan.js. Отрисовка дня и инлайн-подтверждение — общие с
// recommended.js и place.js (одна форма дня, §6.3).

export const EMPTY_DAY_TEXT = "Пока ничего не запланировано";
const SAVE_FAILED_TEXT = "Не удалось сохранить: хранилище браузера недоступно.";

function pathOf(hash) {
  return (hash || "").replace(/^#/, "").split("?")[0] || "/";
}

// Родитель для «← Назад»: откуда пришли, если это один из ожидаемых экранов;
// иначе (глубокая ссылка, перезагрузка, приход после replace) — по умолчанию.
// Прецедент — parentHash() в handy.js ([I4-2]).
export function parentFrom(ctx, paths, fallback) {
  return ctx.from && paths.includes(pathOf(ctx.from)) ? ctx.from : fallback;
}

export function renderPlanError(container, title, message, onRetry) {
  container.innerHTML = "";
  const heading = document.createElement("h2");
  heading.className = "view-title";
  heading.textContent = title;
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

export function appendBackLink(container, label, parentHash, ctx) {
  const link = document.createElement("a");
  link.href = parentHash;
  link.className = "place-detail__back";
  link.textContent = label;
  link.addEventListener("click", (event) => {
    event.preventDefault();
    ctx.back(parentHash);
  });
  container.appendChild(link);
  return link;
}

function appendText(parent, tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.textContent = text;
  parent.appendChild(el);
  return el;
}

export function typesMap(config) {
  return new Map((config.planDayTypes || []).map((type) => [type.id, type]));
}

// Чип типа — только если тип есть в справочнике; пустого места не остаётся.
export function createTypeChip(type, typesById) {
  const known = type && typesById.get(type);
  if (!known) return null;
  const chip = document.createElement("span");
  chip.className = "plan-chip";
  chip.textContent = known.name;
  return chip;
}

// Кнопка-подтверждение раскрывается инлайн, без модального окна (§9.2).
// actions — [{ label, primary, onClick }]; «Отмена» добавляется последней.
export function createConfirm(text, actions, onCancel) {
  const box = document.createElement("div");
  box.className = "plan-confirm";
  box.setAttribute("role", "group");
  appendText(box, "p", "plan-confirm__text", text);
  const buttons = document.createElement("div");
  buttons.className = "plan-confirm__buttons";
  [...actions, { label: "Отмена", primary: false, onClick: onCancel }].forEach(({ label, primary, onClick }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `btn ${primary ? "btn--primary" : "btn--secondary"}`;
    button.textContent = label;
    button.addEventListener("click", onClick);
    buttons.appendChild(button);
  });
  box.appendChild(buttons);
  return box;
}

export function createStatus() {
  const status = document.createElement("p");
  status.className = "plan-status";
  status.setAttribute("role", "status");
  return status;
}

// Запись «Моего плана»; при недоступном хранилище экран остаётся и честно
// говорит, что не сохранил ([I3-6]).
export function saveMyPlan(next, status) {
  if (storage.setMyPlan(next)) {
    if (status) status.textContent = "";
    return true;
  }
  if (status) status.textContent = SAVE_FAILED_TEXT;
  return false;
}

// Содержимое дня (§13.3.1): отсутствующие поля не выводятся вовсе — ни
// пустых заголовков, ни прочерков. Заголовок и дату рисует экран.
export function renderDayBody(container, day, { places, excursions, typesById }) {
  const chip = createTypeChip(day.type, typesById);
  if (chip) {
    const row = document.createElement("p");
    row.className = "plan-day__type";
    row.appendChild(chip);
    container.appendChild(row);
  }
  if (day.summary) appendText(container, "p", "plan-day__summary", day.summary);

  const rhythm = [
    ["Утро", day.morning],
    ["День", day.afternoon],
    ["Вечер", day.evening],
  ].filter(([, text]) => text);
  if (rhythm.length) {
    const list = document.createElement("ul");
    list.className = "plan-rhythm";
    rhythm.forEach(([label, text]) => {
      const li = document.createElement("li");
      appendText(li, "span", "plan-rhythm__label", label);
      appendText(li, "span", "plan-rhythm__text", text);
      list.appendChild(li);
    });
    container.appendChild(list);
  }

  // Экскурсии дня — отдельным блоком перед местами, с иконкой и подписью
  // «Экскурсия»: тип пункта виден сразу. Экскурсия — один пункт дня, её
  // места внутри дня не раскрываются (они на карточке экскурсии).
  const { excursions: dayExcursions, missing: missingExcursions } = getDayExcursions(day, excursions);
  if (missingExcursions.length) {
    console.warn("Экскурсии дня не найдены среди опубликованных и пропущены:", missingExcursions.join(", "));
  }
  if (dayExcursions.length) {
    appendText(container, "h3", "place-detail__subtitle", "Экскурсии этого дня");
    const list = document.createElement("div");
    list.className = "info-list plan-places plan-excursions";
    dayExcursions.forEach((excursion) => {
      const card = document.createElement("a");
      card.href = `#/excursion/${excursion.id}`;
      card.className = "info-card";
      appendText(card, "span", "info-card__icon", EXCURSION_ICON).setAttribute("aria-hidden", "true");
      const body = document.createElement("span");
      body.className = "info-card__body";
      appendText(body, "span", "info-card__title", excursion.title.ru);
      appendText(body, "span", "info-card__summary", excursionSummary(excursion, "Экскурсия"));
      card.appendChild(body);
      list.appendChild(card);
    });
    container.appendChild(list);
  }

  const { places: dayPlaces, missing } = getDayPlaces(day, places);
  if (missing.length) {
    // Удалённые и черновые места пропускаются молча (§11.2).
    console.warn("Места дня не найдены среди опубликованных и пропущены:", missing.join(", "));
  }
  if (dayPlaces.length) {
    appendText(container, "h3", "place-detail__subtitle", "Места этого дня");
    const list = document.createElement("div");
    list.className = "info-list plan-places";
    dayPlaces.forEach((place) => {
      const card = document.createElement("a");
      card.href = `#/place/${place.id}`;
      card.className = "info-card";
      const body = document.createElement("span");
      body.className = "info-card__body";
      appendText(body, "span", "info-card__title", place.name.ru);
      appendText(body, "span", "info-card__summary", [formatDuration(place.durationHours), EFFORT_LABELS[place.effort]].filter(Boolean).join(" · "));
      card.appendChild(body);
      list.appendChild(card);
    });
    container.appendChild(list);
  }

  if (Array.isArray(day.tips) && day.tips.length) {
    appendText(container, "h3", "place-detail__subtitle", "Советы");
    const list = document.createElement("ul");
    list.className = "info-detail__points";
    day.tips.forEach((tip) => appendText(list, "li", "", tip));
    container.appendChild(list);
  }

  if (day.alt) {
    appendText(container, "h3", "place-detail__subtitle", "Если не хочется");
    appendText(container, "p", "plan-day__alt", day.alt);
  }
}

// Иконка и строка параметров экскурсии — общие для дня плана и списка
// «Экскурсий» (views/excursions.js).
export const EXCURSION_ICON = "🧭";

export function excursionSummary(excursion, prefix) {
  return [prefix, EXCURSION_FORMAT_LABELS[excursion.format], formatDuration(excursion.durationHours), EFFORT_LABELS[excursion.effort]]
    .filter(Boolean)
    .join(" · ");
}

// Строка даты в списках: «чт, 19 ноября · День 7», заголовок или «Пока
// ничего не запланировано», чип типа. tag — "a" (переход) или "button".
function createDayRow(tag, date, day, { plan, places, excursions, typesById, today, note }) {
  const row = document.createElement(tag);
  row.className = "plan-row";
  if (tag === "button") row.type = "button";
  const number = plan ? getDayNumber(plan.meta, date) : null;
  const isToday = date === today;
  if (isToday) row.classList.add("is-today");
  if (today && date < today) row.classList.add("is-past");

  const head = [formatShortDate(date), number ? `День ${number}` : "", isToday ? "Сегодня" : ""].filter(Boolean).join(" · ");
  appendText(row, "span", "plan-row__date", head);

  const empty = isDayEmpty(day);
  const title = empty ? "" : resolveDayTitle(day, places, excursions);
  const titleEl = appendText(row, "span", "plan-row__title", title || EMPTY_DAY_TEXT);
  if (!title) titleEl.classList.add("plan-row__title--empty");

  const chip = empty ? null : createTypeChip(day.type, typesById);
  if (chip || note) {
    const meta = document.createElement("span");
    meta.className = "plan-row__meta";
    if (chip) meta.appendChild(chip);
    if (note) appendText(meta, "span", "plan-row__note", note);
    row.appendChild(meta);
  }
  return row;
}

async function loadAll(requirePlan) {
  let planError = null;
  const [places, excursions, config, plan] = await Promise.all([
    loadPlaces(),
    // Экскурсии необязательны (D-06): день из одних мест должен открываться и
    // тогда, когда excursions.json недоступен. Пустой список читается так же,
    // как удалённая экскурсия, — getDayExcursions() вернёт её id в missing, и
    // пункт молча пропускается (§11.2), экран остаётся рабочим.
    loadExcursions().catch((error) => {
      console.warn("Экскурсии недоступны — день показывается без них", error);
      return [];
    }),
    loadConfig(),
    requirePlan
      ? loadPlan()
      : loadPlan().catch((error) => {
          planError = error;
          return null;
        }),
  ]);
  return { places, excursions, config, plan, planError };
}

function areaName(config, plan) {
  const area = plan && config.areas.find((a) => a.id === plan.meta.area);
  return area ? area.name : "";
}

export function periodLine(config, plan) {
  const count = getPeriodDates(plan.meta).length;
  return [areaName(config, plan), formatPeriod(plan.meta), `${count} ${pluralizeRu(count, ["день", "дня", "дней"])}`]
    .filter(Boolean)
    .join(" · ");
}

// ---------------------------------------------------------------- #/plan

export async function renderMyPlan(container, ctx) {
  container.innerHTML = '<p class="loading">Загрузка плана…</p>';
  let data;
  try {
    data = await loadAll(false);
  } catch (e) {
    console.error(e);
    if (ctx.isCurrent()) renderPlanError(container, "Мой план", loadErrorMessage(e), () => renderMyPlan(container, ctx));
    return;
  }
  if (!ctx.isCurrent()) return;

  const { places, excursions, config, plan, planError } = data;
  const typesById = typesMap(config);
  const myPlan = storage.getMyPlan();
  // Без рекомендации (§9.10) — сохранённые дни без нумерации «День N».
  const dates = plan ? getPeriodDates(plan.meta) : Object.keys(myPlan.days).sort();
  if (!dates.length) {
    renderPlanError(container, "Мой план", loadErrorMessage(planError), () => renderMyPlan(container, ctx));
    return;
  }

  container.innerHTML = "";
  appendBackLink(container, "← Назад", parentFrom(ctx, ["/", "/recommended"], "#/"), ctx);
  appendText(container, "h2", "view-title", "Мой план");
  if (plan) {
    appendText(container, "p", "plan-subtitle", periodLine(config, plan));
  } else {
    appendText(container, "p", "area-notice", "Рекомендованный план сейчас недоступен — показаны сохранённые дни.");
  }

  const planned = countPlannedDays(myPlan, dates);
  if (plan && planned === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state plan-empty";
    appendText(empty, "p", "", "План пока пустой. Возьмите рекомендованный план целиком или отдельные дни.");
    const link = appendText(empty, "a", "btn btn--primary plan-button", "Посмотреть рекомендованный план");
    link.href = "#/recommended";
    container.appendChild(empty);
  }

  const today = getTodayIso();
  const list = document.createElement("div");
  list.className = "plan-list";
  dates.forEach((date) => {
    const row = createDayRow("a", date, myPlan.days[date], { plan, places, excursions, typesById, today });
    row.href = `#/plan/${date}`;
    list.appendChild(row);
  });
  container.appendChild(list);

  if (plan && planned > 0) {
    const link = appendText(container, "a", "btn btn--secondary plan-button plan-bottom", "Посмотреть рекомендованный план");
    link.href = "#/recommended";
  }
}

// ---------------------------------------------------------------- #/plan/<date>

export async function renderMyPlanDay(container, ctx) {
  const { date } = ctx.params;
  if (!isIsoDate(date)) {
    window.location.replace("#/plan");
    return;
  }
  container.innerHTML = '<p class="loading">Загрузка плана…</p>';
  let data;
  try {
    data = await loadAll(false);
  } catch (e) {
    console.error(e);
    if (ctx.isCurrent()) renderPlanError(container, "Мой план", loadErrorMessage(e), () => renderMyPlanDay(container, ctx));
    return;
  }
  if (!ctx.isCurrent()) return;

  const { places, excursions, config, plan } = data;
  // Внепериодная дата → к списку (§8.2). Без рекомендации период не
  // проверить — открывается только сохранённый день.
  if (plan ? !isInPeriod(plan.meta, date) : isDayEmpty(storage.getMyPlan().days[date])) {
    window.location.replace("#/plan");
    return;
  }
  const typesById = typesMap(config);
  const number = plan ? getDayNumber(plan.meta, date) : null;
  const total = plan ? getPeriodDates(plan.meta).length : 0;
  const recDay = plan ? findRecommendedDay(plan, date) : null;

  // Действия меняют день без навигации: экран перерисовывается на месте.
  function draw() {
    if (!ctx.isCurrent()) return;
    const myPlan = storage.getMyPlan();
    const day = myPlan.days[date] || null;
    const empty = isDayEmpty(day);

    container.innerHTML = "";
    appendBackLink(container, "← К моему плану", "#/plan", ctx);
    appendText(container, "p", "plan-day__date", number ? `День ${number} из ${total} · ${formatLongDate(date)}` : formatLongDate(date));
    const title = empty ? "" : resolveDayTitle(day, places, excursions);
    appendText(container, "h2", `view-title${title ? "" : " plan-day__title--empty"}`, title || EMPTY_DAY_TEXT);
    if (!empty) renderDayBody(container, day, { places, excursions, typesById });

    const status = createStatus();

    // «Если планы меняются» (Iteration 8, P0-5) — только сегодня и дальше:
    // прошедший день уже не заменить.
    if (!today || date >= today) renderPlanChanges(container, date, day);

    if (recDay && !isSameAsRecommended(day, recDay)) {
      const rec = document.createElement("div");
      rec.className = "plan-rec";
      appendText(rec, "p", "plan-rec__text", `В рекомендации на этот день: «${recDay.title}»`);
      const take = appendText(rec, "button", "btn btn--secondary plan-button", "Взять из рекомендации");
      take.type = "button";
      take.addEventListener("click", () => {
        const apply = () => {
          if (saveMyPlan(acceptDay(storage.getMyPlan(), recDay), status)) draw();
        };
        if (empty) {
          apply();
          return;
        }
        take.hidden = true;
        const box = createConfirm(`Заменить содержимое ${formatDayMonth(date)} рекомендацией?`, [{ label: "Заменить", primary: true, onClick: apply }], () => {
          box.remove();
          take.hidden = false;
          take.focus();
        });
        take.after(box);
        box.querySelector("button").focus();
      });
      container.appendChild(rec);
    }

    appendText(container, "h3", "place-detail__subtitle plan-edit__title", "Изменить день");
    const edit = document.createElement("div");
    edit.className = "plan-edit";
    if (countDayItems(day) >= MAX_PLACES_PER_DAY) {
      appendText(edit, "p", "plan-edit__note", `В дне уже ${MAX_PLACES_PER_DAY} пункта — чтобы добавить другое, очистите или перенесите день.`);
    } else {
      const add = appendText(edit, "a", "btn btn--secondary plan-button", "Добавить место");
      add.href = `#/places?addTo=${date}`;
    }
    if (!empty) {
      const move = appendText(edit, "a", "btn btn--secondary plan-button", "Перенести или поменять местами");
      move.href = `#/plan/${date}/move`;

      const clear = appendText(edit, "button", "btn btn--secondary plan-button", "Очистить день");
      clear.type = "button";
      clear.addEventListener("click", () => {
        clear.hidden = true;
        const box = createConfirm(
          `Очистить ${formatDayMonth(date)}?`,
          [{ label: "Очистить", primary: true, onClick: () => saveMyPlan(clearDay(storage.getMyPlan(), date), status) && draw() }],
          () => {
            box.remove();
            clear.hidden = false;
            clear.focus();
          }
        );
        clear.after(box);
        box.querySelector("button").focus();
      });
    }
    edit.appendChild(status);
    container.appendChild(edit);

    renderDayExpenses(container, date, today);
  }

  const today = getTodayIso();
  draw();
}

// «Если планы меняются» на экране дня (Iteration 8, ITERATION-8-PRODUCT-AUDIT
// §4 P0-5). Новой логики планировщика нет: ссылки открывают уже существующий
// режим выбора места для этого дня (#/places?addTo=<дата>, S1) с готовыми
// фильтрами — там же «Добавить к текущему плану» / «Заменить текущий план».
// Правила прозрачные: дождь или жара → только в помещении; устали → лёгкая
// нагрузка и до 2 часов, ближе к жилью (near=1 действует, если точка
// проживания известна, иначе список просто без радиуса).
function renderPlanChanges(container, date, day) {
  const block = document.createElement("div");
  block.className = "plan-changes";
  appendText(block, "h3", "place-detail__subtitle", "Если планы меняются");
  if (countDayItems(day) >= MAX_PLACES_PER_DAY) {
    appendText(block, "p", "plan-edit__note", `В дне уже ${MAX_PLACES_PER_DAY} пункта — чтобы заменить его, сначала очистите день.`);
  } else {
    const links = document.createElement("div");
    links.className = "home-help";
    [
      ["🌧 Дождь или жара — места в помещении", `#/places?f=indoor&addTo=${date}`],
      ["😮‍💨 Устали — лёгкие места до 2 часов", `#/places?f=easy,short&near=1&addTo=${date}`],
    ].forEach(([label, href]) => {
      appendText(links, "a", "home-link", label).href = href;
    });
    block.appendChild(links);
  }
  const scenarios = appendText(block, "a", "home-link", "🧭 Готовые сценарии на дождь");
  scenarios.href = "#/excursions?f=rain";
  container.appendChild(block);
}

// Факт дня (Iteration 8): расходы, записанные на эту дату. Будущий день без
// расходов — блока нет, записывать ещё нечего.
function renderDayExpenses(container, date, today) {
  const { items } = storage.getExpenses();
  const own = filterByDate(items, date);
  if (!own.length && today && date > today) return;
  const summary = summarize(own, storage.getBudget().rates);

  const block = document.createElement("div");
  block.className = "plan-expenses";
  appendText(block, "h3", "place-detail__subtitle", "Расходы за день");
  if (own.length) {
    const stat = document.createElement("p");
    stat.className = "expense-stat";
    appendText(stat, "span", "expense-stat__value", formatByCurrency(summary));
    const baseLine = formatBaseLine(summary);
    if (baseLine) appendText(stat, "span", "expense-stat__base", baseLine);
    block.appendChild(stat);
  } else {
    appendText(block, "p", "plan-hint", "Пока ничего не записано.");
  }
  const actions = document.createElement("div");
  actions.className = "plan-edit";
  appendText(actions, "a", "btn btn--secondary plan-button", "Добавить расход за этот день").href = `#/expenses/add?date=${date}`;
  if (own.length) appendText(actions, "a", "home-link", "Все расходы поездки").href = "#/expenses";
  block.appendChild(actions);
  container.appendChild(block);
}

// ---------------------------------------------------------------- выбор даты

// Список дат с текущим содержимым (§9.6, §9.7). onPick(date, row) решает,
// что делать; подтверждение раскрывается под строкой, одно за раз.
function renderDatePicker(container, { dates, plan, places, excursions, typesById, rowNote, onPick }) {
  const list = document.createElement("div");
  list.className = "plan-list";
  let openBox = null;
  const closeBox = () => {
    if (openBox) openBox.remove();
    openBox = null;
  };
  const myPlan = storage.getMyPlan();
  dates.forEach((date) => {
    const item = document.createElement("div");
    item.className = "plan-pick";
    const note = rowNote ? rowNote(date) : null;
    const row = createDayRow("button", date, myPlan.days[date], { plan, places, excursions, typesById, today: null, note });
    if (note) {
      row.disabled = true;
      row.classList.add("is-disabled");
    }
    row.addEventListener("click", () => {
      closeBox();
      const box = onPick(date, closeBox);
      if (box) {
        openBox = box;
        item.appendChild(box);
        box.querySelector("button").focus();
      }
    });
    item.appendChild(row);
    list.appendChild(item);
  });
  container.appendChild(list);
}

// ---------------------------------------------------------------- #/plan/<date>/move

export async function renderMoveDay(container, ctx) {
  const { date } = ctx.params;
  container.innerHTML = '<p class="loading">Загрузка плана…</p>';
  let data;
  try {
    data = await loadAll(true);
  } catch (e) {
    console.error(e);
    if (ctx.isCurrent()) renderPlanError(container, "Перенос дня", loadErrorMessage(e), () => renderMoveDay(container, ctx));
    return;
  }
  if (!ctx.isCurrent()) return;

  const { places, excursions, config, plan } = data;
  if (!isInPeriod(plan.meta, date)) {
    window.location.replace("#/plan");
    return;
  }
  const source = storage.getMyPlan().days[date];
  if (isDayEmpty(source)) {
    // Переносить нечего — к самому дню.
    window.location.replace(`#/plan/${date}`);
    return;
  }

  container.innerHTML = "";
  appendBackLink(container, "← Назад", `#/plan/${date}`, ctx);
  const title = resolveDayTitle(source, places, excursions) || EMPTY_DAY_TEXT;
  appendText(container, "h2", "view-title", `Перенести «${title}»`);
  appendText(container, "p", "plan-subtitle", `Сейчас — ${formatLongDate(date)}. На свободную дату день переедет сразу, с занятой можно поменяться местами.`);
  const status = createStatus();
  container.appendChild(status);

  // replace на целевой день: «Назад» с него ведёт на исходный день, а не на
  // экран переноса (§9.9).
  const finish = (next, target) => {
    if (saveMyPlan(next, status)) window.location.replace(`#/plan/${target}`);
  };

  renderDatePicker(container, {
    dates: getPeriodDates(plan.meta).filter((d) => d !== date),
    plan,
    places,
    excursions,
    typesById: typesMap(config),
    onPick: (target, close) => {
      const current = storage.getMyPlan();
      const targetDay = current.days[target];
      if (isDayEmpty(targetDay)) {
        finish(moveDay(current, date, target), target);
        return null;
      }
      return createConfirm(
        `На ${formatDayMonth(target)} уже есть «${resolveDayTitle(targetDay, places, excursions) || EMPTY_DAY_TEXT}».`,
        [
          { label: "Поменять местами", primary: true, onClick: () => finish(swapDays(storage.getMyPlan(), date, target), target) },
          { label: "Заменить содержимое", primary: false, onClick: () => finish(moveDay(storage.getMyPlan(), date, target), target) },
        ],
        close
      );
    },
  });
}

// ---------------------------------------------------------------- добавление места / экскурсии

// Добавить пункт (kind — ITEM_KIND: место или экскурсия) в день; для занятого
// дня обязателен выбор «Добавить» / «Заменить» (§9.7). Возвращает
// подтверждение или null, если выбор не нужен.
function pickAddMode(kind, id, date, { places, excursions }, { onDone, onCancel }) {
  const current = storage.getMyPlan();
  const day = current.days[date];
  if (isDayEmpty(day)) {
    onDone(addItem(current, date, kind, id));
    return null;
  }
  return createConfirm(
    `На ${formatDayMonth(date)} уже есть «${resolveDayTitle(day, places, excursions) || EMPTY_DAY_TEXT}».`,
    [
      { label: "Добавить к текущему плану", primary: true, onClick: () => onDone(addItem(storage.getMyPlan(), date, kind, id)) },
      { label: "Заменить текущий план", primary: false, onClick: () => onDone(replaceDayWithItem(storage.getMyPlan(), date, kind, id)) },
    ],
    onCancel
  );
}

function addNote(status) {
  if (status === ADD_PLACE_STATUS.DUPLICATE) return "уже в плане";
  if (status === ADD_PLACE_STATUS.FULL) return `в дне уже ${MAX_PLACES_PER_DAY} пункта`;
  return null;
}

// Выбор дня для пункта: #/place/<id>/plan и #/excursion/<id>/plan — один
// экран, отличаются только типом пункта, заголовком и родителем.
async function renderItemPlan(container, ctx, { kind, find, listHash, itemHash, backLabel, titleOf }) {
  const { id } = ctx.params;
  const retry = () => renderItemPlan(container, ctx, { kind, find, listHash, itemHash, backLabel, titleOf });
  container.innerHTML = '<p class="loading">Загрузка плана…</p>';
  let data;
  try {
    data = await loadAll(true);
  } catch (e) {
    console.error(e);
    if (ctx.isCurrent()) renderPlanError(container, "Мой план", loadErrorMessage(e), retry);
    return;
  }
  if (!ctx.isCurrent()) return;

  const { places, excursions, config, plan } = data;
  const item = find(data, id);
  if (!item) {
    window.location.replace(listHash);
    return;
  }

  container.innerHTML = "";
  appendBackLink(container, backLabel, itemHash(id), ctx);
  appendText(container, "h2", "view-title", `Добавить «${titleOf(item)}» в план`);
  appendText(container, "p", "plan-subtitle", "Выберите день.");
  const status = createStatus();
  container.appendChild(status);

  // replace на день: «Назад» с него ведёт на карточку (§9.7).
  const onDone = (date) => (next) => {
    if (saveMyPlan(next, status)) window.location.replace(`#/plan/${date}`);
  };

  renderDatePicker(container, {
    dates: getPeriodDates(plan.meta),
    plan,
    places,
    excursions,
    typesById: typesMap(config),
    rowNote: (date) => addNote(getAddItemStatus(storage.getMyPlan(), date, kind, id)),
    onPick: (date, close) => pickAddMode(kind, id, date, { places, excursions }, { onDone: onDone(date), onCancel: close }),
  });
}

// #/place/<id>/plan
export function renderPlacePlan(container, ctx) {
  return renderItemPlan(container, ctx, {
    kind: ITEM_KIND.PLACE,
    find: ({ places }, id) => places.find((p) => p.id === id),
    listHash: "#/places",
    itemHash: (id) => `#/place/${id}`,
    backLabel: "← К месту",
    titleOf: (place) => place.name.ru,
  });
}

// #/excursion/<id>/plan
export function renderExcursionPlan(container, ctx) {
  return renderItemPlan(container, ctx, {
    kind: ITEM_KIND.EXCURSION,
    find: ({ excursions }, id) => excursions.find((e) => e.id === id),
    listHash: "#/excursions",
    itemHash: (id) => `#/excursion/${id}`,
    backLabel: "← К экскурсии",
    titleOf: (excursion) => excursion.title.ru,
  });
}

// S1: блок «Добавить на 19 ноября» на карточке места (#/place/<id>?addTo=<date>).
// Сюда приходят только со списка #/places?addTo=<date>, который сам открыт
// поверх дня (places.js) — поэтому после добавления на две записи назад
// лежит сам день: history.go(-2) возвращает в него без лишних записей и без
// экрана выбора в истории. Иначе (карточка открыта не со списка) — replace.
export function renderAddToDayBlock(container, ctx, { place, places, excursions, date }) {
  const block = document.createElement("div");
  block.className = "place-plan";
  const status = createStatus();
  const label = `Добавить на ${formatDayMonth(date)}`;

  const finish = (next) => {
    if (!saveMyPlan(next, status)) return;
    const from = ctx.from || "";
    const fromList = pathOf(from) === "/places" && new URLSearchParams(from.split("?")[1] || "").get("addTo") === date;
    if (fromList) {
      history.go(-2);
    } else {
      window.location.replace(`#/plan/${date}`);
    }
  };

  const note = addNote(getAddItemStatus(storage.getMyPlan(), date, ITEM_KIND.PLACE, place.id));
  if (note) {
    appendText(block, "p", "place-plan__note", `${label}: ${note}.`);
  } else {
    const button = appendText(block, "button", "btn btn--primary plan-button", label);
    button.type = "button";
    button.addEventListener("click", () => {
      button.hidden = true;
      const box = pickAddMode(ITEM_KIND.PLACE, place.id, date, { places, excursions }, {
        onDone: finish,
        onCancel: () => {
          box.remove();
          button.hidden = false;
          button.focus();
        },
      });
      if (box) {
        button.after(box);
        box.querySelector("button").focus();
      } else {
        button.hidden = false;
      }
    });
  }
  block.appendChild(status);
  container.appendChild(block);
}
