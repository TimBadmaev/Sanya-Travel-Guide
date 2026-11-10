import {storage} from "../storage.js";
import {ARRIVAL_STAGES,ARRIVAL_STEPS,arrivalProgress,setArrivalStep} from "../logic/arrival.js";
const el=(parent,tag,cls,content)=>{
 const item=document.createElement(tag);if(cls)item.className=cls;
 if(content!==undefined)item.textContent=content;
 parent.appendChild(item);return item;
};
export function renderArrivalGuide(container,ctx){
 container.replaceChildren();
 const back=el(container,"a","place-detail__back","← К помощнику");
 back.href="#/assistant";back.addEventListener("click",e=>{e.preventDefault();ctx.back("#/assistant");});
 const hero=el(container,"section","assistant-arrival__hero");
 el(hero,"span","assistant-arrival__kicker","🛬 ПЕРВЫЙ ДЕНЬ В КИТАЕ");
 el(hero,"h2","assistant-arrival__title","Первые 24 часа");
 el(hero,"p","assistant-arrival__intro",
  "От аэропорта до первого вечера. Это памятка, а не строгий график: отмечай выполненное и пропускай то, что к твоему маршруту не относится.");
 const stat=el(hero,"strong","assistant-arrival__stat","");
 const meter=el(hero,"div","assistant-arrival__meter");
 meter.setAttribute("role","progressbar");meter.setAttribute("aria-label","Готовность к первому дню");
 meter.setAttribute("aria-valuemin","0");meter.setAttribute("aria-valuemax",String(ARRIVAL_STEPS.length));
 const fill=el(meter,"span","");
 const notice=el(container,"p","assistant-arrival__notice","");
 notice.setAttribute("role","status");
 const sections=el(container,"div","assistant-arrival__groups");
 let state=storage.getArrival();
 const controls=[];
 for(const stage of ARRIVAL_STAGES){
  const section=el(sections,"section","assistant-arrival__section");
  el(section,"h3","assistant-arrival__group-title",stage.icon+" "+stage.label);
  for(const step of ARRIVAL_STEPS.filter(x=>x.stage===stage.id)){
   const card=el(section,"article","assistant-arrival__step");
   const label=el(card,"label","assistant-arrival__check");
   const checkbox=el(label,"input");
   checkbox.type="checkbox";
   checkbox.setAttribute("aria-label","Выполнено: "+step.title);
   const span=el(label,"span","",step.title);
   el(card,"p","assistant-arrival__detail",step.details);
   const link=el(card,"a","assistant-arrival__link",step.label+" ›");
   link.href=step.id==="transport"&&!storage.getTrip().home?.addressZh?
    "#/settings?section=home":step.link;
   if(step.source){
    const source=el(card,"a","assistant-arrival__source","Официальный источник ↗");
    source.href=step.source;source.target="_blank";source.rel="noopener noreferrer";
   }
   controls.push({checkbox,step,card});
   checkbox.addEventListener("change",()=>{
    const next=setArrivalStep(state,step.id,checkbox.checked);
    if(!storage.setArrival(next)){
     checkbox.checked=!checkbox.checked;
     notice.textContent="Не удалось сохранить. Проверь память устройства.";
     return;
    }
    state=next;notice.textContent="✓ Сохранено только на этом устройстве";refresh();
   });
  }
 }
 const foot=el(container,"section","assistant-arrival__footer");
 el(foot,"h3","","📱 Проверка двух телефонов");
 el(foot,"p","","На каждом телефоне отдельно: открой Sanya Guide с интернетом, дождись офлайн-кэша, проверь скачанные аудио и подробные карты. Затем включи авиарежим и попробуй открыть «Мою поездку», адрес отеля и эту памятку. После проверки выключи авиарежим.");
 const actions=el(foot,"div","assistant-arrival__foot-actions");
 const check=el(actions,"a","btn btn--primary","📶 Проверить этот телефон");check.href="#/offline";
 const backup=el(actions,"a","btn btn--secondary","💾 Экспортировать данные");backup.href="#/data";
 el(foot,"p","assistant-arrival__caveat",
  "Отметки и файлы хранятся отдельно на каждом телефоне. Для переноса данных используй резервную копию — она может содержать личные контакты и коды бронирований. Проверь актуальные правила въезда, стыковок и поездок перед выездом.");
 function refresh(){
  const done=new Set(state.done),prog=arrivalProgress(state);
  stat.textContent=prog.done+" / "+prog.total+" шагов";
  meter.setAttribute("aria-valuenow",String(prog.done));
  fill.style.width=prog.percent+"%";
  for(const {checkbox,step,card} of controls){
   checkbox.checked=done.has(step.id);
   card.classList.toggle("is-done",checkbox.checked);
  }
 }
 refresh();
}
