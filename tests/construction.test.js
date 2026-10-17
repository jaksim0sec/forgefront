import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { Construction, constructionSeconds, ACTIVE_CREWS } from '../src/construction.js';
import { saveDraft, restoreDraft } from '../src/local-draft.js';
import { routeUnit } from '../src/unit-command.js';
const storage=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,
 setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)}};
test('construction is inactive and vulnerable, and its timer survives reload',()=>{
 const w=new World(),clock=new Construction(w);w.constructionEnabled=true;
 const site=w.build('turret',4,4,0,'north').entity;
 assert.equal(site.enabled,false);
 assert.equal(site.constructionTotal,10);
 assert.equal(w.setEnabled(site.id,true),false);
 clock.step(.5);w.damageStructure(site.id,7);
 const store=storage();assert.equal(saveDraft(w,store),true);
 const revived=new World();assert.equal(restoreDraft(revived,store).restored,true);
 const job=revived.getAt(4,4),remaining=job.constructionRemaining;
 assert.ok(remaining>0&&remaining<10);assert.equal(job.enabled,false);
 const resumed=new Construction(revived);
 for(let i=0;i<55;i++)resumed.step(.25);
 assert.equal(job.constructionRemaining,0);
 assert.equal(job.enabled,true);
 assert.ok(job.health<job.maxHealth,'site damage survives completion');
});
test('only three sites build at once and others wait in order',()=>{
 const w=new World(),clock=new Construction(w);w.constructionEnabled=true;
 const walls=Array.from({length:4},(_,i)=>w.build('wall',i,0,0,'north').entity);
 clock.step(.5);
 assert.deepEqual(walls.map(e=>e.constructionRemaining),[3.5,3.5,3.5,4]);
 for(let i=0;i<36;i++)clock.step(.5);
 assert.ok(walls.every(e=>e.enabled));
});
test('wall scaffold can be traversed before completion but not afterward',()=>{
 const w=new World({width:12,height:12,chunkSize:4});
 w.constructionEnabled=true;
 const site=w.build('wall',0,0,0,'south').entity;
 assert.ok(routeUnit(w,{x:-1.5,y:.5},{x:1.5,y:.5}));
 const clock=new Construction(w);
 for(let i=0;i<12;i++)clock.step(.5);
 assert.equal(site.enabled,true);
 // Stop the only corridor with two additional permanent walls.
 for(let y=-6;y<6;y++)if(y!==0)w.place('wall',0,y,0,'south');
 assert.equal(routeUnit(w,{x:-1.5,y:.5},{x:1.5,y:.5}),null);
});
test('old World.place remains instant, and conveyors are never delayed',()=>{
 const w=new World();w.constructionEnabled=true;
 const existing=w.place('turret',0,0).entity;
 const conveyor=w.build('conveyor',4,0,0,'north').entity;
 assert.equal(existing.constructionRemaining,undefined);
 assert.equal(conveyor.constructionRemaining,undefined);
 assert.equal(ACTIVE_CREWS,3);assert.equal(constructionSeconds('heavyTurret'),18);
});
