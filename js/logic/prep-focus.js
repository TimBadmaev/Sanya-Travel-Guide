// «Что сделать до вылета»: приоритеты для первого экрана.
// Данные и статус задач берём только из существующего verified-чек-листа.
const PHASES = Object.freeze({
  far: ["early", "week", "days", "packing", "departure"],
  week: ["week", "days", "early", "packing", "departure"],
  soon: ["days", "packing", "departure", "week", "early"],
  tomorrow: ["departure", "days", "packing", "week", "early"],
});

function order(days) {
  if (days <= 1) return PHASES.tomorrow;
  if (days <= 3) return PHASES.soon;
  if (days <= 7) return PHASES.week;
  return PHASES.far;
}

export function summarizePreflight(items, state, daysUntil, limit = 4) {
  const tasks = (Array.isArray(items) ? items : [])
    .filter((item) => item && item.status === "verified" && item.phase !== "arrival"
      && typeof item.id === "string" && typeof item.title === "string");
  const doneState = state && typeof state === "object" && !Array.isArray(state) ? state : {};
  const done = tasks.filter((item) => doneState[item.id]).length;
  const pending = tasks.filter((item) => !doneState[item.id]);
  const phases = order(Math.max(0, Number(daysUntil) || 0));
  const rank = (item) => {
    const phase = phases.indexOf(item.phase);
    return (phase < 0 ? 99 : phase * 10)
      - (item.critical ? 14 : 0)
      - (item.topic === "documents" ? 5 : 0);
  };
  const sorted = pending.slice().sort((a, b) => rank(a) - rank(b));
  const chosen = [];
  const pick = (item) => { if (item && !chosen.some((x) => x.id === item.id)) chosen.push(item); };
  // Документы и чемодан должны оставаться заметными рядом с вылетом,
  // даже если другие категории содержат больше критичных задач.
  if (daysUntil <= 7) {
    pick(sorted.find((item) => item.topic === "documents"));
    pick(sorted.find((item) => item.phase === "packing"));
  }
  sorted.forEach((item) => { if (chosen.length < limit) pick(item); });
  return {
    total: tasks.length, done, remaining: pending.length,
    criticalRemaining: pending.filter((item) => item.critical).length,
    tasks: chosen.slice(0, Math.max(0, limit)),
  };
}
