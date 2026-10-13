import test from 'node:test';
import assert from 'node:assert/strict';
import {startBuildStroke, buildStrokeStep, snappedBuildAnchor} from '../src/build-stroke.js';
import {Terrain} from '../src/terrain.js';
test('two-wide factory drag aligns exactly to one origin including instant 90 degree turns',()=>{
 const stroke=startBuildStroke({x:0,y:0},2,2);
 const along=buildStrokeStep(stroke,{x:8,y:0});
 assert.deepEqual(along.map(p=>[p.x,p.y]),[[2,0],[4,0],[6,0],[8,0]]);
 const turn=buildStrokeStep(stroke,{x:8,y:5});
 assert.deepEqual(turn.map(p=>[p.x,p.y]),[[8,2],[8,4],[8,6]]);
 assert.ok(along.every(p=>p.x%2===0&&p.y%2===0));
 assert.ok(turn.every(p=>p.x%2===0&&p.y%2===0));
});
test('rectangular factories snap by independent width and height during turns',()=>{
 const stroke=startBuildStroke({x:4,y:5},3,2);
 const run=buildStrokeStep(stroke,{x:12,y:5});
 const turn=buildStrokeStep(stroke,{x:12,y:12});
 assert.deepEqual(snappedBuildAnchor({x:4,y:5},3,2),{x:3,y:5});
 assert.ok(run.every(p=>(p.x-3)%3===0 && (p.y-5)%2===0));
 assert.ok(turn.every(p=>(p.x-3)%3===0 && (p.y-5)%2===0));
});
test('ridge frequency increases but starter buildings and veins remain accessible',()=>{
 const t=new Terrain();
 for(const [x,y] of [[0,-1],[-8,8],[9,-5],[17,8],[70,-25]]) {
  assert.equal(t.canBuildFootprint(x,y,2,2),true,'missing ground: '+x+','+y);
 }
 assert.equal(t.oreAt(-8,8),'iron');
 assert.equal(t.oreAt(9,-5),'coal');
 assert.equal(t.oreAt(17,8),'titanium');
 let walls=0;
 for(let y=-100;y<100;y+=2)for(let x=-100;x<100;x+=2)
  if(t.isCliffAt(x,y)) walls++;
 assert.ok(walls>180,'not enough natural wall terrain: '+walls);
});
