import { loadConfig, loadPassport, loadPlaces, loadErrorMessage } from "../data.js";
import { storage } from "../storage.js";
import {
  NOTE_MAX_LENGTH,
  earnedStickerIds,
  evaluatePassport,
  getVisit,
  isRewardPlace,
  prepareContent,
} from "../logic/passport.js";
import { formatDayMonth, formatPeriod } from "../logic/plan.js";
import { getTodayIso, pluralizeRu, resolveOrigin } from "../logic/trip.js";
import { CATEGORY_ICONS, DEFAULT_ICON } from "./places.js";
import { appendBackLink, createConfirm, renderPlanError } from "./plan.js";

// «Паспорт исследователя», Passport v1 (EXPLORER-PASSPORT-SPEC.md): экран
// #/passport и блок «Паспорт» в карточке места. Отметка ставится вручную,
// без геолокации; награды и прогресс считает logic/passport.js по отметкам
// и актуальному каталогу. Декоративная схема побережья и альбом — следующий
// этап: здесь их нет и заглушек под них тоже нет.

const SAVE_FAILED_TEXT = "Не удалось сохранить: хранилище браузера недоступно или переполнено.";
const NO_STORAGE_TEXT = "Отметки не сохраняются: память браузера недоступна.";
const NEAREST_STICKERS = 2;
const KEEPSAKE_TEXT = "Покупки можно отмечать на память, но в прогресс и наклейки паспорта они не входят.";

// Оформление наклеек — по id (контент в data/passport.json, глиф — здесь).
const STICKER_GLYPHS = {
  "first-stamp": "🧭",
  "sea-explorer": "🌊",
  "island-horizon": "🏝️",
  "taste-of-hainan": "🏮",
  "sunset-catcher": "🌅",
  "above-the-bay": "🔭",
  "story-keeper": "📜",
  "green-island": "🌿",
  "local-life": "🚲",
  "island-pathfinder": "🧩",
  "west-to-east": "⛵",
  "seasoned-explorer": "🛂",
};

function appendText(parent, tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.textContent = text;
  parent.appendChild(el);
  return el;
}

// «Отмечено · 19 ноября 2026». Это дата отметки по часам телефона, а не
// подтверждённая дата посещения — так и подписано.
function markedLine(visit) {
  return `Отмечено · ${formatDayMonth(visit.date)} ${visit.date.slice(0, 4)}`;
}

function placeIcon(place) {
  return CATEGORY_ICONS[place.category] || DEFAULT_ICON;
}

function placeLink(place, className) {
  const link = document.createElement("a");
  link.href = `#/place/${place.id}`;
  link.className = className;
  link.textContent = place.name.ru;
  return link;
}

// ------------------------------------------------------------ #/passport

export async function renderPassport(container, ctx) {
  container.innerHTML = '<p class="loading">Загрузка паспорта…</p>';

  let places;
  let config;
  let raw;
  try {
    [places, config, raw] = await Promise.all([loadPlaces(), loadConfig(), loadPassport()]);
  } catch (e) {
    console.error(e);
    if (ctx.isCurrent()) {
      renderPlanError(container, "Паспорт исследователя", loadErrorMessage(e), () => {
        renderPassport(container, ctx);
      });
    }
    return;
  }
  if (!ctx.isCurrent()) return;

  const content = prepareContent(raw, config);
  if (content.problems.length) console.error(`data/passport.json: ${content.problems.join("; ")}`);
  const trip = storage.getTrip();
  const { point } = resolveOrigin(trip, config);
  const result = evaluatePassport({ state: storage.getPassport(), places, content, origin: point });

  container.innerHTML = "";
  const page = document.createElement("div");
  page.className = "passport";
  container.appendChild(page);

  // Паспорт открывается с Главной и из карточки места: «← Назад» ведёт туда,
  // откуда пришли (ctx.back, история не растёт).
  const fromPath = (ctx.from || "").replace(/^#/, "").split("?")[0];
  const parent = /^\/place\/[^/]+$/.test(fromPath) ? ctx.from : "#/";
  appendBackLink(page, "← Назад", parent, ctx);
  appendText(page, "h2", "view-title", "Паспорт исследователя");
  const period = trip.start && trip.end ? formatPeriod({ startDate: trip.start, endDate: trip.end }) : "";
  if (period) appendText(page, "p", "passport__period", `Санья · ${period}`);
  appendText(
    page,
    "p",
    "settings__intro",
    "Отмечайте места, где побывали, — паспорт соберёт ваши посещения, заметки и наклейки. Отметка ставится вручную в карточке места, без геолокации."
  );
  if (!storage.isAvailable()) appendText(page, "p", "area-notice", NO_STORAGE_TEXT);

  renderStats(page, result);
  renderVisits(page, result);
  renderStickers(page, result, config);
  renderCoastParts(page, result);

  const footer = document.createElement("section");
  footer.className = "settings-section";
  appendText(footer, "p", "settings__hint", "Отметки и заметки хранятся только на этом телефоне и входят в копию «Мои данные».");
  const backupLink = appendText(footer, "a", "home-link", "Сохранить копию ›");
  backupLink.href = "#/data";
  page.appendChild(footer);
}

function renderStats(page, result) {
  const list = document.createElement("ul");
  list.className = "passport-stats";
  const { reward, stickerCounts, coastParts, coastPartsVisited } = result;
  const stats = [
    [reward.visited, `из ${reward.total} ${pluralizeRu(reward.total, ["места", "мест", "мест"])}`],
    [stickerCounts.earned, `из ${stickerCounts.total} ${pluralizeRu(stickerCounts.total, ["наклейки", "наклеек", "наклеек"])}`],
    [coastPartsVisited, `из ${coastParts.length} ${pluralizeRu(coastParts.length, ["части побережья", "частей побережья", "частей побережья"])}`],
  ];
  stats.forEach(([value, label]) => {
    const item = document.createElement("li");
    item.className = "passport-stat";
    appendText(item, "span", "passport-stat__value", String(value));
    appendText(item, "span", "passport-stat__label", label);
    list.appendChild(item);
  });
  page.appendChild(list);
  const notes = [];
  if (stickerCounts.optionalEarned) {
    notes.push(`И ещё ${stickerCounts.optionalEarned} ${pluralizeRu(stickerCounts.optionalEarned, ["необязательная наклейка", "необязательные наклейки", "необязательных наклеек"])}.`);
  }
  notes.push(KEEPSAKE_TEXT);
  appendText(page, "p", "settings__hint passport__note", notes.join(" "));
}

function renderVisits(page, result) {
  const section = document.createElement("section");
  section.className = "settings-section";
  const count = result.visits.length;
  appendText(section, "h3", "settings-section__title", count ? `Мои посещения · ${count}` : "Мои посещения");
  if (!count) {
    const empty = document.createElement("div");
    empty.className = "empty-state passport-empty";
    appendText(empty, "p", "", "Здесь появятся места, которые вы отметите, и ваши заметки к ним.");
    appendText(empty, "p", "", "Откройте карточку места и нажмите «Отметить посещение».");
    const link = appendText(empty, "a", "btn btn--secondary passport-empty__action", "К местам");
    link.href = "#/places";
    section.appendChild(empty);
    page.appendChild(section);
    return;
  }
  const list = document.createElement("ul");
  list.className = "passport-visits";
  result.visits.forEach(({ place, visit }) => {
    const item = document.createElement("li");
    item.className = "passport-visit";
    const link = placeLink(place, "passport-visit__link");
    const icon = document.createElement("span");
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = `${placeIcon(place)} `;
    link.prepend(icon);
    item.appendChild(link);
    appendText(item, "p", "passport-visit__date", markedLine(visit));
    if (visit.note) {
      appendText(item, "p", "passport-visit__note", `«${visit.note}»`);
    } else {
      appendText(item, "p", "passport-visit__note passport-visit__note--empty", "Заметки нет — её можно добавить в карточке места.");
    }
    if (!isRewardPlace(place)) appendText(item, "p", "passport-visit__keepsake", "На память — не входит в прогресс и наклейки.");
    list.appendChild(item);
  });
  section.appendChild(list);
  page.appendChild(section);
}

function collectedNames(sticker, config, result) {
  if (sticker.type === "distinctCategories") {
    return sticker.collected.map((id) => {
      const category = config.categories.find((c) => c.id === id);
      return category ? category.name : id;
    });
  }
  if (sticker.type === "distinctCoastParts") {
    return sticker.collected.map((id) => {
      const part = result.coastParts.find((p) => p.id === id);
      return part ? part.name : id;
    });
  }
  return [];
}

function renderStickers(page, result, config) {
  const section = document.createElement("section");
  section.className = "settings-section";
  const { earned, total } = result.stickerCounts;
  appendText(section, "h3", "settings-section__title", `Наклейки · ${earned} из ${total}`);
  appendText(section, "p", "settings__hint", "Наклейки открываются сами, когда отмеченные места подходят под условие. Если снять отметку, наклейка снова закроется.");
  // Подсказки «Подойдут» — только у двух закрытых наклеек, ближайших к
  // получению (спецификация 3.2): у всех двенадцати экран стал бы списком дел.
  const nearest = result.stickers
    .filter((sticker) => !sticker.earned && sticker.hints.length)
    .map((sticker, index) => ({ sticker, index, left: sticker.target - sticker.progress }))
    .sort((a, b) => a.left - b.left || a.index - b.index)
    .slice(0, NEAREST_STICKERS)
    .map(({ sticker }) => sticker.id);
  const list = document.createElement("ul");
  list.className = "passport-stickers";
  result.stickers.forEach((sticker) => {
    const item = document.createElement("li");
    item.className = `passport-sticker${sticker.earned ? " passport-sticker--earned" : ""}`;
    const glyph = appendText(item, "span", "passport-sticker__glyph", STICKER_GLYPHS[sticker.id] || "🏷️");
    glyph.setAttribute("aria-hidden", "true");
    const body = document.createElement("div");
    body.className = "passport-sticker__body";
    appendText(body, "h4", "passport-sticker__title", sticker.title);
    if (sticker.optional) appendText(body, "p", "passport-sticker__optional", "Необязательная");
    appendText(body, "p", "passport-sticker__text", sticker.description);
    if (sticker.earned) {
      appendText(body, "p", "passport-sticker__state passport-sticker__state--earned", "✓ Получена");
    } else {
      appendText(body, "p", "passport-sticker__state", `${sticker.progress} из ${sticker.target}`);
      const bar = document.createElement("div");
      bar.className = "progress";
      bar.setAttribute("role", "progressbar");
      bar.setAttribute("aria-label", sticker.title);
      bar.setAttribute("aria-valuemin", "0");
      bar.setAttribute("aria-valuemax", String(sticker.target));
      bar.setAttribute("aria-valuenow", String(sticker.progress));
      const fill = document.createElement("div");
      fill.className = "progress__fill";
      fill.style.width = `${(sticker.progress / sticker.target) * 100}%`;
      bar.appendChild(fill);
      body.appendChild(bar);
    }
    const names = collectedNames(sticker, config, result);
    if (names.length) appendText(body, "p", "passport-sticker__text", `Уже есть: ${names.join(", ")}.`);
    if (nearest.includes(sticker.id)) {
      appendText(body, "p", "passport-sticker__hints-title", "Подойдут, например:");
      const hints = document.createElement("ul");
      hints.className = "passport-sticker__hints";
      sticker.hints.forEach((place) => {
        const li = document.createElement("li");
        li.appendChild(placeLink(place, "passport-sticker__hint"));
        hints.appendChild(li);
      });
      body.appendChild(hints);
    }
    item.appendChild(body);
    list.appendChild(item);
  });
  section.appendChild(list);
  page.appendChild(section);
}

function renderCoastParts(page, result) {
  if (!result.coastParts.length) return;
  const section = document.createElement("section");
  section.className = "settings-section";
  appendText(section, "h3", "settings-section__title", "Части побережья");
  appendText(
    section,
    "p",
    "settings__hint",
    "Условное деление только для паспорта — не районы из настроек поездки. Считаются места без покупок."
  );
  const list = document.createElement("ul");
  list.className = "passport-parts";
  result.coastParts.forEach((part) => {
    const li = document.createElement("li");
    li.className = "passport-part";
    appendText(li, "span", "passport-part__name", part.name);
    appendText(li, "span", "passport-part__count", `${part.visited} из ${part.total}`);
    list.appendChild(li);
  });
  section.appendChild(list);
  page.appendChild(section);
}

// ------------------------------------------------------------ карточка места

// Компактный блок «Паспорт» в карточке места: состояние, отметка и снятие,
// заметка. content — результат loadPassport() или null (файл не загрузился:
// отмечать можно, сообщение о новой наклейке просто не показывается).
// Блок стоит в потоке карточки и не трогает закреплённые действия.
export function renderPassportBlock(container, { place, places, config, content }) {
  const block = document.createElement("section");
  block.className = "passport-block";
  block.setAttribute("aria-labelledby", "passport-block-title");
  const title = appendText(block, "h3", "passport-block__title", "Паспорт исследователя");
  title.id = "passport-block-title";
  const body = document.createElement("div");
  body.className = "passport-block__body";
  block.appendChild(body);
  const status = appendText(block, "p", "passport-block__status", "");
  status.setAttribute("role", "status");
  const link = appendText(block, "a", "passport-block__link", "Паспорт ›");
  link.href = "#/passport";
  container.appendChild(block);

  if (!storage.isAvailable()) {
    appendText(body, "p", "passport-block__muted", NO_STORAGE_TEXT);
    return;
  }

  const prepared = content && config ? prepareContent(content, config) : null;
  const earnedNow = () =>
    prepared ? earnedStickerIds(evaluatePassport({ state: storage.getPassport(), places, content: prepared })) : [];
  const stickerTitle = (id) => prepared.stickers.find((s) => s.id === id).title;
  // Снятая отметка целиком (с датой и заметкой) — для «Вернуть».
  let removed = null;

  const button = (parent, label, className, onClick) => {
    const el = appendText(parent, "button", className, label);
    el.type = "button";
    el.addEventListener("click", onClick);
    return el;
  };

  function draw() {
    body.innerHTML = "";
    const visit = getVisit(storage.getPassport(), place.id);
    if (!isRewardPlace(place)) appendText(body, "p", "passport-block__muted", KEEPSAKE_TEXT);

    if (!visit) {
      appendText(body, "p", "passport-block__state", "Ещё не отмечено");
      const mark = button(body, "Отметить посещение", "btn btn--secondary passport-block__button", () => {
        const before = earnedNow();
        if (!storage.markPassportVisit(place.id, getTodayIso(), new Date().toISOString())) {
          status.textContent = SAVE_FAILED_TEXT;
          return;
        }
        removed = null;
        const fresh = earnedNow().filter((id) => !before.includes(id));
        status.textContent = fresh.length
          ? `Отмечено. Новая наклейка: ${fresh.map((id) => `«${stickerTitle(id)}»`).join(", ")}.`
          : "Отмечено.";
        draw();
        body.querySelector("button").focus();
      });
      if (removed) {
        const restoreVisit = removed;
        button(body, "Вернуть отметку", "settings-actions__skip passport-block__undo", () => {
          if (!storage.restorePassportVisit(place.id, restoreVisit)) {
            status.textContent = SAVE_FAILED_TEXT;
            return;
          }
          removed = null;
          status.textContent = "Отметка возвращена.";
          draw();
          body.querySelector("button").focus();
        });
      }
      return mark;
    }

    appendText(body, "p", "passport-block__state passport-block__state--done", `✓ ${markedLine(visit)}`);
    if (visit.note) {
      appendText(body, "p", "passport-block__note", `Заметка: «${visit.note}»`);
    } else {
      appendText(body, "p", "passport-block__muted", "Заметки пока нет.");
    }

    const actions = document.createElement("div");
    actions.className = "passport-block__actions";
    body.appendChild(actions);
    const edit = button(actions, visit.note ? "Изменить заметку" : "Добавить заметку", "btn btn--secondary passport-block__button", () => {
      actions.hidden = true;
      openEditor(visit);
    });
    const remove = () => {
      if (!storage.removePassportVisit(place.id)) {
        status.textContent = SAVE_FAILED_TEXT;
        return;
      }
      removed = visit;
      status.textContent = "Отметка снята.";
      draw();
      body.querySelector("button").focus();
    };
    const unmark = button(actions, "Снять отметку", "settings-actions__skip passport-block__unmark", () => {
      if (!visit.note) {
        remove();
        return;
      }
      // С заметкой — сначала встроенное подтверждение (без confirm()).
      actions.hidden = true;
      const box = createConfirm("Снять отметку и удалить заметку?", [{ label: "Снять отметку и заметку", primary: true, onClick: remove }], () => {
        box.remove();
        actions.hidden = false;
        unmark.focus();
      });
      body.appendChild(box);
      box.querySelector("button").focus();
    });
    return edit;
  }

  function openEditor(visit) {
    const form = document.createElement("div");
    form.className = "passport-note";
    const label = appendText(form, "label", "settings-field__label", `Заметка (до ${NOTE_MAX_LENGTH} символов)`);
    label.htmlFor = "passport-note-text";
    const textarea = document.createElement("textarea");
    textarea.id = "passport-note-text";
    textarea.className = "settings-field__input passport-note__input";
    textarea.rows = 3;
    textarea.maxLength = NOTE_MAX_LENGTH;
    textarea.value = visit.note || "";
    const counter = appendText(form, "p", "passport-note__counter", "");
    counter.id = "passport-note-counter";
    textarea.setAttribute("aria-describedby", counter.id);
    const updateCounter = () => {
      counter.textContent = `${textarea.value.length} / ${NOTE_MAX_LENGTH}`;
    };
    textarea.addEventListener("input", updateCounter);
    updateCounter();
    form.insertBefore(textarea, counter);
    const buttons = document.createElement("div");
    buttons.className = "passport-note__buttons";
    button(buttons, "Сохранить заметку", "btn btn--primary", () => {
      if (!storage.setPassportNote(place.id, textarea.value)) {
        status.textContent = SAVE_FAILED_TEXT;
        return;
      }
      const saved = getVisit(storage.getPassport(), place.id);
      status.textContent = saved && saved.note ? "Заметка сохранена." : "Заметка удалена.";
      draw().focus();
    });
    button(buttons, "Отмена", "btn btn--secondary", () => {
      draw().focus();
    });
    form.appendChild(buttons);
    body.appendChild(form);
    textarea.focus();
  }

  draw();
}
