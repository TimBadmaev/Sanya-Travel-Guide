// Новый первый запуск: три коротких шага, никакой регистрации и сервера.
// Прежний stg:trip сохраняет прежний формат: база и копии полностью совместимы.
import { loadConfig, loadErrorMessage } from "../data.js";
import { storage } from "../storage.js";

function el(parent, tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  parent.appendChild(node);
  return node;
}

export async function renderWelcome(container, ctx) {
  container.innerHTML = '<p class="loading">Готовим приключение…</p>';
  let config;
  try {
    config = await loadConfig();
  } catch (err) {
    if (!ctx.isCurrent()) return;
    container.textContent = loadErrorMessage(err);
    const retry = el(container, "button", "btn btn--primary", "Повторить");
    retry.addEventListener("click", () => renderWelcome(container, ctx));
    return;
  }
  if (!ctx.isCurrent()) return;
  const trip = storage.getTrip();
  const data = { start: trip.start || "", end: trip.end || "", area: trip.area || "" };
  let step = 0;

  function finish(skip = false) {
    if (!storage.isAvailable()) {
      const notice = document.querySelector(".welcome__error");
      if (notice) notice.textContent = "Память браузера недоступна. Откройте приложение в обычном режиме, чтобы сохранить поездку.";
      return;
    }
    // При смене района старая точка отеля не должна оставаться в чужом районе.
    const area = skip ? trip.area : (data.area || null);
    const success = storage.setTrip({
      ...trip, start: skip ? trip.start : (data.start || null),
      end: skip ? trip.end : (data.end || null),
      area,
      stay: area === trip.area ? trip.stay : null,
      home: area === trip.area ? trip.home : null,
    });
    if (!success) {
      const notice = document.querySelector(".welcome__error");
      if (notice) notice.textContent = "Не удалось сохранить. Проверьте доступ к памяти браузера.";
      return;
    }
    window.location.replace("#/");
  }

  function next() {
    if (step === 1 && ((Boolean(data.start) !== Boolean(data.end)) || (data.start && data.end && data.start > data.end))) {
      const error = document.querySelector(".welcome__error");
      if (error) error.textContent = "Укажите обе даты в правильном порядке или оставьте обе пустыми.";
      return;
    }
    step += 1;
    draw();
  }

  function draw() {
    container.replaceChildren();
    const page = el(container, "div", "welcome");
    const progress = el(page, "div", "welcome__progress");
    const stepText = el(progress, "span", "", "ШАГ " + (step + 1) + " ИЗ 3");
    stepText.setAttribute("aria-label", "Шаг " + (step + 1) + " из трёх");
    const progressBar = el(progress, "div", "welcome__progress-bar");
    el(progressBar, "span", "").style.width = ((step + 1) / 3 * 100) + "%";

    const panel = el(page, "div", "welcome__panel");
    if (step === 0) {
      const image = el(panel, "div", "welcome__cover");
      image.setAttribute("role", "img");
      image.setAttribute("aria-label", "Пляж Ялонг Бэй на острове Хайнань");
      el(image, "span", "welcome__stamp", "🌴 ПУТЕШЕСТВИЕ НАЧИНАЕТСЯ");
      el(panel, "div", "welcome__mascot", "🦀");
      el(panel, "p", "welcome__kicker", "ТВОЙ ОСТРОВ. ТВОЯ ИСТОРИЯ.");
      el(panel, "h2", "welcome__title", "Хайнань ждёт тебя!");
      el(panel, "p", "welcome__lead", "Исследуй пляжи, находи необычные места, узнавай истории острова и раскрашивай свою карту открытий.");
      const reasons = el(panel, "div", "welcome__benefits");
      ["🗺️ Открывай места", "⭐ Выполняй задания", "🏝️ Собирай воспоминания"].forEach((name) => el(reasons, "span", "", name));
      const joke=el(panel,"button","welcome__joke-button","🦀 Услышать совет краба");
      joke.type="button";
      const punchline=el(panel,"p","welcome__joke","У меня для тебя 10 идей отдыха. Ни одна не требует сидеть в офисе.");
      const lines=[
       "Если тебя спросили, зачем ты на Хайнане, отвечай: научное исследование кокосов.",
       "Главное правило отпуска: в рюкзаке должна быть вода, а в расписании — место для ничего.",
       "Островных открытий много. Но начать можно с завтрака без будильника.",
       "Краб напоминает: лучший маршрут иногда ведёт к морю и обратно."
      ];
      let jokeIndex=0;
      joke.addEventListener("click",()=>{
       punchline.textContent=lines[jokeIndex++%lines.length];
      });
    } else if (step === 1) {
      el(panel, "div", "welcome__symbol", "✈️");
      el(panel, "p", "welcome__kicker", "ПЛАН ТВОЕГО ПРИКЛЮЧЕНИЯ");
      el(panel, "h2", "welcome__title", "Когда летим?");
      el(panel, "p", "welcome__lead", "Даты помогут показывать актуальные подсказки и отсчитывать дни путешествия. Можно добавить их позже.");
      const grid = el(panel, "div", "welcome__date-fields");
      [
        ["start", "Дата начала"],
        ["end", "Дата окончания"],
      ].forEach(([key, label]) => {
        const wrap = el(grid, "label", "welcome__field");
        el(wrap, "span", "", label);
        const input = el(wrap, "input", "welcome__date");
        input.type = "date";
        input.value = data[key];
        input.addEventListener("change", () => { data[key] = input.value; });
      });
      el(panel, "p", "welcome__hint", "💡 Ничего страшного, если даты ещё неизвестны.");
    } else {
      el(panel, "div", "welcome__symbol", "📍");
      el(panel, "p", "welcome__kicker", "ТВОЯ ТОЧКА ОТСЧЁТА");
      el(panel, "h2", "welcome__title", "Где остановишься?");
      el(panel, "p", "welcome__lead", "Выбери район, чтобы быстрее находить интересные места рядом. Это можно изменить в любой момент.");
      const areas = el(panel, "div", "welcome__areas");
      const choices = [{ id: "", name: "Пока не знаю", emoji: "🧭" },
        ...config.areas.map((a) => ({ ...a, emoji: ({
          yalong: "🏖️", dadonghai: "🌊", "sanya-bay": "🌴", haitang: "🐚", city: "🏙️", other: "🗺️",
        })[a.id] || "📍" }))];
      choices.forEach((a) => {
        const label = el(areas, "label", "welcome__area");
        const radio = el(label, "input", "");
        radio.type = "radio";
        radio.name = "welcome-area";
        radio.value = a.id;
        radio.checked = data.area === a.id;
        radio.addEventListener("change", () => { data.area = a.id; });
        el(label, "span", "welcome__area-emoji", a.emoji);
        el(label, "span", "welcome__area-name", a.name);
        el(label, "span", "welcome__area-check", "✓");
      });
    }

    const error = el(page, "p", "welcome__error");
    error.setAttribute("role", "status");
    const actions = el(page, "div", "welcome__actions");
    const primary = el(actions, "button", "welcome__primary",
      step === 0 ? "НАЧАТЬ ПРИКЛЮЧЕНИЕ" : step === 1 ? "ПРОДОЛЖИТЬ" : "ОТКРЫТЬ МОЙ ОСТРОВ");
    primary.type = "button";
    primary.addEventListener("click", () => step === 2 ? finish() : next());

    const secondary = el(actions, "button", "welcome__secondary", step === 0 ? "Посмотреть без настройки" : "Назад");
    secondary.type = "button";
    secondary.addEventListener("click", () => { if (step === 0) finish(true); else { step--; draw(); } });
  }
  draw();
}
