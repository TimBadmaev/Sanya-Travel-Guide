// Копия данных пользователя: экспорт и импорт одним JSON-файлом (Iteration 9,
// ITERATION-9-IMPLEMENTATION-2026-09.md §4). Чистые функции: без DOM и без
// хранилища (PRODUCT.md 10.3) — чтение, нормализацию разделов и запись делает
// storage.js, файл и подтверждение — экран views/backup.js.
//
// Формат файла (schemaVersion 1):
//   {
//     "app": "sanya-travel-guide",
//     "kind": "user-data-backup",
//     "schemaVersion": 1,
//     "exportedAt": "2026-11-19T10:00:00.000Z",
//     "appVersion": "v15" | null,
//     "data": { "stg:trip": {…}, "stg:expenses": {…}, … }
//   }
// data — только пользовательское состояние, ключи localStorage как есть,
// значения — как они хранятся. Контент (data/*.json) в копию не входит.

export const BACKUP_APP = "sanya-travel-guide";
export const BACKUP_KIND = "user-data-backup";
export const BACKUP_SCHEMA_VERSION = 1;

// Подписи разделов для экрана — в порядке показа.
export const SECTION_LABELS = {
  "stg:expenses": "Расходы",
  "stg:budget": "Курс и бюджет",
  "stg:myplan": "Мой план",
  "stg:plandone": "Отметки «сделано» в плане",
  "stg:saved": "Избранные места",
  "stg:checklist": "Отметки подготовки",
  "stg:trip": "Даты, район и адрес проживания",
};

export const IMPORT_ERROR = {
  NOT_JSON: "not-json",
  NOT_BACKUP: "not-backup",
  NEWER: "newer",
  EMPTY: "empty",
};

export const IMPORT_ERROR_TEXT = {
  [IMPORT_ERROR.NOT_JSON]: "Не удалось импортировать: файл повреждён или это не JSON.",
  [IMPORT_ERROR.NOT_BACKUP]: "Не удалось импортировать: это не копия данных Sanya Travel Guide.",
  [IMPORT_ERROR.NEWER]: "Не удалось импортировать: копия сделана более новой версией приложения. Обновите приложение и попробуйте снова.",
  [IMPORT_ERROR.EMPTY]: "Не удалось импортировать: в копии нет данных, которые можно восстановить.",
};

export function buildBackup(data, { now = new Date(), appVersion = null } = {}) {
  const payload = {};
  Object.keys(SECTION_LABELS).forEach((key) => {
    if (data && Object.prototype.hasOwnProperty.call(data, key)) payload[key] = data[key];
  });
  return {
    app: BACKUP_APP,
    kind: BACKUP_KIND,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    appVersion: typeof appVersion === "string" && appVersion ? appVersion : null,
    data: payload,
  };
}

export function serializeBackup(backup) {
  return JSON.stringify(backup, null, 2);
}

// «sanya-guide-backup-2026-11-19.json» — дата по часам устройства.
export function backupFileName(now = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `sanya-guide-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

// Миграции формата копии: версия → функция, поднимающая копию на одну версию.
// Сейчас версия одна — таблица пустая; новая версия формата добавляет сюда
// шаг, и старые файлы продолжают читаться. Идемпотентна: копия текущей версии
// возвращается как есть.
const MIGRATIONS = {};

export function migrateBackup(backup) {
  let current = backup;
  while (current.schemaVersion < BACKUP_SCHEMA_VERSION) {
    const step = MIGRATIONS[current.schemaVersion];
    if (!step) break;
    current = step(current);
  }
  return current;
}

// Разбор текста файла. Результат:
//   { ok: false, error }                       — ошибка из IMPORT_ERROR
//   { ok: true, backup, sections, unknownKeys } — sections — { ключ: сырое значение }
// Разделы нормализуются позже (storage.normalizeSection), здесь — только
// конверт: формат, версия, наличие данных.
export function parseBackup(text) {
  let parsed;
  try {
    parsed = JSON.parse(typeof text === "string" ? text.replace(/^﻿/, "") : "");
  } catch (e) {
    return { ok: false, error: IMPORT_ERROR.NOT_JSON };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, error: IMPORT_ERROR.NOT_BACKUP };
  if (parsed.app !== BACKUP_APP || parsed.kind !== BACKUP_KIND) return { ok: false, error: IMPORT_ERROR.NOT_BACKUP };
  if (!Number.isInteger(parsed.schemaVersion) || parsed.schemaVersion < 1) return { ok: false, error: IMPORT_ERROR.NOT_BACKUP };
  if (parsed.schemaVersion > BACKUP_SCHEMA_VERSION) return { ok: false, error: IMPORT_ERROR.NEWER };
  const backup = migrateBackup(parsed);
  const data = backup.data && typeof backup.data === "object" && !Array.isArray(backup.data) ? backup.data : null;
  if (!data) return { ok: false, error: IMPORT_ERROR.NOT_BACKUP };
  const sections = {};
  const unknownKeys = [];
  Object.keys(data).forEach((key) => {
    if (key in SECTION_LABELS) {
      sections[key] = data[key];
    } else {
      unknownKeys.push(key);
    }
  });
  if (!Object.keys(sections).length) return { ok: false, error: IMPORT_ERROR.EMPTY };
  return { ok: true, backup, sections, unknownKeys };
}

// Сколько записей в нормализованном разделе — для подтверждения и отчёта.
export function countSection(key, value) {
  if (value === null || value === undefined) return 0;
  switch (key) {
    case "stg:expenses":
      return Array.isArray(value.items) ? value.items.length : 0;
    case "stg:myplan":
    case "stg:plandone":
      return value.days && typeof value.days === "object" ? Object.keys(value.days).length : 0;
    case "stg:saved":
      return Array.isArray(value) ? value.length : 0;
    case "stg:checklist":
      return typeof value === "object" ? Object.keys(value).length : 0;
    case "stg:budget":
      return (value.rates ? Object.keys(value.rates).length : 0) + (value.budget ? 1 : 0);
    case "stg:trip":
      return ["start", "end", "area", "stay", "home"].filter((field) => value[field]).length;
    default:
      return 0;
  }
}

// Сколько исходных записей раздела было в файле — чтобы честно сказать,
// сколько повреждённых отброшено при нормализации.
export function countRaw(key, value) {
  if (!value || typeof value !== "object") return 0;
  switch (key) {
    case "stg:expenses":
      return Array.isArray(value.items) ? value.items.length : 0;
    case "stg:myplan":
    case "stg:plandone":
      return value.days && typeof value.days === "object" && !Array.isArray(value.days) ? Object.keys(value.days).length : 0;
    case "stg:saved":
      return Array.isArray(value) ? value.length : 0;
    case "stg:checklist":
      return Array.isArray(value) ? 0 : Object.keys(value).length;
    default:
      return null;
  }
}

// «23 записи» / «12 дней» — единица раздела.
export function sectionUnit(key) {
  switch (key) {
    case "stg:expenses":
      return ["запись", "записи", "записей"];
    case "stg:myplan":
    case "stg:plandone":
      return ["день", "дня", "дней"];
    case "stg:saved":
      return ["место", "места", "мест"];
    case "stg:checklist":
      return ["отметка", "отметки", "отметок"];
    default:
      return null;
  }
}
