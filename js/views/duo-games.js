import {storage} from "../storage.js";
import {FOUR_COLS,FOUR_ROWS,newFour,dropFour,normalizeFour,
 HOCKEY_W,HOCKEY_H,newHockey,stepHockey} from "../logic/duo-games.js";

const el=(p,t,c,x)=>{
 const a=document.createElement(t);if(c)a.className=c;if(x!==undefined)a.textContent=x;p.appendChild(a);return a;
};
const back=(p,ctx)=>{
 const a=el(p,"a","place-detail__back","← К играм");a.href="#/games";
 a.addEventListener("click",e=>{e.preventDefault();ctx.back("#/games");});
};
function records(key,delta=1){
 const data=storage.getGameData();
 data.stats[key]=(data.stats[key]||0)+delta;
 return storage.setGameData(data);
}
export function renderConnectFour(container,ctx){
 container.replaceChildren();back(container,ctx);
 el(container,"h2","view-title","🟡 Четыре в ряд");
 el(container,"p","game-hub__lead",
  "Для двоих на одном телефоне. Нажимайте на столбцы по очереди. Кто первым соберёт четыре фишки подряд — по горизонтали, вертикали или диагонали — победил.");
 const main=el(container,"section","duo-game");
 const status=el(main,"p","duo-game__status","");
 status.setAttribute("role","status");
 const columns=el(main,"div","duo-four__columns");
 const board=el(main,"div","duo-four__board");
 board.setAttribute("role","img");board.setAttribute("aria-label","Игровое поле семь на шесть");
 const cells=Array.from({length:FOUR_COLS*FOUR_ROWS},()=>el(board,"span","duo-four__cell",""));
 const msg=el(main,"p","duo-game__hint","Фишки падают вниз, как в классической настольной игре.");
 const reset=el(main,"button","btn btn--secondary duo-game__reset","↻ Новая партия");reset.type="button";
 let game=normalizeFour(storage.getGameData().fourMatch)||newFour();
 function save(next,prev){
  const data=storage.getGameData();
  if(prev.winner===null&&next.winner!==null){
   if(next.winner===0)data.stats.fourWinsA=(data.stats.fourWinsA||0)+1;
   if(next.winner===1)data.stats.fourWinsB=(data.stats.fourWinsB||0)+1;
   if(next.winner==="draw")data.stats.fourDraws=(data.stats.fourDraws||0)+1;
  }
  data.fourMatch=next;
  if(!storage.setGameData(data)){msg.textContent="Не удалось сохранить партию.";return false;}
  game=next;return true;
 }
 function draw(){
  const a=storage.getGameData().stats;
  status.textContent=game.winner==="draw"?"🤝 Ничья":
   game.winner===0?"🏆 Победил игрок 1 (жёлтый)!":
   game.winner===1?"🏆 Победил игрок 2 (коралловый)!":
   "Ход: игрок "+(game.turn+1)+(game.turn===0?" 🟡":" 🔴");
  cells.forEach((cell,i)=>{
   cell.className="duo-four__cell"+(game.board[i]===0?" is-yellow":game.board[i]===1?" is-coral":"");
   cell.textContent=game.board[i]===0?"●":game.board[i]===1?"●":"";
  });
  for(let col=0;col<FOUR_COLS;col++){
   const btn=columns.children[col];if(btn)btn.disabled=game.winner!==null||game.board[col]!==null;
  }
  msg.textContent="Победы: жёлтый "+(a.fourWinsA||0)+" · коралловый "+(a.fourWinsB||0)+
    ". Партия сохраняется при закрытии приложения.";
 }
 for(let col=0;col<FOUR_COLS;col++){
  const button=el(columns,"button","duo-four__drop","↓");
  button.type="button";button.setAttribute("aria-label","Сбросить фишку в столбец "+(col+1));
  button.addEventListener("click",()=>{
   const next=dropFour(game,col);
   if(next!==game&&save(next,game))draw();
  });
 }
 reset.addEventListener("click",()=>{
  if(game.moves&&game.winner===null&&!window.confirm("Начать новую партию? Текущая будет потеряна."))return;
  if(save(newFour(),game))draw();
 });
 draw();
}

export function renderAirHockey(container,ctx){
 container.replaceChildren();back(container,ctx);
 el(container,"h2","view-title","🏒 Аэрохоккей на двоих");
 el(container,"p","game-hub__lead",
  "Положите телефон между собой. Синий игрок сверху, коралловый снизу. Оба могут двигать клюшки пальцами одновременно. Первый до пяти голов побеждает.");
 const main=el(container,"section","duo-game");
 const scores=el(main,"p","duo-game__status","");
 const canvas=el(main,"canvas","duo-hockey__canvas");
 canvas.width=HOCKEY_W;canvas.height=HOCKEY_H;canvas.setAttribute("aria-label","Поле аэрохоккея. Управление двумя пальцами по обеим сторонам.");
 const g=canvas.getContext("2d");
 const status=el(main,"p","duo-game__hint","Выберите «Начать» для матча.");
 status.setAttribute("role","status");
 const toolbar=el(main,"div","duo-game__actions");
 const toggle=el(toolbar,"button","btn btn--primary","▶ Начать");toggle.type="button";
 const restart=el(toolbar,"button","btn btn--secondary","↻ Заново");restart.type="button";
 let game=newHockey(),last=0,raf=null;
 const targets=[{x:180,y:94},{x:180,y:426}], owners=new Map();
 function stop(){if(raf!==null)cancelAnimationFrame(raf);raf=null;last=0;}
 function disk(x,y,r,color){
  g.beginPath();g.arc(x,y,r,0,Math.PI*2);g.fillStyle=color;g.fill();
 }
 function draw(){
  if(!g)return;
  g.fillStyle="#102744";g.fillRect(0,0,HOCKEY_W,HOCKEY_H);
  const bg=g.createLinearGradient(0,0,0,HOCKEY_H);
  bg.addColorStop(0,"#164a74");bg.addColorStop(.5,"#11304e");bg.addColorStop(1,"#74445a");
  g.fillStyle=bg;g.fillRect(10,10,HOCKEY_W-20,HOCKEY_H-20);
  g.strokeStyle="rgba(231,247,251,.67)";g.lineWidth=3;
  g.strokeRect(10,10,HOCKEY_W-20,HOCKEY_H-20);
  g.beginPath();g.moveTo(10,HOCKEY_H/2);g.lineTo(HOCKEY_W-10,HOCKEY_H/2);g.stroke();
  g.beginPath();g.arc(HOCKEY_W/2,HOCKEY_H/2,56,0,Math.PI*2);g.stroke();
  g.strokeStyle="#91e7ee";g.lineWidth=6;
  g.beginPath();g.moveTo(100,10);g.lineTo(260,10);g.stroke();
  g.strokeStyle="#ff9eaa";g.beginPath();g.moveTo(100,HOCKEY_H-10);g.lineTo(260,HOCKEY_H-10);g.stroke();
  for(const [i,p] of game.paddles.entries()){
   disk(p.x,p.y,24,i===0?"#67cce6":"#ff929c");
   disk(p.x,p.y,12,"rgba(12,41,61,.65)");
  }
  disk(game.puck.x,game.puck.y,11,"#fff3d1");
  scores.textContent="🔵 "+game.score[0]+" : "+game.score[1]+" 🔴";
  status.textContent=game.phase==="ready"?"Играйте двумя пальцами одновременно.":
   game.phase==="paused"?"На паузе":game.phase==="finished"?
   "🏆 Победил "+(game.winner===0?"синий":"коралловый")+" игрок!":"Гоняйте шайбу в ворота соперника!";
  toggle.textContent=game.phase==="ready"?"▶ Начать":game.phase==="paused"?"▶ Продолжить":
   game.phase==="finished"?"↻ Новый матч":"⏸ Пауза";
 }
 function frame(time){
  if(!ctx.isCurrent()||!main.isConnected){stop();return;}
  const dt=last?Math.min((time-last)/1000,.04):0;last=time;
  game=stepHockey(game,targets,dt);draw();
  if(game.phase==="finished"){
   stop();records(game.winner===0?"hockeyWinsA":"hockeyWinsB");draw();return;
  }
  raf=requestAnimationFrame(frame);
 }
 function resume(){
  stop();game={...game,phase:"playing"};raf=requestAnimationFrame(frame);draw();
 }
 function newMatch(){stop();game=newHockey();targets[0]={...game.paddles[0]};targets[1]={...game.paddles[1]};resume();}
 toggle.addEventListener("click",()=>{
  if(game.phase==="ready"||game.phase==="finished")newMatch();
  else if(game.phase==="paused")resume();
  else{stop();game={...game,phase:"paused"};draw();}
 });
 restart.addEventListener("click",newMatch);
 function position(e){
  const rect=canvas.getBoundingClientRect();
  return {x:(e.clientX-rect.left)/rect.width*HOCKEY_W,
   y:(e.clientY-rect.top)/rect.height*HOCKEY_H};
 }
 canvas.addEventListener("pointerdown",e=>{
  const pos=position(e),player=pos.y<HOCKEY_H/2?0:1;
  if([...owners.values()].includes(player))return;
  owners.set(e.pointerId,player);canvas.setPointerCapture(e.pointerId);targets[player]=pos;
 });
 canvas.addEventListener("pointermove",e=>{
  const player=owners.get(e.pointerId);
  if(player!==undefined)targets[player]=position(e);
 });
 function release(e){owners.delete(e.pointerId);}
 canvas.addEventListener("pointerup",release);
 canvas.addEventListener("pointercancel",release);
 function onVisibility(){
  if(document.hidden&&raf!==null){stop();game={...game,phase:"paused"};draw();}
 }
 document.addEventListener("visibilitychange",onVisibility);
 window.addEventListener("hashchange",()=>{
  stop();document.removeEventListener("visibilitychange",onVisibility);
 },{once:true});
 draw();
}
