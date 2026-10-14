import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { Combat } from '../src/combat.js';
import { UnitCommand, routeUnit, SOLDIER, MAX_CONTROLLED_UNITS } from '../src/unit-command.js';
import { saveDraft, restoreDraft } from '../src/local-draft.js';

function memoryStorage() {
  const data=new Map();
  return {getItem:key=>data.get(key)??null,
    setItem:(key,value)=>data.set(key,value),
    removeItem:key=>data.delete(key)};
}
test('command tower produces ground units using real nation stockpiles',()=>{
  const world=new World();
  world.place('tower',0,0,0,'north');
  world.survival=true;
  const combat=new Combat(world),commands=new UnitCommand(world,combat);
  assert.equal(commands.train('north').reason,'materials');
  assert.equal(world.units.entities.size,0);
  world.credit('north','lead',SOLDIER.cost.lead);
  world.credit('north','iron',SOLDIER.cost.iron);
  const result=commands.train('north');
  assert.equal(result.ok,true);
  assert.equal(world.walletFor('north').lead,0);
  assert.equal(world.walletFor('north').iron,0);
  assert.equal(result.unit.role,'soldier');
  assert.equal(result.unit.health,SOLDIER.health);
  assert.equal(world.getAt(Math.floor(result.unit.x),Math.floor(result.unit.y)),null);
  combat.dispose();
});

test('selected soldier walks around walls and stops on command',()=>{
  const world=new World();
  world.place('tower',-3,-3,0,'north');
  world.place('wall',1,0,0,'south');
  world.place('wall',1,1,0,'south');
  const combat=new Combat(world),commands=new UnitCommand(world,combat);
  const unit=commands.train('north').unit;
  assert.equal(commands.order(unit.id,{x:4.5,y:.5}).ok,true);
  assert.ok(unit.path.length>4);
  for(let n=0;n<60;n++){
    combat.step(.2);commands.step(.2);
    assert.equal(world.getAt(Math.floor(unit.x),Math.floor(unit.y)),null);
  }
  assert.ok(Math.hypot(unit.x-4.5,unit.y-.5)<.1);
  assert.equal(commands.order(unit.id,{x:7.5,y:7.5}).ok,true);
  assert.equal(commands.stop(unit.id),true);
  const position={x:unit.x,y:unit.y};
  commands.step(1);
  assert.equal(unit.x,position.x);assert.equal(unit.y,position.y);
  combat.dispose();
});

test('soldier projectiles damage enemy structures, not friendly structures',()=>{
  const world=new World();
  const home=world.place('tower',0,0,0,'north').entity;
  const enemy=world.place('wall',7,0,0,'south').entity;
  const combat=new Combat(world),commands=new UnitCommand(world,combat);
  const soldier=commands.train('north').unit;
  assert.equal(commands.order(soldier.id,{targetId:home.id}).reason,'friendly');
  assert.equal(commands.order(soldier.id,{targetId:enemy.id}).ok,true);
  let damaged=false;
  for(let i=0;i<90;i++){
    combat.step(.2);commands.step(.2);
    if(enemy.health<enemy.maxHealth){damaged=true;break;}
  }
  assert.ok(damaged);
  assert.equal(home.health,home.maxHealth);
  combat.dispose();
});

test('old turret AI targets soldiers but never moves them as scouts',()=>{
  const world=new World();
  const turret=world.place('turret',0,0,0,'south').entity;
  turret.powered=true;
  world.place('tower',5,5,0,'north');
  const combat=new Combat(world),commands=new UnitCommand(world,combat);
  const soldier=commands.train('north').unit;
  soldier.x=4.5;soldier.y=.5;soldier.prevX=soldier.x;soldier.prevY=soldier.y;
  const initial={x:soldier.x,y:soldier.y};
  combat.step(.2);
  assert.equal(soldier.x,initial.x);
  assert.equal(soldier.y,initial.y);
  assert.ok([...world.projectiles.entities.values()].some(p=>p.targetId===soldier.id));
  combat.dispose();
});

test('saved friendly units restore with health and executable movement orders',()=>{
  const storage=memoryStorage(),world=new World();
  world.place('tower',0,0,0,'north');
  const combat=new Combat(world),commands=new UnitCommand(world,combat);
  const soldier=commands.train('north').unit;
  assert.equal(commands.order(soldier.id,{x:8.5,y:1.5}).ok,true);
  soldier.health=33;
  assert.equal(saveDraft(world,storage),true);
  const restored=new World();
  assert.equal(restoreDraft(restored,storage).restored,true);
  const previous=[...restored.units.entities.values()][0];
  assert.equal(previous.health,33);
  const resumed=new UnitCommand(restored,new Combat(restored));
  assert.ok(previous.path.length>0);
  for(let i=0;i<70;i++)resumed.step(.2);
  assert.ok(Math.hypot(previous.x-8.5,previous.y-1.5)<.1);
});

test('route search never walks through an impassable barrier',()=>{
  const world=new World({width:8,height:8,chunkSize:4});
  for(let y=-4;y<4;y++)world.place('wall',0,y,0,'south');
  assert.equal(routeUnit(world,{x:-1.5,y:-.5},{x:2.5,y:-.5}),null);
  assert.equal(MAX_CONTROLLED_UNITS,12);
});
