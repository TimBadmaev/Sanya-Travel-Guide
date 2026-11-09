import { normalizeFour } from "./duo-games.js";
// Pure 8x8 naval game logic. No browser, network, GPS or hidden timers.
export const BOARD_SIZE = 8;
export const FLEET = Object.freeze([4,3,2,2]);
const CELLS = BOARD_SIZE*BOARD_SIZE;
const legal = cell => Number.isInteger(cell)&&cell>=0&&cell<CELLS;
const at = (row,col) => row*BOARD_SIZE+col;
const col = cell => cell%BOARD_SIZE;
const row = cell => Math.floor(cell/BOARD_SIZE);
const around = cell => {
 const cells=[];
 for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){
  const r=row(cell)+dr,c=col(cell)+dc;
  if(r>=0&&r<BOARD_SIZE&&c>=0&&c<BOARD_SIZE)cells.push(at(r,c));
 }
 return cells;
};
function candidatePlacement(length,rng){
 const vertical=rng()<.5;
 const x=Math.floor(rng()*(vertical?BOARD_SIZE:BOARD_SIZE-length+1));
 const y=Math.floor(rng()*(vertical?BOARD_SIZE-length+1:BOARD_SIZE));
 return Array.from({length},(_,i)=>at(y+(vertical?i:0),x+(vertical?0:i)));
}
export function generateFleet(rng=Math.random){
 // Restart if a few unlucky attempts fill the available room.
 for(let attempt=0;attempt<150;attempt++){
  const placed=[],excluded=new Set();
  let okay=true;
  for(const length of FLEET){
   let ship=null;
   for(let tries=0;tries<400;tries++){
    const possible=candidatePlacement(length,rng);
    if(possible.every(cell=>!excluded.has(cell))){ship=possible;break;}
   }
   if(!ship){okay=false;break;}
   placed.push(ship);
   for(const cell of ship)for(const near of around(cell))excluded.add(near);
  }
  if(okay)return placed;
 }
 throw new Error("Не удалось расставить корабли, попробуйте снова");
}
function fleetOkay(fleet){
 if(!Array.isArray(fleet)||fleet.length!==FLEET.length)return false;
 const seen=new Set(),excluded=new Set();
 return fleet.every((ship,i)=>{
  if(!Array.isArray(ship)||ship.length!==FLEET[i]||!ship.every(legal))return false;
  const arr=[...new Set(ship)];
  if(arr.length!==ship.length||arr.some(c=>seen.has(c)))return false;
  const rows=new Set(arr.map(row)),cols=new Set(arr.map(col));
  if(rows.size>1&&cols.size>1)return false;
  if(Math.max(...arr)-Math.min(...arr)!==(FLEET[i]-1)*(cols.size===1?BOARD_SIZE:1))return false;
  for(const cell of arr){if(excluded.has(cell))return false;}
  for(const cell of arr){seen.add(cell);for(const n of around(cell))excluded.add(n);}
  return true;
 });
}
export function createMatch(mode="solo",rng=Math.random){
 if(!["solo","pass"].includes(mode))throw new Error("Неизвестный режим");
 return {v:1,mode,phase:mode==="pass"?"handoff":"battle",turn:0,winner:null,
  fleets:[generateFleet(rng),generateFleet(rng)],shots:[[],[]],last:null};
}
export function validMatch(match){
 return Boolean(match&&match.v===1&&["solo","pass"].includes(match.mode)
  &&["handoff","battle","finished"].includes(match.phase)
  &&(match.turn===0||match.turn===1)
  &&Array.isArray(match.fleets)&&match.fleets.length===2&&match.fleets.every(fleetOkay)
  &&Array.isArray(match.shots)&&match.shots.length===2
  &&match.shots.every(shots=>Array.isArray(shots)&&shots.length<=CELLS&&
     new Set(shots).size===shots.length&&shots.every(legal))
  &&[null,0,1].includes(match.winner));
}
export function revealTurn(match){
 if(!validMatch(match)||match.phase!=="handoff")throw new Error("Ход недоступен");
 return {...match,phase:"battle"};
}
export function wasHit(fleet,cell){return fleet.some(ship=>ship.includes(cell));}
export function sunkShips(fleet,enemyShots){
 const fired=new Set(enemyShots);
 return fleet.filter(ship=>ship.every(cell=>fired.has(cell))).length;
}
export function fireShot(match,cell){
 if(!validMatch(match)||match.phase!=="battle"||!legal(cell))throw new Error("Ход недоступен");
 const player=match.turn,target=1-player;
 if(match.shots[player].includes(cell))throw new Error("По этой клетке уже стреляли");
 const shots=match.shots.map(a=>a.slice());shots[player].push(cell);
 const hit=wasHit(match.fleets[target],cell);
 const sunk=hit&&match.fleets[target].some(ship=>
  ship.includes(cell)&&ship.every(c=>shots[player].includes(c)));
 const winner=sunkShips(match.fleets[target],shots[player])===FLEET.length?player:null;
 return {...match,shots,winner,turn:winner===null?target:player,
  phase:winner!==null?"finished":match.mode==="pass"?"handoff":"battle",
  last:{player,cell,hit,sunk}};
}
export function chooseCpuShot(match,rng=Math.random){
 if(!validMatch(match)||match.mode!=="solo"||match.turn!==1||match.phase!=="battle")
  throw new Error("Компьютер не может ходить");
 const fired=new Set(match.shots[1]),candidates=new Set();
 const fleet=match.fleets[0];
 for(const ship of fleet){
  const hits=ship.filter(c=>fired.has(c));
  if(!hits.length||hits.length===ship.length)continue;
  for(const hit of hits){
   for(const n of [hit-BOARD_SIZE,hit+BOARD_SIZE,hit-1,hit+1]){
    if(legal(n)&&Math.abs(row(n)-row(hit))+Math.abs(col(n)-col(hit))===1&&!fired.has(n))
     candidates.add(n);
   }
  }
 }
 const rest=[...(candidates.size?candidates:new Set(Array.from({length:CELLS},(_,i)=>i).filter(i=>!fired.has(i))))];
 if(!rest.length)throw new Error("Нет доступных ходов");
 return rest[Math.min(rest.length-1,Math.floor(rng()*rest.length))];
}
export function normalizeGameData(data){
 const raw=data&&typeof data==="object"&&!Array.isArray(data)?data:{};
 const stats=raw.stats&&typeof raw.stats==="object"?raw.stats:{};
 const clamp=n=>Number.isInteger(n)&&n>=0?Math.min(9999,n):0;
 return {v:1,stats:{
  soloWins:clamp(stats.soloWins),passGames:clamp(stats.passGames),
  quizBest:Math.min(10,clamp(stats.quizBest)),memoryBest:clamp(stats.memoryBest),
  snakeBest:clamp(stats.snakeBest),fishBest:clamp(stats.fishBest),
  fourWinsA:clamp(stats.fourWinsA),fourWinsB:clamp(stats.fourWinsB),fourDraws:clamp(stats.fourDraws),
  hockeyWinsA:clamp(stats.hockeyWinsA),hockeyWinsB:clamp(stats.hockeyWinsB)},
  match:validMatch(raw.match)?raw.match:null,
  fourMatch:normalizeFour(raw.fourMatch)};
}
