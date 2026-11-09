import { storage } from "../storage.js";
const el=(parent,tag,cls,text)=>{
 const node=document.createElement(tag);if(cls)node.className=cls;
 if(text!==undefined)node.textContent=text;parent.appendChild(node);return node;
};
function back(parent,ctx){
 const a=el(parent,"a","place-detail__back","← К играм");a.href="#/games";
 a.addEventListener("click",e=>{e.preventDefault();ctx.back("#/games");});
}
function shuffle(items){
 const arr=[...items];
 for(let i=arr.length-1;i>0;i--){
  const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];
 }
 return arr;
}
const PICTURES=["🐠","🐢","🦀","🌴","🥥","🪸","🐬","🏝️"];
export function renderMemoryGame(container,ctx){
 container.replaceChildren();back(container,ctx);
 el(container,"h2","view-title","🐠 Тропическое мемори");
 el(container,"p","game-hub__lead","Найди 8 пар. Соревнуйтесь за меньшее число попыток или играйте по очереди.");
 const root=el(container,"section","memory-game");
 const tiles=shuffle(PICTURES.flatMap((symbol,i)=>[{symbol,id:i},{symbol,id:i}]));
 let opened=[],matched=new Set(),tries=0,locked=false,done=false;
 const header=el(root,"div","memory-game__status","Попыток: 0 · Найдено: 0/8");
 const grid=el(root,"div","memory-game__grid");
 grid.setAttribute("role","group");grid.setAttribute("aria-label","Поле игры на память");
 const cells=tiles.map((tile,i)=>{
  const button=el(grid,"button","memory-game__tile","?");
  button.type="button";button.setAttribute("aria-label","Закрытая карточка "+(i+1));
  button.addEventListener("click",()=>turn(i));return button;
 });
 const finish=el(root,"div","memory-game__finish");finish.hidden=true;
 function refresh(){
  header.textContent="Попыток: "+tries+" · Найдено: "+matched.size+"/8";
  cells.forEach((button,i)=>{
   const show=opened.includes(i)||matched.has(tiles[i].id);
   button.textContent=show?tiles[i].symbol:"?";
   button.classList.toggle("is-open",show);
   button.classList.toggle("is-matched",matched.has(tiles[i].id));
   button.setAttribute("aria-label",show?tiles[i].symbol:"Закрытая карточка "+(i+1));
   button.disabled=done||locked||show;
  });
 }
 function turn(i){
  if(done||locked||opened.includes(i)||matched.has(tiles[i].id))return;
  opened.push(i);refresh();
  if(opened.length!==2)return;
  tries++;
  if(tiles[opened[0]].id===tiles[opened[1]].id){
   matched.add(tiles[i].id);opened=[];refresh();
   if(matched.size===PICTURES.length){
    done=true;
    const data=storage.getGameData();
    data.stats.memoryBest=data.stats.memoryBest===0?tries:Math.min(data.stats.memoryBest,tries);
    storage.setGameData(data);
    finish.hidden=false;el(finish,"h3","","🏆 Все пары найдены!");
    el(finish,"p","","Всего попыток: "+tries+". Лучший результат сохранён.");
    const again=el(finish,"button","btn btn--primary","Играть снова");
    again.addEventListener("click",()=>renderMemoryGame(container,ctx));
   }
  }else{
   locked=true;refresh();
   setTimeout(()=>{
    if(!ctx.isCurrent())return;
    opened=[];locked=false;refresh();
   },850);
  }
 }
 refresh();
}
