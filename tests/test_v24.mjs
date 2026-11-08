// node --experimental-default-type=module --test tests/test_v24.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { worldPoint, worldCoords, classifyPin } from "../js/views/street-map.js";
import { normalizeActivity, withOpenedDay } from "../js/logic/activity.js";
import { evaluateExplore } from "../js/logic/explore.js";
import { snapshotReplaceKeys } from "../js/logic/backup.js";

const excursions = JSON.parse(readFileSync(new URL("../data/excursions.json", import.meta.url)));
const places = JSON.parse(readFileSync(new URL("../data/places.json", import.meta.url)));
const stories = JSON.parse(readFileSync(new URL("../data/excursion-stories.json", import.meta.url))).items;
const explore = JSON.parse(readFileSync(new URL("../data/explore.json", import.meta.url)));

test("web-mercator: real locations round-trip with no GCJ02 substitution", () => {
  for (const [lat,lng] of [[18.224358,109.624165],[18.246,109.532],[18.218626,109.517611]]) {
    for (const z of [9,11,15]) {
      const p=worldPoint(lat,lng,z), c=worldCoords(p.x,p.y,z);
      assert.ok(Math.abs(c.lat-lat)<1e-8);
      assert.ok(Math.abs(c.lng-lng)<1e-8);
    }
  }
});
test("visited, planned and saved pins have separate, consistent states", () => {
  const place={id:"p"};
  assert.equal(classifyPin(place,new Set(["p"]),new Set(["p"]),new Set(["p"])),"visited");
  assert.equal(classifyPin(place,new Set(),new Set(["p"]),new Set(["p"])),"planned");
  assert.equal(classifyPin(place,new Set(),new Set(["p"]),new Set()),"saved");
  assert.equal(classifyPin(place,new Set(),new Set(),new Set()),"unknown");
});
test("only valid unique calendar days, with bounded local activity history", () => {
  const once=withOpenedDay(null,"2026-11-09"), repeated=withOpenedDay(once,"2026-11-09");
  assert.deepEqual(once,repeated);
  assert.deepEqual(normalizeActivity({days:["2026-11-09","2026-11-09","2026-02-30","<script>"]}).days,["2026-11-09"]);
  assert.equal(normalizeActivity({days:Array.from({length:40},(_,i)=>"2026-11-"+String(i+1).padStart(2,"0"))}).days.length,30);
});
test("expenses reward days not purchases or money; app opens once daily", () => {
  const args={places:[],passportResult:null,chapters:explore.chapters,lessons:explore.lessons,
    expenses:{items:[{date:"2026-11-09",amount:1},{date:"2026-11-09",amount:80000}]},
    activity:{v:1,days:["2026-11-09"]}};
  const a=evaluateExplore(args);
  assert.equal(a.stats.expenseDays,1);
  assert.equal(a.stats.appDays,1);
  assert.equal(a.xp,15);
  assert.equal(a.totalTasks,15);
  assert.equal(a.chapters[4].nodes[0].done,true);
  assert.equal(a.chapters[4].nodes[1].progress,1);
});
test("v23 backups do not erase activity, v24 backups can restore it", () => {
  assert.equal(snapshotReplaceKeys("v23").includes("stg:activity"),false);
  assert.equal(snapshotReplaceKeys("v24").includes("stg:activity"),true);
});
test("10 editorial stories link only to known excursions and verified video domains", () => {
  assert.equal(excursions.length,36);
  assert.equal(Object.keys(stories).length,10);
  const ids=new Set(excursions.map(e=>e.id)), known=new Set(places.flatMap(p=>(p.photos||[]).map(x=>x.file)));
  assert.ok(known.size>=12);
  for(const [id,story] of Object.entries(stories)){
    assert.ok(ids.has(id),id);
    assert.ok(story.lead.length>80);
    assert.ok(story.moments.length>=3);
    for(const v of story.videos||[]) assert.ok(/^https:\/\/(rutube\.ru|www\.youtube\.com|vkvideo\.ru)\//.test(v.url),id+" "+v.url);
    for(const p of story.photos||[]){
      assert.ok(p.url.startsWith("https://commons.wikimedia.org/wiki/Special:FilePath/"));
      assert.ok(p.source.startsWith("https://commons.wikimedia.org/"));
      assert.ok(p.credit);
    }
  }
});
