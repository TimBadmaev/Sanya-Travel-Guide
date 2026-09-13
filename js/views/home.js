import { loadChecklist, loadConfig, loadPlaces, loadErrorMessage } from "../data.js";
import { storage } from "../storage.js";
import {
  ORIGIN_PRECISION,
  PHASE_ORDER,
  TRIP_STATE,
  getTodayIso,
  getTripState,
  pluralizeRu,
  resolveOrigin,
} from "../logic/trip.js";
import { groupByPhase } from "../logic/checklist.js";
import { renderTask } from "./task.js";

// Экран «Сейчас» (PRODUCT.md 8.3, MVP-UX-SPEC §3): четыре состояния по датам
// поездки. Район на выбор состояния не влияет — только на содержимое строк
// и на сценарий «Рядом с отелем».

// Сколько ближайших дел показываем в состоянии «До поездки».
const NEAR_TASKS_LIMIT = 3;

// Первый запуск показывается не чаще одного раза за сессию страницы: при
// недоступном localStorage getTrip().isFirstRun всегда true, и без флага
// редирект зациклился бы ([I3-11]).
let firstRunRedirected = false;

function renderErrorState(container, message, onRetry) {
  container.innerHTML = "";
  const heading = document.createElement("h2");
  heading.className = "view-title";
  heading.textContent = "Сейчас";
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

// Сценарии — обычные ссылки на «Места» с готовыми фильтрами ([I3-22]):
// состояние фильтров живёт в URL, отдельного кода им не нужно.
function renderScenarios(container, scenarios) {
  const wrap = document.createElement("div");
  wrap.className = "home-scenarios";
  scenarios.forEach(([label, href]) => {
    const link = document.createElement("a");
    link.href = href;
    link.className = "btn btn--secondary home-scenarios__item";
    link.textContent = label;
    wrap.appendChild(link);
  });
  container.appendChild(wrap);
}

function renderProgressBlock(container, done, total) {
  const wrap = document.createElement("div");
  wrap.className = "progress-block";

  const text = document.createElement("p");
  text.className = "progress-block__text";
  text.textContent = `Готово ${done} из ${total}`;
  wrap.appendChild(text);

  const bar = document.createElement("div");
  bar.className = "progress";
  bar.setAttribute("role", "progressbar");
  bar.setAttribute("aria-valuemin", "0");
  bar.setAttribute("aria-valuemax", String(total));
  bar.setAttribute("aria-valuenow", String(done));
  const fill = document.createElement("div");
  fill.className = "progress__fill";
  fill.style.width = total ? `${(done / total) * 100}%` : "0%";
  bar.appendChild(fill);
  wrap.appendChild(bar);

  container.appendChild(wrap);
  return { text, bar, fill };
}

function appendLine(container, className, text) {
  const p = document.createElement("p");
  p.className = className;
  p.textContent = text;
  container.appendChild(p);
  return p;
}

function appendActionLink(container, label, href, className) {
  const link = document.createElement("a");
  link.href = href;
  link.className = className;
  link.textContent = label;
  container.appendChild(link);
  return link;
}

export async function renderHome(container, ctx) {
  const trip = storage.getTrip();

  if (trip.isFirstRun && !firstRunRedirected) {
    firstRunRedirected = true;
    // Первый запуск — тот же экран настроек в режиме приветствия ([I3-9]).
    // replace, а не переход: история не растёт и «Назад» не возвращает на
    // пустую Главную ([I3-10]). Параметр first=1 сообщает настройкам, что
    // записи «#/» в истории нет и выходить нужно тоже replace.
    window.location.replace("#/settings?first=1");
    return;
  }

  container.innerHTML = '<p class="loading">Загрузка…</p>';

  let config;
  let checklist;
  let places;
  try {
    // Справочник — ради названия района, чек-лист — ради прогресса и
    // ближайших дел, места — ради счётчика «Сохранено: N». Новых сетевых
    // запросов не добавляет: всё через Promise-кэш data.js.
    [config, checklist, places] = await Promise.all([loadConfig(), loadChecklist(), loadPlaces()]);
  } catch (e) {
    console.error(e);
    if (ctx.isCurrent()) {
      renderErrorState(container, loadErrorMessage(e), () => {
        renderHome(container, ctx);
      });
    }
    return;
  }

  if (!ctx.isCurrent()) {
    // Пользователь уже переключился на другой экран, пока грузились JSON.
    return;
  }

  // Название района — всегда из config по id (D-20, [I3-3]); неизвестный или
  // не-verified id считается «район не выбран» (PRODUCT.md 9.7).
  const area = config.areas.find((a) => a.id === trip.area) || null;
  // Точка отсчёта нужна одному сценарию — «Рядом с отелем» ([I3-18]).
  const { precision } = resolveOrigin(trip, config);
  const { state, daysUntil, day, total } = getTripState(trip, getTodayIso());

  const checklistState = storage.getChecklistState();
  const doneCount = checklist.filter((item) => checklistState[item.id]).length;
  // «Сохранено: N» — по пересечению stg:saved с verified-местами ([I3-19]).
  const savedIds = storage.getSavedIds();
  const savedCount = places.filter((place) => savedIds.includes(place.id)).length;

  container.innerHTML = "";

  const head = document.createElement("div");
  head.className = "home-head";
  const heading = document.createElement("h2");
  heading.className = "view-title";
  heading.textContent = "Сейчас";
  head.appendChild(heading);
  // Единственный вход в настройки поездки (MVP-UX-SPEC §8 п. 6).
  const settingsLink = document.createElement("a");
  settingsLink.href = "#/settings";
  settingsLink.className = "home-head__settings";
  settingsLink.setAttribute("aria-label", "Настройки поездки");
  settingsLink.textContent = "⚙️";
  head.appendChild(settingsLink);
  container.appendChild(head);

  if (state === TRIP_STATE.BEFORE) {
    const days = `${daysUntil} ${pluralizeRu(daysUntil, ["день", "дня", "дней"])}`;
    appendLine(container, "home-status", `До поездки: ${days}`);
    if (area) appendLine(container, "home-status__meta", `Район: ${area.name}`);

    const progress = renderProgressBlock(container, doneCount, checklist.length);

    // До 3 ближайших невыполненных дел: порядок этапов, внутри этапа сначала
    // критичные (groupByPhase). Раскрытие этапов по датам в объём Итерации 3
    // не входит ([OQ3-6]), поэтому «ближайшие» — по порядку этапов.
    const groups = groupByPhase(checklist);
    const near = [];
    PHASE_ORDER.forEach((phase) => {
      groups[phase].forEach((item) => {
        if (near.length < NEAR_TASKS_LIMIT && !checklistState[item.id]) near.push(item);
      });
    });

    if (near.length) {
      appendLine(container, "home-subtitle", "Ближайшие дела");
      const list = document.createElement("ul");
      list.className = "task-list home-tasks";
      near.forEach((item) => list.appendChild(renderTask(item, false)));
      // Как в «Подготовке»: один делегированный слушатель вместо слушателя
      // на каждом чекбоксе.
      list.addEventListener("change", (event) => {
        if (!event.target || !event.target.classList.contains("task__checkbox")) return;
        const nowState = storage.getChecklistState();
        const doneNow = checklist.filter((item) => nowState[item.id]).length;
        progress.text.textContent = `Готово ${doneNow} из ${checklist.length}`;
        progress.fill.style.width = checklist.length ? `${(doneNow / checklist.length) * 100}%` : "0%";
        progress.bar.setAttribute("aria-valuenow", String(doneNow));
      });
      container.appendChild(list);
    }

    appendActionLink(container, "Весь чек-лист", "#/prepare", "btn btn--primary home-action");
    return;
  }

  if (state === TRIP_STATE.DURING) {
    const dayLine = `День ${day} из ${total}`;
    appendLine(container, "home-status", area ? `${dayLine} · ${area.name}` : dayLine);

    // В поездке сценарии ищут места рядом (Q-21): near=1 ограничивает список
    // радиусом NEAR_RADIUS_KM от точки отсчёта (logic/filters.js). Без точки
    // ограничивать не от чего — ссылки остаются прежними.
    const hasOrigin = precision !== ORIGIN_PRECISION.NONE;
    const scenarioHref = (filter) => {
      const params = [filter ? `f=${filter}` : "", hasOrigin ? "near=1" : ""].filter(Boolean);
      return params.length ? `#/places?${params.join("&")}` : "#/places";
    };
    renderScenarios(container, [
      // Сценарий требует точки отсчёта, а не района: без неё список нечем
      // сортировать, поэтому сначала ведём к выбору ([I3-18], ревью §9).
      // При известной точке это обычный список — он уже отсортирован по
      // расстоянию.
      ["Рядом с отелем", hasOrigin ? scenarioHref(null) : "#/settings"],
      ["Есть 2–3 часа", scenarioHref("short")],
      ["Хочу природу", scenarioHref("nature")],
      ["В помещении", scenarioHref("indoor")],
    ]);

    if (savedCount > 0) {
      const label = `Сохранено: ${savedCount} ${pluralizeRu(savedCount, ["место", "места", "мест"])}`;
      appendActionLink(container, label, "#/places?f=saved", "home-link");
    }

    appendLine(container, "home-subtitle", "Под рукой");
    const help = document.createElement("div");
    help.className = "home-help";
    appendActionLink(help, "Телефоны, фразы и адрес для таксиста", "#/handy", "home-link");
    appendActionLink(help, "Такси и Amap", "#/info/taxi-amap", "home-link");
    appendActionLink(help, "Экстренные номера", "#/info/emergency", "home-link");
    container.appendChild(help);
    return;
  }

  // «Без дат» и «После поездки» — один компонент, отличается одна строка
  // (решение №4 MVP-UX-SPEC).
  const isAfter = state === TRIP_STATE.AFTER;
  appendLine(
    container,
    "home-status",
    isAfter
      ? "Поездка завершена — даты можно обновить для следующей поездки."
      : "Укажите даты — покажем то, что актуально сейчас."
  );
  appendActionLink(
    container,
    isAfter ? "Обновить даты" : "Указать даты",
    "#/settings",
    "btn btn--primary home-action"
  );

  // Прогресс подготовки — только если что-то уже отмечено (MVP-UX-SPEC §3).
  if (doneCount > 0) {
    renderProgressBlock(container, doneCount, checklist.length);
    appendActionLink(container, "Весь чек-лист", "#/prepare", "home-link");
  }

  appendLine(container, "home-subtitle", "Куда сходить");
  renderScenarios(container, [
    ["Хочу на пляж", "#/places?f=beach"],
    ["Хочу природу", "#/places?f=nature"],
    ["Куда сходить с детьми", "#/places?f=kids"],
  ]);
}
