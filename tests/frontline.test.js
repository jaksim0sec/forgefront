import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { ItemConnections } from '../src/connections.js';
import { Combat } from '../src/combat.js';
import { UnitCommand } from '../src/unit-command.js';
import { FrontlineSupply, isEntrenched, damageAgainstUnit } from '../src/frontline.js';
import { saveDraft, restoreDraft } from '../src/local-draft.js';

const storage=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,
  setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};};
test('a connected belt extends allied supply; a severed line does not',()=>{
  const world=new World();world.place('tower',0,0,0,'north');
  for(let y=2;y<=12;y++)world.place('conveyor',1,y,2,'north');
  const links=new ItemConnections(world),supply=new FrontlineSupply(world,links);
  const unit={x:2.5,y:12.5,ownerId:'north'};
  assert.equal(supply.covers(unit),true);
  assert.equal(supply.covers({...unit,ownerId:'south'}),false);
  world.remove(world.getAt(1,7).id);
  assert.equal(supply.covers(unit),false);
  supply.dispose();links.dispose();
});
test('cover only applies to stopped infantry next to its own walls',()=>{
  const world=new World();world.place('wall',3,0,0,'north');
  const u={x:2.5,y:.5,ownerId:'north',role:'soldier',holdPosition:true,path:[]};
  assert.equal(isEntrenched(world,u),true);
  assert.equal(damageAgainstUnit(world,u,100),72);
  u.holdPosition=false;
  assert.equal(damageAgainstUnit(world,u,100),100);
});
test('explicit assault deploys at most 12 enemy soldiers',()=>{
  const w=new World();w.place('tower',0,-1,0,'north');w.place('tower',70,-25,0,'south');
  const combat=new Combat(w),commands=new UnitCommand(w,combat);
  const r=commands.launchAssault('north');
  assert.equal(r.ok,true,JSON.stringify(r));
  assert.equal(r.count,4);
  for(let i=0;i<4;i++)commands.launchAssault('north');
  assert.ok(w.units.entities.size<=12);
  commands.dispose();combat.dispose();
});
test('draft preserves ammo and defense orders for more than 12 units',()=>{
  const w=new World(),store=storage();
  for(let i=0;i<13;i++)w.units.spawn({x:i+.5,y:.5,health:75,
    ownerId:i<7?'north':'south',role:'soldier',ammo:i%9,holdPosition:true});
  assert.equal(saveDraft(w,store),true);
  const fresh=new World();
  assert.equal(restoreDraft(fresh,store).restored,true);
  const troops=[...fresh.units.entities.values()];
  assert.equal(troops.length,13);
  assert.equal(troops[12].ammo,3);
  assert.ok(troops.every(u=>u.holdPosition));
});
