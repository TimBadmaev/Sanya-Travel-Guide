// Offline geographic atlas. No network, tile requests, external libraries.
// WGS84 pins come exclusively from verified data/places.json; coast is
// stylized (not survey data), not for navigation. SVG is fully self-contained.
import { getVisit } from "../logic/passport.js";
const NS="http://www.w3.org/2000/svg";
const EXTENT={west:109.08,east:109.87,north:18.46,south:18.14};
const CAT={beach:"🏖️",nature:"🌴",culture:"🏯",market:"🏮",entertainment:"🎡",shopping:"🛍️"};
// Approximate label layout intentionally avoids clustering in Sanya's center.
const AREAS=[
  {label:"НАНЬШАНЬ",x:155,y:165},
  {label:"САНЬЯ",x:525,y:210},
  {label:"ЯЛУНВАНЬ",x:785,y:165},
  {label:"ХАЙТАНЬ",x:1050,y:115}
];
const BAYS=[{label:"Санья Бэй",x:305,y:645},{label:"Ялонг Бэй",x:900,y:648}];
export function atlasPosition(location){
  if(!location||!Number.isFinite(location.lat)||!Number.isFinite(location.lng))return null;
  const x=45+(location.lng-EXTENT.west)/(EXTENT.east-EXTENT.west)*1110;
  const y=55+(EXTENT.north-location.lat)/(EXTENT.north-EXTENT.south)*620;
  return x>=0&&x<=1200&&y>=0&&y<=710?{x,y}:null;
}
function svgNode(parent,name,attrs={},content){
  const n=document.createElementNS(NS,name);
  for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));
  if(content!=null)n.textContent=content;
  parent.appendChild(n);return n;
}
function node(parent,tag,cls,text){
  const n=document.createElement(tag);
  if(cls)n.className=cls;
  if(text!==undefined)n.textContent=text;
  parent.appendChild(n);return n;
}
export function atlasCluster(items,bucket=120){
  const groups=new Map();
  for(const entry of items){
    const p=atlasPosition(entry.place.location);
    if(!p)continue;
    const key=Math.round(p.x/bucket)+":"+Math.round(p.y/bucket);
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push({...entry,...p});
  }
  const clusters=[...groups.values()].map(group=>{
    const x=group.reduce((s,item)=>s+item.x,0)/group.length;
    const y=group.reduce((s,item)=>s+item.y,0)/group.length;
    return {x,y,anchorX:x,anchorY:y,entries:group};
  });
  // Deterministic collision relaxation. Geography remains truthful at the
  // fine leader-line anchors; discs move slightly for better finger targets.
  for(let iteration=0;iteration<32;iteration++){
    for(let i=0;i<clusters.length;i++){
      for(let j=i+1;j<clusters.length;j++){
        const left=clusters[i],right=clusters[j];
        let dx=right.x-left.x,dy=right.y-left.y;
        let distance=Math.hypot(dx,dy);
        if(distance>=116)continue;
        if(distance<.01){dx=((i+j)%2?1:-1);dy=(i%2?1:-1);distance=Math.hypot(dx,dy);}
        const shift=(116-distance)/2;
        left.x-=dx/distance*shift;left.y-=dy/distance*shift;
        right.x+=dx/distance*shift;right.y+=dy/distance*shift;
      }
    }
    for(const c of clusters){
      c.x=Math.max(70,Math.min(1130,c.x));
      c.y=Math.max(335,Math.min(635,c.y));
    }
  }
  return clusters;
}
export function renderOfflineAtlas(parent,{places=[],visits={},savedIds=[],myPlan={days:{}}}={}){
  const section=node(parent,"section","atlas");
  const heading=node(section,"div","atlas__heading");
  const h=node(heading,"div","");
  node(h,"p","atlas__eyebrow","РАБОТАЕТ БЕЗ ИНТЕРНЕТА");
  node(h,"h3","","🏝️ Остров открытий");
  node(heading,"span","atlas__offline","OFFLINE");
  node(section,"p","atlas__intro","Координаты точек настоящие, бухты подписаны, а открытия раскрашиваются. Контур побережья условный: это обзор, не навигатор.");
  const filters=node(section,"div","atlas__filters");
  filters.setAttribute("role","group");
  filters.setAttribute("aria-label","Фильтр мест в офлайн-атласе");
  const saved=new Set(savedIds);
  const planned=new Set(Object.values(myPlan?.days||{}).flatMap(d=>Array.isArray(d?.placeIds)?d.placeIds:[]));
  const choices=[["all","🧭 Все"],["visited","✅ Был здесь"],["saved","⭐ Сохранено"],
    ["beach","🏖️ Пляжи"],["nature","🌿 Природа"],["culture","🏯 Культура"]];
  let filter="all";
  const buttons=[];
  const svg=svgNode(section,"svg",{viewBox:"0 0 1200 710",class:"atlas__svg",
    role:"img","aria-label":"Обзорная схема южного Хайнаня с реальными координатами мест и схематичным берегом",
    preserveAspectRatio:"xMidYMid meet"});
  const defs=svgNode(svg,"defs");
  const sea=svgNode(defs,"linearGradient",{id:"atlas-sea",x1:"0",y1:"0",x2:"0",y2:"1"});
  svgNode(sea,"stop",{offset:"0%","stop-color":"#a8e9ed"});
  svgNode(sea,"stop",{offset:"100%","stop-color":"#4bbbd7"});
  const land=svgNode(defs,"linearGradient",{id:"atlas-land",x1:"0",y1:"0",x2:"1",y2:"1"});
  svgNode(land,"stop",{offset:"0%","stop-color":"#cfeebc"});
  svgNode(land,"stop",{offset:"100%","stop-color":"#8fcea6"});
  const coast="M0 445 C80 431 120 452 190 471 Q260 468 332 526 C365 563 419 556 453 574 Q480 602 509 592 L528 655 Q544 683 564 652 L580 590 C604 551 635 559 662 564 C701 552 716 580 747 597 Q780 619 814 594 Q846 557 862 506 C883 458 886 405 920 379 Q974 338 1008 322 Q1092 270 1200 201 L1200 0 L0 0 Z";
  svgNode(svg,"rect",{width:1200,height:710,fill:"url(#atlas-sea)"});
  const water=svgNode(svg,"g",{class:"atlas__water"});
  for(let i=0;i<8;i++)svgNode(water,"path",{d:"M"+(-30+i*170)+" "+(635-i%3*33)+" q40 -14 80 0 t80 0",class:"atlas__wave"});
  svgNode(svg,"path",{d:coast,fill:"url(#atlas-land)",class:"atlas__land"});
  const hills=svgNode(svg,"g",{class:"atlas__contours"});
  ["M30 284 Q250 235 383 330 T710 305 T1090 163",
   "M0 360 Q220 322 401 400 T775 364 T1170 230",
   "M86 169 Q310 110 486 227 T925 190",
   "M216 463 Q366 381 485 467 T785 456",
   "M740 146 Q850 86 993 109"].forEach(d=>svgNode(hills,"path",{d,class:"atlas__contour"}));
  svgNode(svg,"path",{d:coast,fill:"none",class:"atlas__coastline"});
  AREAS.forEach(a=>svgNode(svg,"text",{x:a.x,y:a.y,"text-anchor":"middle",class:"atlas__area-label"},a.label));
  BAYS.forEach(a=>svgNode(svg,"text",{x:a.x,y:a.y,"text-anchor":"middle",class:"atlas__bay-label"},a.label));
  svgNode(svg,"text",{x:100,y:665,class:"atlas__water-title"},"ЮЖНО-КИТАЙСКОЕ МОРЕ");
  const pins=svgNode(svg,"g",{class:"atlas__pins"});
  const preview=node(section,"div","atlas__preview");
  preview.hidden=true;
  const count=node(section,"p","atlas__count","");
  node(section,"p","atlas__footnote","● Точки — реальные координаты каталога. У некоторых островных экскурсий отмечен причал отправления. Берег и рельеф схематичны; не используйте для построения маршрута.");
  function kind(place){
    if(getVisit(visits,place.id))return "visited";
    if(planned.has(place.id))return "planned";
    if(saved.has(place.id))return "saved";
    return "unknown";
  }
  function draw(){
    pins.replaceChildren();
    const items=places.filter(p=>p.status==="verified"&&atlasPosition(p.location)&&
      (filter==="all"||filter==="visited"&&kind(p)==="visited"||
        filter==="saved"&&kind(p)==="saved"||p.category===filter))
      .map(place=>({place,kind:kind(place)}));
    const clusters=atlasCluster(items,filter==="all"?116:100);
    items.filter(x=>x.kind==="visited").forEach(entry=>{
      const p=atlasPosition(entry.place.location);
      svgNode(pins,"circle",{cx:p.x,cy:p.y,r:38,class:"atlas__reveal"});
    });
    clusters.forEach((cluster,i)=>{
      // A displaced group stays linked to its original WGS84 centroid.
      if(Math.hypot(cluster.x-cluster.anchorX,cluster.y-cluster.anchorY)>17){
        svgNode(pins,"line",{x1:cluster.anchorX,y1:cluster.anchorY,x2:cluster.x,y2:cluster.y,class:"atlas__leader"});
        svgNode(pins,"circle",{cx:cluster.anchorX,cy:cluster.anchorY,r:5,class:"atlas__anchor"});
      }
      const multi=cluster.entries.length>1;
      const primary=cluster.entries[0];
      const status=cluster.entries.some(e=>e.kind==="visited")?"visited":primary.kind;
      const group=svgNode(pins,"g",{class:"atlas__point atlas__point--"+status,
        tabindex:"0",role:"button","data-cluster":i,
        "aria-label":multi?cluster.entries.length+" мест, открыть список":primary.place.name.ru});
      svgNode(group,"circle",{cx:cluster.x,cy:cluster.y,r:90,class:"atlas__hit"});
      svgNode(group,"circle",{cx:cluster.x,cy:cluster.y,r:multi?35:31,class:"atlas__pin"});
      svgNode(group,"text",{x:cluster.x,y:cluster.y+10,"text-anchor":"middle",class:"atlas__pin-label"},
        multi?String(cluster.entries.length):(CAT[primary.place.category]||"📍"));
      const open=()=>{
        preview.replaceChildren();
        node(preview,"strong","",multi?cluster.entries.length+" мест рядом":primary.place.name.ru);
        const list=node(preview,"div","atlas__preview-links");
        cluster.entries.forEach(entry=>{
          const a=node(list,"a","",entry.place.name.ru+" ›");
          a.href="#/place/"+entry.place.id;
        });
        preview.hidden=false;
      };
      group.addEventListener("click",open);
      group.addEventListener("keydown",e=>{
        if(e.key==="Enter"||e.key===" "){e.preventDefault();open();}
      });
    });
    count.textContent=items.length+" мест на схеме · "+clusters.length+" групп";
  }
  choices.forEach(([key,label])=>{
    const b=node(filters,"button","atlas__filter",label);
    b.type="button";b.setAttribute("aria-pressed",String(filter===key));
    b.addEventListener("click",()=>{
      filter=key;preview.hidden=true;
      buttons.forEach(([k,btn])=>btn.setAttribute("aria-pressed",String(k===filter)));
      draw();
    });
    buttons.push([key,b]);
  });
  draw();
  return section;
}
