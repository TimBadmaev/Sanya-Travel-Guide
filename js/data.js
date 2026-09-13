// Загрузка контента из data/*.json.
// Не занимается рендерингом — только получает и возвращает данные.

// Promise-кэш (ITERATION-2-FOUNDATION.md §5): один запрос на файл за сессию
// страницы, параллельные вызовы получают тот же Promise. Нужен, когда один
// JSON понадобится нескольким экранам (например, будущий places.json).
const cache = new Map();

// Тексты состояния ошибки (Итерация 5, M7). Сетевая ошибка означает, что
// файла нет ни в офлайн-кэше, ни в сети: если данные в кэше есть, Service
// Worker отдаёт их и ошибки не возникает вовсе.
const LOAD_ERROR_TEXT = "Не удалось загрузить данные";
const OFFLINE_ERROR_TEXT =
  "Нет соединения. Откройте приложение один раз с интернетом, чтобы оно снова заработало офлайн.";

export function loadErrorMessage(error) {
  return error && error.offline ? OFFLINE_ERROR_TEXT : LOAD_ERROR_TEXT;
}

async function fetchJSON(path) {
  let response;
  try {
    response = await fetch(path, { cache: "no-cache" });
  } catch (e) {
    const error = new Error(`Сетевая ошибка при загрузке ${path}`);
    error.offline = true;
    throw error;
  }
  if (!response.ok) {
    throw new Error(`Не удалось загрузить ${path}: ${response.status}`);
  }
  try {
    return await response.json();
  } catch (e) {
    throw new Error(`Файл ${path} повреждён или имеет неверный формат`);
  }
}

// Один запрос на файл за сессию страницы; при ошибке запись удаляется,
// чтобы «Повторить» сделал новый запрос.
function loadJSON(path) {
  if (!cache.has(path)) {
    cache.set(path, fetchJSON(path).catch((error) => {
      cache.delete(path);
      throw error;
    }));
  }
  return cache.get(path);
}

// Возвращает только записи со status "verified" — черновики пользователю
// не показываются (D-18 PRODUCT.md).
export async function loadChecklist() {
  const items = await loadJSON("data/checklist.json");
  return items.filter((item) => item.status === "verified");
}

// Возвращает только записи со status "verified" (D-18 PRODUCT.md).
export async function loadInfo() {
  const items = await loadJSON("data/info.json");
  return items.filter((item) => item.status === "verified");
}

// Возвращает только записи со status "verified" (D-18 PRODUCT.md).
export async function loadPlaces() {
  const items = await loadJSON("data/places.json");
  return items.filter((item) => item.status === "verified");
}

// Контакты «Под рукой» (CONTENT-ITERATION-4.md §2): { id, group, label,
// number, tel, note, sources, verifiedAt }. Поля status у записей нет —
// раздел перенесён целиком как проверенный. Возвращается новый массив.
export async function loadContacts() {
  const items = await loadJSON("data/contacts.json");
  return items.slice();
}

// Фразы на китайском (CONTENT-ITERATION-4.md §3): { id, ru, zh, pinyin,
// context, source, verifiedAt }. Как и контакты — без status.
export async function loadPhrases() {
  const items = await loadJSON("data/phrases.json");
  return items.slice();
}

// Справочники (D-20). Районы — только verified; категории и теги статуса
// не имеют (MVP-UX-SPEC §10). Возвращается новый объект с новыми массивами.
export async function loadConfig() {
  const config = await loadJSON("data/config.json");
  return {
    areas: config.areas.filter((area) => area.status === "verified"),
    categories: config.categories.slice(),
    tags: config.tags.slice(),
  };
}
