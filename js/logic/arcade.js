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

export const OCEAN_WIDTH=360,OCEAN_HEIGHT=420;
const rand=(min,max,rng)=>min+(max-min)*rng();
function makeFish(rng=Math.random,level=0){
 const r=Math.round(rand(7,29+Math.min(level*1.5,9),rng));
 const fromLeft=rng()<.5;
 return {x:fromLeft?-r-8:OCEAN_WIDTH+r+8,
  y:rand(25,OCEAN_HEIGHT-25,rng),r,
  vx:(fromLeft?1:-1)*rand(22,65,rng),color:r<14?"#9ff6bf":r<23?"#ffd78b":"#fc8b9b"};
}
export function newOcean(rng=Math.random){
 const fish=Array.from({length:9},()=>makeFish(rng));
 fish[0]={...fish[0],x:rand(20,90,rng),y:rand(35,100,rng),r:8,vx:26,color:"#9ff6bf"};
 return {phase:"ready",player:{x:180,y:215,r:15},fish,seconds:60,
  score:0,lives:3,invincible:0};
}
export function stepOcean(game,target,seconds,rng=Math.random){
 if(game.phase!=="playing")return game;
 const dt=Math.min(.15,Math.max(0,Number(seconds)||0));
 const p={...game.player};
 const tx=Math.max(p.r,Math.min(OCEAN_WIDTH-p.r,Number(target?.x)||p.x));
 const ty=Math.max(p.r,Math.min(OCEAN_HEIGHT-p.r,Number(target?.y)||p.y));
 const dx=tx-p.x,dy=ty-p.y,distance=Math.hypot(dx,dy);
 if(distance>.5){const move=Math.min(distance,160*dt);p.x+=dx/distance*move;p.y+=dy/distance*move;}
 let score=game.score,lives=game.lives;
 let invincible=Math.max(0,game.invincible-dt);
 const fish=[];
 for(const old of game.fish){
  const f={...old,x:old.x+old.vx*dt};
  if(f.x<-45||f.x>OCEAN_WIDTH+45){fish.push(makeFish(rng,score/100));continue;}
  if(Math.hypot(p.x-f.x,p.y-f.y)<(p.r+f.r)*.79){
   if(p.r>=f.r*1.15){score+=10;p.r=Math.min(36,p.r+.65);fish.push(makeFish(rng,score/100));continue;}
   if(invincible<=0){
    lives--;invincible=1.3;
    if(lives<=0)return {...game,phase:"over",player:p,lives:0,score,invincible,fish:game.fish};
   }
   f.x=old.vx>0?-f.r-15:OCEAN_WIDTH+f.r+15;
  }
  fish.push(f);
 }
 const time=Math.max(0,game.seconds-dt);
 return {...game,phase:time===0?"over":"playing",player:p,fish,
  seconds:time,score,lives,invincible};
}
