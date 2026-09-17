// Операции над «Моим планом» (Итерация 6, ITERATION-6-RESEARCH.md §7, §13.4).
// Чистые функции: принимают план и возвращают новый объект, вход не мутируют
// (как applyFilters). Хранилище не трогают — запись делает экран через
// storage.setMyPlan() (PRODUCT.md 10.3).
//
// План: { planId, days: { "<ГГГГ-ММ-ДД>": день } }. Нет ключа даты — пустой
// день. День — полная копия (§6.2), а не отличие от рекомендации.

import { DAY_FIELDS, countDayItems, isDayEmpty } from "./plan.js";

// Больше трёх пунктов в дне не добавляется (§7): места и экскурсии считаются
// вместе, экскурсия — один пункт, сколько бы мест она ни включала.
export const MAX_PLACES_PER_DAY = 3;

// Тип пункта дня → поле дня, в котором хранится его id.
export const ITEM_KIND = { PLACE: "placeIds", EXCURSION: "excursionIds" };

export const ORIGIN = { RECOMMENDED: "recommended", USER: "user" };

// Результат проверки перед добавлением места.
export const ADD_PLACE_STATUS = { OK: "ok", DUPLICATE: "duplicate", FULL: "full" };

function copyDay(day) {
  const copy = {};
  DAY_FIELDS.forEach((field) => {
    const value = day[field];
    if (value === undefined || value === null) return;
    copy[field] = Array.isArray(value) ? value.slice() : value;
  });
  if (day.origin) copy.origin = day.origin;
  return copy;
}

function copyPlan(myPlan) {
  const days = {};
  const source = (myPlan && myPlan.days) || {};
  Object.keys(source).forEach((date) => {
    days[date] = copyDay(source[date]);
  });
  return { planId: (myPlan && myPlan.planId) || null, days };
}

export function createEmptyMyPlan(planId) {
  return { planId: planId || null, days: {} };
}

// Сколько непустых дней среди dates (или во всём плане, если dates не задан).
export function countPlannedDays(myPlan, dates) {
  const days = (myPlan && myPlan.days) || {};
  const keys = Array.isArray(dates) ? dates : Object.keys(days);
  return keys.filter((date) => !isDayEmpty(days[date])).length;
}

// Копия дня рекомендации на его дату (§13.4). Повторный вызов перезаписывает
// ту же дату — дубликата не бывает.
export function acceptDay(myPlan, recDay) {
  const next = copyPlan(myPlan);
  const day = copyDay(recDay);
  day.origin = ORIGIN.RECOMMENDED;
  next.days[recDay.date] = day;
  return next;
}

// Весь рекомендованный план: days перезаписывается целиком (§9.3 — без слияния).
export function acceptAll(myPlan, plan) {
  const next = createEmptyMyPlan((plan && plan.meta && plan.meta.id) || (myPlan && myPlan.planId));
  (plan && Array.isArray(plan.days) ? plan.days : []).forEach((recDay) => {
    const day = copyDay(recDay);
    day.origin = ORIGIN.RECOMMENDED;
    next.days[recDay.date] = day;
  });
  return next;
}

export function clearDay(myPlan, date) {
  const next = copyPlan(myPlan);
  delete next.days[date];
  return next;
}

// Перенос: содержимое from → to, from освобождается; цель, если была
// занята, заменяется (выбор «обменять или заменить» делает экран).
export function moveDay(myPlan, from, to) {
  const next = copyPlan(myPlan);
  if (from === to || isDayEmpty(next.days[from])) return next;
  const day = next.days[from];
  day.origin = ORIGIN.USER;
  next.days[to] = day;
  delete next.days[from];
  return next;
}

// Обмен двух дат. Одна из дат пуста — получается обычный перенос.
export function swapDays(myPlan, a, b) {
  const next = copyPlan(myPlan);
  if (a === b) return next;
  const dayA = isDayEmpty(next.days[a]) ? null : next.days[a];
  const dayB = isDayEmpty(next.days[b]) ? null : next.days[b];
  delete next.days[a];
  delete next.days[b];
  if (dayA) next.days[b] = { ...dayA, origin: ORIGIN.USER };
  if (dayB) next.days[a] = { ...dayB, origin: ORIGIN.USER };
  return next;
}

// Можно ли добавить пункт (место или экскурсию) в день: ok / duplicate / full.
export function getAddItemStatus(myPlan, date, kind, id) {
  const day = myPlan && myPlan.days ? myPlan.days[date] : null;
  const ids = day && Array.isArray(day[kind]) ? day[kind] : [];
  if (ids.includes(id)) return ADD_PLACE_STATUS.DUPLICATE;
  if (countDayItems(day) >= MAX_PLACES_PER_DAY) return ADD_PLACE_STATUS.FULL;
  return ADD_PLACE_STATUS.OK;
}

// Добавить пункт, сохраняя остальное содержимое дня; день создаётся, если
// его не было. Повтор и четвёртый пункт — план не меняется.
export function addItem(myPlan, date, kind, id) {
  const next = copyPlan(myPlan);
  if (getAddItemStatus(next, date, kind, id) !== ADD_PLACE_STATUS.OK) return next;
  const day = next.days[date] || {};
  day[kind] = [...(Array.isArray(day[kind]) ? day[kind] : []), id];
  day.origin = ORIGIN.USER;
  next.days[date] = day;
  return next;
}

// Прежнее содержимое дня уходит целиком, остаётся один пункт (§13.4).
export function replaceDayWithItem(myPlan, date, kind, id) {
  const next = copyPlan(myPlan);
  next.days[date] = { [kind]: [id], origin: ORIGIN.USER };
  return next;
}

export function getAddPlaceStatus(myPlan, date, placeId) {
  return getAddItemStatus(myPlan, date, ITEM_KIND.PLACE, placeId);
}

export function addPlace(myPlan, date, placeId) {
  return addItem(myPlan, date, ITEM_KIND.PLACE, placeId);
}

export function replaceDayWithPlace(myPlan, date, placeId) {
  return replaceDayWithItem(myPlan, date, ITEM_KIND.PLACE, placeId);
}
