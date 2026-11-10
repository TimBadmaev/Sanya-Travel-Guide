// v40 Universal offline search — only verified bundled catalogs, no remote API.
export const SEARCH_KINDS=Object.freeze([
 {id:"all",name:"Всё"},{id:"place",name:"Места"},{id:"food",name:"Еда"},
 {id:"excursion",name:"Экскурсии"},{id:"info",name:"Справка"},{id:"phrase",name:"Фразы"}
]);
export function normalizeSearch(value){
 return String(value||"").normalize("NFKC").toLocaleLowerCase("ru")
  .replace(/ё/g,"е").replace(/[^\p{L}\p{N}]+/gu," ").trim().replace(/\s+/g," ");
}
const safe=(v)=>typeof v==="string"?v:"";
const nameOf=(value)=>typeof value==="string"?value:safe(value?.ru);
const textOf=(...args)=>args.filter(Boolean).flat(Infinity).map(x=>
  typeof x==="string"?x:typeof x==="number"?String(x):"").filter(Boolean).join(" ");
const entry=(kind,id,title,description,href,icon,keywords)=>({
 kind,id,title,description,href,icon,
 titleIndex:normalizeSearch(title),
 searchIndex:normalizeSearch(textOf(title,description,keywords))
});
export function buildSearchIndex({places=[],food=[],excursions=[],info=[],phrases=[]}={}){
 const results=[];
 for(const p of places){
  if(p.status!=="verified"||!p.id)continue;
  results.push(entry("place",p.id,nameOf(p.name),safe(p.summary),
    "#/place/"+encodeURIComponent(p.id),"📍",
    [p.name?.zh,p.name?.en,p.addressZh,p.category,p.area,p.tags,p.why,p.tips]));
 }
 for(const f of food){
  if(f.status!=="verified"||!f.id)continue;
  const title=nameOf(f.name);
  results.push(entry("food",f.id,title,safe(f.note),
    "#/places?mode=food&q="+encodeURIComponent(title),"🍜",
    [f.name?.zh,f.addressZh,f.area,f.kind,f.cuisines]));
 }
 for(const e of excursions){
  if(e.status!=="verified"||!e.id)continue;
  results.push(entry("excursion",e.id,nameOf(e.title),safe(e.summary),
    "#/excursion/"+encodeURIComponent(e.id),"🎟️",
    [e.title?.zh,e.placeIds,e.whatToSee,e.goodFor,e.tips]));
 }
 for(const i of info){
  if(i.status!=="verified"||!i.id)continue;
  results.push(entry("info",i.id,safe(i.title),safe(i.summary),
    "#/info/"+encodeURIComponent(i.id),"📚",i.points));
 }
 for(const p of phrases){
  if(!p.id||!p.ru||!p.zh)continue;
  results.push(entry("phrase",p.id,p.ru,p.zh,
    "#/handy/phrase/"+encodeURIComponent(p.id),"🀄",
    [p.pinyin,p.context,p.zh]));
 }
 return results;
}
export function searchCatalog(index,query,{kind="all",limit=50}={}){
 const normalized=normalizeSearch(query),terms=normalized.split(" ").filter(Boolean);
 if(!terms.length)return [];
 const cap=Math.min(Math.max(Number(limit)||50,1),100);
 return index.filter(x=>(kind==="all"||kind===x.kind)&&
  terms.every(t=>x.searchIndex.includes(t)))
  .map(x=>{
   let score=0;
   if(x.titleIndex===normalized)score+=150;
   if(x.titleIndex.startsWith(normalized))score+=80;
   if(x.titleIndex.includes(normalized))score+=40;
   for(const term of terms)if(x.titleIndex.includes(term))score+=25;
   if(x.kind==="place"||x.kind==="food")score+=3;
   return {...x,score};
  })
  .sort((a,b)=>b.score-a.score||a.title.localeCompare(b.title,"ru"))
  .slice(0,cap);
}
