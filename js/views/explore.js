// «Открой Хайнань»: необязательная игра поверх уже существующих мест.
// Ни один шаг не блокирует туристические функции; без сети работает из PRECACHE.
import { loadConfig, loadExplore, loadPassport, loadPlaces, loadErrorMessage } from "../data.js";
import { storage } from "../storage.js";
import { evaluatePassport, prepareContent } from "../logic/passport.js";
import { evaluateExplore } from "../logic/explore.js";
import { appendBackLink, renderPlanError } from "./plan.js";

function element(parent, tag, cls, text) {
  const item = document.createElement(tag);
  if (cls) item.className = cls;
  if (text !== undefined) item.textContent = text;
  parent.appendChild(item);
  return item;
}

async function gameData(container, ctx, retry) {
  container.innerHTML = '<p class="loading">Открываем остров…</p>';
  try {
    const [places, config, passport, explore] = await Promise.all([
      loadPlaces(), loadConfig(), loadPassport(), loadExplore(),
    ]);
    if (!ctx.isCurrent()) return null;
    const content = prepareContent(passport, config);
    const result = evaluatePassport({ state: storage.getPassport(), places, content });
    const game = evaluateExplore({
      places, savedIds: storage.getSavedIds(), myPlan: storage.getMyPlan(),
      passportResult: result, explore: storage.getExplore(), expenses: storage.getExpenses(),
      chapters: explore.chapters, lessons: explore.lessons,
    });
    return { places, config, content, result, game, explore };
  } catch (err) {
    console.error(err);
    if (ctx.isCurrent()) renderPlanError(container, "Открой Хайнань", loadErrorMessage(err), retry);
    return null;
  }
}

function navRow(parent, active) {
  const nav = element(parent, "nav", "explore-tabs");
  nav.setAttribute("aria-label", "Разделы исследования острова");
  [
    ["🧭 Путь", "#/explore", "path"],
    ["🗺️ Карта", "#/passport", "map"],
    ["🏷️ Альбом", "#/passport/album", "album"],
  ].forEach(([label, href, id]) => {
    const a = element(nav, "a", "explore-tabs__link" + (active === id ? " is-active" : ""), label);
    a.href = href;
    if (active === id) a.setAttribute("aria-current", "page");
  });
}

function chapterNode(parent, node, index) {
  const item = element(parent, "li", "explore-node" + (node.done ? " is-done" : "") + (index % 2 ? " explore-node--right" : ""));
  const link = element(item, "a", "explore-node__link");
  link.href = node.href;
  link.setAttribute("aria-label", node.title + ": " + (node.done ? "выполнено" : node.progress + " из " + node.goal));
  const marker = element(link, "span", "explore-node__marker");
  marker.style.setProperty("--explore-progress", Math.round(100 * node.progress / node.goal) + "%");
  element(marker, "span", "explore-node__glyph", node.done ? "✓" : node.kind === "lesson" ? "📖" : node.kind === "notes" ? "📝" : node.kind === "category" ? "🌟" : "📍");
  element(link, "span", "explore-node__title", node.title);
  element(link, "span", "explore-node__state", node.done ? "Пройдено" : node.progress ? node.progress + " из " + node.goal : node.kind === "lesson" ? "Мини-урок" : "Начать");
  element(item, "p", "explore-node__description", node.description);
}

export async function renderExplore(container, ctx) {
  const data = await gameData(container, ctx, () => renderExplore(container, ctx));
  if (!data) return;
  const { game } = data;
  container.innerHTML = "";
  const page = element(container, "div", "explore-page");
  appendBackLink(page, "← К главной", "#/", ctx);
  const hero = element(page, "section", "explore-hero");
  element(hero, "p", "explore-hero__eyebrow", "ТВОЁ ПРИКЛЮЧЕНИЕ");
  element(hero, "h2", "explore-hero__title", "Открой Хайнань");
  element(hero, "p", "explore-hero__subtitle", "Каждое открытие оживляет карту. Исследуй остров в своём темпе.");
  const stats = element(hero, "div", "explore-hero__stats");
  const xp = element(stats, "div", "explore-hero__stat");
  element(xp, "strong", "", game.xp + " XP");
  element(xp, "span", "", "опыт");
  const level = element(stats, "div", "explore-hero__stat");
  element(level, "strong", "", "Ур. " + game.level.level);
  element(level, "span", "", game.level.name);
  const done = element(stats, "div", "explore-hero__stat");
  element(done, "strong", "", game.completedTasks + "/" + game.totalTasks);
  element(done, "span", "", "заданий");
  const bar = element(hero, "div", "explore-hero__bar");
  bar.setAttribute("role", "progressbar");
  bar.setAttribute("aria-label", "Опыт до следующего уровня");
  bar.setAttribute("aria-valuemin", "0");
  bar.setAttribute("aria-valuemax", "100");
  bar.setAttribute("aria-valuenow", String(game.level.current));
  element(bar, "span", "explore-hero__bar-fill").style.width = game.level.current + "%";
  element(hero, "p", "explore-hero__next", "До следующего уровня — " + game.level.toNext + " XP");

  navRow(page, "path");
  const prompt = element(page, "div", "explore-message");
  element(prompt, "span", "explore-message__icon", "🌴");
  element(prompt, "p", "", "Выбирай любую главу. Баллы дают посещения, заметки, знания и ведение дневника — без штрафов за отдых.");

  const main = element(page, "div", "explore-chapters");
  game.chapters.forEach((chapter, chapterIndex) => {
    const section = element(main, "section", "explore-chapter explore-chapter--" + chapter.color);
    const head = element(section, "div", "explore-chapter__head");
    element(head, "div", "explore-chapter__icon", chapter.icon);
    const titleBox = element(head, "div", "explore-chapter__head-text");
    element(titleBox, "p", "explore-chapter__num", "ГЛАВА " + (chapterIndex + 1));
    element(titleBox, "h3", "explore-chapter__title", chapter.title);
    element(titleBox, "p", "explore-chapter__subtitle", chapter.subtitle);
    element(head, "span", "explore-chapter__count", chapter.done + "/" + chapter.total);
    const list = element(section, "ol", "explore-chapter__path");
    chapter.nodes.forEach((node, index) => chapterNode(list, node, index));
    if (chapter.finished) element(section, "p", "explore-chapter__complete", "🏆 Глава пройдена — новый шаг в твоей истории!");
  });

  const footer = element(page, "div", "explore-footer");
  const map = element(footer, "a", "explore-footer__link", "🗺️ Посмотреть живую карту ›");
  map.href = "#/passport";
  const memo = element(footer, "a", "explore-footer__link", "📒 Мои воспоминания ›");
  memo.href = "#/passport/journey";
  element(footer, "p", "explore-footer__note", "Штампы ставятся вручную. Карта декоративная, не для навигации. Покупки не дают игровые баллы.");
}

export async function renderExploreLesson(container, ctx) {
  const data = await gameData(container, ctx, () => renderExploreLesson(container, ctx));
  if (!data) return;
  const lesson = data.explore.lessons.find((l) => l.id === ctx.params.id);
  if (!lesson) {
    window.location.replace("#/explore");
    return;
  }
  container.innerHTML = "";
  const page = element(container, "div", "explore-page explore-lesson");
  appendBackLink(page, "← К приключениям", "#/explore", ctx);
  const card = element(page, "section", "explore-lesson__card");
  element(card, "p", "explore-lesson__kicker", "МИНИ-ОТКРЫТИЕ · +15 XP");
  element(card, "div", "explore-lesson__icon", lesson.icon);
  element(card, "h2", "explore-lesson__title", lesson.title);
  element(card, "p", "explore-lesson__intro", lesson.intro);
  const question = element(card, "div", "explore-lesson__question");
  element(question, "h3", "", lesson.question);
  const answers = element(question, "div", "explore-lesson__options");
  const feedback = element(question, "div", "explore-lesson__feedback");
  feedback.setAttribute("role", "status");
  const submit = element(question, "button", "btn btn--primary explore-lesson__submit", "Проверить");
  submit.type = "button";
  submit.disabled = true;
  let selected = null;
  let finished = data.game.completedLessons.has(lesson.id);
  const opts = [];
  lesson.options.forEach((option) => {
    const button = element(answers, "button", "explore-lesson__option", option.label);
    button.type = "button";
    button.addEventListener("click", () => {
      if (finished) return;
      selected = option.id;
      opts.forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
      submit.disabled = false;
    });
    button.setAttribute("aria-pressed", "false");
    opts.push(button);
  });
  const source = element(card, "p", "explore-lesson__source");
  source.append("Источник: ");
  const a = element(source, "a", "", lesson.source.label + " ↗");
  a.href = lesson.source.url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  const back = element(card, "a", "btn btn--secondary explore-lesson__back", "К главам");
  back.href = "#/explore";

  function showComplete(newlyEarned) {
    finished = true;
    opts.forEach((option, i) => {
      option.disabled = true;
      if (lesson.options[i].id === lesson.answer) option.classList.add("is-correct");
    });
    feedback.className = "explore-lesson__feedback is-success";
    feedback.textContent = (newlyEarned ? "🎉 Правильно! +15 XP. " : "✓ Урок уже пройден. ") + lesson.explanation;
    submit.hidden = true;
    back.classList.add("explore-lesson__back--prominent");
  }
  if (finished) showComplete(false);
  submit.addEventListener("click", () => {
    if (selected === lesson.answer) {
      if (!storage.isAvailable()) {
        feedback.className = "explore-lesson__feedback is-error";
        feedback.textContent = "Ответ правильный, но прогресс не сохраняется: память браузера недоступна.";
        return;
      }
      const saved = storage.completeExploreLesson(lesson.id, data.explore.lessons.map((l) => l.id));
      if (saved) showComplete(true);
      else {
        feedback.className = "explore-lesson__feedback is-error";
        feedback.textContent = "Правильно, но не удалось сохранить результат. Попробуйте снова.";
      }
    } else {
      feedback.className = "explore-lesson__feedback is-error";
      feedback.textContent = "Пока не угадали. Подумайте ещё — попытки не ограничены.";
      selected = null;
      submit.disabled = true;
      opts.forEach((option) => option.setAttribute("aria-pressed", "false"));
    }
  });
}
