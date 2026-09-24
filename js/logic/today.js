// «Сегодня» и «Что делать сейчас» (Iteration 9, ITERATION-9-IMPLEMENTATION-2026-09.md
// §2). Чистые функции: без DOM, хранилища и адреса страницы (PRODUCT.md 10.3).
// Правила прозрачные и детерминированные — никакого «умного» планировщика:
//   · часть дня — по часам устройства: утро до 12:00, день до 17:00, вечер;
//   · «следующий пункт» — первый не отмеченный пункт дня в порядке плана;
//   · «подходит сейчас» — место открыто по подтверждённым часам, до закрытия
//     хватает минимального времени на месте (durationHours[0]), ближе к жилью
//     выше; без подтверждённых часов место в «подходит» не попадает.

import { NEAR_RADIUS_KM } from "./filters.js";
import { haversineKm } from "./distance.js";
import { OPEN_STATE, getOpenStatus, isOpenNow } from "./hours.js";
import { getDayExcursions, getDayPlaces } from "./plan.js";

export const DAY_PARTS = [
  { id: "morning", label: "Утро", when: "утром", from: 0, to: 12 * 60 },
  { id: "afternoon", label: "День", when: "днём", from: 12 * 60, to: 17 * 60 },
  { id: "evening", label: "Вечер", when: "вечером", from: 17 * 60, to: 24 * 60 },
];

export function dayPartAt(minutes) {
  return DAY_PARTS.find((part) => minutes >= part.from && minutes < part.to) || DAY_PARTS[DAY_PARTS.length - 1];
}

// Ключ пункта дня — как у ссылки расхода и отметки «сделано».
export function itemKey(kind, id) {
  return `${kind}:${id}`;
}

// «Сейчас» и «Дальше» по ритму дня (morning/afternoon/evening). Текущая часть
// без текста — берём ближайшую следующую с текстом как «Дальше». Вечером
// «Дальше» нет.
export function rhythmNow(day, minutes) {
  if (!day) return { now: null, next: null };
  const index = DAY_PARTS.indexOf(dayPartAt(minutes));
  const withText = (part) => (typeof day[part.id] === "string" && day[part.id] ? { label: part.label, when: part.when, text: day[part.id] } : null);
  const now = withText(DAY_PARTS[index]);
  let next = null;
  for (let i = index + 1; i < DAY_PARTS.length && !next; i += 1) next = withText(DAY_PARTS[i]);
  return { now, next };
}

// Пункты дня (экскурсии, затем места — как в заголовке дня) с отметкой
// «сделано». doneKeys — массив ключей itemKey() этой даты.
export function dayItems(day, { places, excursions, doneKeys }) {
  const done = new Set(Array.isArray(doneKeys) ? doneKeys : []);
  return [
    ...getDayExcursions(day, excursions).excursions.map((excursion) => ({
      kind: "excursion",
      id: excursion.id,
      key: itemKey("excursion", excursion.id),
      title: excursion.title.ru,
      href: `#/excursion/${excursion.id}`,
      item: excursion,
      done: done.has(itemKey("excursion", excursion.id)),
    })),
    ...getDayPlaces(day, places).places.map((place) => ({
      kind: "place",
      id: place.id,
      key: itemKey("place", place.id),
      title: place.name.ru,
      href: `#/place/${place.id}`,
      item: place,
      done: done.has(itemKey("place", place.id)),
    })),
  ];
}

export function nextItem(items) {
  return items.find((item) => !item.done) || null;
}

// Кандидаты «подходит сейчас». options:
//   moment    — { date, minutes } (localMoment)
//   origin    — { lat, lng } | null — точка проживания или центр района
//   radiusKm  — радиус «рядом» (по умолчанию NEAR_RADIUS_KM), только при origin
//   exclude   — id мест, которые уже в плане на сегодня
// Результат: { suitable, unconfirmed, closedCount }
//   suitable    — [{ place, status, km }] открыто и хватает времени, по расстоянию;
//   unconfirmed — [{ place, status, km }] часов нет — «проверьте перед выездом»;
//   closedCount — сколько мест с известными часами сейчас закрыто или
//                 закроется раньше, чем успеете.
export function nowCandidates(places, { moment, origin = null, radiusKm = NEAR_RADIUS_KM, exclude = [] }) {
  const suitable = [];
  const unconfirmed = [];
  let closedCount = 0;
  (Array.isArray(places) ? places : []).forEach((place, index) => {
    if (exclude.includes(place.id)) return;
    const km = origin ? haversineKm(origin, place.location) : null;
    if (origin && !(km <= radiusKm)) return;
    const status = getOpenStatus(place.openingHours, moment);
    if (status.state === OPEN_STATE.UNKNOWN) {
      unconfirmed.push({ place, status, km, index });
      return;
    }
    const minNeeded = Math.round((place.durationHours && place.durationHours[0] ? place.durationHours[0] : 0) * 60);
    const enoughTime = status.state === OPEN_STATE.ALWAYS || (status.state === OPEN_STATE.OPEN && status.minutesLeft >= minNeeded);
    if (isOpenNow(status) && enoughTime) {
      suitable.push({ place, status, km, index });
    } else {
      closedCount += 1;
    }
  });
  const byDistance = (a, b) => (a.km === null || b.km === null ? a.index - b.index : a.km - b.km || a.index - b.index);
  return { suitable: suitable.sort(byDistance), unconfirmed: unconfirmed.sort(byDistance), closedCount };
}

// День вылета: тип дня «Отъезд» в плане или последний день поездки.
export function isDepartureDay(day, date, lastDate) {
  return Boolean((day && day.type === "departure") || (lastDate && date === lastDate));
}
