// Расходы поездки, курс и бюджет (ITERATION-8-PRODUCT-AUDIT-2026-09.md §5).
// Чистые функции: без DOM, хранилища и адреса страницы (PRODUCT.md 10.3).
// Входные объекты не мутируются — результат всегда новый (как logic/myplan.js).
//
// Главное правило: расход хранит исходную сумму и исходную валюту и никогда
// не пересчитывается при записи. Рубли считаются только при показе — по
// курсу поездки, который задаёт сам пользователь (X-13: курсов из сети нет).
// Нет курса — нет рублёвого эквивалента: итог честно говорит, какая часть
// не пересчитана, а не подставляет выдуманный курс.

// Порядок валют — порядок кнопок формы и строк итогов.
export const CURRENCIES = [
  { id: "CNY", symbol: "¥", name: "юань" },
  { id: "RUB", symbol: "₽", name: "рубль" },
  { id: "USD", symbol: "$", name: "доллар" },
  { id: "EUR", symbol: "€", name: "евро" },
];

// Базовая валюта итогов. Поле base есть в stg:budget на будущее, интерфейс
// его не меняет.
export const BASE_CURRENCY = "RUB";

// Валюта по умолчанию для первого расхода: поездка в Китай.
export const DEFAULT_CURRENCY = "CNY";

// Порядок категорий — порядок кнопок формы.
export const EXPENSE_CATEGORIES = [
  { id: "food", name: "Еда", icon: "🍜" },
  { id: "transport", name: "Транспорт", icon: "🚕" },
  { id: "excursions", name: "Экскурсии", icon: "🧭" },
  { id: "shopping", name: "Покупки", icon: "🛍️" },
  { id: "hotel", name: "Отель", icon: "🏨" },
  { id: "connectivity", name: "Связь", icon: "📶" },
  { id: "fees", name: "Комиссии", icon: "💳" },
  { id: "health", name: "Здоровье", icon: "💊" },
  { id: "prep", name: "Подготовка", icon: "🧳" },
  { id: "other", name: "Прочее", icon: "📦" },
];

// Ссылка расхода на пункт «Моего плана»: у пунктов дня нет собственных id,
// поэтому хранится тип и id места/экскурсии.
export const LINK_KINDS = ["place", "excursion"];

export const NOTE_MAX_LENGTH = 80;

// Разумные границы ввода: отсекают опечатку «лишний ноль» на порядки, но не
// реальные траты поездки.
const AMOUNT_MAX = 100000000;
const RATE_MAX = 100000;
const BUDGET_MAX = 1000000000;

const CURRENCY_IDS = CURRENCIES.map((c) => c.id);
const CATEGORY_IDS = EXPENSE_CATEGORIES.map((c) => c.id);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isCurrency(value) {
  return CURRENCY_IDS.includes(value);
}

export function isExpenseCategory(value) {
  return CATEGORY_IDS.includes(value);
}

export function currencyOf(id) {
  return CURRENCIES.find((c) => c.id === id) || null;
}

export function categoryOf(id) {
  return EXPENSE_CATEGORIES.find((c) => c.id === id) || null;
}

function isIsoDate(value) {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

// Деньги считаются в сотых долях целыми числами: 0,1 + 0,2 не даёт 0,30000000000000004.
function toCents(amount) {
  return Math.round(amount * 100);
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

// Ввод пользователя → число или null. Принимает «320», «320,50», «1 200»,
// «1 200.5»; отрицательные, нулевые, нечисловые и больше AMOUNT_MAX — null.
function parsePositive(raw, max) {
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 && raw <= max ? raw : null;
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/[\s  ]/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 && value <= max ? value : null;
}

export function parseAmount(raw) {
  const value = parsePositive(raw, AMOUNT_MAX);
  if (value === null) return null;
  const rounded = round2(value);
  return rounded > 0 ? rounded : null;
}

// Курс: сколько рублей в одной единице валюты. До 4 знаков — курс юаня
// обычно пишут с двумя-четырьмя знаками.
export function parseRate(raw) {
  const value = parsePositive(raw, RATE_MAX);
  if (value === null) return null;
  const rounded = Math.round(value * 10000) / 10000;
  return rounded > 0 ? rounded : null;
}

export function parseBudget(raw) {
  const value = parsePositive(raw, BUDGET_MAX);
  return value === null ? null : Math.round(value);
}

// ------------------------------------------------------------ нормализация

function normalizeLink(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (!LINK_KINDS.includes(value.kind) || typeof value.id !== "string" || !value.id) return null;
  return { kind: value.kind, id: value.id };
}

// Один расход через белый список полей; невалидный — null (отбрасывается).
export function normalizeExpense(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (typeof value.id !== "string" || !value.id) return null;
  if (!isIsoDate(value.date)) return null;
  const amount = parseAmount(value.amount);
  if (amount === null) return null;
  if (!isCurrency(value.currency) || !isExpenseCategory(value.category)) return null;
  const item = { id: value.id, date: value.date, amount, currency: value.currency, category: value.category };
  const note = typeof value.note === "string" ? value.note.trim().slice(0, NOTE_MAX_LENGTH) : "";
  if (note) item.note = note;
  const link = normalizeLink(value.link);
  if (link) item.link = link;
  if (typeof value.createdAt === "string" && value.createdAt) item.createdAt = value.createdAt;
  if (typeof value.updatedAt === "string" && value.updatedAt) item.updatedAt = value.updatedAt;
  return item;
}

// Всё значение stg:expenses. Повторные id — остаётся первый.
export function normalizeExpensesState(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const items = [];
  const seen = new Set();
  (Array.isArray(source.items) ? source.items : []).forEach((raw) => {
    const item = normalizeExpense(raw);
    if (!item || seen.has(item.id)) return;
    seen.add(item.id);
    items.push(item);
  });
  const state = { v: 1, items };
  if (isCurrency(source.lastCurrency)) state.lastCurrency = source.lastCurrency;
  return state;
}

// stg:budget: { v, base, rates: { CNY: 11.8 }, budget }. Курс базовой валюты
// не хранится — он всегда 1.
export function normalizeBudgetState(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const rates = {};
  const rawRates = source.rates && typeof source.rates === "object" && !Array.isArray(source.rates) ? source.rates : {};
  CURRENCY_IDS.forEach((id) => {
    if (id === BASE_CURRENCY) return;
    const rate = parseRate(rawRates[id]);
    if (rate !== null) rates[id] = rate;
  });
  const state = { v: 1, base: BASE_CURRENCY, rates };
  const budget = parseBudget(source.budget);
  if (budget !== null) state.budget = budget;
  return state;
}

// ------------------------------------------------------------ операции

function newId(now) {
  return `exp-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// input — { date, amount, currency, category, note?, link? } уже в разобранном
// виде. Возвращает новый расход или null, если вход невалиден.
export function createExpense(input, now = new Date()) {
  const stamp = now.toISOString();
  return normalizeExpense({ ...input, id: newId(now), createdAt: stamp });
}

export function addExpense(state, item) {
  const current = normalizeExpensesState(state);
  if (!item) return current;
  return { ...current, items: [...current.items, item], lastCurrency: item.currency };
}

// Правка сохраняет id и createdAt; неизвестный id — состояние без изменений.
export function updateExpense(state, id, input, now = new Date()) {
  const current = normalizeExpensesState(state);
  const index = current.items.findIndex((item) => item.id === id);
  if (index === -1) return current;
  const prev = current.items[index];
  const next = normalizeExpense({ ...input, id, createdAt: prev.createdAt, updatedAt: now.toISOString() });
  if (!next) return current;
  const items = current.items.slice();
  items[index] = next;
  return { ...current, items, lastCurrency: next.currency };
}

export function removeExpense(state, id) {
  const current = normalizeExpensesState(state);
  return { ...current, items: current.items.filter((item) => item.id !== id) };
}

// ------------------------------------------------------------ итоги

// Сумма в базовой валюте или null, если курса нет.
export function toBase(amount, currency, rates) {
  if (currency === BASE_CURRENCY) return amount;
  const rate = rates && rates[currency];
  return Number.isFinite(rate) && rate > 0 ? amount * rate : null;
}

// Итог по набору расходов:
//   byCurrency — [{ currency, amount }] только ненулевые, в порядке CURRENCIES;
//   base       — сумма всего, что удалось пересчитать, в рублях;
//   missing    — [{ currency, amount }] сумм без курса;
//   complete   — пересчитано всё.
export function summarize(items, rates) {
  const cents = {};
  let baseTotal = 0;
  const missingCents = {};
  (Array.isArray(items) ? items : []).forEach((item) => {
    cents[item.currency] = (cents[item.currency] || 0) + toCents(item.amount);
    const converted = toBase(item.amount, item.currency, rates);
    if (converted === null) {
      missingCents[item.currency] = (missingCents[item.currency] || 0) + toCents(item.amount);
    } else {
      baseTotal += converted;
    }
  });
  const list = (map) => CURRENCY_IDS.filter((id) => map[id]).map((id) => ({ currency: id, amount: map[id] / 100 }));
  const missing = list(missingCents);
  return {
    count: Array.isArray(items) ? items.length : 0,
    byCurrency: list(cents),
    base: round2(baseTotal),
    missing,
    complete: missing.length === 0,
  };
}

export function filterByDate(items, date) {
  return (Array.isArray(items) ? items : []).filter((item) => item.date === date);
}

// [{ category, items, summary }] только непустые категории. Порядок — по
// рублёвому итогу по убыванию, при равенстве — порядок EXPENSE_CATEGORIES.
export function groupByCategory(items, rates) {
  const groups = EXPENSE_CATEGORIES.map((category) => {
    const own = (items || []).filter((item) => item.category === category.id);
    return { category, items: own, summary: summarize(own, rates) };
  }).filter((group) => group.items.length);
  return groups
    .map((group, index) => ({ group, index }))
    .sort((a, b) => b.group.summary.base - a.group.summary.base || a.index - b.index)
    .map(({ group }) => group);
}

// [{ date, items, summary }] — новые даты сверху, внутри дня новые записи сверху.
export function groupByDate(items, rates) {
  const byDate = new Map();
  (items || []).forEach((item) => {
    if (!byDate.has(item.date)) byDate.set(item.date, []);
    byDate.get(item.date).push(item);
  });
  return [...byDate.keys()]
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
    .map((date) => {
      const own = byDate
        .get(date)
        .map((item, index) => ({ item, index }))
        .sort((a, b) => (b.item.createdAt || "").localeCompare(a.item.createdAt || "") || b.index - a.index)
        .map(({ item }) => item);
      return { date, items: own, summary: summarize(own, rates) };
    });
}

// Бюджет: null, если не задан. left может быть отрицательным (перерасход).
// complete = false — часть расходов без курса, «потрачено» и «осталось» неполные.
export function budgetStatus(budget, summary) {
  if (!Number.isFinite(budget) || budget <= 0) return null;
  const spent = summary ? summary.base : 0;
  return {
    budget,
    spent,
    left: round2(budget - spent),
    ratio: Math.min(1, Math.max(0, spent / budget)),
    over: spent > budget,
    complete: summary ? summary.complete : true,
  };
}

// Сколько дней бюджета осталось, включая сегодня (Iteration 9): до поездки —
// вся поездка, в поездке — от сегодня до конца, после или без дат — null.
export function budgetDaysLeft(trip, today) {
  const start = trip && trip.start;
  const end = trip && trip.end;
  if (!isIsoDate(start) || !isIsoDate(end) || !isIsoDate(today) || start > end || today > end) return null;
  const from = today < start ? start : today;
  const ms = (iso) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((ms(end) - ms(from)) / 86400000) + 1;
}

// «Остаток на день» — фактический остаток бюджета, делённый на оставшиеся
// дни. Не прогноз: будущие траты не угадываются. null — считать нечего
// (нет бюджета, дат или остаток уже исчерпан).
export function dailyAllowance(status, daysLeft) {
  if (!status || status.over || status.left <= 0 || !Number.isInteger(daysLeft) || daysLeft < 1) return null;
  return round2(status.left / daysLeft);
}

// ------------------------------------------------------------ форматирование

const NBSP = " ";

function formatNumber(value, maxFraction) {
  // Группы разрядов — обычный неразрывный пробел: узкий U+202F из ru-RU в
  // части шрифтов Android рисуется как пустой квадрат.
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: maxFraction })
    .format(value)
    .replace(/[  ]/g, NBSP);
}

// «1 240 ¥», «320,5 ¥», «14 632 ₽».
export function formatMoney(amount, currency) {
  const info = currencyOf(currency);
  return `${formatNumber(amount, 2)}${NBSP}${info ? info.symbol : currency}`;
}

// Рублёвый эквивалент: целые рубли и «≈» — это пересчёт, а не факт.
export function formatApproxBase(amount) {
  return `≈${NBSP}${formatNumber(Math.round(amount), 0)}${NBSP}${currencyOf(BASE_CURRENCY).symbol}`;
}

// «1 240 ¥ + 3 000 ₽»; пустой итог — «0 ₽».
export function formatByCurrency(summary) {
  if (!summary || !summary.byCurrency.length) return formatMoney(0, BASE_CURRENCY);
  return summary.byCurrency.map(({ currency, amount }) => formatMoney(amount, currency)).join(" + ");
}

// Строка рублёвого эквивалента или null, если он не нужен (всё уже в рублях)
// или не может быть посчитан вовсе.
//   «≈ 14 632 ₽»
//   «≈ 3 000 ₽ + 500 ¥ без курса»
//   «Итог в рублях не посчитан: не задан курс ¥»
// short — для строк категорий и дней: «≈ ₽ — нет курса ¥» вместо длинной фразы.
export function formatBaseLine(summary, short = false) {
  if (!summary || !summary.count) return null;
  const onlyBase = summary.byCurrency.length === 1 && summary.byCurrency[0].currency === BASE_CURRENCY;
  if (onlyBase) return null;
  const converted = summary.byCurrency.some(({ currency }) => !summary.missing.find((m) => m.currency === currency));
  if (!converted) {
    const symbols = summary.missing.map((m) => currencyOf(m.currency).symbol).join(", ");
    if (short) return `≈${NBSP}₽ — нет курса ${symbols}`;
    return `Итог в рублях не посчитан: не задан курс ${summary.missing.map((m) => currencyOf(m.currency).symbol).join(", ")}`;
  }
  const missing = summary.missing.map(({ currency, amount }) => formatMoney(amount, currency)).join(" + ");
  return missing ? `${formatApproxBase(summary.base)} + ${missing} без курса` : formatApproxBase(summary.base);
}

// «1 ¥ = 11,8 ₽ · 1 $ = 82,5 ₽» — только заданные курсы.
export function formatRates(rates) {
  return CURRENCIES.filter((c) => c.id !== BASE_CURRENCY && rates && rates[c.id])
    .map((c) => `1${NBSP}${c.symbol} = ${formatNumber(rates[c.id], 4)}${NBSP}${currencyOf(BASE_CURRENCY).symbol}`)
    .join(" · ");
}

// Валюты расходов, для которых курс не задан, — для подсказки на экране.
export function currenciesWithoutRate(items, rates) {
  return summarize(items, rates).missing.map((m) => m.currency);
}

// Текстовый отчёт для «Скопировать отчёт» — ручной бэкап и «отправить себе».
// formatDate — функция даты для заголовков дней (из logic/plan.js).
export function formatReport(items, budgetState, formatDate) {
  const rates = (budgetState && budgetState.rates) || {};
  const total = summarize(items, rates);
  const lines = ["Расходы поездки", `Всего: ${formatByCurrency(total)}`];
  const baseLine = formatBaseLine(total);
  if (baseLine) lines.push(baseLine);
  const ratesLine = formatRates(rates);
  if (ratesLine) lines.push(`Курс поездки: ${ratesLine}`);
  const status = budgetStatus(budgetState && budgetState.budget, total);
  if (status) {
    lines.push(`Бюджет: ${formatMoney(status.budget, BASE_CURRENCY)}, осталось ${formatApproxBase(status.left)}${status.complete ? "" : " (без расходов без курса)"}`);
  }
  lines.push("", "По категориям:");
  groupByCategory(items, rates).forEach(({ category, summary }) => {
    lines.push(`${category.name}: ${formatByCurrency(summary)}`);
  });
  groupByDate(items, rates).forEach(({ date, items: own, summary }) => {
    lines.push("", `${formatDate ? formatDate(date) : date} — ${formatByCurrency(summary)}`);
    own.forEach((item) => {
      const category = categoryOf(item.category);
      lines.push(`  ${formatMoney(item.amount, item.currency)} · ${category ? category.name : item.category}${item.note ? ` · ${item.note}` : ""}`);
    });
  });
  return lines.join("\n");
}
