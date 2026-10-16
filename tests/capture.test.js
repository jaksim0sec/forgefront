import test from 'node:test';
import assert from 'node:assert/strict';
import {World} from '../src/world.js';
import {Terrain} from '../src/terrain.js';
import {Territory,OUTPOST_CLAIM_RADIUS} from '../src/territory.js';
import {Capture,seedOutposts,CAPTURE_SECONDS} from '../src/capture.js';
import {UnitCommand} from '../src/unit-command.js';
import {saveDraft,restoreDraft} from '../src/local-draft.js';

function soldier(world,x,y,ownerId){
  return world.units.spawn({x,y,prevX:x,prevY:y,health:75,speed:2.35,
    role:'soldier',ownerId,path:[],goal:null,cooldown:0});
}
function storage(){const map=new Map();
  return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),
    removeItem:k=>map.delete(k)};
}
test('neutral outpost claims no land until captured, then creates a smaller build region',()=>{
  const world=new World(),post=world.place('outpost',20,0).entity;
  const territory=new Territory(world);
  world.territory=territory;
  world.survival=true;
  assert.equal(territory.ownerAt(20,0),null);
  assert.equal(world.canBuild('leadCollector',20,3,0,'north').reason,'territory');
  const capture=new Capture(world);
  soldier(world,21,3,'north');
  for(let t=0;t<CAPTURE_SECONDS+1;t+=.2)capture.step(.2);
  assert.equal(post.ownerId,'north');
  assert.equal(post.captureProgress,0);
  assert.equal(territory.ownerAt(20,3),'north');
  assert.equal(world.canBuild('leadCollector',20,3,0,'north').ok,true);
  assert.equal(territory.ownerAt(20+OUTPOST_CLAIM_RADIUS+3,0),null);
  assert.equal(territory.ownerAt(20+OUTPOST_CLAIM_RADIUS+3,0),null);
  capture.dispose();territory.dispose();
});
test('opposing troops contest progress until one faction gains uncontested control',()=>{
  const world=new World(),post=world.place('outpost',10,10).entity;
  const capture=new Capture(world);
  const a=soldier(world,11,12,'north'),b=soldier(world,12,12,'south');
  for(let i=0;i<45;i++)capture.step(.2);
  assert.equal(post.captureProgress,0);
  assert.equal(post.captureState,'contested');
  world.units.entities.delete(b.id);
  for(let i=0;i<55;i++)capture.step(.2);
  assert.equal(post.ownerId,'north');
  world.units.entities.delete(a.id);
  soldier(world,11,12,'south');
  for(let i=0;i<55;i++)capture.step(.2);
  assert.equal(post.ownerId,'south');
});
test('single and grouped capture orders approach rather than shooting at an outpost',()=>{
  const world=new World(),post=world.place('outpost',12,0).entity;
  const commands=new UnitCommand(world,{lineClear:()=>true,visualEvents:[]});
  const units=[soldier(world,.5,.5,'north'),soldier(world,1.5,.5,'north'),soldier(world,2.5,.5,'north')];
  const issued=commands.orderGroup(units.map(u=>u.id),{targetId:post.id});
  assert.equal(issued.ok,true);
  assert.equal(issued.count,3);
  assert.equal(new Set(issued.positions.map(p=>p.x+':'+p.y)).size,3);
  assert.ok(units.every(u=>u.captureTargetId===post.id&&u.attackTargetId===null));
  const progress=new Capture(world);
  for(let i=0;i<105;i++){commands.step(.2);progress.step(.2);}
  assert.equal(post.ownerId,'north');
  assert.equal(world.projectiles.entities.size,0);
  progress.dispose();commands.dispose();
});
test('outpost scenario is installed only once and preserved in old saves',()=>{
  const world=new World();world.terrain=new Terrain();
  world.place('tower',0,-1,0,'north');
  const first=seedOutposts(world);
  assert.equal(first.length,2);
  assert.equal(seedOutposts(world).length,0);
  assert.ok(first.every(e=>e.ownerId===null&&e.type==='outpost'));
  const store=storage();
  assert.equal(saveDraft(world,store),true);
  const loaded=new World();
  assert.equal(restoreDraft(loaded,store).restored,true);
  assert.equal(seedOutposts(loaded).length,0);
  assert.equal([...loaded.structures.values()].filter(e=>e.type==='outpost').length,2);
});
test('partially captured objective survives local save and resumes capture',()=>{
  const world=new World(),post=world.place('outpost',12,0).entity;
  const capture=new Capture(world);
  soldier(world,13,3,'north');
  for(let i=0;i<14;i++)capture.step(.2);
  const originalProgress=post.captureProgress;
  const store=storage();
  assert.equal(saveDraft(world,store),true);
  const loaded=new World();
  assert.equal(restoreDraft(loaded,store).restored,true);
  const second=loaded.getAt(12,0);
  assert.ok(Math.abs(second.captureProgress-originalProgress)<.001);
  assert.equal(second.captureTeam,'north');
  const resumed=new Capture(loaded);
  for(let i=0;i<45;i++)resumed.step(.2);
  assert.equal(second.ownerId,'north');
});
