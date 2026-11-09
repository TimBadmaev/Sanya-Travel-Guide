import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {newSnake,steerSnake,advanceSnake,SNAKE_SIZE,newOcean,stepOcean,OCEAN_WIDTH,OCEAN_HEIGHT} from "../js/logic/arcade.js";
import {MUST_DO_ITEMS,normalizeMustDo,toggleMustDo,mustDoSummary} from "../js/logic/must-do.js";

test("snake starts on the board with valid food and grows when eating",()=>{
 const game=newSnake(()=>.3);
 assert.equal(game.phase,"ready");
 assert.equal(game.body.length,3);
 assert.ok(game.food>=0&&game.food<SNAKE_SIZE*SNAKE_SIZE);
 assert.ok(!game.body.includes(game.food));
 const food=9*SNAKE_SIZE+10;
 const next=advanceSnake({...game,phase:"playing",food});
 assert.equal(next.score,10);
 assert.equal(next.body.length,4);
 assert.equal(next.body[0],food);
 assert.ok(!next.body.includes(next.food));
});
test("snake rejects direct reversal and dies at the wall",()=>{
 const s=newSnake();
 assert.equal(steerSnake(s,"left").queued,"right");
 const right=steerSnake(s,"up");
 assert.equal(right.queued,"up");
 const edge={...s,phase:"playing",body:[9*SNAKE_SIZE+17,9*SNAKE_SIZE+16,9*SNAKE_SIZE+15]};
 assert.equal(advanceSnake(edge).phase,"over");
});
test("snake permits a step into vacated tail, but not into its neck",()=>{
 const s=newSnake();
 const c=(x,y)=>y*SNAKE_SIZE+x;
 const body=[c(4,4),c(4,5),c(3,5),c(3,4)];
 // Head moves into old tail at x3,y4; legal when it does not grow.
 const legal={...s,phase:"playing",body,direction:"left",queued:"left",food:c(17,17)};
 assert.equal(advanceSnake(legal).phase,"playing");
 const overlap={...s,phase:"playing",body:[c(4,4),c(5,4),c(5,5),c(4,5)],direction:"right",queued:"right",food:c(17,17)};
 assert.equal(advanceSnake(overlap).phase,"over");
});
test("fish arena starts in bounds and running clock decreases",()=>{
 const start=newOcean(()=>.4);
 assert.equal(start.phase,"ready");
 assert.equal(start.lives,3);assert.equal(start.seconds,60);
 assert.ok(start.player.x>0&&start.player.x<OCEAN_WIDTH);
 const playing={...start,phase:"playing"};
 const after=stepOcean(playing,{x:340,y:300},.1,()=>.1);
 assert.ok(after.seconds<60&&after.seconds>59);
 assert.ok(after.player.x>playing.player.x);
 assert.ok(after.player.y>playing.player.y);
});
test("little fish are eaten; large predators cost lives with immunity",()=>{
 const o=newOcean(()=>.5);
 const small={x:100,y:100,r:7,vx:0,color:"#aaffcc"};
 const start={...o,phase:"playing",player:{x:100,y:100,r:16},fish:[small]};
 const eaten=stepOcean(start,{x:100,y:100},.05,()=>.2);
 assert.equal(eaten.score,10);assert.equal(eaten.lives,3);
 assert.ok(eaten.player.r>16);
 const big={x:100,y:100,r:29,vx:0,color:"#ee8888"};
 const danger={...start,fish:[big]};
 const once=stepOcean(danger,{x:100,y:100},.05,()=>.2);
 assert.equal(once.lives,2);
 const twice=stepOcean({...once,fish:[big]},{x:100,y:100},.05,()=>.2);
 assert.equal(twice.lives,2,"brief hit immunity prevents immediate drain");
});
test("ocean ends after 60 seconds or all lives lost",()=>{
 const o=newOcean(()=>.5);
 const end=stepOcean({...o,phase:"playing",seconds:.03,fish:[]},{x:180,y:210},.05);
 assert.equal(end.phase,"over");
 const big={x:180,y:215,r:30,vx:0,color:"#f00"};
 const collision=stepOcean({...o,phase:"playing",lives:1,fish:[big]},{x:180,y:215},.05,()=>.5);
 assert.equal(collision.phase,"over");assert.equal(collision.lives,0);
});
test("top-ten unique sourced experiences and valid in-app links",()=>{
 assert.equal(MUST_DO_ITEMS.length,10);
 assert.equal(new Set(MUST_DO_ITEMS.map(x=>x.id)).size,10);
 for(const item of MUST_DO_ITEMS){
  assert.match(item.href,/^#\//);
  assert.ok(item.title&&item.description&&item.tip&&item.joke);
 }
 const state=toggleMustDo(null,MUST_DO_ITEMS[0].id,true);
 assert.deepEqual(state.done,[MUST_DO_ITEMS[0].id]);
 assert.deepEqual(toggleMustDo(state,MUST_DO_ITEMS[0].id,true).done,state.done);
 assert.deepEqual(toggleMustDo(state,"bad-id",true).done,state.done);
 assert.deepEqual(toggleMustDo(state,MUST_DO_ITEMS[0].id,false).done,[]);
 assert.equal(mustDoSummary(state).percent,10);
 assert.deepEqual(normalizeMustDo({done:["invalid",MUST_DO_ITEMS[0].id,MUST_DO_ITEMS[0].id]}).done,[MUST_DO_ITEMS[0].id]);
});
test("v37 routes and all game sources are in offline precache",()=>{
 const app=readFileSync(new URL("../js/app.js",import.meta.url),"utf8");
 const sw=readFileSync(new URL("../sw.js",import.meta.url),"utf8");
 for(const handler of ["renderSnake","renderOcean","renderMemoryGame","renderMustDo"])
  assert.ok(app.includes("render: "+handler),handler);
 for(const path of ["./js/logic/arcade.js","./js/logic/must-do.js",
  "./js/views/retro-arcade.js","./js/views/must-do.js"]){
  assert.ok(sw.includes(JSON.stringify(path)),path);
 }
 assert.match(sw,/CACHE_VERSION = "v38"/);
 assert.doesNotMatch(sw,/"\.\/data\/sanya-detail-yalong\.json"/);
 const backup=readFileSync(new URL("../js/logic/backup.js",import.meta.url),"utf8");
 assert.match(backup,/"stg:mustdo"/);
});
