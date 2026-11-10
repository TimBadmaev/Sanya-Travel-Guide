// v39 Travel Center: plain, verified user-entered itinerary metadata only.
// Never store document scans, passport numbers, passwords or payment details.
export const TRAVEL_DOCS = Object.freeze([
 {id:"passport",name:"Загранпаспорт и копия",tip:"Оригинал — с собой, копию храни отдельно."},
 {id:"tickets",name:"Авиабилеты туда и обратно",tip:"Маршрут-квитанции и коды бронирований — офлайн."},
 {id:"hotel",name:"Ваучер отеля",tip:"Название, даты, адрес и контакт гостиницы."},
 {id:"insurance",name:"Страховой полис и контакты ассистанса",tip:"Проверь условия и телефон поддержки."},
 {id:"arrival",name:"Arrival Card / подтверждение въезда",tip:"Проверь актуальные требования перед вылетом."},
 {id:"transfers",name:"Пересадки и терминалы",tip:"Маршрут и время стыковок — отдельно по каждому рейсу."},
 {id:"operator",name:"Контакты принимающей стороны",tip:"Телефон и электронная почта на случай изменений."},
 {id:"address",name:"Адрес отеля на китайском",tip:"Открой крупным текстом для таксиста."}
]);
const DOC_IDS=new Set(TRAVEL_DOCS.map(d=>d.id));
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const TIME=/^([01]\d|2[0-3]):[0-5]\d$/;
export function validDate(s){
 if(typeof s!=="string"||!DATE.test(s))return false;
 const [y,m,d]=s.split("-").map(Number),v=new Date(Date.UTC(y,m-1,d));
 return v.getUTCFullYear()===y&&v.getUTCMonth()===m-1&&v.getUTCDate()===d;
}
function short(value,limit=120){
 return typeof value==="string"?value.trim().slice(0,limit):"";
}
function date(value){return validDate(value)?value:"";}
function time(value){return typeof value==="string"&&TIME.test(value)?value:"";}
export const LEG_FIELDS=Object.freeze([
 ["from","Аэропорт отправления"],["to","Аэропорт прибытия"],
 ["date","Дата вылета"],["time","Время вылета"],
 ["arrivalDate","Дата прилёта"],["arrivalTime","Время прилёта"],
 ["flight","Номер рейса"],["airline","Авиакомпания"],
 ["terminalFrom","Терминал вылета"],["terminalTo","Терминал прилёта"],
 ["booking","Код бронирования"],["note","Примечание"]
]);
export function normalizeFlight(raw){
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return null;
 const result={id:short(raw.id,64)};
 if(!result.id)return null;
 for(const [name] of LEG_FIELDS){
  result[name]=name==="date"||name==="arrivalDate"?date(raw[name]):
   name==="time"||name==="arrivalTime"?time(raw[name]):
   short(raw[name],name==="note"?220:name==="booking"?36:90);
 }
 return result;
}
function normalizeFlights(value){
 if(!Array.isArray(value))return [];
 const seen=new Set(),out=[];
 for(const raw of value){
  const item=normalizeFlight(raw);
  if(!item||seen.has(item.id))continue;
  seen.add(item.id);out.push(item);
  if(out.length===6)break;
 }
 return out;
}
const HOTEL_FIELDS=["name","phone","email","booking","contactName","contactPhone"];
function normalizeHotel(value){
 const raw=value&&typeof value==="object"&&!Array.isArray(value)?value:{};
 const out={};
 for(const field of HOTEL_FIELDS)out[field]=short(raw[field],field==="email"?160:90);
 out.checkin=date(raw.checkin);out.checkout=date(raw.checkout);
 if(out.checkin&&out.checkout&&out.checkout<out.checkin)out.checkout="";
 return out;
}
export function normalizeTravelCenter(value){
 const raw=value&&typeof value==="object"&&!Array.isArray(value)?value:{};
 const docs={};
 if(raw.docs&&typeof raw.docs==="object"&&!Array.isArray(raw.docs)){
  for(const [id,state] of Object.entries(raw.docs)){
   if(!DOC_IDS.has(id)||!state||typeof state!=="object"||Array.isArray(state))continue;
   docs[id]={offline:state.offline===true,printed:state.printed===true};
  }
 }
 return {
  v:1,
  outbound:normalizeFlights(raw.outbound),
  inbound:normalizeFlights(raw.inbound),
  hotel:normalizeHotel(raw.hotel),
  docs,
 };
}
export function travelSummary(state){
 const x=normalizeTravelCenter(state);
 const docCount=TRAVEL_DOCS.filter(d=>x.docs[d.id]?.offline).length;
 const paperCount=TRAVEL_DOCS.filter(d=>x.docs[d.id]?.printed).length;
 const legCount=x.outbound.length+x.inbound.length;
 return {legs:legCount,documentsSaved:docCount,documentsPrinted:paperCount,totalDocuments:TRAVEL_DOCS.length,
  hotelReady:Boolean(x.hotel.name||x.hotel.phone||x.hotel.email)};
}
export function updateLeg(state,side,id,patch){
 const s=normalizeTravelCenter(state);
 if(!["outbound","inbound"].includes(side))return s;
 s[side]=s[side].map(f=>f.id===id?normalizeFlight({...f,...patch,id}):f);
 return s;
}
export function addLeg(state,side,id){
 const s=normalizeTravelCenter(state);
 if(!["outbound","inbound"].includes(side)||s[side].length>=6||!id)return s;
 if(s.outbound.some(f=>f.id===id)||s.inbound.some(f=>f.id===id))return s;
 s[side].push(normalizeFlight({id}));
 return s;
}
export function removeLeg(state,side,id){
 const s=normalizeTravelCenter(state);
 if(!["outbound","inbound"].includes(side))return s;
 s[side]=s[side].filter(f=>f.id!==id);
 return s;
}
export function toggleDoc(state,id,kind,checked){
 const s=normalizeTravelCenter(state);
 if(!DOC_IDS.has(id)||!["offline","printed"].includes(kind))return s;
 s.docs[id]={...s.docs[id],offline:s.docs[id]?.offline===true,printed:s.docs[id]?.printed===true,[kind]:checked===true};
 return s;
}
export function formatTravelDate(value){
 if(!validDate(value))return "Дата не указана";
 const [y,m,d]=value.split("-");
 return d+"."+m+"."+y;
}
