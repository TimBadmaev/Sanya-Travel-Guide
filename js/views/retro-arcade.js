import { storage } from "../storage.js";
import { SNAKE_SIZE,newSnake,steerSnake,advanceSnake,
  OCEAN_WIDTH,OCEAN_HEIGHT,newOcean,stepOcean } from "../logic/arcade.js";

function el(parent,tag,cls,text){
 const n=document.createElement(tag);if(cls)n.className=cls;
 if(text!==undefined)n.textContent=text;parent.appendChild(n);return n;
}
function back(parent,ctx){
 const a=el(parent,"a","place-detail__back","← К играм");a.href="#/games";
 a.addEventListener("click",e=>{e.preventDefault();ctx.back("#/games");});
}
function saveBest(kind,score){
 const data=storage.getGameData();
 data.stats[kind]=Math.max(data.stats[kind]||0,Math.floor(score));
 return storage.setGameData(data);
}
function controls(parent,action){
 const controls=el(parent,"div","retro-controls");controls.setAttribute("aria-label","Управление игрой");
 const dirs=[["up","↑","Вверх"],["left","←","Влево"],["down","↓","Вниз"],["right","→","Вправо"]];
 for(const [direction,icon,name] of dirs){
  const b=el(controls,"button","retro-controls__button retro-controls__"+direction,icon);
  b.type="button";b.setAttribute("aria-label",name);b.addEventListener("click",()=>action(direction));
 }
}
function bindKeyboard(ctx,handler){
 const keys={ArrowUp:"up",ArrowDown:"down",ArrowLeft:"left",ArrowRight:"right",
  w:"up",a:"left",s:"down",d:"right",ц:"up",ф:"left",ы:"down",в:"right"};
 const listener=e=>{
  if(!ctx.isCurrent())return;
  const direction=keys[e.key];
  if(!direction||e.target.closest("input,textarea,select"))return;
  e.preventDefault();handler(direction);
 };
 document.addEventListener("keydown",listener);
 const cleanup=()=>document.removeEventListener("keydown",listener);
 window.addEventListener("hashchange",cleanup,{once:true});
 return cleanup;
}

export function renderSnake(container,ctx){
 container.replaceChildren();back(container,ctx);
 el(container,"h2","view-title","🐍 Змейка: кокосовый пиксель");
 el(container,"p","game-hub__lead",
  "Классика с телефона из детства: собирай кокосы, не встречай стену и собственный хвост. Управляй стрелками, свайпом или клавиатурой.");
 const box=el(container,"section","retro-game");
 const stats=el(box,"p","retro-game__stats","");
 const board=el(box,"div","snake-grid");
 board.setAttribute("role","img");board.setAttribute("aria-label","Игровое поле 18 на 18");
 const cells=Array.from({length:SNAKE_SIZE*SNAKE_SIZE},()=>el(board,"span","snake-grid__cell",""));
 const status=el(box,"p","retro-game__status","");status.setAttribute("role","status");
 const buttons=el(box,"div","retro-game__actions");
 const start=el(buttons,"button","btn btn--primary","Начать");start.type="button";
 const restart=el(buttons,"button","btn btn--secondary","Новая игра");restart.type="button";
 const info=el(container,"p","game-hub__note","Играй сколько хочешь: никаких ежедневных серий и рекламы.");
 let state=newSnake(),paused=false,timer=null;
 function stop(){if(timer!==null){clearInterval(timer);timer=null;}}
 function paint(){
  const body=new Set(state.body),head=state.body[0];
  cells.forEach((cell,i)=>{
   const headCell=i===head;
   cell.className="snake-grid__cell"+(headCell?" is-head":body.has(i)?" is-body":i===state.food?" is-food":"");
   cell.textContent=i===state.food?"🥥":"";
  });
  const best=storage.getGameData().stats.snakeBest||0;
  stats.textContent="Счёт: "+state.score+" · Рекорд: "+best;
  start.textContent=state.phase==="ready"?"▶ Начать":state.phase==="over"?"↻ Сыграть ещё":paused?"▶ Продолжить":"⏸ Пауза";
  status.textContent=state.phase==="ready"?"Начинай, когда будешь готов.":
   state.phase==="over"?"Финиш! Краб утверждает, что виновата стена.":paused?"Пауза":"Лови кокосы!";
 }
 function tick(){
  if(!ctx.isCurrent()||!box.isConnected){stop();return;}
  state=advanceSnake(state);paint();
  if(state.phase==="over"){stop();saveBest("snakeBest",state.score);paint();}
 }
 function begin(){
  stop();state=newSnake();state={...state,phase:"playing"};paused=false;
  timer=setInterval(tick,150);paint();
 }
 function pauseToggle(){
  if(state.phase==="ready"||state.phase==="over"){begin();return;}
  paused=!paused;if(paused)stop();else timer=setInterval(tick,150);
  paint();
 }
 function direction(key){
  if(state.phase!=="playing"||paused)return;
  state=steerSnake(state,key);
 }
 controls(box,direction);
 start.addEventListener("click",pauseToggle);
 restart.addEventListener("click",()=>begin());
 const touch={x:0,y:0};
 board.addEventListener("pointerdown",e=>{
  touch.x=e.clientX;touch.y=e.clientY;
 });
 board.addEventListener("pointerup",e=>{
  const dx=e.clientX-touch.x,dy=e.clientY-touch.y;
  if(Math.max(Math.abs(dx),Math.abs(dy))<18)return;
  direction(Math.abs(dx)>Math.abs(dy)?(dx>0?"right":"left"):(dy>0?"down":"up"));
 });
 const offKeyboard=bindKeyboard(ctx,direction);
 function onVisibility(){
  if(document.hidden&&timer!==null){paused=true;stop();paint();}
 }
 document.addEventListener("visibilitychange",onVisibility);
 window.addEventListener("hashchange",()=>{
  stop();offKeyboard();document.removeEventListener("visibilitychange",onVisibility);
 },{once:true});
 paint();
}

function paintFish(g,fish,player=false,invincible=0){
 if(player&&invincible>0&&Math.floor(invincible*12)%2===0)return;
 const {x,y,r}=fish,face=player?1:Math.sign(fish.vx)||1;
 g.save();g.translate(x,y);g.scale(face,1);
 g.fillStyle=player?"#8bfae5":fish.color;
 g.beginPath();g.moveTo(-r*.68,0);g.lineTo(-r*1.5,-r*.65);g.lineTo(-r*1.5,r*.65);g.closePath();g.fill();
 g.beginPath();g.ellipse(0,0,r,r*.68,0,0,Math.PI*2);g.fill();
 g.fillStyle=player?"#124a5d":"#1b4261";
 g.beginPath();g.arc(r*.5,-r*.15,Math.max(2,r*.1),0,Math.PI*2);g.fill();
 g.restore();
}
export function renderOcean(container,ctx){
 container.replaceChildren();back(container,ctx);
 el(container,"h2","view-title","🐠 Рыбка-поглотитель");
 el(container,"p","game-hub__lead",
  "Ешь рыбок меньше себя и уворачивайся от крупных. Чем больше съел, тем крупнее стал. Пальцем веди рыбку по морю.");
 const box=el(container,"section","retro-game");
 const stats=el(box,"p","retro-game__stats","");
 const canvas=el(box,"canvas","ocean-canvas");
 canvas.width=OCEAN_WIDTH;canvas.height=OCEAN_HEIGHT;
 canvas.setAttribute("role","img");canvas.setAttribute("aria-label","Океан и рыбки: маленьких ешь, больших избегай");
 const g=canvas.getContext("2d");
 const status=el(box,"p","retro-game__status","");status.setAttribute("role","status");
 const buttons=el(box,"div","retro-game__actions");
 const start=el(buttons,"button","btn btn--primary","▶ Начать");start.type="button";
 const restart=el(buttons,"button","btn btn--secondary","Новая игра");restart.type="button";
 const tip=el(container,"p","game-hub__note","Отправляй свою рыбку к маленьким рыбкам; большой хищник отнимет жизнь. На каждый забег — 60 секунд и 3 жизни.");
 let state=newOcean(),target={x:180,y:210},timer=null;
 function stop(){if(timer!==null){clearInterval(timer);timer=null;}}
 const bubbles=Array.from({length:16},(_,i)=>({x:(i*83+27)%360,y:(i*113+32)%420,r:i%3+2}));
 function draw(){
  if(!g)return;
  const bg=g.createLinearGradient(0,0,0,OCEAN_HEIGHT);
  bg.addColorStop(0,"#104d77");bg.addColorStop(1,"#0a274f");
  g.fillStyle=bg;g.fillRect(0,0,OCEAN_WIDTH,OCEAN_HEIGHT);
  g.fillStyle="#23718b";
  for(let i=0;i<9;i++){
   g.fillRect(i*45,0,1,OCEAN_HEIGHT);
  }
  for(const b of bubbles){
   g.fillStyle="rgba(183,243,255,.18)";
   g.beginPath();g.arc(b.x,b.y,b.r,0,Math.PI*2);g.fill();
  }
  for(const fish of state.fish)paintFish(g,fish);
  paintFish(g,state.player,true,state.invincible);
  const best=storage.getGameData().stats.fishBest||0;
  stats.textContent="Счёт: "+state.score+" · Рекорд: "+best+
   " · ❤ "+state.lives+" · ⏱ "+Math.ceil(state.seconds)+" с";
  status.textContent=state.phase==="ready"?"Выбирай маршрут пальцем и нажимай «Начать».":
   state.phase==="paused"?"Пауза. Рыбки пока ведут переговоры.":
   state.phase==="over"?"Заплыв окончен! Краб ставит лайк плавникам.":"Маленьких ешь — больших пропускай!";
  start.textContent=state.phase==="ready"?"▶ Начать":state.phase==="over"?"↻ Ещё заплыв":state.phase==="paused"?"▶ Продолжить":"⏸ Пауза";
 }
 function tick(){
  if(!ctx.isCurrent()||!box.isConnected){stop();return;}
  state=stepOcean(state,target,.05);draw();
  if(state.phase==="over"){stop();saveBest("fishBest",state.score);draw();}
 }
 function startNew(){
  stop();state={...newOcean(),phase:"playing"};target={x:180,y:210};
  timer=setInterval(tick,50);draw();
 }
 function toggle(){
  if(state.phase==="ready"||state.phase==="over"){startNew();return;}
  if(state.phase==="paused"){state={...state,phase:"playing"};timer=setInterval(tick,50);}
  else {state={...state,phase:"paused"};stop();}
  draw();
 }
 start.addEventListener("click",toggle);
 restart.addEventListener("click",startNew);
 function pointer(e){
  const rect=canvas.getBoundingClientRect();
  if(!rect.width||!rect.height)return;
  target={x:(e.clientX-rect.left)/rect.width*OCEAN_WIDTH,
    y:(e.clientY-rect.top)/rect.height*OCEAN_HEIGHT};
 }
 canvas.addEventListener("pointerdown",e=>{
  canvas.setPointerCapture(e.pointerId);pointer(e);
 });
 canvas.addEventListener("pointermove",e=>{
  if(e.buttons||e.pointerType==="touch")pointer(e);
 });
 const dir={left:[-110,0],right:[110,0],up:[0,-110],down:[0,110]};
 function move(key){
  if(!dir[key])return;
  target={x:state.player.x+dir[key][0],y:state.player.y+dir[key][1]};
 }
 controls(box,move);
 const offKeyboard=bindKeyboard(ctx,move);
 function onVisibility(){
  if(document.hidden&&timer!==null){stop();state={...state,phase:"paused"};draw();}
 }
 document.addEventListener("visibilitychange",onVisibility);
 window.addEventListener("hashchange",()=>{
  stop();offKeyboard();document.removeEventListener("visibilitychange",onVisibility);
 },{once:true});
 draw();
}
