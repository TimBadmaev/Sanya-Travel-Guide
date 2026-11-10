// The first-day guide contains only travel tips, not real-time promises.
export const ARRIVAL_STAGES=Object.freeze([
 {id:"before",label:"До вылета",icon:"🧳"},
 {id:"landing",label:"После посадки",icon:"🛬"},
 {id:"transfer",label:"Дорога к отелю",icon:"🚕"},
 {id:"evening",label:"Первый вечер",icon:"🌴"}
]);
export const ARRIVAL_STEPS=Object.freeze([
 {id:"documents",stage:"before",title:"Билеты, ваучер, страховка и контакты — офлайн",
  details:"Проверь сохранённые на телефоне документы, реальный маршрут с пересадками и местное время каждого рейса. Не полагайся на интернет в аэропорту.",
  link:"#/my-trip",label:"Моя поездка"},
 {id:"arrival-card",stage:"before",title:"Проверь необходимость Arrival Card",
  details:"При необходимости заполни въездную карту заранее только на официальном бесплатном сервисе NIA. Существуют исключения; если не заполнил онлайн, в аэропорту могут быть терминалы и бумажные бланки.",
  link:"#/info/arrival-card",label:"Правила и официальная ссылка",
  source:"https://en.nia.gov.cn/n147418/n147463/c191530/content.html"},
 {id:"offline",stage:"before",title:"Проверь оба телефона в авиарежиме",
  details:"На каждом телефоне отдельно открой приложение с сетью, скачай нужные аудиогиды и подробные карты, а затем выключи интернет и убедись, что адрес отеля, справочник и карты открываются. Данные между телефонами сами не синхронизируются.",
  link:"#/offline",label:"Проверить сохранённые файлы"},
 {id:"passport",stage:"landing",title:"Пройди контроль и забери багаж",
  details:"Подготовь оригинал паспорта и документы по запросу. Следуй указателям аэропорта и инструкциям сотрудников. Правила въезда и пересадок уточняй по официальным источникам.",
  link:"#/info/visa-entry",label:"Въезд и документы"},
 {id:"internet",stage:"landing",title:"Убедись, что есть связь и способ оплаты",
  details:"Проверь подключение к сети, роуминг/eSIM и работу приложения оплаты. Не открывай неизвестные QR-коды и не вводи платёжные данные на чужих сайтах.",
  link:"#/info/connectivity",label:"Связь в Китае"},
 {id:"transport",stage:"transfer",title:"Покажи водителю адрес отеля по-китайски",
  details:"Открой сохранённый китайский адрес крупно. Для такси и заказа поездки используй доступные официальные каналы; цены и места посадки уточняй на месте. У некоторых отелей есть трансфер.",
  link:"#/handy/taxi",label:"Адрес для таксиста",
  source:"https://www.visitsanya.com/planning/travel-guide/getting-there-around/taxis-ride-hailing-services"},
 {id:"checkin",stage:"transfer",title:"Заселись и сохрани обратный маршрут",
  details:"Уточни на стойке регистрации время завтраков, условия проживания и дорогу обратно в аэропорт. Контакт и адрес гостиницы проверь в «Моей поездке».",
  link:"#/my-trip",label:"Контакты отеля"},
 {id:"dinner",stage:"evening",title:"Найди простой ужин и проверь стоимость",
  details:"Начни с ближайших кафе и кокосовой курицы. Уточни стоимость до заказа, а при морепродуктах — цену за вес и приготовление. Береги силы после перелёта.",
  link:"#/places?mode=food",label:"Где поесть"},
 {id:"return",stage:"evening",title:"Проверь путь назад и план на завтра",
  details:"Сохрани адрес гостиницы для такси, посмотри план следующего дня и не перегружай первый вечер экскурсиями.",
  link:"#/plan",label:"Мой план"}
]);
const VALID_IDS=new Set(ARRIVAL_STEPS.map(x=>x.id));
export function normalizeArrival(value){
 const raw=value&&typeof value==="object"&&!Array.isArray(value)?value:{};
 const items=Array.isArray(raw.done)?raw.done:[];
 return {v:1,done:[...new Set(items.filter(id=>typeof id==="string"&&VALID_IDS.has(id)))].slice(0,ARRIVAL_STEPS.length)};
}
export function setArrivalStep(state,id,done){
 const s=normalizeArrival(state);
 if(!VALID_IDS.has(id))return s;
 return normalizeArrival({done:done?[...s.done,id]:s.done.filter(x=>x!==id)});
}
export function arrivalProgress(state){
 const done=normalizeArrival(state).done.length;
 return {done,total:ARRIVAL_STEPS.length,percent:Math.round(100*done/ARRIVAL_STEPS.length)};
}
