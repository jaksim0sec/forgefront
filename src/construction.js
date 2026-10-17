/** Per-nation construction cap creates windows for raids and defense timing. */
export const ACTIVE_CREWS=3;
const SECONDS=Object.freeze({
 wall:4,ironWall:6,reinforcedWall:9,turret:10,scatterTurret:13,heavyTurret:18,
 unitFactory:14,warehouse:7,generator:11,leadCollector:5,drill:8,poweredDrill:11,
 smelter:9,siliconPlant:13,superconductorPlant:18
});
export const constructionSeconds=type=>SECONDS[type]??0;
export class Construction{
 constructor(world){
  this.world=world;
  this.sites=new Set([...world.structures.values()].filter(e=>e.constructionRemaining>0).map(e=>e.id));
  this.unsubscribe=world.subscribe(({type,entity})=>{
   if(!entity)return;
   if(type==='remove'){this.sites.delete(entity.id);return}
   if(['place','state'].includes(type)&&entity.constructionRemaining>0)this.sites.add(entity.id);
  });
 }
 step(dt){
  if(!(dt>0)||!Number.isFinite(dt)||!this.sites.size)return false;
  const crews=new Map();let active=false;
  for(const id of this.sites){
   const site=this.world.structures.get(id);
   if(!site||!(site.constructionRemaining>0)){this.sites.delete(id);continue}
   const team=site.ownerId??'neutral',count=crews.get(team)??0;
   if(count>=ACTIVE_CREWS)continue;
   crews.set(team,count+1);
   site.constructionRemaining=Math.max(0,site.constructionRemaining-Math.min(.5,dt));
   active=true;
   if(site.constructionRemaining===0){
    site.health=Math.min(site.maxHealth,site.health+Math.ceil(site.maxHealth*.6));
    site.enabled=true;site.activity='idle';
    this.sites.delete(id);
    this.world.changed('state',site);
   }
  }
  return active;
 }
 dispose(){this.unsubscribe();this.sites.clear()}
}
