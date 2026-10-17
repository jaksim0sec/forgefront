import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { Combat } from '../src/combat.js';
import { UnitCommand } from '../src/unit-command.js';
import { UNIT_TYPES } from '../src/unit-types.js';
import { Capture } from '../src/capture.js';
import { saveDraft,restoreDraft } from '../src/local-draft.js';
const storage=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}};
test('mixed factory queue builds scouts, heavy and rifle in order',()=>{
 const w=new World(),f=w.place('unitFactory',0,0,0,'north').entity,c=new UnitCommand(w,new Combat(w));
 f.powered=true;for(const kind of ['scout','heavy','rifle'])assert.equal(c.train('north',f.id,kind).ok,true);
 for(let i=0;i<90;i++){f.powered=true;c.step(.2);}
 assert.deepEqual([...w.units.entities.values()].map(u=>u.unitType),['scout','heavy','rifle']);
 assert.deepEqual([...w.units.entities.values()].map(u=>u.maxHealth),[52,150,75]);
});
test('scout contests an outpost more quickly than a rifle squad',()=>{
 const run=kind=>{const w=new World(),post=w.place('outpost',0,0).entity,c=new Capture(w);
 w.units.spawn({x:2.5,y:1.5,ownerId:'north',role:'soldier',health:50,
 captureStrength:UNIT_TYPES[kind].captureStrength});
 for(let i=0;i<10;i++)c.step(.2);return post.captureProgress};
 assert.ok(run('scout')>run('rifle'));
});
test('mixed attack orders respect each unit weapon reach',()=>{
 const w=new World(),target=w.place('wall',9,0,0,'south').entity,c=new UnitCommand(w,new Combat(w));
 const a=w.units.spawn({x:.5,y:.5,role:'soldier',health:52,speed:3.25,ownerId:'north',unitType:'scout'});
 const b=w.units.spawn({x:1.5,y:.5,role:'soldier',health:150,speed:1.55,ownerId:'north',unitType:'heavy'});
 assert.equal(c.orderGroup([a.id,b.id],{targetId:target.id}).ok,true);
 for(const u of [a,b]){assert.ok(u.formationGoal);
 assert.ok(Math.hypot(u.formationGoal.x-9.5,u.formationGoal.y-.5)<UNIT_TYPES[u.unitType].range)}
});
test('unit identity and queued classes survive local draft',()=>{
 const w=new World(),f=w.place('unitFactory',0,0,0,'north').entity,c=new UnitCommand(w,new Combat(w));
 c.train('north',f.id,'scout');c.train('north',f.id,'heavy');
 const heavy=w.units.spawn({x:8.5,y:8.5,health:150,ownerId:'north',role:'soldier',unitType:'heavy'});
 heavy.health=121;const s=storage();assert.equal(saveDraft(w,s),true);
 const restored=new World();assert.equal(restoreDraft(restored,s).restored,true);
 assert.deepEqual(restored.getAt(0,0).trainQueueTypes,['scout','heavy']);
 assert.equal([...restored.units.entities.values()][0].health,121);
 assert.equal([...restored.units.entities.values()][0].maxHealth,150);
});
