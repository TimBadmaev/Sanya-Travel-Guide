// «Паспорт исследователя» (EXPLORER-PASSPORT-SPEC.md, Passport v1). Чистые
// функции: без DOM, хранилища и адреса страницы (PRODUCT.md 10.3). Входные
// объекты не мутируются.
//
// Главное правило: награды и прогресс не хранятся, а каждый раз выводятся из
// двух источников — сохранённых отметок (stg:passport) и актуального каталога
// (verified-места из places.json). Счётчиков, которые могли бы разойтись с
// отметками, нет: снятая отметка честно закрывает наклейку обратно.

import { haversineKm } from "./distance.js";
import { isIsoDate } from "./plan.js";

// Категории, которые можно отметить на память, но которые не участвуют в
// наградах (решение Q-P3): не открывают наклейки, не входят в прогресс и его
// знаменатели, не попадают в подсказки. Применяется в одном месте —
// rewardCatalog(): все расчёты наград берут места только оттуда, поэтому
// отдельное условие наклейки не может обойти исключение.
export const REWARD_EXCLUDED_CATEGORIES = Object.freeze(["shopping"]);

export const NOTE_MAX_LENGTH = 200;

// Сколько подходящих мест показывать у закрытой наклейки.
export const HINTS_LIMIT = 3;

// Весь словарь условий наклеек (EXPLORER-PASSPORT-SPEC.md 6.3). Неизвестный
// тип — наклейка не показывается.
export const RULE_TYPES = ["count", "distinctCategories", "distinctCoastParts"];
const WHERE_KEYS = ["category", "tag", "hasStory"];
const BOUND_KEYS = ["lngMin", "lngMax", "latMin", "latMax"];
const CONTENT_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Ключ отметки — id места: непустая строка без пробелов и «:» (тот же вид,
// что у ссылок плана). Существование места в каталоге здесь не проверяется —
// несуществующие id просто не показываются (PRODUCT.md 9.7).
const VISIT_KEY = /^[^:\s]+$/;

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function isVisitKey(key) {
  return typeof key === "string" && VISIT_KEY.test(key) && key !== "__proto__";
}

// ------------------------------------------------------------ хранение

// Заметка: только текст, trim(), не длиннее NOTE_MAX_LENGTH единиц UTF-16
// (столько же отсчитывает maxlength у textarea). Обрезка не оставляет
// половину эмодзи. Пустая строка — «заметки нет».
export function clampNote(value) {
  if (typeof value !== "string") return "";
  let note = value.trim();
  if (note.length > NOTE_MAX_LENGTH) {
    note = note.slice(0, NOTE_MAX_LENGTH);
    if (/[\uD800-\uDBFF]$/.test(note)) note = note.slice(0, -1);
    note = note.trimEnd();
  }
  return note;
}

// Одна отметка: { date: "ГГГГ-ММ-ДД", at?: ISO-момент, note? }. Без валидной
// даты отметка отбрасывается; невалидный at или пустая заметка — только поле.
function normalizeVisit(value) {
  if (!isObject(value) || !isIsoDate(value.date)) return null;
  const visit = { date: value.date };
  if (typeof value.at === "string" && !Number.isNaN(Date.parse(value.at))) visit.at = value.at;
  const note = clampNote(value.note);
  if (note) visit.note = note;
  return visit;
}

// Значение stg:passport: { v: 1, visits: { "<placeId>": отметка }, seen }.
// seen («какая наклейка уже показана», ГГГГ-ММ-ДД) в v1 не пишется, но
// сохраняется при чтении и записи — следующий этап сможет на него опереться
// без миграции. Значение с v больше 1 читается по известным полям.
export function normalizePassportState(value) {
  const state = { v: 1, visits: {}, seen: {} };
  if (!isObject(value)) return state;
  if (isObject(value.visits)) {
    Object.keys(value.visits).forEach((key) => {
      if (!isVisitKey(key)) return;
      const visit = normalizeVisit(value.visits[key]);
      if (visit) state.visits[key] = visit;
    });
  }
  if (isObject(value.seen)) {
    Object.keys(value.seen).forEach((key) => {
      if (CONTENT_ID.test(key) && isIsoDate(value.seen[key])) state.seen[key] = value.seen[key];
    });
  }
  return state;
}

export function getVisit(state, placeId) {
  return state && isObject(state.visits) && hasOwn(state.visits, placeId) ? state.visits[placeId] : null;
}

// Новое состояние с отметкой места. Повторная отметка ничего не меняет:
// у места одна отметка, её дата и заметка сохраняются.
export function withVisit(state, placeId, { date, at }) {
  const next = normalizePassportState(state);
  if (!isVisitKey(placeId) || getVisit(next, placeId)) return next;
  const visit = normalizeVisit({ date, at });
  if (visit) next.visits[placeId] = visit;
  return next;
}

// Новое состояние без отметки места (заметка удаляется вместе с ней).
export function withoutVisit(state, placeId) {
  const next = normalizePassportState(state);
  if (getVisit(next, placeId)) delete next.visits[placeId];
  return next;
}

// Возврат ранее снятой отметки целиком («Вернуть»).
export function withRestoredVisit(state, placeId, visit) {
  const next = normalizePassportState(state);
  const restored = normalizeVisit(visit);
  if (isVisitKey(placeId) && restored) next.visits[placeId] = restored;
  return next;
}

// Новое состояние с заметкой. Заметку можно добавить только к отмеченному
// месту; пустая заметка удаляет поле.
export function withNote(state, placeId, note) {
  const next = normalizePassportState(state);
  const visit = getVisit(next, placeId);
  if (!visit) return next;
  const text = clampNote(note);
  if (text) {
    visit.note = text;
  } else {
    delete visit.note;
  }
  return next;
}

// ------------------------------------------------------------ контент

function validBounds(bounds) {
  if (!isObject(bounds)) return false;
  const keys = Object.keys(bounds);
  return keys.length > 0 && keys.every((key) => BOUND_KEYS.includes(key) && Number.isFinite(bounds[key]));
}

function validRule(rule, categoryIds, tagIds) {
  if (!isObject(rule) || !RULE_TYPES.includes(rule.type)) return false;
  if (!Number.isInteger(rule.min) || rule.min < 1) return false;
  if (rule.type !== "count") return rule.where === undefined;
  if (rule.where === undefined) return true;
  if (!isObject(rule.where)) return false;
  const keys = Object.keys(rule.where);
  if (!keys.length || !keys.every((key) => WHERE_KEYS.includes(key))) return false;
  if ("category" in rule.where && !categoryIds.includes(rule.where.category)) return false;
  if ("tag" in rule.where && !tagIds.includes(rule.where.tag)) return false;
  if ("hasStory" in rule.where && rule.where.hasStory !== true) return false;
  return true;
}

// Проверка data/passport.json по справочникам (D-20). Неверная часть
// побережья или наклейка не показывается; problems — для одной строки в
// консоли у экрана. ID частей побережья не должны совпадать с ID районов
// config.areas: это разные деления, и смешивать их нельзя.
export function prepareContent(content, config) {
  const problems = [];
  const categoryIds = ((config && config.categories) || []).map((c) => c.id);
  const tagIds = ((config && config.tags) || []).map((t) => t.id);
  const areaIds = ((config && config.areas) || []).map((a) => a.id);

  const coastParts = [];
  const partIds = new Set();
  (isObject(content) && Array.isArray(content.coastParts) ? content.coastParts : []).forEach((part) => {
    const id = isObject(part) ? part.id : null;
    if (!isObject(part) || typeof id !== "string" || !CONTENT_ID.test(id) || partIds.has(id) || areaIds.includes(id)) {
      problems.push(`часть побережья ${JSON.stringify(id)}: неверный или повторяющийся id`);
      return;
    }
    if (typeof part.name !== "string" || !part.name || !validBounds(part.bounds)) {
      problems.push(`часть побережья ${id}: нет названия или границ`);
      return;
    }
    partIds.add(id);
    coastParts.push({ id, name: part.name, bounds: { ...part.bounds } });
  });

  const stickers = [];
  const stickerIds = new Set();
  (isObject(content) && Array.isArray(content.stickers) ? content.stickers : []).forEach((sticker) => {
    if (!isObject(sticker) || sticker.status !== "verified") return;
    const id = sticker.id;
    if (typeof id !== "string" || !CONTENT_ID.test(id) || stickerIds.has(id)) {
      problems.push(`наклейка ${JSON.stringify(id)}: неверный или повторяющийся id`);
      return;
    }
    if (typeof sticker.title !== "string" || !sticker.title || typeof sticker.description !== "string") {
      problems.push(`наклейка ${id}: нет названия или описания`);
      return;
    }
    if (!validRule(sticker.rule, categoryIds, tagIds)) {
      problems.push(`наклейка ${id}: неизвестное условие, категория или тег`);
      return;
    }
    stickerIds.add(id);
    stickers.push({
      id,
      title: sticker.title,
      description: sticker.description,
      optional: sticker.optional === true,
      rule: { ...sticker.rule, ...(sticker.rule.where ? { where: { ...sticker.rule.where } } : {}) },
    });
  });

  return { coastParts, stickers, problems };
}

// Часть побережья места — первая, в чьи границы попадает location
// (min включительно, max — нет). Без координат или вне всех частей — null.
export function coastPartOf(place, coastParts) {
  const loc = place && place.location;
  if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) return null;
  const part = (coastParts || []).find(({ bounds }) => {
    if ("lngMin" in bounds && !(loc.lng >= bounds.lngMin)) return false;
    if ("lngMax" in bounds && !(loc.lng < bounds.lngMax)) return false;
    if ("latMin" in bounds && !(loc.lat >= bounds.latMin)) return false;
    if ("latMax" in bounds && !(loc.lat < bounds.latMax)) return false;
    return true;
  });
  return part ? part.id : null;
}

// ------------------------------------------------------------ расчёт

export function isRewardPlace(place) {
  return Boolean(place) && !REWARD_EXCLUDED_CATEGORIES.includes(place.category);
}

// Единственный источник мест для наград и прогресса.
export function rewardCatalog(places) {
  return (places || []).filter(isRewardPlace);
}

function matchesWhere(place, where) {
  if (!where) return true;
  if ("category" in where && place.category !== where.category) return false;
  if ("tag" in where && !(Array.isArray(place.tags) && place.tags.includes(where.tag))) return false;
  if ("hasStory" in where && !(typeof place.story === "string" && place.story)) return false;
  return true;
}

// Отметки, которые видны пользователю: только места из текущего каталога
// (verified), новые сверху (дата, затем момент отметки, затем порядок
// каталога). Отметка удалённого или ставшего draft места не показывается и
// не считается, но из хранилища не удаляется.
export function visitList(state, places) {
  const list = [];
  (places || []).forEach((place, index) => {
    const visit = getVisit(state, place.id);
    if (visit) list.push({ place, visit, index });
  });
  list.sort((a, b) => {
    if (a.visit.date !== b.visit.date) return a.visit.date < b.visit.date ? 1 : -1;
    const atA = a.visit.at || "";
    const atB = b.visit.at || "";
    if (atA !== atB) return atA < atB ? 1 : -1;
    return a.index - b.index;
  });
  return list.map(({ place, visit }) => ({ place, visit }));
}

// Значение, которое «собирает» правило, у одного места: для distinct-правил
// — категория или часть побережья, для count — само место.
function ruleKey(rule, place, partOf) {
  if (rule.type === "distinctCategories") return place.category;
  if (rule.type === "distinctCoastParts") return partOf(place);
  return matchesWhere(place, rule.where) ? place.id : null;
}

function evaluateRule(rule, visitedReward, catalog, partOf) {
  const collected = [];
  const matched = [];
  visitedReward.forEach((place) => {
    const key = ruleKey(rule, place, partOf);
    if (key === null) return;
    matched.push(place);
    if (!collected.includes(key)) collected.push(key);
  });
  const reachable = new Set();
  catalog.forEach((place) => {
    const key = ruleKey(rule, place, partOf);
    if (key !== null) reachable.add(key);
  });
  return { progress: collected.length, max: reachable.size, collected, matched };
}

function byDistance(list, origin) {
  if (!origin) return list;
  return list
    .map((place, index) => ({ place, index, km: haversineKm(origin, place.location) }))
    .sort((a, b) => {
      const ka = Number.isFinite(a.km) ? a.km : Infinity;
      const kb = Number.isFinite(b.km) ? b.km : Infinity;
      return ka - kb || a.index - b.index;
    })
    .map(({ place }) => place);
}

// Полный расчёт паспорта. На входе — состояние stg:passport, verified-места
// (loadPlaces), подготовленный контент (prepareContent) и необязательная
// точка отсчёта { lat, lng } для порядка подсказок (resolveOrigin; без неё —
// порядок каталога). Результат зависит только от входа.
export function evaluatePassport({ state, places, content, origin = null }) {
  const coastParts = (content && content.coastParts) || [];
  const stickers = (content && content.stickers) || [];
  const partIndex = new Map();
  (places || []).forEach((place) => partIndex.set(place.id, coastPartOf(place, coastParts)));
  const partOf = (place) => partIndex.get(place.id) || null;

  const visits = visitList(state, places);
  const catalog = rewardCatalog(places);
  const visitedIds = new Set(visits.map(({ place }) => place.id));
  // Посещённые места для наград — в порядке отметок (старые первыми).
  const visitedReward = visits
    .map(({ place }) => place)
    .filter(isRewardPlace)
    .reverse();

  const parts = coastParts.map((part) => {
    const inPart = catalog.filter((place) => partOf(place) === part.id);
    return {
      id: part.id,
      name: part.name,
      total: inPart.length,
      visited: inPart.filter((place) => visitedIds.has(place.id)).length,
    };
  }).filter((part) => part.total > 0);

  const unvisited = catalog.filter((place) => !visitedIds.has(place.id));
  const shown = [];
  stickers.forEach((sticker) => {
    const { progress, max, collected, matched } = evaluateRule(sticker.rule, visitedReward, catalog, partOf);
    const earned = progress >= sticker.rule.min;
    // Недостижимая по текущему каталогу и ещё не открытая наклейка не
    // показывается и не входит в «из N» (спецификация 6.4).
    if (!earned && max < sticker.rule.min) return;
    let hints = [];
    if (!earned && !sticker.optional) {
      const candidates = unvisited.filter((place) => {
        const key = ruleKey(sticker.rule, place, partOf);
        return key !== null && (sticker.rule.type === "count" || !collected.includes(key));
      });
      hints = byDistance(candidates, origin).slice(0, HINTS_LIMIT);
    }
    shown.push({
      id: sticker.id,
      title: sticker.title,
      description: sticker.description,
      optional: sticker.optional,
      type: sticker.rule.type,
      target: sticker.rule.min,
      progress: Math.min(progress, sticker.rule.min),
      earned,
      collected,
      matched,
      hints,
    });
  });

  const main = shown.filter((sticker) => !sticker.optional);
  return {
    visits,
    reward: { visited: visitedReward.length, total: catalog.length },
    // Отмечено на память, но не входит в награды (покупки).
    keepsakes: visits.length - visitedReward.length,
    coastParts: parts,
    coastPartsVisited: parts.filter((part) => part.visited > 0).length,
    stickers: shown,
    stickerCounts: {
      earned: main.filter((sticker) => sticker.earned).length,
      total: main.length,
      optionalEarned: shown.filter((sticker) => sticker.optional && sticker.earned).length,
    },
    partOf,
  };
}

// id открытых наклеек — для сообщения «Новая наклейка» после отметки.
export function earnedStickerIds(result) {
  return result.stickers.filter((sticker) => sticker.earned).map((sticker) => sticker.id);
}
