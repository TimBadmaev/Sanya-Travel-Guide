import { milestonesForLevel, nextRank, rankForLevel } from "../logic/ranks.js";
function node(parent,tag,cls,text){
  const e=document.createElement(tag);
  if(cls)e.className=cls;
  if(text!==undefined)e.textContent=text;
  parent.appendChild(e);return e;
}
export function renderRankAwards(parent,{xp=0,level={level:1}},compact=false){
  const rank=rankForLevel(level.level);
  const future=nextRank(level.level);
  const section=node(parent,"section","rank-card"+(compact?" rank-card--compact":""));
  const lead=node(section,"div","rank-card__lead");
  const emblem=node(lead,"div","rank-card__emblem rank-card__emblem--"+rank.tone);
  emblem.setAttribute("role","img");
  emblem.setAttribute("aria-label",rank.reward+" — награда открыта");
  node(emblem,"span","rank-card__glow","");
  node(emblem,"span","rank-card__symbol",rank.icon);
  node(emblem,"span","rank-card__spark rank-card__spark--a","✦");
  node(emblem,"span","rank-card__spark rank-card__spark--b","✦");
  const copy=node(lead,"div","rank-card__details");
  node(copy,"p","rank-card__eyebrow","ТВОЁ ЗВАНИЕ · УРОВЕНЬ "+level.level);
  node(copy,"h3","rank-card__title",rank.name);
  node(copy,"p","rank-card__subtitle",rank.copy);
  node(copy,"span","rank-card__gift","🎁 Значок: "+rank.reward);
  const stats=node(section,"div","rank-card__xp-row");
  node(stats,"strong","",xp+" XP");
  node(stats,"span","",future?"Следующая награда на уровне "+future.level:"Все звания открыты");
  if(future){
    const goal=(future.level-1)*100;
    const start=(rank.level-1)*100;
    const progress=node(section,"div","rank-card__xp-meter");
    progress.setAttribute("role","progressbar");
    progress.setAttribute("aria-label","Прогресс к награде "+future.reward);
    progress.setAttribute("aria-valuemin",String(start));
    progress.setAttribute("aria-valuemax",String(goal));
    progress.setAttribute("aria-valuenow",String(Math.min(goal,xp)));
    node(progress,"span","").style.width=Math.round(Math.min(100,Math.max(0,(xp-start)/(goal-start)*100)))+"%";
  }
  const title=node(section,"h4","rank-card__collection-title","Коллекция значков");
  const grid=node(section,"div","rank-card__collection");
  for(const milestone of milestonesForLevel(level.level)){
    const item=node(grid,"div","rank-card__badge"+(milestone.earned?" is-earned":" is-locked"));
    item.title=milestone.earned?milestone.reward:"Откроется на уровне "+milestone.level;
    node(item,"span","rank-card__badge-symbol",milestone.earned?milestone.icon:"🔒");
    node(item,"strong","rank-card__badge-level","Ур. "+milestone.level);
    node(item,"span","rank-card__badge-name",milestone.reward);
    item.setAttribute("aria-label",milestone.reward+(milestone.earned?" открыт":" закрыт до уровня "+milestone.level));
  }
  if(!compact)node(section,"p","rank-card__fineprint",
    "Награды — цифровые значки путешественника. XP начисляется за открытия, уроки, заметки, подготовку и дневник, а не за сумму покупок.");
  return section;
}
