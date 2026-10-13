import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { ItemConnections } from '../src/connections.js';
import { Industry } from '../src/industry.js';
import { buildTunnel, tunnelGeometry } from '../src/underground.js';

test('underground routes accept only short straight spans',()=>{
  assert.equal(tunnelGeometry({x:0,y:0},{x:4,y:0}).rotation,1);
  assert.equal(tunnelGeometry({x:0,y:0},{x:0,y:-4}).rotation,0);
  assert.equal(tunnelGeometry({x:0,y:0},{x:4,y:2}).ok,false);
  assert.equal(tunnelGeometry({x:0,y:0},{x:8,y:0}).ok,false);
  assert.equal(tunnelGeometry({x:0,y:0},{x:1,y:0}).ok,false);
});

test('buried endpoints cross surface obstacles and deliver actual items',()=>{
  const world=new World();
  const storage=world.place('warehouse',-2,0,0,'north').entity;
  const obstacle=world.place('ironWall',2,0,0,'north').entity;
  const links=new ItemConnections(world);
  const industry=new Industry(world,links);
  const result=buildTunnel(world,links,{x:0,y:0},{x:4,y:0},'north');
  assert.equal(result.ok,true);
  assert.equal(result.distance,4);
  assert.equal(world.getAt(2,0)?.id,obstacle.id,'surface remains occupied');
  assert.equal(world.getAt(1,0),null,'no intermediate underground structures');
  assert.equal(links.link(result.entity.id,result.exit.id).contacts.length,1);
  world.place('conveyor',5,0,0,'north');
  world.place('conveyor',5,1,0,'north');
  world.place('tower',5,2,0,'north');
  industry.insert(storage,'iron',5);
  for(let step=0;step<48;step++)industry.step(.2);
  assert.equal(world.walletFor('north').iron,5);
  assert.equal(world.getAt(2,0)?.id,obstacle.id);
  world.remove(result.entity.id);
  assert.equal(world.structures.has(result.exit.id),false,'paired endpoint is removed');
  assert.equal(links.link(result.entity.id,result.exit.id),null);
  industry.dispose();
  links.dispose();
});

test('both endpoints require one combined material budget',()=>{
  const world=new World();
  world.survival=true;
  const links=new ItemConnections(world);
  world.credit('north','lead',3);
  world.credit('north','iron',2);
  const failed=buildTunnel(world,links,{x:0,y:0},{x:3,y:0},'north');
  assert.equal(failed.reason,'materials');
  assert.equal(world.structures.size,0);
  assert.equal(world.walletFor('north').lead,3);
  world.credit('north','lead',3);
  const result=buildTunnel(world,links,{x:0,y:0},{x:3,y:0},'north');
  assert.equal(result.ok,true);
  assert.equal(world.walletFor('north').lead,0);
  assert.equal(world.walletFor('north').iron,0);
  links.dispose();
});
