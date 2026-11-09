// Island Quest v23: главный экран — путь открытий вместо старой ленты «Сейчас».
// Данные мест и игровой прогресс читаем из существующих источников.
// Штампы — вручную; настоящая навигация и экстренная помощь доступны отдельно.
import { loadConfig, loadExplore, loadPassport, loadPlaces, loadChecklist, loadErrorMessage } from "../data.js";
import { storage } from "../storage.js";
import { prepareContent, evaluatePassport } from "../logic/passport.js";
import { evaluateExplore, getLevel } from "../logic/explore.js";
import { getTripState, getTodayIso, TRIP_STATE, pluralizeRu } from "../logic/trip.js";
import { summarizePreflight } from "../logic/prep-focus.js";
import { rankForXp } from "../logic/ranks.js";
import { travelActions } from "../logic/travel-hub.js";

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

// До вылета показываем реальные задачи подготовки раньше игрового пути.
// Пункты можно отмечать прямо с главной; статус общий с #/prepare.
function renderPreflight(parent, checklist, trip, initialXp) {
  const state = getTripState(trip, getTodayIso());
  if (state.state !== TRIP_STATE.BEFORE && state.state !== TRIP_STATE.NO_DATES) return;
  const days = state.state === TRIP_STATE.BEFORE ? state.daysUntil : null;
  const info = summarizePreflight(checklist, storage.getChecklistState(), days);
  const card = el(parent, "section", "quest-preflight");
  const top = el(card, "div", "quest-preflight__top");
  el(top, "span", "quest-preflight__eyebrow", "🧳 ПОДГОТОВКА К ПУТЕШЕСТВИЮ");
  el(card, "h2", "quest-preflight__title", days === null ? "Сначала подготовимся!" :
    "До вылета " + days + " " + pluralizeRu(days, ["день", "дня", "дней"]));
  el(card, "p", "quest-preflight__subtitle", "Проверь документы, собери вещи и отметь готовое. За каждый выполненный пункт — +4 XP.");
  const row = el(card, "div", "quest-preflight__meter");
  const progress = el(row, "strong", "", "Готово " + info.done + " из " + info.total);
  const pending = el(row, "span", "", info.remaining + " осталось");
  const track = el(card, "div", "quest-preflight__bar");
  track.setAttribute("role", "progressbar");
  track.setAttribute("aria-label", "Подготовка до вылета");
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", String(info.total));
  track.setAttribute("aria-valuenow", String(info.done));
  const fill = el(track, "span", "");
  fill.style.width = (info.total ? Math.round(100 * info.done / info.total) : 0) + "%";
  if (info.remaining) {
    el(card, "h3", "quest-preflight__tasks-title", days !== null && days <= 3 ? "Важно сделать сейчас" : "Что сделать дальше");
    const tasks = el(card, "div", "quest-preflight__tasks");
    info.tasks.forEach((task) => {
      const label = el(tasks, "label", "quest-preflight__task");
      const input = el(label, "input", "");
      input.type = "checkbox";
      input.checked = Boolean(storage.getChecklistState()[task.id]);
      input.dataset.taskId = task.id;
      el(label, "span", "quest-preflight__task-check", "✓").setAttribute("aria-hidden", "true");
      const body = el(label, "span", "quest-preflight__task-body");
      el(body, "strong", "", task.title);
      el(body, "small", "", task.phase === "packing" ? "🧳 Чемодан" :
        task.topic === "documents" ? "📄 Документы" : task.critical ? "⚠️ Важно" : "✓ Подготовка");
      input.addEventListener("change", () => {
        if (!storage.setChecklistItemDone(task.id, input.checked)) {
          input.checked = !input.checked;
          const message = el(card, "p", "quest-preflight__error", "Не удалось сохранить отметку.");
          message.setAttribute("role", "status");
          return;
        }
        label.classList.toggle("is-done", input.checked);
        const changed = summarizePreflight(checklist, storage.getChecklistState(), days);
        progress.textContent = "Готово " + changed.done + " из " + changed.total;
        pending.textContent = changed.remaining + " осталось";
        track.setAttribute("aria-valuenow", String(changed.done));
        fill.style.width = Math.round(100 * changed.done / changed.total) + "%";
        // XP на главной обновляется сразу, без лишнего перехода.
        const newXp = initialXp + (changed.done - info.done) * 4;
        const hud = parent.querySelector(".quest-hud__xp");
        if (hud) hud.textContent = "⭐ " + newXp + " XP";
        const level = getLevel(newXp);
        const levelTitle = parent.querySelector(".quest-intro__stats strong");
        const levelBar = parent.querySelector(".quest-intro__progress");
        const levelNext = parent.querySelector(".quest-intro__stats > span:last-child");
        if (levelTitle) levelTitle.textContent = "Уровень " + level.level;
        if (levelBar) { levelBar.setAttribute("aria-valuenow", String(level.current)); levelBar.firstElementChild.style.width = level.current + "%"; }
        if (levelNext) levelNext.textContent = level.toNext + " XP до следующего";
      });
    });
  } else {
    el(card, "p", "quest-preflight__complete", "🎉 Всё готово к вылету! Можно переходить к приключениям.");
  }
  const actions = el(card, "div", "quest-preflight__actions");
  const all = el(actions, "a", "quest-preflight__primary", "Открыть весь чек-лист →");
  all.href = "#/prepare";
  if (days === null) {
    const dates = el(actions, "a", "quest-preflight__secondary", "✈️ Указать даты поездки");
    dates.href = "#/settings";
  } else {
    const docs = el(actions, "a", "quest-preflight__secondary", "📄 Документы и вещи");
    docs.href = "#/prepare";
  }
}

function renderTravelHub(parent,trip){
 const today=getTodayIso(),state=getTripState(trip,today);
 const day=storage.getMyPlan()?.days?.[today];
 const plannedToday=Boolean(day&&(day.placeIds?.length||day.excursionIds?.length));
 const data=travelActions(state,{today,plannedToday,hasHotel:Boolean(trip.home?.addressZh)});
 const card=el(parent,"section","travel-hub");
 el(card,"span","travel-hub__kicker",data.kicker);
 el(card,"h2","travel-hub__title",data.title);
 el(card,"p","travel-hub__subtitle",data.subtitle);
 const primary=el(card,"a","travel-hub__primary",data.primary.icon+" "+data.primary.label+" ›");
 primary.href=data.primary.href;
 const grid=el(card,"div","travel-hub__actions");
 for(const action of data.actions){
  const link=el(grid,"a","travel-hub__action");
  link.href=action.href;
  el(link,"span","travel-hub__icon",action.icon);
  el(link,"span","",action.label);
 }
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
  banner.style.backgroundImage = "linear-gradient(90deg,rgba(5,22,41,.62),rgba(5,22,41,.04)),url('assets/photos/" +
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
  let places, config, passportRaw, exploreRaw, checklist;
  try {
    [places, config, passportRaw, exploreRaw, checklist] = await Promise.all([
      loadPlaces(), loadConfig(), loadPassport(), loadExplore(), loadChecklist(),
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
    checklist, checklistState: storage.getChecklistState(),
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
  const rank = rankForXp(game.xp);
  const rankLink = el(page, "a", "quest-home-rank", rank.icon + " " + rank.title + " · " + (rank.next ? rank.remaining + " XP до следующей награды" : "Все награды открыты") + " ›");
  rankLink.href = "#/me";


  renderPreflight(page, checklist, trip, game.xp);
  renderTravelHub(page,trip);

  const intro = el(page, "section", "quest-intro");
  const daily = el(intro, "p", "quest-intro__daily", "🎁 +3 XP за первый запуск приложения каждый день · без серий и штрафов");
  daily.setAttribute("aria-label", "Три очка опыта за каждый уникальный день использования");
  const eyebrow = el(intro, "div", "quest-intro__eyebrow", "ТВОЯ ИСТОРИЯ НА ОСТРОВЕ");
  eyebrow.setAttribute("role", "heading"); eyebrow.setAttribute("aria-level", "3");
  el(intro, "h2", "quest-intro__title", getTripState(trip, getTodayIso()).state === TRIP_STATE.BEFORE ? "Приключение уже близко!" : "Готов к открытиям?");
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
