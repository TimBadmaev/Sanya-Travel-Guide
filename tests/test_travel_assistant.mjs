import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildSearchIndex,normalizeSearch,searchCatalog,SEARCH_KINDS} from "../js/logic/search.js";
import {ARRIVAL_STAGES,ARRIVAL_STEPS,normalizeArrival,setArrivalStep,arrivalProgress} from "../js/logic/arrival.js";
import {buildBackup,parseBackup,snapshotReplaceKeys} from "../js/logic/backup.js";

const sample={
 places:[{id:"yalong-bay-beach",status:"verified",name:{ru:"Пляж Ялунвань",zh:"亚龙湾"},
   summary:"Тёплое море",category:"beach",area:"yalong"}],
 food:[{id:"coco",status:"verified",name:{ru:"Кокосовая курица",zh:"椰子鸡"},note:"Хайнаньская кухня",kind:"restaurant",area:"yalong"}],
 excursions:[{id:"visit-nanshan",status:"verified",title:{ru:"Экскурсия Наньшань"},summary:"Гуаньинь и храмы",placeIds:["nanshan-cultural-zone"]}],
 info:[{id:"taxi-amap",status:"verified",title:"Такси и Amap",summary:"Навигация и адрес на китайском",points:["Транспорт"]}],
 phrases:[{id:"hotel",ru:"Отель",zh:"酒店",pinyin:"Jiudian"},{id:"help",ru:"Помогите!",zh:"救命",pinyin:"Jiuming"}]
};
test("search index only contains verified content and uses canonical existing links",()=>{
 const extra=structuredClone(sample);
 extra.places.push({id:"unverified",status:"draft",name:{ru:"Пляж"}});
 extra.info.push({id:"fake",status:"draft",title:"Такси"});
 const items=buildSearchIndex(extra);
 assert.equal(items.length,6);
 assert.equal(items.some(x=>x.id==="unverified"),false);
 assert.equal(items.find(x=>x.kind==="place").href,"#/place/yalong-bay-beach");
 assert.equal(items.find(x=>x.kind==="excursion").href,"#/excursion/visit-nanshan");
 assert.equal(items.find(x=>x.kind==="info").href,"#/info/taxi-amap");
 assert.equal(items.find(x=>x.kind==="phrase").href,"#/handy/phrase/hotel");
 assert.equal(items.find(x=>x.kind==="food").href,"#/places?mode=food&q="+encodeURIComponent("Кокосовая курица"));
});
test("search works across Cyrillic, Chinese and category filters",()=>{
 const index=buildSearchIndex(sample);
 assert.equal(searchCatalog(index,"кокос").at(0).kind,"food");
 assert.equal(searchCatalog(index,"椰子鸡").at(0).id,"coco");
 assert.equal(searchCatalog(index,"такси").at(0).kind,"info");
 assert.equal(searchCatalog(index,"помогите").at(0).kind,"phrase");
 assert.equal(searchCatalog(index,"пляж").at(0).kind,"place");
 assert.equal(searchCatalog(index,"Кокос",{kind:"place"}).length,0);
 assert.deepEqual(searchCatalog(index,""),[]);
 assert.equal(normalizeSearch("  ЁЖ  "),normalizeSearch(" еж "));
 assert.equal(SEARCH_KINDS.length,6);
});
test("search boosts title matches, only displays matching verified results, limits output",()=>{
 const index=buildSearchIndex(sample);
 assert.equal(searchCatalog(index,"отель")[0].id,"hotel");
 assert.equal(searchCatalog(index,"где такси").length,0,"all terms must match");
 const many=Array.from({length:200},(_,i)=>({...index[0],id:"x"+i}));
 assert.equal(searchCatalog(many,"пляж",{limit:40}).length,40);
 assert.equal(searchCatalog(many,"пляж",{limit:9999}).length,100);
});
test("first day is staged, links are real routes and has valid official sources",()=>{
 assert.equal(ARRIVAL_STAGES.length,4);
 assert.equal(ARRIVAL_STEPS.length,9);
 assert.equal(new Set(ARRIVAL_STEPS.map(x=>x.id)).size,9);
 for(const step of ARRIVAL_STEPS){
  assert.ok(ARRIVAL_STAGES.some(stage=>stage.id===step.stage));
  assert.match(step.link,/^#\//);
  assert.ok(step.title.length>=10&&step.details.length>=30);
  if(step.source)assert.match(step.source,/^https:\/\//);
 }
});
test("first day flags normalize correctly, ignore unknown ids and preserve order",()=>{
 const initial=normalizeArrival(null);
 assert.deepEqual(initial,{v:1,done:[]});
 let state=setArrivalStep(initial,"documents",true);
 state=setArrivalStep(state,"documents",true);
 state=setArrivalStep(state,"offline",true);
 assert.deepEqual(state.done,["documents","offline"]);
 assert.equal(arrivalProgress(state).done,2);
 assert.equal(arrivalProgress(state).total,9);
 assert.deepEqual(setArrivalStep(state,"does-not-exist",true),state);
 assert.deepEqual(normalizeArrival({done:["invalid","offline","offline",33]}).done,["offline"]);
 assert.deepEqual(setArrivalStep(state,"documents",false).done,["offline"]);
});
test("first-day checklist survives backup; pre-v40 restore cannot delete it",()=>{
 const st=normalizeArrival({done:["documents","offline"]});
 const copy=buildBackup({"stg:arrival":st},{now:new Date("2026-11-10T00:00:00Z"),appVersion:"v40"});
 const parsed=parseBackup(JSON.stringify(copy));
 assert.equal(parsed.ok,true);
 assert.deepEqual(parsed.sections["stg:arrival"],st);
 assert.ok(snapshotReplaceKeys("v40").includes("stg:arrival"));
 assert.ok(!snapshotReplaceKeys("v39").includes("stg:arrival"));
});
test("PWA v40 routes and new modules are all precached",()=>{
 const app=readFileSync(new URL("../js/app.js",import.meta.url),"utf8");
 const sw=readFileSync(new URL("../sw.js",import.meta.url),"utf8");
 const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 assert.match(sw,/CACHE_VERSION = "v40"/);
 for(const file of ["./js/logic/search.js","./js/views/assistant.js","./js/logic/arrival.js","./js/views/arrival.js"]){
  assert.ok(sw.includes(JSON.stringify(file)),file);
 }
 assert.match(app,/render: renderAssistant/);
 assert.match(app,/render: renderArrivalGuide/);
 assert.match(html,/href="#\/assistant"/);
 assert.ok(!html.includes('https://fonts.googleapis.com'));
});
