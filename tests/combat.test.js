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
