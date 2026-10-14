import { canAfford, consumeCost } from './progression.js';

// First controllable ground unit; all costs and limits live outside the UI.
export const SOLDIER = Object.freeze({
  cost: Object.freeze({lead:12,iron:4}), health:75, speed:2.35,
  range:4.2, damage:12, reload:0.85, projectileSpeed:19
});
export const MAX_CONTROLLED_UNITS = 12;
export const TRAIN_SECONDS = 4;
export const TRAIN_QUEUE_LIMIT = 3;
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
    this.factories=new Set([...world.structures.values()]
      .filter(e=>e.type==='unitFactory').map(e=>e.id));
    this.unsubscribe=world.subscribe(({type,entity})=>{
      if(entity?.type!=='unitFactory')return;
      if(type==='place')this.factories.add(entity.id);
      else if(type==='remove')this.factories.delete(entity.id);
    });
    // Rebuild transient waypoints from persisted orders after page reload.
    for(const unit of world.units.entities.values()){
      if(unit.role!=='soldier')continue;
      if(unit.attackTargetId)this.order(unit.id,{targetId:unit.attackTargetId,slot:unit.formationGoal});
      else if(unit.goal)this.order(unit.id,unit.goal);
    }
  }
  // Training belongs to a powered factory; funds are charged on queueing.
  train(ownerId='north',factoryId=null) {
    const world=this.world;
    const factory=factoryId==null
      ? [...world.structures.values()].find(e=>e.type==='unitFactory'&&e.ownerId===ownerId&&e.enabled&&e.health>0)
      : world.structures.get(factoryId);
    if(!factory||factory.type!=='unitFactory'||factory.ownerId!==ownerId||
      !factory.enabled||factory.health<=0)return {ok:false,reason:'factory'};
    const active=[...world.units.entities.values()].filter(e=>e.role==='soldier'&&e.ownerId===ownerId).length;
    const queued=[...world.structures.values()].filter(e=>e.type==='unitFactory'&&e.ownerId===ownerId)
      .reduce((sum,e)=>sum+(e.trainQueued??0),0);
    if(world.units.entities.size+queued>=MAX_UNITS||active+queued>=MAX_CONTROLLED_UNITS)
      return {ok:false,reason:'limit'};
    if((factory.trainQueued??0)>=TRAIN_QUEUE_LIMIT)return {ok:false,reason:'queue'};
    const wallet=world.walletFor(ownerId);
    if(world.survival&&!canAfford(wallet,SOLDIER.cost))
      return {ok:false,reason:'materials',cost:SOLDIER.cost};
    if(world.survival)consumeCost(wallet,SOLDIER.cost);
    factory.trainQueued=(factory.trainQueued??0)+1;
    factory.trainProgress=factory.trainProgress??0;
    world.changed('unit-production',factory);
    return {ok:true,factory,queued:factory.trainQueued};
  }
  spawnAtFactory(factory) {
    const world=this.world,units=world.units.entities;
    for(let y=factory.y-1;y<=factory.y+factory.height;y++)
      for(let x=factory.x-1;x<=factory.x+factory.width;x++){
        if(x>=factory.x&&x<factory.x+factory.width&&
          y>=factory.y&&y<factory.y+factory.height)continue;
        if(!passable(world,x,y))continue;
        if([...units.values()].some(e=>Math.hypot(e.x-x-.5,e.y-y-.5)<.8))continue;
        return world.units.spawn({x:x+.5,y:y+.5,prevX:x+.5,prevY:y+.5,
          ownerId:factory.ownerId,health:SOLDIER.health,speed:SOLDIER.speed,
          role:'soldier',mobility:'ground',path:[],goal:null,attackTargetId:null,
          formationGoal:null,cooldown:0});
      }
    return null;
  }
  // Each unit gets a distinct reachable tile, preserving its rough relative
  // position in the squad. This is bounded because unit cap is only 12.
  orderGroup(ids,destination) {
    const units=[...new Set(ids)].map(id=>this.world.units.get(id))
      .filter(u=>u?.role==='soldier');
    if(!units.length)return {ok:false,reason:'unit'};
    if(units.some(u=>u.ownerId!==units[0].ownerId))
      return {ok:false,reason:'friendly'};
    const target=destination?.targetId
      ? this.world.structures.get(destination.targetId):null;
    if(destination?.targetId&&(!target||target.ownerId===units[0].ownerId))
      return {ok:false,reason:'target'};
    const center=target?middle(target):{x:destination?.x,y:destination?.y};
    if(!Number.isFinite(center.x)||!Number.isFinite(center.y))
      return {ok:false,reason:'position'};
    const centroid={x:units.reduce((a,u)=>a+u.x,0)/units.length,
      y:units.reduce((a,u)=>a+u.y,0)/units.length};
    const selected=new Set(units.map(u=>u.id));
    const occupied=[...this.world.units.entities.values()]
      .filter(u=>u.role==='soldier'&&!selected.has(u.id))
      .map(u=>u.goal??u.formationGoal??{x:u.x,y:u.y});
    const slots=[];
    const radius=Math.max(3,Math.ceil(Math.sqrt(units.length))+1);
    for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
      const x=Math.floor(center.x)+dx,y=Math.floor(center.y)+dy;
      if(!passable(this.world,x,y))continue;
      const point={x:x+.5,y:y+.5};
      if(target&&!withinRange(this.world,point,center,SOLDIER.range-.15,this.combat))continue;
      if(occupied.some(p=>dist(p,point)<.85))continue;
      slots.push(point);
    }
    if(slots.length<units.length)return {ok:false,reason:'space'};
    const used=new Set(),assignments=[];
    for(const unit of units){
      const wanted={x:center.x+unit.x-centroid.x,y:center.y+unit.y-centroid.y};
      const options=slots.filter(p=>!used.has(key(p.x,p.y)))
        .sort((a,b)=>(dist(a,wanted)+.3*dist(a,center)+.025*dist(a,unit))-
                      (dist(b,wanted)+.3*dist(b,center)+.025*dist(b,unit)));
      let chosen=null;
      for(const point of options.slice(0,24)){
        const route=routeUnit(this.world,unit,point);
        if(!route)continue;
        chosen={unit,point,route};break;
      }
      if(!chosen)continue;
      used.add(key(chosen.point.x,chosen.point.y));
      assignments.push(chosen);
    }
    if(!assignments.length)return {ok:false,reason:'path'};
    for(const {unit,point,route} of assignments){
      unit.path=route;unit.pathIndex=0;
      unit.goal=target?null:{...point};
      unit.formationGoal=target?{...point}:null;
      unit.attackTargetId=target?.id??null;
      this.world.changed('unit-order',unit);
    }
    return {ok:true,count:assignments.length,total:units.length,
      positions:assignments.map(a=>({...a.point}))};
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
    const slot=target&&destination.slot&&Number.isFinite(destination.slot.x)&&
      Number.isFinite(destination.slot.y)?destination.slot:null;
    if(slot&&(!passable(this.world,Math.floor(slot.x),Math.floor(slot.y))||
       !withinRange(this.world,slot,goal,SOLDIER.range-.15,this.combat)))
      return {ok:false,reason:'position'};
    const reach=slot?0:target?SOLDIER.range-0.3:0.01;
    const route=routeUnit(this.world,unit,slot??goal,reach,slot?null:target?this.combat:null);
    if(!route)return {ok:false,reason:'path'};
    unit.path=route;unit.pathIndex=0;
    unit.goal=target?null:{x:goal.x,y:goal.y};
    unit.formationGoal=slot?{...slot}:null;
    unit.attackTargetId=target?.id??null;
    this.world.changed('unit-order',unit);
    return {ok:true,length:route.length};
  }
  stop(unitId) {
    const unit=this.world.units.get(unitId);
    if(!unit||unit.role!=='soldier')return false;
    unit.path=[];unit.pathIndex=0;unit.goal=null;unit.formationGoal=null;unit.attackTargetId=null;
    this.world.changed('unit-order',unit);
    return true;
  }
  step(dt) {
    if(!Number.isFinite(dt)||dt<=0)return false;
    const delta=Math.min(.5,dt),world=this.world,units=world.units.entities;
    let active=false;
    for(const id of this.factories){
      const factory=world.structures.get(id);
      if(!factory)continue;
      if(!(factory.trainQueued>0)){
        if(factory.activity==='processing'||factory.activity==='no-power')factory.activity='idle';
        continue;
      }
      active=true;
      if(!factory.enabled||factory.health<=0||!factory.powered){
        factory.activity='no-power';
        continue;
      }
      factory.activity='processing';
      factory.trainProgress=Math.min(TRAIN_SECONDS,(factory.trainProgress??0)+delta);
      if(factory.trainProgress<TRAIN_SECONDS)continue;
      if(units.size>=MAX_UNITS||!this.spawnAtFactory(factory))continue;
      factory.trainQueued--;
      factory.trainProgress=0;
      if(!factory.trainQueued)factory.activity='idle';
      world.changed('unit-production',factory);
    }
    for(const unit of units.values()){
      if(unit.role!=='soldier')continue;
      active=true;
      unit.prevX=unit.x;unit.prevY=unit.y;
      unit.cooldown=Math.max(0,(unit.cooldown??0)-delta);
      const target=world.structures.get(unit.attackTargetId);
      if(unit.attackTargetId&&(!target||target.ownerId===unit.ownerId)){
        unit.attackTargetId=null;unit.path=[];unit.goal=null;unit.formationGoal=null;
      }
      const enemyCenter=target?middle(target):null;
      const attacking=enemyCenter&&withinRange(world,unit,enemyCenter,SOLDIER.range,this.combat);
      if((!attacking||unit.formationGoal)&&unit.pathIndex<(unit.path?.length??0)){
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
  dispose(){this.unsubscribe();this.factories.clear();}
}
