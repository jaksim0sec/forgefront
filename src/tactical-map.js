/** Pure tactical intent classification: no expensive pathfinder in pointermove. */
export function tacticalTile(world,x,y,owner){
 if(!world.inBounds(x,y))return 'outside';
 if(world.terrain?.isCliffAt(x,y))return 'cliff';
 const structure=world.getAt(x,y);
 if(!structure)return 'walkable';
 return structure.ownerId===owner?'friendly':'target';
}
export const isTacticalTarget=status=>status==='walkable'||status==='target';
