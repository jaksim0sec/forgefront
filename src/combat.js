/** Bounded, world-space combat simulation; no SVG/DOM nodes per moving entity.
 * Coordinates are tile units. Weapon stats are intentionally early-game values.
 */
import { WEAPONS, isWall } from './defense.js';
export const TURRET = WEAPONS.turret;
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
    this.visualEvents = [];
    for (const e of world.structures.values()) if (WEAPONS[e.type]) this.turrets.add(e.id);
    this.unsubscribe = world.subscribe(({type,entity})=>{
      if (!WEAPONS[entity?.type]) return;
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
        prevX:x,prevY:y, hitPower:10, age:0, mobility:'ground',
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
        this.visualEvents.push({type:'hit',x:target.x,y:target.y,heavy:shot.damage>=40});
        world.units.damage(target.id,shot.damage);
        if (shot.splashRadius && shot.splashDamage) {
          const radius2=shot.splashRadius*shot.splashRadius;
          for (const other of scouts.values()) {
            if (other.id===target.id || other.ownerId===shot.ownerId) continue;
            if (distance2(other,target)<=radius2) world.units.damage(other.id,shot.splashDamage);
          }
        }
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
      if(scout.mobility !== 'air'){
        const obstacle=world.getAt(Math.floor(nx),Math.floor(ny));
        if(obstacle && obstacle.ownerId!==scout.ownerId &&
            obstacle.health>0 && isWall(obstacle.type)){
          scout.attackTimer=(scout.attackTimer??0)-delta;
          if(scout.attackTimer<=0){
            world.damageStructure(obstacle.id,scout.hitPower??10);
            scout.attackTimer=.85;
          }
          continue;
        }
      }
      if(!world.terrain?.isCliffAt(Math.floor(nx),Math.floor(ny))){
        scout.x=nx;scout.y=ny;
      }
    }

    // Do not wait for a far-away projectile when a closer turret can finish
    // the same scout sooner. Reservations are ordered by estimated impact time.
    const incoming = new Map();
    for (const shot of shots.values()) {
      const target = scouts.get(shot.targetId);
      if (!target || target.ownerId === shot.ownerId) continue;
      let arrival = incoming.get(target.id);
      if (!arrival) incoming.set(target.id, arrival = []);
      arrival.push({
        eta: Math.sqrt(distance2(shot, target)) / Math.max(1, shot.speed),
        damage: shot.damage
      });
    }
    if(active) for(const id of this.turrets){
      const turret=world.structures.get(id);
      if(!turret||!turret.enabled||!turret.powered||!turret.ownerId)continue;
      const weapon=WEAPONS[turret.type];
      const cooldown=Math.max(0,(this.cooldowns.get(id)??0)-delta);
      this.cooldowns.set(id,cooldown);
      const source=center(turret);
      let tracking=null,trackDistance=weapon.range*weapon.range;
      let chosen=null,nearest=weapon.range*weapon.range;
      for(const scout of scouts.values()){
        if(scout.ownerId===turret.ownerId || scout.health<=0)continue;
        const d2=distance2(source,scout);
        if(d2>=weapon.range*weapon.range || !this.lineClear(source,scout))continue;
        // Tracking is independent of reload and projectile reservations.
        // atan2 covers all four quadrants, including enemies behind the turret.
        if(d2<trackDistance){tracking=scout;trackDistance=d2;}
        if(cooldown>0 || d2>=nearest)continue;
        const eta=Math.sqrt(d2)/weapon.shotSpeed;
        let damageBeforeArrival=0;
        for(const hit of incoming.get(scout.id)??[])
          if(hit.eta<=eta+0.04)damageBeforeArrival+=hit.damage;
        if(damageBeforeArrival>=scout.health)continue;
        chosen=scout;nearest=d2;
      }
      if(tracking) turret.aimAngle=Math.atan2(tracking.y-source.y,tracking.x-source.x);
      if(cooldown>0 || !chosen)continue;
      // When reservations pick a different target, align the shot as well.
      turret.aimAngle=Math.atan2(chosen.y-source.y,chosen.x-source.x);
      if(shots.size<MAX_SHOTS){
        world.projectiles.spawn({
          x:source.x,y:source.y,prevX:source.x,prevY:source.y,
          health:1,ownerId:turret.ownerId,targetId:chosen.id,
          speed:weapon.shotSpeed,damage:weapon.damage,
          splashRadius:weapon.splashRadius??0,splashDamage:weapon.splashDamage??0,
        });
        let arrival=incoming.get(chosen.id);
        if(!arrival) incoming.set(chosen.id, arrival=[]);
        arrival.push({eta:Math.sqrt(nearest)/weapon.shotSpeed,damage:weapon.damage});
        this.visualEvents.push({type:'fire',x:source.x,y:source.y,angle:turret.aimAngle,heavy:weapon.damage>=40});
        this.cooldowns.set(id,weapon.secondsPerShot);
      }
    }
    if(this.visualEvents.length>48)this.visualEvents.splice(0,this.visualEvents.length-48);
    return true;
  }

  dispose(){this.unsubscribe();this.turrets.clear();this.cooldowns.clear();}
}
