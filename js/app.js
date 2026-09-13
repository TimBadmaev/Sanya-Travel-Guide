import { renderHome } from "./views/home.js";
import { renderPlaces } from "./views/places.js";
import { renderPlace, renderPlaceTaxi } from "./views/place.js";
import { renderPrepare } from "./views/prepare.js";
import { renderSettings } from "./views/settings.js";
import { renderInfo, renderInfoDetail } from "./views/info.js";
import { renderHandy, renderHandyPhrase, renderHandyTaxi } from "./views/handy.js";
import { initPwa } from "./pwa.js";

// Таблица маршрутов вместо объекта точных маршрутов (ITERATION-2-FOUNDATION.md
// §3): якорные regexp с именованными группами параметров. Первое совпадение
// побеждает; nav — какая вкладка нижней навигации подсвечивается.
const routes = [
  { pattern: /^\/$/, render: renderHome, nav: "/" },
  { pattern: /^\/places$/, render: renderPlaces, nav: "/places" },
  { pattern: /^\/place\/(?<id>[^/]+)$/, render: renderPlace, nav: "/places" },
  { pattern: /^\/place\/(?<id>[^/]+)\/taxi$/, render: renderPlaceTaxi, nav: "/places", fullscreen: true },
  { pattern: /^\/prepare$/, render: renderPrepare, nav: "/prepare" },
  // Настройки — вложенный экран Главной, поэтому подсвечена «Сейчас» ([I3-8]).
  { pattern: /^\/settings$/, render: renderSettings, nav: "/" },
  { pattern: /^\/info$/, render: renderInfo, nav: "/info" },
  { pattern: /^\/info\/(?<id>[^/]+)$/, render: renderInfoDetail, nav: "/info" },
  // «Под рукой» (Итерация 4): открывается с Главной и из Справки; подсвечена
  // «Справка» — как у карточек справки, на которые Главная тоже ссылается.
  { pattern: /^\/handy$/, render: renderHandy, nav: "/info" },
  { pattern: /^\/handy\/phrase\/(?<id>[^/]+)$/, render: renderHandyPhrase, nav: "/info", fullscreen: true },
  { pattern: /^\/handy\/taxi$/, render: renderHandyTaxi, nav: "/info", fullscreen: true },
];

// Счётчик навигаций (§4): экран после каждого await сверяет ctx.isCurrent(),
// чтобы устаревший async-рендер не перерисовал уже другой открытый экран.
let navId = 0;

// Прокрутка привязана к записи истории, а не к маршруту (§6.4): у каждой
// записи свой key в history.state, позиция сохраняется в этой Map при уходе
// с записи и восстанавливается, когда пользователь возвращается на неё.
let currentKey = null;
const scrollPositions = new Map();

function parseHash(hash) {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const q = raw.indexOf("?");
  return {
    path: (q === -1 ? raw : raw.slice(0, q)) || "/",
    query: new URLSearchParams(q === -1 ? "" : raw.slice(q + 1)),
  };
}

function matchRoute(path) {
  for (const route of routes) {
    const m = path.match(route.pattern);
    if (m) return { route, params: { ...m.groups } };
  }
  return null;
}

// Внутренний «Назад» / «Закрыть» (§6.5): если пришли с родителя — обычный
// history.back() (сохраняет query и прокрутку родителя, история не растёт);
// иначе (глубокая ссылка, перезагрузка) — replace на родителя, тоже без
// роста истории. Устраняет history loop, который давала ссылка-редирект.
function back(parentHash) {
  const from = history.state && history.state.from;
  if (from && parseHash(from).path === parseHash(parentHash).path) {
    history.back();
  } else {
    window.location.replace(parentHash);
  }
}

function updateActiveNav(navPath) {
  document.querySelectorAll(".bottom-nav__item").forEach((link) => {
    const isActive = link.dataset.route === navPath;
    link.classList.toggle("is-active", isActive);
    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

function render(event) {
  const id = ++navId;
  if (currentKey) scrollPositions.set(currentKey, window.scrollY);

  const { path, query } = parseHash(window.location.hash || "#/");
  const match = matchRoute(path);

  if (!match) {
    // Неизвестный маршрут — уходим на главную. Используем replace, а не
    // присваивание hash, чтобы не плодить в истории записи с несуществующим
    // маршрутом (иначе «Назад» возвращает на него и зацикливается).
    window.location.replace("#/");
    return;
  }

  if (!history.state || !history.state.key) {
    // Новая запись истории (ссылка, редирект, первая загрузка) — присваиваем
    // ей key и запоминаем, откуда пришли, чтобы ctx.back() мог узнать
    // родителя, а прокрутка могла привязаться к этой записи.
    const from = event && event.oldURL ? new URL(event.oldURL).hash : null;
    history.replaceState({ key: `${Date.now()}-${Math.random()}`, from }, "");
  }
  const key = history.state.key;
  currentKey = key;

  // from — hash записи, с которой пришли (§6.5). Экрану он нужен, когда у
  // него не один возможный родитель: «Настройки» открываются и с Главной, и
  // по плашке со «Мест». Читать history экраны не должны (§8, контракт).
  const ctx = {
    params: match.params,
    query,
    from: (history.state && history.state.from) || null,
    isCurrent: () => id === navId,
    back,
  };
  updateActiveNav(match.route.nav);
  // На каждой навигации (§6.6): уход с полноэкранного экрана любым способом
  // (Back, «Закрыть», редирект) возвращает шапку и панель без отдельного кода.
  document.getElementById("app").classList.toggle("is-fullscreen", Boolean(match.route.fullscreen));
  window.scrollTo(0, 0);

  Promise.resolve(match.route.render(document.getElementById("view"), ctx))
    .then(() => {
      if (ctx.isCurrent()) window.scrollTo(0, scrollPositions.get(key) || 0);
    })
    .catch((e) => {
      console.error("Ошибка рендеринга экрана", e);
    });
}

window.addEventListener("hashchange", render);

function init() {
  // manual вместо auto (§6.4): встроенное восстановление прокрутки браузером
  // срабатывает не синхронно с hashchange и перебивает решения приложения —
  // прокруткой управляет только роутер (см. render()).
  history.scrollRestoration = "manual";
  if (!window.location.hash) {
    // replace (не hash =), чтобы стартовый fallback не добавлял отдельную
    // запись в историю — иначе «Назад» с главной требует лишнего нажатия.
    // Установка hash сама вызовет hashchange -> render().
    window.location.replace("#/");
  } else {
    render(null);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// Офлайн-режим и установка (Итерация 5): в роутинг не вмешивается.
initPwa();
