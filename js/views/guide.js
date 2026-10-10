import { storage } from "../storage.js";
import { guideProgress } from "../logic/guide.js";
import { evaluatePassport, prepareContent, visitJourney } from "../logic/passport.js";
import { getOfflineStatus, offlineState } from "../pwa.js";

// Блок «Начните своё путешествие» на экране «Сейчас»: линия-путь из пяти
// остановок, каждая — ссылка на существующий экран. Что считать пройденным,
// решает js/logic/guide.js по данным приложения; здесь — только рисунок и
// «свернуть / развернуть». Своих экранов, модальных окон и обязательных шагов
// у блока нет.

const TITLE = "Начните своё путешествие";
const INTRO = "Пять остановок, чтобы освоиться с путеводителем. Порядок и темп — любые: остановки отмечаются сами, по вашим действиям.";
const INTRO_DONE = "Все пять остановок пройдены. Дальше путь пишется в паспорте — с каждой новой отметкой.";

// Выбор «свернуть / развернуть», когда хранилище недоступно, — до перезагрузки.
let sessionCollapsed = null;

function appendText(parent, tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.textContent = text;
  parent.appendChild(el);
  return el;
}

function stateLabel(step, isCurrent) {
  if (step.done) return "Пройдено";
  return isCurrent ? "Следующая остановка" : "Впереди";
}

// passportRaw — содержимое data/passport.json или null (файл не загрузился:
// шаг с наклейкой тогда просто не считается пройденным).
export function renderGuide(container, { places, config, passportRaw }) {
  const section = document.createElement("section");
  section.className = "guide";
  section.setAttribute("aria-labelledby", "guide-title");

  const heading = document.createElement("h3");
  heading.className = "guide__heading";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "guide__toggle";
  toggle.setAttribute("aria-controls", "guide-body");
  appendText(toggle, "span", "guide__icon", "🧭").setAttribute("aria-hidden", "true");
  appendText(toggle, "span", "guide__title", TITLE).id = "guide-title";
  const count = appendText(toggle, "span", "guide__count", "");
  appendText(toggle, "span", "guide__chevron", "⌄").setAttribute("aria-hidden", "true");
  heading.appendChild(toggle);
  section.appendChild(heading);

  const body = document.createElement("div");
  body.className = "guide__body";
  body.id = "guide-body";
  const intro = appendText(body, "p", "guide__intro", INTRO);
  const path = document.createElement("ol");
  path.className = "guide__path";
  body.appendChild(path);
  section.appendChild(body);
  container.appendChild(section);

  // null — проверка офлайн-копии ещё идёт.
  let offline = null;
  let progress = null;

  function compute() {
    const state = storage.getPassport();
    const journey = visitJourney(state, places);
    let stickersEarned = null;
    if (passportRaw && config) {
      const { stickerCounts } = evaluatePassport({ state, places, content: prepareContent(passportRaw, config) });
      stickersEarned = stickerCounts.earned + stickerCounts.optionalEarned;
    }
    return guideProgress({ offline, places, savedIds: storage.getSavedIds(), myPlan: storage.getMyPlan(), journey, stickersEarned });
  }

  function setCollapsed(collapsed) {
    section.dataset.collapsed = String(collapsed);
    toggle.setAttribute("aria-expanded", String(!collapsed));
    body.hidden = collapsed;
  }

  function draw() {
    progress = compute();
    count.textContent = `${progress.done} из ${progress.total}`;
    intro.textContent = progress.done === progress.total ? INTRO_DONE : INTRO;
    path.innerHTML = "";
    progress.steps.forEach((step, index) => {
      const isCurrent = step.id === progress.currentId;
      const item = document.createElement("li");
      item.className = `guide-step guide-step--${step.done ? "done" : isCurrent ? "current" : "ahead"}`;
      item.dataset.step = step.id;
      item.dataset.done = String(step.done);
      const link = document.createElement("a");
      link.className = "guide-step__link";
      link.href = step.href;
      appendText(link, "span", "guide-step__node", step.done ? "✓" : String(index + 1)).setAttribute("aria-hidden", "true");
      const text = document.createElement("span");
      text.className = "guide-step__body";
      const title = appendText(text, "span", "guide-step__title", "");
      appendText(title, "span", "guide-step__icon", step.icon).setAttribute("aria-hidden", "true");
      title.append(` ${step.title}`);
      // Чтобы блок оставался компактным: у пройденной остановки — что видно
      // в данных, у следующей — что сделать и что видно, у дальних — только
      // название (пояснение и состояние — скрытым текстом для экранного
      // диктора; на экране они появятся, когда остановка станет следующей).
      if (isCurrent) appendText(text, "span", "guide-step__text", step.text);
      if (step.done || isCurrent) {
        const state = appendText(text, "span", "guide-step__state", "");
        appendText(state, "strong", "guide-step__badge", stateLabel(step, isCurrent));
        state.append(` · ${step.note}`);
      } else {
        appendText(text, "span", "visually-hidden", ` ${stateLabel(step, isCurrent)}. ${step.text}`);
      }
      link.appendChild(text);
      appendText(link, "span", "guide-step__chevron", "›").setAttribute("aria-hidden", "true");
      item.appendChild(link);
      path.appendChild(item);
    });
  }

  draw();
  // Пока пользователь сам не выбрал — блок развёрнут; свёрнут в одну строку,
  // если все остановки, кроме офлайн-копии, уже пройдены. Офлайн-статус
  // приходит позже и на вид блока не влияет: он не складывается под пальцем.
  const chosen = storage.isAvailable() ? storage.getGuideCollapsed() : sessionCollapsed;
  const mastered = progress.steps.every((step) => step.done || step.id === "prepare");
  setCollapsed(chosen === null ? mastered : chosen);

  toggle.addEventListener("click", () => {
    const collapsed = section.dataset.collapsed !== "true";
    sessionCollapsed = collapsed;
    storage.setGuideCollapsed(collapsed);
    setCollapsed(collapsed);
  });

  // Статус офлайн-копии отвечает воркер — асинхронно. При первом открытии
  // воркер берёт страницу под контроль чуть позже: тогда проверяем ещё раз.
  const check = () =>
    getOfflineStatus().then((status) => {
      if (!section.isConnected) return;
      offline = offlineState(status);
      draw();
    });
  check();
  if ("serviceWorker" in navigator && !navigator.serviceWorker.controller) {
    navigator.serviceWorker.addEventListener("controllerchange", check, { once: true });
  }

  return section;
}
