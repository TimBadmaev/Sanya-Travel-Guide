// v26: geographically ordered lightweight atlas, six ranks and data integrity.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { atlasPosition, atlasCluster } from "../js/views/offline-atlas.js";
import { RANKS, milestonesForLevel, rankForLevel, nextRank } from "../js/logic/ranks.js";
import { getLevel } from "../js/logic/explore.js";
const places=JSON.parse(readFileSync(new URL("../data/places.json",import.meta.url),"utf8"));
const excursions=JSON.parse(readFileSync(new URL("../data/excursions.json",import.meta.url),"utf8"));
const stories=JSON.parse(readFileSync(new URL("../data/excursion-stories.json",import.meta.url),"utf8")).items;
test("v26: verified catalog contains 55 places and 38 excursions with real coordinates",()=>{
  assert.equal(places.filter(p=>p.status==="verified").length,55);
  assert.equal(excursions.filter(e=>e.status==="verified").length,38);
  const ids=new Set(places.map(x=>x.id));
  for(const e of excursions)for(const id of e.placeIds||[])assert.ok(ids.has(id),id);
  for(const p of places.filter(x=>x.status==="verified")) {
    assert.ok(Number.isFinite(p.location?.lat)&&Number.isFinite(p.location?.lng),p.id);
  }
});
test("atlas uses monotonic WGS84 coords without changing true point ordering",()=>{
  const west=atlasPosition({lat:18.25,lng:109.25});
  const east=atlasPosition({lat:18.25,lng:109.70});
  const north=atlasPosition({lat:18.4,lng:109.5});
  const south=atlasPosition({lat:18.2,lng:109.5});
  assert.ok(west.x<east.x);
  assert.ok(north.y<south.y);
  assert.equal(atlasPosition({lat:0,lng:0}),null);
});
test("dense tourist points are clustered without missing or duplicating IDs",()=>{
  const items=places.filter(p=>p.status==="verified").map(place=>({place,kind:"unknown"}));
  const clusters=atlasCluster(items);
  const ids=clusters.flatMap(c=>c.entries.map(e=>e.place.id));
  assert.equal(new Set(ids).size,55);
  assert.equal(ids.length,55);
  assert.ok(clusters.length<55);
});
test("six cumulative milestones unlock exactly at level boundaries",()=>{
  assert.deepEqual(RANKS.map(x=>x.level),[1,3,5,8,12,20]);
  assert.equal(rankForLevel(1).name,"Первопроходец");
  assert.equal(rankForLevel(5).name,"Следопыт джунглей");
  assert.equal(rankForLevel(20).name,"Легенда острова");
  assert.equal(rankForLevel(999).name,"Легенда острова");
  assert.equal(nextRank(12).level,20);
  assert.equal(nextRank(20),null);
  assert.equal(milestonesForLevel(8).filter(x=>x.earned).length,4);
  assert.equal(milestonesForLevel(2).filter(x=>x.earned).length,1);
  assert.equal(getLevel(200).name,"Искатель бухт");
  assert.equal(getLevel(400).reward,"Зелёный талисман");
  assert.equal(getLevel(1100).name,"Хранитель легенд");
});
test("new editorial stories have working structure and trusted source domains",()=>{
  assert.equal(Object.keys(stories).length,22);
  const ids=new Set(excursions.map(x=>x.id));
  for(const [id,s] of Object.entries(stories)){
    assert.ok(ids.has(id));
    assert.ok(s.lead.length>75,id);
    assert.ok(s.moments.length>=3,id);
    for(const p of s.photos||[]){
      assert.ok(p.source.startsWith("https://commons.wikimedia.org/"));
      assert.ok(p.url.startsWith("https://commons.wikimedia.org/wiki/Special:FilePath/"));
      assert.ok(p.credit);
    }
    for(const src of s.references||[]) assert.ok(src.url.startsWith("https://"),id);
  }
  for(const p of places.flatMap(p=>p.photos||[]).filter(p=>p.url)){
    assert.ok(p.url.startsWith("https://commons.wikimedia.org/wiki/Special:FilePath/"));
    assert.ok(p.sourceUrl.startsWith("https://commons.wikimedia.org/"));
    assert.ok(p.license&&p.author&&p.alt);
  }
});
