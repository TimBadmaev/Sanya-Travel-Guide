import { loadPlaces, loadConfig, loadAudioGuides, loadIslandShape, loadErrorMessage } from "../data.js";

// Lightweight offline map: only Natural Earth 1:50m actual coastline and
// real WGS84 locations from our existing catalog. No map tiles or APIs.
const NS="http://www.w3.org/2000/svg";
const GEO={west:108.4,east:111.3,south:17.95,north:20.52,w:960,h:740};
const project=([lng,lat])=>({
 x:(lng-GEO.west)/(GEO.east-GEO.west)*GEO.w,
 y:(GEO.north-lat)/(GEO.north-GEO.south)*GEO.h
});
const el=(tag,cls,text)=>{
 const e=document.createElement(tag);
 if(cls)e.className=cls;
 if(text!==undefined)e.textContent=text;
 return e;
};
const svgEl=(tag,attrs,parent)=>{
 const e=document.createElementNS(NS,tag);
 for(const [k,v] of Object.entries(attrs||{}))e.setAttribute(k,String(v));
 if(parent)parent.appendChild(e);
 return e;
};
const view=(r)=>[r.x,r.y,r.w,r.h].map(x=>x.toFixed(1)).join(" ");
const frames={
 island:{x:0,y:0,w:960,h:740},
 south:(()=>{const a=project([108.85,19.18]),b=project([110.7,17.95]);return{x:a.x,y:a.y,w:b.x-a.x,h:b.y-a.y};})()
};

export async function renderIslandAtlas(container,ctx) {
 container.innerHTML='<p class="loading">Рисуем карту Хайнаня…</p>';
 let shape,places,config,guides;
 try{[shape,places,config,guides]=await Promise.all([
  loadIslandShape(),loadPlaces(),loadConfig(),loadAudioGuides()
 ]);}catch(error){
  if(ctx.isCurrent())container.textContent=loadErrorMessage(error);
  return;
 }
 if(!ctx.isCurrent())return;
 container.innerHTML="";
 const back=el("a","place-detail__back","← К открытиям");
 back.href="#/discover";back.addEventListener("click",e=>{e.preventDefault();ctx.back("#/discover");});
 container.append(back,el("h2","view-title","🏝️ Обзор острова Хайнань"),
  el("p","island-atlas__intro","Это схема всего острова: она не показывает детально дороги. Для настоящей карты улиц и маршрутов откройте карту Саньи."));
 const streets=el("a","btn btn--primary island-atlas__streets","🗺️ Настоящая карта улиц и маршруты ›");
 streets.href="#/map";container.appendChild(streets);
 const toolbar=el("div","island-atlas__toolbar");
 const southBtn=el("button","btn btn--secondary","📍 Санья и юг");
 const islandBtn=el("button","btn btn--secondary","🏝️ Весь остров");
 southBtn.type=islandBtn.type="button";
 const select=el("select","audio-filter island-atlas__filter");
 select.setAttribute("aria-label","Фильтр мест по району");
 const areas=new Map(config.areas.map(a=>[a.id,a.name]));
 const available=places.filter(p=>guides[p.id]&&p.location&&
  Number.isFinite(p.location.lng)&&Number.isFinite(p.location.lat));
 [{id:"any",name:"Все достопримечательности"},{id:"yalong",name:areas.get("yalong")||"Ялунвань"},
  ...[...areas].filter(([id])=>id!=="yalong").map(([id,name])=>({id,name}))]
  .filter(a=>a.id==="any"||available.some(p=>p.area===a.id))
  .forEach(a=>{const o=el("option","",a.name);o.value=a.id;select.appendChild(o);});
 toolbar.append(southBtn,islandBtn,select);container.appendChild(toolbar);
 const frame=el("div","island-atlas");
 const svg=svgEl("svg",{viewBox:view(frames.south),class:"island-atlas__svg",
  role:"group","aria-label":"Географическая карта острова Хайнань и достопримечательностей",
  preserveAspectRatio:"xMidYMid meet"},frame);
 const defs=svgEl("defs",{},svg);
 const sea=svgEl("linearGradient",{id:"atlas-sea",x1:"0%",x2:"70%",y1:"0%",y2:"100%"},defs);
 svgEl("stop",{offset:"0%","stop-color":"#09203c"},sea);
 svgEl("stop",{offset:"100%","stop-color":"#12617b"},sea);
 const land=svgEl("linearGradient",{id:"atlas-land",x1:"5%",x2:"85%",y1:"0%",y2:"100%"},defs);
 svgEl("stop",{offset:"0%","stop-color":"#367a6d"},land);
 svgEl("stop",{offset:"80%","stop-color":"#3c856a"},land);
 svgEl("stop",{offset:"100%","stop-color":"#c3ad78"},land);
 svgEl("rect",{x:0,y:0,width:GEO.w,height:GEO.h,fill:"url(#atlas-sea)"},svg);
 const path=shape.coastline.map((p,i)=>{
  const q=project(p);return`${i?"L":"M"}${q.x.toFixed(2)} ${q.y.toFixed(2)}`;
 }).join(" ")+" Z";
 svgEl("path",{d:path,class:"island-atlas__shore-shadow",transform:"translate(0 5)"},svg);
 svgEl("path",{d:path,class:"island-atlas__land",fill:"url(#atlas-land)"},svg);
 const clip=svgEl("clipPath",{id:"atlas-land-clip"},defs);
 svgEl("path",{d:path},clip);
 // Real Natural Earth grayscale shaded relief, locally colorized and clipped
 // to the actual coastline. Never claim the decorative scene is a DEM.
 svgEl("image",{href:"assets/maps/hainan-relief.webp",x:0,y:0,
   width:GEO.w,height:GEO.h,preserveAspectRatio:"none",
   "clip-path":"url(#atlas-land-clip)",class:"island-atlas__relief",
   "aria-hidden":"true"},svg);
 svgEl("path",{d:path,class:"island-atlas__coast-highlight","aria-hidden":"true"},svg);
 const islandText=svgEl("text",{x:project([109.7,19.3]).x,y:project([109.7,19.3]).y,class:"island-atlas__island-text"},svg);
 islandText.textContent="ХАЙНАНЬ";
 const sanyaPoint=project([109.508,18.252]);
 svgEl("circle",{cx:sanyaPoint.x,cy:sanyaPoint.y,r:3,class:"island-atlas__city-dot"},svg);
 const cityText=svgEl("text",{x:sanyaPoint.x+11,y:sanyaPoint.y-9,class:"island-atlas__city-text"},svg);
 cityText.textContent="САНЬЯ";
 const pins=svgEl("g",{class:"island-atlas__pins"},svg);
 const pinElements=new Map();
 available.forEach(p=>{
  const pos=project([p.location.lng,p.location.lat]);
  if(pos.x<0||pos.x>GEO.w||pos.y<0||pos.y>GEO.h)return;
  const pin=svgEl("g",{"data-place":p.id,class:"island-atlas__pin",role:"link",
     tabindex:0,"aria-label":"Открыть "+p.name.ru},pins);
  svgEl("circle",{cx:pos.x,cy:pos.y,r:8,class:"island-atlas__pin-halo"},pin);
  svgEl("circle",{cx:pos.x,cy:pos.y,r:4,class:"island-atlas__pin-core"},pin);
  svgEl("title",{},pin).textContent=p.name.ru;
  const open=()=>{window.location.hash=`#/place/${p.id}`;};
  pin.addEventListener("click",open);
  pin.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();open();}});
  pinElements.set(p.id,pin);
 });
 container.appendChild(frame);
 container.appendChild(el("p","island-atlas__caption",
  "Берег — Natural Earth 1:50m; рельеф — Natural Earth 10m, условная цветная затенённая поверхность. Точки взяты из карточек (для островов иногда показаны причалы). Масштаб обобщён, для маршрута откройте карту из карточки. Работает офлайн."));
 const title=el("h3","island-atlas__list-head","Достопримечательности");
 const list=el("div","island-atlas__list");
 container.append(title,list);
 function zoom(mode){
  svg.setAttribute("viewBox",view(frames[mode]));
  southBtn.setAttribute("aria-pressed",String(mode==="south"));
  islandBtn.setAttribute("aria-pressed",String(mode==="island"));
 }
 southBtn.addEventListener("click",()=>zoom("south"));
 islandBtn.addEventListener("click",()=>zoom("island"));
 zoom("south");
 function refresh(){
  if(!ctx.isCurrent())return;
  const subset=available.filter(p=>select.value==="any"||p.area===select.value);
  const shown=new Set(subset.map(p=>p.id));
  for(const [id,pin] of pinElements)pin.style.display=shown.has(id)?"":"none";
  title.textContent=`Места с аудиогидом · ${subset.length}`;
  list.innerHTML="";
  for(const p of subset){
   const a=el("a","island-atlas__item","🎧 "+p.name.ru+"  ›");
   a.href=`#/place/${p.id}`;list.appendChild(a);
  }
 }
 select.addEventListener("change",refresh);refresh();
}
