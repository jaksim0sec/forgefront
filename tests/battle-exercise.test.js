import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { DRAFT_KEY, saveDraft, restoreDraft } from '../src/local-draft.js';
import { beginExercise,hasExerciseCheckpoint,requestExerciseRollback,
 applyPendingExerciseRollback,keepExerciseResults,EXERCISE_KEY } from '../src/battle-exercise.js';
const storage=()=>{const map=new Map();return {getItem:k=>map.get(k)??null,
 setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};};
test('training rollback wins over the pagehide autosave race',()=>{
 const world=new World(),store=storage();
 world.place('tower',0,0,0,'north');
 const post=world.place('outpost',9,1,0,null).entity;
 assert.equal(beginExercise(world,store),true);
 assert.equal(hasExerciseCheckpoint(store),true);
 world.remove(post.id);
 assert.equal(saveDraft(world,store),true);
 assert.equal(requestExerciseRollback(store),true);
 // Models pagehide saving AFTER rollback has already been requested.
 assert.equal(saveDraft(world,store),true);
 assert.equal(applyPendingExerciseRollback(store),true);
 const restored=new World();
 assert.equal(restoreDraft(restored,store).restored,true);
 assert.equal(restored.getAt(9,1).type,'outpost');
 assert.equal(hasExerciseCheckpoint(store),false);
});
test('keeping battle results retains changes and dismisses rollback',()=>{
 const world=new World(),store=storage(),post=world.place('outpost',9,1).entity;
 assert.equal(beginExercise(world,store),true);
 world.remove(post.id);
 assert.equal(keepExerciseResults(world,store),true);
 assert.equal(hasExerciseCheckpoint(store),false);
 const restored=new World();
 assert.equal(restoreDraft(restored,store).restored,true);
 assert.equal(restored.getAt(9,1),null);
});
test('checkpoint can be used again across reloads without overwriting the baseline',()=>{
 const world=new World(),store=storage();
 world.place('wall',3,3,0,'north');
 assert.equal(beginExercise(world,store),true);
 const first=store.getItem(EXERCISE_KEY);
 world.place('wall',4,3,0,'north');
 assert.equal(beginExercise(world,store),true);
 assert.equal(store.getItem(EXERCISE_KEY),first);
});
test('missing storage never enables a destructive training session',()=>{
 assert.equal(beginExercise(new World(),null),false);
 assert.equal(requestExerciseRollback(null),false);
});
