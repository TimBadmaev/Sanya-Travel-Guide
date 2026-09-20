import { loadInfo, loadChecklist, loadPlaces, loadExcursions, loadContacts, loadPhrases, loadErrorMessage } from "../data.js";
import { formatVerifiedDate } from "../logic/checklist.js";
import { getAppVersion } from "../pwa.js";

// Дисклеймер (Q-12, решение владельца 2026-09-13) — текст дословно.
const DISCLAIMER =
  "Приложение содержит справочную информацию, которая может устареть. Перед поездкой проверяйте критичные данные, особенно телефоны, цены и режим работы. Приложение не собирает и не передаёт персональные данные.";

// Иконка — деталь отображения для пяти заранее известных id, не контент.
// Данные (data/info.json) поля icon не содержат (см. INFO-IMPLEMENTATION.md §9).
const ICONS = {
  payment: "💳",
  connectivity: "📶",
  "taxi-amap": "🚕",
  emergency: "🆘",
  climate: "🌦️",
};

const DEFAULT_ICON = "ℹ️";

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

  const version = document.createElement("p");
  version.className = "task__meta about__version";

  section.append(title, disclaimer, version);
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

  const list = document.createElement("div");
  list.className = "info-list";

  // «Под рукой» (#/handy) — первой строкой: не тема для чтения, а действия в
  // один тап (Итерация 4). Подписи — деталь отображения, как ICONS.
  list.appendChild(
    renderCard("#/handy", "📞", "Под рукой", "Телефоны в один тап, фразы на китайском, адрес для таксиста")
  );

  items.forEach((item) => {
    list.appendChild(renderCard(`#/info/${item.id}`, ICONS[item.id] || DEFAULT_ICON, item.title, item.summary));
  });

  container.appendChild(list);
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
  const topBack = document.createElement("a");
  topBack.href = "#/info";
  topBack.className = "place-detail__back";
  topBack.textContent = "← К справке";
  topBack.addEventListener("click", (event) => {
    event.preventDefault();
    ctx.back("#/info");
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
  backLink.href = "#/info";
  backLink.className = "info-detail__back";
  backLink.textContent = "← К справке";
  // ctx.back вместо перехода по обычной ссылке (ITERATION-2-FOUNDATION.md §6.5):
  // если пришли со списка — history.back() без роста истории; если это
  // глубокая ссылка — replace на список. Разметка остаётся ссылкой ради
  // семантики и доступности, переход перехватывается кодом.
  backLink.addEventListener("click", (event) => {
    event.preventDefault();
    ctx.back("#/info");
  });
  container.appendChild(backLink);
}
