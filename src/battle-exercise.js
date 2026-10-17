import { saveDraft, DRAFT_KEY } from './local-draft.js';
/** Non-destructive opt-in battle exercise with a crash/reload-safe rollback.
 * Rollback is applied at next boot, AFTER pagehide auto-save has finished.
 */
export const EXERCISE_KEY='forgefront:battle-exercise-checkpoint:v1';
export const PENDING_KEY='forgefront:battle-exercise-rollback:v1';

export function hasExerciseCheckpoint(storage){
  try{return !!storage?.getItem(EXERCISE_KEY);}catch{return false;}
}
export function beginExercise(world,storage){
  if(!storage)return false;
  try{
    if(storage.getItem(EXERCISE_KEY))return true;
    if(!saveDraft(world,storage))return false;
    const snapshot=storage.getItem(DRAFT_KEY);
    if(!snapshot)return false;
    storage.setItem(EXERCISE_KEY,snapshot);
    return true;
  }catch{return false;}
}
export function requestExerciseRollback(storage){
  try{
    const snapshot=storage?.getItem(EXERCISE_KEY);
    if(!snapshot)return false;
    storage.setItem(PENDING_KEY,snapshot);
    return true;
  }catch{return false;}
}
export function applyPendingExerciseRollback(storage){
  try{
    const snapshot=storage?.getItem(PENDING_KEY);
    if(!snapshot)return false;
    // Auto-save on pagehide can run after the rollback request. Boot wins.
    storage.setItem(DRAFT_KEY,snapshot);
    storage.removeItem(PENDING_KEY);
    storage.removeItem(EXERCISE_KEY);
    return true;
  }catch{return false;}
}
export function keepExerciseResults(world,storage){
  try{
    if(!storage?.getItem(EXERCISE_KEY))return false;
    if(!saveDraft(world,storage))return false;
    storage.removeItem(EXERCISE_KEY);
    return true;
  }catch{return false;}
}
