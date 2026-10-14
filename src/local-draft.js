import { World, STRUCTURES } from './world.js';

export const DRAFT_KEY='forgefront:local-world:1';
const FIELDS=['health','enabled','progress','moveProgress','itemId','itemCount',
  'resourceId','burnRemaining','fuelProgress','fuelCharges','routeCursor',
  'lastSourceId','pairId','activity','inventory'];
const nonNegative=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
export function saveDraft(world,storage) {
  if(!storage)return false;
  try {
    const structures=[...world.structures.values()].map(e=>{
      const out={id:e.id,type:e.type,x:e.x,y:e.y,rotation:e.rotation,
        ownerId:e.ownerId,inputSide:e.inputSide};
      for(const field of FIELDS)if(e[field]!==undefined)out[field]=e[field];
      return out;
    });
    const wallets=Object.fromEntries([...world.stockpiles].map(([id,w])=>[id,{...w}]));
    const units=[...world.units.entities.values()].filter(e=>e.role==='soldier')
      .map(e=>({x:e.x,y:e.y,health:e.health,ownerId:e.ownerId,
        goal:e.goal,attackTargetId:e.attackTargetId,cooldown:e.cooldown}));
    storage.setItem(DRAFT_KEY,JSON.stringify({schema:1,structures,wallets,units}));
    return true;
  }catch{return false;} // Storage may be disabled or full.
}
/** Restore atomically: a conflicting footprint, missing type or malformed pair
 * discards the draft; no partial restoration is applied to the live World.
 */
export function restoreDraft(world,storage) {
  if(!storage)return {restored:false,reason:'unavailable'};
  let raw;
  try{raw=storage.getItem(DRAFT_KEY);}catch{return {restored:false,reason:'unavailable'};}
  if(!raw)return {restored:false,reason:'empty'};
  try {
    const snapshot=JSON.parse(raw);
    if(snapshot.schema!==1||!Array.isArray(snapshot.structures)||snapshot.structures.length>100000)
      throw Error('schema');
    const stage=new World(world.config);
    stage.terrain=world.terrain;
    const remap=new Map();
    const savedById=new Map(); // Also resolves reciprocal tunnel pairs in O(1).
    for(const old of snapshot.structures){
      if(!old||!Number.isSafeInteger(old.id)||savedById.has(old.id)||!STRUCTURES[old.type])
        throw Error('invalid');
      savedById.set(old.id,old);
      const placed=stage.place(old.type,old.x,old.y,old.rotation,old.ownerId,old.inputSide);
      if(!placed.ok)throw Error('conflict');
      const e=placed.entity;
      remap.set(old.id,e.id);
      for(const field of FIELDS){
        const value=old[field];
        if(value===undefined||field==='pairId'||field==='lastSourceId')continue;
        if(field==='inventory'){
          if(value!==null && typeof value==='object' && !Array.isArray(value) && e.inventory)
            e.inventory=Object.fromEntries(Object.entries(value).filter(([k,n])=>nonNegative(n)));
        }else if(field==='itemId'||field==='resourceId'||field==='activity'){
          if(value===null||typeof value==='string')e[field]=value;
        }else if(field==='enabled'){e.enabled=!!value;}
        else if(nonNegative(value))e[field]=value;
      }
      e.health=Math.min(e.maxHealth,e.health);
    }
    for(const old of snapshot.structures){
      const e=stage.structures.get(remap.get(old.id));
      if(old.pairId!=null){
        const other=stage.structures.get(remap.get(old.pairId));
        if(!other || !(
          (e.type==='tunnelEntrance'&&other.type==='tunnelExit')||
          (e.type==='tunnelExit'&&other.type==='tunnelEntrance')
        ))throw Error('pair');
        const reciprocal=savedById.get(old.pairId);
        if(reciprocal?.pairId!==old.id)throw Error('pair');
        e.pairId=other.id;
      }else if(e.type==='tunnelEntrance'||e.type==='tunnelExit')throw Error('pair');
      if(old.lastSourceId!=null)e.lastSourceId=remap.get(old.lastSourceId)??null;
    }
    if(snapshot.wallets&&typeof snapshot.wallets==='object'&&!Array.isArray(snapshot.wallets)){
      for(const [owner,items] of Object.entries(snapshot.wallets)){
        if(!items||typeof items!=='object'||Array.isArray(items))continue;
        stage.stockpiles.set(owner,Object.assign(Object.create(null),
          Object.fromEntries(Object.entries(items).filter(([id,n])=>nonNegative(n)))));
      }
    }
    if(Array.isArray(snapshot.units)){
      for(const old of snapshot.units.slice(0,12)){
        if(!old||![old.x,old.y,old.health].every(Number.isFinite)||
          old.health<=0||!stage.inBounds(Math.floor(old.x),Math.floor(old.y))||
          typeof old.ownerId!=='string')continue;
        const unit=stage.units.spawn({x:old.x,y:old.y,
          prevX:old.x,prevY:old.y,ownerId:old.ownerId,
          health:75,role:'soldier',speed:2.35,mobility:'ground',
          goal:old.goal&&Number.isFinite(old.goal.x)&&Number.isFinite(old.goal.y)
            ? {x:old.goal.x,y:old.goal.y}:null,
          attackTargetId:remap.get(old.attackTargetId)??null,
          cooldown:nonNegative(old.cooldown)?old.cooldown:0,path:[],pathIndex:0});
        if(unit)unit.health=Math.min(old.health,unit.maxHealth);
      }
    }
    world.structures=stage.structures;
    world.units=stage.units;
    world.chunks=stage.chunks;
    world.nextId=stage.nextId;
    world.stockpiles=stage.stockpiles;
    return {restored:true,count:world.structures.size};
  }catch(error){
    try{storage.removeItem(DRAFT_KEY);}catch{}
    return {restored:false,reason:'conflict'};
  }
}
export function attachDraftAutosave(world,storage){
  if(!storage)return ()=>{};
  let pending=null;
  const schedule=()=>{
    if(pending!==null)return;
    pending=setTimeout(()=>{pending=null;saveDraft(world,storage);},900);
  };
  const unsubscribe=world.subscribe(({type})=>{
    if(['place','remove','rotate','owner','state','economy','transfer','unit-order'].includes(type))schedule();
  });
  const heartbeat=setInterval(()=>{if(world.structures.size) schedule();},10000);
  const flush=()=>{
    if(pending!==null){clearTimeout(pending);pending=null;}
    saveDraft(world,storage);
  };
  window.addEventListener('pagehide',flush);
  document.addEventListener('visibilitychange',flush);
  return ()=>{unsubscribe();clearInterval(heartbeat);window.removeEventListener('pagehide',flush);
    document.removeEventListener('visibilitychange',flush);if(pending!==null)clearTimeout(pending);};
}
