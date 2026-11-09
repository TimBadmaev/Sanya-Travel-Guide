// Two original games for friends sharing ONE device, fully offline.
export const FOUR_COLS=7,FOUR_ROWS=6;
export function newFour(){
 return {board:Array(FOUR_COLS*FOUR_ROWS).fill(null),turn:0,winner:null,moves:0};
}
const winAt=(board,x,y,p)=>{
 const at=(cx,cy)=>board[cy*FOUR_COLS+cx];
 for(const [dx,dy] of [[1,0],[0,1],[1,1],[1,-1]]){
  let count=1;
  for(const sign of [-1,1]){
   let a=x+dx*sign,b=y+dy*sign;
   while(a>=0&&a<FOUR_COLS&&b>=0&&b<FOUR_ROWS&&at(a,b)===p){
    count++;a+=dx*sign;b+=dy*sign;
   }
  }
  if(count>=4)return true;
 }
 return false;
};
export function dropFour(state,column){
 if(state.winner!==null||!Number.isInteger(column)||column<0||column>=FOUR_COLS)
  return state;
 const board=state.board.slice();
 for(let row=FOUR_ROWS-1;row>=0;row--){
  const cell=row*FOUR_COLS+column;
  if(board[cell]!==null)continue;
  board[cell]=state.turn;
  const moves=state.moves+1;
  const winner=winAt(board,column,row,state.turn)?state.turn:moves===FOUR_COLS*FOUR_ROWS?"draw":null;
  return {board,turn:winner===null?1-state.turn:state.turn,winner,moves};
 }
 return state;
}
export function normalizeFour(value){
 if(!value||!Array.isArray(value.board)||value.board.length!==42)return null;
 if(!value.board.every(x=>x===null||x===0||x===1))return null;
 const a=value.board.filter(x=>x===0).length,b=value.board.filter(x=>x===1).length;
 if(a<b||a>b+1||a+b!==value.moves)return null;
 for(let c=0;c<FOUR_COLS;c++){
  let occupied=false;
  for(let r=0;r<FOUR_ROWS;r++){
   const x=value.board[r*FOUR_COLS+c];
   if(x!==null)occupied=true;
   if(occupied&&x===null)return null;
  }
 }
 if(![null,0,1,"draw"].includes(value.winner))return null;
 if(value.turn!==0&&value.turn!==1)return null;
 return {board:value.board.slice(),turn:value.turn,winner:value.winner,moves:value.moves};
}

export const HOCKEY_W=360,HOCKEY_H=520;
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
export function newHockey(){
 return {phase:"ready",score:[0,0],paddles:[{x:180,y:94},{x:180,y:426}],
  puck:{x:180,y:260,vx:115,vy:175},winner:null};
}
export function stepHockey(state,targets,dt){
 if(state.phase!=="playing")return state;
 const t=clamp(Number(dt)||0,0,.04);
 const paddles=state.paddles.map((p,i)=>{
  const desired=targets?.[i]||p;
  const x=clamp(Number.isFinite(desired.x)?desired.x:p.x,26,HOCKEY_W-26);
  const low=i===0?26:HOCKEY_H/2+30,high=i===0?HOCKEY_H/2-30:HOCKEY_H-26;
  const y=clamp(Number.isFinite(desired.y)?desired.y:p.y,low,high);
  const dx=x-p.x,dy=y-p.y,dist=Math.hypot(dx,dy);
  const factor=dist>.01?Math.min(1,740*t/dist):0;
  return {x:p.x+dx*factor,y:p.y+dy*factor};
 });
 const puck={...state.puck};
 const radius=11,mallet=24;
 puck.x+=puck.vx*t;puck.y+=puck.vy*t;
 if(puck.x<radius){puck.x=radius;puck.vx=Math.abs(puck.vx);}
 if(puck.x>HOCKEY_W-radius){puck.x=HOCKEY_W-radius;puck.vx=-Math.abs(puck.vx);}
 for(let i=0;i<2;i++){
  const pad=paddles[i],dx=puck.x-pad.x,dy=puck.y-pad.y,d=Math.hypot(dx,dy);
  if(d>radius+mallet||!(i===0?puck.vy<0:puck.vy>0))continue;
  const sign=i===0?1:-1;
  const impact=clamp(dx/(radius+mallet),-1,1);
  puck.x=pad.x+Math.max(-radius-mallet,Math.min(radius+mallet,dx));
  puck.y=pad.y+sign*(Math.sqrt(Math.max(0,(radius+mallet)**2-dx*dx))+1);
  puck.vx=clamp(puck.vx*.65+impact*185,-320,320);
  puck.vy=sign*clamp(Math.abs(puck.vy)*1.055+5,190,440);
 }
 if(puck.y<=radius||puck.y>=HOCKEY_H-radius){
  const top=puck.y<=radius,scorer=top?1:0;
  if(Math.abs(puck.x-HOCKEY_W/2)<=84){
   const score=state.score.slice();score[scorer]++;
   const winner=score[scorer]>=5?scorer:null;
   return {...state,score,paddles,winner,phase:winner===null?"playing":"finished",
    puck:{x:HOCKEY_W/2,y:HOCKEY_H/2,vx:(score[0]+score[1])%2?-105:105,
     vy:scorer===0?170:-170}};
  }
  puck.y=top?radius:HOCKEY_H-radius;puck.vy=top?Math.abs(puck.vy):-Math.abs(puck.vy);
 }
 return {...state,paddles,puck};
}
