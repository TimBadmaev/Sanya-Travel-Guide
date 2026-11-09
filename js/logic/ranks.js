// Milestone awards are derived from XP, never stored or sent to a server.
// No purchases, ads, unlock paywalls, streak losses or competitive pressure.
export const RANKS=Object.freeze([
  {level:1,name:"Первопроходец",icon:"🧭",reward:"Первый компас",copy:"Начало твоей истории на острове.",tone:"mint"},
  {level:3,name:"Искатель бухт",icon:"🐚",reward:"Жемчужная ракушка",copy:"Ты учишься различать побережья и находить свои пляжи.",tone:"aqua"},
  {level:5,name:"Следопыт джунглей",icon:"🌿",reward:"Зелёный талисман",copy:"За каждым поворотом — новый тропический мир.",tone:"forest"},
  {level:8,name:"Картограф Хайнаня",icon:"🗺️",reward:"Золотая карта",copy:"Твой остров уже не просто точка на карте.",tone:"gold"},
  {level:12,name:"Хранитель легенд",icon:"🏮",reward:"Фонарь историй",copy:"Ты собираешь места, истории и воспоминания.",tone:"sunset"},
  {level:20,name:"Легенда острова",icon:"👑",reward:"Корона исследователя",copy:"Большое путешествие заслуживает большой награды.",tone:"royal"}
]);
export function rankForLevel(level){
  const value=Math.max(1,Math.floor(Number(level)||1));
  return [...RANKS].reverse().find(r=>value>=r.level)||RANKS[0];
}
export function nextRank(level){
  const value=Math.max(1,Math.floor(Number(level)||1));
  return RANKS.find(r=>r.level>value)||null;
}
export function milestonesForLevel(level){
  const value=Math.max(1,Math.floor(Number(level)||1));
  return RANKS.map(r=>({...r,earned:value>=r.level,requiredXp:(r.level-1)*100}));
}
