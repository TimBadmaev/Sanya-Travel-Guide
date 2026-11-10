import { storage } from "../storage.js";
import { TRAVEL_DOCS, LEG_FIELDS, normalizeTravelCenter, addLeg, removeLeg, updateLeg, toggleDoc,
 travelSummary, formatTravelDate } from "../logic/travel-center.js";
import { getTodayIso } from "../logic/trip.js";

function el(parent,tag,cls,text){
 const node=document.createElement(tag);
 if(cls)node.className=cls;
 if(text!==undefined)node.textContent=text;
 parent.appendChild(node);return node;
}
function link(parent,label,href,cls="trip-center__link"){
 const a=el(parent,"a",cls,label);a.href=href;return a;
}
function field(parent,labelText,value,onChange,{type="text",placeholder="",hint="",maxLength=160}={}){
 const wrap=el(parent,"label","trip-center__field");
 el(wrap,"span","trip-center__field-label",labelText);
 const input=el(wrap,type==="textarea"?"textarea":"input","trip-center__input");
 if(type!=="textarea")input.type=type;
 else input.rows=2;
 input.value=value||"";
 input.placeholder=placeholder;
 if(type==="text"||type==="email"||type==="tel"||type==="textarea")input.maxLength=maxLength;
 if(hint)el(wrap,"small","trip-center__field-hint",hint);
 input.addEventListener("change",()=>onChange(input.value));
 return input;
}
function flightCaption(flight,index){
 const route=(flight.from||"Аэропорт вылета")+" → "+(flight.to||"Аэропорт прилёта");
 const timing=flight.date?formatTravelDate(flight.date)+(flight.time?" · "+flight.time:""):"без даты";
 return (index+1)+". "+route+" · "+timing;
}
function flightShare(travel){
 const output=["Мой маршрут — Sanya Travel Guide"];
 const label={outbound:"Туда",inbound:"Обратно"};
 for(const direction of ["outbound","inbound"]){
  output.push("",label[direction]+":");
  if(!travel[direction].length)output.push("Не заполнено");
  for(const flight of travel[direction]){
   output.push("• "+(flight.from||"—")+" → "+(flight.to||"—")+
    " · "+(flight.date?formatTravelDate(flight.date):"дата не указана")+
    (flight.time?" "+flight.time:"")+
    (flight.arrivalDate?" → "+formatTravelDate(flight.arrivalDate):"")+
    (flight.arrivalTime?" "+flight.arrivalTime:"")+
    (flight.flight?" · рейс "+flight.flight:"")+
    (flight.terminalFrom?" · терминал вылета "+flight.terminalFrom:"")+
    (flight.terminalTo?" · терминал прилёта "+flight.terminalTo:""));
  }
 }
 output.push("","Проверь изменения рейсов и терминалов у перевозчика.");
 return output.join("\n");
}
function firstNextFlight(center,today){
 const flights=[...center.outbound,...center.inbound].filter(f=>f.date).sort((a,b)=>
  (a.date+(a.time||"")).localeCompare(b.date+(b.time||"")));
 return flights.find(f=>f.date>=today)||flights.at(-1)||null;
}
function section(parent,title,subtitle){
 const node=el(parent,"section","trip-center__section");
 el(node,"h3","trip-center__section-title",title);
 if(subtitle)el(node,"p","trip-center__section-subtitle",subtitle);
 return node;
}
export function renderTravelCenter(container,ctx){
 container.replaceChildren();
 const existing=storage.getTrip();
 let saved=storage.getTravelCenter();
 const back=link(container,"← На главную","#/","place-detail__back");
 back.addEventListener("click",e=>{e.preventDefault();ctx.back("#/");});
 const hero=el(container,"header","trip-center__hero");
 el(hero,"span","trip-center__eyebrow","✈️ ВСЁ ДЛЯ ПОЕЗДКИ");
 el(hero,"h2","trip-center__title","Моя поездка");
 el(hero,"p","trip-center__intro","Перелёты, пересадки, отель и документы — под рукой даже без интернета.");
 const heroStats=el(hero,"div","trip-center__stats");
 const totalLegs=el(heroStats,"span","trip-center__stat","");
 const totalDocs=el(heroStats,"span","trip-center__stat","");
 const departure=el(hero,"p","trip-center__departure","");
 const saveNotice=el(container,"p","trip-center__notice","");
 saveNotice.setAttribute("role","status");
 const privacy=el(container,"p","trip-center__privacy",
  "🔒 Данные остаются в памяти этого устройства и включаются в резервную копию. Не вводи номера паспортов, банковских карт и пароли. Код бронирования необязателен. Не публикуй личную копию JSON.");
 function updateSummary(){
  const sum=travelSummary(saved);
  totalLegs.textContent="✈️ "+sum.legs+" "+(sum.legs===1?"перелёт":sum.legs>=2&&sum.legs<=4?"перелёта":"перелётов");
  totalDocs.textContent="📄 "+sum.documentsSaved+"/"+sum.totalDocuments+" документов отмечено";
  const next=firstNextFlight(saved,getTodayIso());
  departure.textContent=next?
    "В маршруте: "+(next.from||"Аэропорт отправления")+" → "+(next.to||"Аэропорт прибытия")+
    " · "+formatTravelDate(next.date)+(next.time?" · "+next.time:""):
    "Пока нет дат перелётов. Добавь их из билетов, не полагаясь на догадки.";
 }
 function save(next){
  if(!storage.setTravelCenter(next)){
   saveNotice.textContent="Не удалось сохранить. Проверь свободную память и доступ к хранилищу.";
   return false;
  }
  saved=normalizeTravelCenter(next);saveNotice.textContent="✓ Сохранено на этом устройстве";
  updateSummary();
  return true;
 }
 const actions=el(container,"nav","trip-center__actions");
 actions.setAttribute("aria-label","Быстрые действия в поездке");
 for(const [icon,label,href] of [
  ["🏨","Адрес таксисту",existing.home?.addressZh?"#/handy/taxi":"#/settings?section=home"],
  ["🀄","Китайские фразы","#/handy"],
  ["🗺️","Карта Саньи","#/map"],
  ["🆘","Помощь и телефоны","#/handy"],
  ["📶","Офлайн-проверка","#/offline"],
  ["💰","Расходы","#/expenses"]
 ]){
  const a=link(actions,icon+" "+label,href,"trip-center__action");
  a.setAttribute("aria-label",label);
 }
 const routes=section(container,"✈️ Перелёты и пересадки",
  "Каждый авиарейс — отдельный участок. Указывай время по местным часам аэропорта; приложение не пересчитывает часовые пояса и не проверяет изменения расписания.");
 for(const [side,title] of [["outbound","Туда"],["inbound","Обратно"]]){
  const group=el(routes,"div","trip-center__flight-group");
  const row=el(group,"div","trip-center__flight-head");
  el(row,"h4","",title);
  const addButton=el(row,"button","btn btn--secondary trip-center__add","＋ Добавить рейс");
  addButton.type="button";
  const list=el(group,"div","trip-center__flight-list");
  const message=el(group,"p","trip-center__micro","");
  function renderGroup(){
   list.replaceChildren();
   addButton.disabled=saved[side].length>=6;
   if(!saved[side].length)el(list,"p","trip-center__empty","Рейсы пока не добавлены.");
   saved[side].forEach((flight,index)=>{
    const details=el(list,"details","trip-center__flight");
    const summary=el(details,"summary","trip-center__flight-summary",flightCaption(flight,index));
    const form=el(details,"div","trip-center__flight-fields");
    for(const [key,label] of LEG_FIELDS){
     let type="text",hint="",length=100;
     if(key==="date"||key==="arrivalDate")type="date";
     if(key==="time"||key==="arrivalTime")type="time";
     if(key==="note"){type="textarea";length=220;}
     if(key==="booking"){
      length=36;hint="Необязательно: код бронирования попадёт в экспорт данных.";
     }
     field(form,label,flight[key],value=>{
      const next=updateLeg(saved,side,flight.id,{[key]:value});
      if(save(next))summary.textContent=flightCaption(next[side].find(x=>x.id===flight.id),index);
     },{type,maxLength:length,hint});
    }
    const remove=el(form,"button","trip-center__remove","Удалить этот рейс");
    remove.type="button";
    remove.addEventListener("click",()=>{
     if(!window.confirm("Удалить этот участок маршрута?"))return;
     const next=removeLeg(saved,side,flight.id);
     if(save(next))renderGroup();
    });
   });
   message.textContent="Добавлено "+saved[side].length+" из 6 участков.";
  }
  addButton.addEventListener("click",()=>{
   const id="leg-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,10);
   const next=addLeg(saved,side,id);
   if(save(next)){
    renderGroup();
    const last=list.lastElementChild;
    if(last?.tagName==="DETAILS"){
     last.open=true;
     last.querySelector("input")?.focus();
    }
   }
  });
  renderGroup();
 }
 const shareRow=el(routes,"div","trip-center__share");
 const copy=el(shareRow,"button","btn btn--secondary","📋 Скопировать маршрут");
 copy.type="button";copy.addEventListener("click",async()=>{
  try{
   if(!navigator.clipboard?.writeText)throw Error("clipboard unsupported");
   await navigator.clipboard.writeText(flightShare(saved));
   saveNotice.textContent="✓ Маршрут скопирован без кодов бронирований.";
  }catch{saveNotice.textContent="Не удалось скопировать. Открой приложение по HTTPS и попробуй снова.";}
 });
 el(shareRow,"p","trip-center__micro",
  "Скопированный маршрут не включает коды бронирований. Проверь реальные терминалы, изменения рейсов и требования к транзиту у авиакомпании.");
 const hotel=section(container,"🏨 Мой отель и контакты",
  "Китайский адрес редактируется в существующих настройках. Здесь — дополнительные данные бронирования и контакты.");
 const address=el(hotel,"div","trip-center__address");
 const zh=existing.home?.addressZh;
 if(zh){
  el(address,"strong","",existing.home.nameRu||"Мой отель");
  el(address,"p","trip-center__zh",zh).lang="zh-CN";
  link(address,"📱 Показать таксисту крупно","#/handy/taxi","btn btn--primary");
 }else{
  el(address,"p","","Китайский адрес ещё не указан.");
  link(address,"＋ Добавить адрес на китайском","#/settings?section=home","btn btn--primary");
 }
 const hotelFields=el(hotel,"div","trip-center__hotel-fields");
 const hotelSpecs=[
  ["name","Название отеля","text","На языке бронирования"],
  ["checkin","Заселение","date",""],
  ["checkout","Выезд","date",""],
  ["phone","Телефон отеля","tel","С кодом страны"],
  ["email","Email отеля","email",""],
  ["booking","Номер бронирования отеля","text","Необязательно, хранится локально"],
  ["contactName","Контакт принимающей стороны","text","Имя или название компании"],
  ["contactPhone","Телефон принимающей стороны","tel","С кодом страны"]
 ];
 const contactActions=el(hotel,"div","trip-center__contacts");
 function refreshContacts(){
  contactActions.replaceChildren();
  const entries=[["Позвонить в отель",saved.hotel.phone],["Связаться с принимающей стороной",saved.hotel.contactPhone]];
  for(const [label,phone] of entries){
   const normalized=phone.replace(/[\s()-]/g,"");
   if(!/^\+?[0-9]{6,17}$/.test(normalized))continue;
   link(contactActions,"📞 "+label,"tel:"+normalized,"trip-center__contact");
  }
  const email=saved.hotel.email.trim();
  if(/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){
   link(contactActions,"✉️ Написать отелю","mailto:"+encodeURIComponent(email),"trip-center__contact");
  }
 }
 for(const [key,label,type,hint] of hotelSpecs){
  field(hotelFields,label,saved.hotel[key],value=>{
   if(save({...saved,hotel:{...saved.hotel,[key]:value}}))refreshContacts();
  },{type,hint,maxLength:key==="email"?160:90});
 }
 refreshContacts();
 const documents=section(container,"📄 Документы и копии",
  "Отмечай то, что ты самостоятельно сохранил в телефоне или распечатал. Галочки не означают, что файлы загружены внутрь Sanya Guide.");
 const list=el(documents,"div","trip-center__docs");
 const count=el(documents,"p","trip-center__documents-status","");
 count.setAttribute("role","status");
 const docRows=[];
 for(const doc of TRAVEL_DOCS){
  const row=el(list,"div","trip-center__doc");
  const intro=el(row,"div","trip-center__doc-intro");
  el(intro,"strong","",doc.name);
  el(intro,"span","",doc.tip);
  const checks=el(row,"div","trip-center__doc-checks");
  const controls={};
  for(const [kind,label] of [["offline","Есть офлайн"],["printed","Распечатано"]]){
   const wrap=el(checks,"label","trip-center__check");
   const input=el(wrap,"input");input.type="checkbox";
   el(wrap,"span","",label);
   input.addEventListener("change",()=>{
    const next=toggleDoc(saved,doc.id,kind,input.checked);
    if(!save(next)){input.checked=!input.checked;return;}
    updateDocProgress();
   });
   controls[kind]=input;
  }
  docRows.push({doc,controls});
 }
 function updateDocProgress(){
  const sum=travelSummary(saved);
  count.textContent="Отмечено для офлайн-доступа: "+sum.documentsSaved+" из "+sum.totalDocuments+
   " · Распечатано: "+sum.documentsPrinted+".";
  for(const {doc,controls} of docRows){
   controls.offline.checked=!!saved.docs[doc.id]?.offline;
   controls.printed.checked=!!saved.docs[doc.id]?.printed;
  }
 }
 updateDocProgress();
 const caveat=el(documents,"p","trip-center__privacy-note",
  "Документы храни отдельно в приложении «Файлы» и, при необходимости, на бумаге. Не загружай в публичный GitHub-репозиторий паспорт, страховку или билеты. Доступность Arrival Card, визы и условия транзита перепроверяй в официальных источниках.");
 const footer=el(container,"footer","trip-center__footer");
 link(footer,"💾 Сохранить резервную копию маршрута и настроек","#/data","btn btn--secondary");
 link(footer,"📅 Открыть план прогулок","#/plan","btn btn--secondary");
 updateSummary();
}
