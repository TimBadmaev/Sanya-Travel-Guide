// Чистая логика фильтров «Мест» и подписи enum-значений places.json.
// Не обращается к DOM, storage и location (PRODUCT.md 10.3); входные массивы
// не мутирует — результат всегда новый массив (PLACES-IMPLEMENTATION.md §6).

import { haversineKm } from "./distance.js";

// Токены флаговых фильтров в порядке чипов (MVP-UX-SPEC §4, таблица чипов).
export const FLAG_FILTERS = ["short", "easy", "indoor", "free", "saved", "kids"];

// Подписи флаговых чипов. Подпись "kids" берётся из config.tags (id "kids"),
// эта — только запасная.
export const FLAG_LABELS = {
  short: "До 2 ч",
  easy: "Легко",
  indoor: "В помещении",
  free: "Бесплатно",
  saved: "Сохранённые",
  kids: "С детьми",
  // Подписи нужны только для подсказки «Снять «…»» при 0 результатах —
  // отдельных чипов в общем ряду у этих двух токенов нет (см. выше).
  medium3h: "До 3 часов",
  moderate: "Средняя нагрузка",
};

export const EFFORT_LABELS = { low: "Лёгкая нагрузка", medium: "Средняя нагрузка", high: "Высокая нагрузка" };
export const SETTING_LABELS = { outdoor: "На улице", indoor: "В помещении", mixed: "Улица и помещение" };
export const PRICE_LABELS = { free: "Бесплатно", paid: "Платно", unknown: "Цена не подтверждена" };

// Условие каждого флага (PRODUCT.md 8.4). "indoor" — строго indoor, mixed
// не входит (PLACES-IMPLEMENTATION.md [OQ-11]).
const FLAG_PREDICATES = {
  short: (place) => place.durationHours[0] <= 2,
  easy: (place) => place.effort === "low",
  indoor: (place) => place.setting === "indoor",
  free: (place) => place.price.type === "free",
  saved: (place, savedIds) => savedIds.includes(place.id),
  kids: (place) => Array.isArray(place.tags) && place.tags.includes("kids"),
};

// Подборщик «Время + интерес + нагрузка» (Итерация 8, строка 8 таблицы 11.2
// PRODUCT.md): два доп. токена того же f=-механизма, что и обычные чипы.
// Не входят в FLAG_FILTERS (общий ряд чипов «Мест»), иначе продублировали бы
// смысл уже существующих "short"/"easy" новыми похожими кнопками — их видит
// только панель подборщика (js/views/places.js). Правило времени — то же,
// что уже действует у "short" (durationHours[0] — минимально нужное время —
// не больше выбранного бюджета); 3 ч — порог по прямому примеру из задания
// (место с durationHours=[2,4] должно попадать в «до 3 часов»). "moderate" —
// effort "medium"; отдельного флага для "high" нет — среди verified мест
// такого effort сейчас нет вовсе (проверено по data/places.json), появление
// такого места — повод добавить чип отдельным решением, а не автоматически.
export const PICKER_TIME_TOKEN_3H = "medium3h";
export const PICKER_EFFORT_TOKEN_MODERATE = "moderate";

const PICKER_FLAG_PREDICATES = {
  [PICKER_TIME_TOKEN_3H]: (place) => place.durationHours[0] <= 3,
  [PICKER_EFFORT_TOKEN_MODERATE]: (place) => place.effort === "medium",
};

const ALL_FLAG_PREDICATES = { ...FLAG_PREDICATES, ...PICKER_FLAG_PREDICATES };

// Готовые варианты подборщика (js/views/places.js) — единственное место,
// где определены их токены и подписи. token: null — вариант без ограничения
// (в tokens ничего не добавляется).
export const TIME_BUDGETS = [
  { token: "short", label: "До 2 часов" },
  { token: PICKER_TIME_TOKEN_3H, label: "До 3 часов" },
  { token: null, label: "Полдня и больше" },
];

export const EFFORT_BUDGETS = [
  { token: null, label: "Любая нагрузка" },
  { token: "easy", label: "Лёгкая нагрузка" },
  { token: PICKER_EFFORT_TOKEN_MODERATE, label: "Средняя нагрузка" },
];

function isFlag(token) {
  return token in ALL_FLAG_PREDICATES;
}

// raw — значение параметра f ("nature,short") или null. Пустые, неизвестные
// и повторные токены отбрасываются; порядок первого появления = порядок
// применения фильтров.
export function parseFilters(raw, categoryIds) {
  const tokens = [];
  if (!raw) return tokens;
  raw.split(",").forEach((token) => {
    if (!token || tokens.includes(token)) return;
    if (isFlag(token) || categoryIds.includes(token)) tokens.push(token);
  });
  return tokens;
}

export function serializeFilters(tokens) {
  return tokens.join(",");
}

// Новый токен — в конец: порядок применения нужен подсказке при 0 результатах.
export function toggleFilter(tokens, token) {
  return tokens.includes(token) ? tokens.filter((t) => t !== token) : [...tokens, token];
}

// Категории — одна группа через ИЛИ, каждый флаг — отдельное условие через И
// (PRODUCT.md 8.4). Порядок входного массива сохраняется.
export function applyFilters(places, tokens, { savedIds }) {
  const categories = tokens.filter((t) => !isFlag(t));
  const flags = tokens.filter(isFlag);
  return places.filter(
    (place) =>
      (!categories.length || categories.includes(place.category)) &&
      flags.every((flag) => ALL_FLAG_PREDICATES[flag](place, savedIds))
  );
}

// Какой фильтр предложить снять при 0 результатах: последний применённый,
// без которого результаты появляются; если такого нет — последний.
export function suggestFilterToRemove(places, tokens, options) {
  if (!tokens.length) return null;
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    const rest = tokens.filter((_, j) => j !== i);
    if (applyFilters(places, rest, options).length > 0) return tokens[i];
  }
  return tokens[tokens.length - 1];
}

// Новый массив, по возрастанию расстояния от center до place.location.
// При равенстве сохраняется исходный порядок (сортировка стабильна).
// center == null (район не выбран или у него нет центра) → копия входного
// массива без сортировки, то есть порядок places.json.
export function sortByDistance(places, center) {
  if (!center) return places.slice();
  return places
    .map((place, index) => ({ place, index, km: haversineKm(center, place.location) }))
    .sort((a, b) => {
      const diff = a.km - b.km;
      // NaN (у места нет координат) и равные расстояния — порядок файла.
      return Number.isNaN(diff) || diff === 0 ? a.index - b.index : diff;
    })
    .map((item) => item.place);
}

// Радиус «рядом» для сценариев «Сейчас» в поездке (Q-21,
// ITERATION-4-IMPLEMENTATION.md §7). 20 км по прямой: из Ялунваня — и от
// ориентиров, и от центра района — это вся городская часть до пляжа Санья Бэй
// включительно (не дальше 18,3 км), без Тяньяхайцзяо (от 30 км) и Наньшаня
// (от 44 км). Сравнение — по исходным километрам, как и сортировка.
export const NEAR_RADIUS_KM = 20;

// Новый массив мест не дальше radiusKm от center; порядок входа сохраняется
// (сортирует sortByDistance). center == null → копия без ограничения: не от
// чего считать. Место без координат (NaN) в радиус не попадает.
export function filterWithinRadius(places, center, radiusKm = NEAR_RADIUS_KM) {
  if (!center) return places.slice();
  return places.filter((place) => haversineKm(center, place.location) <= radiusKm);
}

// Место с координатой-заглушкой {0,0} (черновик без подтверждённой точки —
// сейчас так помечены bohou-village и linchunling-forest-park, оба status
// "draft" и уже не доходят до этой функции через loadPlaces(), D-18) не может
// участвовать в «Рядом со мной» (Итерация 8): в отличие от NaN у настоящей
// нулевой точки координаты формально валидны, и haversineKm() её не отсеет —
// без явной проверки место посчиталось бы в Гвинейском заливе.
function hasUsableLocation(place) {
  const loc = place && place.location;
  return Boolean(loc) && Number.isFinite(loc.lat) && Number.isFinite(loc.lng) && !(loc.lat === 0 && loc.lng === 0);
}

// «Рядом со мной» (Итерация 8): places уже отфильтрованы по status
// "verified" (loadPlaces(), D-18) — здесь дополнительно отсекаются места без
// пригодной точки, дальше — тот же радиус и та же сортировка, что у
// сценариев «Сейчас» (Q-21). origin — точка геолокации { lat, lng } на время
// сеанса, не хранится (см. js/views/places.js). origin == null → пустой
// массив: без точки считать нечего.
export function nearbyPlaces(places, origin, radiusKm = NEAR_RADIUS_KM) {
  if (!origin) return [];
  const usable = places.filter(hasUsableLocation);
  return sortByDistance(filterWithinRadius(usable, origin, radiusKm), origin);
}

// Поиск по названию (Should, PRODUCT.md §7 «Поиск по названию (русскому,
// английскому, китайскому)»): подстрока без учёта регистра по перечисленным
// полям `name.*`. Поля задаёт вызывающий экран — у мест есть ru/en/zh
// (en — не у всех записей), у еды из PRODUCT.md 6.3/9.6.4 только ru/zh.
// Работает через тот же принцип «И» с остальными фильтрами (8.4): вызывающий
// код применяет applySearch() к тому же базовому списку, что и applyFilters()
// (как near-радиус уже сужает базу через basePlaces() в places.js), поэтому
// второй независимый пайплайн фильтрации не заводится.
export const PLACE_SEARCH_FIELDS = ["ru", "en", "zh"];
export const FOOD_SEARCH_FIELDS = ["ru", "zh"];

// trim обязателен (задание): пробелы по краям не должны ни требовать точного
// совпадения, ни превращать "  " в непустой запрос.
export function normalizeSearchQuery(raw) {
  return (raw || "").trim();
}

// Пустой (после trim) запрос — поиск не применяется, возвращается тот же
// список (новый массив, как и у остальных чистых функций этого модуля).
export function applySearch(items, query, fields) {
  const trimmed = normalizeSearchQuery(query).toLowerCase();
  if (!trimmed) return items.slice();
  return items.filter((item) =>
    fields.some((field) => {
      const value = item.name && item.name[field];
      return typeof value === "string" && value.toLowerCase().includes(trimmed);
    })
  );
}

// [1, 3] → "1–3 ч"; [2, 2] → "2 ч"; дробные — с запятой: "0,5–1 ч".
export function formatDuration(durationHours) {
  const [min, max] = durationHours;
  const format = (n) => String(n).replace(".", ",");
  return min === max ? `${format(min)} ч` : `${format(min)}–${format(max)} ч`;
}
