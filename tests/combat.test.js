import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { Combat, TURRET } from '../src/combat.js';
import { PowerGrid } from '../src/power.js';

test('turret tracks hostile scouts and projectiles inflict real unit damage',()=>{
  const world=new World();
  world.place('tower',0,-1,0,'north');
  const turret=world.place('turret',3,0,0,'north').entity;
  const power=new PowerGrid(world);
  power.update();
  assert.equal(turret.powered,true);
  const combat=new Combat(world);
  const target=world.units.spawn({x:7,y:1,ownerId:'south',health:28,speed:0,
    targetId:world.structures.values().next().value.id,hitPower:0});
  let shots=0;
  for(let i=0;i<20 && world.units.get(target.id);i++){
    combat.step(0.2);
    shots+=world.projectiles.entities.size;
  }
  assert.ok(shots>0,'shots spawned as individual world entities');
  assert.equal(world.units.get(target.id),null,'scout eliminated after projectile impacts');
  assert.equal(TURRET.range,9);
  combat.dispose(); power.dispose();
});

test('turret requires electricity, ignores friendly units and respects rock cover',()=>{
  const world=new World();
  const turret=world.place('turret',0,0,0,'north').entity;
  const tower=world.place('tower',10,0,0,'north').entity;
  const combat=new Combat(world);
  const hostile=world.units.spawn({x:5,y:1,ownerId:'south',health:28,speed:0,targetId:tower.id,hitPower:0});
  combat.step(0.2);
  assert.equal(world.projectiles.entities.size,0);
  turret.powered=true;
  world.terrain={isCliffAt:()=>true,heightAt:()=>0};
  combat.step(0.2);
  assert.equal(world.projectiles.entities.size,0);
  world.terrain=null;
  const friendly=world.units.spawn({x:1,y:1,ownerId:'north',health:10,speed:0,
    targetId:tower.id,hitPower:0});
  combat.step(0.2);
  assert.equal(world.projectiles.entities.size,1);
  assert.equal(world.projectiles.entities.values().next().value.targetId,hostile.id);
  assert.equal(friendly.health,10);
  combat.dispose();
});

test('drone exercise is explicitly triggered, bounded and targets the real tower',()=>{
  const world=new World();
  world.place('tower',0,-1,0,'north');
  const combat=new Combat(world);
  assert.equal(world.units.entities.size,0);
  assert.equal(combat.spawnRaid('north'),true);
  assert.equal(world.units.entities.size,3);
  assert.ok([...world.units.entities.values()].every(unit =>
    unit.ownerId==='south' && unit.targetId===1));
  for(let n=0;n<7;n++)assert.equal(combat.spawnRaid('north'),true);
  assert.equal(world.units.entities.size,24);
  assert.equal(combat.spawnRaid('north'),false);
  combat.dispose();
});


test('more powered turrets shorten actual elimination time',()=>{
  function clearTime(count) {
    const world = new World();
    const tower = world.place('tower',0,0,0,'north').entity;
    for (const [x,y] of [[2,0],[2,2],[4,0]].slice(0,count))
      assert.equal(world.place('turret',x,y,0,'north').ok,true);
    const power = new PowerGrid(world);
    power.update();
    const combat = new Combat(world);
    const scout = world.units.spawn({x:8,y:1,ownerId:'south',
      health:34,speed:0,targetId:tower.id,hitPower:0});
    let time=0;
    while(world.units.get(scout.id) && time<5) {
      combat.step(0.05);
      time+=0.05;
    }
    combat.dispose();power.dispose();
    return time;
  }
  const one=clearTime(1), three=clearTime(3);
  assert.ok(three<one*0.6,`three turrets should kill faster (${three} vs ${one})`);
});

test('nearby turrets can fire before slow pre-reserved shots arrive',()=>{
  const world = new World();
  const tower = world.place('tower',-10,-10,0,'north').entity;
  for(const [x,y] of [[0,-2],[0,0],[0,2],[6,0]]) {
    const placed=world.place('turret',x,y,0,'north');
    assert.equal(placed.ok,true);
    placed.entity.powered=true;
  }
  const combat=new Combat(world);
  const scout=world.units.spawn({x:8,y:1,health:34,speed:0,
    ownerId:'south',targetId:tower.id,hitPower:0});
  combat.step(0.016);
  const shots=[...world.projectiles.entities.values()];
  assert.equal(shots.length,4);
  assert.ok(shots.some(shot=>shot.x===7 && shot.targetId===scout.id));
  combat.dispose();
});
