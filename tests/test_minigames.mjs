import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BOARD_SIZE,FLEET,generateFleet,createMatch,validMatch,revealTurn,fireShot,chooseCpuShot,wasHit,sunkShips,normalizeGameData } from "../js/logic/minigames.js";
import { travelActions } from "../js/logic/travel-hub.js";
import { TRIP_STATE } from "../js/logic/trip.js";

test("fleet fits 8x8, has four non-touching ships and unique cells",()=>{
 for(let run=0;run<50;run++){
  const fleet=generateFleet();
  assert.deepEqual(fleet.map(s=>s.length),FLEET);
  const used=new Set();
  for(const ship of fleet)for(const cell of ship){
   assert.ok(cell>=0&&cell<64&&!used.has(cell));used.add(cell);
  }
  for(let i=0;i<fleet.length;i++)for(let j=i+1;j<fleet.length;j++){
   for(const a of fleet[i])for(const b of fleet[j]){
    assert.ok(Math.abs(Math.floor(a/8)-Math.floor(b/8))>1||
      Math.abs(a%8-b%8)>1,"ships must not touch, even diagonally");
   }
  }
 }
});
test("solo game is valid, supports firing and does not repeat AI shots",()=>{
 let match=createMatch("solo");
 assert.equal(match.phase,"battle");assert.equal(match.turn,0);
 assert.equal(validMatch(match),true);
 const human=fireShot(match,0);
 assert.equal(human.turn,1);
 const aiCell=chooseCpuShot(human);
 assert.ok(aiCell>=0&&aiCell<64);
 const next=fireShot(human,aiCell);
 assert.equal(next.turn,0);assert.equal(next.phase,"battle");
 assert.equal(next.shots[0].length,1);assert.equal(next.shots[1].length,1);
 assert.equal(validMatch(next),true);
 assert.throws(()=>fireShot(next,0),/стреляли/);
});
test("pass-and-play explicitly hides the board between turns",()=>{
 const start=createMatch("pass");
 assert.equal(start.phase,"handoff");
 assert.throws(()=>fireShot(start,0),/недоступен/);
 const turn=revealTurn(start);
 const fired=fireShot(turn,0);
 assert.equal(fired.phase,"handoff");assert.equal(fired.turn,1);
 assert.equal(revealTurn(fired).phase,"battle");
});
test("finishing all enemy ships records winner",()=>{
 const start=createMatch("solo");
 const fleet=start.fleets[1],all=fleet.flat();
 const almost={...start,shots:[all.slice(0,-1),[]],turn:0,phase:"battle"};
 assert.equal(validMatch(almost),true);
 const won=fireShot(almost,all.at(-1));
 assert.equal(won.winner,0);assert.equal(won.phase,"finished");
 assert.equal(sunkShips(fleet,won.shots[0]),4);
});
test("damaged saved data never restores an unsafe or invalid game",()=>{
 const match=createMatch("pass");
 match.shots[0]=[64];
 assert.equal(validMatch(match),false);
 const normalized=normalizeGameData({v:1,match,stats:{soloWins:-30,quizBest:15}});
 assert.equal(normalized.match,null);
 assert.equal(normalized.stats.soloWins,0);
 assert.equal(normalized.stats.quizBest,10);
});
test("contextual home actions remain grounded in actual trip state",()=>{
 const pre=travelActions({state:TRIP_STATE.BEFORE},{hasHotel:false,today:"2026-11-09"});
 assert.equal(pre.primary.href,"#/offline");
 assert.ok(pre.actions.some(x=>x.href==="#/settings?section=home"));
 const during=travelActions({state:TRIP_STATE.DURING},{hasHotel:true,plannedToday:true,today:"2026-11-14"});
 assert.equal(during.primary.href,"#/plan/2026-11-14");
 assert.ok(during.actions.some(x=>x.href==="#/handy/taxi"));
 const after=travelActions({state:TRIP_STATE.AFTER});
 assert.equal(after.primary.href,"#/passport/journey");
});
test("new UX and games are explicitly offline-cached, optional map packs remain optional",()=>{
 const app=readFileSync(new URL("../js/app.js",import.meta.url),"utf8");
 const sw=readFileSync(new URL("../sw.js",import.meta.url),"utf8");
 for(const route of ["/offline","/games","/games/sea","/games/phrases","/games/memory"]){
  assert.ok(app.includes(route),route);
 }
 for(const path of ["./js/views/games.js","./js/views/mini-arcade.js",
  "./js/views/offline-center.js","./js/logic/minigames.js","./js/logic/travel-hub.js"]){
  assert.ok(sw.includes(JSON.stringify(path)),path);
 }
 assert.match(sw,/CACHE_VERSION = "v36"/);
 assert.doesNotMatch(sw,/"\.\/data\/sanya-detail-yalong\.json"/);
});
