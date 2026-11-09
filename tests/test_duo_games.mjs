import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {FOUR_COLS,FOUR_ROWS,newFour,dropFour,normalizeFour,
 HOCKEY_W,HOCKEY_H,newHockey,stepHockey} from "../js/logic/duo-games.js";
import {newOcean,stepOcean} from "../js/logic/arcade.js";

test("four-in-a-row alternates, stacks to the bottom, saves a valid game",()=>{
 let game=newFour();
 game=dropFour(game,3);
 assert.equal(game.board[5*7+3],0);
 assert.equal(game.turn,1);assert.equal(game.moves,1);
 game=dropFour(game,3);
 assert.equal(game.board[4*7+3],1);
 assert.equal(normalizeFour(game).moves,2);
 assert.equal(dropFour(game,-1),game);
 assert.equal(dropFour(game,7),game);
});
test("four-in-a-row handles horizontal wins",()=>{
 let game=newFour();
 for(const column of [0,0,1,1,2,2,3])game=dropFour(game,column);
 assert.equal(game.winner,0);
 assert.equal(game.moves,7);
 assert.equal(dropFour(game,4),game);
});
test("four-in-a-row detects vertical wins",()=>{
 let game=newFour();
 for(const column of [0,1,0,1,0,1,0])game=dropFour(game,column);
 assert.equal(game.winner,0);
});
test("four-in-a-row rejects damaged or unsupported saved states",()=>{
 const game=newFour();
 assert.equal(normalizeFour({...game,board:[]}),null);
 assert.equal(normalizeFour({...game,board:[...game.board.slice(0,41),2]}),null);
 assert.equal(normalizeFour({...game,moves:1}),null);
 assert.equal(normalizeFour({...game,board:["bad",...game.board.slice(1)]}),null);
});
test("air hockey has 2 independently movable paddles",()=>{
 let g={...newHockey(),phase:"playing"};
 const move=stepHockey(g,[{x:40,y:44},{x:320,y:473}],.03);
 assert.ok(move.paddles[0].x<g.paddles[0].x);
 assert.ok(move.paddles[1].x>g.paddles[1].x);
 assert.ok(move.paddles[0].y<HOCKEY_H/2-29);
 assert.ok(move.paddles[1].y>HOCKEY_H/2+29);
});
test("air hockey scores in either goal and ends at five",()=>{
 const start={...newHockey(),phase:"playing"};
 const toTop={...start,puck:{x:180,y:10,vx:0,vy:-260}};
 const goal=stepHockey(toTop,null,.03);
 assert.equal(goal.score[1],1);
 assert.equal(goal.puck.y,HOCKEY_H/2);
 const toBottom={...start,puck:{x:180,y:510,vx:0,vy:260}};
 assert.equal(stepHockey(toBottom,null,.03).score[0],1);
 const end=stepHockey({...toTop,score:[0,4]},null,.03);
 assert.equal(end.winner,1);assert.equal(end.phase,"finished");
});
test("fish follows target smoothly and frame-size invariant within tolerance",()=>{
 const original=newOcean(()=>.31);
 const g={...original,phase:"playing",fish:[]};
 const target={x:340,y:300};
 const one=stepOcean(g,target,.04);
 assert.ok(one.player.x>g.player.x);
 assert.ok(one.player.x<g.player.x+15,"one frame must never teleport player");
 const many=Array.from({length:4}).reduce(acc=>stepOcean(acc,target,.01),g);
 assert.ok(Math.abs(one.player.x-many.player.x)<5,"smooth small steps approximate longer step");
});
test("version 38 precaches both games and natural atlas",()=>{
 const app=readFileSync(new URL("../js/app.js",import.meta.url),"utf8");
 const sw=readFileSync(new URL("../sw.js",import.meta.url),"utf8");
 for(const fn of ["renderAirHockey","renderConnectFour"])assert.ok(app.includes("render: "+fn));
 for(const path of ["./js/views/duo-games.js","./js/logic/duo-games.js",
  "./assets/maps/hainan-relief.webp"])assert.ok(sw.includes(JSON.stringify(path)),path);
 assert.match(sw,/CACHE_VERSION = "v38"/);
});
