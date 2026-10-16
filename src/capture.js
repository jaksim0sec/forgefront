/** Territorial control points. Ownership is changed through the regular
 * World API so territory, build restrictions, and rendering stay in sync. */
export const CAPTURE_RADIUS = 3.6;
export const CAPTURE_SECONDS = 10;
export const OUTPOST_CLAIM_RADIUS = 13;
const radius2=CAPTURE_RADIUS*CAPTURE_RADIUS;

export class Capture {
  constructor(world){
    this.world=world;
    this.sites=new Set();
    this.events=[];
    for(const e of world.structures.values())if(e.type==='outpost')this.sites.add(e.id);
    this.unsubscribe=world.subscribe(({type,entity})=>{
      if(entity?.type!=='outpost')return;
      if(type==='place')this.sites.add(entity.id);
      else if(type==='remove')this.sites.delete(entity.id);
    });
  }
  step(dt){
    if(!Number.isFinite(dt)||dt<=0)return false;
    dt=Math.min(.5,dt);
    if(!this.sites.size)return false;
    const byTeam=new Map();
    for(const u of this.world.units.entities.values()){
      if(u.role!=='soldier'||u.health<=0||!u.ownerId)continue;
      let group=byTeam.get(u.ownerId);
      if(!group)byTeam.set(u.ownerId,group=[]);
      group.push(u);
    }
    let changed=false;
    for(const id of this.sites){
      const site=this.world.structures.get(id);
      if(!site)continue;
      const center={x:site.x+site.width/2,y:site.y+site.height/2};
      const present=[];
      for(const [team,units] of byTeam){
        let count=0;
        for(const u of units){
          const dx=u.x-center.x,dy=u.y-center.y;
          if(dx*dx+dy*dy<=radius2)count++;
        }
        if(count)present.push({team,count});
      }
      if(present.length>1){
        if(site.captureState!=='contested'){
          site.captureState='contested';changed=true;
        }
        continue; // Enemy presence contests the site; no progress for anyone.
      }
      const invader=present[0];
      if(!invader||invader.team===site.ownerId){
        if(site.captureProgress>0){
          site.captureProgress=Math.max(0,site.captureProgress-dt*.7);
          changed=true;
        }
        if(site.captureProgress===0)site.captureTeam=null;
        const status=invader?'defended':'idle';
        if(site.captureState!==status){site.captureState=status;changed=true;}
        continue;
      }
      if(site.captureTeam!==invader.team){
        site.captureTeam=invader.team;
        site.captureProgress=0;
      }
      site.captureState='capturing';
      site.captureProgress=Math.min(1,(site.captureProgress??0)+
        dt*Math.min(1.7,1+(invader.count-1)*.18)/CAPTURE_SECONDS);
      changed=true;
      if(site.captureProgress>=1){
        this.world.setOwner(site.id,invader.team);
        site.captureProgress=0;
        site.captureTeam=null;
        site.captureState='secured';
        this.events.push({type:'captured',siteId:site.id,ownerId:invader.team,
          x:center.x,y:center.y});
      }
    }
    return changed;
  }
  dispose(){this.unsubscribe();this.sites.clear();}
}

/** Deterministic scenario placement on an existing save, once only.
 * No saved building is moved or replaced, and captured sites never respawn. */
export function seedOutposts(world){
  if(world.captureSitesSeeded)return [];
  world.captureSitesSeeded=true;
  const placed=[];
  for(const seed of [{x:28,y:-12},{x:44,y:22}]){
    const candidates=[];
    for(let offsetY=-6;offsetY<=6;offsetY++){
      for(let offsetX=-6;offsetX<=6;offsetX++){
        candidates.push({x:seed.x+offsetX,y:seed.y+offsetY,
          penalty:offsetX*offsetX+offsetY*offsetY});
      }
    }
    candidates.sort((a,b)=>a.penalty-b.penalty);
    for(const cell of candidates){
      if(!world.canPlace('outpost',cell.x,cell.y).ok)continue;
      if(world.terrain?.canBuildFootprint &&
        !world.terrain.canBuildFootprint(cell.x,cell.y,2,2))continue;
      // Make the capture ring stand on traversable ground, not an isolated ledge.
      let accessible=0;
      for(const [dx,dy] of [[-2,0],[3,0],[0,-2],[0,3]]){
        if(!world.terrain?.isCliffAt(cell.x+dx,cell.y+dy) &&
          !world.getAt(cell.x+dx,cell.y+dy))accessible++;
      }
      if(accessible<2)continue;
      const result=world.place('outpost',cell.x,cell.y,0,null);
      if(result.ok){placed.push(result.entity);break;}
    }
  }
  return placed;
}
