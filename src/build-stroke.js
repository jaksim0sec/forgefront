/** Grid-locked drag painting: fixed origin, whole-footprint steps and immediate orthogonal turns. */
export function snappedBuildAnchor(tile, width, height) {
  return {x:tile.x-Math.floor((width-1)/2),y:tile.y-Math.floor((height-1)/2)};
}
export function buildStrokeStep(state, tile) {
  const next={x:tile.x,y:tile.y};
  const prev=state.pointer??next;
  const dx=next.x-prev.x,dy=next.y-prev.y;
  const ordered=Math.abs(dx)>=Math.abs(dy)?['x','y']:['y','x'];
  const points=[];
  let x=prev.x,y=prev.y;
  // A quick drag may skip many pointer events; traverse each crossed tile,
  // then snap to the original placement lattice, not a shifting finger offset.
  for(const axis of ordered) {
    const end=next[axis],step=Math.sign(end-(axis==='x'?x:y));
    const limit=Math.min(512,Math.abs(end-(axis==='x'?x:y)));
    for(let n=0;n<limit;n++) {
      if(axis==='x')x+=step;else y+=step;
      const {origin,width,height}=state;
      const ax=origin.x+Math.round((x-state.start.x)/width)*width;
      const ay=origin.y+Math.round((y-state.start.y)/height)*height;
      const key=ax+','+ay;
      if(state.lastKey!==key) {
        state.lastKey=key;
        points.push({x:ax,y:ay});
      }
    }
  }
  state.pointer=next;
  return points;
}
export function startBuildStroke(tile,width,height) {
  const origin=snappedBuildAnchor(tile,width,height);
  return {start:{...tile},pointer:{...tile},origin,width,height,
    lastKey:origin.x+','+origin.y};
}
