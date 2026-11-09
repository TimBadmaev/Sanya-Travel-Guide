import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const places=JSON.parse(readFileSync(new URL("../data/places.json",import.meta.url))).filter(x=>x.status==="verified");
const lib=JSON.parse(readFileSync(new URL("../data/audio-guides.json",import.meta.url)));

test("full Russian narration coverage without any draft or missing location",()=>{
  assert.equal(places.length,57);
  assert.equal(Object.keys(lib.items).length,places.length);
  assert.deepEqual(Object.keys(lib.items).sort(),places.map(x=>x.id).sort());
});
test("every original narration has on-site length, safe path and sources",()=>{
  for(const [id,g] of Object.entries(lib.items)){
    assert.ok(g.text.length>700,id);
    assert.ok(g.wordCount>=120&&g.wordCount<=600,id);
    assert.equal(g.text.trim().split(/\s+/).length,g.wordCount,id);
    assert.ok(g.estimatedSeconds>=45&&g.estimatedSeconds<=300,id);
    assert.ok(g.minutes>=1&&g.minutes<=5,id);
    assert.equal(g.audio,`assets/audio/${id}.mp3`,id);
    assert.ok(g.sources.length>=1&&g.sources.every(x=>/^https?:\/\//.test(x.url)),id);
  }
});
test("binary audio is never in mandatory service-worker precache",()=>{
  const sw=readFileSync(new URL("../sw.js",import.meta.url),"utf8");
  assert.ok(sw.includes('"./data/audio-guides.json"'));
  assert.ok(sw.includes('"./js/views/audio.js"'));
  assert.ok(sw.includes('"./js/logic/audio-cache.js"'));
  assert.ok(!sw.includes('"./assets/audio/'));
  assert.ok(sw.includes('CACHE_VERSION = "v31"'));
});
