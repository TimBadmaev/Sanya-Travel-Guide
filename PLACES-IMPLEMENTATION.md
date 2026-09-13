# Places — Implementation Specification

> Технический контракт реализации Итерации 2 «Места» поверх уже выполненного foundation.
> Источники: `CLAUDE.md`, `PRODUCT.md` v1.1 (журнал до 1.2), `MVP-UX-SPEC.md`, `ITERATION-2-FOUNDATION.md` v1.0, `CONTENT-PLACES.md` v1.0, `INFO-IMPLEMENTATION.md` v1.0 (как образец list/detail), фактический код (`index.html`, `js/**`, `css/styles.css`, `data/*.json`) на 2026-09-11.
> Версия: **1.1** · Дата: **2026-09-12**
> Документ не меняет код, не создаёт `data/config.json` и `data/places.json`, не меняет продуктовые документы.
>
> **Редакция 1.1 (2026-09-12) — синхронизация с фактическими `data/config.json` и `data/places.json`.** Обновлены только разделы, где документ утверждал о данных то, что расходится с JSON: 1.2, 2.3, §7 (контрольные значения расстояний изъяты), §17, К-6, 19.A. Контракты кода (разделы 3–16), решения [PI-n] и дефолты 19.B не пересматривались.
> **Раздел 0.1 описывает код до реализации Итерации 2** и намеренно оставлен как есть — фактическое состояние кода после реализации зафиксировано в `ITERATION-2-CLOSEOUT.md` §2–§6.

---

## 0. Как читать

- **Foundation — установленный контракт.** Роутер, `ctx`, Promise-кэш, правила истории, прокрутки и sticky не пересматриваются. Этот документ только добавляет к ним «Места».
- **`[PI-n]`** — решение, которое принимает этот документ, потому что спецификации его не фиксируют (сводка — раздел 20). Любое можно отменить, это не `D-xx`.
- **`[OQ-n]`** — открытый вопрос (раздел 19). У вопросов, не блокирующих код, указан дефолт, с которым можно начинать реализацию.
- **`[К-n]`** — противоречие между документами или между документами и кодом (раздел 18).

### 0.1 Фактическое состояние кода (проверено чтением файлов)

| Файл | Состояние | Значение для «Мест» |
|---|---|---|
| `js/app.js` | Эталон foundation C1–C4 применён: массив `routes` с якорными regexp и `nav`, `parseHash()` → `{ path, query }`, `navId` / `ctx.isCurrent()`, `scrollRestoration = "manual"`, `history.state = { key, from }`, `scrollPositions`, `back(parentHash)`. Флага `fullscreen` нет | Добавляются только 2 маршрута, 1 импорт и 1 строка fullscreen (раздел 5) |
| `js/data.js` | C5 применён: `cache: Map<path, Promise>`, `fetchJSON()`, `loadJSON()`; публичные `loadChecklist()`, `loadInfo()` с фильтром `verified` | Добавляются `loadConfig()`, `loadPlaces()` (раздел 3) |
| `js/storage.js` | `KEYS.saved = "stg:saved"` объявлен с комментарием «зарезервировано»; публичный объект `storage` = `{ isAvailable, getChecklistState, setChecklistItemDone }` | Добавляются 2 функции избранного (раздел 10) |
| `js/views/places.js` | Синхронная заглушка `renderPlaces(container)` | Заменяется целиком (раздел 8) |
| `js/views/place.js` | Нет | Новый (раздел 9) |
| `js/logic/filters.js`, `distance.js` | Нет | Новые (разделы 6, 7) |
| `js/views/info.js`, `prepare.js` | На контракте раздела 7 foundation (C6, C8): `ctx.isCurrent()` после `await`, retry тем же `ctx`, `ctx.back()` у «← К справке» | Образец для экранов «Мест»; не меняются |
| `js/logic/checklist.js` | `formatVerifiedDate()` (используется и в `info.js`) | Переиспользуется в карточке места |
| `css/styles.css` | C7 применён (`#app { overflow-x: clip }`, у `.app-main` нет `overflow-y`); C9 тоже применён (`.task { flex-wrap: wrap }`) | Sticky работает; добавляются стили раздела 15 |
| `index.html` | Вкладка «Места» — `<a href="#/places" data-route="/places">` | Не меняется |
| `data/` | `checklist.json`, `info.json` — массивы записей | `config.json` и `places.json` отсутствуют (создаются отдельным шагом, раздел 16) |

Grep по `js/`: `location.hash =` и `pushState` не встречаются — инвариант 3.5 foundation соблюдён.

---

## 1. Схема `data/config.json`

Источник схемы — `MVP-UX-SPEC.md` §10 (форма JSON) и `PRODUCT.md` 9.4 (поля районов). Значения — `CONTENT-PLACES.md` §2–4. Файл — **объект** (в отличие от `checklist.json` / `info.json`, которые являются массивами).

```json
{
  "areas": [
    { "id": "<area-id>", "name": "<название в интерфейсе>", "center": { "lat": 0.0, "lng": 0.0 }, "status": "verified" },
    { "id": "other", "name": "Другое / за пределами центральных районов", "center": null, "status": "verified" }
  ],
  "categories": [
    { "id": "<category-id>", "name": "<подпись чипа>", "icon": "<ключ иконки>" }
  ],
  "tags": [
    { "id": "<tag-id>", "name": "<подпись>" }
  ]
}
```

### 1.1 Поля

| Поле | Тип | Обяз. | Правило |
|---|---|---|---|
| `areas[].id` | строка | да | Латиница, цифры, дефис; уникально; не меняется. 6 id из `PRODUCT.md` 9.4 / `CONTENT-PLACES.md` §2 |
| `areas[].name` | строка | да | Как в интерфейсе (`CONTENT-PLACES.md` §2, столбец «Название») |
| `areas[].center` | `{ lat, lng }` \| `null` | да | WGS-84 (D-19). `null` допустим **только** у района без физического центра (`other`) — см. [К-5], [OQ-8] |
| `areas[].status` | `draft` \| `verified` | да | Показываются только `verified` (D-18 распространяется на справочник так же, как на записи) |
| `categories[].id` | строка | да | Уникально. **Не может совпадать с токенами флаговых фильтров** `short`, `easy`, `indoor`, `free`, `saved`, `kids` (раздел 11) |
| `categories[].name` | строка | да | Подпись чипа категории — [OQ-13] |
| `categories[].icon` | строка | да | Ключ иконки (как в примере MVP-UX-SPEC §10: `"icon": "beach"`). Ключ → эмодзи сопоставляет view — [PI-7], [OQ-14] |
| `tags[].id` | строка | да | Уникально |
| `tags[].name` | строка | да | Подпись; для `kids` — подпись чипа «С детьми» |

- У `categories` и `tags` поля `status` нет (схема MVP-UX-SPEC §10 его не предусматривает) — показываются все.
- **Порядок элементов массивов = порядок в интерфейсе**: порядок чипов категорий; порядок районов в будущих настройках (Итерация 3).
- D-20: значение нельзя использовать в `places.json`, пока его нет в справочнике. Код это не проверяет в рантайме — проверка входит в валидацию данных (раздел 17, сниппет целостности).
- Отдельной секции «подписи для интерфейса» (`PRODUCT.md` 9.1) не вводим — см. [К-10].

### 1.2 Готовность значений (по `CONTENT-PLACES.md`)

| Справочник | Готово к переносу | Фактически в `config.json` (2026-09-12) | Блокирует |
|---|---|---|---|
| `areas`: `dadonghai`, `yalong`, `sanya-bay`, `haitang` | Да (§2, координаты с источниками) | Перенесены, значения совпадают с `CONTENT-PLACES.md` §2 | — |
| `areas`: `city` | **Нет** — выбор точки центра | **Перенесена общегородская точка 18.253330, 109.503610** (Wikipedia, проверено 2026-09-11). Решения владельца не было | [OQ-1] — формально открыт |
| `areas`: `other` | Да, при подтверждении `center: null` | `center: null`, `status: "verified"` | [OQ-8] — формально открыт |
| `categories` (6) | id — да (§3); подписи чипов — нужен выбор формулировки | Короткие подписи (дефолт [OQ-13]): «Пляжи», «Природа», «Культура», «Развлечения», «Рынки», «Покупки» | [OQ-13] — принят дефолт |
| `tags` (6) | Да (§4; подписи — `PRODUCT.md` 9.4) | Перенесены все 6 | — |

В Итерации 2 районы **не использовались интерфейсом** (расстояние — [OQ-10]). Фактически `config.json` создан 2026-09-11 со всеми шестью районами, то есть [OQ-1] и [OQ-8] не заблокировали ни данные, ни код — они остались открытыми вопросами к владельцу. С Итерации 3 `areas` становятся видимыми пользователю (выбор района), поэтому цена нерешённого [OQ-1] возрастает — см. `ITERATION-3-IMPLEMENTATION.md`.

---

## 2. Схема `data/places.json`

Массив записей. Поля — точно `PRODUCT.md` 9.2 / `MVP-UX-SPEC.md` §10, без новых полей.

```json
{
  "id": "kebab-case-id",
  "status": "draft | verified",
  "name": { "ru": "string", "zh": "string", "en": "string (необяз.)" },
  "addressZh": "string",
  "area": "<id из config.areas>",
  "category": "<id из config.categories>",
  "tags": ["<id из config.tags>"],
  "location": { "lat": 0.0, "lng": 0.0 },
  "summary": "string — одна фраза",
  "why": ["string", "string"],
  "durationHours": [1, 3],
  "effort": "low | medium | high",
  "setting": "outdoor | indoor | mixed",
  "price": { "type": "free | paid | unknown", "note": "string (необяз.)" },
  "hours": "string (необяз.)",
  "bestTime": "string (необяз.)",
  "tips": ["string (необяз.)"],
  "sources": [{ "title": "string", "url": "string" }],
  "verifiedAt": "YYYY-MM-DD"
}
```

### 2.1 Правила записи `verified` (что код считает гарантированным)

Код **доверяет** `verified`-записям и не валидирует их в рантайме (как `checklist.json` / `info.json`; защита данных — вне scope, ср. I4/I5 в `ITERATION-1-CLOSEOUT.md`). Поэтому до публикации каждая `verified`-запись обязана:

1. иметь все обязательные поля: `id, status, name.ru, name.zh, addressZh, area, category, location, summary, why, durationHours, effort, setting, price.type, sources, verifiedAt`;
2. `id` — уникален, `[a-z0-9-]+` (роутер не декодирует параметр, foundation 3.2);
3. `area`, `category`, каждый элемент `tags` — существуют в `config.json` (D-20);
4. `location.lat/lng` — числа, не нули (правило `PRODUCT.md` 9.8);
5. нигде нет «НУЖНО ПРОВЕРИТЬ» (9.8);
6. `why` — массив из 2–3 строк; `tips` — массив (может быть пустым или отсутствовать);
7. `durationHours` — два числа `> 0`, `[0] ≤ [1]`;
8. `sources` — минимум один элемент **с непустым `url`** (D-18, 9.2);
9. `verifiedAt` — `YYYY-MM-DD` (формат, который понимает `formatVerifiedDate()`).

Нарушение п. 1–7 даёт ошибку рендера (пустой экран + `console.error`) — ловится сниппетом целостности (раздел 17) до публикации, а не кодом.

### 2.2 Правила переноса из `CONTENT-PLACES.md` в JSON

Таблицы `CONTENT-PLACES.md` §5 содержат в ячейках редакторские пометки, которые не являются пользовательским текстом ([К-7]). При создании JSON:

| Поле | Правило |
|---|---|
| `name.zh`, `addressZh` | Только китайская строка. Пояснения в скобках и после тире («по данным visitsanya.com», «— адрес причала…», «(椰梦长廊)» как комментарий) не переносятся |
| `location` | Только основная пара координат; альтернативные точки из комментариев не переносятся |
| `why` | Строка с `;` делится на 2–3 элемента массива по `;`; текст пунктов не перефразируется |
| `durationHours`, `effort` | Только значение; пометки «(редакторская оценка)», «(подъём на холм…)» не переносятся |
| `price.note` | Только пользовательская часть. Служебные пометки («требует переподтверждения перед публикацией», «не переносить цифру как окончательную», «по правилу проекта…») не переносятся — это указания владельцу ([OQ-6]) |
| `sources` | Только источники с URL, в форме `{ title, url }`. Описательные упоминания без URL («агрегированные travel-источники», «OpenStreetMap/Nominatim») в JSON не попадают |
| `hours`, `bestTime`, `tips` | В `CONTENT-PLACES.md` не заданы — поля не заполняются (не выдумываем) |
| `name.en` | В `CONTENT-PLACES.md` не задан — не заполняется |

### 2.3 Готовность записей (по `CONTENT-PLACES.md` §5 и 2.1)

| Запись | Могла быть `verified` без решений владельца (оценка 2026-09-11) | Фактически в `places.json` (2026-09-12) | Препятствие |
|---|---|---|---|
| `dadonghai-beach`, `yalong-bay-beach`, `sanya-bay-beach`, `luhuitou-park`, `wuzhizhou-island`, `nanshan-cultural-zone`, `sanya-song-cheng` | Да (7 записей) | `verified` | Цены платных — переподтвердить перед публикацией ([OQ-6]). У `luhuitou-park` при content-pass `price.type` изменён с `unknown` на `free` — решения владельца не было (`CONTENT-PLACES.md` §8 №7) |
| `yalong-tropical-forest-park` | **Нет** | `verified`; 3 источника с URL, включая официальный сайт парка | **Снято:** [К-6] / [OQ-9] закрыты данными (п. 8 выполняется) |
| `tianya-haijiao` | **Нет** | `verified`; `area: "sanya-bay"`, `price.type: "free"` (Синьхуа, «Гуанмин жибао») | [OQ-2], [OQ-3] формально открыты; на код не влияют ([К-4]) |
| `sanya-first-market` | Нет (`draft` по `CONTENT-PLACES.md`) | `verified`; `addressZh: 新建街155号` | [OQ-4] формально открыт: адрес выбран при content-pass, проверки на месте не было |

**Фактическое состояние: все 10 записей `verified`** — перенос выполнен 2026-09-11 до получения решений владельца (зафиксировано в `ITERATION-2-CLOSEOUT.md` §11 и `CONTENT-PLACES.md` §8.1, §10.1). Ни одно из этих расхождений не требует правки кода: схема, обязательные поля (2.1) и правила переноса (2.2) соблюдены.

Для кода Итерации 2 объём не важен: список, фильтры и карточка работают на любом количестве записей, включая 0 (пустое состояние). Объём D-05 (25–40) — требование MVP, не этой реализации.

---

## 3. `js/data.js`: загрузка и кэш

Кэш не меняется: оба новых загрузчика идут через существующую `loadJSON()` (один fetch на файл за сессию, общий Promise для параллельных вызовов, сброс при ошибке).

```js
// Возвращает только записи со status "verified" (D-18 PRODUCT.md).
export async function loadPlaces() {
  const items = await loadJSON("data/places.json");
  return items.filter((item) => item.status === "verified");
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
```

Контракт (продолжение foundation 5.1):
- Каждый вызов возвращает **новый** массив / объект — вызывающий может сортировать без побочных эффектов. Сами записи общие — **не мутировать**.
- Порядок `loadPlaces()` = порядок в файле.
- Ошибки — те же сообщения `fetchJSON()`; экран показывает «Не удалось загрузить данные» без технических деталей (MVP-UX-SPEC §12).

**Кто что загружает:**

| Экран | Загрузка | Почему |
|---|---|---|
| Список `#/places` | `Promise.all([loadPlaces(), loadConfig()])` | Чипы категорий, иконки, подпись «С детьми» — из `config` |
| Карточка `#/place/<id>` | `loadPlaces()` | В Итерации 2 карточке `config` не нужен [PI-8]. С Итерации 3 добавится `loadConfig()` для расстояния |
| Таксист `#/place/<id>/taxi` | `loadPlaces()` | Только `name.zh`, `addressZh`, `name.ru` (MVP-UX-SPEC §11, foundation §14 п. 8) |

При частичной ошибке `Promise.all` удачный файл остаётся в кэше, «Повторить» догружает только упавший (foundation 5.2).

**Офлайн в текущей сессии:** после открытия списка оба файла в кэше; карточка и таксист в авиарежиме рендерятся без сетевых запросов. После перезагрузки без сети — ожидаемый экран ошибки до Итерации 4.

---

## 4. Маршруты и контекст

| Маршрут | Шаблон | Экран | `nav` | `fullscreen` |
|---|---|---|---|---|
| `#/places` | `/^\/places$/` (есть) | `renderPlaces` | `/places` | — |
| `#/place/<id>` | `/^\/place\/(?<id>[^/]+)$/` | `renderPlace` | `/places` | — |
| `#/place/<id>/taxi` | `/^\/place\/(?<id>[^/]+)\/taxi$/` | `renderPlaceTaxi` | `/places` | `true` |

`[^/]+` — ровно один сегмент, поэтому `#/place/x/taxi` не совпадает с карточкой. `#/place` без id, `#/place/x/y` → ни один шаблон → `location.replace("#/")` (как сейчас).

### 4.1 Context contract

Все три экрана получают стандартный `ctx = { params, query, isCurrent, back }` foundation (7.3). Новых полей в `ctx` нет.

| Экран | `ctx.params` | `ctx.query` | `ctx.back` |
|---|---|---|---|
| `renderPlaces` | `{}` | `f` — фильтры (раздел 11); прочие параметры игнорируются | не используется |
| `renderPlace` | `{ id }` | игнорируется | `ctx.back("#/places")` — «← К местам» |
| `renderPlaceTaxi` | `{ id }` | игнорируется | `ctx.back("#/place/" + id)` — «Закрыть» |

Правила контракта foundation 7.3 действуют полностью: синхронное состояние загрузки; данные только через `data.js`; после каждого `await` — `if (!ctx.isCurrent()) return;`; ошибка → `.error-state` + «Повторить» → тот же render с тем же `ctx`; промис выполняется после финальной записи в DOM; экран не читает `location.hash`, не делает push, не хранит данные в модуле, не мутирует записи, не управляет прокруткой при навигации.

### 4.2 Нет записи

| Адрес | Условие | Действие |
|---|---|---|
| `#/place/<id>` | id не найден среди `verified` | `location.replace("#/places")` (foundation 3.4) |
| `#/place/<id>/taxi` | то же | `location.replace("#/places")` — **не** на карточку: её тоже нет |

Только после проверки `ctx.isCurrent()`.

---

## 5. Изменения `js/app.js`

Ровно три правки; остальное (`parseHash`, `matchRoute`, `back`, прокрутка, `init`) не меняется.

1. Импорт:
   ```js
   import { renderPlace, renderPlaceTaxi } from "./views/place.js";
   ```
2. Две записи в `routes` (после `/places`, порядок на результат не влияет — шаблоны якорные):
   ```js
   { pattern: /^\/place\/(?<id>[^/]+)$/, render: renderPlace, nav: "/places" },
   { pattern: /^\/place\/(?<id>[^/]+)\/taxi$/, render: renderPlaceTaxi, nav: "/places", fullscreen: true },
   ```
3. Одна строка в `render()` — после успешного `matchRoute`, рядом с `updateActiveNav(match.route.nav)`, до вызова экрана (foundation 6.6):
   ```js
   document.getElementById("app").classList.toggle("is-fullscreen", Boolean(match.route.fullscreen));
   ```
   Выполняется на **каждой** навигации, поэтому уход с экрана таксиста любым способом (Back, «Закрыть», редирект) возвращает шапку и панель без отдельного кода.

Нельзя сломать: текущие адреса и подсветку вкладок; `history.state = { key, from }`; редирект неизвестных путей через `replace`; прокрутку по записи истории.

---

## 6. Контракт `js/logic/filters.js`

Чистые функции: без DOM, без `storage`, без `location` (`PRODUCT.md` 10.3). Входные массивы не мутируются, результат — новый массив. Модуль — единственное место, где интерпретируются enum-значения `places.json` (`effort`, `setting`, `price.type`); поэтому здесь же подписи этих значений и `formatDuration()` [PI-4] — по прецеденту `PHASE_LABELS` в `logic/trip.js`.

```js
// Токены флаговых фильтров в порядке чипов (MVP-UX-SPEC §4, таблица чипов).
export const FLAG_FILTERS = ["short", "easy", "indoor", "free", "saved", "kids"];

// Подписи флаговых чипов. Подпись "kids" берётся из config.tags (id "kids"),
// эта — только запасная.
export const FLAG_LABELS = {
  short: "До 2 ч", easy: "Легко", indoor: "В помещении",
  free: "Бесплатно", saved: "Сохранённые", kids: "С детьми",
};

export const EFFORT_LABELS = { low: "Лёгкая нагрузка", medium: "Средняя нагрузка", high: "Высокая нагрузка" };
export const SETTING_LABELS = { outdoor: "На улице", indoor: "В помещении", mixed: "Улица и помещение" };
export const PRICE_LABELS = { free: "Бесплатно", paid: "Платно", unknown: "Цена не подтверждена" };

export function parseFilters(raw, categoryIds) { /* → string[] */ }
export function serializeFilters(tokens) { /* → string */ }
export function toggleFilter(tokens, token) { /* → string[] */ }
export function applyFilters(places, tokens, { savedIds }) { /* → place[] */ }
export function suggestFilterToRemove(places, tokens, { savedIds }) { /* → string | null */ }
export function formatDuration(durationHours) { /* → string */ }
```

Тексты подписей — предложение этого документа (UI-тексты, не факты); владелец может их поправить.

### 6.1 Функции

| Функция | Контракт |
|---|---|
| `parseFilters(raw, categoryIds)` | `raw` — значение `ctx.query.get("f")` (строка или `null`). Делит по `,`, отбрасывает пустые и неизвестные токены (не из `FLAG_FILTERS` и не из `categoryIds`), убирает повторы, **сохраняя порядок первого появления**. Возвращает массив токенов в порядке применения |
| `serializeFilters(tokens)` | `tokens.join(",")`; для пустого массива — `""` |
| `toggleFilter(tokens, token)` | Есть токен → новый массив без него. Нет → новый массив с токеном **в конце** (порядок применения, MVP-UX-SPEC §4) |
| `applyFilters(places, tokens, { savedIds })` | Сохраняет порядок входного массива. Правило сочетания `PRODUCT.md` 8.4: токены-категории (все токены не из `FLAG_FILTERS`) — одна группа через **ИЛИ**; каждый флаг — отдельное условие через **И** |
| `suggestFilterToRemove(places, tokens, ctx)` | Для подсказки при 0 результатах [PI-9]: перебирает токены **с конца** и возвращает первый, без которого `applyFilters` даёт `> 0`. Если таких нет — последний токен. Пустые `tokens` → `null` |
| `formatDuration([min, max])` | `"1–3 ч"`; при `min === max` — `"2 ч"`; дробные — с запятой: `"0,5–1 ч"` |

### 6.2 Предикаты

| Токен | Условие | Источник |
|---|---|---|
| `<category id>` | `place.category` ∈ выбранных категорий | 8.4 |
| `short` | `place.durationHours[0] <= 2` | 8.4 |
| `easy` | `place.effort === "low"` | 8.4 |
| `indoor` | `place.setting === "indoor"` (`mixed` не входит) | 8.4 — см. [OQ-11] |
| `free` | `place.price.type === "free"` | 8.4 |
| `kids` | `Array.isArray(place.tags) && place.tags.includes("kids")` | 8.4 |
| `saved` | `savedIds.includes(place.id)` — `savedIds` передаёт view из `storage` | 8.4 |

Сортировка по расстоянию (`sortByDistance`) по `PRODUCT.md` 10.2 тоже относится к этому модулю, но реализуется вместе с `distance.js` — см. раздел 7 и [OQ-10]. Без района порядок = порядок `places.json` [PI-1].

---

## 7. Контракт `js/logic/distance.js`

**Когда реализуется — открытый вопрос [OQ-10].** По `PRODUCT.md` 11.2 «расстояние от района» входит в Итерацию 3, а источника района (`stg:trip.area`, экран `#/settings`) в Итерации 2 нет: функции не имели бы потребителя (тот же довод, по которому foundation не добавлял `fullscreen` заранее, 6.6). Дефолт: контракт фиксируется сейчас, код — в Итерации 3. Если владелец решит иначе — контракт тот же.

```js
const EARTH_RADIUS_KM = 6371;

// Расстояние по прямой (формула гаверсинусов, PRODUCT.md 8.4) между точками
// WGS-84 { lat, lng }. Возвращает километры (число).
export function haversineKm(from, to) {}

// «~3,4 км» до 10 км (один знак, запятая), «~27 км» от 10 км (целое). D-11, 8.4.
export function formatDistance(km) {}
```

- Граница: сначала округлить до 0,1; если результат `< 10` — формат с одним знаком, иначе `Math.round`. Так 9,96 км даёт «~10 км», а не «~10,0 км».
- Только «по прямой», без времени в пути (D-11, X-12).
- **От какой точки считается** (D-11, 8.4, MVP-UX-SPEC §4): от `center` **выбранного пользователем района проживания** до `location` **места**. `area` самого места в расчёте не участвует — см. [К-4].
- Района нет, район не найден среди `verified` или его `center === null` (`other`) → расстояние не считается и не показывается, список в порядке файла (MVP-UX-SPEC §12 «Нет района»).
- `sortByDistance(places, center)` в `filters.js`: новый массив, по возрастанию `haversineKm(center, place.location)`, при равенстве — порядок файла (стабильная сортировка); `center == null` → копия без сортировки.

**Контрольные значения расстояний изъяты как устаревшие (2026-09-12).** Редакция 1.0 приводила здесь три ориентира от центра `dadonghai` («~2,4 км» до `luhuitou-park`, «~14 км» до `yalong-bay-beach`, «~34 км» до `nanshan-cultural-zone`), посчитанные по координатам `CONTENT-PLACES.md` 1.0. С тех пор:

- координаты четырёх мест уточнены при content-pass (`CONTENT-PLACES.md` §11, пп. 3–6), в том числе `yalong-bay-beach` и `luhuitou-park` — то есть как минимум два из трёх ориентиров больше не соответствуют данным;
- `js/logic/distance.js` не реализован, сверять эти числа нечем;
- координаты остаются изменчивыми: открыт [OQ-1] (центр `city`), а расширение базы до 25–40 мест (D-05) ещё предстоит.

Поэтому контрольные значения **не пересчитываются в этом документе**: их место — рядом с реализацией. Актуальный набор контрольных значений, посчитанный по фактическим `data/config.json` и `data/places.json`, и порядок их перепроверки — в `ITERATION-3-IMPLEMENTATION.md`. Любые числа расстояний, встречающиеся в редакции 1.0 этого документа и в `CONTENT-PLACES.md` 1.0, считать недействительными.

---

## 8. Контракт `js/views/places.js` (список)

```js
export async function renderPlaces(container, ctx)
```

Модуль заменяет заглушку. Импортирует `loadPlaces`, `loadConfig` из `data.js`; `storage` из `storage.js`; функции и подписи из `logic/filters.js`. В модуле — своя копия `renderErrorState` (foundation 7.4) и объект `CATEGORY_ICONS` (ключ `config.categories[].icon` → эмодзи, запасной `"📍"`) — по образцу `ICONS` в `info.js` [PI-7]. **Состояния модуля нет**: текущие фильтры живут в замыкании рендера, источник истины — URL (раздел 11).

### 8.1 Поток

1. `container.innerHTML = '<p class="loading">Загрузка мест…</p>'`.
2. `Promise.all([loadPlaces(), loadConfig()])`; ошибка → если `ctx.isCurrent()` — `renderErrorState(container, "Не удалось загрузить данные", () => renderPlaces(container, ctx))`.
3. `if (!ctx.isCurrent()) return;`
4. `tokens = parseFilters(ctx.query.get("f"), config.categories.map((c) => c.id))`; `savedIds = storage.getSavedIds()`.
5. Заголовок `h2.view-title` «Места».
6. Нет ни одной `verified`-записи → `.empty-state` «Пока нет проверенных мест. Загляните позже — а пока полезное есть в «Справке».» Чипы не рисуются. Конец.
7. Ряд чипов `div.chips[role=group][aria-label="Фильтры"]`: сначала категории в порядке `config.categories` (подпись `name`), затем флаги в порядке `FLAG_FILTERS` (подпись `kids` — из `config.tags`). Каждый чип — `<button type="button" class="chip" aria-pressed="true|false" data-token="…">`.
8. Область результатов `div.places-results`: `p.places-count` «Найдено N» + список `div.info-list` или пустое состояние (8.3).
9. Промис выполняется после записи всего DOM — роутер восстанавливает прокрутку (foundation 6.4).

### 8.2 Строка списка

`<a class="info-card" href="#/place/<id>">` — существующие классы `info-list` / `info-card*` без изменений [PI-7] (MVP-UX-SPEC §4: название, иконка категории, длительность, нагрузка):

- `span.info-card__icon[aria-hidden]` — `CATEGORY_ICONS[category.icon]` или `"📍"`;
- `span.info-card__title` — `name.ru`;
- `span.info-card__summary` — `"1–3 ч · Лёгкая нагрузка"` (`formatDuration` + `EFFORT_LABELS`). С Итерации 3 при выбранном районе — `" · ~3,4 км"`.

Переход — обычная ссылка (запись в истории создаёт пользователь, foundation 3.5).

### 8.3 Переключение фильтра и пустые состояния

По тапу по чипу (синхронно, без перерисовки чипов):
1. `tokens = toggleFilter(tokens, token)`;
2. обновить `aria-pressed` у всех чипов;
3. перерисовать только `.places-results`;
4. `history.replaceState(history.state, "", placesHash(tokens))`, где `placesHash` → `"#/places"` или `"#/places?f=" + serializeFilters(tokens)`.

Ряд чипов не перерисовывается — сохраняются его горизонтальная прокрутка и фокус (foundation 3.3). Прокрутку страницы экран не трогает (foundation 6.3).

| Ситуация | Что показать |
|---|---|
| `N > 0` | «Найдено N» + строки |
| Активен `saved`, и среди `verified`-мест нет ни одного сохранённого | `.empty-state`: «Вы пока ничего не сохранили. Откройте место и нажмите ♡ — оно появится здесь.» + кнопка «Снять «Сохранённые»» [PI-11] (MVP-UX-SPEC §12) |
| Иначе `N = 0` | `.empty-state`: «Ничего не найдено.» + кнопка «Снять «<подпись>»» для `suggestFilterToRemove(...)` (8.4, MVP-UX-SPEC §4, §12) |

Кнопка подсказки делает то же, что тап по соответствующему чипу, и переводит фокус на этот чип (кнопка исчезает при перерисовке результатов). «Найдено N» показывается всегда, в том числе «Найдено 0» — видимая реакция на каждый тап (8.9).

### 8.4 Чего на списке нет в Итерации 2

- Плашки «Выберите район, чтобы видеть расстояние» → `#/settings`: маршрута `#/settings` нет, ссылка ушла бы редиректом на `#/` ([К-12], [OQ-10]).
- Кнопки избранного в строке (MVP-UX-SPEC §5 — сердце только на карточке).
- Поиска (Should, `PRODUCT.md` 7).

---

## 9. Контракт `js/views/place.js` (карточка и таксист)

```js
export async function renderPlace(container, ctx)      // #/place/<id>
export async function renderPlaceTaxi(container, ctx)  // #/place/<id>/taxi
```

Оба экрана в одном модуле, как список и деталь в `info.js`, но отдельно от списка — по `PRODUCT.md` 10.2 [PI-3]. Общие для модуля: одна копия `renderErrorState` (foundation 7.4) и `copyText()` (раздел 12.3). Импорты: `loadPlaces` из `data.js`, `storage`, подписи и `formatDuration` из `logic/filters.js`, `formatVerifiedDate` из `logic/checklist.js`.

### 9.1 `renderPlace` — поток

1. `container.innerHTML = '<p class="loading">Загрузка места…</p>'`.
2. `await loadPlaces()`; ошибка → если актуален — `renderErrorState` + «Повторить» → `renderPlace(container, ctx)`.
3. `if (!ctx.isCurrent()) return;`
4. `place = places.find((p) => p.id === ctx.params.id)`; нет → `location.replace("#/places"); return;`.
5. DOM (раздел 9.2). Промис выполняется после записи всего DOM.

### 9.2 Карточка — порядок блоков

Порядок — MVP-UX-SPEC §5 (финальная редакция 8.5 `PRODUCT.md`, см. [К-2]):

| # | Блок | Разметка | Данные |
|---|---|---|---|
| 0 | «← К местам» [PI-5] | `<a href="#/places" class="place-detail__back">`; `click` → `preventDefault(); ctx.back("#/places")` | — |
| 1 | Название, китайское название, избранное | `div.place-detail__head`: `h2.view-title`, `p.place-detail__zh[lang=zh-CN]`, `button.place-detail__save[aria-pressed][aria-label="В избранное"]` (♡ / ♥) | `name.ru`, `name.zh` |
| 2 | Чипы-параметры (неинтерактивные) | `ul.place-params` > `li` | `formatDuration`, `EFFORT_LABELS`, `SETTING_LABELS`, `PRICE_LABELS` |
| 3 | «~N км от вашего района» | — | **Итерация 3** ([OQ-10]) |
| 4 | Описание и «Почему стоит» | `p.place-detail__summary`; `h3.place-detail__subtitle` «Почему стоит»; `ul.info-detail__points` | `summary`, `why` |
| 5 | Лучшее время, часы, цена | Абзацы «Лучшее время: …», «Часы работы: …», «Цена: …» — только непустые; блок целиком — только если есть хоть одно поле; в конце блока `p.task__meta.task__meta--volatile` «Может измениться — проверьте актуальность перед поездкой.» [PI-12] | `bestTime`, `hours`, `price.note` |
| 6 | Советы | `h3.place-detail__subtitle` «Советы» + `ul.info-detail__points`; только если `tips` непуст | `tips` |
| 7 | Подвал | `p.task__meta` «Проверено: …» (`formatVerifiedDate`, [К-3]); `p.task__meta.sources__label` «Источник:»; `div.sources__list` > `a.sources__link[target=_blank][rel="noopener noreferrer"]` | `verifiedAt`, `sources` |
| 8 | Закреплённые действия | `div.place-actions` — **последний прямой потомок `#view`** (раздел 14): `<a class="btn btn--primary" href="#/place/<id>/taxi">Показать таксисту</a>`, `<button class="btn btn--secondary">Скопировать название</button>`, `p.place-actions__status[role=status]` | `name.zh` ([OQ-12]) |

Разметка подвала, списков и пометки «может измениться» — те же классы и тексты, что в `info.js`: единый визуальный язык без новой дизайн-системы. «Открыть в Amap» не выводится (Q-03 не решён — [OQ-16]).

### 9.3 Избранное на карточке

- Начальное состояние: `storage.getSavedIds().includes(place.id)`.
- Тап: `ok = storage.setPlaceSaved(place.id, !saved)`. `ok` → обновить `aria-pressed` и значок. `!ok` → состояние не меняется, `window.alert("Не удалось сохранить: хранилище браузера недоступно.")` — как у чекбокса «Подготовки».
- Кнопка ≥ 44×44 px; `aria-label` постоянный («В избранное»), состояние передаёт `aria-pressed`.

### 9.4 `renderPlaceTaxi` — поток

1. `container.innerHTML = '<p class="loading">Загрузка…</p>'`. Шапка и панель уже скрыты роутером (раздел 5).
2. `await loadPlaces()`; ошибка → если актуален — `renderErrorState` с «Повторить» **и** «Закрыть» → `ctx.back("#/place/" + id)` [PI-13]: в полноэкранном режиме нет нижней панели, выход должен быть на экране.
3. `if (!ctx.isCurrent()) return;`
4. Нет записи → `location.replace("#/places"); return;` (4.2).
5. DOM — раздел 12.2.

Сетевых запросов, кроме `data/places.json` (из кэша, если список или карточка уже открывались), экран не делает.

---

## 10. Избранное через `js/storage.js`

Формат ключа — `PRODUCT.md` 9.7, без изменений: `stg:saved` = `["<id места>", …]`. Версия схемы остаётся `1` — формат ключа задан с первой версии, миграция не нужна.

Добавляются две функции по образцу `getChecklistState` / `setChecklistItemDone`:

```js
// Массив id сохранённых мест в порядке добавления. Всё, что не массив
// строк, игнорируется (повреждённое значение не ломает экран).
function getSavedIds() {
  if (!storageAvailable) return [];
  ensureSchema();
  try {
    const raw = window.localStorage.getItem(KEYS.saved);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch (e) {
    console.error("Не удалось прочитать stg:saved", e);
    return [];
  }
}

function setPlaceSaved(placeId, saved) {
  if (!storageAvailable) return false;
  const ids = getSavedIds().filter((id) => id !== placeId);
  if (saved) ids.push(placeId);
  try {
    window.localStorage.setItem(KEYS.saved, JSON.stringify(ids));
    return true;
  } catch (e) {
    console.error("Не удалось сохранить stg:saved", e);
    return false;
  }
}

export const storage = {
  isAvailable: () => storageAvailable,
  getChecklistState,
  setChecklistItemDone,
  getSavedIds,
  setPlaceSaved,
};
```

- В `KEYS` у `saved` убрать комментарий «зарезервировано»; `trip` остаётся зарезервированным (Итерация 3).
- Ключ `stg:saved` создаётся только при первом сохранении, не при чтении.
- **Удалённые / ставшие `draft` места** молча игнорируются при рендере (9.7, MVP-UX-SPEC §10, §12): view пересекает `savedIds` с `verified`-записями. Из хранилища такие id **не удаляются** — чтение ничего не пишет [PI-10]; если место вернётся в `verified`, отметка вернётся.
- Обработка чужих типов — только для нового ключа; hardening существующих ключей (I5) — вне scope.
- `stg:checklist`, `stg:schema`, `stg:trip` не затрагиваются.

---

## 11. Фильтры в query и `history.replaceState`

Foundation 3.3 рекомендует хранить фильтры в URL как единственный источник истины, а имена и формат параметров оставляет сеансу «Мест». Формат [PI-2]:

```
#/places?f=<token>,<token>,…
```

- **Один параметр `f`**, токены через запятую, **в порядке применения** (последний тап — в конце). Порядок нужен подсказке при 0 результатах (MVP-UX-SPEC §4); foundation 3.3 прямо допускает кодировать его порядком значений.
- Токен категории — `id` из `config.categories`; флаговые токены — фиксированный набор `short`, `easy`, `indoor`, `free`, `saved`, `kids`. Пересечение исключено правилом схемы (1.1).
- Id и токены — `[a-z0-9-]`, поэтому строка собирается как `"#/places?f=" + tokens.join(",")` без кодирования; `URLSearchParams` в `parseHash()` читает её как есть.
- Примеры: `#/places?f=nature,short` — «Природа» и «До 2 ч»; `#/places?f=beach,nature,kids` — пляжи или природа, и с детьми.

**Чтение.** Только при рендере, из `ctx.query.get("f")` через `parseFilters()`. Неизвестные токены, повторы и прочие параметры игнорируются. При открытии URL **не нормализуется** — лишних записей и перерисовок нет; первый же тап по чипу перезаписывает query каноничной строкой (остальные параметры при этом отбрасываются).

**Запись.** Только `history.replaceState(history.state, "", placesHash(tokens))` — после каждого переключения, без `hashchange`, без новой записи истории, с сохранением `key` / `from` записи (foundation 3.3, 3.5). Запрещено: `location.hash = …`, `location.replace(…)`, `history.pushState`. Пустой набор → `#/places` (без `?`).

**Не хранится:** ни в `localStorage` (MVP-UX-SPEC §4), ни в переменной модуля.

**Следствия:**
- Back / «← К местам» с карточки возвращает список с теми же фильтрами без дополнительного кода: `from` карточки = hash списка с `f` (`oldURL` учитывает `replaceState`, foundation 2.4).
- Фильтры переживают перезагрузку; ссылка с фильтрами открывает список с ними.
- Сценарии Главной (Итерация 3, `PRODUCT.md` 8.3) — обычные ссылки `#/places?f=…`.
- Вкладка «Места» (`href="#/places"`) всегда открывает список **без фильтров**: с карточки — новой записью; с отфильтрованного списка — тоже новой записью, потому что hash отличается. Это прямое следствие «URL = истина» — [OQ-15].
- Горизонтальная прокрутка ряда чипов при Back не восстанавливается (см. foundation 11 «Later»).

---

## 12. «Показать таксисту»

### 12.1 Вход и выход

- Вход — только из карточки: `<a class="btn btn--primary" href="#/place/<id>/taxi">` в закреплённом блоке. Запись в истории создаёт пользователь (foundation 3.5).
- Выход — «Закрыть» → `ctx.back("#/place/" + id)`, системный Back, свайп-назад в iOS. Шапка и панель возвращаются автоматически (раздел 5).

### 12.2 Экран

```
div.taxi
  div.taxi__content
    p.taxi__name[lang=zh-CN]      name.zh     — ≥ 32px, жирный
    p.taxi__address[lang=zh-CN]   addressZh   — ≥ 28px
    p.taxi__ru                    name.ru     — 16px, приглушённый
  div.taxi__actions
    button.btn.btn--secondary     «Скопировать»
    a.btn.btn--primary[href="#/place/<id>"]   «Закрыть» (click → preventDefault; ctx.back)
    p.taxi__status[role=status]
```

- Полноэкранный: без шапки и нижней навигации (MVP-UX-SPEC §5, `PRODUCT.md` 8.6).
- Размеры шрифта — MVP-UX-SPEC §5, §13 (28–32px+). Китайский текст **не обрезается**, переносится (`overflow-wrap: anywhere`), выделяется вручную (`user-select: text`) — запасной путь, если копирование не сработало.
- `lang="zh-CN"` — чтобы системный шрифт выбрал упрощённые китайские глифы; внешние шрифты не нужны (D-28).
- Данные — только `name.zh`, `addressZh`, `name.ru` (MVP-UX-SPEC §11). Сетевых запросов, кроме кэшированного `places.json`, нет.
- Не делаем (нет в спецификациях): управление яркостью, Wake Lock, блокировку ориентации, поворот текста.

### 12.3 Копирование (`copyText` в `place.js`) [PI-6]

```js
// Возвращает true, если текст скопирован.
async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* ниже — запасной путь */ }
  }
  // Временный <textarea readonly> вне экрана, font-size 16px (iOS не зумит),
  // select() + setSelectionRange(0, length), document.execCommand("copy"),
  // удалить textarea, вернуть фокус на кнопку; вернуть результат execCommand.
}
```

- Запасной путь обязателен: Clipboard API есть только в secure context, а проверка с телефона идёт по `http://192.168.x.x` (тот же довод, что в foundation 6.4 про `crypto.randomUUID`). `execCommand` устарел, но используется только как запасной.
- **Видимая реакция** (`PRODUCT.md` 8.9): успех — текст кнопки «Скопировано ✓» ~2 с, затем исходный; неудача — `role=status`: «Не удалось скопировать — выделите текст вручную.» После `await` — проверка `button.isConnected` (пользователь мог уйти с экрана).
- **Что копируется** — [OQ-12]. Дефолт: карточка «Скопировать название» → `name.zh`; экран таксиста «Скопировать» → `name.zh + "\n" + addressZh`.

### 12.4 Офлайн

- В текущей сессии (Итерация 2): список → авиарежим → карточка → таксист → всё отображается, копирование работает (данные из Promise-кэша `data.js`).
- Холодный старт без сети — экран ошибки с «Повторить» и «Закрыть» до Итерации 4 (D-29, MVP-UX-SPEC §5).

---

## 13. Browser Back / Forward и внутренний «Назад»

Весь механизм — foundation 6.3–6.5; «Места» только вызывают `ctx.back()` и не пишут в историю. Ожидаемое поведение:

| # | Сценарий | Результат |
|---|---|---|
| 1 | Список `?f=nature` прокручен → карточка → системный Back | Список с `nature`, на прежней позиции |
| 2 | То же, но «← К местам» | `from` = `#/places?f=nature` → `history.back()` → как п. 1; `history.length` не меняется |
| 3 | После п. 1 — Forward | Карточка на своей позиции |
| 4 | Глубокая ссылка `#/place/<id>` → «← К местам» | `from = null` → `location.replace("#/places")` → список без фильтров; `history.length` не меняется; приложение не закрывается |
| 5 | Карточка открыта не со списка (в Итерации 3 — с Главной) → «← К местам» | `replace("#/places")`; следующий системный Back — на экран до карточки |
| 6 | Список → карточка → таксист → «Закрыть» | `history.back()` → карточка, шапка и панель на месте → системный Back → список |
| 7 | Таксист → системный Back / Forward | Карточка без fullscreen / таксист с fullscreen |
| 8 | Глубокая ссылка `#/place/<id>/taxi` → «Закрыть» | `replace("#/place/<id>")` → карточка; её «← К местам»: `from` = hash таксиста → `replace("#/places")` |
| 9 | `#/place/<bad>`, `#/place/<bad>/taxi`, `draft`-id | `replace("#/places")`; Back на битый адрес не возвращает |
| 10 | 5 тапов по чипам → системный Back | Уход на экран до списка; `history.length` после тапов не изменился |
| 11 | Перезагрузка на `#/places?f=…` | Фильтры на месте, экран сверху (foundation 6.3) |
| 12 | Вкладка «Места» с карточки или с отфильтрованного списка | Новая запись `#/places`, фильтры сброшены ([OQ-15]) |
| 13 | Чередование «Закрыть» у таксиста и системного Back | Нет петли (foundation 6.5) |

Нижняя панель на карточке подсвечивает «Места» (`nav: "/places"`).

---

## 14. Sticky и fullscreen

### 14.1 Sticky-блок карточки

Требования (MVP-UX-SPEC §5 решение №3, foundation 6.2 и §14 п. 6):

- `div.place-actions` — **последний прямой потомок `#view`**.
- `position: sticky; bottom: calc(var(--nav-height) + env(safe-area-inset-bottom));` — над нижней панелью.
- Собственный фон (`var(--color-bg)`), верхняя граница, `z-index: 5` — ниже `.bottom-nav` (10).
- Между блоком и документом — никаких `overflow: hidden | auto | scroll` (у `#app` — `clip`, допустимо). Не `position: fixed`: sticky занимает место в потоке и не перекрывает конец карточки.
- Кнопки ≥ 44px, `flex-wrap: wrap` — на 320px переносятся в две строки, текст не обрезается, горизонтального переполнения нет.
- Ряд чипов списка — горизонтальный скролл-контейнер; внутри него и вокруг него sticky-элементов нет.
- Если карточка короче экрана, блок стоит сразу после контента, а не у нижнего края: это свойство sticky, принятое foundation 6.2.

### 14.2 Fullscreen экрана таксиста

- Флаг маршрута + одна строка в `render()` (раздел 5).
- `#app.is-fullscreen .app-header, #app.is-fullscreen .bottom-nav { display: none; }`.
- `#app.is-fullscreen .app-main`: `padding-top: calc(var(--space-4) + env(safe-area-inset-top))`, `padding-bottom: calc(var(--space-4) + env(safe-area-inset-bottom))` — без `--nav-height`. Верхний отступ нужен, потому что `index.html` задаёт `viewport-fit=cover`, а шапки, закрывающей вырез экрана, в этом режиме нет.
- `.taxi` — flex-колонка на высоту экрана (`min-height` через `100dvh` с запасным `100vh`, минус отступы `.app-main`); текст — по центру свободного места; `.taxi__actions` внизу, `position: sticky; bottom: env(safe-area-inset-bottom)` с фоном — видны и при очень длинном адресе.
- Прокручивается по-прежнему только документ; блокировки прокрутки и `position: fixed`-оверлеев нет.

---

## 15. Изменения `css/styles.css`

Только **новые** правила в конце файла; существующие правила не меняются. Токены — существующие (`--color-*`, `--space-*`, `--radius*`, `--tap-min`, `--nav-height`, `--font-size-*`).

**Переиспользуются без изменений:** `.view-title`, `.loading`, `.error-state`, `.empty-state`, `.btn`, `.btn--primary`, `.info-list`, `.info-card*`, `.info-detail__points`, `.task__meta`, `.task__meta--volatile`, `.sources__label`, `.sources__list`, `.sources__link`.

| Новое правило | Назначение и ключевые свойства |
|---|---|
| `.btn--secondary` | Вторичная кнопка: фон `--color-surface`, текст `--color-primary-dark`, рамка `1px solid var(--color-border)` |
| `.error-state__actions` | Две кнопки в ошибке экрана таксиста: `flex`, `wrap`, `gap`, по центру |
| `.chips` | Ряд чипов: `display: flex; gap; overflow-x: auto;` отрицательные боковые `margin` на `--space-4` и такие же `padding` (ряд до краёв экрана, без переполнения страницы — `#app` с `clip`); скрытая полоса прокрутки |
| `.chip`, `.chip[aria-pressed="true"]` | `flex: 0 0 auto; min-height: var(--tap-min); border-radius: 999px; white-space: nowrap; font-size: var(--font-size-base)`; активный — фон `--color-primary`, белый текст |
| `.places-count` | «Найдено N»: `font-weight: 600`, отступ снизу |
| `.place-detail__back` | Как `.info-detail__back` (inline-flex, `min-height: var(--tap-min)`, `--color-primary`, 600, без подчёркивания), но с отступом снизу — стоит над заголовком |
| `.place-detail__head` | `flex`, `justify-content: space-between`, `align-items: flex-start`, `gap` |
| `.place-detail__zh` | Китайское название под заголовком: `--font-size-md`, `overflow-wrap: anywhere` |
| `.place-detail__save` | 44×44 min, без фона и рамки, крупный значок, цвет `--color-primary` |
| `.place-params`, `.place-params li` | Неинтерактивные «пилюли»: список без маркеров, `flex-wrap`, фон `--color-surface-alt`, `border-radius: 999px`, `--font-size-base` (отличаются от фильтров отсутствием рамки) |
| `.place-detail__summary`, `.place-detail__subtitle` | Описание (как `.info-detail__summary`); подзаголовки «Почему стоит», «Советы» — `--font-size-base`, 700 |
| `.place-actions`, `.place-actions .btn`, `.place-actions__status` | Sticky-блок (14.1); кнопкам-ссылкам — `display: flex; align-items: center; justify-content: center; text-decoration: none; flex: 1 1 auto` (у `.btn` нет `display`, а `min-height` на inline-ссылке не работает) |
| `#app.is-fullscreen …` | Три правила из 14.2 |
| `.taxi`, `.taxi__content`, `.taxi__name`, `.taxi__address`, `.taxi__ru`, `.taxi__actions`, `.taxi__status` | Экран таксиста (12.2, 14.2): `.taxi__name` 32px / 700 / `line-height: 1.3`; `.taxi__address` 28px; `.taxi__ru` 16px `--color-text-muted`; китайский текст — `overflow-wrap: anywhere; user-select: text` |

Минимумы: зоны нажатия ≥ 44×44 (чипы, строки списка — уже `.info-card`, «← К местам», сердце, кнопки действий, ссылки источников — уже `.sources__link`); основной текст ≥ 16px (исключение — вторичная строка списка 14px, это существующий `.info-card__summary`); горизонтальной прокрутки страницы нет.

---

## 16. Порядок реализации

Каждый шаг оставляет приложение рабочим; «Подготовка» и «Справка» не трогаются.

| Шаг | Что | Файлы | Проверка шага |
|---|---|---|---|
| 0 | **Данные (отдельная задача, не код).** Решения владельца по блокирующим вопросам 19.A → создание `data/config.json` и `data/places.json` по разделам 1–2 | `data/*.json` | Сниппет целостности (17) возвращает `[]` |
| 1 | `loadPlaces()`, `loadConfig()` | `js/data.js` | В консоли оба загрузчика возвращают данные; повторный вызов — без нового запроса |
| 2 | `getSavedIds()`, `setPlaceSaved()`; комментарий у `KEYS.saved` | `js/storage.js` | Добавить / убрать id в консоли; `stg:saved` — массив строк; «Подготовка» не затронута |
| 3 | Чистая логика фильтров и подписи | `js/logic/filters.js` | `applyFilters` на реальных данных: «nature + short» даёт ожидаемые записи |
| 4 | Карточка `renderPlace` + маршрут `#/place/<id>` + импорт | `js/views/place.js`, `js/app.js`, `css/styles.css` | Глубокая ссылка, неизвестный id, избранное, sticky, «← К местам» |
| 5 | Список, чипы, URL | `js/views/places.js`, `css/styles.css` | Раздел 17 «Список и фильтры»; Back с карточки |
| 6 | Экран таксиста `renderPlaceTaxi` + маршрут `/taxi` + строка fullscreen | `js/views/place.js`, `js/app.js`, `css/styles.css` | Раздел 17 «Таксист»; авиарежим |
| 7 | Полная валидация раздела 17 на 320 и 375px, исправление реальных проблем | — | Все пункты 17 |

`js/logic/distance.js` и `sortByDistance` — в Итерации 3, если по [OQ-10] не решено иначе. После шага 7 — предложение правок в `PRODUCT.md` 11.1 / 11.2 / 17 (правило 0.2 п. 10); сам `PRODUCT.md` в ходе реализации не меняется.

Проверять на временной `draft`-записи (фильтр D-18) — добавить локально и удалить до завершения, как в INFO-IMPLEMENTATION §10. Выдуманные данные в `data/` не коммитятся.

---

## 17. Validation / acceptance criteria

**Среда:** Live Server (D-25), DevTools 320×568 и 375×667; телефон по локальной сети; браузеры D-31.

**Данные и кэш**
- [ ] `config.json` и `places.json` загружаются; в Network — один запрос на файл за сессию; переходы список ↔ карточка ↔ таксист новых запросов не делают.
- [ ] Показываются только `verified` (проверка на **временной** `draft`-записи: в фактическом `places.json` все 10 записей `verified`, в том числе `sanya-first-market` — см. 2.3).
- [ ] Сниппет целостности возвращает `[]`.
- [ ] Offline → первый заход на «Места» → «Не удалось загрузить данные» → Online → «Повторить» → список (новый запрос).

**Роутинг**
- [ ] `#/places`, `#/place/<id>`, `#/place/<id>/taxi` открываются; на списке и карточке подсвечена «Места».
- [ ] `#/place/unknown`, `#/place/unknown/taxi`, `#/place/<draft-id>` → `#/places`; Back на них не возвращает.
- [ ] `#/place`, `#/place/a/b` → `#/`; исключений нет.
- [ ] grep по `js/`: нет `location.hash =` и `pushState`.
- [ ] После навигаций и после тапов по чипам `history.state` = `{ key, from }`, `key` при тапах не меняется.

**Список и фильтры**
- [ ] Чипы: категории в порядке `config.json`, затем «До 2 ч», «Легко», «В помещении», «Бесплатно», «Сохранённые», «С детьми»; у активных `aria-pressed="true"`.
- [ ] **Критерий Итерации 2** (`PRODUCT.md` 11.2): со списка «Природа» + «До 2 ч» — 2 нажатия, результат соответствует данным.
- [ ] Категории — ИЛИ, группы — И: «Пляжи + Природа» ≥ каждой по отдельности; «Природа + До 2 ч» ≤ «Природа».
- [ ] «Найдено N» равно числу строк после каждого тапа.
- [ ] После тапа hash = `#/places?f=…` в порядке тапов; `history.length` не изменился; ряд чипов не перерисован (его горизонтальная прокрутка и фокус на месте); прокрутка страницы не прыгает.
- [ ] 0 результатов → «Ничего не найдено» + «Снять «…»» с фильтром, снятие которого даёт результаты → тап → результаты появились, фокус на чипе.
- [ ] «Сохранённые» без избранного → особое пустое состояние с подсказкой.
- [ ] Перезагрузка на `#/places?f=beach` — чип активен; `#/places?f=foo,,beach,beach` — активен только «Пляжи», ошибок нет.
- [ ] Строка: иконка категории, `name.ru`, «длительность · нагрузка»; тап → карточка.

**Карточка**
- [ ] Порядок блоков — 9.2; китайское название под русским; «Почему стоит» 2–3 пункта; блок 5 — только при данных и с пометкой «может измениться»; «Советы» — только при данных; подвал: дата и ссылки источников (новая вкладка).
- [ ] Сердце: `aria-pressed` меняется, `stg:saved` обновляется, переживает перезагрузку; место появляется в «Сохранённых»; после снятия и Back — исчезает.
- [ ] `localStorage` недоступен → сообщение, состояние сердца не меняется.
- [ ] «Скопировать название» — «Скопировано ✓»; по `http://192.168.x.x` работает запасной путь или видно сообщение о неудаче.

**Sticky**
- [ ] На длинной карточке (375×667) вверху страницы: нижняя граница блока = `innerHeight − 64` (сниппет).
- [ ] В конце прокрутки блок не перекрывает подвал и источники.
- [ ] 320×568: кнопки блока не обрезаны, переполнения нет.

**Таксист**
- [ ] Нет шапки и нижней панели; `name.zh` ≥ 32px, `addressZh` ≥ 28px, `name.ru` 16px; самый длинный `addressZh` на 320px переносится без обрезки и без горизонтальной прокрутки.
- [ ] «Закрыть» → карточка, `history.length` не изменился, шапка и панель вернулись. Системный Back — так же; Forward — снова fullscreen.
- [ ] «Скопировать» — видимая реакция.
- [ ] Авиарежим: список → карточка → таксист — всё отображается (MVP-UX-SPEC §5).
- [ ] Холодный старт без сети на `#/place/<id>/taxi` → ошибка с «Повторить» и «Закрыть».

**Back / Forward** — сценарии 1–13 раздела 13.

**Регрессия**
- [ ] «Подготовка»: аккордеон, раскрытые этапы после смены вкладки, чекбокс отдельно от тела строки, «Готово X из Y», `stg:checklist`.
- [ ] «Справка»: 5 карточек, деталь, «← К справке» без роста истории.
- [ ] «Сейчас» — заглушка открывается.
- [ ] В `localStorage` только `stg:schema`, `stg:checklist` и (после первого сохранения) `stg:saved`; `stg:trip` не создаётся.

**Общее**
- [ ] В консоли нет ошибок.
- [ ] Нет горизонтальной прокрутки на всех экранах «Мест» при 320 и 375px.
- [ ] Все интерактивные элементы ≥ 44×44 px.
- [ ] Safari iOS 16+, Chrome Android, Яндекс Браузер: sticky-блок, fullscreen с safe area, копирование, свайп-назад в iOS.

**Сниппеты для консоли**

```js
// Целостность данных (раздел 2.1, D-20). Должно вернуть [].
const [places, config] = await Promise.all(
  ["data/places.json", "data/config.json"].map((p) => fetch(p, { cache: "no-cache" }).then((r) => r.json()))
);
const has = (list, id) => list.some((x) => x.id === id);
const ids = new Set(); const errors = [];
for (const p of places.filter((x) => x.status === "verified")) {
  const e = (m) => errors.push(`${p.id}: ${m}`);
  if (!/^[a-z0-9-]+$/.test(p.id) || ids.has(p.id)) e("id"); ids.add(p.id);
  if (!p.name?.ru || !p.name?.zh || !p.addressZh || !p.summary) e("обязательные строки");
  if (!has(config.areas, p.area)) e("area");
  if (!has(config.categories, p.category)) e("category");
  (p.tags || []).forEach((t) => has(config.tags, t) || e(`tag ${t}`));
  if (!p.location?.lat || !p.location?.lng) e("location");
  if (!Array.isArray(p.why) || p.why.length < 2 || p.why.length > 3) e("why");
  const d = p.durationHours; if (!Array.isArray(d) || !(d[0] > 0) || !(d[0] <= d[1])) e("durationHours");
  if (!["low", "medium", "high"].includes(p.effort)) e("effort");
  if (!["outdoor", "indoor", "mixed"].includes(p.setting)) e("setting");
  if (!["free", "paid", "unknown"].includes(p.price?.type)) e("price.type");
  if (!p.sources?.length || p.sources.some((s) => !s.title || !s.url)) e("sources");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.verifiedAt)) e("verifiedAt");
  if (JSON.stringify(p).includes("НУЖНО ПРОВЕРИТЬ")) e("НУЖНО ПРОВЕРИТЬ");
}
["short", "easy", "indoor", "free", "saved", "kids"].forEach((f) => has(config.categories, f) && errors.push(`category id "${f}" совпадает с флагом`));
errors;
```

```js
// Sticky на длинной карточке (DevTools, safe area = 0): оба числа совпадают.
window.scrollTo(0, 0);
const bar = document.querySelector(".place-actions");
[Math.round(bar.getBoundingClientRect().bottom), innerHeight - 64];
```

```js
// Фильтры не растят историю: запомнить, потапать чипы, сравнить.
window.__h = history.length;   // ...5 тапов по чипам...
history.length === window.__h;
```

```js
// Горизонтальное переполнение: должно быть true.
document.documentElement.scrollWidth === document.documentElement.clientWidth;
```

---

## 18. Противоречия

| № | Где | Суть | Как учтено здесь |
|---|---|---|---|
| К-1 | `PRODUCT.md` 8.4 ↔ MVP-UX-SPEC §4 | В 8.4 есть чип «Рядом»; MVP-UX-SPEC его убрал (сортировка по умолчанию при выбранном районе). Конфликт уже признан в MVP-UX-SPEC | Чипа «Рядом» нет — по MVP-UX-SPEC (источник истины для UX) |
| К-2 | `PRODUCT.md` 8.5 ↔ MVP-UX-SPEC §5 | В 8.5 кнопки — блок 5 в потоке, до «Лучшего времени»; в MVP-UX-SPEC — закреплены внизу (решение №3) | По MVP-UX-SPEC: sticky-блок последним (9.2, 14.1) |
| К-3 | `PRODUCT.md` 8.5 ↔ код | 8.5: «Проверено: <месяц год>»; `formatVerifiedDate()`, используемая в «Справке» и «Подготовке», выводит «11 сентября 2026» | Переиспользуется `formatVerifiedDate()` — единый вид дат во всём приложении. Смена формата — отдельной правкой для всех экранов |
| К-4 | `CONTENT-PLACES.md` §2 прим. 2, §7 риски 1–3, §9 ↔ D-11, `PRODUCT.md` 8.4, MVP-UX-SPEC §4 | `CONTENT-PLACES.md` рассуждает о расстоянии «от района места» до места. По D-11 расстояние считается от центра **выбранного пользователем района проживания** до `location` места | `area` места в расчёте не участвует (раздел 7). Риски §7 п. 2–3 в описанном виде не возникают; `other` без центра важен только как выбор пользователя (нет расстояний, Итерация 3). В спецификациях MVP у `place.area` вообще нет потребителя в интерфейсе — только целостность D-20. Поэтому [OQ-2] влияет на данные, но не на код |
| К-5 | `PRODUCT.md` 9.4 ↔ `CONTENT-PLACES.md` §2 | У района по 9.4 есть `center`; у `other` его нет и не будет | Схема допускает `center: null` только у `other` (1.1) — при подтверждении Q-02 [OQ-8] |
| К-6 | `PRODUCT.md` 9.2, D-18 ↔ `CONTENT-PLACES.md` 5.3, §1 | `sources` обязателен (`{title, url}`, минимум один), а у `yalong-tropical-forest-park` при статусе `verified` нет ни одного URL. Поэтому «9 годны для `verified`» (§1) фактически 7 без решений владельца (ещё `tianya-haijiao` ждёт [OQ-2], [OQ-3]) | Запись не `verified`, пока нет URL [OQ-9]; таблица 2.3. **Снято 2026-09-11:** в `places.json` у записи 3 источника с URL (visitsanya, официальный сайт парка, OSM) — противоречие закрыто данными |
| К-7 | `PRODUCT.md` 9.2 ↔ `CONTENT-PLACES.md` §5 | `why` — массив, а в контенте одна строка через `;`; в ячейках `addressZh`, `location`, `price.note`, `effort`, `durationHours`, `sources` смешаны значения и редакторские пометки | Правила переноса 2.2 |
| К-8 | MVP-UX-SPEC §10 ↔ `CONTENT-PLACES.md` §2 | Пример `config.json` даёт центр `dadonghai` 18.2515, 109.5245; проверенное значение — 18.218626, 109.517611 | Пример иллюстративный (написан до закрытия Q-02); значения — из `CONTENT-PLACES.md` |
| К-9 | `PRODUCT.md` 10.2 ↔ план | 10.2 предусматривает `assets/icons/` и `views/settings.js` | Иконки категорий — эмодзи по ключу в коде, как в «Справке» и нижней панели (D-14 требует иконки, а не файлы) — [OQ-14]. `settings.js` — Итерация 3 |
| К-10 | `PRODUCT.md` 9.1, 10.3 ↔ MVP-UX-SPEC §10 | 9.1 относит к `config.json` «подписи для интерфейса»; схема MVP-UX-SPEC §10 такой секции не содержит | Новую секцию не вводим: подписи справочников — в `config.json` (`name`), подписи фиксированных enum и флаговых чипов — в коде (прецедент `PHASE_LABELS`) |
| К-11 | `ITERATION-2-FOUNDATION.md` §2, §7.1, §8 ↔ код | Foundation описывает код **до** правок; фактически C1–C8 уже применены, применён и C9 (`.task { flex-wrap: wrap }`), который требовал подтверждения владельца. В `PRODUCT.md` 11.1 / 17 выполнение foundation не отражено | План опирается на фактический код (0.1). Факт применения C9 и запись о foundation в `PRODUCT.md` — к сведению владельца |
| К-12 | MVP-UX-SPEC §4, §12; `PRODUCT.md` 7 (Must №4) ↔ `PRODUCT.md` 11.2; код | UX описывает сортировку по расстоянию как поведение списка по умолчанию и плашку «Выберите район» → `#/settings`; по roadmap расстояние и настройки — Итерация 3, маршрута `#/settings` нет (роутер отправит на `#/`) | В Итерации 2 нет ни плашки, ни расстояния — [OQ-10] |

---

## 19. Открытые вопросы

### 19.A Контентные — блокируют создание JSON (не код)

Формулировка «блокируют создание JSON» относится к моменту написания редакции 1.0. Фактически `config.json` и `places.json` созданы 2026-09-11 **до** решений владельца, поэтому ниже добавлен столбец с фактическим состоянием данных на 2026-09-12. Ни один вопрос этим не закрыт.

| № | Вопрос | Источник | Что блокирует | Фактически в JSON (2026-09-12) |
|---|---|---|---|---|
| OQ-1 | Какая точка — центр `city`: общегородская (Wikipedia) или у Первого рынка? | `CONTENT-PLACES.md` §8 №3 | `config.json` → `areas.city.center`. Код Итерации 2 районы не использует | Общегородская точка 18.253330, 109.503610. **Открыт.** С Итерации 3 влияет на видимые пользователю расстояния |
| OQ-2 | Тяньяхайцзяо — `sanya-bay` или `other`? | §8 №1 | `verified` записи `tianya-haijiao`. На код не влияет (К-4). Без этой записи `kids` у 5 мест — порог MVP-UX-SPEC §4 (≥ 5) выполнен впритык | `area: "sanya-bay"`, запись `verified`. **Открыт** |
| OQ-3 | Тяньяхайцзяо: `price.type` `free` или `unknown`? | §8 №6 | То же | `free`; основание усилено (Синьхуа, «Гуанмин жибао» от 2023-05-26). **Открыт** |
| OQ-4 | Первый рынок: какой адрес (解放路100号 / 新建街155号 / ориентир)? Класть ли запись в `places.json` как `draft` до решения или не класть? | §8 №2 | Запись; для кода безразлично — `draft` отфильтруется | 新建街155号, запись `verified` и видна пользователю. **Открыт** |
| OQ-8 | Подтвердить предложение по Q-02 (§9), включая `other` с `center: null` | §9, `PRODUCT.md` 0.2 п. 5 | `config.json` → `areas`; схема 1.1 | Все 6 районов перенесены, `other.center === null`. **Открыт** (Q-02 в `PRODUCT.md` не закрыт) |
| OQ-9 | Нужен хотя бы один источник с URL для `yalong-tropical-forest-park` | Находка этого документа (К-6) | `verified` записи | 3 источника с URL. **Закрыт данными** |
| OQ-6 | Переподтвердить цены 4 платных мест непосредственно перед публикацией; в `price.note` — только пользовательский текст | §8 №5, D-22 | Содержимое `price.note` | `price.note` содержит только пользовательский текст; у лесопарка и Наньшаня — сезонные цены, у Улучжичжоу и «Тысячелетней любви» — без цифр. **Открыт** (публикации не было) |
| OQ-5 | Предупреждения о сезоне / тайфунах на уровне места | §8 №4, `PRODUCT.md` Q-10 | Дефолт: схему не расширяем; при необходимости — через существующее `tips` | Поля нет, `tips` не заполнены нигде. **Открыт** |
| OQ-7 | Паттерн островных мест: `addressZh` / `location` — причал на материке | §5.7, §10 п. 4 | Дефолт: принять как правило данных; при желании пояснить пользователю в `tips`. Схема и код не меняются | Применён у `wuzhizhou-island`; как правило проекта нигде не зафиксирован. **Открыт** |
| OQ-18 | Лухуйтоу: `price.type` `free` (фактически в JSON) или `unknown` (`CONTENT-PLACES.md` 1.0)? Отдельно — источник Синьхуа в записи относится к Тяньяхайцзяо | `CONTENT-PLACES.md` §8 №7, `ITERATION-2-CLOSEOUT.md` §11 п. 2 | Данные записи `luhuitou-park`; на код не влияет | `free` + 4 источника с URL. **Открыт** |

### 19.B UX / технические — есть дефолт, реализацию не блокируют

| № | Вопрос | Дефолт в этом документе |
|---|---|---|
| OQ-10 | Делать ли `distance.js`, `sortByDistance`, «~N км» и плашку района в Итерации 2 или в Итерации 3 (вместе с `stg:trip` и `#/settings`)? | Итерация 3: сейчас нет источника района, код был бы мёртвым (раздел 7, К-12) |
| OQ-11 | Чипы, которые на всей базе дают 0: `shopping` (0 мест) и «В помещении» (среди 10 мест `CONTENT-PLACES.md` нет ни одного `indoor` — только `outdoor` / `mixed`). Показывать ли их; включать ли `mixed` в «В помещении»? То же затронет сценарий Главной «В помещении» (Итерация 3) | Все чипы из MVP-UX-SPEC §4 показываются; «В помещении» строго `setting === "indoor"` (8.4). При 0 работает подсказка «снять фильтр» |
| OQ-12 | Что копируют «Скопировать название» (карточка) и «Скопировать» (таксист) — `name.zh`, `name.ru`, адрес? | Карточка → `name.zh`; таксист → `name.zh` + перевод строки + `addressZh` |
| OQ-13 | Подписи чипов категорий: короткие (8.4: «Пляжи / Природа / Культура») или полные (9.4: «природа и парки», «культура и храмы», «рынки и гастроулицы»)? | Короткие; для `entertainment`, `market`, `shopping` — «Развлечения», «Рынки», «Покупки» (предложение, решает владелец при заполнении `config.json`) |
| OQ-14 | `categories[].icon` — ключ, который код переводит в эмодзи (пример MVP-UX-SPEC §10, паттерн `info.js`), или сам эмодзи в JSON (новая категория без правки кода, MVP-UX-SPEC §14)? | Ключ + объект `CATEGORY_ICONS` в `places.js`; неизвестный ключ → «📍» |
| OQ-15 | Вкладка «Места» сбрасывает фильтры (следствие «URL — единственный источник истины»). Приемлемо? | Да; хранить фильтры ещё и в модуле значило бы два источника истины |
| OQ-16 | Q-03 (Amap) не решён; по формулировке Q-03 кнопка «Открыть в Amap» переносится | Кнопки нет; в `PRODUCT.md` — отметка о переносе при закрытии итерации |
| OQ-17 | Как показывать расстояние < 0,05 км («~0,0 км» — например, пляж Санья Бэй совпадает с центром района) | Итерация 3, вместе с OQ-10 |

---

## 20. Решения, принятые этим документом

Не следуют из спецификаций напрямую; каждое можно отменить без переделки архитектуры.

| № | Решение | Почему |
|---|---|---|
| PI-1 | Без района список — в порядке `places.json` | Порядок не задан ни одним документом; так же устроена «Справка»; порядок контролирует владелец |
| PI-2 | Фильтры: один параметр `f`, токены через запятую в порядке применения; категории — их id, флаги — фиксированный набор; URL при открытии не нормализуется | Foundation 3.3 оставил формат сеансу «Мест»; порядок нужен подсказке (MVP-UX-SPEC §4) |
| PI-3 | `views/places.js` — список; `views/place.js` — карточка и таксист | `PRODUCT.md` 10.2; foundation §14 п. 4 допускает оба варианта |
| PI-4 | Подписи `effort` / `setting` / `price.type` / флагов и `formatDuration()` — в `logic/filters.js` | Нужны и списку, и карточке; прецедент `PHASE_LABELS` в `logic/trip.js`; без нового модуля |
| PI-5 | «← К местам» — вверху карточки | Foundation §14 п. 7 требует `ctx.back("#/places")`, а MVP-UX-SPEC §5 места для элемента не задаёт; низ экрана занят sticky-блоком |
| PI-6 | `copyText()`: Clipboard API в secure context, иначе `execCommand("copy")`; видимая реакция | Проверка идёт по `http://` в локальной сети; `PRODUCT.md` 8.9 |
| PI-7 | Строка списка — существующие `.info-list` / `.info-card*`; иконки категорий — эмодзи по ключу в `places.js` | Единый визуальный язык без новой CSS; паттерн `ICONS` в `info.js` |
| PI-8 | Карточка в Итерации 2 грузит только `loadPlaces()` | `config` карточке пока не нужен; меньше точек отказа офлайн |
| PI-9 | Подсказка при 0 результатах — последний применённый фильтр, снятие которого даёт результаты (иначе — последний) | Уточняет MVP-UX-SPEC §4: подсказка всегда полезна |
| PI-10 | `stg:saved` — порядок добавления; чтение ничего не пишет, чужие id не удаляются | `PRODUCT.md` 9.7 «молча игнорируется»; место может вернуться в `verified` |
| PI-11 | «Сохранённые» без избранного — отдельное пустое состояние | MVP-UX-SPEC §12 |
| PI-12 | Пометка «может измениться» в блоке «время / часы / цена» — всегда, когда блок показан | У мест нет поля `volatile`, а часы и цены изменчивы по определению (`PRODUCT.md` 8.5, 16) |
| PI-13 | Ошибка на экране таксиста — с «Повторить» и «Закрыть» | Без панели навигации экран иначе стал бы тупиком |

---

## Статус

**Технический контракт готов. Реализация кода может начаться сразу после появления `data/config.json` и `data/places.json`.**

- Инфраструктура foundation достаточна: в `app.js` — 3 правки, в `data.js` — 2 функции, в `storage.js` — 2 функции; новые файлы — `logic/filters.js`, `views/place.js`; `views/places.js` заменяет заглушку; CSS — только новые правила.
- **Блокировало реализацию (редакция 1.0):** JSON-данные. Для них нужны решения владельца по 19.A (минимум OQ-1, OQ-8 для `config.json`; OQ-2, OQ-3, OQ-9 — для полноты `places.json`). Семь записей и четыре района из шести (`dadonghai`, `yalong`, `sanya-bay`, `haitang`) переносимы уже сейчас по правилам 2.2.
- **Не блокирует:** вопросы 19.B — у каждого есть дефолт.

### Фактическое состояние на 2026-09-12 (редакция 1.1)

- `data/config.json` и `data/places.json` созданы 2026-09-11; Итерация 2 реализована и проверена (`ITERATION-2-CLOSEOUT.md`). Контракты разделов 3–16 соответствуют коду.
- Данные созданы **до** решений владельца по 19.A: открытыми остаются OQ-1, OQ-2, OQ-3, OQ-4, OQ-5, OQ-6, OQ-7, OQ-8 и новый OQ-18. Реализацию они не блокируют, но остаются вопросами к владельцу.
- Раздел 7 (`distance.js`, `sortByDistance`) и всё, что с ним связано (блок 3 карточки, «~N км» в строке списка, плашка выбора района), по-прежнему **не реализовано** — планируется в Итерации 3, см. `ITERATION-3-IMPLEMENTATION.md`.
