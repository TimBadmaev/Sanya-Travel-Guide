// Полноэкранный экран «показать с экрана» (§14.2) и копирование текста.
// Вынесены из place.js в Итерации 4: тот же экран показывает таксисту место,
// адрес проживания и фразу из «Под рукой» — один механизм, а не три похожих
// (ITERATION-4-IMPLEMENTATION.md, прецедент — task.js).

const COPIED_TEXT = "Скопировано ✓";
const COPY_FAILED_TEXT = "Не удалось скопировать — выделите текст вручную.";

// Возвращает true, если текст скопирован. Clipboard API есть только в secure
// context, а проверка с телефона идёт по http://192.168.x.x, поэтому есть
// запасной путь через execCommand ([PI-6]).
async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      // ниже — запасной путь
    }
  }
  const previousFocus = document.activeElement;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  // Вне экрана; 16px — чтобы iOS не зумил страницу при фокусе.
  textarea.style.cssText = "position:fixed;top:0;left:-9999px;font-size:16px;";
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch (e) {
    ok = false;
  }
  textarea.remove();
  if (previousFocus && previousFocus.focus) previousFocus.focus();
  return ok;
}

// Видимая реакция на копирование (PRODUCT.md 8.9): успех — текст кнопки
// «Скопировано ✓» ~2 с; неудача — сообщение в role=status.
export function bindCopyButton(button, status, getText) {
  const originalText = button.textContent;
  let timer = null;
  button.addEventListener("click", async () => {
    const ok = await copyText(getText());
    if (!button.isConnected) return; // пользователь уже ушёл с экрана
    clearTimeout(timer);
    if (ok) {
      status.textContent = "";
      button.textContent = COPIED_TEXT;
      timer = setTimeout(() => {
        button.textContent = originalText;
      }, 2000);
    } else {
      button.textContent = originalText;
      status.textContent = COPY_FAILED_TEXT;
    }
  });
}

// Шапка и нижняя панель уже скрыты роутером (флаг fullscreen маршрута).
// lines — [{ text, className, lang? }] сверху вниз, пустые строки пропускаются;
// closeHref — адрес родителя для разметки ссылки, onClose — сам выход
// (ctx.back родителя): не ссылка-переход, иначе [родитель, экран, родитель]
// и петля при Back (ITERATION-2-FOUNDATION.md §6.5).
export function renderShowScreen(container, { lines, getCopyText, closeHref, onClose }) {
  container.innerHTML = "";

  const taxi = document.createElement("div");
  taxi.className = "taxi";

  const content = document.createElement("div");
  content.className = "taxi__content";
  lines
    .filter((line) => line.text)
    .forEach((line) => {
      const p = document.createElement("p");
      p.className = line.className;
      if (line.lang) p.lang = line.lang;
      p.textContent = line.text;
      content.appendChild(p);
    });

  const actions = document.createElement("div");
  actions.className = "taxi__actions";

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "btn btn--secondary";
  copyBtn.textContent = "Скопировать";

  const closeLink = document.createElement("a");
  closeLink.href = closeHref;
  closeLink.className = "btn btn--primary";
  closeLink.textContent = "Закрыть";
  closeLink.addEventListener("click", (event) => {
    event.preventDefault();
    onClose();
  });

  const status = document.createElement("p");
  status.className = "taxi__status";
  status.setAttribute("role", "status");

  bindCopyButton(copyBtn, status, getCopyText);

  actions.append(copyBtn, closeLink, status);
  taxi.append(content, actions);
  container.appendChild(taxi);
}
