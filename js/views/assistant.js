import {loadPlaces,loadFood,loadExcursions,loadInfo,loadPhrases,loadErrorMessage} from "../data.js";
import {storage} from "../storage.js";
import {SEARCH_KINDS,buildSearchIndex,searchCatalog} from "../logic/search.js";

function el(parent,tag,cls,txt){
 const n=document.createElement(tag);if(cls)n.className=cls;
 if(txt!==undefined)n.textContent=txt;parent.appendChild(n);return n;
}
function quick(parent,icon,title,desc,href){
 const a=el(parent,"a","assistant-hub__action");
 a.href=href;
 el(a,"span","assistant-hub__action-icon",icon);
 const text=el(a,"span","assistant-hub__action-body");
 el(text,"strong","",title);el(text,"span","",desc);
 return a;
}
export async function renderAssistant(container,ctx){
 container.replaceChildren();
 const hero=el(container,"section","assistant-hub__hero");
 el(hero,"span","assistant-hub__eyebrow","🧭 ПОМОЩНИК В ПУТЕШЕСТВИИ");
 el(hero,"h2","assistant-hub__title","Что ищем?");
 el(hero,"p","assistant-hub__lead",
  "Места, еда, экскурсии, китайские фразы и справка — в одном поиске. Всё работает по сохранённым данным, даже без интернета.");
 const searchWrap=el(hero,"div","assistant-hub__search-wrap");
 const input=el(searchWrap,"input","assistant-hub__search");
 input.type="search";input.autocomplete="off";input.enterKeyHint="search";
 input.setAttribute("aria-label","Поиск по всему путеводителю");
 input.placeholder="Например: пляж, кокос, такси…";
 input.value=(ctx.query.get("q")||"").slice(0,120);
 const clear=el(searchWrap,"button","assistant-hub__clear","✕");
 clear.type="button";clear.setAttribute("aria-label","Очистить поиск");
 clear.hidden=!input.value;
 const presets=el(hero,"div","assistant-hub__presets");
 for(const query of ["пляж","кокос","такси","помощь"]){
  const b=el(presets,"button","assistant-hub__preset",query);
  b.type="button";b.addEventListener("click",()=>{input.value=query;refresh();input.focus();});
 }
 const actTitle=el(container,"h3","assistant-hub__section-title","⚡ Быстрые действия");
 const actions=el(container,"nav","assistant-hub__actions");
 actions.setAttribute("aria-label","Быстрые действия");
 const home=storage.getTrip().home;
 quick(actions,"🏨","В мой отель",home?.addressZh?"Показать адрес на китайском":"Сохранить адрес отеля",
  home?.addressZh?"#/handy/taxi":"#/settings?section=home");
 quick(actions,"🀄","Китайские фразы","Показать собеседнику","#/handy");
 quick(actions,"🆘","Нужна помощь","Контакты и телефоны","#/handy");
 quick(actions,"🗺️","Офлайн-карта","Улицы и маршруты","#/map");
 quick(actions,"🍜","Где поесть","Кафе и фудкорты","#/places?mode=food");
 quick(actions,"✈️","Моя поездка","Перелёты и документы","#/my-trip");
 const guide=el(container,"a","assistant-hub__guide-link");
 guide.href="#/arrival-24h";
 el(guide,"span","assistant-hub__guide-emoji","🛬");
 const guideText=el(guide,"span","assistant-hub__guide-text");
 el(guideText,"strong","","Первые 24 часа в Китае");
 el(guideText,"span","","От аэропорта до отеля · интерактивная памятка");
 el(guide,"span","assistant-hub__guide-chevron","›");
 const head=el(container,"div","assistant-hub__result-head");
 const title=el(head,"h3","assistant-hub__section-title","Результаты поиска");
 const count=el(head,"span","assistant-hub__count","");
 const filters=el(container,"div","assistant-hub__filters");
 filters.setAttribute("role","group");filters.setAttribute("aria-label","Категории поиска");
 const results=el(container,"div","assistant-hub__results");
 results.setAttribute("aria-live","polite");
 let catalog=[],active="all",loadError=null;
 const chips=SEARCH_KINDS.map(k=>{
  const b=el(filters,"button","assistant-hub__chip",k.name);
  b.type="button";b.dataset.kind=k.id;
  b.setAttribute("aria-pressed",String(k.id===active));
  b.addEventListener("click",()=>{
   active=k.id;
   for(const chip of chips)chip.setAttribute("aria-pressed",String(chip.dataset.kind===active));
   refresh();
  });return b;
 });
 function refresh(){
  clear.hidden=!input.value;
  results.replaceChildren();
  const q=input.value.trim();
  if(loadError){
   count.textContent="";
   el(results,"p","assistant-hub__empty",loadError);
   return;
  }
  if(!q){
   count.textContent="";
   el(results,"p","assistant-hub__empty","Введи слово или выбери подсказку. Поиск не отправляет запросы в интернет.");
   return;
  }
  const found=searchCatalog(catalog,q,{kind:active,limit:40});
  count.textContent="Найдено: "+found.length+(found.length===40?"+":"");
  if(!found.length){
   el(results,"p","assistant-hub__empty",
    "Ничего не нашли. Попробуй другое слово или категорию.");
   return;
  }
  for(const entry of found){
   const card=el(results,"a","assistant-hub__result");
   card.href=entry.href;
   el(card,"span","assistant-hub__result-icon",entry.icon);
   const body=el(card,"span","assistant-hub__result-body");
   el(body,"strong","",entry.title);
   const meta=SEARCH_KINDS.find(k=>k.id===entry.kind)?.name||"";
   const desc=entry.description.length>145?entry.description.slice(0,145)+"…":entry.description;
   el(body,"span","",meta+(desc?" · "+desc:""));
   el(card,"span","assistant-hub__result-chevron","›");
  }
 }
 input.addEventListener("input",refresh);
 input.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();input.blur();}});
 clear.addEventListener("click",()=>{input.value="";refresh();input.focus();});
 el(results,"p","assistant-hub__empty","Загружаем сохранённые материалы…");
 try{
  const [places,food,excursions,info,phrases]=await Promise.all([
   loadPlaces(),loadFood(),loadExcursions(),loadInfo(),loadPhrases()
  ]);
  if(!ctx.isCurrent())return;
  catalog=buildSearchIndex({places,food,excursions,info,phrases});
  refresh();
 }catch(error){
  if(!ctx.isCurrent())return;
  loadError=loadErrorMessage(error);
  refresh();
  const retry=el(results,"button","btn btn--secondary","Повторить загрузку");
  retry.type="button";retry.addEventListener("click",()=>renderAssistant(container,ctx));
 }
}
