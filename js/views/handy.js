import { loadContacts, loadPhrases, loadErrorMessage } from "../data.js";
import { storage } from "../storage.js";
import { formatVerifiedDate } from "../logic/checklist.js";
import { renderShowScreen } from "./taxi.js";

// «Под рукой» (#/handy, CONTENT-ITERATION-4.md §1–3): действия в один тап —
// позвонить, показать фразу крупно, показать таксисту адрес проживания.
// Контакты — data/contacts.json, фразы — data/phrases.json, адрес —
// stg:trip.home (Q-15). Фраза и адрес показываются тем же полноэкранным
// экраном, что «Показать таксисту» у места (taxi.js).

// Подписи и порядок групп контактов — деталь отображения для известных
// значений group (как ICONS в info.js). Неизвестная группа — в конце.
const GROUPS = [
  ["emergency", "Экстренные службы"],
  ["taxi", "Такси"],
  ["city", "Город"],
  ["consumer", "Цены и качество"],
  ["consulate", "Консульство России"],
];
const OTHER_GROUP_LABEL = "Другое";

// Сюда ведут Главная («Под рукой» в поездке) и Справка. «← Назад» уходит на
// ту из них, откуда пришли; иначе (глубокая ссылка, перезагрузка) — на Справку.
const PARENT_PATHS = ["/", "/info"];
const DEFAULT_PARENT = "#/info";

function parentHash(ctx) {
  if (ctx.from) {
    const path = ctx.from.replace(/^#/, "").split("?")[0] || "/";
    if (PARENT_PATHS.includes(path)) return ctx.from;
  }
  return DEFAULT_PARENT;
}

// onClose — только для полноэкранной фразы: там нет нижней панели ([PI-13]).
function renderErrorState(container, message, onRetry, onClose) {
  container.innerHTML = "";
  const heading = document.createElement("h2");
  heading.className = "view-title";
  heading.textContent = "Под рукой";
  container.appendChild(heading);

  const wrap = document.createElement("div");
  wrap.className = "error-state";
  const p = document.createElement("p");
  p.textContent = message;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn btn--primary";
  btn.textContent = "Повторить";
  btn.addEventListener("click", onRetry);

  if (onClose) {
    const actions = document.createElement("div");
    actions.className = "error-state__actions";
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "btn btn--secondary";
    closeBtn.textContent = "Закрыть";
    closeBtn.addEventListener("click", onClose);
    actions.append(btn, closeBtn);
    wrap.append(p, actions);
  } else {
    wrap.append(p, btn);
  }
  container.appendChild(wrap);
}

function appendSubtitle(container, text) {
  const h = document.createElement("h3");
  h.className = "handy__subtitle";
  h.textContent = text;
  container.appendChild(h);
}

function appendText(parent, className, text, lang) {
  const el = document.createElement("span");
  el.className = className;
  if (lang) el.lang = lang;
  el.textContent = text;
  parent.appendChild(el);
  return el;
}

// Подвал раздела: источники без повторов и самая поздняя дата проверки.
function appendSources(container, sources, dates) {
  const latest = dates.filter(Boolean).sort().pop();
  if (latest) {
    const meta = document.createElement("p");
    meta.className = "task__meta";
    meta.textContent = `Проверено: ${formatVerifiedDate(latest)}`;
    container.appendChild(meta);
  }
  const unique = [];
  sources.forEach((src) => {
    if (src && src.url && !unique.some((u) => u.url === src.url)) unique.push(src);
  });
  if (!unique.length) return;
  const label = document.createElement("p");
  label.className = "task__meta sources__label";
  label.textContent = "Источник:";
  container.appendChild(label);
  const list = document.createElement("div");
  list.className = "sources__list";
  unique.forEach((src) => {
    const a = document.createElement("a");
    a.href = src.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = src.title;
    a.className = "sources__link";
    list.appendChild(a);
  });
  container.appendChild(list);
}

// Адрес проживания: действие «Показать таксисту» или понятное пустое
// состояние со ссылкой в настройки (там же адрес и меняется).
function renderHomeBlock(container, home) {
  appendSubtitle(container, "Адрес проживания");
  const block = document.createElement("div");

  if (!home) {
    block.className = "empty-state handy-home";
    const p = document.createElement("p");
    p.textContent = "Адрес не указан. Добавьте адрес отеля на китайском в настройках поездки — его можно будет показать таксисту.";
    const link = document.createElement("a");
    link.href = "#/settings";
    link.className = "btn btn--primary handy-home__action";
    link.textContent = "Указать адрес";
    block.append(p, link);
    container.appendChild(block);
    return;
  }

  block.className = "handy-home";
  const address = document.createElement("p");
  address.className = "handy-home__address";
  address.lang = "zh-CN";
  address.textContent = home.addressZh;
  block.appendChild(address);
  if (home.nameRu) {
    const name = document.createElement("p");
    name.className = "handy-home__name";
    name.textContent = home.nameRu;
    block.appendChild(name);
  }

  const taxiLink = document.createElement("a");
  taxiLink.href = "#/handy/taxi";
  taxiLink.className = "btn btn--primary handy-home__action";
  taxiLink.textContent = "Показать таксисту";

  const editLink = document.createElement("a");
  editLink.href = "#/settings";
  editLink.className = "home-link";
  editLink.textContent = "Изменить адрес";

  block.append(taxiLink, editLink);
  container.appendChild(block);
}

// Контакт — строка-ссылка tel: целиком: номер не дублируется текстом рядом
// с отдельной кнопкой, вся строка и есть действие «позвонить».
function renderContact(contact) {
  const link = document.createElement("a");
  link.href = contact.tel;
  link.className = "info-card contact";
  link.setAttribute("aria-label", `Позвонить: ${contact.label}, ${contact.number}`);

  const icon = appendText(link, "info-card__icon", "📞");
  icon.setAttribute("aria-hidden", "true");

  const body = document.createElement("span");
  body.className = "info-card__body";
  appendText(body, "info-card__title", contact.label);
  appendText(body, "contact__number", contact.number);
  if (contact.note) appendText(body, "info-card__summary", contact.note);
  link.appendChild(body);
  return link;
}

function renderPhraseRow(phrase) {
  const link = document.createElement("a");
  link.href = `#/handy/phrase/${encodeURIComponent(phrase.id)}`;
  link.className = "info-card phrase";

  const body = document.createElement("span");
  body.className = "info-card__body";
  appendText(body, "info-card__title", phrase.ru);
  appendText(body, "phrase__zh", phrase.zh, "zh-CN");
  if (phrase.context) appendText(body, "info-card__summary", phrase.context);
  link.appendChild(body);
  return link;
}

export async function renderHandy(container, ctx) {
  container.innerHTML = '<p class="loading">Загрузка…</p>';

  let contacts;
  let phrases;
  try {
    [contacts, phrases] = await Promise.all([loadContacts(), loadPhrases()]);
  } catch (e) {
    console.error(e);
    if (ctx.isCurrent()) {
      renderErrorState(container, loadErrorMessage(e), () => {
        renderHandy(container, ctx);
      });
    }
    return;
  }

  if (!ctx.isCurrent()) {
    // Пользователь уже переключился на другой экран, пока грузились JSON.
    return;
  }

  container.innerHTML = "";

  const parent = parentHash(ctx);
  const backLink = document.createElement("a");
  backLink.href = parent;
  backLink.className = "place-detail__back";
  backLink.textContent = "← Назад";
  backLink.addEventListener("click", (event) => {
    event.preventDefault();
    ctx.back(parent);
  });
  container.appendChild(backLink);

  const heading = document.createElement("h2");
  heading.className = "view-title";
  heading.textContent = "Под рукой";
  container.appendChild(heading);

  renderHomeBlock(container, storage.getTrip().home);

  // Контакты по группам в порядке GROUPS, внутри группы — порядок файла.
  const knownGroups = GROUPS.map(([id]) => id);
  const groups = [...GROUPS];
  if (contacts.some((c) => !knownGroups.includes(c.group))) groups.push([null, OTHER_GROUP_LABEL]);
  groups.forEach(([groupId, label]) => {
    const items = contacts.filter((c) => (groupId === null ? !knownGroups.includes(c.group) : c.group === groupId));
    if (!items.length) return;
    appendSubtitle(container, label);
    const list = document.createElement("div");
    list.className = "info-list";
    items.forEach((contact) => list.appendChild(renderContact(contact)));
    container.appendChild(list);
  });
  if (contacts.length) {
    appendSources(
      container,
      contacts.flatMap((c) => c.sources || []),
      contacts.map((c) => c.verifiedAt)
    );
  }

  if (phrases.length) {
    appendSubtitle(container, "Фразы на китайском");
    const hint = document.createElement("p");
    hint.className = "handy__hint";
    hint.textContent = "Нажмите на фразу — она откроется крупно, чтобы показать собеседнику.";
    container.appendChild(hint);
    const list = document.createElement("div");
    list.className = "info-list";
    phrases.forEach((phrase) => list.appendChild(renderPhraseRow(phrase)));
    container.appendChild(list);
    appendSources(
      container,
      phrases.map((p) => p.source),
      phrases.map((p) => p.verifiedAt)
    );
  }
}

// Фраза крупно (#/handy/phrase/<id>): иероглифы — главное, ниже пиньинь и
// русский перевод. Копируется китайский текст.
export async function renderHandyPhrase(container, ctx) {
  const { id } = ctx.params;
  container.innerHTML = '<p class="loading">Загрузка…</p>';

  let phrases;
  try {
    phrases = await loadPhrases();
  } catch (e) {
    console.error(e);
    if (ctx.isCurrent()) {
      renderErrorState(
        container,
        loadErrorMessage(e),
        () => {
          renderHandyPhrase(container, ctx);
        },
        () => {
          ctx.back("#/handy");
        }
      );
    }
    return;
  }

  if (!ctx.isCurrent()) {
    return;
  }

  const phrase = phrases.find((p) => p.id === id);
  if (!phrase) {
    // Неизвестный id — к списку; replace, чтобы битый адрес не оставался в истории.
    window.location.replace("#/handy");
    return;
  }

  renderShowScreen(container, {
    lines: [
      { text: phrase.zh, className: "taxi__name", lang: "zh-CN" },
      { text: phrase.pinyin, className: "taxi__pinyin" },
      { text: phrase.ru, className: "taxi__ru" },
    ],
    getCopyText: () => phrase.zh,
    closeHref: "#/handy",
    onClose: () => ctx.back("#/handy"),
  });
}

// Адрес проживания для таксиста (#/handy/taxi). Данных из сети не нужно —
// экран работает и без интернета. Без адреса — обратно в «Под рукой».
export function renderHandyTaxi(container, ctx) {
  const { home } = storage.getTrip();
  if (!home) {
    window.location.replace("#/handy");
    return;
  }

  renderShowScreen(container, {
    lines: [
      { text: home.addressZh, className: "taxi__name", lang: "zh-CN" },
      { text: home.nameRu || "Адрес проживания", className: "taxi__ru" },
    ],
    getCopyText: () => home.addressZh,
    closeHref: "#/handy",
    onClose: () => ctx.back("#/handy"),
  });
}
