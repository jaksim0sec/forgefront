import test from 'node:test';
import assert from 'node:assert/strict';
import { World, STRUCTURES } from '../src/world.js';
import { WEAPONS, isWall } from '../src/defense.js';
import { BUILD_COSTS } from '../src/progression.js';
import { ItemConnections } from '../src/connections.js';
import { Industry } from '../src/industry.js';
import { PowerGrid } from '../src/power.js';
import { Combat } from '../src/combat.js';

test('every defense tier and warehouse has a real build cost and definition',()=>{
  for(const id of ['scatterTurret','heavyTurret','wall','ironWall','reinforcedWall','warehouse']){
    assert.ok(STRUCTURES[id],id);
    assert.ok(BUILD_COSTS[id],id);
    assert.ok(Object.isFrozen(STRUCTURES[id]));
  }
  assert.ok(WEAPONS.scatterTurret.splashRadius>0);
  assert.ok(WEAPONS.heavyTurret.damage>WEAPONS.turret.damage);
  assert.equal(isWall('ironWall'),true);
  assert.equal(isWall('turret'),false);
});

test('ground attackers stop to breach real walls',()=>{
  const world=new World();
  const tower=world.place('tower',0,0,0,'north').entity;
  const wall=world.place('wall',4,1,0,'north').entity;
  const combat=new Combat(world);
  const unit=world.units.spawn({x:7,y:1,ownerId:'south',health:34,
    speed:1.7,targetId:tower.id,hitPower:100});
  for(let i=0;i<20;i++) combat.step(.2);
  assert.equal(world.structures.has(wall.id),false,'wall takes damage and is destroyed');
  assert.ok(unit.x<5,'the attacker continues after breaching the obstacle');
  combat.dispose();
});

test('scatter fire damages neighboring enemies, and heavy fire has distinct damage',()=>{
  const world=new World();
  const tower=world.place('tower',12,0,0,'north').entity;
  const scatter=world.place('scatterTurret',0,0,0,'north').entity;
  scatter.powered=true;
  const combat=new Combat(world);
  const primary=world.units.spawn({x:5,y:1,health:50,ownerId:'south',
    speed:0,targetId:tower.id,hitPower:0});
  const nearby=world.units.spawn({x:5.7,y:1.3,health:50,ownerId:'south',
    speed:0,targetId:tower.id,hitPower:0});
  for(let i=0;i<15;i++)combat.step(.1);
  assert.ok(primary.health<50);
  assert.ok(nearby.health<50,'splash applies to a second target');
  combat.dispose();
});

test('powered heavy turret fires its full weapon damage',()=>{
  const world=new World();
  const tower=world.place('tower',15,0,0,'north').entity;
  const turret=world.place('heavyTurret',0,0,0,'north').entity;
  turret.powered=true;
  const combat=new Combat(world);
  const target=world.units.spawn({x:9,y:2,health:100,ownerId:'south',
    speed:0,targetId:tower.id,hitPower:0});
  for(let i=0;i<15;i++)combat.step(.1);
  assert.equal(target.health,100-WEAPONS.heavyTurret.damage);
  combat.dispose();
});

test('warehouse releases stored items through actual conveyor ports',()=>{
  const world=new World();
  const warehouse=world.place('warehouse',0,0,0,'north').entity;
  world.place('conveyor',2,0,0,'north');
  world.place('conveyor',2,1,0,'north');
  world.place('tower',2,2,0,'north');
  const links=new ItemConnections(world);
  const industry=new Industry(world,links);
  assert.ok(links.outputs(warehouse.id).size>0,'warehouse has real outbound ports');
  industry.insert(warehouse,'iron',5);
  for(let i=0;i<48;i++)industry.step(.2);
  assert.ok((world.walletFor('north').iron??0)>0,'stock reaches the tower');
  assert.ok(industry.stockCount(warehouse,'iron')<5);
  industry.dispose();links.dispose();
});

test('new powered defenses participate in normal grid allocation',()=>{
  const world=new World();
  world.place('tower',0,0,0,'north');
  const scatter=world.place('scatterTurret',2,0,0,'north').entity;
  const heavy=world.place('heavyTurret',5,0,0,'north').entity;
  const grid=new PowerGrid(world);
  grid.update();
  assert.equal(scatter.powered,true);
  assert.equal(heavy.powered,false,'starter grid is intentionally limited');
  grid.dispose();
});
