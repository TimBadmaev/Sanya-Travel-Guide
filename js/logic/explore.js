// Игровой слой Sanya Guide: чистые вычисления поверх существующих данных.
// XP не хранится отдельно, чтобы не было накрутки и расхождения с паспортом.
// Нет GPS, ежедневных серий, штрафов и наград за shopping.
import { isRewardPlace } from "./passport.js";

export const EXPLORE_STATE_VERSION = 1;
export const XP_RULES = Object.freeze({
  firstSaved: 5,
  firstPlan: 10,
  visit: 30,
  note: 10,
  lesson: 15,
  sticker: 20,
  expenseDay: 12,
  appDay: 3,
  prepTask: 4,
});

const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
export function normalizeExploreState(value) {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const completed = Array.isArray(raw.completed) ? raw.completed : [];
  return {
    v: EXPLORE_STATE_VERSION,
    completed: [...new Set(completed.filter((id) => typeof id === "string" && ID_RE.test(id)))].slice(0, 100),
  };
}

export function withCompletedLesson(state, id, allowed = []) {
  const current = normalizeExploreState(state);
  if (!allowed.includes(id) || current.completed.includes(id)) return current;
  return { v: 1, completed: [...current.completed, id] };
}

export function getLevel(xp) {
  const score = Math.max(0, Math.floor(Number(xp) || 0));
  const level = Math.floor(score / 100) + 1;
  const names = ["Новичок", "Любознательный", "Исследователь", "Следопыт", "Легенда побережья"];
  return {
    level,
    name: names[Math.min(level - 1, names.length - 1)],
    current: score % 100,
    next: 100,
    toNext: 100 - score % 100,
  };
}

function plannedCount(myPlan, rewardIds) {
  const days = myPlan && myPlan.days && typeof myPlan.days === "object" ? myPlan.days : {};
  const result = new Set();
  Object.values(days).forEach((day) => {
    if (day && Array.isArray(day.placeIds)) {
      day.placeIds.forEach((id) => { if (rewardIds.has(id)) result.add(id); });
    }
  });
  return result.size;
}

function nodeProgress(node, stats, completed) {
  const goal = Math.max(1, Number(node.count) || 1);
  let progress = 0;
  if (node.kind === "saved") progress = stats.saved;
  else if (node.kind === "planned") progress = stats.planned;
  else if (node.kind === "visited") progress = stats.visited;
  else if (node.kind === "notes") progress = stats.notes;
  else if (node.kind === "expenses") progress = stats.expenseDays;
  else if (node.kind === "app-days") progress = stats.appDays;
  else if (node.kind === "category") progress = stats.byCategory[node.category] || 0;
  else if (node.kind === "lesson") progress = completed.has(node.lessonId) ? 1 : 0;
  else if (node.kind === "sticker") progress = stats.stickers;
  return { ...node, goal, progress: Math.min(progress, goal), done: progress >= goal };
}

export function evaluateExplore({ places = [], savedIds = [], myPlan = null, passportResult = null,
  explore = null, expenses = null, activity = null, checklist = [], checklistState = null, chapters = [], lessons = [] } = {}) {
  const rewardPlaces = places.filter((place) => place && place.status === "verified" && isRewardPlace(place));
  const rewardIds = new Set(rewardPlaces.map((place) => place.id));
  const saved = new Set((Array.isArray(savedIds) ? savedIds : []).filter((id) => rewardIds.has(id)));
  const visits = passportResult && Array.isArray(passportResult.visits) ? passportResult.visits : [];
  const uniqueVisits = new Map();
  visits.forEach((entry) => {
    if (entry && entry.place && rewardIds.has(entry.place.id)) uniqueVisits.set(entry.place.id, entry);
  });
  const byCategory = {};
  let notes = 0;
  uniqueVisits.forEach((entry) => {
    const category = entry.place.category;
    byCategory[category] = (byCategory[category] || 0) + 1;
    if (entry.visit && typeof entry.visit.note === "string" && entry.visit.note.trim()) notes += 1;
  });
  const allowed = new Set(lessons.map((lesson) => lesson.id));
  const state = normalizeExploreState(explore);
  const completed = new Set(state.completed.filter((id) => allowed.has(id)));
  const items = expenses && Array.isArray(expenses.items) ? expenses.items : [];
  // Дневник, а не соревнование в суммах: максимум один бонус на дату,
  // любые суммы не увеличивают XP; даты считаются только валидные.
  const expenseDays = new Set(items.filter((item) => item && typeof item.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.date) && Number(item.amount) > 0)
    .map((item) => item.date)).size;
  const stickers = passportResult && Array.isArray(passportResult.stickers)
    ? passportResult.stickers.filter((s) => s.earned && !s.optional).length : 0;
  const completedPrep = Array.isArray(checklist) ? checklist.filter((item) => item && item.status === "verified" && checklistState?.[item.id]).length : 0;
  const stats = {
    prepDone: completedPrep,
    saved: saved.size,
    planned: plannedCount(myPlan, rewardIds),
    visited: uniqueVisits.size,
    notes,
    expenseDays,
    appDays: Array.isArray(activity?.days) ? new Set(activity.days).size : 0,
    stickers,
    byCategory,
    lessons: completed.size,
  };
  const xp = (stats.saved > 0 ? XP_RULES.firstSaved : 0)
    + (stats.planned > 0 ? XP_RULES.firstPlan : 0)
    + stats.visited * XP_RULES.visit
    + stats.notes * XP_RULES.note
    + stats.lessons * XP_RULES.lesson
    + stats.stickers * XP_RULES.sticker
    + Math.min(stats.expenseDays, 14) * XP_RULES.expenseDay
    + Math.min(stats.appDays, 14) * XP_RULES.appDay
    + stats.prepDone * XP_RULES.prepTask;

  const evaluated = chapters.map((chapter) => {
    const nodes = (chapter.nodes || []).map((node) => nodeProgress(node, stats, completed));
    const done = nodes.filter((node) => node.done).length;
    return { ...chapter, nodes, done, total: nodes.length, finished: done === nodes.length && nodes.length > 0 };
  });
  return { xp, level: getLevel(xp), stats, chapters: evaluated, completedLessons: completed,
    completedTasks: evaluated.reduce((sum, c) => sum + c.done, 0),
    totalTasks: evaluated.reduce((sum, c) => sum + c.total, 0) };
}
