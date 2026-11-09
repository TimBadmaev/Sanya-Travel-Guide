import { storage } from "../storage.js";
import { BOARD_SIZE, createMatch, validMatch, revealTurn, fireShot, chooseCpuShot, wasHit } from "../logic/minigames.js";

const el=(parent,tag,cls,text)=>{
 const node=document.createElement(tag);if(cls)node.className=cls;
 if(text!==undefined)node.textContent=text;parent.appendChild(node);return node;
};
function back(parent,ctx,label="← К играм",to="#/games"){
 const a=el(parent,"a","place-detail__back",label);a.href=to;
 a.addEventListener("click",e=>{e.preventDefault();ctx.back(to);});
}
function card(parent,emoji,title,description,href){
 const a=el(parent,"a","game-hub__card");a.href=href;
 el(a,"span","game-hub__emoji",emoji);
 const body=el(a,"span","game-hub__copy");
 el(body,"strong","",title);el(body,"span","",description);
 el(a,"span","game-hub__arrow","›");
}
export function renderGames(container,ctx){
 container.replaceChildren();back(container,ctx,"← На главную","#/");
 el(container,"h2","view-title","🎮 Игровая бухта");
 el(container,"p","game-hub__lead","Небольшие офлайн-игры: в дороге, вечером или вдвоём. Без рекламы, входа в аккаунт и обязательных ежедневных заданий.");
 const progress=storage.getGameData(),main=el(container,"div","game-hub__list");
 card(main,"🚢","Морской бой","8×8 · против компьютера или по очереди на одном телефоне","#/games/sea");
 card(main,"🀄","Китайский экспресс","10 вопросов по настоящим фразам из разговорника","#/games/phrases");
 card(main,"🐠","Тропическое мемори","Найди 8 пар — тренировка памяти","#/games/memory");
 const records=el(container,"section","game-hub__records");
 el(records,"h3","","🏆 Наши результаты");
 el(records,"p","", "Победы над компьютером: "+progress.stats.soloWins+
  " · Партии вдвоём: "+progress.stats.passGames);
 el(records,"p","", "Китайский экспресс: "+progress.stats.quizBest+"/10"+
  (progress.stats.memoryBest?" · Мемори: "+progress.stats.memoryBest+" попыток":""));
 el(container,"p","game-hub__note","Игры сохраняются на этом телефоне и входят в резервную копию. Игра через Bluetooth между двумя iPhone пока недоступна в PWA.");
}
export function renderBattleship(container,ctx){
 container.replaceChildren();back(container,ctx);
 el(container,"h2","view-title","🚢 Морской бой");
 const data=storage.getGameData();
 let game=validMatch(data.match)?data.match:null;
 const root=el(container,"section","naval-game");
 const notice=el(container,"p","game-hub__note",
   "Правила: поле 8×8, корабли длиной 4, 3, 2 и 2 клетки. Корабли не соприкасаются. Расстановка случайная. Ходы сохраняются.");
 function persist(next,old=game){
  const saved=storage.getGameData();
  if(next?.phase==="finished"&&old?.phase!=="finished"){
   if(next.mode==="solo"&&next.winner===0)saved.stats.soloWins++;
   if(next.mode==="pass")saved.stats.passGames++;
  }
  saved.match=next;
  if(!storage.setGameData(saved)){
   const p=el(root,"p","game-hub__error","Не удалось сохранить ход. Проверь память телефона.");
   p.setAttribute("role","status");
   return false;
  }
  game=next;return true;
 }
 function start(mode){
  const match=createMatch(mode);
  if(persist(match))draw();
 }
 function launchActions(parent){
  const toolbar=el(parent,"div","naval-game__toolbar");
  const restart=el(toolbar,"button","btn btn--secondary","↻ Новая партия");restart.type="button";
  restart.addEventListener("click",()=>{
   if(game&&game.phase!=="finished"&&!window.confirm("Завершить текущую партию и начать заново?"))return;
   if(!storage.setGameData({...storage.getGameData(),match:null}))return;
   game=null;draw();
  });
 }
 function renderBoard(parent,player,own){
  const board=el(parent,"section","naval-game__board");
  el(board,"h3","",own?"Твой флот":"Море противника");
  const cells=el(board,"div","naval-game__grid");
  cells.setAttribute("role","group");
  cells.setAttribute("aria-label",own?"Твой флот":"Поле для выстрелов");
  const viewedPlayer=own?player:1-player;
  const enemyShots=game.shots[1-viewedPlayer];
  const occupied=own?new Set(game.fleets[player].flat()):null;
  for(let n=0;n<BOARD_SIZE*BOARD_SIZE;n++){
   const shot=enemyShots.includes(n),hit=shot&&wasHit(game.fleets[viewedPlayer],n);
   const sea=el(cells,own?"span":"button",
    "naval-game__cell"+(hit?" is-hit":shot?" is-miss":occupied?.has(n)?" is-ship":""),
    hit?"✹":shot?"·":occupied?.has(n)?"■":"");
   const coord=String.fromCharCode(65+n%BOARD_SIZE)+(Math.floor(n/BOARD_SIZE)+1);
   sea.setAttribute("aria-label",coord+(hit?" попадание":shot?" мимо":own&&occupied?.has(n)?" корабль":""));
   if(!own){
    sea.type="button";sea.disabled=shot;
    if(!shot)sea.addEventListener("click",()=>{
     try{
      let next=fireShot(game,n),last=next;
      if(next.mode==="solo"&&next.phase==="battle"&&next.turn===1){
       next=fireShot(next,chooseCpuShot(next));
      }
      if(persist(next)){draw();}
     }catch(error){alert(error.message);}
    });
   }
  }
 }
 function draw(){
  root.replaceChildren();
  if(!game){
   el(root,"h3","","Выбери режим");
   el(root,"p","","В режиме вдвоём экран скрывается между ходами, чтобы соперник не увидел чужой флот.");
   const startButtons=el(root,"div","naval-game__new");
   for(const [mode,name] of [["solo","🤖 Против компьютера"],["pass","👥 На одном телефоне"]]){
    const b=el(startButtons,"button","btn btn--primary",name);b.type="button";
    b.addEventListener("click",()=>start(mode));
   }
   return;
  }
  launchActions(root);
  if(game.phase==="handoff"){
   const player=game.turn+1;
   const box=el(root,"div","naval-game__handoff");
   el(box,"div","naval-game__icon","🔒");
   el(box,"h3","","Передай телефон игроку "+player);
   el(box,"p","","Когда экран у тебя, нажми «Готов». До этого карты кораблей и предыдущие выстрелы скрыты.");
   const ready=el(box,"button","btn btn--primary","Я игрок "+player+", готов");
   ready.type="button";ready.addEventListener("click",()=>{if(persist(revealTurn(game)))draw();});
   return;
  }
  if(game.phase==="finished"){
   const winner=game.winner===0?"первый игрок":game.mode==="solo"?"компьютер":"второй игрок";
   el(root,"h3","naval-game__winner","🏆 Победил "+winner+"!");
   el(root,"p","","Все корабли соперника потоплены.");
   const again=el(root,"button","btn btn--primary","Новая партия");
   again.addEventListener("click",()=>{if(storage.setGameData({...storage.getGameData(),match:null})){game=null;draw();}});
   return;
  }
  const player=game.turn;
  el(root,"h3","naval-game__turn",game.mode==="solo"?"Твой ход":"Ход игрока "+(player+1));
  if(game.last&&game.mode==="solo"){
   const last=game.last;
   el(root,"p","naval-game__status",last.player===1?
    "Последний выстрел компьютера: "+(last.hit?"попадание":"мимо"):
    "Последний выстрел: "+(last.hit?"попадание":"мимо"));
  }
  const boards=el(root,"div","naval-game__boards");
  renderBoard(boards,player,true);
  renderBoard(boards,player,false);
  el(root,"p","game-hub__note","Коснись клетки моря противника. На своём поле: ■ корабль, ✹ попадание, · промах.");
 }
 draw();
}
