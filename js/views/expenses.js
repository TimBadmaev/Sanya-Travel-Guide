import { loadPlaces, loadExcursions } from "../data.js";
import { storage } from "../storage.js";
import {
  BASE_CURRENCY,
  CURRENCIES,
  DEFAULT_CURRENCY,
  EXPENSE_CATEGORIES,
  NOTE_MAX_LENGTH,
  addExpense,
  budgetDaysLeft,
  budgetStatus,
  dailyAllowance,
  categoryOf,
  createExpense,
  currenciesWithoutRate,
  currencyOf,
  filterByDate,
  formatApproxBase,
  formatBaseLine,
  formatByCurrency,
  formatMoney,
  formatRates,
  formatReport,
  groupByCategory,
  groupByDate,
  parseAmount,
  parseBudget,
  parseRate,
  removeExpense,
  summarize,
  updateExpense,
} from "../logic/expenses.js";
import { formatShortDate, getDayExcursions, getDayPlaces, isIsoDate } from "../logic/plan.js";
import { getTodayIso, pluralizeRu } from "../logic/trip.js";
import { appendBackLink, createConfirm } from "./plan.js";
import { bindCopyButton } from "./taxi.js";

// Расходы поездки (Iteration 8, ITERATION-8-PRODUCT-AUDIT-2026-09.md §5):
// #/expenses — итоги и список, #/expenses/add и #/expenses/<id> — форма,
// #/expenses/settings — курс поездки и бюджет. Вложенные экраны «Сейчас»,
// как #/plan и #/settings: пятая вкладка остаётся пятой (D-07). Экраны
// работают только с stg:expenses / stg:budget; контент (места, экскурсии)
// нужен лишь для подписи «из плана» и необязателен — без него расходы
// по-прежнему записываются и считаются.

const SAVE_FAILED_TEXT = "Не удалось сохранить: хранилище браузера недоступно.";
const RATES_HREF = "#/expenses/settings";

function appendText(parent, tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.textContent = text;
  parent.appendChild(el);
  return el;
}

function pathOf(hash) {
  return (hash || "").replace(/^#/, "").split("?")[0] || "/";
}

const PLAN_DAY_PATH = /^\/plan\/\d{4}-\d{2}-\d{2}$/;

// Родитель для «← Назад» и выхода после сохранения: откуда пришли, если это
// ожидаемый экран; иначе (глубокая ссылка, перезагрузка) — fallback.
function parentOf(ctx, allowed, fallback) {
  if (!ctx.from) return fallback;
  const path = pathOf(ctx.from);
  const ok = allowed.some((rule) => (rule instanceof RegExp ? rule.test(path) : rule === path));
  return ok ? ctx.from : fallback;
}

// Места и экскурсии — только для подписи ссылки «из плана». Ошибка загрузки
// не мешает расходам: подписи просто не будет.
async function loadNames() {
  const [places, excursions] = await Promise.all([
    loadPlaces().catch(() => []),
    loadExcursions().catch(() => []),
  ]);
  return { places, excursions };
}

function linkTitle(link, { places, excursions }) {
  if (!link) return "";
  if (link.kind === "place") {
    const place = places.find((p) => p.id === link.id);
    return place ? place.name.ru : "";
  }
  const excursion = excursions.find((e) => e.id === link.id);
  return excursion ? excursion.title.ru : "";
}

// Пункты «Моего плана» на дату — варианты ссылки расхода.
function planItemsFor(date, names) {
  const day = storage.getMyPlan().days[date];
  if (!day) return [];
  return [
    ...getDayExcursions(day, names.excursions).excursions.map((e) => ({ kind: "excursion", id: e.id, title: e.title.ru })),
    ...getDayPlaces(day, names.places).places.map((p) => ({ kind: "place", id: p.id, title: p.name.ru })),
  ];
}

// Итог: «1 240 ¥ + 3 000 ₽» крупно и строка рублёвого эквивалента под ним.
function appendSummary(parent, summary) {
  appendText(parent, "span", "expense-stat__value", summary.count ? formatByCurrency(summary) : "0 ₽");
  const baseLine = formatBaseLine(summary);
  if (baseLine) appendText(parent, "span", "expense-stat__base", baseLine);
}

// ------------------------------------------------------------ блоки для других экранов

// Карточка на «Сейчас» в поездке: итог дня + быстрый «+ Расход». Две
// отдельные ссылки, а не ссылка в ссылке.
export function renderHomeExpenses(container, today) {
  const { items } = storage.getExpenses();
  const { rates } = storage.getBudget();
  const summary = summarize(filterByDate(items, today), rates);

  const wrap = document.createElement("div");
  wrap.className = "home-expenses";
  const card = document.createElement("a");
  card.href = "#/expenses";
  card.className = "home-plan home-expenses__card";
  appendText(card, "span", "home-plan__label", "Расходы сегодня");
  appendText(card, "span", "home-plan__title", summary.count ? formatByCurrency(summary) : "Пока ничего");
  const baseLine = formatBaseLine(summary);
  if (baseLine) appendText(card, "span", "home-expenses__base", baseLine);
  wrap.appendChild(card);

  const add = document.createElement("a");
  add.href = "#/expenses/add";
  add.className = "btn btn--primary home-expenses__add";
  add.textContent = "+ Расход";
  add.setAttribute("aria-label", "Добавить расход");
  wrap.appendChild(add);
  container.appendChild(wrap);
}

// ------------------------------------------------------------ #/expenses

function renderBudget(container, budgetState, total) {
  const status = budgetStatus(budgetState.budget, total);
  if (!status) return;
  const block = document.createElement("div");
  block.className = "expense-budget";
  appendText(block, "p", "expense-budget__title", `Бюджет поездки: ${formatMoney(status.budget, BASE_CURRENCY)}`);
  const bar = document.createElement("div");
  bar.className = `progress${status.over ? " progress--over" : ""}`;
  bar.setAttribute("role", "progressbar");
  bar.setAttribute("aria-label", "Потрачено из бюджета");
  bar.setAttribute("aria-valuemin", "0");
  bar.setAttribute("aria-valuemax", String(status.budget));
  bar.setAttribute("aria-valuenow", String(Math.round(Math.min(status.spent, status.budget))));
  const fill = document.createElement("div");
  fill.className = "progress__fill";
  fill.style.width = `${status.ratio * 100}%`;
  bar.appendChild(fill);
  block.appendChild(bar);
  appendText(block, "p", "expense-budget__line", `Потрачено ${formatApproxBase(status.spent)}`);
  appendText(
    block,
    "p",
    "expense-budget__line",
    status.over ? `Перерасход ${formatApproxBase(-status.left)}` : `Осталось ${formatApproxBase(status.left)}`
  );
  const daysLeft = budgetDaysLeft(storage.getTrip(), getTodayIso());
  const perDay = dailyAllowance(status, daysLeft);
  if (perDay !== null) {
    appendText(block, "p", "expense-budget__line", `Остаток на день: ${formatApproxBase(perDay)} — осталось ${daysLeft} ${pluralizeRu(daysLeft, ["день", "дня", "дней"])} поездки`);
  }
  if (!status.complete) {
    const missing = total.missing.map(({ currency, amount }) => formatMoney(amount, currency)).join(" + ");
    appendText(block, "p", "expense-budget__warn", `Без учёта ${missing}: не задан курс.`);
  }
  container.appendChild(block);
}

function renderRatesNotice(container, items, budgetState) {
  const notice = document.createElement("p");
  notice.className = "area-notice expense-rates";
  const ratesLine = formatRates(budgetState.rates);
  const missing = currenciesWithoutRate(items, budgetState.rates);
  if (missing.length) {
    const symbols = missing.map((id) => currencyOf(id).symbol).join(", ");
    notice.append(`Не задан курс ${symbols} — итог в рублях неполный. `);
  } else if (ratesLine) {
    notice.append(`Курс поездки: ${ratesLine}. Рубли — пересчёт по этому курсу. `);
  } else {
    notice.append("Рубли считаются по курсу, который задаёте вы. ");
  }
  const link = document.createElement("a");
  link.href = RATES_HREF;
  link.className = "area-notice__link";
  link.textContent = "Курс и бюджет";
  notice.appendChild(link);
  container.appendChild(notice);
}

export function renderExpenseRow(item, names) {
  const category = categoryOf(item.category);
  const row = document.createElement("a");
  row.href = `#/expenses/${item.id}`;
  row.className = "info-card expense-row";
  appendText(row, "span", "info-card__icon", category ? category.icon : "📦").setAttribute("aria-hidden", "true");
  const body = document.createElement("span");
  body.className = "info-card__body";
  appendText(body, "span", "info-card__title", item.note || (category ? category.name : ""));
  const meta = [item.note && category ? category.name : "", linkTitle(item.link, names)].filter(Boolean).join(" · ");
  if (meta) appendText(body, "span", "info-card__summary", meta);
  row.appendChild(body);
  appendText(row, "span", "expense-row__amount", formatMoney(item.amount, item.currency));
  return row;
}

export async function renderExpenses(container, ctx) {
  container.innerHTML = '<p class="loading">Загрузка расходов…</p>';
  const names = await loadNames();
  if (!ctx.isCurrent()) return;

  const { items } = storage.getExpenses();
  const budgetState = storage.getBudget();
  const { rates } = budgetState;
  const today = getTodayIso();

  container.innerHTML = "";
  appendBackLink(container, "← Назад", parentOf(ctx, ["/", PLAN_DAY_PATH], "#/"), ctx);
  appendText(container, "h2", "view-title", "Расходы");
  if (!storage.isAvailable()) {
    appendText(container, "p", "area-notice", "Хранилище браузера недоступно — расходы не сохранятся.");
  }

  const add = appendText(container, "a", "btn btn--primary expense-add", "+ Добавить расход");
  add.href = "#/expenses/add";

  if (!items.length) {
    appendText(
      container,
      "p",
      "empty-state expense-empty",
      "Пока нет расходов. Записывайте траты сразу: сумма, валюта и категория — несколько секунд. Суммы хранятся в той валюте, в которой вы платили."
    );
    renderRatesNotice(container, items, budgetState);
    renderBudget(container, budgetState, summarize(items, rates));
    return;
  }

  const total = summarize(items, rates);
  const stats = document.createElement("div");
  stats.className = "expense-stats";
  [
    ["Сегодня", summarize(filterByDate(items, today), rates)],
    ["Вся поездка", total],
  ].forEach(([label, summary]) => {
    const stat = document.createElement("p");
    stat.className = "expense-stat";
    appendText(stat, "span", "expense-stat__label", label);
    appendSummary(stat, summary);
    stats.appendChild(stat);
  });
  container.appendChild(stats);

  renderRatesNotice(container, items, budgetState);
  renderBudget(container, budgetState, total);

  appendText(container, "h3", "place-detail__subtitle", "По категориям");
  const categories = document.createElement("ul");
  categories.className = "expense-categories";
  groupByCategory(items, rates).forEach(({ category, summary }) => {
    const li = document.createElement("li");
    li.className = "expense-category";
    appendText(li, "span", "expense-category__name", `${category.icon} ${category.name}`);
    const value = document.createElement("span");
    value.className = "expense-category__value";
    appendText(value, "span", "", formatByCurrency(summary));
    const baseLine = formatBaseLine(summary, true);
    if (baseLine) appendText(value, "span", "expense-category__base", baseLine);
    li.appendChild(value);
    categories.appendChild(li);
  });
  container.appendChild(categories);

  appendText(container, "h3", "place-detail__subtitle", "По дням");
  groupByDate(items, rates).forEach(({ date, items: own, summary }) => {
    const day = document.createElement("section");
    day.className = "expense-day";
    const head = document.createElement("p");
    head.className = "expense-day__head";
    appendText(head, "span", "expense-day__date", `${formatShortDate(date)}${date === today ? " · Сегодня" : ""}`);
    appendText(head, "span", "expense-day__total", formatByCurrency(summary));
    day.appendChild(head);
    const baseLine = formatBaseLine(summary, true);
    if (baseLine) appendText(day, "p", "expense-day__base", baseLine);
    const list = document.createElement("div");
    list.className = "info-list";
    own.forEach((item) => list.appendChild(renderExpenseRow(item, names)));
    day.appendChild(list);
    container.appendChild(day);
  });

  // Ручной бэкап: iOS может очистить данные сайта, не добавленного на экран
  // «Домой»; отчёт можно отправить себе в заметки или мессенджер.
  const copyWrap = document.createElement("div");
  copyWrap.className = "expense-copy";
  const copy = appendText(copyWrap, "button", "btn btn--secondary", "Скопировать отчёт");
  copy.type = "button";
  const copyStatus = appendText(copyWrap, "p", "place-actions__status", "");
  copyStatus.setAttribute("role", "status");
  bindCopyButton(copy, copyStatus, () => formatReport(storage.getExpenses().items, storage.getBudget(), formatShortDate));
  appendText(copyWrap, "p", "plan-hint", "Отчёт — текст для себя или попутчиков. Расходы хранятся только на этом телефоне — чтобы не потерять их и перенести на другой телефон, сохраните копию данных файлом.");
  appendText(copyWrap, "a", "home-link", "Сохранить копию всех данных ›").href = "#/data";
  container.appendChild(copyWrap);
}

// ------------------------------------------------------------ форма

// Радиогруппа-«чипы»: нативные radio (клавиатура, скринридер), подпись —
// вся зона нажатия ≥44px.
function createChoiceGroup(legendText, name, options, selected) {
  const fieldset = document.createElement("fieldset");
  fieldset.className = "settings-section expense-choices";
  appendText(fieldset, "legend", "settings-section__title", legendText);
  const wrap = document.createElement("div");
  wrap.className = "expense-choices__list";
  const inputs = options.map(({ value, label }) => {
    const choice = document.createElement("label");
    choice.className = "expense-choice";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = name;
    input.value = value;
    input.className = "expense-choice__input";
    input.checked = value === selected;
    choice.appendChild(input);
    appendText(choice, "span", "expense-choice__label", label);
    wrap.appendChild(choice);
    return input;
  });
  fieldset.appendChild(wrap);
  return { fieldset, value: () => (inputs.find((i) => i.checked) || {}).value || null, focus: () => inputs[0].focus() };
}

function createField(labelText, id, input) {
  const field = document.createElement("div");
  field.className = "settings-field settings-field--stacked";
  const label = appendText(field, "label", "settings-field__label", labelText);
  label.htmlFor = id;
  input.id = id;
  input.classList.add("settings-field__input");
  field.appendChild(input);
  return field;
}

function formatInputNumber(value) {
  return String(value).replace(".", ",");
}

// #/expenses/add и #/expenses/<id>
export async function renderExpenseForm(container, ctx) {
  const editId = ctx.params.id || null;
  const state = storage.getExpenses();
  const existing = editId ? state.items.find((item) => item.id === editId) : null;
  if (editId && !existing) {
    window.location.replace("#/expenses");
    return;
  }

  container.innerHTML = '<p class="loading">Загрузка…</p>';
  const names = await loadNames();
  if (!ctx.isCurrent()) return;

  // Правка открывается и из списка расходов, и из «Расходов за день» в дне
  // плана (Iteration 9) — возврат туда, откуда пришли.
  const parent = existing ? parentOf(ctx, ["/expenses", PLAN_DAY_PATH], "#/expenses") : parentOf(ctx, ["/", "/expenses", PLAN_DAY_PATH], "#/expenses");
  const queryDate = ctx.query.get("date");
  const initial = existing || {
    date: isIsoDate(queryDate) ? queryDate : getTodayIso(),
    currency: state.lastCurrency || DEFAULT_CURRENCY,
  };

  container.innerHTML = "";
  appendBackLink(container, "← Назад", parent, ctx);
  appendText(container, "h2", "view-title", existing ? "Расход" : "Новый расход");

  const form = document.createElement("form");
  form.className = "expense-form";
  form.noValidate = true;

  const amount = document.createElement("input");
  amount.type = "text";
  amount.inputMode = "decimal";
  amount.autocomplete = "off";
  amount.enterKeyHint = "done";
  amount.placeholder = "0";
  amount.className = "expense-form__amount";
  if (existing) amount.value = formatInputNumber(existing.amount);
  form.appendChild(createField("Сумма", "expense-amount", amount));

  const currency = createChoiceGroup(
    "Валюта",
    "expense-currency",
    CURRENCIES.map((c) => ({ value: c.id, label: `${c.symbol} ${c.id}` })),
    initial.currency
  );
  form.appendChild(currency.fieldset);

  const category = createChoiceGroup(
    "Категория",
    "expense-category",
    EXPENSE_CATEGORIES.map((c) => ({ value: c.id, label: `${c.icon} ${c.name}` })),
    existing ? existing.category : null
  );
  form.appendChild(category.fieldset);

  const date = document.createElement("input");
  date.type = "date";
  date.value = initial.date;
  form.appendChild(createField("Дата", "expense-date", date));

  const note = document.createElement("input");
  note.type = "text";
  note.maxLength = NOTE_MAX_LENGTH;
  note.autocomplete = "off";
  note.placeholder = "Например: ужин, такси в аэропорт";
  if (existing && existing.note) note.value = existing.note;
  form.appendChild(createField("Комментарий (необязательно)", "expense-note", note));

  // Ссылка на пункт «Моего плана» выбранной даты — только если в дне есть
  // пункты. Список перестраивается при смене даты.
  const linkSelect = document.createElement("select");
  const linkField = createField("Относится к плану дня (необязательно)", "expense-link", linkSelect);
  form.appendChild(linkField);
  const fillLinks = (keep) => {
    const options = isIsoDate(date.value) ? planItemsFor(date.value, names) : [];
    // Расход, привязанный к пункту, которого в дне больше нет, сохраняет
    // ссылку, пока пользователь её не сменит.
    if (keep && !options.some((o) => o.kind === keep.kind && o.id === keep.id)) {
      const title = linkTitle(keep, names);
      if (title) options.push({ ...keep, title });
    }
    linkSelect.innerHTML = "";
    const none = document.createElement("option");
    none.value = "";
    none.textContent = "— не относится";
    linkSelect.appendChild(none);
    options.forEach((o) => {
      const option = document.createElement("option");
      option.value = `${o.kind}:${o.id}`;
      option.textContent = o.title;
      linkSelect.appendChild(option);
    });
    if (keep) linkSelect.value = `${keep.kind}:${keep.id}`;
    if (linkSelect.selectedIndex === -1) linkSelect.value = "";
    linkField.hidden = options.length === 0;
  };
  fillLinks(existing ? existing.link : null);
  date.addEventListener("change", () => fillLinks(null));

  const status = appendText(form, "p", "settings__status", "");
  status.setAttribute("role", "status");

  const actions = document.createElement("div");
  actions.className = "settings-actions";
  const save = appendText(actions, "button", "btn btn--primary", "Сохранить");
  save.type = "submit";
  form.appendChild(actions);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const parsedAmount = parseAmount(amount.value);
    if (parsedAmount === null) {
      status.textContent = "Введите сумму больше нуля — например, 320 или 45,50.";
      amount.focus();
      return;
    }
    const categoryId = category.value();
    if (!categoryId) {
      status.textContent = "Выберите категорию.";
      category.focus();
      return;
    }
    if (!isIsoDate(date.value)) {
      status.textContent = "Укажите дату расхода.";
      date.focus();
      return;
    }
    const [kind, id] = linkSelect.value ? linkSelect.value.split(/:(.+)/) : [];
    const input = {
      date: date.value,
      amount: parsedAmount,
      currency: currency.value() || DEFAULT_CURRENCY,
      category: categoryId,
      note: note.value,
      link: kind && !linkField.hidden ? { kind, id } : null,
    };
    const current = storage.getExpenses();
    const next = existing ? updateExpense(current, existing.id, input) : addExpense(current, createExpense(input));
    if (!storage.setExpenses(next)) {
      status.textContent = SAVE_FAILED_TEXT;
      return;
    }
    ctx.back(parent);
  });

  container.appendChild(form);

  if (existing) {
    const remove = appendText(container, "button", "btn btn--secondary expense-remove", "Удалить расход");
    remove.type = "button";
    remove.addEventListener("click", () => {
      remove.hidden = true;
      const box = createConfirm(
        `Удалить расход ${formatMoney(existing.amount, existing.currency)}?`,
        [
          {
            label: "Удалить",
            primary: true,
            onClick: () => {
              if (storage.setExpenses(removeExpense(storage.getExpenses(), existing.id))) {
                ctx.back(parent);
              } else {
                status.textContent = SAVE_FAILED_TEXT;
              }
            },
          },
        ],
        () => {
          box.remove();
          remove.hidden = false;
          remove.focus();
        }
      );
      remove.after(box);
      box.querySelector("button").focus();
    });
  } else {
    // Новый расход начинается с суммы: клавиатура открывается сразу там, где
    // браузер это разрешает (iOS без жеста пользователя фокус не даёт).
    amount.focus();
  }
}

// ------------------------------------------------------------ #/expenses/settings

export function renderExpenseSettings(container, ctx) {
  const parent = parentOf(ctx, ["/expenses", "/"], "#/expenses");
  const budgetState = storage.getBudget();

  container.innerHTML = "";
  appendBackLink(container, "← Назад", parent, ctx);
  appendText(container, "h2", "view-title", "Курс и бюджет");
  appendText(
    container,
    "p",
    "settings__intro",
    "Курс задаёте вы — например, по курсу обмена или карты. Приложение не загружает курсы из интернета и работает офлайн. Расходы хранятся в той валюте, в которой вы их записали; курс влияет только на итоги в рублях."
  );

  const form = document.createElement("form");
  form.noValidate = true;

  const rateSection = document.createElement("fieldset");
  rateSection.className = "settings-section";
  appendText(rateSection, "legend", "settings-section__title", "Курс поездки, рублей за 1 единицу");
  const rateInputs = CURRENCIES.filter((c) => c.id !== BASE_CURRENCY).map((c) => {
    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "decimal";
    input.autocomplete = "off";
    input.placeholder = "не задан";
    const rate = budgetState.rates[c.id];
    if (rate) input.value = formatInputNumber(rate);
    const field = createField(`${c.symbol} ${c.name}`, `rate-${c.id}`, input);
    field.classList.remove("settings-field--stacked");
    rateSection.appendChild(field);
    return { currency: c, input };
  });
  appendText(rateSection, "p", "settings__hint", "Пустое поле — курс не задан: расходы в этой валюте не попадут в итог в рублях, и экран это покажет.");
  form.appendChild(rateSection);

  const budgetSection = document.createElement("fieldset");
  budgetSection.className = "settings-section";
  appendText(budgetSection, "legend", "settings-section__title", "Бюджет");
  const budgetInput = document.createElement("input");
  budgetInput.type = "text";
  budgetInput.inputMode = "numeric";
  budgetInput.autocomplete = "off";
  budgetInput.placeholder = "не задан";
  if (budgetState.budget) budgetInput.value = String(budgetState.budget);
  budgetSection.appendChild(createField("Бюджет поездки, ₽ (необязательно)", "trip-budget", budgetInput));
  form.appendChild(budgetSection);

  const status = appendText(form, "p", "settings__status", "");
  status.setAttribute("role", "status");
  const actions = document.createElement("div");
  actions.className = "settings-actions";
  const save = appendText(actions, "button", "btn btn--primary", "Сохранить");
  save.type = "submit";
  form.appendChild(actions);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const rates = {};
    for (const { currency, input } of rateInputs) {
      if (!input.value.trim()) continue;
      const rate = parseRate(input.value);
      if (rate === null) {
        status.textContent = `Курс ${currency.symbol}: введите число больше нуля, например 11,8.`;
        input.focus();
        return;
      }
      rates[currency.id] = rate;
    }
    let budget = null;
    if (budgetInput.value.trim()) {
      budget = parseBudget(budgetInput.value);
      if (budget === null) {
        status.textContent = "Бюджет: введите сумму в рублях больше нуля, например 250000.";
        budgetInput.focus();
        return;
      }
    }
    if (!storage.setBudget({ rates, budget })) {
      status.textContent = SAVE_FAILED_TEXT;
      return;
    }
    ctx.back(parent);
  });

  container.appendChild(form);
}
