// Логика этапов подготовки. Не обращается к DOM — только данные (правило
// из PRODUCT.md 10.3: logic/ не трогает страницу).

// Порядок и подписи этапов — как в PRODUCT.md, раздел 8.7.
export const PHASE_ORDER = ["early", "week", "days", "departure", "packing", "arrival"];

export const PHASE_LABELS = {
  early: "За 2 недели и раньше",
  week: "За неделю",
  days: "За 1–3 дня",
  departure: "День вылета",
  packing: "Чемодан",
  arrival: "По прилёте",
};

// УПРОЩЕНИЕ ЭТОЙ ИТЕРАЦИИ: полноценный расчёт «текущего» и «следующего»
// этапа по датам поездки появится вместе с экраном «Сейчас» и настройками
// поездки (Итерация 3, D-08). Дат поездки пока нигде в приложении нет.
// Этап "early" всегда активен (PRODUCT.md 8.7), поэтому по умолчанию
// разворачиваем его и следующий по порядку этап.
export function getDefaultOpenPhases() {
  return [PHASE_ORDER[0], PHASE_ORDER[1]];
}

// --- Состояние поездки по датам (Итерация 3) ---
// Чистые функции ([I3-20]): на вход даты поездки и «сегодня», на выход
// состояние и числа N/M. Даты сравниваются как строки ГГГГ-ММ-ДД, «сегодня»
// — локальная дата устройства ([I3-21]): часовыми поясами приложение не
// управляет, пользователь видит свой местный день.

export const TRIP_STATE = {
  NO_DATES: "no-dates",
  BEFORE: "before",
  DURING: "during",
  AFTER: "after",
};

const DAY_MS = 24 * 60 * 60 * 1000;

// UTC-полночь для строки ГГГГ-ММ-ДД: разница дат не зависит от перехода на
// летнее время.
function toUtcMs(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function daysBetween(fromStr, toStr) {
  return Math.round((toUtcMs(toStr) - toUtcMs(fromStr)) / DAY_MS);
}

// Локальная дата устройства в формате ГГГГ-ММ-ДД.
export function getTodayIso(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// trip — { start, end } из storage.getTrip(); today — строка ГГГГ-ММ-ДД.
// Состояние определяется только датами; район на него не влияет.
export function getTripState(trip, today) {
  const start = (trip && trip.start) || null;
  const end = (trip && trip.end) || null;
  // Неполные или перевёрнутые даты — «Без дат» ([I3-5]).
  if (!start || !end || start > end) return { state: TRIP_STATE.NO_DATES };
  if (today < start) return { state: TRIP_STATE.BEFORE, daysUntil: daysBetween(today, start) };
  if (today > end) return { state: TRIP_STATE.AFTER };
  return {
    state: TRIP_STATE.DURING,
    day: daysBetween(start, today) + 1,
    total: daysBetween(start, end) + 1,
  };
}

// Русские формы числительных для строк Главной: «1 день», «2 дня», «5 дней».
export function pluralizeRu(count, [one, few, many]) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

// --- Точка отсчёта для расстояний (ITERATION-3-LOCATION-REVIEW §7.2) ---
// Район — логический контекст, точка проживания — отдельное значение. Здесь
// единственное место в приложении, где записано правило приоритета
// источников; экраны получают уже готовую точку и её точность.

export const ORIGIN_PRECISION = {
  // Точка проживания известна: ориентир из справочника или координата.
  EXACT: "exact",
  // Точки нет — считаем от центра района, и интерфейс об этом говорит.
  AREA: "area",
  // Считать не от чего: район не выбран или у него нет центра ("other").
  NONE: "none",
};

// trip — из storage.getTrip(); config — из loadConfig().
// Возвращает { point: {lat,lng}|null, precision, label: string|null }.
// Чистая функция: без DOM, storage и location (PRODUCT.md 10.3).
export function resolveOrigin(trip, config) {
  const areas = config && Array.isArray(config.areas) ? config.areas : [];
  // Район ищется среди verified — loadConfig() других и не отдаёт ([I3-3]).
  const area = areas.find((a) => a.id === (trip && trip.area)) || null;
  const stay = (trip && trip.stay) || null;

  if (stay) {
    // 1–2. Координата записана геолокацией или введена вручную (Итерация 5).
    if (stay.source === "gps" || stay.source === "manual") {
      return { point: stay.point, precision: ORIGIN_PRECISION.EXACT, label: null };
    }
    // 3. Ориентир из справочника района: в хранилище только id (D-20).
    if (stay.source === "spot" && area && Array.isArray(area.spots)) {
      const spot = area.spots.find((s) => s.id === stay.spotId);
      // Ориентира больше нет в справочнике — молча откатываемся на центр
      // района (PRODUCT.md 9.7), значение в хранилище не трогаем.
      if (spot && spot.point) {
        return { point: spot.point, precision: ORIGIN_PRECISION.EXACT, label: spot.name };
      }
    }
  }

  // 4. Центр района — условная точка протяжённого объекта, поэтому "area".
  if (area && area.center) {
    return { point: area.center, precision: ORIGIN_PRECISION.AREA, label: area.name };
  }
  // 5. Ни точки, ни центра.
  return { point: null, precision: ORIGIN_PRECISION.NONE, label: null };
}
