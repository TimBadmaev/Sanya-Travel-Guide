// Профиль исследователя и доступ ко всем полезным функциям прошлого продукта.
// Отдельного аккаунта нет: всё хранится на устройстве и входит в копию.
import { loadConfig, loadExplore, loadPassport, loadPlaces } from "../data.js";
import { storage } from "../storage.js";
import { prepareContent, evaluatePassport } from "../logic/passport.js";
import { evaluateExplore } from "../logic/explore.js";
import { getTripState, getTodayIso, TRIP_STATE } from "../logic/trip.js";
function el(parent, tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  parent.appendChild(node);
  return node;
}

function section(parent, title, items) {
  const wrap = el(parent, "section", "quest-me__section");
  el(wrap, "h3", "quest-me__section-title", title);
  const list = el(wrap, "div", "quest-me__links");
  items.forEach(([icon, label, description, href]) => {
    const link = el(list, "a", "quest-me__link");
    link.href = href;
    el(link, "span", "quest-me__link-icon", icon);
    const body = el(link, "span", "quest-me__link-body");
    el(body, "strong", "", label);
    el(body, "small", "", description);
    el(link, "span", "quest-me__chevron", "›");
  });
}

export async function renderMe(container, ctx) {
  container.innerHTML = '<p class="loading">Собираем твои достижения…</p>';
  let places, config, passportRaw, exploreRaw;
  try {
    [places, config, passportRaw, exploreRaw] = await Promise.all([loadPlaces(), loadConfig(), loadPassport(), loadExplore()]);
  } catch (err) {
    if (!ctx.isCurrent()) return;
    container.replaceChildren();
    el(container, "p", "error-state", "Не удалось загрузить профиль. Проверьте офлайн-копию.");
    const retry = el(container, "button", "btn btn--primary", "Повторить");
    retry.addEventListener("click", () => renderMe(container, ctx));
    return;
  }
  if (!ctx.isCurrent()) return;
  const trip = storage.getTrip();
  const status = getTripState(trip, getTodayIso());
  const passport = evaluatePassport({ state: storage.getPassport(), places, content: prepareContent(passportRaw, config) });
  const game = evaluateExplore({ places, savedIds: storage.getSavedIds(), myPlan: storage.getMyPlan(), passportResult: passport,
    explore: storage.getExplore(), expenses: storage.getExpenses(), activity: storage.getActivity(), chapters: exploreRaw.chapters, lessons: exploreRaw.lessons });

  container.replaceChildren();
  const page = el(container, "div", "quest-me");
  const hero = el(page, "section", "quest-me__hero");
  el(hero, "div", "quest-me__avatar", "🌴");
  el(hero, "p", "quest-me__kicker", "ПАСПОРТ ПУТЕШЕСТВЕННИКА");
  el(hero, "h2", "", "Мой остров");
  el(hero, "p", "quest-me__subtitle", "Каждая прогулка — новая история.");
  const stats = el(hero, "div", "quest-me__stats");
  [["⭐", game.xp + " XP", "Опыт"], ["🏅", String(passport.reward.visited), "Открыто мест"],
    ["🎨", passport.coastPartsVisited + "/7", "Части карты"]].forEach(([icon, value, label]) => {
    const stat = el(stats, "div", "quest-me__stat");
    el(stat, "span", "", icon);
    el(stat, "strong", "", value);
    el(stat, "small", "", label);
  });
  const tripCard = el(page, "section", "quest-me__trip");
  el(tripCard, "span", "quest-me__trip-icon", "✈️");
  const tripBody = el(tripCard, "div", "quest-me__trip-body");
  el(tripBody, "strong", "", "Моя поездка");
  const area = config.areas.find((a) => a.id === trip.area);
  const dateLabel = trip.start && trip.end ? trip.start.split("-").reverse().slice(0,2).join(".") + " – " +
    trip.end.split("-").reverse().slice(0,2).join(".") : "Даты ещё не указаны";
  el(tripBody, "span", "", dateLabel + (area ? " · " + area.name : ""));
  const edit = el(tripCard, "a", "quest-me__trip-edit", "Изменить ›");
  edit.href = "#/settings";

  section(page, "Мои открытия", [
    ["🗺️", "Живая карта", "Посещённые точки становятся цветными", "#/passport"],
    ["🏵️", "Альбом наград", "Наклейки и достижения", "#/passport/album"],
    ["📸", "История путешествия", "Воспоминания и заметки", "#/passport/journey"],
  ]);
  section(page, "Всё для поездки", [
    ["🗓️", "Мой план", "Распланировать дни и прогулки", "#/plan"],
    ["💰", "Расходы", "Бюджет и журнал трат", "#/expenses"],
    ["🎟️", "Экскурсии", "Выезды и готовые идеи", "#/excursions"],
    ["🧳", "Подготовка", "Документы и чемодан", "#/prepare"],
    ["🆘", "Под рукой", "Экстренные номера и адрес для таксиста", "#/handy"],
    ["📚", "Справочник", "Транспорт, связь, оплата и фразы", "#/info"],
    ["⚙️", "Настройки поездки", "Район, даты и отель", "#/settings"],
    ["💾", "Сохранить данные", "Резервная копия и восстановление", "#/data"],
  ]);
  el(page, "p", "quest-me__privacy", "🔒 Без регистрации. Данные хранятся только на этом устройстве.");

  const danger = el(page, "section", "quest-reset");
  el(danger, "h3", "quest-reset__title", "🔁 Начать заново");
  el(danger, "p", "quest-reset__description",
    "Тестировал приложение? Можно удалить свой прогресс и снова пройти приветствие. База мест, фото и экскурсии останется.");
  const backup = el(danger, "a", "quest-reset__backup", "💾 Сначала сохранить резервную копию");
  backup.href = "#/data";
  const trigger = el(danger, "button", "quest-reset__trigger", "Сбросить прогресс");
  trigger.type = "button";
  const panel = el(danger, "div", "quest-reset__confirm");
  panel.hidden = true;
  el(panel, "strong", "", "Точно начать с нуля?");
  el(panel, "p", "", "Безвозвратно удалятся даты и адрес поездки, отметки чек-листа, посещения, заметки, избранное, план, расходы, бюджет, XP и пройденные уроки. Вернуть их можно только из заранее сохранённой копии.");
  const label = el(panel, "label", "quest-reset__ack");
  const acknowledge = el(label, "input", "");
  acknowledge.type = "checkbox";
  el(label, "span", "", "Я понимаю, что мои данные будут удалены.");
  const actions = el(panel, "div", "quest-reset__actions");
  const cancel = el(actions, "button", "quest-reset__cancel", "Отмена");
  cancel.type = "button";
  const confirm = el(actions, "button", "quest-reset__delete", "Да, удалить всё");
  confirm.type = "button";
  confirm.disabled = true;
  const statusText = el(panel, "p", "quest-reset__status");
  statusText.setAttribute("role", "status");
  trigger.addEventListener("click", () => {
    panel.hidden = false;
    trigger.hidden = true;
    acknowledge.checked = false;
    confirm.disabled = true;
    cancel.focus();
  });
  acknowledge.addEventListener("change", () => { confirm.disabled = !acknowledge.checked; });
  cancel.addEventListener("click", () => {
    panel.hidden = true;
    trigger.hidden = false;
    statusText.textContent = "";
    trigger.focus();
  });
  confirm.addEventListener("click", () => {
    if (!acknowledge.checked || !storage.isAvailable()) {
      statusText.textContent = "Сброс не выполнен: подтвердите удаление и проверьте память браузера.";
      return;
    }
    if (!storage.resetAllUserData()) {
      statusText.textContent = "Не удалось очистить данные. Ваш прогресс сохранён; попробуйте позже.";
      return;
    }
    window.location.replace("#/welcome");
  });
}
