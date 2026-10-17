/** Supply follows directed logistics links upstream from live command towers.
 * Cached in spatial buckets and invalidated only when topology changes.
 * Ammo is an abstract readiness budget, not a new physical resource.
 */
export const AMMO_CAPACITY=8;
export const RESUPPLY_SECONDS=1.25;
const LINKS=new Set(['conveyor','junction','tunnelEntrance','tunnelExit','warehouse']);
const WALLS=new Set(['wall','ironWall','reinforcedWall']);
const TILE=8;
const center=e=>({x:e.x+e.width/2,y:e.y+e.height/2});
const bucket=(x,y)=>Math.floor(x/TILE)+','+Math.floor(y/TILE);
export class FrontlineSupply {
  constructor(world,connections){
    this.world=world;this.connections=connections;this.nodes=new Map();
    this.dirty=true;this.revision=-1;
    this.unsubscribe=world.subscribe(({type,entity})=>{
      if(['place','remove','rotate','owner','state'].includes(type)&&entity&&
        (entity.type==='tower'||LINKS.has(entity.type)))this.dirty=true;
    });
  }
  rebuild(){
    this.nodes.clear();
    const visited=new Set(),queue=[],world=this.world;
    const add=(e,r)=>{
      const {x,y}=center(e),n={x,y,team:e.ownerId,d:r*r};
      for(let bx=Math.floor((x-r)/TILE);bx<=Math.floor((x+r)/TILE);bx++)
      for(let by=Math.floor((y-r)/TILE);by<=Math.floor((y+r)/TILE);by++){
        const k=bx+','+by;
        if(!this.nodes.has(k))this.nodes.set(k,[]);
        this.nodes.get(k).push(n);
      }
    };
    for(const tower of world.structures.values()){
      if(tower.type!=='tower'||!tower.ownerId||!tower.enabled||tower.health<=0)continue;
      visited.add(tower.ownerId+':'+tower.id);
      queue.push(tower);add(tower,8);
    }
    for(let i=0;i<queue.length;i++){
      const e=queue[i];
      for(const id of this.connections.inputs(e.id).keys()){
        const prev=world.structures.get(id);
        if(!prev||!LINKS.has(prev.type)||prev.ownerId!==e.ownerId||
          !prev.enabled||prev.health<=0)continue;
        const k=prev.ownerId+':'+prev.id;
        if(visited.has(k))continue;
        visited.add(k);queue.push(prev);
        add(prev,prev.type==='warehouse'?5:2.6);
      }
    }
    this.revision=this.connections.revision;this.dirty=false;
  }
  covers(u){
    if(!u?.ownerId)return false;
    if(this.dirty||this.revision!==this.connections.revision)this.rebuild();
    return (this.nodes.get(bucket(u.x,u.y))??[]).some(n=>n.team===u.ownerId&&
      (u.x-n.x)**2+(u.y-n.y)**2<=n.d);
  }
  dispose(){this.unsubscribe();this.nodes.clear();}
}
export function isEntrenched(world,u){
  if(u?.role!=='soldier'||!u.holdPosition||
    (u.pathIndex??0)<(u.path?.length??0))return false;
  const x=Math.floor(u.x),y=Math.floor(u.y);
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    const e=world.getAt(x+dx,y+dy);
    if(e?.ownerId===u.ownerId&&e.health>0&&!(e.constructionRemaining>0)&&WALLS.has(e.type))return true;
  }
  return false;
}
export const damageAgainstUnit=(world,u,damage)=>isEntrenched(world,u)?damage*.72:damage;
