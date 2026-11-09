import { loadAudioGuides, loadAudioSizes } from "../data.js";
import { offlineGuideIds, audioCacheAvailable } from "../logic/audio-cache.js";
import { MAP_DETAIL_IDS, loadCachedMapDetail } from "../logic/offline-map-detail.js";
import { getOfflineStatus, offlineState, OFFLINE_STATE } from "../pwa.js";
import { storage } from "../storage.js";

const areas = {yalong:"Ялунвань",city:"Центр Саньи",dadonghai:"Дадунхай",haitang:"Хайтан",tianya:"Тянья"};
function el(parent,tag,cls,text){
 const item=document.createElement(tag);if(cls)item.className=cls;
 if(text!==undefined)item.textContent=text;parent.appendChild(item);return item;
}
function item(list,icon,title,description,href,label){
 const row=el(list,"div","offline-center__item");
 el(row,"span","offline-center__icon",icon);
 const body=el(row,"div","offline-center__body");
 el(body,"strong","",title);el(body,"span","",description);
 const a=el(row,"a","offline-center__link",label);a.href=href;
}
export async function renderOfflineCenter(container,ctx){
 container.replaceChildren();
 const back=el(container,"a","place-detail__back","← Назад");back.href="#/prepare";
 back.addEventListener("click",e=>{e.preventDefault();ctx.back("#/prepare");});
 el(container,"h2","view-title","📶 Готовность без интернета");
 el(container,"p","offline-center__intro","Проверяем именно сохранённые файлы этого телефона. Ничего дополнительно не скачивается без твоего нажатия.");
 const board=el(container,"section","offline-center");
 const banner=el(board,"div","offline-center__banner");
 const headline=el(banner,"strong","","Проверяем сохранённые материалы…");
 const subtitle=el(banner,"p","","Для проверки нужен доступ к локальному хранилищу.");
 const rows=el(board,"div","offline-center__list");
 const update=el(board,"button","btn btn--secondary offline-center__refresh","↻ Проверить снова");update.type="button";
 let seq=0;
 async function check(){
  const request=++seq;update.disabled=true;
  headline.textContent="Проверяем офлайн-копию…";subtitle.textContent="";
  rows.replaceChildren();
  try{
   const [app, guides, sizes]=await Promise.all([getOfflineStatus(),loadAudioGuides(),loadAudioSizes()]);
   if(!ctx.isCurrent()||request!==seq)return;
   const state=offlineState(app),total=Object.keys(guides).length;
   const audio=audioCacheAvailable()?await offlineGuideIds(guides):new Set();
   const saved=[];
   if("caches" in window && window.isSecureContext){
    for(const id of MAP_DETAIL_IDS){
     try {if(await loadCachedMapDetail(id))saved.push(id);}catch(e){/* Malformed pack is not ready. */}
    }
   }
   if(!ctx.isCurrent()||request!==seq)return;
   const ready=state===OFFLINE_STATE.READY;
   board.dataset.ready=ready?"yes":"no";
   headline.textContent=ready?"✓ Основа путеводителя сохранена":"Основная офлайн-копия пока не подтверждена";
   subtitle.textContent=ready
    ? "Приложение, места, справка и фразы готовы. Проверь остальные материалы ниже."
    : "Открой приложение с интернетом, дождись обновления и проверь ещё раз.";
   item(rows,ready?"✅":"⚠️","Само приложение",
    app.total?app.cached+" / "+app.total+" файлов · "+(app.version||"версия не определена"):"Нет подтверждённого офлайн-кэша",
    "#/prepare", "Подготовка");
   item(rows,audio.size===total&&total?"✅":"🎧","Аудиогиды",
    audio.size+" / "+total+" записей · полный пакет "+(sizes.totalBytes/1048576).toFixed(1)+" МиБ",
    "#/audio?download=all","Скачать");
   item(rows,saved.length===MAP_DETAIL_IDS.length?"✅":"🗺️","Подробные карты",
    saved.length+" / "+MAP_DETAIL_IDS.length+" районов"+(saved.length?" · "+saved.map(id=>areas[id]).join(", "):""),
    "#/map","Открыть");
   const trip=storage.getTrip();
   item(rows,trip.home?.addressZh?"✅":"🏨","Адрес отеля по-китайски",
    trip.home?.addressZh?"Сохранён на этом устройстве":"Не указан — лучше добавить до вылета",
    trip.home?.addressZh?"#/handy/taxi":"#/settings?section=home",trip.home?.addressZh?"Показать":"Добавить");
  }catch(error){
   if(ctx.isCurrent()&&request===seq){
    headline.textContent="Не всё удалось проверить";
    subtitle.textContent="Возможна ошибка доступа к данным. Попробуй открыть приложение с сетью и повторить проверку.";
   }
  }finally{if(ctx.isCurrent()&&request===seq)update.disabled=false;}
 }
 update.addEventListener("click",check);
 const note=el(container,"p","offline-center__warning",
   "Важно: Amap, Яндекс Карты, онлайн-карты, внешние ссылки и актуальные часы работы требуют интернета. iOS может очистить данные сайтов при нехватке памяти. Проверяй после перезапуска в авиарежиме.");
 const backup=el(container,"a","btn btn--secondary offline-center__backup","💾 Сделать резервную копию");backup.href="#/data";
 void check();
}
