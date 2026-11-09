import test from "node:test";
import assert from "node:assert/strict";
import { RANKS, rankForXp } from "../js/logic/ranks.js";
test("rank thresholds are ascending and unique", () => {
  assert.equal(new Set(RANKS.map(r=>r.min)).size,RANKS.length);
  assert.ok(RANKS.every((r,i)=>i===0||r.min>RANKS[i-1].min));
});
test("rank starts as an explorer, never negative", () => {
  assert.equal(rankForXp(-100).number,1);
  assert.equal(rankForXp(0).remaining,100);
});
test("rank unlocks without a stored secondary XP", () => {
  assert.equal(rankForXp(99).number,1);
  assert.equal(rankForXp(100).number,2);
  assert.equal(rankForXp(300).number,3);
  assert.equal(rankForXp(600).number,4);
  assert.equal(rankForXp(1000).number,5);
  assert.equal(rankForXp(1500).number,6);
});
test("rank progress stays inside 0-100 and last one is complete", () => {
  assert.equal(rankForXp(200).percent,50);
  assert.equal(rankForXp(2000).percent,100);
  assert.equal(rankForXp(2000).next,null);
});
