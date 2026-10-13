import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { saveDraft, restoreDraft, DRAFT_KEY } from '../src/local-draft.js';

function memoryStorage() {
  const data=new Map();
  return {
    getItem:key=>data.get(key)??null,
    setItem:(key,value)=>data.set(key,value),
    removeItem:key=>data.delete(key),
  };
}
test('local world draft restores buildings, stockpile and paired underground endpoints',()=>{
  const storage=memoryStorage(),old=new World();
  old.place('tower',0,-1,0,'north');
  const entrance=old.place('tunnelEntrance',5,0,1,'north').entity;
  const exit=old.place('tunnelExit',9,0,1,'north').entity;
  entrance.pairId=exit.id;exit.pairId=entrance.id;
  old.place('smelter',-8,8,1,'north');
  old.place('conveyor',10,0,3,'north');
  old.credit('north','lead',72);
  assert.equal(saveDraft(old,storage),true);
  const restored=new World();
  assert.equal(restoreDraft(restored,storage).restored,true);
  assert.equal(restored.structures.size,5);
  assert.equal(restored.walletFor('north').lead,72);
  assert.equal(restored.getAt(5,0).pairId,restored.getAt(9,0).id);
  assert.equal(restored.getAt(10,0).rotation,3);
});
test('an invalid overlapping draft is discarded without partial world mutation',()=>{
  const storage=memoryStorage(),world=new World();
  storage.setItem(DRAFT_KEY,JSON.stringify({schema:1,structures:[
    {id:1,type:'smelter',x:2,y:2,rotation:0,ownerId:'north'},
    {id:2,type:'wall',x:2,y:2,rotation:0,ownerId:'north'}
  ],wallets:{}}));
  assert.equal(restoreDraft(world,storage).reason,'conflict');
  assert.equal(world.structures.size,0);
  assert.equal(storage.getItem(DRAFT_KEY),null);
});
