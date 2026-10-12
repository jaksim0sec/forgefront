import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { Terrain } from '../src/terrain.js';
import { Territory } from '../src/territory.js';
import { planConveyorRoute, commitConveyorRoute } from '../src/routes.js';

function setup() {
  const w = new World();
  w.place('tower', 0, -1, 0, 'north');
  w.place('tower', 50, 0, 0, 'south');
  w.survival = true;
  w.terrain = new Terrain();
  const territory = new Territory(w);
  w.territory = territory;
  w.credit('north', 'lead', 500);
  w.credit('north', 'iron', 100);
  return w;
}

test('all footprint tiles must lie in the builder nation territory',()=>{
  const w=setup();
  assert.equal(w.canBuild('conveyor',0,3,0,'north').ok,true);
  assert.equal(w.canBuild('conveyor',0,3,0,'south').reason,'territory');
  assert.equal(w.canBuild('conveyor',25,3,0,'north').reason,'territory');
  assert.equal(w.canBuild('conveyor',25,3,0,null).reason,'territory');
  let crossing=null;
  // Boundary tiles are 1 tile wide and the building must fit entirely.
  for(let x=0;x<25;x++){
    if(w.territory.ownerAt(x,0)==='north' && w.territory.ownerAt(x+1,0)!=='north') {
      crossing=x;break;
    }
  }
  assert.ok(crossing!==null);
  assert.equal(w.canBuild('smelter',crossing-1,0,0,'north').reason,'territory');
  assert.equal(w.canBuild('conveyor',crossing,0,0,'north').ok,true);
  assert.equal(w.build('conveyor',crossing+1,0,0,'north').reason,'territory');
  assert.equal(w.place('conveyor',100,100,0,'north').ok,true,
    'sandbox primitive remains available for editor and fixture use');
});

test('conveyor drag across a border is rejected before any partial construction',()=>{
  const w=setup();
  const path=[];
  for(let x=16;x<=29;x++)path.push({x,y:0});
  const before=w.structures.size;
  const plan=planConveyorRoute(w,path,0,'north');
  assert.equal(plan.ok,false);
  assert.equal(plan.reason,'territory');
  assert.equal(commitConveyorRoute(w,plan,'north').ok,false);
  assert.equal(w.structures.size,before);
  w.survival=false;
  const ungatedPlan=planConveyorRoute(w,path,0);
  w.survival=true;
  assert.equal(ungatedPlan.ok,true);
  const committed=commitConveyorRoute(w,ungatedPlan,'north');
  assert.equal(committed.ok,false);
  assert.equal(committed.reason,'territory');
  assert.equal(w.structures.size,before);
  const safe=planConveyorRoute(w,[{x:3,y:4},{x:4,y:4}],0,'north');
  assert.equal(safe.ok,true);
  assert.equal(commitConveyorRoute(w,safe,'north').count,2);
});
