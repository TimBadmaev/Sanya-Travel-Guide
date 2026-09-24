// Работа с состоянием пользователя в localStorage.
// Контент (JSON) и состояние пользователя хранятся раздельно (D-17 PRODUCT.md).

import { normalizeBudgetState, normalizeExpensesState } from "./logic/expenses.js";

const SCHEMA_VERSION = 1;

export const KEYS = {
  schema: "stg:schema",
  trip: "stg:trip",
  checklist: "stg:checklist",
  saved: "stg:saved",
  // Итерация 5: подсказка «Добавьте на экран „Домой“» закрыта. Отдельный
  // флаг, к схеме stg:trip не относится.
  installHintDismissed: "stg:installHintDismissed",
  // Итерация 6: «Мой план» — полная копия пользовательских дней. Отдельный
  // ключ, stg:schema остаётся 1 (ITERATION-6-RESEARCH.md §12.2).
  myplan: "stg:myplan",
  // Iteration 8 (ITERATION-8-PRODUCT-AUDIT-2026-09.md §5): расходы поездки и
  // курс/бюджет — отдельные ключи со своей версией внутри значения ({ v: 1 }),
  // stg:schema остаётся 1 (прецедент stg:myplan). backup — сырая копия
  // неразбираемого stg:expenses, снятая перед первой записью поверх него.
  expenses: "stg:expenses",
  expensesBackup: "stg:expenses:backup",
  budget: "stg:budget",
  // Iteration 9: отметки «сделано» у пунктов дня «Моего плана» — отдельный
  // слой поверх stg:myplan ({ v: 1, days: { "<дата>": ["place:<id>", …] } }),
  // сам план не меняется. importBackup — снимок данных перед импортом из
  // файла (формат файла копии), для «Вернуть как было».
  planDone: "stg:plandone",
  importBackup: "stg:import:backup",
};

// Данные пользователя, которые переносит копия (Iteration 9, экспорт/импорт):
// только то, что нельзя восстановить из контента. Служебные флаги
// (stg:schema, подсказка установки) и аварийные копии (…:backup) не входят.
export const USER_DATA_KEYS = [KEYS.trip, KEYS.checklist, KEYS.saved, KEYS.myplan, KEYS.planDone, KEYS.expenses, KEYS.budget];

function checkStorageAvailable() {
  try {
    const testKey = "stg:__test__";
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
    return true;
  } catch (e) {
    return false;
  }
}

const storageAvailable = checkStorageAvailable();

function ensureSchema() {
  if (!storageAvailable) return;
  const current = window.localStorage.getItem(KEYS.schema);
  if (current === null) {
    window.localStorage.setItem(KEYS.schema, String(SCHEMA_VERSION));
  }
  // Миграции между версиями схемы добавятся здесь, когда появится
  // первое реальное изменение структуры (см. MVP-UX-SPEC.md, раздел 10).
}

// Объект «id пункта → true» в порядке отметок. Всё, что не объект (null,
// массив, число, строка), читается как «ничего не отмечено»: повреждённое
// значение не ломает экран и не перезаписывается — то же правило, что у
// getSavedIds()/getTrip()/getMyPlan() ([I3-4]).
function getChecklistState() {
  if (!storageAvailable) return {};
  ensureSchema();
  let parsed;
  try {
    const raw = window.localStorage.getItem(KEYS.checklist);
    if (raw === null) return {};
    parsed = JSON.parse(raw);
  } catch (e) {
    console.error("Не удалось прочитать stg:checklist", e);
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    console.error("Значение stg:checklist не является объектом — игнорируется");
    return {};
  }
  return parsed;
}

function setChecklistItemDone(itemId, done) {
  if (!storageAvailable) return false;
  const state = getChecklistState();
  if (done) {
    state[itemId] = true;
  } else {
    delete state[itemId];
  }
  try {
    window.localStorage.setItem(KEYS.checklist, JSON.stringify(state));
    return true;
  } catch (e) {
    console.error("Не удалось сохранить stg:checklist", e);
    return false;
  }
}

// Массив id сохранённых мест в порядке добавления. Всё, что не массив
// строк, игнорируется (повреждённое значение не ломает экран).
function getSavedIds() {
  if (!storageAvailable) return [];
  ensureSchema();
  try {
    const raw = window.localStorage.getItem(KEYS.saved);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch (e) {
    console.error("Не удалось прочитать stg:saved", e);
    return [];
  }
}

function setPlaceSaved(placeId, saved) {
  if (!storageAvailable) return false;
  const ids = getSavedIds().filter((id) => id !== placeId);
  if (saved) ids.push(placeId);
  try {
    window.localStorage.setItem(KEYS.saved, JSON.stringify(ids));
    return true;
  } catch (e) {
    console.error("Не удалось сохранить stg:saved", e);
    return false;
  }
}

// Поездка (PRODUCT.md 9.7): { start, end, area, stay, home } — даты ГГГГ-ММ-ДД,
// id района из config.areas, необязательная точка проживания и необязательный
// адрес проживания для таксиста (Итерация 4). Проверять area и
// spotId по справочнику здесь нельзя: storage.js знает только про хранилище,
// справочник грузит view ([I3-7]).

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Строка ГГГГ-ММ-ДД, соответствующая реально существующей дате
// ("2026-02-31" — не дата).
function isValidDateString(value) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function normalizeArea(value) {
  return typeof value === "string" && value ? value : null;
}

// Точка проживания (ITERATION-3-LOCATION-REVIEW §5, вариант C). Район —
// логический контекст, точка отсчёта — отдельное необязательное значение с
// явным источником. Координата хранится только там, где справочника, из
// которого её можно восстановить, не существует ("manual"/"gps"); для "spot"
// хранится id ориентира — D-20/[I3-3] соблюдены.
// Всё, что не разбирается, читается как «точки нет»: экран не ломается, а
// ключ не перезаписывается ([I3-4], прецедент getSavedIds()).
function normalizeStay(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    console.error("Значение stg:trip.stay не является объектом — игнорируется");
    return null;
  }
  if (value.source === "spot") {
    // Существование spotId в config проверяет resolveOrigin(): справочник
    // здесь недоступен. Несуществующий ориентир = «точки нет», но значение
    // остаётся в хранилище — ориентир может вернуться в справочник (§5.2).
    if (typeof value.spotId === "string" && value.spotId) {
      return { source: "spot", spotId: value.spotId };
    }
    console.error("stg:trip.stay: source \"spot\" без spotId — игнорируется");
    return null;
  }
  if (value.source === "manual" || value.source === "gps") {
    // Координаты пишет Итерация 5 (GPS) или ручной ввод; контракт принимает
    // их уже сейчас, чтобы не менять схему позже (§10 ревью).
    const point = value.point;
    const valid =
      point &&
      typeof point === "object" &&
      Number.isFinite(point.lat) &&
      Number.isFinite(point.lng) &&
      point.lat >= -90 &&
      point.lat <= 90 &&
      point.lng >= -180 &&
      point.lng <= 180;
    if (!valid) {
      console.error("stg:trip.stay: координаты вне диапазона или не числа — игнорируется");
      return null;
    }
    const stay = { source: value.source, point: { lat: point.lat, lng: point.lng } };
    // updatedAt нужен только gps: Итерация 5 решит по нему, устарела ли точка.
    if (isValidDateString(value.updatedAt)) stay.updatedAt = value.updatedAt;
    return stay;
  }
  console.error("stg:trip.stay: неизвестный source — игнорируется");
  return null;
}

// Адрес проживания для таксиста (Q-15, CONTENT-ITERATION-4.md §8):
// { addressZh, nameRu? }, вводится вручную в настройках. Это не точка отсчёта:
// координаты у адреса нет, расстояния по-прежнему считает resolveOrigin() по
// stay. Приложение адрес не проверяет — показывает так, как ввёл пользователь.
// Пустой адрес = «адреса нет» (null) без сообщения об ошибке: так форма
// сохраняет очищенное поле.
function normalizeHome(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    console.error("Значение stg:trip.home не является объектом — игнорируется");
    return null;
  }
  const addressZh = typeof value.addressZh === "string" ? value.addressZh.trim() : "";
  if (!addressZh) return null;
  const home = { addressZh };
  const nameRu = typeof value.nameRu === "string" ? value.nameRu.trim() : "";
  if (nameRu) home.nameRu = nameRu;
  return home;
}

// Возвращает { start, end, area, stay, home, isFirstRun } — значение, пригодное
// для прямого использования view. Не бросает исключение: любое повреждённое
// значение читается как «ничего не задано», ключ при этом не
// перезаписывается ([I3-4], прецедент getSavedIds()).
function getTrip() {
  const empty = { start: null, end: null, area: null, stay: null, home: null, isFirstRun: true };
  if (!storageAvailable) return empty;
  ensureSchema();
  let parsed;
  try {
    const raw = window.localStorage.getItem(KEYS.trip);
    // Сам факт наличия ключа = экран первого запуска уже показывался ([I3-1]).
    if (raw === null) return empty;
    parsed = JSON.parse(raw);
  } catch (e) {
    console.error("Не удалось прочитать stg:trip", e);
    return empty;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    console.error("Значение stg:trip не является объектом — игнорируется");
    return empty;
  }
  let start = isValidDateString(parsed.start) ? parsed.start : null;
  let end = isValidDateString(parsed.end) ? parsed.end : null;
  // Начало позже конца — обе даты считаем не заданными ([I3-5]).
  if (start && end && start > end) {
    start = null;
    end = null;
  }
  return {
    start,
    end,
    area: normalizeArea(parsed.area),
    stay: normalizeStay(parsed.stay),
    // Значение без home (Итерации 1–3) читается как home: null, схема та же.
    home: normalizeHome(parsed.home),
    isFirstRun: false,
  };
}

// Полная перезапись stg:trip ([I3-6], прецедент setPlaceSaved): вызывающая
// сторона передаёт объект целиком, лишние и невалидные поля отбрасываются.
function setTrip(trip) {
  if (!storageAvailable) return false;
  ensureSchema();
  // Белый список полей: всё, чего здесь нет, теряется при каждом сохранении.
  // Поэтому вызывающая сторона обязана передавать stay и home целиком (§5.3 ревью).
  const value = {
    start: isValidDateString(trip && trip.start) ? trip.start : null,
    end: isValidDateString(trip && trip.end) ? trip.end : null,
    area: normalizeArea(trip && trip.area),
    stay: normalizeStay(trip && trip.stay),
    home: normalizeHome(trip && trip.home),
  };
  try {
    window.localStorage.setItem(KEYS.trip, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error("Не удалось сохранить stg:trip", e);
    return false;
  }
}

function isInstallHintDismissed() {
  if (!storageAvailable) return false;
  try {
    return window.localStorage.getItem(KEYS.installHintDismissed) === "1";
  } catch (e) {
    return false;
  }
}

// Без хранилища подсказка скрывается только до перезагрузки — это не ошибка.
function setInstallHintDismissed() {
  if (!storageAvailable) return false;
  try {
    window.localStorage.setItem(KEYS.installHintDismissed, "1");
    return true;
  } catch (e) {
    return false;
  }
}

// «Мой план» (Итерация 6, ITERATION-6-RESEARCH.md §13.3): { planId, days },
// days — объект «ГГГГ-ММ-ДД → день». Белый список полей дня — как у
// normalizeHome(): всё неизвестное отбрасывается. Минимальный валидный день —
// одни placeIds или одни excursionIds (§13.3.1). Пунктов (мест и экскурсий
// вместе) в дне не больше MY_PLAN_MAX_PLACES — то же ограничение, что у
// операций в logic/myplan.js.
const MY_PLAN_MAX_PLACES = 3;
const MY_PLAN_TEXT_FIELDS = ["type", "title", "summary", "morning", "afternoon", "evening", "alt"];
const MY_PLAN_ORIGINS = ["recommended", "user"];

function normalizeStringList(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item) : [];
}

// День без содержимого — null: пустой день = отсутствие ключа.
function normalizeMyPlanDay(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const day = {};
  MY_PLAN_TEXT_FIELDS.forEach((field) => {
    if (typeof value[field] === "string" && value[field]) day[field] = value[field];
  });
  const placeIds = [...new Set(normalizeStringList(value.placeIds))].slice(0, MY_PLAN_MAX_PLACES);
  if (placeIds.length) day.placeIds = placeIds;
  // Экскурсии (excursionIds) — тот же общий лимит пунктов дня: места и
  // экскурсии вместе не больше MY_PLAN_MAX_PLACES. Старое значение без поля
  // читается как день без экскурсий.
  const excursionIds = [...new Set(normalizeStringList(value.excursionIds))].slice(0, MY_PLAN_MAX_PLACES - placeIds.length);
  if (excursionIds.length) day.excursionIds = excursionIds;
  const tips = normalizeStringList(value.tips);
  if (tips.length) day.tips = tips;
  if (!Object.keys(day).length) return null;
  day.origin = MY_PLAN_ORIGINS.includes(value.origin) ? value.origin : "user";
  return day;
}

function normalizeMyPlan(value) {
  const days = {};
  const source = value && value.days && typeof value.days === "object" && !Array.isArray(value.days) ? value.days : {};
  Object.keys(source).forEach((date) => {
    if (!isValidDateString(date)) return;
    const day = normalizeMyPlanDay(source[date]);
    if (day) days[date] = day;
  });
  return { planId: typeof value.planId === "string" && value.planId ? value.planId : null, days };
}

// Не бросает исключение: нет ключа — пустой план; повреждённое значение —
// пустой план и одна ошибка в консоли, сырое значение не перезаписывается
// ([I3-4], прецедент stay и home).
function getMyPlan() {
  const empty = { planId: null, days: {} };
  if (!storageAvailable) return empty;
  ensureSchema();
  let parsed;
  try {
    const raw = window.localStorage.getItem(KEYS.myplan);
    if (raw === null) return empty;
    parsed = JSON.parse(raw);
  } catch (e) {
    console.error("Не удалось прочитать stg:myplan", e);
    return empty;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    console.error("Значение stg:myplan не является объектом — игнорируется");
    return empty;
  }
  return normalizeMyPlan(parsed);
}

// Полная перезапись stg:myplan через белый список (прецедент setTrip).
function setMyPlan(myPlan) {
  if (!storageAvailable) return false;
  ensureSchema();
  const value = normalizeMyPlan(myPlan && typeof myPlan === "object" ? myPlan : {});
  try {
    window.localStorage.setItem(KEYS.myplan, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error("Не удалось сохранить stg:myplan", e);
    return false;
  }
}

// Общее чтение JSON-ключа: { ok, value }. ok = false — значение есть, но не
// разбирается или не является объектом; вызывающий читает его как «пусто».
function readObject(key) {
  let raw;
  try {
    raw = window.localStorage.getItem(key);
  } catch (e) {
    console.error(`Не удалось прочитать ${key}`, e);
    return { ok: true, value: null };
  }
  if (raw === null) return { ok: true, value: null };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return { ok: true, value: parsed };
  } catch (e) {
    // ниже — общее сообщение
  }
  console.error(`Значение ${key} повреждено — читается как пустое`);
  return { ok: false, value: null, raw };
}

// Расходы (Iteration 8): { v, items, lastCurrency? }. Невалидные записи при
// чтении отбрасываются (logic/expenses.js → normalizeExpensesState). Не
// бросает исключение ([I3-4]).
function getExpenses() {
  const empty = normalizeExpensesState(null);
  if (!storageAvailable) return empty;
  ensureSchema();
  const { value } = readObject(KEYS.expenses);
  return value ? normalizeExpensesState(value) : empty;
}

// Полная перезапись через белый список. Расходы — единственные данные
// пользователя, которые нельзя восстановить из контента, поэтому
// неразбираемое прежнее значение не затирается молча: его сырая копия
// один раз уходит в stg:expenses:backup.
function setExpenses(state) {
  if (!storageAvailable) return false;
  ensureSchema();
  const current = readObject(KEYS.expenses);
  try {
    if (!current.ok && window.localStorage.getItem(KEYS.expensesBackup) === null) {
      window.localStorage.setItem(KEYS.expensesBackup, current.raw);
    }
    window.localStorage.setItem(KEYS.expenses, JSON.stringify(normalizeExpensesState(state)));
    return true;
  } catch (e) {
    console.error("Не удалось сохранить stg:expenses", e);
    return false;
  }
}

// Курс поездки и бюджет: { v, base: "RUB", rates: { CNY: 11.8 }, budget? }.
function getBudget() {
  const empty = normalizeBudgetState(null);
  if (!storageAvailable) return empty;
  ensureSchema();
  const { value } = readObject(KEYS.budget);
  return value ? normalizeBudgetState(value) : empty;
}

function setBudget(state) {
  if (!storageAvailable) return false;
  ensureSchema();
  try {
    window.localStorage.setItem(KEYS.budget, JSON.stringify(normalizeBudgetState(state)));
    return true;
  } catch (e) {
    console.error("Не удалось сохранить stg:budget", e);
    return false;
  }
}

// ------------------------------------------------------------ отметки «сделано»

// Ключ пункта дня — тот же вид, что у ссылки расхода на план: "place:<id>" /
// "excursion:<id>".
const DONE_ITEM = /^(place|excursion):[^:\s]+$/;

function normalizePlanDone(value) {
  const days = {};
  const source = value && value.days && typeof value.days === "object" && !Array.isArray(value.days) ? value.days : {};
  Object.keys(source).forEach((date) => {
    if (!isValidDateString(date)) return;
    const items = [...new Set(normalizeStringList(source[date]).filter((key) => DONE_ITEM.test(key)))];
    if (items.length) days[date] = items;
  });
  return { v: 1, days };
}

// Не бросает исключение; повреждённое значение — «ничего не отмечено» без
// перезаписи ([I3-4]).
function getPlanDone() {
  const empty = normalizePlanDone(null);
  if (!storageAvailable) return empty;
  ensureSchema();
  const { value } = readObject(KEYS.planDone);
  return value ? normalizePlanDone(value) : empty;
}

function setPlanItemDone(date, itemKey, done) {
  if (!storageAvailable || !isValidDateString(date) || !DONE_ITEM.test(itemKey)) return false;
  const state = getPlanDone();
  const items = (state.days[date] || []).filter((key) => key !== itemKey);
  if (done) items.push(itemKey);
  if (items.length) {
    state.days[date] = items;
  } else {
    delete state.days[date];
  }
  try {
    window.localStorage.setItem(KEYS.planDone, JSON.stringify(state));
    return true;
  } catch (e) {
    console.error("Не удалось сохранить stg:plandone", e);
    return false;
  }
}

// ------------------------------------------------------------ копия данных

// Нормализация раздела копии тем же белым списком, что и при обычной записи.
// null — раздел не разбирается (не тот тип). Ничего не пишет.
function normalizeSection(key, value) {
  switch (key) {
    case KEYS.trip: {
      if (!value || typeof value !== "object" || Array.isArray(value)) return null;
      let start = isValidDateString(value.start) ? value.start : null;
      let end = isValidDateString(value.end) ? value.end : null;
      if (start && end && start > end) {
        start = null;
        end = null;
      }
      return { start, end, area: normalizeArea(value.area), stay: normalizeStay(value.stay), home: normalizeHome(value.home) };
    }
    case KEYS.checklist: {
      if (!value || typeof value !== "object" || Array.isArray(value)) return null;
      const state = {};
      Object.keys(value).forEach((id) => {
        if (value[id] === true) state[id] = true;
      });
      return state;
    }
    case KEYS.saved:
      return Array.isArray(value) ? [...new Set(normalizeStringList(value))] : null;
    case KEYS.myplan:
      return value && typeof value === "object" && !Array.isArray(value) ? normalizeMyPlan(value) : null;
    case KEYS.planDone:
      return value && typeof value === "object" && !Array.isArray(value) ? normalizePlanDone(value) : null;
    case KEYS.expenses:
      return value && typeof value === "object" && !Array.isArray(value) ? normalizeExpensesState(value) : null;
    case KEYS.budget:
      return value && typeof value === "object" && !Array.isArray(value) ? normalizeBudgetState(value) : null;
    default:
      return null;
  }
}

// Текущие данные пользователя: { "<ключ>": значение } только для ключей,
// которые есть в хранилище. Значение — как оно хранится (сырой JSON), чтобы
// копия ничего не теряла молча; неразбираемое значение пропускается.
function readUserData() {
  const data = {};
  if (!storageAvailable) return data;
  USER_DATA_KEYS.forEach((key) => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) data[key] = JSON.parse(raw);
    } catch (e) {
      console.error(`Не удалось прочитать ${key} для копии`, e);
    }
  });
  return data;
}

// Запись разделов копии «всё или ничего»: сначала снимок текущего состояния
// в stg:import:backup (snapshotText — уже готовый текст копии), потом разделы
// по одному; ошибка на любом шаге возвращает все затронутые ключи как было.
// sections — { "<ключ>": уже нормализованное значение }. replaceAll — откат
// к снимку: ключи, которых в снимке нет, удаляются (их создал импорт).
function applyUserData(sections, snapshotText, replaceAll = false) {
  if (!storageAvailable) return false;
  ensureSchema();
  const keys = replaceAll ? USER_DATA_KEYS.slice() : Object.keys(sections).filter((key) => USER_DATA_KEYS.includes(key));
  const previous = {};
  keys.forEach((key) => {
    previous[key] = window.localStorage.getItem(key);
  });
  try {
    if (snapshotText) window.localStorage.setItem(KEYS.importBackup, snapshotText);
    keys.forEach((key) => {
      if (key in sections) {
        window.localStorage.setItem(key, JSON.stringify(sections[key]));
      } else {
        window.localStorage.removeItem(key);
      }
    });
    return true;
  } catch (e) {
    console.error("Не удалось записать данные из копии — возвращаю прежние", e);
    keys.forEach((key) => {
      try {
        if (previous[key] === null) {
          window.localStorage.removeItem(key);
        } else {
          window.localStorage.setItem(key, previous[key]);
        }
      } catch (restoreError) {
        console.error(`Не удалось вернуть ${key}`, restoreError);
      }
    });
    return false;
  }
}

function getImportBackup() {
  if (!storageAvailable) return null;
  try {
    return window.localStorage.getItem(KEYS.importBackup);
  } catch (e) {
    return null;
  }
}

function clearImportBackup() {
  if (!storageAvailable) return false;
  try {
    window.localStorage.removeItem(KEYS.importBackup);
    return true;
  } catch (e) {
    return false;
  }
}

export const storage = {
  isAvailable: () => storageAvailable,
  getPlanDone,
  setPlanItemDone,
  normalizeSection,
  readUserData,
  applyUserData,
  getImportBackup,
  clearImportBackup,
  getMyPlan,
  setMyPlan,
  isInstallHintDismissed,
  setInstallHintDismissed,
  getChecklistState,
  setChecklistItemDone,
  getSavedIds,
  setPlaceSaved,
  getTrip,
  setTrip,
  getExpenses,
  setExpenses,
  getBudget,
  setBudget,
};
