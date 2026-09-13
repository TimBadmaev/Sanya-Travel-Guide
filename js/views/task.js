import { storage } from "../storage.js";
import { formatVerifiedDate } from "../logic/checklist.js";

// Строка пункта чек-листа. Вынесена из prepare.js без изменений разметки:
// тот же элемент нужен «Подготовке» (весь список) и Главной (до 3 ближайших
// дел, MVP-UX-SPEC §3). Отметка пишется здесь, обновление прогресса
// делегировано наверх через всплытие события change.
export function renderTask(item, isDone) {
  const li = document.createElement("li");
  li.className = "task" + (isDone ? " is-done" : "");

  const checkboxId = `task-${item.id}`;

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "task__checkbox";
  checkbox.id = checkboxId;
  checkbox.checked = isDone;
  // Чекбокс не связан с телом строки через <label for> (ITERATION-1-CLOSEOUT.md
  // §3 — тап по строке не должен переключать чекбокс), поэтому даём ему
  // доступное имя напрямую.
  checkbox.setAttribute("aria-label", item.title);

  // Зона нажатия чекбокса должна быть не меньше 44×44px (PRODUCT.md 8.9),
  // при этом сам чекбокс визуально остаётся компактным.
  const checkboxWrap = document.createElement("span");
  checkboxWrap.className = "task__checkbox-wrap";
  checkboxWrap.appendChild(checkbox);

  const details = document.createElement("div");
  details.className = "task__details";
  details.hidden = true;

  // Тело строки — отдельная зона нажатия ≥44×44px, не связанная с чекбоксом:
  // тап по ней только открывает/закрывает детали пункта (ITERATION-1-CLOSEOUT.md §3).
  const bodyBtn = document.createElement("button");
  bodyBtn.type = "button";
  bodyBtn.className = "task__label";
  bodyBtn.setAttribute("aria-expanded", "false");

  const titleSpan = document.createElement("span");
  titleSpan.className = "task__title";
  titleSpan.textContent = item.title;
  if (item.critical) {
    const badge = document.createElement("span");
    badge.className = "badge-critical";
    badge.textContent = "Важно";
    titleSpan.appendChild(badge);
  }
  bodyBtn.appendChild(titleSpan);

  if (item.details) {
    const detailsText = document.createElement("p");
    detailsText.textContent = item.details;
    details.appendChild(detailsText);
  }

  if (item.verifiedAt) {
    const meta = document.createElement("p");
    meta.className = "task__meta";
    meta.textContent = `Проверено: ${formatVerifiedDate(item.verifiedAt)}`;
    details.appendChild(meta);
  }

  if (item.volatile) {
    const volatileNote = document.createElement("p");
    volatileNote.className = "task__meta task__meta--volatile";
    volatileNote.textContent = "Может измениться — проверьте актуальность перед поездкой.";
    details.appendChild(volatileNote);
  }

  if (item.sources && item.sources.length) {
    const sourcesLabel = document.createElement("p");
    sourcesLabel.className = "task__meta sources__label";
    sourcesLabel.textContent = "Источник:";
    details.appendChild(sourcesLabel);

    const sourcesList = document.createElement("div");
    sourcesList.className = "sources__list";
    item.sources.forEach((src) => {
      const a = document.createElement("a");
      a.href = src.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = src.title;
      a.className = "sources__link";
      sourcesList.appendChild(a);
    });
    details.appendChild(sourcesList);
  }

  bodyBtn.addEventListener("click", () => {
    const willOpen = details.hidden;
    details.hidden = !willOpen;
    bodyBtn.setAttribute("aria-expanded", String(willOpen));
    // Только открывает/закрывает детали — stg:checklist не трогает.
  });

  checkbox.addEventListener("change", () => {
    const newDone = checkbox.checked;
    const ok = storage.setChecklistItemDone(item.id, newDone);
    if (!ok) {
      // localStorage недоступен — откатываем визуальное состояние и предупреждаем.
      checkbox.checked = !newDone;
      window.alert("Не удалось сохранить отметку: хранилище браузера недоступно.");
      return;
    }
    li.classList.toggle("is-done", newDone);
    // Дальнейшее обновление прогресса делегировано наверх через всплытие
    // события change — см. слушатель на списке этапов в renderPrepare().
  });

  li.append(checkboxWrap, bodyBtn, details);
  return li;
}
