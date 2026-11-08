// node --experimental-default-type=module --test tests/test_explore.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluateExplore, getLevel, normalizeExploreState, withCompletedLesson } from "../js/logic/explore.js";
import { prepareContent, evaluatePassport } from "../js/logic/passport.js";

const dataset = JSON.parse(readFileSync(new URL("../data/explore.json", import.meta.url)));
const passportData = JSON.parse(readFileSync(new URL("../data/passport.json", import.meta.url)));
const config = JSON.parse(readFileSync(new URL("../data/config.json", import.meta.url)));
const allPlaces = JSON.parse(readFileSync(new URL("../data/places.json", import.meta.url)));
const places = allPlaces.filter((p) => p.status === "verified");
const content = prepareContent(passportData, config);
const available = new Set(dataset.lessons.map((l) => l.id));
const shopping = places.find((p) => p.category === "shopping");
const reward = places.find((p) => p.category === "beach");
const nature = places.find((p) => p.category === "nature");

function make(overrides = {}) {
  return evaluateExplore({
    places, savedIds: [], myPlan: { days: {} }, passportResult: evaluatePassport({ state: { v: 1, visits: {} }, places, content }),
    explore: null, expenses: { items: [] }, chapters: dataset.chapters, lessons: dataset.lessons, ...overrides,
  });
}
function visits(data) {
  return evaluatePassport({ state: { v: 1, visits: data }, places, content });
}

test("База остаётся неизменной: 52 verified и 12 наклеек", () => {
  assert.equal(places.length, 52);
  assert.equal(passportData.stickers.length, 12);
});
test("Контент уроков и заданий корректен, id уникальны, ссылки существуют", () => {
  assert.equal(dataset.chapters.length, 5);
  assert.equal(dataset.lessons.length, 3);
  assert.equal(new Set(dataset.lessons.map((l) => l.id)).size, dataset.lessons.length);
  assert.ok(dataset.lessons.every((l) => l.options.length === 4 && l.options.some((o) => o.id === l.answer) && l.source.url.startsWith("https://")));
  assert.equal(new Set(dataset.chapters.flatMap((c) => c.nodes.map((n) => n.id))).size, dataset.chapters.reduce((n, c) => n + c.nodes.length, 0));
  assert.ok(dataset.chapters.flatMap((c) => c.nodes).every((n) => n.href.startsWith("#/") && (!n.lessonId || available.has(n.lessonId))));
});
test("Нулевой прогресс без пользователя", () => {
  const r = make();
  assert.equal(r.xp, 0);
  assert.equal(r.stats.visited, 0);
  assert.equal(r.level.level, 1);
  assert.equal(r.totalTasks, 15);
});
test("Награды никогда не начисляются за shopping", () => {
  const r = make({
    savedIds: [shopping.id],
    myPlan: { days: { "2026-11-15": { placeIds: [shopping.id] } } },
    passportResult: visits({ [shopping.id]: { date: "2026-11-15", note: "купил вещи" } }),
  });
  assert.equal(r.xp, 0);
  assert.equal(r.stats.visited, 0);
  assert.equal(r.stats.saved, 0);
  assert.equal(r.stats.planned, 0);
});
test("Уникальные посещения и заметки: отсутствие накрутки", () => {
  const r = make({ passportResult: visits({
    [reward.id]: { date: "2026-11-15", note: "красивый пляж" },
    [nature.id]: { date: "2026-11-15", note: "" },
  }) });
  assert.equal(r.stats.visited, 2);
  assert.equal(r.stats.notes, 1);
  assert.ok(r.xp >= 70);
  assert.equal(r.chapters[0].nodes[2].done, true);
});
test("План и избранное дают только одно стартовое начисление", () => {
  const r = make({
    savedIds: [reward.id, nature.id, reward.id],
    myPlan: { days: { "2026-11-15": { placeIds: [reward.id, nature.id] } } },
  });
  assert.equal(r.xp, 15);
  assert.equal(r.stats.saved, 2);
  assert.equal(r.stats.planned, 2);
});
test("Баллы расходов не зависят от суммы, категории и числа операций", () => {
  const day = "2026-11-15";
  const r = make({ expenses: { items: [
    { date: day, amount: 1 }, { date: day, amount: 50000 }, { date: "2026-11-16", amount: 3 },
  ] } });
  assert.equal(r.xp, 24);
  assert.equal(r.stats.expenseDays, 2);
  const many = make({ expenses: { items: Array.from({ length: 30 }, (_, i) => ({ date: "2026-11-" + String(i + 1).padStart(2, "0"), amount: 1 })) } });
  assert.equal(many.xp, 168);
});
test("Мини-урок начисляется один раз и переносится в копию", () => {
  const first = withCompletedLesson(null, "sea", [...available]);
  assert.deepEqual(first.completed, ["sea"]);
  const duplicate = withCompletedLesson(first, "sea", [...available]);
  assert.deepEqual(duplicate, first);
  assert.deepEqual(withCompletedLesson(first, "unknown", [...available]), first);
  assert.equal(make({ explore: first }).xp, 15);
});
test("Нормализация защищает от лишних и повреждённых данных", () => {
  assert.deepEqual(normalizeExploreState({ completed: ["sea", "sea", "nanshan", "", "<script>"] }), { v: 1, completed: ["sea", "nanshan"] });
  assert.deepEqual(normalizeExploreState(null), { v: 1, completed: [] });
});
test("Уровни предсказуемы и без бесконечной прокачки", () => {
  assert.equal(getLevel(0).level, 1);
  assert.equal(getLevel(100).level, 2);
  assert.equal(getLevel(215).current, 15);
  assert.equal(getLevel(-999).level, 1);
});

test("Посещения приложения дают XP только раз в день", () => {
  const r = make({ activity: { v: 1, days: ["2026-11-09","2026-11-09","2026-11-10"] } });
  assert.equal(r.stats.appDays, 2);
  assert.equal(r.xp, 6);
  assert.equal(r.chapters[4].nodes[1].progress, 2);
});
