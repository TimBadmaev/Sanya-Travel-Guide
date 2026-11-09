// Two small original offline arcade games. Logic is pure: no DOM, timers or network.
export const SNAKE_SIZE=18;
const snakeCell=(x,y)=>y*SNAKE_SIZE+x;
const directions={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};
function freeFood(body,rng=Math.random){
 const occupied=new Set(body), free=[];
 for(let i=0;i<SNAKE_SIZE*SNAKE_SIZE;i++)if(!occupied.has(i))free.push(i);
 return free.length?free[Math.min(free.length-1,Math.floor(rng()*free.length))]:null;
}
export function newSnake(rng=Math.random){
 const body=[snakeCell(9,9),snakeCell(8,9),snakeCell(7,9)];
 return {phase:"ready",body,direction:"right",queued:"right",food:freeFood(body,rng),score:0};
}
export function steerSnake(game,direction){
 if(!directions[direction]||game.phase==="over")return game;
 const [dx,dy]=directions[direction], [px,py]=directions[game.direction];
 return dx===-px&&dy===-py?game:{...game,queued:direction};
}
export function advanceSnake(game,rng=Math.random){
 if(game.phase==="over")return game;
 const direction=game.queued, [dx,dy]=directions[direction];
 const head=game.body[0], x=head%SNAKE_SIZE+dx,y=Math.floor(head/SNAKE_SIZE)+dy;
 if(x<0||x>=SNAKE_SIZE||y<0||y>=SNAKE_SIZE)return {...game,phase:"over"};
 const next=snakeCell(x,y),grow=next===game.food;
 const occupied=grow?game.body:game.body.slice(0,-1);
 if(occupied.includes(next))return {...game,phase:"over"};
 const body=[next,...game.body.slice(0,grow?undefined:-1)],score=game.score+(grow?10:0);
 const food=grow?freeFood(body,rng):game.food;
 return {...game,body,direction,queued:direction,food,score,phase:food===null?"over":"playing"};
}

// Swimming is frame-rate independent; food and enemies vary continuously
// with player size instead of jumping across arbitrary difficulty "levels".
export const OCEAN_WIDTH=360,OCEAN_HEIGHT=420;
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const rand=(min,max,rng)=>min+(max-min)*rng();
function makeFish(rng=Math.random,playerR=15){
 const small=rng()<.68, fromLeft=rng()<.5;
 const r=small?rand(7,Math.max(9,playerR*.75),rng):
   rand(Math.max(14,playerR*1.25),Math.min(37,playerR*1.52+2),rng);
 const speed=rand(22,48,rng);
 return {x:fromLeft?-r-4:OCEAN_WIDTH+r+4,
  y:rand(26,OCEAN_HEIGHT-26,rng),r,vx:(fromLeft?1:-1)*speed,
  color:small?"#9ff6bf":"#fc9d9a"};
}
export function newOcean(rng=Math.random){
 const p={x:180,y:215,r:15,vx:0,vy:0};
 const fish=Array.from({length:9},()=>makeFish(rng,p.r));
 // First fish appears at a safe, discoverable location, not on top of player.
 fish[0]={...fish[0],x:rand(35,88,rng),y:rand(38,96,rng),r:8,vx:26,color:"#9ff6bf"};
 return {phase:"ready",player:p,fish,seconds:60,score:0,lives:3,invincible:0};
}
export function stepOcean(game,target,seconds,rng=Math.random){
 if(game.phase!=="playing")return game;
 const dt=clamp(Number(seconds)||0,0,.08),p={...game.player};
 const tx=clamp(Number.isFinite(target?.x)?target.x:p.x,p.r,OCEAN_WIDTH-p.r);
 const ty=clamp(Number.isFinite(target?.y)?target.y:p.y,p.r,OCEAN_HEIGHT-p.r);
 // Smooth follow with acceleration and a soft approach near the pointer.
 // No instant +/-110px jumps from controls, no frame-rate dependence.
 const dx=tx-p.x,dy=ty-p.y,distance=Math.hypot(dx,dy);
 const speed=Math.min(190,distance*5.8);
 const desiredX=distance>.1?dx/distance*speed:0;
 const desiredY=distance>.1?dy/distance*speed:0;
 const ease=1-Math.exp(-13*dt);
 p.vx=(p.vx||0)+(desiredX-(p.vx||0))*ease;
 p.vy=(p.vy||0)+(desiredY-(p.vy||0))*ease;
 p.x=clamp(p.x+p.vx*dt,p.r,OCEAN_WIDTH-p.r);
 p.y=clamp(p.y+p.vy*dt,p.r,OCEAN_HEIGHT-p.r);
 let score=game.score,lives=game.lives;
 let invincible=Math.max(0,game.invincible-dt);
 const fish=[];
 for(const old of game.fish){
  let f={...old,x:old.x+old.vx*dt};
  if(f.x<-46||f.x>OCEAN_WIDTH+46){
   fish.push(makeFish(rng,p.r));continue;
  }
  const touch=Math.hypot(p.x-f.x,p.y-f.y)<(p.r+f.r)*.78;
  if(touch){
   if(p.r>=f.r*1.15){
    score+=10;
    p.r=Math.min(31,p.r+.32);
    fish.push(makeFish(rng,p.r));continue;
   }
   if(invincible<=0){
    lives--;invincible=1.5;
    if(lives<=0)return {...game,phase:"over",player:p,lives:0,score,invincible,fish:game.fish};
   }
   // Retire a collided enemy offscreen instead of bouncing the player.
   f=makeFish(rng,p.r);
  }
  fish.push(f);
 }
 const time=Math.max(0,game.seconds-dt);
 return {...game,phase:time===0?"over":"playing",player:p,fish,
  seconds:time,score,lives,invincible};
}
