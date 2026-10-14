import { canAfford, consumeCost } from './progression.js';

// First controllable ground unit; all costs and limits live outside the UI.
export const SOLDIER = Object.freeze({
  cost: Object.freeze({lead:12,iron:4}), health:75, speed:2.35,
  range:4.2, damage:12, reload:0.85, projectileSpeed:19
});
export const MAX_CONTROLLED_UNITS = 12;
const MAX_UNITS = 24;
const MAX_ROUTE_NODES = 12000;
const MAX_ROUTE_DISTANCE = 155;
const DIRS = [[1,0],[-1,0],[0,1],[0,-1]];
const key = (x,y) => x + ',' + y;
const dist = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
const middle = e => ({x:e.x+e.width/2,y:e.y+e.height/2});

function passable(world,x,y) {
  return world.inBounds(x,y) && !world.getAt(x,y) &&
    !world.terrain?.isCliffAt(x,y);
}
function withinRange(world,source,destination,radius,combat) {
  return dist(source,destination) <= radius &&
    (!combat || combat.lineClear(source,destination));
}
// Binary heap to avoid sorting a growing frontier for every path node.
function push(heap,node) {
  let n=heap.length;
  heap.push(node);
  while(n>0){
    const p=(n-1)>>1;
    if(heap[p].priority<=node.priority)break;
    heap[n]=heap[p];n=p;
  }
  heap[n]=node;
}
function pop(heap) {
  const result=heap[0],last=heap.pop();
  if(heap.length){
    let i=0;
    while(true){
      const left=i*2+1;
      if(left>=heap.length)break;
      const right=left+1;
      const child=right<heap.length&&heap[right].priority<heap[left].priority?right:left;
      if(last.priority<=heap[child].priority)break;
      heap[i]=heap[child];i=child;
    }
    heap[i]=last;
  }
  return result;
}
export function routeUnit(world,start,goal,reach=0,combat=null) {
  if (![start.x,start.y,goal.x,goal.y,reach].every(Number.isFinite))return null;
  const sx=Math.floor(start.x),sy=Math.floor(start.y);
  if(!world.inBounds(sx,sy))return null;
  const source={x:sx+.5,y:sy+.5};
  const heuristic=(x,y)=>Math.max(0,Math.hypot(x+.5-goal.x,y+.5-goal.y)-reach);
  const frontier=[],scores=new Map([[key(sx,sy),0]]),parents=new Map();
  push(frontier,{x:sx,y:sy,g:0,priority:heuristic(sx,sy)});
  let visited=0;
  while(frontier.length&&visited++<MAX_ROUTE_NODES){
    const node=pop(frontier),id=key(node.x,node.y);
    if(node.g!==scores.get(id))continue;
    const here={x:node.x+.5,y:node.y+.5};
    if(withinRange(world,here,goal,reach+.001,combat)){
      const cells=[];
      let current=id;
      while(current!==key(sx,sy)){
        const pos=current.split(',').map(Number);
        cells.push({x:pos[0]+.5,y:pos[1]+.5});
        current=parents.get(current);
        if(!current)return null;
      }
      return cells.reverse();
    }
    for(const [dx,dy] of DIRS){
      const x=node.x+dx,y=node.y+dy;
      if(Math.abs(x-sx)+Math.abs(y-sy)>MAX_ROUTE_DISTANCE ||
        !passable(world,x,y))continue;
      const next=key(x,y),g=node.g+1;
      if(g>=(scores.get(next)??Infinity))continue;
      scores.set(next,g);parents.set(next,id);
      push(frontier,{x,y,g,priority:g+heuristic(x,y)});
    }
  }
  return null;
}
export class UnitCommand {
  constructor(world,combat) {
    this.world=world;this.combat=combat;
    // Rebuild transient waypoints from persisted orders after page reload.
    for(const unit of world.units.entities.values()){
      if(unit.role!=='soldier')continue;
      if(unit.attackTargetId)this.order(unit.id,{targetId:unit.attackTargetId});
      else if(unit.goal)this.order(unit.id,unit.goal);
    }
  }
  train(ownerId='north',towerId=null) {
    const world=this.world;
    const tower=towerId==null
      ? [...world.structures.values()].find(e=>e.type==='tower'&&e.ownerId===ownerId&&e.enabled&&e.health>0)
      : world.structures.get(towerId);
    if(!tower||tower.type!=='tower'||tower.ownerId!==ownerId||
      !tower.enabled||tower.health<=0)return {ok:false,reason:'tower'};
    const units=world.units.entities;
    if(units.size>=MAX_UNITS||
      [...units.values()].filter(e=>e.role==='soldier'&&e.ownerId===ownerId).length>=MAX_CONTROLLED_UNITS)
      return {ok:false,reason:'limit'};
    const wallet=world.walletFor(ownerId);
    if(world.survival&&!canAfford(wallet,SOLDIER.cost))
      return {ok:false,reason:'materials',cost:SOLDIER.cost};
    // Spawn only on free, passable perimeter tiles. Never overlap a structure.
    let spot=null;
    for(let y=tower.y-1;y<=tower.y+tower.height;y++){
      for(let x=tower.x-1;x<=tower.x+tower.width;x++){
        if(x>=tower.x&&x<tower.x+tower.width&&
          y>=tower.y&&y<tower.y+tower.height)continue;
        if(!passable(world,x,y))continue;
        if([...units.values()].some(e=>Math.hypot(e.x-(x+.5),e.y-(y+.5))<.7))continue;
        spot={x:x+.5,y:y+.5};break;
      }
      if(spot)break;
    }
    if(!spot)return {ok:false,reason:'spawn'};
    const unit=world.units.spawn({...spot,prevX:spot.x,prevY:spot.y,
      ownerId,health:SOLDIER.health,speed:SOLDIER.speed,role:'soldier',
      mobility:'ground',path:[],goal:null,attackTargetId:null,cooldown:0});
    if(!unit)return {ok:false,reason:'spawn'};
    if(world.survival)consumeCost(wallet,SOLDIER.cost);
    world.changed('economy',null);
    return {ok:true,unit};
  }
  order(unitId,destination) {
    const unit=this.world.units.get(unitId);
    if(!unit||unit.role!=='soldier')return {ok:false,reason:'unit'};
    const target=destination?.targetId
      ? this.world.structures.get(destination.targetId) : null;
    if(destination?.targetId&&!target)return {ok:false,reason:'target'};
    if(target?.ownerId===unit.ownerId)return {ok:false,reason:'friendly'};
    const goal=target?middle(target):{x:destination?.x,y:destination?.y};
    if(!Number.isFinite(goal.x)||!Number.isFinite(goal.y))
      return {ok:false,reason:'position'};
    if(!target&&!passable(this.world,Math.floor(goal.x),Math.floor(goal.y)))
      return {ok:false,reason:'blocked'};
    const reach=target?SOLDIER.range-0.3:0.01;
    const route=routeUnit(this.world,unit,goal,reach,target?this.combat:null);
    if(!route)return {ok:false,reason:'path'};
    unit.path=route;unit.pathIndex=0;
    unit.goal=target?null:{x:goal.x,y:goal.y};
    unit.attackTargetId=target?.id??null;
    this.world.changed('unit-order',unit);
    return {ok:true,length:route.length};
  }
  stop(unitId) {
    const unit=this.world.units.get(unitId);
    if(!unit||unit.role!=='soldier')return false;
    unit.path=[];unit.pathIndex=0;unit.goal=null;unit.attackTargetId=null;
    this.world.changed('unit-order',unit);
    return true;
  }
  step(dt) {
    if(!Number.isFinite(dt)||dt<=0)return false;
    const delta=Math.min(.5,dt),world=this.world,units=world.units.entities;
    let active=false;
    for(const unit of units.values()){
      if(unit.role!=='soldier')continue;
      active=true;
      unit.prevX=unit.x;unit.prevY=unit.y;
      unit.cooldown=Math.max(0,(unit.cooldown??0)-delta);
      const target=world.structures.get(unit.attackTargetId);
      if(unit.attackTargetId&&(!target||target.ownerId===unit.ownerId)){
        unit.attackTargetId=null;unit.path=[];unit.goal=null;
      }
      const enemyCenter=target?middle(target):null;
      const attacking=enemyCenter&&withinRange(world,unit,enemyCenter,SOLDIER.range,this.combat);
      if(!attacking&&unit.pathIndex<(unit.path?.length??0)){
        let travel=unit.speed*delta;
        while(travel>0&&unit.pathIndex<unit.path.length){
          const point=unit.path[unit.pathIndex];
          if(!passable(world,Math.floor(point.x),Math.floor(point.y))){
            unit.path=[];unit.goal=null;break;
          }
          const distance=dist(unit,point);
          if(distance<=travel+.000001){
            unit.x=point.x;unit.y=point.y;travel-=distance;unit.pathIndex++;
          }else{
            unit.x+=(point.x-unit.x)/distance*travel;
            unit.y+=(point.y-unit.y)/distance*travel;
            travel=0;
          }
        }
      }
      if(unit.cooldown>0||world.projectiles.entities.size>=64)continue;
      let fireAt=attacking?{entity:target,point:enemyCenter,kind:'structure'}:null;
      if(!fireAt){
        let nearest=SOLDIER.range;
        for(const enemy of units.values()){
          if(enemy.id===unit.id||enemy.ownerId===unit.ownerId||enemy.health<=0)continue;
          const d=dist(unit,enemy);
          if(d<nearest&&withinRange(world,unit,enemy,SOLDIER.range,this.combat)){
            fireAt={entity:enemy,point:enemy,kind:'unit'};nearest=d;
          }
        }
      }
      if(!fireAt)continue;
      world.projectiles.spawn({
        x:unit.x,y:unit.y,prevX:unit.x,prevY:unit.y,
        health:1,ownerId:unit.ownerId,targetId:fireAt.entity.id,
        targetKind:fireAt.kind,speed:SOLDIER.projectileSpeed,damage:SOLDIER.damage
      });
      unit.cooldown=SOLDIER.reload;
      this.combat.visualEvents.push({type:'fire',x:unit.x,y:unit.y,
        angle:Math.atan2(fireAt.point.y-unit.y,fireAt.point.x-unit.x)});
    }
    return active;
  }
}
