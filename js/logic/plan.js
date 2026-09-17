// Рекомендованный план и период поездки (Итерация 6, ITERATION-6-RESEARCH.md
// §13). Чистые функции: без DOM, хранилища и адреса страницы (PRODUCT.md 10.3).
// Ни одной даты и ни одного числа дней в коде — всё из plan.json → meta (§4.3).

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const WEEKDAYS = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
const WEEKDAYS_SHORT = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
const MONTHS = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

// Поля дня — одинаковые у рекомендации и у «Моего плана» (§6.3). У дня
// рекомендации ещё есть date, у дня «Моего плана» — origin.
// excursionIds (экскурсии, data/excursions.json) — необязательное поле рядом
// с placeIds: старый день без него остаётся валидным, миграции нет.
export const DAY_FIELDS = ["type", "title", "summary", "morning", "afternoon", "evening", "placeIds", "excursionIds", "tips", "alt"];

export const TODAY_STATE = {
  BEFORE: "before",
  DURING: "during",
  AFTER: "after",
  // Период не задан или задан неверно — «сегодня» не определить.
  NONE: "none",
};

function parts(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

function toUtcMs(iso) {
  const { y, m, d } = parts(iso);
  return Date.UTC(y, m - 1, d);
}

function fromUtcMs(ms) {
  const date = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

// Строка ГГГГ-ММ-ДД, соответствующая реально существующей дате.
export function isIsoDate(value) {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  return fromUtcMs(toUtcMs(value)) === value;
}

// Все даты периода по порядку, включая границы. Неверный период — [].
export function getPeriodDates(meta) {
  const start = meta && meta.startDate;
  const end = meta && meta.endDate;
  if (!isIsoDate(start) || !isIsoDate(end) || start > end) return [];
  const dates = [];
  for (let ms = toUtcMs(start); ms <= toUtcMs(end); ms += DAY_MS) dates.push(fromUtcMs(ms));
  return dates;
}

export function isInPeriod(meta, date) {
  return getPeriodDates(meta).includes(date);
}

// Номер дня в поездке (с 1) или null, если дата вне периода.
export function getDayNumber(meta, date) {
  const index = getPeriodDates(meta).indexOf(date);
  return index === -1 ? null : index + 1;
}

// «Сегодня» относительно периода плана (§10.3) — одна функция на все экраны.
// today — локальная дата устройства ГГГГ-ММ-ДД (getTodayIso из trip.js).
export function resolveToday(meta, today) {
  const dates = getPeriodDates(meta);
  if (!dates.length || !isIsoDate(today)) return { state: TODAY_STATE.NONE, date: null, day: null, total: dates.length };
  const total = dates.length;
  if (today < dates[0]) return { state: TODAY_STATE.BEFORE, date: null, day: null, total };
  if (today > dates[total - 1]) return { state: TODAY_STATE.AFTER, date: null, day: null, total };
  return { state: TODAY_STATE.DURING, date: today, day: dates.indexOf(today) + 1, total };
}

// День рекомендации по дате или null.
export function findRecommendedDay(plan, date) {
  const days = plan && Array.isArray(plan.days) ? plan.days : [];
  return days.find((day) => day && day.date === date) || null;
}

// Пустой день — отсутствие дня или день без содержимого (§13.3.1: даже одно
// место делает день непустым).
export function isDayEmpty(day) {
  if (!day || typeof day !== "object") return true;
  return !DAY_FIELDS.some((field) => {
    const value = day[field];
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  });
}

function findByIds(ids, items) {
  const list = Array.isArray(items) ? items : [];
  const found = [];
  const missing = [];
  (Array.isArray(ids) ? ids : []).forEach((id) => {
    const item = list.find((p) => p.id === id);
    if (item) {
      found.push(item);
    } else {
      missing.push(id);
    }
  });
  return { found, missing };
}

// Места дня, которые есть в базе (verified). Отсутствующие и черновики
// пропускаются молча (§11.2); id пропущенных возвращаются отдельно.
export function getDayPlaces(day, places) {
  const { found, missing } = findByIds(day && day.placeIds, places);
  return { places: found, missing };
}

// Экскурсии дня — по тому же правилу, что и места.
export function getDayExcursions(day, excursions) {
  const { found, missing } = findByIds(day && day.excursionIds, excursions);
  return { excursions: found, missing };
}

// Сколько пунктов (мест и экскурсий) в дне — для общего лимита 3.
export function countDayItems(day) {
  if (!day) return 0;
  const count = (value) => (Array.isArray(value) ? value.length : 0);
  return count(day.placeIds) + count(day.excursionIds);
}

// Заголовок дня (§13.3.1): title → названия экскурсий и мест через запятую
// → "". Текст пустого дня подставляет экран.
export function resolveDayTitle(day, places, excursions) {
  if (!day) return "";
  if (typeof day.title === "string" && day.title) return day.title;
  return [
    ...getDayExcursions(day, excursions).excursions.map((excursion) => excursion.title.ru),
    ...getDayPlaces(day, places).places.map((place) => place.name.ru),
  ].join(", ");
}

// Содержимое дня «Моего плана» совпадает с днём рекомендации (для отметки
// «✓ в моём плане»): тот же origin и те же поля.
export function isSameAsRecommended(myDay, recDay) {
  if (!myDay || !recDay || myDay.origin !== "recommended") return false;
  return DAY_FIELDS.every((field) => JSON.stringify(myDay[field] ?? null) === JSON.stringify(recDay[field] ?? null));
}

// «четверг, 19 ноября»
export function formatLongDate(date) {
  if (!isIsoDate(date)) return "";
  const { m, d } = parts(date);
  return `${WEEKDAYS[new Date(toUtcMs(date)).getUTCDay()]}, ${d} ${MONTHS[m - 1]}`;
}

// «чт, 19 ноября»
export function formatShortDate(date) {
  if (!isIsoDate(date)) return "";
  const { m, d } = parts(date);
  return `${WEEKDAYS_SHORT[new Date(toUtcMs(date)).getUTCDay()]}, ${d} ${MONTHS[m - 1]}`;
}

// «19 ноября» — для коротких подписей действий.
export function formatDayMonth(date) {
  if (!isIsoDate(date)) return "";
  const { m, d } = parts(date);
  return `${d} ${MONTHS[m - 1]}`;
}

// Период: «13–26 ноября 2026», «30 ноября – 2 декабря 2026»,
// «30 декабря 2026 – 2 января 2027».
export function formatPeriod(meta) {
  const dates = getPeriodDates(meta);
  if (!dates.length) return "";
  const a = parts(dates[0]);
  const b = parts(dates[dates.length - 1]);
  if (a.y !== b.y) return `${a.d} ${MONTHS[a.m - 1]} ${a.y} – ${b.d} ${MONTHS[b.m - 1]} ${b.y}`;
  if (a.m !== b.m) return `${a.d} ${MONTHS[a.m - 1]} – ${b.d} ${MONTHS[b.m - 1]} ${b.y}`;
  return `${a.d}–${b.d} ${MONTHS[b.m - 1]} ${b.y}`;
}
