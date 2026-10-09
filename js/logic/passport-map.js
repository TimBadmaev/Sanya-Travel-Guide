// Схема побережья паспорта (EXPLORER-PASSPORT-SPEC.md 4): проекция координат
// на декоративную схему и раскладка значков мест. Чистые функции: без DOM,
// хранилища и адреса страницы (PRODUCT.md 10.3).
//
// Схема не навигационная. Правило проекции: взаимное расположение
// сохраняется (западнее — левее, севернее — выше), расстояния — нет: пустые
// участки побережья сжаты, город растянут. Рисунок берега в
// js/views/passport-art.js нарисован в этом же пространстве — смена
// проекции требует перерисовки берега.

export const MAP_SIZE = 1000;

// x — кусочно-линейно по долготе (монотонно), y — линейно по широте.
const LNG_STOPS = [
  [109.1, 20],
  [109.25, 170],
  [109.42, 300],
  [109.475, 330],
  [109.545, 700],
  [109.67, 850],
  [109.77, 980],
];
const LAT_SOUTH = 18.2;
const LAT_NORTH = 18.39;
const Y_SOUTH = 910;
const Y_NORTH = 150;

export function projectLng(lng) {
  if (!Number.isFinite(lng) || lng < LNG_STOPS[0][0] || lng > LNG_STOPS[LNG_STOPS.length - 1][0]) return null;
  for (let i = 1; i < LNG_STOPS.length; i += 1) {
    const [lngB, xB] = LNG_STOPS[i];
    if (lng <= lngB) {
      const [lngA, xA] = LNG_STOPS[i - 1];
      return xA + ((lng - lngA) / (lngB - lngA)) * (xB - xA);
    }
  }
  return null;
}

export function projectLat(lat) {
  if (!Number.isFinite(lat) || lat < LAT_SOUTH || lat > LAT_NORTH) return null;
  return Y_SOUTH - ((lat - LAT_SOUTH) / (LAT_NORTH - LAT_SOUTH)) * (Y_SOUTH - Y_NORTH);
}

// Точка места на схеме { x, y } или null: нет координат или место вне
// охвата схемы. Позиция не придумывается — такое место показывается
// списком без точки.
export function projectPoint(location) {
  if (!location) return null;
  const x = projectLng(location.lng);
  const y = projectLat(location.lat);
  if (x === null || y === null) return null;
  return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
}

// Прямоугольник части побережья на схеме по её границам (data/passport.json).
// Открытая граница — край схемы. Граница вне охвата проекции — тоже край.
export function partRect(bounds) {
  const edge = (value, project, fallback) => {
    if (value === undefined) return fallback;
    const projected = project(value);
    return projected === null ? fallback : projected;
  };
  const x1 = edge(bounds.lngMin, projectLng, 0);
  const x2 = edge(bounds.lngMax, projectLng, MAP_SIZE);
  // latMax — северная граница (меньший y), latMin — южная.
  const y1 = edge(bounds.latMax, projectLat, 0);
  const y2 = edge(bounds.latMin, projectLat, MAP_SIZE);
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

// Места части побережья в порядке номеров на схеме: с запада на восток, при
// равенстве — с севера на юг, затем порядок каталога. Места без точки — в
// конце, в порядке каталога.
export function orderForMap(places) {
  return places
    .map((place, index) => ({ place, index, point: projectPoint(place.location) }))
    .sort((a, b) => {
      if (!a.point || !b.point) return (a.point ? 0 : 1) - (b.point ? 0 : 1) || a.index - b.index;
      return a.point.x - b.point.x || a.point.y - b.point.y || a.index - b.index;
    });
}

// Раздвигает значки, которые ближе sep друг к другу (детерминированно:
// фиксированный порядок и число шагов). Совпадающие точки расходятся под
// углом, зависящим только от их номеров.
function relax(points, sep) {
  const out = points.map((p) => ({ x: p.x, y: p.y }));
  for (let step = 0; step < 400; step += 1) {
    let moved = false;
    for (let i = 0; i < out.length; i += 1) {
      for (let j = i + 1; j < out.length; j += 1) {
        let dx = out[j].x - out[i].x;
        let dy = out[j].y - out[i].y;
        let d = Math.hypot(dx, dy);
        if (d >= sep - 1e-6) continue;
        if (d < 1e-6) {
          const angle = (i + 1) * 2.399963 + j;
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          d = 1;
        } else {
          dx /= d;
          dy /= d;
        }
        const push = (sep - d) / 2 + 0.01;
        out[i].x -= dx * push;
        out[i].y -= dy * push;
        out[j].x += dx * push;
        out[j].y += dy * push;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return out;
}

function boxOf(points, pad) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    x: Math.min(...xs) - pad,
    y: Math.min(...ys) - pad,
    w: Math.max(...xs) - Math.min(...xs) + 2 * pad,
    h: Math.max(...ys) - Math.min(...ys) + 2 * pad,
  };
}

// Пропорции рамки части: не выше 1,1 ширины и не ниже 0,6 — карта на 320 px
// не превращается ни в полоску, ни в столб.
function fitAspect(box) {
  const out = { ...box };
  if (out.h > out.w * 1.1) {
    const w = out.h / 1.1;
    out.x -= (w - out.w) / 2;
    out.w = w;
  } else if (out.h < out.w * 0.6) {
    const h = out.w * 0.6;
    out.y -= (h - out.h) / 2;
    out.h = h;
  }
  return out;
}

// Раскладка значков для экрана части побережья. points — [{ id, x, y }]
// в координатах схемы. minWidthPx — самая узкая ширина карты на экране,
// hitPx — радиус зоны нажатия в пикселях (44 px / 2). Зоны нажатия
// раздвигаются так, чтобы на самой узкой карте не пересекаться; рамка
// подбирается под раздвинутые значки. Результат зависит только от входа.
export function layoutMarkers(points, { minWidthPx = 280, hitPx = 22, minBoxWidth = 220 } = {}) {
  if (!points.length) return { viewBox: null, hitR: 0, markers: [] };
  let width = Math.max(minBoxWidth, boxOf(points, 0).w);
  let result = null;
  for (let round = 0; round < 12; round += 1) {
    const hitR = (hitPx * width) / minWidthPx;
    const placed = relax(points, 2 * hitR);
    const viewBox = fitAspect(boxOf(placed, hitR * 1.7));
    result = { viewBox, hitR, placed };
    if (viewBox.w <= width + 0.5) break;
    width = viewBox.w;
  }
  const { viewBox, hitR, placed } = result;
  const round1 = (n) => Math.round(n * 10) / 10;
  return {
    viewBox: { x: round1(viewBox.x), y: round1(viewBox.y), w: round1(viewBox.w), h: round1(viewBox.h) },
    hitR: round1(hitR),
    markers: points.map((p, i) => ({
      id: p.id,
      x: round1(placed[i].x),
      y: round1(placed[i].y),
      tx: p.x,
      ty: p.y,
      moved: Math.hypot(placed[i].x - p.x, placed[i].y - p.y) > 1,
    })),
  };
}
