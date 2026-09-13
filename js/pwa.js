import { storage } from "./storage.js";

// PWA-инфраструктура (Итерация 5, ITERATION-5-IMPLEMENTATION.md): регистрация
// Service Worker, плашка обновления, подсказка установки на экран «Домой».
// Уровень app.js / data.js, а не экран: в routing и в #view не вмешивается,
// записей в истории не создаёт. Плашки живут в отдельном контейнере после
// #app — ре-рендер экранов их не стирает.

const UPDATE_TEXT = "Доступна новая версия";
const INSTALL_TEXT = "Добавьте приложение на экран «Домой» — тогда оно будет работать без интернета.";
const IOS_INSTALL_NOTE = "В Safari: «Поделиться» → «На экран „Домой“».";

// Подсказка не выскакивает одновременно с первым экраном (сценарий 1 §7).
const INSTALL_HINT_DELAY_MS = 3000;
// Если воркер не ответил на запрос версии — версия просто не показывается.
const VERSION_TIMEOUT_MS = 1500;
// Если после «Обновить» контроллер так и не сменился, кнопку можно нажать снова.
const UPDATE_RETRY_MS = 4000;

// Service Worker есть только в secure context (HTTPS, localhost). По адресу
// http://192.168.x.x (проверка с телефона, D-25) приложение работает как
// обычный сайт: без регистрации, без подсказок и без сообщений об ошибке.
function isSupported() {
  return "serviceWorker" in navigator && window.isSecureContext;
}

// --- Контейнер плашек ---

let bars = null;
let waitingWorker = null;
let updateBar = null;
let installBar = null;

// Высота плашек уходит в CSS-переменную: нижний отступ #view и sticky-блоки
// поднимаются над ними, контент не перекрывается.
function syncHeight() {
  const height = bars && !bars.hidden ? bars.offsetHeight : 0;
  document.documentElement.style.setProperty("--pwa-bars-height", `${height}px`);
}

function getBars() {
  if (!bars) {
    bars = document.createElement("div");
    bars.className = "pwa-bars";
    bars.hidden = true;
    document.body.appendChild(bars);
    // На полноэкранных экранах плашки скрыты CSS — высота меняется без
    // событий страницы, поэтому следим за размером самого контейнера.
    if ("ResizeObserver" in window) {
      new ResizeObserver(syncHeight).observe(bars);
    } else {
      window.addEventListener("resize", syncHeight);
    }
  }
  return bars;
}

function addBar(bar, first) {
  const container = getBars();
  if (first) {
    container.prepend(bar);
  } else {
    container.appendChild(bar);
  }
  container.hidden = false;
  syncHeight();
}

function removeBar(bar) {
  bar.remove();
  if (bars && !bars.children.length) bars.hidden = true;
  syncHeight();
}

function createBar(modifier, text, note) {
  const bar = document.createElement("div");
  bar.className = `pwa-bar ${modifier}`;
  const body = document.createElement("div");
  body.className = "pwa-bar__body";
  const p = document.createElement("p");
  p.className = "pwa-bar__text";
  p.textContent = text;
  body.appendChild(p);
  if (note) {
    const small = document.createElement("p");
    small.className = "pwa-bar__note";
    small.textContent = note;
    body.appendChild(small);
  }
  bar.appendChild(body);
  return bar;
}

function createButton(className, text) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = text;
  return button;
}

// --- Обновление: только по подтверждению пользователя ---

function showUpdate(worker) {
  waitingWorker = worker;
  if (updateBar) return;
  updateBar = createBar("pwa-bar--update", UPDATE_TEXT);
  updateBar.setAttribute("role", "status");
  const button = createButton("btn btn--primary pwa-bar__action", "Обновить");
  button.addEventListener("click", () => {
    button.disabled = true;
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
    // Перезагрузку делает controllerchange. Если он не пришёл, плашка
    // остаётся, а приложение работает на прежней версии (сценарий 4 §7).
    setTimeout(() => {
      button.disabled = false;
    }, UPDATE_RETRY_MS);
  });
  updateBar.appendChild(button);
  addBar(updateBar, true);
}

function register() {
  // Контроллер при загрузке есть → его смена возможна только после
  // SKIP_WAITING, то есть после «Обновить» (здесь или в другой вкладке).
  // Первый визит: воркер берёт страницу под контроль через clients.claim()
  // — это не обновление, перезагрузка не нужна.
  let controlled = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!controlled) {
      controlled = true;
      return;
    }
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });

  navigator.serviceWorker
    .register("./sw.js", { updateViaCache: "none" })
    .then((registration) => {
      if (registration.waiting && navigator.serviceWorker.controller) {
        showUpdate(registration.waiting);
      }
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          // Без контроллера это первая установка, а не новая версия.
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            showUpdate(worker);
          }
        });
      });
      // Установленное приложение неделями возвращается из фона без
      // навигации — проверяем обновление при каждом возвращении на экран.
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") registration.update().catch(() => {});
      });
    })
    .catch((error) => {
      // Приватный режим, отключённое хранилище: приложение работает как сайт.
      console.warn("Service Worker не зарегистрирован", error);
    });
}

// --- Подсказка установки ---

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}

// iPadOS представляется десктопным Safari — отличаем по сенсорному экрану.
function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function hideInstallHint() {
  if (!installBar) return;
  removeBar(installBar);
  installBar = null;
}

// promptEvent — сохранённый beforeinstallprompt (Chromium) или null (iOS:
// события нет, установка вручную через «Поделиться»).
function showInstallHint(promptEvent) {
  if (installBar || isStandalone() || storage.isInstallHintDismissed()) return;
  installBar = createBar("pwa-bar--install", INSTALL_TEXT, promptEvent ? null : IOS_INSTALL_NOTE);

  if (promptEvent) {
    const install = createButton("btn btn--primary pwa-bar__action", "Установить");
    install.addEventListener("click", () => {
      // Событие одноразовое: после ответа в системном диалоге подсказка уходит.
      // prompt() может отказать (повторный вызов, нет жеста пользователя) —
      // тогда подсказка тоже уходит, без ошибки в консоли.
      Promise.resolve()
        .then(() => promptEvent.prompt())
        .then(() => promptEvent.userChoice)
        .catch(() => {})
        .finally(hideInstallHint);
    });
    installBar.appendChild(install);
  }

  const close = createButton("pwa-bar__close", "✕");
  close.setAttribute("aria-label", "Закрыть подсказку");
  close.addEventListener("click", () => {
    storage.setInstallHintDismissed();
    hideInstallHint();
  });
  installBar.appendChild(close);
  addBar(installBar, false);
}

function initInstallHint() {
  if (isStandalone() || storage.isInstallHintDismissed()) return;
  if (isIos()) {
    setTimeout(() => showInstallHint(null), INSTALL_HINT_DELAY_MS);
    return;
  }
  // Chromium: событие может прийти в любой момент — слушаем сразу.
  window.addEventListener("beforeinstallprompt", (event) => {
    // Закрытая подсказка не подменяет собственный интерфейс браузера.
    if (storage.isInstallHintDismissed()) return;
    event.preventDefault();
    showInstallHint(event);
  });
  window.addEventListener("appinstalled", hideInstallHint);
}

// Версия активного кэша (CACHE_VERSION в sw.js) — для строки «Версия …» в
// «Справке». null — воркера нет или он не ответил.
export function getAppVersion() {
  if (!isSupported() || !navigator.serviceWorker.controller) return Promise.resolve(null);
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), VERSION_TIMEOUT_MS);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      resolve(typeof event.data === "string" ? event.data : null);
    };
    navigator.serviceWorker.controller.postMessage({ type: "GET_VERSION" }, [channel.port2]);
  });
}

export function initPwa() {
  if (!isSupported()) return;
  initInstallHint();
  // Регистрация после load (M4): не конкурирует с загрузкой первого экрана.
  if (document.readyState === "complete") {
    register();
  } else {
    window.addEventListener("load", register, { once: true });
  }
}
