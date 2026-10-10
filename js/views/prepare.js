import { loadChecklist, loadErrorMessage } from "../data.js";
import { storage } from "../storage.js";
import { PHASE_ORDER, PHASE_LABELS, getDefaultOpenPhases } from "../logic/trip.js";
import { groupByPhase } from "../logic/checklist.js";
import { renderTask } from "./task.js";
import { OFFLINE_STATE, getOfflineStatus, offlineState } from "../pwa.js";

// Кэш данных теперь в data.js (ITERATION-2-FOUNDATION.md §5) — здесь
// остаётся только UI-состояние: какие этапы раскрыты, чтобы при
// переключении вкладок туда-обратно не терять раскрытые секции.
let openPhases = null;

function renderErrorState(container, message, onRetry) {
  container.innerHTML = "";
  const heading = document.createElement("h2");
  heading.className = "view-title";
  heading.textContent = "Подготовка к поездке";
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

const OFFLINE_TEXT = {
  [OFFLINE_STATE.UNSUPPORTED]:
    "В этом браузере офлайн-режим недоступен. Откройте приложение по основной ссылке (https) в Safari или Chrome, не в приватной вкладке.",
  [OFFLINE_STATE.NOT_READY]:
    "Офлайн-копия ещё не готова. Оставьте приложение открытым с интернетом на несколько секунд и нажмите «Проверить снова».",
  [OFFLINE_STATE.UNKNOWN]: "Не удалось проверить офлайн-копию. Нажмите «Проверить снова».",
};

// «Работа без интернета» внизу «Подготовки»: проверяемый статус офлайн-копии
// (js/pwa.js → getOfflineStatus) и то, что проверить нельзя, — словами.
// «Готово» показывается только когда воркер подтвердил все файлы.
function renderOfflineCheck(container, ctx) {
  const section = document.createElement("section");
  section.className = "offline-check";
  const title = document.createElement("h3");
  title.className = "offline-check__title";
  title.textContent = "Работа без интернета";
  const state = document.createElement("p");
  state.className = "offline-check__state";
  state.setAttribute("role", "status");
  const install = document.createElement("p");
  install.className = "offline-check__line";
  const data = document.createElement("p");
  data.className = "offline-check__line";
  data.hidden = storage.isAvailable();
  data.textContent = "Отметки, план и заметки не сохраняются: память браузера недоступна.";
  const hint = document.createElement("p");
  hint.className = "task__meta offline-check__hint";
  hint.textContent =
    "Проверьте сами перед вылетом: включите авиарежим и откройте приложение заново. Маршруты Amap и ссылки со стрелкой ↗ без сети не откроются.";
  const again = document.createElement("button");
  again.type = "button";
  again.className = "btn btn--secondary offline-check__again";
  again.textContent = "Проверить снова";
  section.append(title, state, install, data, hint, again);
  container.appendChild(section);

  function check() {
    section.dataset.state = "checking";
    state.textContent = "Проверяем офлайн-копию…";
    getOfflineStatus().then((status) => {
      if (!ctx.isCurrent() || !section.isConnected) return;
      const result = offlineState(status);
      section.dataset.state = result;
      if (result === OFFLINE_STATE.READY) {
        state.textContent = `✓ Приложение сохранено на этом телефоне: все ${status.total} файлов версии ${status.version}. Места, справка, фразы, план и паспорт откроются без сети.`;
      } else if (result === OFFLINE_STATE.PARTIAL) {
        state.textContent = `Офлайн-копия неполная: сохранено ${status.cached} из ${status.total} файлов. Откройте приложение с интернетом ещё раз и нажмите «Проверить снова».`;
      } else {
        state.textContent = OFFLINE_TEXT[result];
      }
      install.hidden = result === OFFLINE_STATE.UNSUPPORTED;
      install.textContent = status.standalone
        ? "Запущено с экрана «Домой» — так и открывайте его в поездке."
        : "Сейчас приложение открыто в браузере. Добавьте его на экран «Домой» и в поездке открывайте с иконки — так надёжнее.";
    });
  }
  again.addEventListener("click", check);
  check();
}

export async function renderPrepare(container, ctx) {
  container.innerHTML = '<p class="loading">Загрузка чек-листа…</p>';

  let cachedItems;
  try {
    cachedItems = await loadChecklist();
  } catch (e) {
    console.error(e);
    if (ctx.isCurrent()) {
      renderErrorState(container, loadErrorMessage(e), () => {
        renderPrepare(container, ctx);
      });
    }
    return;
  }

  if (!ctx.isCurrent()) {
    // Пользователь уже переключился на другой экран, пока грузился JSON.
    return;
  }

  if (!openPhases) {
    openPhases = new Set(getDefaultOpenPhases());
  }

  container.innerHTML = "";

  const heading = document.createElement("h2");
  heading.className = "view-title";
  heading.textContent = "Подготовка к поездке";
  container.appendChild(heading);

  const total = cachedItems.length;

  if (total === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Пока нет проверенных пунктов подготовки.";
    container.appendChild(empty);
    return;
  }

  const groups = groupByPhase(cachedItems);
  const initialState = storage.getChecklistState();

  // Общий прогресс
  const progressWrap = document.createElement("div");
  progressWrap.className = "progress-block";
  const progressText = document.createElement("p");
  progressText.className = "progress-block__text";
  progressWrap.appendChild(progressText);
  const progressBar = document.createElement("div");
  progressBar.className = "progress";
  progressBar.setAttribute("role", "progressbar");
  progressBar.setAttribute("aria-valuemin", "0");
  progressBar.setAttribute("aria-valuemax", String(total));
  const progressFill = document.createElement("div");
  progressFill.className = "progress__fill";
  progressBar.appendChild(progressFill);
  progressWrap.appendChild(progressBar);
  container.appendChild(progressWrap);

  const list = document.createElement("div");
  list.className = "phase-list";
  container.appendChild(list);

  const phaseCountEls = {};

  PHASE_ORDER.forEach((phaseId) => {
    const items = groups[phaseId];
    if (!items.length) return;

    const isOpen = openPhases.has(phaseId);
    const phaseDone = items.filter((i) => initialState[i.id]).length;

    const phaseEl = document.createElement("section");
    phaseEl.className = "phase";
    phaseEl.dataset.open = String(isOpen);
    phaseEl.dataset.phaseId = phaseId;

    const headerBtn = document.createElement("button");
    headerBtn.type = "button";
    headerBtn.className = "phase__header";
    headerBtn.setAttribute("aria-expanded", String(isOpen));

    const headerTitle = document.createElement("span");
    headerTitle.textContent = PHASE_LABELS[phaseId] || phaseId;

    const headerRight = document.createElement("span");
    headerRight.className = "phase__header-right";

    const headerCount = document.createElement("span");
    headerCount.className = "phase__count";
    headerCount.textContent = `${phaseDone} из ${items.length}`;
    phaseCountEls[phaseId] = headerCount;

    const chevron = document.createElement("span");
    chevron.className = "phase__chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.textContent = "⌄";

    headerRight.append(headerCount, chevron);
    headerBtn.append(headerTitle, headerRight);

    headerBtn.addEventListener("click", () => {
      const nowOpen = phaseEl.dataset.open !== "true";
      phaseEl.dataset.open = String(nowOpen);
      headerBtn.setAttribute("aria-expanded", String(nowOpen));
      if (nowOpen) {
        openPhases.add(phaseId);
      } else {
        openPhases.delete(phaseId);
      }
    });

    const body = document.createElement("ul");
    body.className = "phase__body task-list";

    items.forEach((item) => {
      const isDone = Boolean(initialState[item.id]);
      body.appendChild(renderTask(item, isDone));
    });

    phaseEl.append(headerBtn, body);
    list.appendChild(phaseEl);
  });

  function updateProgress() {
    const state = storage.getChecklistState();
    const doneNow = cachedItems.filter((i) => state[i.id]).length;
    progressText.textContent = `Готово ${doneNow} из ${total}`;
    progressFill.style.width = total ? `${(doneNow / total) * 100}%` : "0%";
    progressBar.setAttribute("aria-valuenow", String(doneNow));

    PHASE_ORDER.forEach((phaseId) => {
      const items = groups[phaseId];
      if (!items || !items.length) return;
      const countEl = phaseCountEls[phaseId];
      if (!countEl) return;
      const doneInPhase = items.filter((i) => state[i.id]).length;
      countEl.textContent = `${doneInPhase} из ${items.length}`;
    });
  }

  // Делегирование: один слушатель на список этапов вместо слушателя на
  // каждом чекбоксе для обновления прогресса.
  list.addEventListener("change", (event) => {
    if (event.target && event.target.classList.contains("task__checkbox")) {
      updateProgress();
    }
  });

  updateProgress();
  renderOfflineCheck(container, ctx);
}
