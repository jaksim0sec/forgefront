/** Bounded, world-space combat simulation; no SVG/DOM nodes per moving entity.
 * Coordinates are tile units. Weapon stats are intentionally early-game values.
 */
export const TURRET = Object.freeze({
  range: 9, secondsPerShot: 0.72, damage: 14, shotSpeed: 15,
});
const MAX_SCOUTS = 24;
const MAX_SHOTS = 64;

function center(entity) {
  return { x: entity.x + entity.width / 2, y: entity.y + entity.height / 2 };
}
function distance2(a,b) {const dx=a.x-b.x,dy=a.y-b.y;return dx*dx+dy*dy;}

export class Combat {
  constructor(world) {
    this.world = world;
    this.turrets = new Set();
    this.cooldowns = new Map();
    this.lastTick = 0;
    for (const e of world.structures.values()) if (e.type === 'turret') this.turrets.add(e.id);
    this.unsubscribe = world.subscribe(({type,entity})=>{
      if (entity?.type !== 'turret') return;
      if (type==='place') this.turrets.add(entity.id);
      if (type==='remove') {this.turrets.delete(entity.id);this.cooldowns.delete(entity.id);}
    });
  }

  // A manual training scenario; no unattended waves or hidden timer.
  spawnRaid(defender = 'north') {
    const base = [...this.world.structures.values()].find(e=>
      e.type==='tower' && e.ownerId===defender && e.health>0);
    if (!base || this.world.units.entities.size + 3 > MAX_SCOUTS) return false;
    const hostile = defender === 'north' ? 'south' : 'north';
    const target = center(base);
    for (let i=0;i<3;i++) {
      const y = target.y - 2 + i*2;
      const x = target.x + 7.5 + i*0.5;
      this.world.units.spawn({
        x,y,ownerId:hostile, health:34, speed:1.7, targetId:base.id,
        prevX:x,prevY:y, hitPower:10, age:0,
      });
    }
    return true;
  }

  lineClear(a,b) {
    if (!this.world.terrain) return true;
    const length=Math.sqrt(distance2(a,b));
    // Bounded line-of-sight checks; terrain cliffs block fire.
    const steps=Math.ceil(length*1.5);
    for(let i=1;i<steps;i++){
      const t=i/steps;
      const x=Math.floor(a.x+(b.x-a.x)*t);
      const y=Math.floor(a.y+(b.y-a.y)*t);
      if(this.world.terrain.isCliffAt(x,y))return false;
    }
    return true;
  }

  step(dt) {
    if (!Number.isFinite(dt)||dt<=0) return false;
    const delta=Math.min(0.5,dt);
    const world=this.world, scouts=world.units.entities, shots=world.projectiles.entities;
    const active=this.turrets.size>0 && scouts.size>0;
    if (!scouts.size && !shots.size) return false;
    this.lastTick=typeof performance==='undefined'?0:performance.now();

    // Resolve existing shots before aiming another round.
    for (const [id,shot] of shots) {
      shot.prevX=shot.x;shot.prevY=shot.y;
      const target=scouts.get(shot.targetId);
      if(!target || target.ownerId===shot.ownerId){shots.delete(id);continue;}
      const d=Math.sqrt(distance2(shot,target));
      const travel=shot.speed*delta;
      if(d<=travel+0.32){
        world.units.damage(target.id,shot.damage);
        shots.delete(id);
      } else if(d>0){
        shot.x+=(target.x-shot.x)/d*travel;
        shot.y+=(target.y-shot.y)/d*travel;
      }
    }

    // Scouts advance towards their assigned command tower. Impassable ridges
    // halt movement instead of allowing enemies to clip through cliffs.
    for (const [id,scout] of scouts) {
      scout.age=(scout.age??0)+delta;
      if(scout.age>36){scouts.delete(id);continue;}
      scout.prevX=scout.x;scout.prevY=scout.y;
      const target=world.structures.get(scout.targetId);
      if(!target || target.ownerId===scout.ownerId){scouts.delete(id);continue;}
      const to=center(target);
      const d=Math.sqrt(distance2(scout,to));
      if(d<1.25){
        world.damageStructure(target.id,scout.hitPower);
        scouts.delete(id);continue;
      }
      const desired=Math.min(d,scout.speed*delta);
      const probeX=scout.x+(to.x-scout.x)/d*desired;
      const probeY=scout.y+(to.y-scout.y)/d*desired;
      const ground=world.terrain;
      const h0=ground?.heightAt(Math.floor(scout.x),Math.floor(scout.y))??0;
      const h1=ground?.heightAt(Math.floor(probeX),Math.floor(probeY))??0;
      const uphill=Math.max(0,h1-h0);
      const travel=desired*Math.max(0.55,1-uphill*5);
      const nx=scout.x+(to.x-scout.x)/d*travel;
      const ny=scout.y+(to.y-scout.y)/d*travel;
      if(!world.terrain?.isCliffAt(Math.floor(nx),Math.floor(ny))){
        scout.x=nx;scout.y=ny;
      }
    }

    if(active) for(const id of this.turrets){
      const turret=world.structures.get(id);
      if(!turret||!turret.enabled||!turret.powered||!turret.ownerId)continue;
      const cooldown=Math.max(0,(this.cooldowns.get(id)??0)-delta);
      if(cooldown>0){this.cooldowns.set(id,cooldown);continue;}
      const source=center(turret);
      let chosen=null,nearest=TURRET.range*TURRET.range;
      for(const scout of scouts.values()){
        if(scout.ownerId===turret.ownerId)continue;
        const d2=distance2(source,scout);
        if(d2>=nearest || !this.lineClear(source,scout))continue;
        chosen=scout;nearest=d2;
      }
      if(!chosen){this.cooldowns.set(id,0);continue;}
      turret.aimAngle=Math.atan2(chosen.y-source.y,chosen.x-source.x);
      if(shots.size<MAX_SHOTS){
        world.projectiles.spawn({
          x:source.x,y:source.y,prevX:source.x,prevY:source.y,
          health:1,ownerId:turret.ownerId,targetId:chosen.id,
          speed:TURRET.shotSpeed,damage:TURRET.damage,
        });
        this.cooldowns.set(id,TURRET.secondsPerShot);
      }
    }
    return true;
  }

  dispose(){this.unsubscribe();this.turrets.clear();this.cooldowns.clear();}
}
