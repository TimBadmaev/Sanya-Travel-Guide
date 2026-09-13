// Работа с состоянием пользователя в localStorage.
// Контент (JSON) и состояние пользователя хранятся раздельно (D-17 PRODUCT.md).

const SCHEMA_VERSION = 1;

export const KEYS = {
  schema: "stg:schema",
  trip: "stg:trip",
  checklist: "stg:checklist",
  saved: "stg:saved",
  // Итерация 5: подсказка «Добавьте на экран „Домой“» закрыта. Отдельный
  // флаг, к схеме stg:trip не относится.
  installHintDismissed: "stg:installHintDismissed",
};

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

function getChecklistState() {
  if (!storageAvailable) return {};
  ensureSchema();
  try {
    const raw = window.localStorage.getItem(KEYS.checklist);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.error("Не удалось прочитать stg:checklist", e);
    return {};
  }
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

export const storage = {
  isAvailable: () => storageAvailable,
  isInstallHintDismissed,
  setInstallHintDismissed,
  getChecklistState,
  setChecklistItemDone,
  getSavedIds,
  setPlaceSaved,
  getTrip,
  setTrip,
};
