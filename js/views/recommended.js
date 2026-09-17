import { loadPlan, loadPlaces, loadConfig, loadExcursions, loadErrorMessage } from "../data.js";
import { storage } from "../storage.js";
import { formatVerifiedDate } from "../logic/checklist.js";
import { pluralizeRu } from "../logic/trip.js";
import {
  findRecommendedDay,
  formatDayMonth,
  formatLongDate,
  formatShortDate,
  getDayNumber,
  getPeriodDates,
  isDayEmpty,
  isInPeriod,
  isSameAsRecommended,
  resolveDayTitle,
} from "../logic/plan.js";
import { acceptAll, acceptDay, countPlannedDays } from "../logic/myplan.js";
import {
  EMPTY_DAY_TEXT,
  appendBackLink,
  createConfirm,
  createStatus,
  createTypeChip,
  parentFrom,
  periodLine,
  renderDayBody,
  renderPlanError,
  saveMyPlan,
  typesMap,
} from "./plan.js";

// Рекомендованный план (Итерация 6, ITERATION-6-RESEARCH.md §9.1–9.3):
// #/recommended и #/recommended/<date>. Вспомогательный экран: сюда приходят
// взять день или весь план и возвращаются в «Мой план». Сама рекомендация
// никогда не меняется — действия копируют дни в stg:myplan.

const TITLE = "Рекомендованный план";

function appendText(parent, tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.textContent = text;
  parent.appendChild(el);
  return el;
}

async function loadAll() {
  const [plan, places, excursions, config] = await Promise.all([loadPlan(), loadPlaces(), loadExcursions(), loadConfig()]);
  return { plan, places, excursions, config };
}

function appendList(container, title, items) {
  const details = document.createElement("details");
  details.className = "plan-more";
  appendText(details, "summary", "plan-more__summary", title);
  const list = document.createElement("ul");
  list.className = "info-detail__points";
  items.forEach((item) => appendText(list, "li", "", item));
  details.appendChild(list);
  container.appendChild(details);
}

// S2: дата проверки и источники плана.
function appendSources(container, meta) {
  if (meta.verifiedAt) appendText(container, "p", "task__meta plan-sources", `Проверено: ${formatVerifiedDate(meta.verifiedAt)}`);
  const sources = Array.isArray(meta.sources) ? meta.sources.filter((src) => src && src.url) : [];
  if (!sources.length) return;
  appendText(container, "p", "task__meta sources__label", "Источник:");
  const list = document.createElement("div");
  list.className = "sources__list";
  sources.forEach((src) => {
    const a = appendText(list, "a", "sources__link", src.title);
    a.href = src.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  });
  container.appendChild(list);
}

// ---------------------------------------------------------------- #/recommended

export async function renderRecommended(container, ctx) {
  container.innerHTML = '<p class="loading">Загрузка плана…</p>';
  let data;
  try {
    data = await loadAll();
  } catch (e) {
    console.error(e);
    if (ctx.isCurrent()) renderPlanError(container, TITLE, loadErrorMessage(e), () => renderRecommended(container, ctx));
    return;
  }
  if (!ctx.isCurrent()) return;

  const { plan, places, excursions, config } = data;
  const typesById = typesMap(config);
  const dates = getPeriodDates(plan.meta);
  const myPlan = storage.getMyPlan();

  container.innerHTML = "";
  appendBackLink(container, "← Назад", parentFrom(ctx, ["/", "/plan"], "#/plan"), ctx);
  appendText(container, "h2", "view-title", TITLE);
  appendText(container, "p", "plan-subtitle", periodLine(config, plan));

  // «Следовать плану на 100%» (§9.3): пустой план — копируем сразу и уходим
  // обычной ссылкой на #/plan; непустой — сначала один вопрос.
  const follow = document.createElement("div");
  follow.className = "plan-follow";
  const allAccepted = dates.every((date) => isSameAsRecommended(myPlan.days[date], findRecommendedDay(plan, date)));
  const status = createStatus();
  if (allAccepted) {
    appendText(follow, "p", "plan-added", "✓ Весь рекомендованный план — в вашем плане");
    const open = appendText(follow, "a", "btn btn--secondary plan-button", "Открыть мой план");
    open.href = "#/plan";
  } else {
    const button = appendText(follow, "a", "btn btn--primary plan-button", "Следовать плану на 100%");
    button.href = "#/plan";
    button.addEventListener("click", (event) => {
      const current = storage.getMyPlan();
      const planned = countPlannedDays(current, dates);
      if (planned === 0) {
        if (!saveMyPlan(acceptAll(current, plan), status)) event.preventDefault();
        return;
      }
      event.preventDefault();
      button.hidden = true;
      const days = `${planned} ${pluralizeRu(planned, ["день", "дня", "дней"])}`;
      const box = createConfirm(
        `В вашем плане уже есть ${days}. Заменить весь план рекомендованным?`,
        [
          {
            label: "Заменить всё",
            primary: true,
            onClick: () => {
              if (saveMyPlan(acceptAll(storage.getMyPlan(), plan), status)) window.location.assign("#/plan");
            },
          },
        ],
        () => {
          box.remove();
          button.hidden = false;
          button.focus();
        }
      );
      button.after(box);
      box.querySelector("button").focus();
    });
    appendText(follow, "p", "plan-hint", "Можно взять и отдельные дни: откройте день и нажмите «В мой план».");
  }
  follow.appendChild(status);
  container.appendChild(follow);

  const list = document.createElement("div");
  list.className = "plan-list";
  dates.forEach((date) => {
    const day = findRecommendedDay(plan, date);
    const row = document.createElement("a");
    row.href = `#/recommended/${date}`;
    row.className = "plan-row";
    appendText(row, "span", "plan-row__date", `${formatShortDate(date)} · День ${getDayNumber(plan.meta, date)}`);
    appendText(row, "span", "plan-row__title", (day && resolveDayTitle(day, places, excursions)) || EMPTY_DAY_TEXT);
    const meta = document.createElement("span");
    meta.className = "plan-row__meta";
    const chip = day ? createTypeChip(day.type, typesById) : null;
    if (chip) meta.appendChild(chip);
    if (isSameAsRecommended(myPlan.days[date], day)) appendText(meta, "span", "plan-row__mark", "✓ в моём плане");
    if (meta.children.length) row.appendChild(meta);
    list.appendChild(row);
  });
  container.appendChild(list);

  if (Array.isArray(plan.meta.logic) && plan.meta.logic.length) appendList(container, "Почему план такой", plan.meta.logic);
  if (Array.isArray(plan.meta.ifTired) && plan.meta.ifTired.length) appendList(container, "Если устали", plan.meta.ifTired);
  appendSources(container, plan.meta);
}

// ---------------------------------------------------------------- #/recommended/<date>

export async function renderRecommendedDay(container, ctx) {
  const { date } = ctx.params;
  container.innerHTML = '<p class="loading">Загрузка плана…</p>';
  let data;
  try {
    data = await loadAll();
  } catch (e) {
    console.error(e);
    if (ctx.isCurrent()) renderPlanError(container, TITLE, loadErrorMessage(e), () => renderRecommendedDay(container, ctx));
    return;
  }
  if (!ctx.isCurrent()) return;

  const { plan, places, excursions, config } = data;
  const recDay = findRecommendedDay(plan, date);
  if (!isInPeriod(plan.meta, date) || !recDay) {
    window.location.replace("#/recommended");
    return;
  }
  const typesById = typesMap(config);
  const total = getPeriodDates(plan.meta).length;

  // «В мой план» не навигирует: кнопка меняет вид на месте (§9.9).
  function draw() {
    if (!ctx.isCurrent()) return;
    const myDay = storage.getMyPlan().days[date];
    container.innerHTML = "";
    appendBackLink(container, "← К рекомендации", "#/recommended", ctx);
    appendText(container, "p", "plan-day__date", `День ${getDayNumber(plan.meta, date)} из ${total} · ${formatLongDate(date)}`);
    appendText(container, "h2", "view-title", resolveDayTitle(recDay, places, excursions) || EMPTY_DAY_TEXT);
    renderDayBody(container, recDay, { places, excursions, typesById });

    const actions = document.createElement("div");
    actions.className = "plan-actions";
    const status = createStatus();
    if (isSameAsRecommended(myDay, recDay)) {
      appendText(actions, "p", "plan-added", "✓ В моём плане");
      const open = appendText(actions, "a", "btn btn--secondary plan-button", "Открыть");
      open.href = `#/plan/${date}`;
    } else {
      const button = appendText(actions, "button", "btn btn--primary plan-button", "В мой план");
      button.type = "button";
      button.addEventListener("click", () => {
        const apply = () => {
          if (saveMyPlan(acceptDay(storage.getMyPlan(), recDay), status)) draw();
        };
        if (isDayEmpty(myDay)) {
          apply();
          return;
        }
        button.hidden = true;
        const box = createConfirm(
          `На ${formatDayMonth(date)} уже есть «${resolveDayTitle(myDay, places, excursions) || EMPTY_DAY_TEXT}». Заменить?`,
          [{ label: "Заменить", primary: true, onClick: apply }],
          () => {
            box.remove();
            button.hidden = false;
            button.focus();
          }
        );
        button.after(box);
        box.querySelector("button").focus();
      });
    }
    actions.appendChild(status);
    container.appendChild(actions);
  }

  draw();
}
