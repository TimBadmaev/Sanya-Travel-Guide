// Island Quest v23: главный экран — путь открытий вместо старой ленты «Сейчас».
// Данные мест и игровой прогресс читаем из существующих источников.
// Штампы — вручную; настоящая навигация и экстренная помощь доступны отдельно.
import { loadConfig, loadExplore, loadPassport, loadPlaces, loadErrorMessage } from "../data.js";
import { storage } from "../storage.js";
import { prepareContent, evaluatePassport } from "../logic/passport.js";
import { evaluateExplore } from "../logic/explore.js";
import { getTripState, getTodayIso, TRIP_STATE, pluralizeRu } from "../logic/trip.js";

function el(parent, tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  parent.appendChild(node);
  return node;
}

const chapterPhotos = {
  start: "yalong-bay-beach-1.webp",
  sea: "dadonghai-beach-1.webp",
  nature: "yalong-tropical-forest-park-1.webp",
  culture: "nanshan-cultural-zone-1.webp",
  diary: "sanya-bay-beach-1.webp",
};

function travelCaption(trip) {
  const state = getTripState(trip, getTodayIso());
  if (state.state === TRIP_STATE.DURING) return "🌞 День " + state.day + " из " + state.total;
  if (state.state === TRIP_STATE.BEFORE) return "✈️ До поездки " + state.daysUntil + " " + pluralizeRu(state.daysUntil, ["день", "дня", "дней"]);
  if (state.state === TRIP_STATE.AFTER) return "🏆 Путешествие завершено";
  return "✈️ Добавь даты путешествия";
}

function makeTrail(parent) {
  // Декоративный пунктир — не реальный маршрут между географическими точками.
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("class", "quest-trail");
  svg.setAttribute("viewBox", "0 0 320 405");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", "M128 58 C128 125 220 125 220 193 S130 259 130 331");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "7");
  path.setAttribute("stroke-dasharray", "5 17");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("fill", "none");
  svg.appendChild(path);
  parent.appendChild(svg);
}

function drawNode(parent, node, index, isNext) {
  const li = el(parent, "li", "quest-step quest-step--" + (index % 3) +
    (node.done ? " is-done" : "") + (isNext ? " is-next" : ""));
  li.dataset.nodeId = node.id;
  if (isNext) el(li, "span", "quest-step__callout", "НАЧНИ ЗДЕСЬ!");
  const link = el(li, "a", "quest-step__link");
  link.href = node.href;
  link.setAttribute("aria-label", node.title + ", " + (node.done ? "выполнено" : node.progress + " из " + node.goal));
  const disc = el(link, "span", "quest-step__disc");
  disc.style.setProperty("--quest-fill", Math.round(node.progress / node.goal * 100) + "%");
  el(disc, "span", "quest-step__disc-icon",
    node.done ? "✓" : node.kind === "lesson" ? "📚" :
    node.kind === "category" ? "⭐" :
    node.kind === "notes" ? "📝" :
    node.kind === "planned" ? "🗓️" : node.kind === "expenses" ? "💰" : node.kind === "app-days" ? "🎁" : "📍");
  el(link, "span", "quest-step__title", node.title);
  const state = node.done ? "Готово!" : node.progress > 0 ?
    (node.progress + " / " + node.goal) : node.kind === "lesson" ? "Узнать историю" : "Открыть задание";
  el(link, "span", "quest-step__subtitle", state);
}

function drawChapter(parent, chapter, index, nextId) {
  const section = el(parent, "section", "quest-world quest-world--" + chapter.color);
  section.id = "quest-chapter-" + chapter.id;
  const banner = el(section, "div", "quest-world__banner");
  banner.style.backgroundImage = "linear-gradient(90deg,rgba(7,45,43,.85),rgba(7,45,43,.32)),url('assets/photos/" +
    (chapterPhotos[chapter.id] || chapterPhotos.start) + "')";
  el(banner, "span", "quest-world__index", "МИР " + (index + 1));
  el(banner, "h3", "quest-world__title", chapter.icon + " " + chapter.title);
  el(banner, "p", "quest-world__description", chapter.subtitle);
  const count = el(banner, "span", "quest-world__badge",
    chapter.finished ? "✓ Пройдено" : chapter.done + " / " + chapter.total + " заданий");
  count.setAttribute("aria-label", "Выполнено " + chapter.done + " из " + chapter.total + " заданий");

  const stage = el(section, "div", "quest-world__stage");
  makeTrail(stage);
  const list = el(stage, "ol", "quest-world__path");
  chapter.nodes.forEach((node, i) => drawNode(list, node, i, node.id === nextId));
  if (chapter.finished) {
    const award = el(section, "div", "quest-world__award", "🏅 Этот мир исследован! Продолжай путь.");
    award.setAttribute("role", "status");
  }
}

export async function renderAdventure(container, ctx) {
  if (storage.getTrip().isFirstRun) {
    window.location.replace("#/welcome");
    return;
  }
  container.innerHTML = '<p class="loading">Открываем новые приключения…</p>';
  let places, config, passportRaw, exploreRaw;
  try {
    [places, config, passportRaw, exploreRaw] = await Promise.all([
      loadPlaces(), loadConfig(), loadPassport(), loadExplore(),
    ]);
  } catch (err) {
    if (!ctx.isCurrent()) return;
    container.textContent = loadErrorMessage(err);
    const btn = el(container, "button", "btn btn--primary", "Повторить");
    btn.addEventListener("click", () => renderAdventure(container, ctx));
    return;
  }
  if (!ctx.isCurrent()) return;
  const p = evaluatePassport({ state: storage.getPassport(), places, content: prepareContent(passportRaw, config) });
  const game = evaluateExplore({
    places, savedIds: storage.getSavedIds(), myPlan: storage.getMyPlan(), passportResult: p,
    explore: storage.getExplore(), expenses: storage.getExpenses(), activity: storage.getActivity(),
    chapters: exploreRaw.chapters, lessons: exploreRaw.lessons,
  });
  const next = game.chapters.flatMap((c) => c.nodes).find((n) => !n.done);
  const trip = storage.getTrip();

  container.replaceChildren();
  const page = el(container, "div", "quest-home");
  const hud = el(page, "div", "quest-hud");
  const island = el(hud, "div", "quest-hud__island");
  el(island, "span", "quest-hud__emoji", "🏝️");
  el(island, "span", "quest-hud__name", "ОТКРОЙ ХАЙНАНЬ");
  const points = el(hud, "div", "quest-hud__values");
  const xp = el(points, "span", "quest-hud__xp", "⭐ " + game.xp + " XP");
  xp.setAttribute("aria-label", "Опыт " + game.xp);
  el(points, "span", "quest-hud__visited", "🏅 " + p.reward.visited);


  const intro = el(page, "section", "quest-intro");
  const daily = el(intro, "p", "quest-intro__daily", "🎁 +3 XP за первый запуск приложения каждый день · без серий и штрафов");
  daily.setAttribute("aria-label", "Три очка опыта за каждый уникальный день использования");
  const eyebrow = el(intro, "div", "quest-intro__eyebrow", "ТВОЯ ИСТОРИЯ НА ОСТРОВЕ");
  eyebrow.setAttribute("role", "heading"); eyebrow.setAttribute("aria-level", "3");
  el(intro, "h2", "quest-intro__title", "Готов к открытиям?");
  el(intro, "p", "quest-intro__copy", "Исследуй красивые места, находи секреты и собирай собственную карту Хайнаня.");
  const subtitle = el(intro, "a", "quest-intro__travel", travelCaption(trip));
  subtitle.href = trip.start && trip.end ? "#/me" : "#/settings";
  const stats = el(intro, "div", "quest-intro__stats");
  el(stats, "strong", "", "Уровень " + game.level.level);
  const bar = el(stats, "div", "quest-intro__progress");
  bar.setAttribute("role", "progressbar");
  bar.setAttribute("aria-label", "Опыт на текущем уровне");
  bar.setAttribute("aria-valuemin", "0");
  bar.setAttribute("aria-valuemax", "100");
  bar.setAttribute("aria-valuenow", String(game.level.current));
  el(bar, "span", "").style.width = game.level.current + "%";
  el(stats, "span", "", game.level.toNext + " XP до следующего");

  // Короткий быстрый доступ без конкуренции с главной игровой дорожкой.
  const quick = el(page, "div", "quest-quick");
  [
    ["☀️", "Сегодня", "#/now"],
    ["🍜", "Поесть", "#/places?mode=food&near=1"],
    ["💰", "Расходы", "#/expenses"],
  ].forEach(([icon, label, href]) => {
    const a = el(quick, "a", "quest-quick__item");
    a.href = href;
    el(a, "span", "", icon);
    el(a, "span", "", label);
  });

  const title = el(page, "div", "quest-section-title");
  el(title, "h2", "", "Твой путь");
  el(title, "span", "", game.completedTasks + " из " + game.totalTasks + " открытий");

  if (next) {
    const current = el(page, "a", "quest-current");
    current.href = next.href;
    const flag = el(current, "span", "quest-current__flag", "⚡");
    flag.setAttribute("aria-hidden", "true");
    const body = el(current, "span", "quest-current__body");
    el(body, "strong", "", "СЛЕДУЮЩЕЕ ПРИКЛЮЧЕНИЕ");
    el(body, "span", "", next.title);
    el(current, "span", "quest-current__arrow", "›");
  }

  const worlds = el(page, "div", "quest-worlds");
  game.chapters.forEach((chapter, i) => drawChapter(worlds, chapter, i, next?.id));

  const end = el(page, "div", "quest-home__footer");
  el(end, "div", "quest-home__mascot", "🦀");
  el(end, "p", "", "Остров становится ярче с каждым открытием!");
  const map = el(end, "a", "quest-home__map-link", "🎨 Раскрасить карту ›");
  map.href = "#/passport";
}
