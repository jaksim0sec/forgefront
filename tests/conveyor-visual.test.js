import test from 'node:test';
import assert from 'node:assert/strict';
import {conveyorOpenSides,conveyorSeamPath} from '../src/conveyor-visual.js';
const belt=(id,rotation=0,ownerId='north')=>({id,rotation,type:'conveyor',ownerId});
test('only real paired conveyor connections open shared rims',()=>{
 const a=belt(1),b=belt(2),world={structures:new Map([[1,a],[2,b]])};
 const edge={from:1,to:2,contacts:[{side:1}]};
 const c={outputs:id=>id===1?new Map([[2,edge]]):new Map(),inputs:id=>id===2?new Map([[1,edge]]):new Map()};
 assert.deepEqual(conveyorOpenSides(a,c,world),[1]);
 assert.deepEqual(conveyorOpenSides(b,c,world),[3]);
 assert.equal(conveyorSeamPath([1]),'M47 17V31');
 b.ownerId='south';
 assert.deepEqual(conveyorOpenSides(a,c,world),[]);
 assert.deepEqual(conveyorOpenSides(b,c,world),[]);
});
test('corners and rotations keep source-edge joins correctly aligned',()=>{
 const a=belt(1,1),b=belt(2),c=belt(3);
 const world={structures:new Map([[1,a],[2,b],[3,c]])};
 const links=[{from:2,to:1,contacts:[{side:1}]},{from:1,to:3,contacts:[{side:2}]}];
 const edges={
 outputs:id=>new Map(links.filter(l=>l.from===id).map(l=>[l.to,l])),
 inputs:id=>new Map(links.filter(l=>l.to===id).map(l=>[l.from,l]))
 };
 assert.deepEqual(conveyorOpenSides(a,edges,world),[1,2]);
 assert.deepEqual(conveyorOpenSides(a,{outputs:()=>new Map(),inputs:()=>new Map()},world),[]);
});
