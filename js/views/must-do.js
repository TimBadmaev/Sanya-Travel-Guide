import { storage } from "../storage.js";
import { MUST_DO_ITEMS,MUST_DO_SOURCE,mustDoSummary,toggleMustDo } from "../logic/must-do.js";
const el=(p,tag,cls,text)=>{
 const e=document.createElement(tag);if(cls)e.className=cls;
 if(text!==undefined)e.textContent=text;p.appendChild(e);return e;
};
export function renderMustDo(container,ctx){
 container.replaceChildren();
 const back=el(container,"a","place-detail__back","← К открытиям");back.href="#/discover";
 back.addEventListener("click",e=>{e.preventDefault();ctx.back("#/discover");});
 const hero=el(container,"section","mustdo-hero");
 el(hero,"span","mustdo-hero__kicker","🦀 КРАБ РЕКОМЕНДУЕТ");
 el(hero,"h2","mustdo-hero__title","10 вещей, которые стоит попробовать на Хайнане");
 el(hero,"p","mustdo-hero__subtitle",
  "Необязательные, но очень хайнаньские впечатления. Делай в любом порядке — отпуск не экзамен, даже если краб уже подготовил зачётку.");
 const summary=el(hero,"div","mustdo-hero__summary");
 const counter=el(summary,"strong","","");
 const bar=el(summary,"div","mustdo-hero__bar");
 bar.setAttribute("role","progressbar");bar.setAttribute("aria-valuemin","0");
 bar.setAttribute("aria-valuemax","10");bar.setAttribute("aria-label","Впечатления Хайнаня");
 const fill=el(bar,"span","","");
 const slogan=el(hero,"p","mustdo-hero__slogan","");
 const picker=el(hero,"button","btn btn--secondary mustdo-hero__picker","🎲 Подкинь идею на сегодня");
 picker.type="button";
 const filter=el(hero,"label","mustdo-hero__filter");
 const filterInput=el(filter,"input","");filterInput.type="checkbox";
 el(filter,"span","","Показывать только невыполненное");
 const list=el(container,"div","mustdo-list");
 const rows=[];
 MUST_DO_ITEMS.forEach((item,index)=>{
  const card=el(list,"article","mustdo-card");card.tabIndex=-1;
  const top=el(card,"div","mustdo-card__top");
  const marker=el(top,"span","mustdo-card__emoji",item.icon);
  const h=el(top,"div","mustdo-card__heading");
  el(h,"span","mustdo-card__category",(index+1)+" / 10 · "+item.category);
  el(h,"h3","mustdo-card__title",item.title);
  const label=el(card,"label","mustdo-card__check");
  const input=el(label,"input","");input.type="checkbox";
  input.setAttribute("aria-label","Выполнено: "+item.title);
  el(label,"span","","Сделано! Отметить впечатление");
  el(card,"p","mustdo-card__description",item.description);
  el(card,"p","mustdo-card__effort",item.effort);
  el(card,"p","mustdo-card__tip","💡 "+item.tip);
  el(card,"p","mustdo-card__joke","🦀 "+item.joke);
  const detail=el(card,"a","mustdo-card__detail","Подробнее ›");detail.href=item.href;
  rows.push({card,input,item});
  input.addEventListener("change",()=>{
   const next=toggleMustDo(storage.getMustDo(),item.id,input.checked);
   if(!storage.setMustDo(next)){
    input.checked=!input.checked;
    notice.textContent="Не удалось сохранить отметку. Проверь память браузера.";
    return;
   }
   notice.textContent="";refresh();
  });
 });
 const footer=el(container,"section","mustdo-footer");
 el(footer,"p","","Источник идей: туристический совет Саньи. Описания и шутки адаптированы для путеводителя. Данные о погоде, часах и ценах могут измениться.");
 const link=el(footer,"a","mustdo-footer__source","Первоисточник: 30 идей для Саньи ↗");
 link.href=MUST_DO_SOURCE;link.target="_blank";link.rel="noopener noreferrer";
 const buttons=el(footer,"div","mustdo-footer__actions");
 const share=el(buttons,"button","btn btn--primary","📋 Скопировать мой список");share.type="button";
 const clear=el(buttons,"button","btn btn--secondary","↻ Снять отметки");clear.type="button";
 const notice=el(footer,"p","mustdo-footer__notice","");notice.setAttribute("role","status");
 share.addEventListener("click",async()=>{
  const ids=new Set(storage.getMustDo().done);
  const text=["Мои 10 впечатлений Хайнаня",...MUST_DO_ITEMS.map((x,i)=>
   (ids.has(x.id)?"☑ ":"☐ ")+(i+1)+". "+x.title)].join("\n");
  try{
   await navigator.clipboard.writeText(text);
   notice.textContent="Список скопирован — можно отправить попутчику.";
  }catch{notice.textContent="Копирование недоступно. Попробуй открыть страницу через HTTPS.";}
 });
 picker.addEventListener("click",()=>{
  const undone=rows.filter(row=>!storage.getMustDo().done.includes(row.item.id));
  const choices=undone.length?undone:rows;
  const chosen=choices[Math.floor(Math.random()*choices.length)];
  rows.forEach(row=>row.card.classList.toggle("is-featured",row===chosen));
  chosen.card.hidden=false;
  chosen.card.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"center"});
  chosen.card.focus({preventScroll:true});
  notice.textContent="Подсказка от краба: "+chosen.item.title+". Но отдыхать тоже можно!";
 });
 filterInput.addEventListener("change",refresh);
 clear.addEventListener("click",()=>{
  if(!storage.getMustDo().done.length)return;
  if(!window.confirm("Снять все отметки в списке впечатлений?"))return;
  if(storage.setMustDo({v:1,done:[]})){notice.textContent="Отметки очищены.";refresh();}
  else notice.textContent="Не удалось обновить отметки.";
 });
 function refresh(){
  const done=new Set(storage.getMustDo().done);
  const progress=mustDoSummary(storage.getMustDo());
  counter.textContent=progress.done+" / "+progress.total+" впечатлений";
  bar.setAttribute("aria-valuenow",String(progress.done));
  fill.style.width=progress.percent+"%";
  slogan.textContent=progress.done===10?
   "🏆 Легенда Хайнаня! Теперь можно заслуженно ничего не делать.":
   progress.done>=5?"🌴 Уже есть что вспомнить. Остальное — только если хочется.":
   "🏖️ Даже один пункт — уже хорошее начало отпуска.";
  for(const row of rows){
   row.input.checked=done.has(row.item.id);
   row.card.classList.toggle("is-done",row.input.checked);
   row.card.hidden=filterInput.checked&&row.input.checked;
  }
  clear.disabled=progress.done===0;
 }
 refresh();
}
