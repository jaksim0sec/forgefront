import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { ItemConnections } from '../src/connections.js';
import { Industry } from '../src/industry.js';
import { extendRoute, planConveyorRoute, commitConveyorRoute } from '../src/routes.js';

test('one pointer stroke interpolates a route and auto turns corners',()=>{
  const world = new World(), graph = new ItemConnections(world);
  const route = [];
  extendRoute(route,{x:0,y:0});
  extendRoute(route,{x:0,y:3});
  extendRoute(route,{x:2,y:3});
  assert.equal(route.length,6);
  const plan = planConveyorRoute(world,route);
  assert.equal(plan.ok,true);
  assert.equal(commitConveyorRoute(world,plan,'north').count,6);
  assert.equal(graph.linkCount,5);
  assert.equal(world.getAt(0,3).rotation,3); // turned east
  assert.equal(world.getAt(2,3).rotation,3);
  assert.equal(world.getAt(0,0).maxHealth,55);
});

test('invalid route aborts with no partial structures',()=>{
  const world = new World();
  world.place('drill',1,0);
  const plan = planConveyorRoute(world,[{x:0,y:0},{x:1,y:0},{x:2,y:0},{x:3,y:0}]);
  assert.equal(plan.ok,false);
  assert.equal(commitConveyorRoute(world,plan).count,0);
  assert.equal(world.structures.size,1);
});

test('existing line realigns locally and graph reacts to damage and rotation',()=>{
  const world = new World(), graph = new ItemConnections(world);
  const a = world.place('conveyor',0,0).entity;
  const b = world.place('conveyor',1,0).entity;
  assert.equal(graph.linkCount,0);
  const edit = planConveyorRoute(world,[{x:0,y:0},{x:1,y:0}]);
  assert.equal(commitConveyorRoute(world,edit).ok,true);
  assert.equal(graph.linkCount,1);
  assert.equal(world.damageStructure(b.id,15),40);
  assert.equal(world.damageStructure(b.id,45),0);
  assert.equal(world.getAt(1,0),null);
  assert.equal(graph.linkCount,0);
  assert.equal(world.getAt(0,0)?.id,a.id);
});

test('drill -> conveyor -> smelter transfers SVG-defined iron inventory independently of camera',()=>{
  const world = new World(), graph = new ItemConnections(world);
  const drill = world.place('drill',-4,-1).entity;
  const smelter = world.place('smelter',0,0).entity;
  const plan = planConveyorRoute(world,[{x:-2,y:0},{x:-1,y:0}],3);
  assert.equal(commitConveyorRoute(world,plan).count,2);
  assert.equal(graph.linkCount,3);
  const industry = new Industry(world,graph);
  for(let i=0;i<60;i++)industry.step(.2);
  assert.ok(smelter.inventory.iron > 0);
  assert.equal(world.units.spawn({x:10,y:12,health:30}).maxHealth,30);
  const projectile=world.projectiles.spawn({x:10,y:12,health:4,damage:8,material:'steel',targetId:null});
  assert.equal(projectile.damage,8);
  assert.equal(world.projectiles.damage(projectile.id,4),0);
  assert.equal(world.projectiles.get(projectile.id),null);
  world.effects.emit(0,0,1);
  assert.equal('health' in world.effects.items[0],false);
});
