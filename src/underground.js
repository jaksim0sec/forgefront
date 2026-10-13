import { BUILD_COSTS, canAfford } from './progression.js';
import { DIRECTIONS } from './ports.js';

export const TUNNEL_MAX_SPAN = 7;
export function tunnelGeometry(start,end) {
  const dx=end.x-start.x,dy=end.y-start.y;
  const distance=Math.abs(dx)+Math.abs(dy);
  if(!distance || (dx && dy) || distance<2 || distance>TUNNEL_MAX_SPAN)
    return {ok:false,reason:'length'};
  const rotation=dx>0?1:dx<0?3:dy>0?2:0;
  return {ok:true,rotation,distance};
}
export function buildTunnel(world,connections,start,end,ownerId) {
  const line=tunnelGeometry(start,end);
  if(!line.ok)return line;
  const first=world.canBuild('tunnelEntrance',start.x,start.y,line.rotation,ownerId);
  if(!first.ok)return first;
  const last=world.canBuild('tunnelExit',end.x,end.y,line.rotation,ownerId);
  if(!last.ok)return last;
  if(world.survival) {
    const total={};
    for(const type of ['tunnelEntrance','tunnelExit'])
      for(const [item,amount] of Object.entries(BUILD_COSTS[type]))
        total[item]=(total[item]??0)+amount;
    if(!canAfford(world.walletFor(ownerId),total))return {ok:false,reason:'materials',cost:total};
  }
  let entrance,exit;
  world.batch(()=>{
    const a=world.build('tunnelEntrance',start.x,start.y,line.rotation,ownerId);
    if(!a.ok)return;
    entrance=a.entity;
    const b=world.build('tunnelExit',end.x,end.y,line.rotation,ownerId);
    if(!b.ok){world.remove(entrance.id);entrance=null;return;}
    exit=b.entity;
    entrance.pairId=exit.id;
    exit.pairId=entrance.id;
  });
  if(!entrance || !exit)return {ok:false,reason:'placement'};
  connections.linkTunnel(entrance,exit);
  return {ok:true,entity:entrance,exit,distance:line.distance};
}
