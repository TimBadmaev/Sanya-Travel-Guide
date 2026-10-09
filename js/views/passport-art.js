import { MAP_SIZE, partRect } from "../logic/passport-map.js";

// Рисунок паспорта (EXPLORER-PASSPORT-SPEC.md 4.4, 6): декоративная схема
// побережья и наклейки. Только локальный inline-SVG — ни тайлов, ни
// внешних изображений и шрифтов (D-28). Названия мест и частей побережья
// вставляются только через textContent.
//
// Берег — иллюстрация в пространстве проекции js/logic/passport-map.js, а не
// данные береговой линии: точки проходят через места каталога так, чтобы
// каждое место было на суше, а пляжи — у кромки (проверяется тестами).
// Смена проекции требует перерисовки берега.
//
// Островов на схеме нет: у мест с тегом «Остров» в каталоге координаты
// причалов на большой земле (addressZh …码头), а положения самих островов в
// данных нет. Рисовать их по догадке нельзя.

const NS = "http://www.w3.org/2000/svg";

// Кромка берега с запада на восток, суша — выше и левее линии.
const COAST = [
  [-40, 470], [40, 502], [100, 525], [150, 540], [200, 560], [245, 572], [275, 566],
  [320, 598], [370, 640], [405, 684], [398, 720], [390, 760], [386, 800], [396, 832],
  [430, 852], [470, 852], [505, 860], [535, 860], [560, 857], [590, 852], [620, 860],
  [660, 870], [700, 866], [740, 852], [770, 842], [796, 836], [830, 822], [860, 792],
  [890, 742], [915, 684], [938, 628], [948, 568], [953, 500], [958, 420], [962, 350],
  [962, 300], [967, 240], [971, 190], [976, 140], [985, 60], [1000, -40],
];

// Значки частей побережья на обзорной схеме — места, где они не закрывают
// точки мест и не пересекаются друг с другом. Новая часть без строки здесь
// получает значок в центре своих мест.
export const PART_BADGES = {
  "coast-west": { x: 100, y: 620, label: "below" },
  "coast-tianya": { x: 250, y: 400, label: "above" },
  "coast-centre": { x: 330, y: 760, label: "below" },
  "coast-dadonghai": { x: 480, y: 915, label: "right" },
  "coast-north": { x: 480, y: 250, label: "below" },
  "coast-yalong": { x: 790, y: 580, label: "below" },
  "coast-haitang": { x: 890, y: 790, label: "below" },
};

// Чернила категорий (спецификация 6.1); покупки — графит.
export const CATEGORY_INK = {
  beach: "#2f8f9a",
  nature: "#3d7a45",
  culture: "#9a4a2f",
  entertainment: "#c2512d",
  market: "#9a6414",
  shopping: "#4a5654",
};

export function el(tag, attrs = {}, parent = null) {
  const node = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (value !== null && value !== undefined) node.setAttribute(key, String(value));
  });
  if (parent) parent.appendChild(node);
  return node;
}

// Сглаженная линия через точки (Catmull-Rom → кубические Безье).
function smoothPath(points) {
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0]},${p2[1]}`;
  }
  return d;
}

const COAST_LINE = smoothPath(COAST);
const LAND = `${COAST_LINE} L1040,-40 L-40,-40 Z`;

// Декор — без подписей и вдали от точек мест (спецификация 4.4): холмы не
// рисуются под местами, чтобы не создавать впечатления «здесь гора».
const HILLS = [
  [300, 250, 1], [160, 380, 0.8], [560, 195, 0.9], [720, 330, 1.1], [800, 455, 0.8], [660, 250, 0.7],
];
const PALMS = [[300, 588], [640, 846], [215, 548]];

function drawHill(group, x, y, s) {
  el("path", { d: `M${x - 60 * s},${y} Q${x - 25 * s},${y - 62 * s} ${x},${y - 30 * s} Q${x + 30 * s},${y - 70 * s} ${x + 62 * s},${y} Z`, class: "pp-hill" }, group);
  el("path", { d: `M${x - 30 * s},${y - 6 * s} q12,-14 24,-6 M${x + 14 * s},${y - 10 * s} q12,-14 24,-6`, class: "pp-hill__line" }, group);
}

function drawPalm(group, x, y) {
  el("path", { d: `M${x},${y} q4,-24 12,-40`, class: "pp-palm__trunk" }, group);
  [[-22, -6], [-16, 12], [20, -10], [18, 12], [2, -24]].forEach(([dx, dy]) => {
    el("path", { d: `M${x + 12},${y - 40} q${dx / 2},${dy / 2 - 10} ${dx},${dy}`, class: "pp-palm__leaf" }, group);
  });
}

function drawCompass(group, x, y) {
  const g = el("g", { class: "pp-compass", transform: `translate(${x},${y})` }, group);
  el("circle", { r: 46, class: "pp-compass__ring" }, g);
  el("path", { d: "M0,-40 L9,0 L0,40 L-9,0 Z", class: "pp-compass__ns" }, g);
  el("path", { d: "M-40,0 L0,-8 L40,0 L0,8 Z", class: "pp-compass__ew" }, g);
  const north = el("text", { x: 0, y: -52, class: "pp-compass__n" }, g);
  north.textContent = "С";
}

function drawBoat(group, x, y) {
  const g = el("g", { class: "pp-boat", transform: `translate(${x},${y})` }, group);
  el("path", { d: "M-34,0 L34,0 L22,16 L-22,16 Z", class: "pp-boat__hull" }, g);
  el("path", { d: "M0,-4 L0,-58 L30,-8 Z", class: "pp-boat__sail" }, g);
  el("path", { d: "M-4,-8 L-4,-44 L-26,-8 Z", class: "pp-boat__sail pp-boat__sail--small" }, g);
}

// Основа схемы: море, суша, части побережья, декор. viewBox — { x, y, w, h }
// в координатах схемы. parts — части побережья (prepareContent),
// currentPart — id части, которую нужно выделить (экран части).
export function createMapSvg({ viewBox, parts, currentPart = null, label }) {
  const svg = el("svg", {
    viewBox: `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`,
    class: "pp-map__svg",
    role: "group",
    "aria-label": label,
    preserveAspectRatio: "xMidYMid meet",
  });
  const defs = el("defs", {}, svg);
  const pattern = el("pattern", { id: "pp-waves", width: 80, height: 40, patternUnits: "userSpaceOnUse" }, defs);
  el("path", { d: "M4,24 q10,-10 20,0 t20,0 M44,8 q8,-8 16,0", class: "pp-wave" }, pattern);
  const grain = el("pattern", { id: "pp-grain", width: 26, height: 26, patternUnits: "userSpaceOnUse" }, defs);
  el("circle", { cx: 6, cy: 7, r: 1.6, class: "pp-grain" }, grain);
  el("circle", { cx: 19, cy: 19, r: 1.2, class: "pp-grain" }, grain);
  const clip = el("clipPath", { id: "pp-land-clip" }, defs);
  el("path", { d: LAND }, clip);

  el("rect", { x: -600, y: -600, width: MAP_SIZE + 1200, height: MAP_SIZE + 1200, class: "pp-sea" }, svg);
  el("rect", { x: -600, y: -600, width: MAP_SIZE + 1200, height: MAP_SIZE + 1200, fill: "url(#pp-waves)" }, svg);
  el("path", { d: COAST_LINE, class: "pp-shallow" }, svg);
  el("path", { d: LAND, class: "pp-land", id: "pp-land" }, svg);

  // Части побережья — мягкие чередующиеся оттенки суши; на экране части
  // остальные приглушены.
  const tints = el("g", { "clip-path": "url(#pp-land-clip)", class: "pp-parts" }, svg);
  parts.forEach((part, index) => {
    const r = partRect(part.bounds);
    const cls = currentPart
      ? part.id === currentPart ? "pp-part pp-part--current" : "pp-part pp-part--dim"
      : `pp-part pp-part--${index % 2 ? "b" : "a"}`;
    el("rect", { x: r.x, y: r.y, width: r.w, height: r.h, class: cls, "data-part": part.id }, tints);
  });

  el("rect", { x: -600, y: -600, width: MAP_SIZE + 1200, height: MAP_SIZE + 1200, fill: "url(#pp-grain)", "clip-path": "url(#pp-land-clip)" }, svg);
  const decor = el("g", { class: "pp-decor", "aria-hidden": "true" }, svg);
  HILLS.forEach(([x, y, s]) => drawHill(decor, x, y, s));
  PALMS.forEach(([x, y]) => drawPalm(decor, x, y));
  el("path", { d: COAST_LINE, class: "pp-surf", id: "pp-coast" }, svg);
  drawCompass(decor, 110, 800);
  drawBoat(decor, 190, 905);
  const cartouche = el("g", { class: "pp-cartouche", "aria-hidden": "true" }, svg);
  el("rect", { x: 745, y: 918, width: 240, height: 64, rx: 14, class: "pp-cartouche__box" }, cartouche);
  const title = el("text", { x: 865, y: 960, class: "pp-cartouche__text" }, cartouche);
  title.textContent = "Санья";
  return svg;
}

// ------------------------------------------------------------ наклейки

// Оформление наклеек по id: форма, цвет, глиф. Контент — data/passport.json.
const STICKER_STYLE = {
  "first-stamp": { shape: "circle", color: "#0b6e6e", glyph: "🧭" },
  "sea-explorer": { shape: "circle", color: "#2f8f9a", glyph: "🌊" },
  "island-horizon": { shape: "square", color: "#3f8f86", glyph: "🏝️" },
  "taste-of-hainan": { shape: "scallop", color: "#b9781c", glyph: "🏮" },
  "sunset-catcher": { shape: "circle", color: "#c2512d", glyph: "🌅" },
  "above-the-bay": { shape: "square", color: "#4d7398", glyph: "🔭" },
  "story-keeper": { shape: "circle", color: "#9a4a2f", glyph: "📜" },
  "green-island": { shape: "square", color: "#4f8f57", glyph: "🌿" },
  "local-life": { shape: "scallop", color: "#a5583a", glyph: "🚲" },
  "island-pathfinder": { shape: "square", color: "#6a5d93", glyph: "🧩" },
  "west-to-east": { shape: "circle", color: "#2f6f8f", glyph: "⛵" },
  "seasoned-explorer": { shape: "scallop", color: "#8a4e10", glyph: "🛂" },
};

function scallopPath(cx, cy, r, bumps) {
  let d = "";
  for (let i = 0; i <= bumps; i += 1) {
    const a = (i / bumps) * Math.PI * 2 - Math.PI / 2;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    if (i === 0) {
      d += `M${x.toFixed(2)},${y.toFixed(2)}`;
    } else {
      const mid = a - Math.PI / bumps;
      const bx = cx + (r + 7) * Math.cos(mid);
      const by = cy + (r + 7) * Math.sin(mid);
      d += ` Q${bx.toFixed(2)},${by.toFixed(2)} ${x.toFixed(2)},${y.toFixed(2)}`;
    }
  }
  return `${d} Z`;
}

function shapeNode(shape, attrs, parent, inset = 0) {
  if (shape === "square") return el("rect", { x: 10 + inset, y: 10 + inset, width: 80 - 2 * inset, height: 80 - 2 * inset, rx: 18 - inset / 2, ...attrs }, parent);
  if (shape === "scallop") return el("path", { d: scallopPath(50, 50, 36 - inset, 14), ...attrs }, parent);
  return el("circle", { cx: 50, cy: 50, r: 40 - inset, ...attrs }, parent);
}

// Детерминированный наклон −6°…+6° от id: альбом выглядит «наклеенным».
export function tiltOf(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) % 997;
  return (hash % 13) - 6;
}

// Наклейка: полноцветная с белой высечкой, если получена; контур и
// приглушённый глиф — если ещё впереди.
export function createStickerArt(id, earned) {
  const style = STICKER_STYLE[id] || { shape: "circle", color: "#0b6e6e", glyph: "🏷️" };
  const svg = el("svg", {
    viewBox: "0 0 100 100",
    class: `pp-sticker-art${earned ? " pp-sticker-art--earned" : ""}`,
    "aria-hidden": "true",
    focusable: "false",
  });
  if (earned) {
    shapeNode(style.shape, { fill: style.color, class: "pp-sticker-art__cut" }, svg);
    shapeNode(style.shape, { class: "pp-sticker-art__ring" }, svg, 7);
  } else {
    shapeNode(style.shape, { class: "pp-sticker-art__outline" }, svg);
  }
  const glyph = el("text", { x: 50, y: 53, class: "pp-sticker-art__glyph" }, svg);
  glyph.textContent = style.glyph;
  return svg;
}
