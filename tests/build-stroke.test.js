import test from 'node:test';
import assert from 'node:assert/strict';
import {startBuildStroke, buildStrokeStep, snappedBuildAnchor} from '../src/build-stroke.js';
import {Terrain} from '../src/terrain.js';
test('near-horizontal drag ignores minor-axis jitter and never draws stairs',()=>{
 const state=startBuildStroke({x:0,y:0},2,2);
 assert.deepEqual(buildStrokeStep(state,{x:8,y:2}).map(p=>[p.x,p.y]),
   [[0,0],[2,0],[4,0],[6,0],[8,0]]);
 assert.deepEqual(buildStrokeStep(state,{x:8,y:-1}).map(p=>[p.x,p.y]),
   [[0,0],[2,0],[4,0],[6,0],[8,0]]);
});
test('vertical drag is a single column, reversed drags stay straight',()=>{
 const state=startBuildStroke({x:4,y:5},3,2);
 assert.deepEqual(snappedBuildAnchor({x:4,y:5},3,2),{x:3,y:5});
 assert.deepEqual(buildStrokeStep(state,{x:5,y:12}).map(p=>[p.x,p.y]),
   [[3,5],[3,7],[3,9],[3,11],[3,13]]);
 const reverse=startBuildStroke({x:4,y:5},3,2);
 assert.deepEqual(buildStrokeStep(reverse,{x:-4,y:4}).map(p=>[p.x,p.y]),
   [[3,5],[0,5],[-3,5],[-6,5]]);
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
