import { loadInfo, loadChecklist, loadPlaces, loadExcursions, loadContacts, loadPhrases, loadErrorMessage } from "../data.js";
import { formatVerifiedDate } from "../logic/checklist.js";
import { getAppVersion } from "../pwa.js";
import { appendJump } from "./handy.js";

// Дисклеймер (Q-12, решение владельца 2026-09-13) — текст дословно.
const DISCLAIMER =
  "Приложение содержит справочную информацию, которая может устареть. Перед поездкой проверяйте критичные данные, особенно телефоны, цены и режим работы. Приложение не собирает и не передаёт персональные данные.";

// Иконка — деталь отображения для заранее известных id, не контент.
// Данные (data/info.json) поля icon не содержат (см. INFO-IMPLEMENTATION.md §9).
const ICONS = {
  payment: "💳",
  connectivity: "📶",
  "taxi-amap": "🚕",
  "taxi-rules": "🧾",
  "first-evening": "🛬",
  emergency: "🆘",
  climate: "🌦️",
};

const DEFAULT_ICON = "ℹ️";

// Группы тем — тоже деталь отображения для известных id, как ICONS (и как
// GROUPS у контактов в handy.js): в data/info.json поля группы нет. Темы
// внутри группы идут в порядке файла; тема с неизвестным id (новая карточка,
// которую сюда ещё не вписали) не теряется — попадает в «Другое» в конце.
const INFO_GROUPS = [
  ["Прилёт и вылет", ["arrival-card", "visa-entry", "first-evening", "airport-arrival", "luggage-delivery"]],
  ["Связь и транспорт", ["connectivity", "taxi-amap", "taxi-rules", "city-transport"]],
  ["Деньги, билеты и покупки", ["payment", "attraction-booking", "duty-free-shopping", "tax-refund", "seafood-buying", "passport-friendly"]],
  ["Погода, здоровье и помощь", ["emergency", "extreme-weather", "climate", "beach-safety", "health-mosquitoes"]],
  ["Правила и запреты", ["military-photography", "drones", "coral-marine-protection", "smoking"]],
];
const OTHER_GROUP_LABEL = "Другое";

function renderErrorState(container, message, onRetry) {
  container.innerHTML = "";
  const heading = document.createElement("h2");
  heading.className = "view-title";
  heading.textContent = "Справка";
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
  wrap.append(p, btn);
  container.appendChild(wrap);
}

function renderCard(href, iconText, titleText, summaryText) {
  const card = document.createElement("a");
  card.href = href;
  card.className = "info-card";

  const icon = document.createElement("span");
  icon.className = "info-card__icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = iconText;

  const body = document.createElement("span");
  body.className = "info-card__body";

  const title = document.createElement("span");
  title.className = "info-card__title";
  title.textContent = titleText;

  const summary = document.createElement("span");
  summary.className = "info-card__summary";
  summary.textContent = summaryText;

  body.append(title, summary);
  card.append(icon, body);
  return card;
}

// «О приложении» внизу «Справки» (Итерация 5): дисклеймер отдельной
// карточкой и строка «Версия … · данные обновлены …» (S1). Версия — из
// Service Worker, дата — самая поздняя verifiedAt показываемых данных. Строка
// дописывается после отрисовки экрана; недоступный источник просто убирает
// свою часть строки и не превращает экран в ошибку.
function appendAbout(container, ctx, infoItems) {
  const section = document.createElement("section");
  section.className = "about";

  const title = document.createElement("h3");
  title.className = "about__title";
  title.textContent = "О приложении";

  const disclaimer = document.createElement("p");
  disclaimer.className = "about__disclaimer";
  disclaimer.textContent = DISCLAIMER;

  // Что работает без сети, а что нет: внешние ссылки помечены стрелкой (CSS).
  const offline = document.createElement("p");
  offline.className = "task__meta about__offline";
  offline.textContent =
    "Места, справка, фразы, план и паспорт открываются без интернета. Ссылки со стрелкой ↗ и маршруты Amap открываются вне приложения — им нужен интернет.";

  const version = document.createElement("p");
  version.className = "task__meta about__version";

  section.append(title, disclaimer, offline, version);
  container.appendChild(section);

  const soft = (promise) => promise.catch(() => []);
  Promise.all([
    getAppVersion(),
    soft(loadChecklist()),
    soft(loadPlaces()),
    soft(loadExcursions()),
    soft(loadContacts()),
    soft(loadPhrases()),
  ]).then(([appVersion, ...lists]) => {
    if (!ctx.isCurrent() || !version.isConnected) return;
    const latest = [infoItems, ...lists]
      .flat()
      .map((item) => item && item.verifiedAt)
      .filter(Boolean)
      .sort()
      .pop();
    const parts = [];
    if (appVersion) parts.push(`Версия ${appVersion}`);
    if (latest) parts.push(`${appVersion ? "данные" : "Данные"} обновлены: ${formatVerifiedDate(latest)}`);
    version.textContent = parts.join(" · ");
  });
}

export async function renderInfo(container, ctx) {
  container.innerHTML = '<p class="loading">Загрузка справки…</p>';

  let items;
  try {
    items = await loadInfo();
  } catch (e) {
    console.error(e);
    if (ctx.isCurrent()) {
      renderErrorState(container, loadErrorMessage(e), () => {
        renderInfo(container, ctx);
      });
    }
    return;
  }

  if (!ctx.isCurrent()) {
    // Пользователь уже переключился на другой экран, пока грузился JSON.
    return;
  }

  container.innerHTML = "";

  const heading = document.createElement("h2");
  heading.className = "view-title";
  heading.textContent = "Справка";
  container.appendChild(heading);

  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Пока нет доступных карточек справки.";
    container.appendChild(empty);
    appendAbout(container, ctx, items);
    return;
  }

  // Быстрый переход к группе: тем больше двадцати, список длинный. Та же
  // строка чипов, что в «Под рукой» — прокрутка, а не навигация.
  const jump = document.createElement("div");
  jump.className = "chips handy__jump";
  jump.setAttribute("role", "group");
  jump.setAttribute("aria-label", "Быстрый переход");
  container.appendChild(jump);

  // «Под рукой» (#/handy) — первой строкой: не тема для чтения, а действия в
  // один тап (Итерация 4). Подписи — деталь отображения, как ICONS.
  const handyList = document.createElement("div");
  handyList.className = "info-list";
  handyList.appendChild(
    renderCard("#/handy", "📞", "Под рукой", "Телефоны в один тап, фразы на китайском, адрес для таксиста")
  );
  container.appendChild(handyList);

  const known = INFO_GROUPS.flatMap(([, ids]) => ids);
  const groups = INFO_GROUPS.map(([label, ids]) => [label, items.filter((item) => ids.includes(item.id))]);
  groups.push([OTHER_GROUP_LABEL, items.filter((item) => !known.includes(item.id))]);
  groups.forEach(([label, groupItems]) => {
    if (!groupItems.length) return;
    const title = document.createElement("h3");
    title.className = "handy__subtitle info-group__title";
    title.textContent = label;
    container.appendChild(title);
    appendJump(jump, label, title);
    const list = document.createElement("div");
    list.className = "info-list";
    groupItems.forEach((item) => {
      list.appendChild(renderCard(`#/info/${item.id}`, ICONS[item.id] || DEFAULT_ICON, item.title, item.summary));
    });
    container.appendChild(list);
  });

  appendAbout(container, ctx, items);
}

export async function renderInfoDetail(container, ctx) {
  const { id } = ctx.params;
  container.innerHTML = '<p class="loading">Загрузка справки…</p>';

  let items;
  try {
    items = await loadInfo();
  } catch (e) {
    console.error(e);
    if (ctx.isCurrent()) {
      renderErrorState(container, loadErrorMessage(e), () => {
        renderInfoDetail(container, ctx);
      });
    }
    return;
  }

  if (!ctx.isCurrent()) {
    return;
  }

  const item = items.find((i) => i.id === id);
  if (!item) {
    // Неизвестный или не-verified id — возвращаемся к списку
    // (INFO-IMPLEMENTATION.md §2). replace, а не hash =, чтобы несуществующий
    // id не оставался в истории и не зацикливал «Назад».
    window.location.replace("#/info");
    return;
  }

  container.innerHTML = "";

  // Выход вверху карточки (D-11 REAL-DEVICE-QA-2026-09.md): карточка справки
  // длинная, а в установленном iOS-приложении нет кнопки «Назад» браузера —
  // искать единственную ссылку под текстом приходилось прокруткой. Тот же
  // элемент и то же поведение, что у «← К местам» (place.js); ссылка внизу
  // остаётся — она удобна как раз после прочтения.
  // Карточку открывают и со списка, и с «Сейчас» (блоки прилёта и вылета, «Под
  // рукой»): возврат — туда, откуда пришли; глубокая ссылка — к списку.
  const fromPath = (ctx.from || "").replace(/^#/, "").split("?")[0];
  const parent = fromPath === "/" ? "#/" : "#/info";
  const backText = parent === "#/" ? "← Назад" : "← К справке";
  const topBack = document.createElement("a");
  topBack.href = parent;
  topBack.className = "place-detail__back";
  topBack.textContent = backText;
  topBack.addEventListener("click", (event) => {
    event.preventDefault();
    ctx.back(parent);
  });
  container.appendChild(topBack);

  const heading = document.createElement("h2");
  heading.className = "view-title";
  heading.textContent = item.title;
  container.appendChild(heading);

  const summary = document.createElement("p");
  summary.className = "info-detail__summary";
  summary.textContent = item.summary;
  container.appendChild(summary);

  const pointsList = document.createElement("ul");
  pointsList.className = "info-detail__points";
  item.points.forEach((point) => {
    const li = document.createElement("li");
    li.textContent = point;
    pointsList.appendChild(li);
  });
  container.appendChild(pointsList);

  if (item.volatile) {
    const volatileNote = document.createElement("p");
    volatileNote.className = "task__meta task__meta--volatile";
    volatileNote.textContent = "Может измениться — проверьте актуальность перед поездкой.";
    container.appendChild(volatileNote);
  }

  if (item.sources && item.sources.length) {
    const sourcesLabel = document.createElement("p");
    sourcesLabel.className = "task__meta sources__label";
    sourcesLabel.textContent = "Источник:";
    container.appendChild(sourcesLabel);

    const sourcesList = document.createElement("div");
    sourcesList.className = "sources__list";
    item.sources.forEach((src) => {
      if (src.url) {
        const a = document.createElement("a");
        a.href = src.url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = src.title;
        a.className = "sources__link";
        sourcesList.appendChild(a);
      } else {
        // Пустой url (P2, ITERATION-8-FINAL-QA.md §5) — текст без ссылки,
        // чтобы не создавать мёртвый <a href="">.
        const span = document.createElement("span");
        span.textContent = src.title;
        span.className = "sources__link";
        sourcesList.appendChild(span);
      }
    });
    container.appendChild(sourcesList);
  }

  const meta = document.createElement("p");
  meta.className = "task__meta";
  meta.textContent = `Проверено: ${formatVerifiedDate(item.verifiedAt)}`;
  container.appendChild(meta);

  const backLink = document.createElement("a");
  backLink.href = parent;
  backLink.className = "info-detail__back";
  backLink.textContent = backText;
  // ctx.back вместо перехода по обычной ссылке (ITERATION-2-FOUNDATION.md §6.5):
  // если пришли со списка — history.back() без роста истории; если это
  // глубокая ссылка — replace на список. Разметка остаётся ссылкой ради
  // семантики и доступности, переход перехватывается кодом.
  backLink.addEventListener("click", (event) => {
    event.preventDefault();
    ctx.back(parent);
  });
  container.appendChild(backLink);
}
