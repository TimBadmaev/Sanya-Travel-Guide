import { storage } from "../storage.js";
const el=(p,tag,cls,text)=>{
 const node=document.createElement(tag);if(cls)node.className=cls;
 if(text!==undefined)node.textContent=text;p.appendChild(node);return node;
};
export function renderGames(container,ctx){
 container.replaceChildren();
 const back=el(container,"a","place-detail__back","← На главную");
 back.href="#/";back.addEventListener("click",e=>{e.preventDefault();ctx.back("#/");});
 el(container,"h2","view-title","🕹️ Игровая бухта");
 el(container,"p","game-hub__lead",
  "Пять коротких игр без рекламы и регистрации. Три для одного, две — для двоих на одном телефоне. Всё работает без интернета.");
 const progress=storage.getGameData(),main=el(container,"div","game-hub__list");
 const card=(icon,title,description,href)=>{
  const a=el(main,"a","game-hub__card");a.href=href;
  el(a,"span","game-hub__emoji",icon);
  const body=el(a,"span","game-hub__copy");
  el(body,"strong","",title);el(body,"span","",description);
  el(a,"span","game-hub__arrow","›");
 };
 card("🐍","Змейка","Собирай кокосы и побей свой рекорд · 8-битная классика","#/games/snake");
 card("🐠","Рыбка-поглотитель","Ешь маленьких, избегай больших · 60 секунд","#/games/fish");
 card("🃏","Тропическое мемори","Найди восемь пар с островными символами · 4×4","#/games/memory");
 el(container,"h3","game-hub__group","Игры для двоих на одном телефоне");
 card("🟡","Четыре в ряд","По очереди сбрасывайте фишки. Первый с четырьмя подряд побеждает.","#/games/four");
 card("🏒","Аэрохоккей","Играйте одновременно двумя пальцами: синий против кораллового.","#/games/hockey");
 const records=el(container,"section","game-hub__records");
 el(records,"h3","","🏆 Рекорды острова");
 el(records,"p","","🐍 Змейка: "+progress.stats.snakeBest+" очков");
 el(records,"p","","🐠 Рыбка: "+progress.stats.fishBest+" очков");
 el(records,"p","","🃏 Мемори: "+(progress.stats.memoryBest?progress.stats.memoryBest+" попыток":"ещё не сыграно"));
 el(records,"p","","🟡 Четыре в ряд: "+(progress.stats.fourWinsA||0)+" : "+(progress.stats.fourWinsB||0));
 el(records,"p","","🏒 Аэрохоккей: "+(progress.stats.hockeyWinsA||0)+" : "+(progress.stats.hockeyWinsB||0));
 const link=el(container,"a","game-hub__bucket-link","🌴 10 впечатлений на настоящем острове ›");
 link.href="#/must-do";
 el(container,"p","game-hub__note",
  "Игры работают офлайн, рекорды и партия «Четыре в ряд» сохраняются в резервную копию. Для игры вдвоём Bluetooth и два телефона не нужны.");
}
