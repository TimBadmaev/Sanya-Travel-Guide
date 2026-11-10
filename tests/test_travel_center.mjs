import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TRAVEL_DOCS,validDate,normalizeTravelCenter,normalizeFlight,addLeg,removeLeg,
 updateLeg,toggleDoc,travelSummary,formatTravelDate } from "../js/logic/travel-center.js";
import {buildBackup,parseBackup,snapshotReplaceKeys} from "../js/logic/backup.js";

test("flight model rejects impossible dates and times, caps fields",()=>{
 assert.equal(validDate("2026-02-29"),false);
 assert.equal(validDate("2028-02-29"),true);
 assert.equal(validDate("2026-11-12"),true);
 assert.equal(validDate("2026-13-12"),false);
 assert.equal(validDate("12/11/2026"),false);
 assert.equal(normalizeFlight({from:"Sanya"}),null);
 const f=normalizeFlight({id:"leg-1",from:"Moscow",to:"Sanya",
  date:"2026-11-12",time:"24:00",arrivalDate:"2026-11-13",
  arrivalTime:"19:40",note:"a".repeat(400)});
 assert.equal(f.date,"2026-11-12");
 assert.equal(f.time,"");
 assert.equal(f.arrivalTime,"19:40");
 assert.equal(f.note.length,220);
 assert.equal(formatTravelDate(f.date),"12.11.2026");
});
test("new booking data starts empty with no invented flight numbers or hotel names",()=>{
 const state=normalizeTravelCenter(null);
 assert.deepEqual(state.outbound,[]);
 assert.deepEqual(state.inbound,[]);
 assert.equal(state.hotel.name,"");
 assert.equal(state.hotel.contactEmail,"");
 assert.equal(TRAVEL_DOCS.length,8);
 assert.equal(travelSummary(state).documentsSaved,0);
});
test("flight segments work independently, preserve order and don't duplicate IDs",()=>{
 let s=normalizeTravelCenter(null);
 s=addLeg(s,"outbound","f1");
 s=addLeg(s,"inbound","f2");
 s=addLeg(s,"outbound","f1");
 assert.equal(s.outbound.length,1);
 assert.equal(s.inbound.length,1);
 s=updateLeg(s,"outbound","f1",{from:"Moscow",to:"Chengdu",date:"2026-11-12",time:"20:30",flight:"CA999"});
 assert.equal(s.outbound[0].flight,"CA999");
 assert.equal(s.inbound[0].flight,"");
 s=removeLeg(s,"outbound","f1");
 assert.equal(s.outbound.length,0);
 assert.equal(s.inbound.length,1);
});
test("12 max flight legs, unique IDs and safe string sanitation",()=>{
 let s={outbound:[],inbound:[],hotel:{}};
 for(let i=0;i<16;i++)s.outbound.push({id:"f"+i,date:"2026-11-12"});
 s.outbound.push({id:"f1",from:"duplicate"});
 const normalized=normalizeTravelCenter(s);
 assert.equal(normalized.outbound.length,6);
 assert.equal(new Set(normalized.outbound.map(x=>x.id)).size,6);
});
test("document readiness only marks known items and does not store files",()=>{
 let s=toggleDoc(null,"passport","offline",true);
 s=toggleDoc(s,"passport","printed",true);
 assert.equal(travelSummary(s).documentsSaved,1);
 assert.equal(travelSummary(s).documentsPrinted,1);
 assert.equal(toggleDoc(s,"unknown-id","offline",true).docs["unknown-id"],undefined);
 assert.equal(toggleDoc(s,"passport","file",true).docs.passport.offline,true);
 s=toggleDoc(s,"passport","offline",false);
 assert.equal(travelSummary(s).documentsSaved,0);
 assert.deepEqual(normalizeTravelCenter({docs:{password:{offline:true}}}).docs,{});
});
test("hotel contacts and dates normalized independently of shared Chinese address",()=>{
 const hotel=normalizeTravelCenter({hotel:{name:"Yalong Hotel",
  contactPhone:"+86 12345",contactEmail:"agent@example.com",
  checkin:"2026-11-13",checkout:"2026-11-12"}});
 assert.equal(hotel.hotel.name,"Yalong Hotel");
 assert.equal(hotel.hotel.contactEmail,"agent@example.com");
 assert.equal(hotel.hotel.checkout,"");
 assert.equal(hotel.home,undefined,"authoritative Chinese address must stay in stg:trip");
});
test("new travel center participates in backup and rollback without breaking older snapshots",()=>{
 const s=addLeg(normalizeTravelCenter(null),"outbound","f1");
 const copy=buildBackup({"stg:travelcenter":s},{appVersion:"v39",now:new Date("2026-11-10T00:00:00Z")});
 const parsed=parseBackup(JSON.stringify(copy));
 assert.equal(parsed.ok,true);
 assert.equal(parsed.sections["stg:travelcenter"].outbound.length,1);
 assert.ok(snapshotReplaceKeys("v39").includes("stg:travelcenter"));
 assert.ok(!snapshotReplaceKeys("v38").includes("stg:travelcenter"));
 assert.ok(!snapshotReplaceKeys(null).includes("stg:travelcenter"));
});
test("route and JS modules are explicitly precached, without ticket attachments",()=>{
 const app=readFileSync(new URL("../js/app.js",import.meta.url),"utf8");
 const sw=readFileSync(new URL("../sw.js",import.meta.url),"utf8");
 assert.ok(app.includes("render: renderTravelCenter"));
 for(const path of ["./js/logic/travel-center.js","./js/views/travel-center.js"])
  assert.ok(sw.includes(JSON.stringify(path)),path);
 assert.match(sw,/CACHE_VERSION = "v39"/);
 const ui=readFileSync(new URL("../js/views/travel-center.js",import.meta.url),"utf8");
 assert.doesNotMatch(ui,/input\.type="file"|type="file"/);
 assert.match(ui,/Быстрые действия/);
 assert.match(ui,/Мой отель/);
});
