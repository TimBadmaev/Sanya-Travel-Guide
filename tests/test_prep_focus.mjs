import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { summarizePreflight } from "../js/logic/prep-focus.js";
const items = JSON.parse(readFileSync(new URL("../data/checklist.json", import.meta.url)));
test("Подготовка: во время ожидания вылета исключены задачи после прилёта", () => {
  const r=summarizePreflight(items,{},4);
  assert.equal(r.total,items.filter(x=>x.status==="verified"&&x.phase!=="arrival").length);
  assert.equal(r.done,0);
  assert.equal(r.remaining,r.total);
  assert.equal(r.tasks.length,4);
  assert.ok(r.tasks.some(x=>x.topic==="documents"));
  assert.ok(r.tasks.some(x=>x.phase==="packing"));
});
test("Подготовка: выполненные пункты не предлагаются повторно", () => {
  const first=summarizePreflight(items,{},1);
  const done=Object.fromEntries(first.tasks.map(x=>[x.id,true]));
  const next=summarizePreflight(items,done,1);
  assert.equal(next.done,4);
  assert.ok(next.tasks.every(x=>!done[x.id]));
});
test("Подготовка: невалидные и черновые пункты исключены", () => {
  const r=summarizePreflight([...items,{id:"unknown",status:"draft",phase:"packing",title:"Черновик"}],{},3);
  assert.ok(!r.tasks.some(x=>x.id==="unknown"));
});
test("Подготовка: без даты не ломается", () => {
  const r=summarizePreflight(items,null,null);
  assert.equal(r.tasks.length,4);
});
test("Подготовка: когда всё отмечено, оставшихся задач нет", () => {
  const done=Object.fromEntries(items.map(x=>[x.id,true]));
  const r=summarizePreflight(items,done,1);
  assert.equal(r.remaining,0);
  assert.equal(r.tasks.length,0);
});
