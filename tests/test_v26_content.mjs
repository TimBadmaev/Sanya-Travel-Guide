import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source=JSON.parse(readFileSync(new URL("../data/place-stories.json",import.meta.url)));
const places=JSON.parse(readFileSync(new URL("../data/places.json",import.meta.url)));
test("only existing verified places get new editorial stories",()=>{
  const ids=new Set(places.filter(p=>p.status==="verified").map(p=>p.id));
  const stories=Object.entries(source.items);
  assert.equal(stories.length,20);
  for(const [id,s] of stories){
    assert.ok(ids.has(id),id);
    assert.ok(s.headline.length>=20&&s.lead.length>=65,id);
    assert.equal(s.moments.length,3);
    assert.ok(s.source.url.startsWith("https://www.visitsanya.com/"));
  }
});
test("stories never impersonate user reviews or require added assets",()=>{
  for(const s of Object.values(source.items)){
    assert.ok(!s.photos && !s.rating && !s.reviews);
    assert.ok(s.tip.length>20);
  }
});
