/** Mindustry-style normalized straight placement.
 * Pointer jitter on the minor axis cannot introduce staircase turns.
 * All cells stay locked to the starting footprint lattice.
 */
export function snappedBuildAnchor(tile, width, height) {
  return {x:tile.x-Math.floor((width-1)/2), y:tile.y-Math.floor((height-1)/2)};
}
export function startBuildStroke(tile,width,height) {
  const origin=snappedBuildAnchor(tile,width,height);
  return {start:{...tile},pointer:{...tile},origin,width,height,
    lastKey:origin.x+','+origin.y};
}
export function normalizedBuildLine(state, tile) {
  const dx=tile.x-state.start.x,dy=tile.y-state.start.y;
  const axis=Math.abs(dx)>=Math.abs(dy)?'x':'y';
  const size=axis==='x'?state.width:state.height;
  const delta=axis==='x'?dx:dy;
  const steps=Math.min(512,Math.round(Math.abs(delta)/size));
  const sign=Math.sign(delta);
  const cells=[];
  for(let i=0;i<=steps;i++){
    const x=state.origin.x+(axis==='x'?sign*i*state.width:0);
    const y=state.origin.y+(axis==='y'?sign*i*state.height:0);
    cells.push({x,y});
  }
  return cells;
}
// Kept for the existing stroke interface. A preview replaces the previous
// line instead of accumulating each pointer position.
export function buildStrokeStep(state,tile) {
  state.pointer={...tile};
  return normalizedBuildLine(state,tile);
}
