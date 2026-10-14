import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { Combat } from '../src/combat.js';
import { UnitCommand, routeUnit, SOLDIER, MAX_CONTROLLED_UNITS, TRAIN_SECONDS } from '../src/unit-command.js';
import { PowerGrid } from '../src/power.js';
import { BUILD_COSTS } from '../src/progression.js';
import { saveDraft, restoreDraft } from '../src/local-draft.js';

function memoryStorage(){
  const data=new Map();
  return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),
    removeItem:key=>data.delete(key)};
}
function finishOne(world,commands,factory) {
  const previous=world.units.entities.size;
  factory.powered=true;
  for(let i=0;i<Math.ceil(TRAIN_SECONDS/.2)+2;i++)commands.step(.2);
  assert.equal(world.units.entities.size,previous+1);
  return [...world.units.entities.values()].at(-1);
}
function queueOne(world,commands,factory) {
  const result=commands.train(factory.ownerId,factory.id);
  assert.equal(result.ok,true,JSON.stringify(result));
  return finishOne(world,commands,factory);
}
test('dedicated factory is constructible and requires stocked materials',()=>{
  const w=new World();w.place('tower',0,0,0,'north');w.survival=true;
  assert.equal(w.build('unitFactory',3,1,0,'north').reason,'materials');
  for(const [item,count] of Object.entries(BUILD_COSTS.unitFactory))
    w.credit('north',item,count);
  const factory=w.build('unitFactory',3,1,0,'north');
  assert.equal(factory.ok,true);
  assert.equal(factory.entity.powerUse,2);
  assert.equal(w.walletFor('north').parts,0);
});
test('queue consumes lead and iron, waits for power then deploys a single soldier',()=>{
  const world=new World(),factory=world.place('unitFactory',0,0,0,'north').entity;
  world.survival=true;
  const combat=new Combat(world),commands=new UnitCommand(world,combat);
  assert.equal(commands.train('north').reason,'materials');
  world.credit('north','lead',SOLDIER.cost.lead);
  world.credit('north','iron',SOLDIER.cost.iron);
  assert.equal(commands.train('north',factory.id).ok,true);
  assert.equal(world.units.entities.size,0);
  assert.equal(factory.trainQueued,1);
  assert.equal(world.walletFor('north').iron,0);
  for(let i=0;i<50;i++)commands.step(.2);
  assert.equal(factory.trainProgress,0,'no electricity means no progress');
  const soldier=finishOne(world,commands,factory);
  assert.equal(soldier.role,'soldier');
  assert.equal(soldier.health,SOLDIER.health);
  assert.equal(factory.trainQueued,0);
  assert.equal(world.getAt(Math.floor(soldier.x),Math.floor(soldier.y)),null);
  combat.dispose();
});
test('factory queue has capacity and training persists after reload',()=>{
  const world=new World(),factory=world.place('unitFactory',0,0,0,'north').entity;
  const combat=new Combat(world),commands=new UnitCommand(world,combat);
  for(let i=0;i<3;i++)assert.equal(commands.train('north',factory.id).ok,true);
  assert.equal(commands.train('north',factory.id).reason,'queue');
  factory.powered=true;
  for(let i=0;i<7;i++)commands.step(.2);
  const storage=memoryStorage();
  assert.equal(saveDraft(world,storage),true);
  const restored=new World();
  assert.equal(restoreDraft(restored,storage).restored,true);
  const resumedFactory=restored.getAt(0,0);
  assert.equal(resumedFactory.trainQueued,3);
  assert.ok(resumedFactory.trainProgress>1);
  const resumed=new UnitCommand(restored,new Combat(restored));
  resumedFactory.powered=true;
  for(let i=0;i<65;i++)resumed.step(.2);
  assert.equal(restored.units.entities.size,3);
  assert.equal(resumedFactory.trainQueued,0);
  combat.dispose();
});
test('single soldier walks around walls and stops on command',()=>{
  const world=new World(),factory=world.place('unitFactory',-5,-5,0,'north').entity;
  world.place('wall',1,0,0,'south');world.place('wall',1,1,0,'south');
  const combat=new Combat(world),commands=new UnitCommand(world,combat);
  const soldier=queueOne(world,commands,factory);
  assert.equal(commands.order(soldier.id,{x:4.5,y:.5}).ok,true);
  for(let i=0;i<90;i++){
    combat.step(.2);commands.step(.2);
    assert.equal(world.getAt(Math.floor(soldier.x),Math.floor(soldier.y)),null);
  }
  assert.ok(Math.hypot(soldier.x-4.5,soldier.y-.5)<.1);
  assert.equal(commands.order(soldier.id,{x:7.5,y:7.5}).ok,true);
  assert.equal(commands.stop(soldier.id),true);
  const x=soldier.x,y=soldier.y;
  commands.step(.2);
  assert.equal(soldier.x,x);assert.equal(soldier.y,y);
  combat.dispose();
});
test('group movement assigns unique passable formation slots and arrives without stacking',()=>{
  const world=new World(),factory=world.place('unitFactory',-7,-7,0,'north').entity;
  const combat=new Combat(world),commands=new UnitCommand(world,combat);
  const soldiers=[];
  for(let i=0;i<4;i++)soldiers.push(queueOne(world,commands,factory));
  world.place('wall',8,7,0,'south');world.place('wall',8,8,0,'south');
  const result=commands.orderGroup(soldiers.map(u=>u.id),{x:9.5,y:8.5});
  assert.equal(result.ok,true);
  assert.equal(result.count,4);
  const ids=result.positions.map(p=>p.x+','+p.y);
  assert.equal(new Set(ids).size,4,'one distinct destination cell per soldier');
  for(const p of result.positions)assert.equal(world.getAt(Math.floor(p.x),Math.floor(p.y)),null);
  for(let i=0;i<160;i++)commands.step(.2);
  for(const soldier of soldiers)
    assert.ok(Math.hypot(soldier.x-soldier.goal.x,soldier.y-soldier.goal.y)<.1);
  const arrived=new Set(soldiers.map(u=>Math.floor(u.x)+','+Math.floor(u.y)));
  assert.equal(arrived.size,4,'no final overlap');
  combat.dispose();
});
test('attack group reserves different reachable firing positions',()=>{
  const world=new World(),factory=world.place('unitFactory',-7,-7,0,'north').entity;
  const enemy=world.place('wall',9,1,0,'south').entity;
  const combat=new Combat(world),commands=new UnitCommand(world,combat);
  const soldiers=Array.from({length:3},()=>queueOne(world,commands,factory));
  const result=commands.orderGroup(soldiers.map(u=>u.id),{targetId:enemy.id});
  assert.equal(result.ok,true);
  assert.equal(result.count,3);
  assert.equal(new Set(result.positions.map(p=>p.x+','+p.y)).size,3);
  assert.ok(soldiers.every(u=>u.attackTargetId===enemy.id&&u.formationGoal));
  for(const point of result.positions)
    assert.ok(Math.hypot(point.x-(enemy.x+.5),point.y-(enemy.y+.5))<=SOLDIER.range);
  combat.dispose();
});
test('individual soldier projectiles damage enemies without friendly fire',()=>{
  const w=new World(),home=w.place('tower',0,0,0,'north').entity;
  const factory=w.place('unitFactory',-5,-5,0,'north').entity;
  const enemy=w.place('wall',7,0,0,'south').entity;
  const combat=new Combat(w),commands=new UnitCommand(w,combat);
  const soldier=queueOne(w,commands,factory);
  assert.equal(commands.order(soldier.id,{targetId:home.id}).reason,'friendly');
  assert.equal(commands.order(soldier.id,{targetId:enemy.id}).ok,true);
  for(let i=0;i<110 && enemy.health===enemy.maxHealth;i++){
    combat.step(.2);commands.step(.2);
  }
  assert.ok(enemy.health<enemy.maxHealth);
  assert.equal(home.health,home.maxHealth);
  combat.dispose();
});
test('existing enemy turret targets soldiers without taking over unit movement',()=>{
  const w=new World(),turret=w.place('turret',0,0,0,'south').entity;
  turret.powered=true;
  const factory=w.place('unitFactory',5,5,0,'north').entity;
  const combat=new Combat(w),commands=new UnitCommand(w,combat);
  const soldier=queueOne(w,commands,factory);
  soldier.x=4.5;soldier.y=.5;soldier.prevX=soldier.x;soldier.prevY=soldier.y;
  combat.step(.2);
  assert.equal(soldier.x,4.5);assert.equal(soldier.y,.5);
  assert.ok([...w.projectiles.entities.values()].some(shot=>shot.targetId===soldier.id));
  combat.dispose();
});
test('saved group formation orders restore without collapsing into one destination',()=>{
  const w=new World(),factory=w.place('unitFactory',-5,-5,0,'north').entity;
  const combat=new Combat(w),commands=new UnitCommand(w,combat);
  const units=[queueOne(w,commands,factory),queueOne(w,commands,factory)];
  const ordered=commands.orderGroup(units.map(u=>u.id),{x:12.5,y:8.5});
  assert.equal(ordered.count,2);
  const storage=memoryStorage();
  assert.equal(saveDraft(w,storage),true);
  const restored=new World();
  assert.equal(restoreDraft(restored,storage).restored,true);
  const revived=new UnitCommand(restored,new Combat(restored));
  const values=[...restored.units.entities.values()];
  assert.equal(values.length,2);
  assert.equal(new Set(values.map(u=>u.goal.x+','+u.goal.y)).size,2);
  assert.ok(values.every(u=>u.path.length>0));
  for(let i=0;i<160;i++)revived.step(.2);
  assert.equal(new Set(values.map(u=>Math.floor(u.x)+','+Math.floor(u.y))).size,2);
  combat.dispose();
});
test('bounded route search does not cross a sealed wall',()=>{
  const w=new World({width:8,height:8,chunkSize:4});
  for(let y=-4;y<4;y++)w.place('wall',0,y,0,'south');
  assert.equal(routeUnit(w,{x:-1.5,y:-.5},{x:2.5,y:-.5}),null);
  assert.equal(MAX_CONTROLLED_UNITS,12);
});
