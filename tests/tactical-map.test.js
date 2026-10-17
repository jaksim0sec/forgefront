import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { tacticalTile,isTacticalTarget } from '../src/tactical-map.js';
test('tactical classification distinguishes sites, cliffs and targets',()=>{
 const w=new World({width:24,height:24,chunkSize:8});
 w.terrain={isCliffAt:(x,y)=>x===3&&y===3};
 const a=w.place('wall',1,1,0,'north').entity;
 const b=w.place('wall',5,5,0,'south').entity;
 assert.equal(tacticalTile(w,0,0,'north'),'walkable');
 assert.equal(tacticalTile(w,1,1,'north'),'friendly');
 assert.equal(tacticalTile(w,5,5,'north'),'target');
 assert.equal(tacticalTile(w,3,3,'north'),'cliff');
 assert.equal(tacticalTile(w,20,20,'north'),'outside');
 assert.equal(isTacticalTarget('target'),true);
 assert.equal(isTacticalTarget('cliff'),false);
});
