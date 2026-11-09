import { loadPlaces, loadOfflineRoads, loadErrorMessage } from "../data.js";
import { storage } from "../storage.js";
import { worldPoint, worldCoords } from "./street-map.js";
import { buildAmapBetweenRouteUrl, buildYandexRouteUrl } from "../logic/amap.js";

// The offline network consists of real OSM ways, simplified at build time.
// It is for geographic context, NOT for computing turn-by-turn directions.
const TILE=256, MIN_Z=9, MAX_Z=16;
const AREAS=[
 {title:"🌴 Ялунвань",lat:18.235,lng:109.639},
 {title:"🏙️ Санья",lat:18.252,lng:109.508},
 {title:"🌊 Хайтан",lat:18.360,lng:109.734},
];
const LABELS=[
 ["САНЬЯ",18.255,109.508],["ЯЛУНВАНЬ",18.230,109.641],
 ["ДАДУНХАЙ",18.221,109.519],["ХАЙТАН",18.355,109.733],
 ["ТЯНЬЯ",18.286,109.348],
];
const icons={beach:"🏖️",nature:"🌴",culture:"🏯",market:"🏮",entertainment:"🎡",shopping:"🛍️"};
const el=(parent,tag,cls,text)=>{
 const e=document.createElement(tag);if(cls)e.className=cls;
 if(text!==undefined)e.textContent=text;parent.appendChild(e);return e;
};
const good=p=>p&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&p.lat!==0&&p.lng!==0;
const pos=(lat,lng,zoom,center,w,h)=>{
 const a=worldPoint(lat,lng,zoom),c=worldPoint(center.lat,center.lng,zoom);
 return{x:a.x-c.x+w/2,y:a.y-c.y+h/2};
};

export async function renderRealMap(container,ctx){
 container.innerHTML='<p class="loading">Готовим настоящую карту улиц…</p>';
 let places,roads;
 try{[places,roads]=await Promise.all([loadPlaces(),loadOfflineRoads()]);}
 catch(error){
  if(!ctx.isCurrent())return;container.replaceChildren();
  el(container,"p","error-state",loadErrorMessage(error));
  const link=el(container,"a","place-detail__back","Открыть общую схему Хайнаня");
  link.href="#/island";return;
 }
 if(!ctx.isCurrent())return;
 container.replaceChildren();
 const back=el(container,"a","place-detail__back","← К открытиям");back.href="#/discover";
 back.addEventListener("click",e=>{e.preventDefault();ctx.back("#/discover");});
 el(container,"h2","view-title","🗺️ Карта Саньи");
 el(container,"p","map-page__intro",
  "Настоящие улицы без интернета, места и маршруты A → B. Удобно сначала выбрать точку, а затем открыть готовый маршрут в навигаторе.");
 const top=el(container,"div","map-page__top");
 const island=el(top,"a","btn btn--secondary","🏝️ Весь Хайнань");island.href="#/island";
 const audio=el(top,"a","btn btn--secondary","🎧 Аудиогиды");audio.href="#/audio";
 const panel=el(container,"section","map-panel");
 el(panel,"h3","map-panel__title","Улицы и ориентиры");
 el(panel,"p","map-panel__subtitle","Ниже — упрощённые реальные дороги OpenStreetMap. Уровень детализации зависит от масштаба.");
 const focus=el(panel,"div","map-page__focus");
 const frame=el(panel,"div","map-page__canvas-wrap");
 frame.setAttribute("aria-label","Интерактивная офлайн-карта дорог Саньи");
 const canvas=el(frame,"canvas","map-page__canvas");
 canvas.setAttribute("aria-hidden","true");
 const tiles=el(frame,"div","map-page__tiles");tiles.setAttribute("aria-hidden","true");
 const pins=el(frame,"div","map-page__pins");
 const zoomControls=el(frame,"div","map-page__zoom");
 const plus=el(zoomControls,"button","","+");plus.type="button";plus.setAttribute("aria-label","Приблизить карту");
 const minus=el(zoomControls,"button","","−");minus.type="button";minus.setAttribute("aria-label","Отдалить карту");
 const pickNote=el(frame,"p","map-page__pick-note","Нажми на точку на карте, чтобы выбрать пункт B");
 pickNote.hidden=true;
 const selectedText=el(panel,"p","map-page__selection","Нажми на точку достопримечательности — появится её название.");
 const onlineBtn=el(panel,"button","btn btn--secondary map-page__online","🌐 Показать подробную онлайн-карту");
 onlineBtn.type="button";
 el(panel,"p","map-page__attribution","© OpenStreetMap contributors (ODbL). Дороги — обобщённый снимок данных, не навигатор. Онлайн-тайлы загружаются только после нажатия.");
 const planner=el(container,"section","map-panel");
 el(planner,"h3","map-panel__title","📍 Маршрут от точки A до B");
 el(planner,"p","map-panel__subtitle","Укажи отправление и место назначения; Amap построит настоящий пеший или автомобильный маршрут через интернет.");
 const selects=el(planner,"div","map-page__selects");
 const makeSelect=(caption)=>{
  const label=el(selects,"label","",caption);
  const select=el(label,"select","","");
  return select;
 };
 const start=makeSelect("Точка A — откуда");
 const finish=makeSelect("Точка B — куда");
 const mode=makeSelect("Как добраться");
 let o=el(start,"option","","Моё местоположение в навигаторе");o.value="current";
 o=el(finish,"option","","Выберите достопримечательность");o.value="";
 o=el(finish,"option","","🎯 Выбранная точка на карте");o.value="custom";
 for(const place of places.filter(p=>good(p.location)).sort((a,b)=>a.name.ru.localeCompare(b.name.ru,"ru"))){
  for(const select of [start,finish]){
    const option=el(select,"option","",place.name.ru);option.value=place.id;
  }
 }
 for(const [value,title] of [["walk","🚶 Пешком"],["car","🚗 На машине"]]){
  const option=el(mode,"option","",title);option.value=value;
 }
 const pick=el(planner,"button","btn btn--secondary map-page__pick","🎯 Выбрать точку B на карте");
 pick.type="button";
 const status=el(planner,"p","map-page__route-status","Выбери, куда направиться.");
 status.setAttribute("role","status");
 const buttons=el(planner,"div","map-page__actions");
 const amap=el(buttons,"a","btn btn--primary","Построить в Amap");
 const yandex=el(buttons,"a","btn btn--secondary","Яндекс Карты");
 for(const link of [amap,yandex]){
  link.hidden=true;link.target="_blank";link.rel="noopener noreferrer";
 }
 el(planner,"p","map-page__note",
  "Для Китая рекомендуем Amap / 高德地图. Яндекс здесь — резервный вариант: маршруты в Китае не гарантируются. Точное время и повороты рассчитывает внешний навигатор с интернетом. Координаты GPS могут смещаться на китайских картах — проверяй китайское название и вход.");
 let zoom=12,center={lat:18.245,lng:109.617},online=false,picking=false;
 let target=null,selected=null,drag=null;
 const catalog=new Map(places.filter(p=>good(p.location)).map(p=>[p.id,p]));
 const raw=roads.roads||[];
 const segments=raw.filter(r=>Array.isArray(r)&&Array.isArray(r[1])).map(([kind,points,name])=>({
  kind,points,name,
  minLng:Math.min(...points.map(p=>p[0])),maxLng:Math.max(...points.map(p=>p[0])),
  minLat:Math.min(...points.map(p=>p[1])),maxLat:Math.max(...points.map(p=>p[1]))
 }));
 function endpoint(value){
  if(value==="custom"&&target)return{location:target,name:"Выбранная точка"};
  const p=catalog.get(value);return p?{location:p.location,name:p.name.zh||p.name.ru}:null;
 }
 function directions(){
  const from=endpoint(start.value),to=endpoint(finish.value);
  if(!to){amap.hidden=yandex.hidden=true;status.textContent="Выбери точку B или нажми на карте.";return;}
  amap.href=buildAmapBetweenRouteUrl(from?.location||null,to.location,
   from?.name||"Моё местоположение",to.name,mode.value);
  yandex.href=buildYandexRouteUrl(from?.location||null,to.location,mode.value);
  amap.hidden=yandex.hidden=false;
  status.textContent=(from?.name||"Моё местоположение")+" → "+to.name+
   ". Внешний навигатор откроется с выбранными параметрами.";
 }
 function drawRoads(){
  const {width,height}=frame.getBoundingClientRect();
  if(!width||!height)return;
  const density=Math.min(2,devicePixelRatio||1);
  canvas.width=Math.round(width*density);canvas.height=Math.round(height*density);
  const g=canvas.getContext("2d");g.setTransform(density,0,0,density,0,0);
  const bg=g.createLinearGradient(0,0,width,height);
  bg.addColorStop(0,"#e6ebdd");bg.addColorStop(1,"#cddfd3");
  g.fillStyle=bg;g.fillRect(0,0,width,height);
  const wc=worldPoint(center.lat,center.lng,zoom);
  const ll=worldCoords(wc.x-width/2,wc.y-height/2,zoom),br=worldCoords(wc.x+width/2,wc.y+height/2,zoom);
  const limit=zoom<11?1:zoom<12?2:zoom<13?3:zoom<14?4:5;
  const visible=segments.filter(r=>(r.kind<=limit||r.kind===6)
   &&r.maxLng>=ll.lng&&r.minLng<=br.lng&&r.maxLat>=br.lat&&r.minLat<=ll.lat);
  for(const kind of [6,5,4,3,2,1,0]){
   for(const r of visible){
    if(r.kind!==kind)continue;
    g.beginPath();let n=0;
    for(const [lng,lat] of r.points){
     const p=pos(lat,lng,zoom,center,width,height);
     if(!n++)g.moveTo(p.x,p.y);else g.lineTo(p.x,p.y);
    }
    g.lineJoin="round";g.lineCap="round";
    const colors=["#e5ad5e","#f2d18b","#ffedd0","#fffdf5","#f9f8ef","#f1f0e8","#66b5d5"];
    g.strokeStyle=colors[kind];g.lineWidth=[zoom>=13?7:4,zoom>=13?6:3.6,zoom>=13?5:3,zoom>=13?3.5:2.1,2,1.6,2.4][kind];
    g.stroke();
   }
  }
  if(zoom>=13){
   g.font="600 10px system-ui";g.textAlign="center";g.lineWidth=3;
   let n=0;
   for(const r of visible){
    if(n>=17)break;
    if(r.kind>2||!r.name||r.points.length<3)continue;
    const p=r.points[Math.floor(r.points.length/2)];
    const q=pos(p[1],p[0],zoom,center,width,height);
    if(q.x<30||q.x>width-30||q.y<15||q.y>height-15)continue;
    g.strokeStyle="#ecf0e9";g.strokeText(r.name,q.x,q.y);
    g.fillStyle="#3d5660";g.fillText(r.name,q.x,q.y);n++;
   }
  }
  g.font="bold 12px system-ui";g.textAlign="center";g.lineWidth=4;
  for(const [text,lat,lng] of LABELS){
   const p=pos(lat,lng,zoom,center,width,height);
   if(p.x<36||p.x>width-36||p.y<15||p.y>height-15)continue;
   g.strokeStyle="#eef5e6";g.strokeText(text,p.x,p.y);
   g.fillStyle="#285669";g.fillText(text,p.x,p.y);
  }
  if(!segments.length){
   g.textAlign="center";g.fillStyle="#375665";g.fillText("Улицы временно недоступны",width/2,height/2);
  }
 }
 function drawOnline(){
  tiles.replaceChildren();
  if(!online)return;
  const {width,height}=frame.getBoundingClientRect();
  const c=worldPoint(center.lat,center.lng,zoom),x0=c.x-width/2,y0=c.y-height/2;
  const minx=Math.floor(x0/TILE),maxx=Math.floor((x0+width)/TILE);
  const miny=Math.floor(y0/TILE),maxy=Math.floor((y0+height)/TILE);
  const n=2**zoom;
  const f=document.createDocumentFragment();
  for(let y=miny;y<=maxy;y++)for(let x=minx;x<=maxx;x++){
   if(y<0||y>=n)continue;
   const img=document.createElement("img");img.className="map-page__tile";
   img.src=`https://tile.openstreetmap.org/${zoom}/${((x%n)+n)%n}/${y}.png`;
   img.style.left=(x*TILE-x0)+"px";img.style.top=(y*TILE-y0)+"px";
   img.alt="";img.decoding="async";img.draggable=false;f.appendChild(img);
  }
  tiles.appendChild(f);
 }
 function drawPins(){
  pins.replaceChildren();
  const {width,height}=frame.getBoundingClientRect();
  const ordered=places.filter(p=>good(p.location)&&p.category!=="shopping")
   .sort((a,b)=>a.id===selected?1:b.id===selected?-1:0);
  for(const place of ordered){
   const p=pos(place.location.lat,place.location.lng,zoom,center,width,height);
   if(p.x<0||p.x>width||p.y<0||p.y>height)continue;
   const button=el(pins,"button","map-page__pin"+(place.id===selected?" is-selected":""),icons[place.category]||"📍");
   button.type="button";button.style.left=p.x+"px";button.style.top=p.y+"px";
   button.title=place.name.ru;button.setAttribute("aria-label","Выбрать "+place.name.ru);
   button.addEventListener("click",e=>{
    e.stopPropagation();selected=place.id;
    selectedText.textContent=place.name.ru+" — "+(place.summary||"");
    finish.value=place.id;directions();drawPins();
   });
  }
  if(target){
   const p=pos(target.lat,target.lng,zoom,center,width,height);
   if(p.x>=0&&p.x<=width&&p.y>=0&&p.y<=height){
    const marker=el(pins,"span","map-page__pin map-page__pin--manual","🎯");
    marker.style.left=p.x+"px";marker.style.top=p.y+"px";
   }
  }
 }
 function draw(){drawRoads();drawOnline();drawPins();}
 function z(delta){const next=Math.max(MIN_Z,Math.min(MAX_Z,zoom+delta));if(next!==zoom){zoom=next;draw();}}
 plus.addEventListener("click",()=>z(1));minus.addEventListener("click",()=>z(-1));
 for(const item of AREAS){
  const btn=el(focus,"button","btn btn--secondary",item.title);btn.type="button";
  btn.addEventListener("click",()=>{center={lat:item.lat,lng:item.lng};zoom=12;draw();});
 }
 onlineBtn.addEventListener("click",()=>{
  online=!online;onlineBtn.textContent=online?"🌿 Оставить только офлайн-дороги":"🌐 Показать подробную онлайн-карту";
  draw();
 });
 pick.addEventListener("click",()=>{
  picking=!picking;pickNote.hidden=!picking;frame.classList.toggle("is-picking",picking);
  pick.textContent=picking?"Отменить выбор точки":"🎯 Выбрать точку B на карте";
  if(picking)frame.scrollIntoView({block:"center",behavior:"smooth"});
 });
 for(const select of [start,finish,mode])select.addEventListener("change",directions);
 frame.addEventListener("pointerdown",e=>{
  if(e.target.closest("button"))return;
  drag={id:e.pointerId,x:e.clientX,y:e.clientY,
    center:worldPoint(center.lat,center.lng,zoom),moved:false};
  frame.setPointerCapture(e.pointerId);
 });
 frame.addEventListener("pointermove",e=>{
  if(!drag||e.pointerId!==drag.id)return;
  const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
  if(Math.hypot(dx,dy)>6)drag.moved=true;
  if(picking)return;
  const point=worldCoords(drag.center.x-dx,drag.center.y-dy,zoom);
  if(Number.isFinite(point.lat)&&Number.isFinite(point.lng)){center=point;draw();}
 });
 let suppressClick=false;
 frame.addEventListener("pointerup",e=>{
  if(!drag)return;
  suppressClick=drag.moved;drag=null;
 });
 frame.addEventListener("pointercancel",()=>{drag=null;});
 frame.addEventListener("click",e=>{
  if(e.target.closest("button")||!picking||suppressClick){suppressClick=false;return;}
  const rect=frame.getBoundingClientRect();
  const c=worldPoint(center.lat,center.lng,zoom);
  target=worldCoords(c.x+e.clientX-rect.left-rect.width/2,c.y+e.clientY-rect.top-rect.height/2,zoom);
  picking=false;pickNote.hidden=true;frame.classList.remove("is-picking");
  pick.textContent="🎯 Выбрать точку B на карте";
  finish.value="custom";selected=null;
  selectedText.textContent="🎯 Выбрана произвольная точка на карте — это не обязательно вход на территорию.";
  directions();draw();
 });
 let width=0;
 const obs=typeof ResizeObserver!=="undefined"?new ResizeObserver(()=>{
  if(!frame.isConnected){obs.disconnect();return;}
  if(frame.clientWidth!==width){width=frame.clientWidth;draw();}
 }):null;
 if(obs)obs.observe(frame);
 directions();draw();
}
