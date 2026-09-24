import { storage, USER_DATA_KEYS } from "../storage.js";
import {
  IMPORT_ERROR,
  IMPORT_ERROR_TEXT,
  SECTION_LABELS,
  backupFileName,
  buildBackup,
  countRaw,
  countSection,
  parseBackup,
  sectionUnit,
  serializeBackup,
} from "../logic/backup.js";
import { pluralizeRu } from "../logic/trip.js";
import { getAppVersion } from "../pwa.js";
import { appendBackLink, createConfirm, parentFrom } from "./plan.js";
import { bindCopyButton } from "./taxi.js";

// «Мои данные» (#/data, Iteration 9, ITERATION-9-IMPLEMENTATION-2026-09.md §4):
// копия всех данных пользователя одним JSON-файлом и восстановление из неё.
// Вложенный экран «Сейчас», как #/settings и #/expenses. Всё офлайн: файл
// собирается и читается в браузере, сети и сервера нет.

const SAVE_FAILED_TEXT = "Не удалось записать: хранилище браузера недоступно или переполнено. Ваши прежние данные не изменились.";

function appendText(parent, tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.textContent = text;
  parent.appendChild(el);
  return el;
}

// «Расходы — 23 записи»; раздел без счётной единицы — «есть».
function sectionLine(key, value) {
  const count = countSection(key, value);
  const unit = sectionUnit(key);
  const label = SECTION_LABELS[key];
  if (unit) return `${label} — ${count} ${pluralizeRu(count, unit)}`;
  return count ? `${label} — есть` : `${label} — не заданы`;
}

function formatStamp(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Текущие данные — нормализованные, как их читает приложение.
function currentSections() {
  const raw = storage.readUserData();
  const sections = {};
  Object.keys(raw).forEach((key) => {
    const value = storage.normalizeSection(key, raw[key]);
    if (value !== null) sections[key] = value;
  });
  return sections;
}

async function currentBackupText() {
  const version = await getAppVersion().catch(() => null);
  return serializeBackup(buildBackup(storage.readUserData(), { appVersion: version }));
}

function downloadText(text, fileName) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function renderBackup(container, ctx) {
  const parent = parentFrom(ctx, ["/settings", "/expenses", "/"], "#/settings");

  function draw(message) {
    if (!ctx.isCurrent()) return;
    container.innerHTML = "";
    appendBackLink(container, "← Назад", parent, ctx);
    appendText(container, "h2", "view-title", "Мои данные");
    appendText(
      container,
      "p",
      "settings__intro",
      "Расходы, план, избранное и отметки хранятся только в этом браузере на этом телефоне. Сохраните копию файлом — из неё можно восстановить данные здесь же или на другом телефоне. Всё работает без интернета."
    );
    if (!storage.isAvailable()) {
      appendText(container, "p", "area-notice", "Хранилище браузера недоступно — сохранять и восстанавливать нечего.");
      return;
    }
    if (message) {
      const done = appendText(container, "p", "backup-message", message);
      done.setAttribute("role", "status");
    }

    renderSummary(container);
    renderExport(container);
    renderUndo(container, draw);
    renderImport(container, draw);
  }

  draw();
}

function renderSummary(container) {
  const sections = currentSections();
  const section = document.createElement("section");
  section.className = "settings-section";
  appendText(section, "h3", "settings-section__title", "Сейчас на этом телефоне");
  const list = document.createElement("ul");
  list.className = "backup-list";
  Object.keys(SECTION_LABELS).forEach((key) => {
    appendText(list, "li", "", key in sections ? sectionLine(key, sections[key]) : `${SECTION_LABELS[key]} — нет`);
  });
  section.appendChild(list);
  container.appendChild(section);
}

function renderExport(container) {
  const section = document.createElement("section");
  section.className = "settings-section backup-actions";
  appendText(section, "h3", "settings-section__title", "Сохранить копию");

  const download = appendText(section, "button", "btn btn--primary", "Скачать файл копии");
  download.type = "button";
  download.addEventListener("click", async () => {
    downloadText(await currentBackupText(), backupFileName());
  });

  // «Отправить» — системное меню «Поделиться» с файлом, где браузер это умеет
  // (Web Share с файлами): удобно сразу отправить копию себе в мессенджер.
  const probe = typeof File === "function" ? new File(["{}"], "probe.json", { type: "application/json" }) : null;
  if (probe && navigator.canShare && navigator.canShare({ files: [probe] })) {
    const share = appendText(section, "button", "btn btn--secondary", "Отправить файл копии…");
    share.type = "button";
    share.addEventListener("click", async () => {
      const file = new File([await currentBackupText()], backupFileName(), { type: "application/json" });
      try {
        await navigator.share({ files: [file], title: "Копия данных Sanya Travel Guide" });
      } catch (e) {
        // Пользователь закрыл меню — не ошибка.
      }
    });
  }

  // Текстом — запасной путь, если файлы на телефоне сохранить неудобно:
  // копию можно вставить в заметки и потом обратно в поле ниже.
  let cachedText = "";
  const copy = appendText(section, "button", "btn btn--secondary", "Скопировать копию как текст");
  copy.type = "button";
  const copyStatus = appendText(section, "p", "place-actions__status", "");
  copyStatus.setAttribute("role", "status");
  // Текст готовится заранее: копирование в буфер должно идти в том же
  // нажатии, без ожидания (иначе iOS запрещает запись в буфер).
  currentBackupText().then((text) => {
    cachedText = text;
  });
  bindCopyButton(copy, copyStatus, () => cachedText || serializeBackup(buildBackup(storage.readUserData())));

  appendText(
    section,
    "p",
    "settings__hint",
    "В копию входят только ваши данные: расходы, курс и бюджет, мой план, отметки, избранное, даты и адрес проживания. Места, экскурсии и справка — часть приложения, их копировать не нужно."
  );
  container.appendChild(section);
}

// Откат последнего импорта: снимок, снятый перед заменой.
function renderUndo(container, draw) {
  const snapshotText = storage.getImportBackup();
  if (!snapshotText) return;
  const parsed = parseBackup(snapshotText);
  const section = document.createElement("section");
  section.className = "settings-section backup-actions";
  appendText(section, "h3", "settings-section__title", "Данные до последнего импорта");
  if (!parsed.ok) {
    appendText(section, "p", "settings__hint", "Сохранённый снимок повреждён — вернуть его нельзя.");
  } else {
    const stamp = formatStamp(parsed.backup.exportedAt);
    appendText(section, "p", "settings__hint", `Перед импортом приложение сохранило ваши прежние данные${stamp ? ` (${stamp})` : ""}. Их можно вернуть.`);
  }
  const status = appendText(section, "p", "settings__status", "");
  status.setAttribute("role", "status");
  const buttons = document.createElement("div");
  buttons.className = "backup-buttons";
  if (parsed.ok) {
    const undo = appendText(buttons, "button", "btn btn--secondary", "Вернуть как было до импорта");
    undo.type = "button";
    undo.addEventListener("click", () => {
      undo.hidden = true;
      const box = createConfirm(
        "Вернуть данные, которые были до импорта? Данные из импортированной копии будут заменены.",
        [
          {
            label: "Вернуть",
            primary: true,
            onClick: () => {
              const sections = {};
              Object.keys(parsed.sections).forEach((key) => {
                const value = storage.normalizeSection(key, parsed.sections[key]);
                if (value !== null) sections[key] = value;
              });
              if (!storage.applyUserData(sections, null, true)) {
                status.textContent = SAVE_FAILED_TEXT;
                return;
              }
              storage.clearImportBackup();
              draw("Готово: вернули данные, которые были до импорта.");
            },
          },
        ],
        () => {
          box.remove();
          undo.hidden = false;
          undo.focus();
        }
      );
      undo.after(box);
      box.querySelector("button").focus();
    });
  }
  const forget = appendText(buttons, "button", "settings-actions__skip", "Удалить этот снимок");
  forget.type = "button";
  forget.addEventListener("click", () => {
    storage.clearImportBackup();
    draw();
  });
  section.appendChild(buttons);
  section.appendChild(status);
  container.appendChild(section);
}

function renderImport(container, draw) {
  const section = document.createElement("section");
  section.className = "settings-section backup-actions";
  appendText(section, "h3", "settings-section__title", "Восстановить из копии");
  appendText(section, "p", "settings__hint", "Разделы из копии заменят такие же разделы на этом телефоне; разделов, которых в копии нет, импорт не коснётся. Перед заменой приложение покажет, что именно изменится, и сохранит прежние данные.");

  const status = appendText(section, "p", "settings__status", "");
  status.setAttribute("role", "status");
  const preview = document.createElement("div");
  preview.className = "backup-preview";

  const showPreview = (text) => {
    preview.innerHTML = "";
    status.textContent = "";
    const parsed = parseBackup(text);
    if (!parsed.ok) {
      status.textContent = IMPORT_ERROR_TEXT[parsed.error];
      return;
    }
    const normalized = {};
    const lines = [];
    const skipped = [];
    Object.keys(SECTION_LABELS).forEach((key) => {
      if (!(key in parsed.sections)) return;
      const value = storage.normalizeSection(key, parsed.sections[key]);
      if (value === null) {
        skipped.push(`${SECTION_LABELS[key]} — повреждён, пропущен`);
        return;
      }
      normalized[key] = value;
      const raw = countRaw(key, parsed.sections[key]);
      const kept = countSection(key, value);
      const dropped = raw !== null && raw > kept ? raw - kept : 0;
      lines.push(dropped ? `${sectionLine(key, value)} (повреждённых пропущено: ${dropped})` : sectionLine(key, value));
    });
    if (!Object.keys(normalized).length) {
      status.textContent = IMPORT_ERROR_TEXT[IMPORT_ERROR.EMPTY];
      return;
    }
    const stamp = formatStamp(parsed.backup.exportedAt);
    const version = parsed.backup.appVersion ? ` · версия ${parsed.backup.appVersion}` : "";
    appendText(preview, "p", "backup-preview__title", `Копия${stamp ? ` от ${stamp}` : ""}${version}`);
    appendText(preview, "p", "backup-preview__label", "Будет заменено на данные из копии:");
    const list = document.createElement("ul");
    list.className = "backup-list";
    lines.forEach((line) => appendText(list, "li", "", line));
    preview.appendChild(list);
    const untouched = USER_DATA_KEYS.filter((key) => !(key in normalized)).map((key) => SECTION_LABELS[key]);
    if (untouched.length) appendText(preview, "p", "settings__hint", `Не изменится: ${untouched.join(", ").toLowerCase()}.`);
    if (skipped.length || parsed.unknownKeys.length) {
      appendText(preview, "p", "settings__hint", [...skipped, ...(parsed.unknownKeys.length ? [`неизвестных разделов пропущено: ${parsed.unknownKeys.length}`] : [])].join("; ") + ".");
    }
    preview.appendChild(
      createConfirm(
        "Заменить эти данные на телефоне данными из копии?",
        [
          {
            label: "Заменить мои данные",
            primary: true,
            onClick: async () => {
              const snapshot = await currentBackupText();
              // Экран могли покинуть, пока готовился снимок.
              if (!preview.isConnected) return;
              if (!storage.applyUserData(normalized, snapshot)) {
                status.textContent = SAVE_FAILED_TEXT;
                return;
              }
              draw("Готово: данные восстановлены из копии. Прежние данные сохранены — их можно вернуть ниже.");
            },
          },
        ],
        () => {
          preview.innerHTML = "";
        }
      )
    );
    preview.querySelector(".plan-confirm button").focus();
  };

  // Выбор файла: нативный input, подпись — кнопка во всю ширину (≥44 px).
  const fileLabel = document.createElement("label");
  fileLabel.className = "btn btn--secondary backup-file";
  fileLabel.htmlFor = "backup-file";
  fileLabel.textContent = "Выбрать файл копии";
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.id = "backup-file";
  fileInput.accept = ".json,application/json,text/plain";
  fileInput.className = "backup-file__input";
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = "";
    if (!file) return;
    let text = "";
    try {
      text = await file.text();
    } catch (e) {
      status.textContent = IMPORT_ERROR_TEXT[IMPORT_ERROR.NOT_JSON];
      return;
    }
    showPreview(text);
  });
  section.append(fileLabel, fileInput);

  // Вставка текста — пара к «Скопировать копию как текст».
  const pasteField = document.createElement("div");
  pasteField.className = "settings-field settings-field--stacked";
  const pasteLabel = appendText(pasteField, "label", "settings-field__label", "Или вставьте текст копии");
  pasteLabel.htmlFor = "backup-text";
  const textarea = document.createElement("textarea");
  textarea.id = "backup-text";
  textarea.rows = 3;
  textarea.className = "settings-field__input";
  textarea.autocomplete = "off";
  textarea.spellcheck = false;
  pasteField.appendChild(textarea);
  section.appendChild(pasteField);
  const check = appendText(section, "button", "btn btn--secondary", "Проверить текст копии");
  check.type = "button";
  check.addEventListener("click", () => {
    if (!textarea.value.trim()) {
      status.textContent = "Вставьте текст копии в поле выше.";
      textarea.focus();
      return;
    }
    showPreview(textarea.value);
  });

  section.append(status, preview);
  container.appendChild(section);
}
