// Offline-only daily activity, no tracking, server calls or streak penalties.
// One XP reward per local calendar day, independent of sessions / taps.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export function normalizeActivity(value) {
  const days = Array.isArray(value?.days) ? value.days : [];
  return { v: 1, days: [...new Set(days.filter((d) => {
    if (typeof d !== "string" || !DATE_RE.test(d)) return false;
    const [year, month, day] = d.split("-").map(Number);
    return year >= 2020 && year <= 2100 && new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === d;
  }))].sort().slice(-30) };
}
export function withOpenedDay(state, today) {
  const current = normalizeActivity(state);
  if (!DATE_RE.test(String(today)) || current.days.includes(today)) return current;
  return normalizeActivity({ days: [...current.days, today] });
}
