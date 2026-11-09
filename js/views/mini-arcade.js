import { loadPhrases, loadErrorMessage } from "../data.js";
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
export async function renderPhraseGame(container,ctx){
 container.innerHTML='<p class="loading">Готовим китайские фразы…</p>';
 let phrases;
 try{phrases=await loadPhrases();}
 catch(error){if(ctx.isCurrent())container.textContent=loadErrorMessage(error);return;}
 if(!ctx.isCurrent())return;
 container.replaceChildren();back(container,ctx);
 el(container,"h2","view-title","🀄 Китайский экспресс");
 el(container,"p","game-hub__lead","10 вопросов из настоящего разговорника. Выбери русский перевод китайской фразы. Подсказки появятся после ответа.");
 const root=el(container,"section","phrase-game");
 const all=phrases.filter(p=>p.ru&&p.zh);
 const pool=shuffle(all).slice(0,Math.min(10,all.length));
 let index=0,score=0,finished=false;
 function render(){
  root.replaceChildren();
  if(index>=pool.length){
   finished=true;
   el(root,"h3","phrase-game__title","🏆 "+score+" из "+pool.length);
   el(root,"p","",score>=8?"Отличный результат!": "Можно повторить и запомнить ещё несколько фраз.");
   const saved=storage.getGameData();
   saved.stats.quizBest=Math.max(saved.stats.quizBest,score);
   storage.setGameData(saved);
   const a=el(root,"a","btn btn--secondary","📖 Открыть разговорник");a.href="#/handy";
   const again=el(root,"button","btn btn--primary","Ещё 10 вопросов");
   again.addEventListener("click",()=>renderPhraseGame(container,ctx));
   return;
  }
  const current=pool[index],choices=shuffle([
   current,...shuffle(all.filter(p=>p.ru!==current.ru&&p.id!==current.id)).slice(0,3)
  ]);
  el(root,"p","phrase-game__progress","Вопрос "+(index+1)+" из "+pool.length+" · верно "+score);
  const card=el(root,"div","phrase-game__question");
  el(card,"strong","phrase-game__zh",current.zh).lang="zh-CN";
  el(card,"span","phrase-game__hint","Как это сказать по-русски?");
  const buttons=el(root,"div","phrase-game__options");
  const feedback=el(root,"div","phrase-game__feedback","");
  feedback.setAttribute("role","status");
  const next=el(root,"button","btn btn--primary phrase-game__next",index===pool.length-1?"Результат":"Следующий вопрос");
  next.type="button";next.hidden=true;
  let answered=false;
  for(const phrase of choices){
   const button=el(buttons,"button","phrase-game__option",phrase.ru);
   button.type="button";
   button.addEventListener("click",()=>{
    if(answered)return;
    answered=true;const right=phrase.id===current.id;
    if(right)score++;
    for(const b of buttons.children){
     b.disabled=true;
     if(b.textContent===current.ru)b.classList.add("is-correct");
     else if(b===button)b.classList.add("is-wrong");
    }
    feedback.textContent=(right?"✓ Верно! ":"✕ Правильно: "+current.ru+". ")+
     (current.pinyin?"Произношение: "+current.pinyin+". ":"")+(current.context||"");
    next.hidden=false;next.focus();
   });
  }
  next.addEventListener("click",()=>{index++;render();});
 }
 render();
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
