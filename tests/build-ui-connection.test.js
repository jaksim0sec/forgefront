import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { ItemConnections } from '../src/connections.js';
import { planConveyorRoute, commitConveyorRoute } from '../src/routes.js';

test('all sides of receiving buildings accept a conveyor output', () => {
  for (const type of ['smelter','generator','siliconPlant','superconductorPlant']) {
    for (let side=0; side<4; side++) {
      const w=new World(),g=new ItemConnections(w);
      const building=w.place(type,10,10).entity;
      const cell=side===0?[10,9]:side===1?[10+building.width,10]:side===2?[10,10+building.height]:[9,10];
      const facing=(side+2)%4;
      const belt=w.place('conveyor',cell[0],cell[1],(facing+2)%4).entity;
      assert.ok(g.link(belt.id,building.id),type+' receiving side '+side);
    }
  }
});
test('a dragged conveyor endpoint points toward adjacent receiver',()=>{
  const w=new World(),g=new ItemConnections(w);
  const target=w.place('tower',3,0).entity;
  const p=planConveyorRoute(w,[{x:0,y:0},{x:1,y:0},{x:2,y:0}],0);
  assert.equal(p.ok,true);
  assert.equal(commitConveyorRoute(w,p).ok,true);
  const last=w.getAt(2,0);
  assert.ok(g.link(last.id,target.id));
});
