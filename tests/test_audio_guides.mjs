import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
const places=JSON.parse(readFileSync(new URL("../data/places.json",import.meta.url))).filter(p=>p.status==="verified");
const catalog=JSON.parse(readFileSync(new URL("../data/audio-guides.json",import.meta.url)));
const size=JSON.parse(readFileSync(new URL("../data/audio-sizes.json",import.meta.url)));
const guides=catalog.items;
test("only meaningful sites are narrated; ordinary shopping and generic waterparks excluded",()=>{
  assert.equal(places.length,57);
  assert.equal(Object.keys(guides).length,33);
  const known=new Set(places.map(x=>x.id));
  for(const [id,g] of Object.entries(guides)){
    assert.ok(known.has(id),id);
    assert.notEqual(g.category,"shopping",id);
    assert.ok(!["atlantis-aquaventure-waterpark","sanya-dream-water-park","sanya-joy-city"].includes(id));
  }
  assert.ok(guides["luhuitou-park"]&&guides["nanshan-cultural-zone"]&&guides["yazhou-ancient-city"]);
});
test("each episode has original text, credible source, and actual playable AAC asset",()=>{
  assert.equal(size.count,33);
  let total=0;
  for(const [id,g] of Object.entries(guides)){
    const words=g.text.trim().split(/\s+/).length;
    assert.equal(words,g.wordCount,id);
    assert.ok(words>=145&&words<=520,id);
    assert.ok(g.minutes>=1&&g.minutes<=5,id);
    assert.equal(g.audio,`assets/audio-v2/${id}.m4a`);
    assert.ok(g.sources.length&&g.sources.every(s=>/^https?:\/\//.test(s.url)),id);
    if(g.video)assert.ok(/^https:\/\/www\.youtube\.com\/watch\?v=/.test(g.video.url),id);
    const file=new URL(`../assets/audio-v2/${id}.m4a`,import.meta.url);
    const bytes=statSync(file).size;
    assert.ok(bytes>9000,id);
    assert.equal(size.items[id],bytes,id);
    total+=bytes;
  }
  assert.equal(total,size.totalBytes);
  assert.ok(total<11*1024*1024, `audio too large: ${total}`);
});
test("new audio and the real offline island map do not enlarge required precache",()=>{
 const sw=readFileSync(new URL("../sw.js",import.meta.url),"utf8");
 const atlas=JSON.parse(readFileSync(new URL("../data/hainan-coast.json",import.meta.url)));
 assert.equal(atlas.coastline.length,74);
 assert.ok(atlas.sourceUrl.includes("natural-earth-vector"));
 for(const path of ["./data/audio-guides.json","./data/audio-sizes.json","./data/hainan-coast.json",
     "./js/views/island-atlas.js","./js/logic/audio-cache.js"]){
   assert.ok(sw.includes(JSON.stringify(path)),path);
 }
 assert.ok(!sw.includes('"./assets/audio-v2/'));
 assert.ok(sw.includes('CACHE_VERSION = "v34"'));
 assert.ok(sw.includes('"./assets/maps/hainan-relief.webp"'));
});
