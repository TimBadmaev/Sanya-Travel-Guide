// Curated from Sanya Tourism Board (2026) and the Sanya city government.
// Experience suggestions are not reservations or promises of opening hours.
export const MUST_DO_SOURCE="https://www.visitsanya.com/56389.html";
export const MUST_DO_ITEMS=Object.freeze([
 {id:"yalong-swim",icon:"🏖️",title:"Искупаться в Ялунване",
  category:"Море",effort:"Легко · рядом с Ялунванем",
  description:"Поймай утро у моря, погуляй по широкому пляжу и искупайся, если разрешают условия.",
  tip:"Купайся только в разрешённой зоне и следи за флагами и спасателями.",
  joke:"Море бесплатно. Песок в обуви — в комплекте.",href:"#/place/yalong-bay-beach"},
 {id:"coconut-chicken",icon:"🥥",title:"Попробовать кокосовую курицу",
  category:"Еда",effort:"Ужин · рядом есть варианты",
  description:"Курица по-вэньчански, сваренная в кокосовой воде, — один из гастрономических символов Хайнаня.",
  tip:"Сначала попробуй сам бульон, затем мясо с местным соусом.",
  joke:"Да, кокос и курица. Нет, это не десерт.",href:"#/places?mode=food"},
 {id:"sanya-sunset",icon:"🌅",title:"Встретить закат у Санья-Бэй",
  category:"Пейзаж",effort:"Вечер · прогулка",
  description:"Пройдись по Кокосовому коридору и поймай тёплый свет на линии горизонта.",
  tip:"Погода не обязана выдавать идеальный закат каждый вечер.",
  joke:"Главное — не пытайся сфотографировать все 147 оттенков оранжевого.",href:"#/place/sanya-bay-beach"},
 {id:"qingbuliang",icon:"🍧",title:"Охладиться десертом цинбулян",
  category:"Еда",effort:"Перекус · легко",
  description:"Хайнаньский холодный десерт: кокосное молоко, бобы, фрукты и разные добавки.",
  tip:"Можно попросить меньше сахара, если не любишь сладкое.",
  joke:"Десерт, который выглядит как суп и побеждает жару.",href:"#/places?mode=food"},
 {id:"wuzhizhou",icon:"🏝️",title:"Увидеть остров Учжичжоу",
  category:"Экскурсия",effort:"Поездка на день",
  description:"Бирюзовая вода, смотровые площадки и морские развлечения — для тех, кто хочет отдельный островной день.",
  tip:"Катера и активности зависят от погоды; сверяй правила и условия на месте.",
  joke:"Ещё один остров на острове. География одобряет.",href:"#/place/wuzhizhou-island"},
 {id:"nanshan",icon:"🙏",title:"Посмотреть на Гуаньинь в Наньшане",
  category:"Культура",effort:"Экскурсия · часть дня",
  description:"Посети культурный комплекс с известной 108-метровой статуей Гуаньинь.",
  tip:"Уважай правила храмовой территории и местные традиции.",
  joke:"108 метров впечатляют даже без режима панорамы.",href:"#/place/nanshan-cultural-zone"},
 {id:"forest",icon:"🌿",title:"Заглянуть в тропический лес",
  category:"Природа",effort:"Экскурсия · полдня",
  description:"Пойди по тропам парка «Тропический рай» Ялунваня и посмотри на бухту сверху.",
  tip:"Удобная обувь и вода полезнее ещё одного фильтра для фотографий.",
  joke:"Здесь кондиционер называется «тень», и он не всегда включён.",href:"#/place/yalong-tropical-forest-park"},
 {id:"seafood",icon:"🦐",title:"Устроить ужин с морепродуктами",
  category:"Еда",effort:"Ужин · городской выезд",
  description:"Попробуй местный улов — приготовленный на пару, с чесноком или острым соусом.",
  tip:"Согласуй полную цену за вес и приготовление до заказа.",
  joke:"Новый рекорд: выбрать ужин дольше, чем его съесть.",href:"#/places?mode=food"},
 {id:"night-market",icon:"🍍",title:"Зайти на вечерний рынок",
  category:"Местная жизнь",effort:"Вечер · городской выезд",
  description:"Исследуй местные лавки, попробуй сезонные тропические фрукты и уличные закуски.",
  tip:"Смотри на цены заранее и выбирай продукты, которые тебе подходят.",
  joke:"План: один фрукт. Реальность: пакет неизвестных фруктов.",href:"#/place/sanya-first-market"},
 {id:"luhuitou",icon:"🌃",title:"Посмотреть на ночную Санью сверху",
  category:"Пейзаж",effort:"Вечер · смотровая площадка",
  description:"Поднимись в парк Лухуйтоу ради панорамы бухт и вечерних огней города.",
  tip:"Время доступа и транспорт уточняй перед выездом.",
  joke:"Когда город превращается в карту, а ты — в её главный маркер.",href:"#/place/luhuitou-park"}
]);
export const MUST_DO_IDS=new Set(MUST_DO_ITEMS.map(x=>x.id));
export function normalizeMustDo(value){
 const done=Array.isArray(value?.done)?value.done:[];
 return {v:1,done:[...new Set(done.filter(id=>typeof id==="string"&&MUST_DO_IDS.has(id)))].slice(0,10)};
}
export function toggleMustDo(value,id,checked){
 const state=normalizeMustDo(value);
 if(!MUST_DO_IDS.has(id))return state;
 return normalizeMustDo({done:checked?[...state.done,id]:state.done.filter(x=>x!==id)});
}
export function mustDoSummary(value){
 const state=normalizeMustDo(value);
 return {done:state.done.length,total:MUST_DO_ITEMS.length,percent:Math.round(state.done.length/MUST_DO_ITEMS.length*100)};
}
