// «Открыто сейчас» (Iteration 9, ITERATION-9-IMPLEMENTATION-2026-09.md §3).
// Чистые функции: без DOM, хранилища и адреса страницы (PRODUCT.md 10.3).
//
// Структурированные часы — необязательное поле места `openingHours` рядом с
// текстовым `hours`. Текст остаётся тем, что видит человек; структура нужна
// только для вычисления «открыто / закрыто». Места без структуры — «часы не
// подтверждены»: отсутствие данных никогда не читается как «открыто».
//
// Схема (все поля, кроме одного из always / weekly / seasons, необязательны):
//   { always: true }                                  — круглосуточно, круглый год
//   { weekly: { mon: [["09:00","18:00"]], …, sun: [] } } — все 7 дней; [] = выходной
//   { seasons: [{ from: "03-01", to: "09-30", weekly: {…} }, …] } — по датам ММ-ДД,
//        from > to — сезон через Новый год ("10-01" … "02-29")
//   closures: [{ from: "ГГГГ-ММ-ДД", to: "ГГГГ-ММ-ДД", note }] — временное закрытие
//        (ремонт, тайфун) — перекрывает любой график
//   verifiedAt: "ГГГГ-ММ-ДД" — когда проверен именно график
// Интервал ["22:00","02:00"] (закрытие раньше открытия) — работа через полночь;
// "24:00" — до конца суток.

export const WEEK_DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export const OPEN_STATE = {
  OPEN: "open",
  // Открыто круглосуточно — отдельно от OPEN: «до …» не показывается.
  ALWAYS: "always",
  CLOSED: "closed",
  TEMP_CLOSED: "temp-closed",
  UNKNOWN: "unknown",
};

const TIME = /^([01]\d|2[0-4]):([0-5]\d)$/;
const MONTH_DAY = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MINUTES = 24 * 60;

function toMinutes(value) {
  const m = typeof value === "string" ? value.match(TIME) : null;
  if (!m) return null;
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  return minutes <= DAY_MINUTES ? minutes : null;
}

function isInterval(value) {
  if (!Array.isArray(value) || value.length !== 2) return false;
  const open = toMinutes(value[0]);
  const close = toMinutes(value[1]);
  return open !== null && close !== null && open !== close && open < DAY_MINUTES;
}

function isWeekly(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return WEEK_DAYS.every((day) => Array.isArray(value[day]) && value[day].every(isInterval));
}

// Проверка схемы — её же использует валидатор данных. Невалидная структура
// читается как «часы не подтверждены», а не как частично верная.
export function isValidOpeningHours(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const modes = ["always", "weekly", "seasons"].filter((key) => value[key] !== undefined);
  if (modes.length !== 1) return false;
  if (value.always !== undefined && value.always !== true) return false;
  if (value.weekly !== undefined && !isWeekly(value.weekly)) return false;
  if (value.seasons !== undefined) {
    if (!Array.isArray(value.seasons) || !value.seasons.length) return false;
    const ok = value.seasons.every(
      (s) => s && MONTH_DAY.test(s.from) && MONTH_DAY.test(s.to) && isWeekly(s.weekly)
    );
    if (!ok) return false;
  }
  if (value.closures !== undefined) {
    if (!Array.isArray(value.closures)) return false;
    const ok = value.closures.every((c) => c && ISO_DATE.test(c.from) && ISO_DATE.test(c.to) && c.from <= c.to);
    if (!ok) return false;
  }
  return true;
}

// Локальные дата и минуты устройства (время устройства, без сети).
export function localMoment(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    minutes: date.getHours() * 60 + date.getMinutes(),
  };
}

// «16:40» из минут от полуночи.
export function formatClock(minutes) {
  const m = ((minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function shiftDate(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function weekDayOf(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return WEEK_DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

function inSeason(season, iso) {
  const md = iso.slice(5);
  return season.from <= season.to ? md >= season.from && md <= season.to : md >= season.from || md <= season.to;
}

// Недельный график, действующий в эту дату; null — дата не покрыта сезонами
// (часы на эту дату неизвестны).
function weeklyFor(hours, iso) {
  if (hours.weekly) return hours.weekly;
  const season = hours.seasons.find((s) => inSeason(s, iso));
  return season ? season.weekly : null;
}

function closureOn(hours, iso) {
  return (hours.closures || []).find((c) => iso >= c.from && iso <= c.to) || null;
}

// Интервалы дня в минутах [open, close], где close может быть > 1440 (через
// полночь). null — график на этот день неизвестен.
function intervalsOn(hours, iso) {
  const weekly = weeklyFor(hours, iso);
  if (!weekly) return null;
  return weekly[weekDayOf(iso)].map(([a, b]) => {
    const open = toMinutes(a);
    let close = toMinutes(b);
    if (close <= open) close += DAY_MINUTES;
    return [open, close];
  });
}

// Статус на момент { date: "ГГГГ-ММ-ДД", minutes }. Результат:
//   { state: UNKNOWN }                          — нет структурированных часов
//   { state: TEMP_CLOSED, note }                — временное закрытие
//   { state: ALWAYS }
//   { state: OPEN, closesAt: "22:00", minutesLeft }
//   { state: CLOSED, opensAt: "08:00" | null, opensIn: 0 | 1 | … дней }
export function getOpenStatus(hours, moment) {
  if (!isValidOpeningHours(hours) || !moment || !ISO_DATE.test(moment.date)) return { state: OPEN_STATE.UNKNOWN };
  const { date, minutes } = moment;
  const closure = closureOn(hours, date);
  if (closure) return { state: OPEN_STATE.TEMP_CLOSED, note: typeof closure.note === "string" ? closure.note : "" };
  if (hours.always) return { state: OPEN_STATE.ALWAYS };

  // Сегодняшние интервалы и хвост вчерашнего, перешедший через полночь.
  const today = intervalsOn(hours, date);
  const yesterday = closureOn(hours, shiftDate(date, -1)) ? [] : intervalsOn(hours, shiftDate(date, -1));
  if (today === null) return { state: OPEN_STATE.UNKNOWN };
  const spans = [
    ...(yesterday || []).filter(([, close]) => close > DAY_MINUTES).map(([open, close]) => [open - DAY_MINUTES, close - DAY_MINUTES]),
    ...today,
  ];
  const current = spans.find(([open, close]) => minutes >= open && minutes < close);
  if (current) {
    return { state: OPEN_STATE.OPEN, closesAt: formatClock(current[1]), minutesLeft: current[1] - minutes };
  }

  // Ближайшее открытие: сегодня позже или в следующие 7 дней.
  const later = today.filter(([open]) => open > minutes).sort((a, b) => a[0] - b[0])[0];
  if (later) return { state: OPEN_STATE.CLOSED, opensAt: formatClock(later[0]), opensIn: 0 };
  for (let i = 1; i <= 7; i += 1) {
    const iso = shiftDate(date, i);
    if (closureOn(hours, iso)) continue;
    const spansOn = intervalsOn(hours, iso);
    if (spansOn === null) break;
    if (spansOn.length) {
      const first = spansOn.slice().sort((a, b) => a[0] - b[0])[0];
      return { state: OPEN_STATE.CLOSED, opensAt: formatClock(first[0]), opensIn: i };
    }
  }
  return { state: OPEN_STATE.CLOSED, opensAt: null, opensIn: null };
}

export function isOpenNow(status) {
  return status.state === OPEN_STATE.OPEN || status.state === OPEN_STATE.ALWAYS;
}

// Короткая подпись для строк списка и карточки. Неизвестные часы — никогда
// не «Открыто».
export function formatOpenStatus(status) {
  switch (status.state) {
    case OPEN_STATE.ALWAYS:
      return "Открыто круглосуточно";
    case OPEN_STATE.OPEN:
      return `Открыто до ${status.closesAt}`;
    case OPEN_STATE.TEMP_CLOSED:
      return status.note ? `Временно закрыто: ${status.note}` : "Временно закрыто";
    case OPEN_STATE.CLOSED:
      if (status.opensAt === null) return "Сейчас закрыто";
      if (status.opensIn === 0) return `Закрыто · откроется в ${status.opensAt}`;
      if (status.opensIn === 1) return `Закрыто · откроется завтра в ${status.opensAt}`;
      return `Закрыто · откроется через ${status.opensIn} дн. в ${status.opensAt}`;
    default:
      return "Часы не подтверждены";
  }
}
