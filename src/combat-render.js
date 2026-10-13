import { CAMERA_CONFIG } from './camera.js';
import { nationColor } from './nations.js';

/** A single passive Canvas2D layer for moving scouts, shots and barrel aim.
 * All positions come from World units/projectiles; no per-entity DOM.
 */
export class CombatRenderer {
  constructor(svg,camera,world,combat) {
    this.camera=camera;this.world=world;this.combat=combat;
    this.canvas=document.createElement('canvas');
    this.canvas.className='combat-canvas';
    this.canvas.setAttribute('aria-hidden','true');
    try {this.ctx=this.canvas.getContext('2d',{alpha:true});}
    catch {this.ctx=null;}
    this.frame=0;
    this.flashes=[];
    this.animate=this.animate.bind(this);
    if(this.ctx){
      const previous=svg.parentElement.querySelector('.cargo-canvas')
        ??svg.parentElement.querySelector('.structure-lod-canvas')??svg;
      previous.insertAdjacentElement('afterend',this.canvas);
    }
  }
  wake(){
    if(this.ctx&&!this.frame)this.frame=requestAnimationFrame(this.animate);
  }
  animate(now) {
    this.frame=0;
    const camera=this.camera,ctx=this.ctx;
    const dpr=Math.min(window.devicePixelRatio||1,2);
    const width=Math.max(1,Math.round(camera.width*dpr));
    const height=Math.max(1,Math.round(camera.height*dpr));
    if(this.canvas.width!==width||this.canvas.height!==height){
      this.canvas.width=width;this.canvas.height=height;
    }
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,camera.width,camera.height);
    const units=this.world.units.entities,shots=this.world.projectiles.entities;
    const events=this.combat.visualEvents.splice(0);
    for(const effect of events) this.flashes.push({...effect,born:now});
    if(this.flashes.length>48)this.flashes.splice(0,this.flashes.length-48);
    this.flashes=this.flashes.filter(e=>now-e.born<240);
    if(!units.size&&!shots.size&&!this.flashes.length)return;
    const alpha=Math.max(0,Math.min(1,(now-this.combat.lastTick)/200));
    const scale=camera.zoom*CAMERA_CONFIG.tileSize;
    // The actual gun axis follows the simulation aim, not a decorative spin.
    // Only render while a fight is active; no per-structure animation callbacks.
    if(units.size && camera.zoom>=.48) for(const id of this.combat.turrets){
      const turret=this.world.structures.get(id);
      if(!turret || !Number.isFinite(turret.aimAngle))continue;
      const cx=(turret.x+turret.width/2)*CAMERA_CONFIG.tileSize;
      const cy=(turret.y+turret.height/2)*CAMERA_CONFIG.tileSize;
      const point=camera.worldToScreen(cx,cy);
      if(point.x<-50||point.y<-50||point.x>camera.width+50||point.y>camera.height+50)continue;
      const len=Math.min(31,Math.max(10,scale*(turret.type==='heavyTurret'?.72:.52)));
      const width=Math.max(3,Math.min(10,scale*.13));
      ctx.save();
      ctx.translate(point.x,point.y);
      ctx.rotate(turret.aimAngle);
      ctx.fillStyle='#26373c';
      ctx.strokeStyle='#aeb5a8';
      ctx.lineWidth=Math.max(1.2,Math.min(2.5,camera.zoom*2));
      ctx.beginPath();
      ctx.roundRect?.(0,-width*.5,len,width,Math.min(3,width*.3));
      if(!ctx.roundRect){ctx.rect(0,-width*.5,len,width);}
      ctx.fill();ctx.stroke();
      ctx.fillStyle='#b6a181';
      ctx.fillRect(len-4,-width*.5,4,width);
      ctx.restore();
    }
    for(const unit of units.values()){
      const x=(unit.prevX??unit.x)+(unit.x-(unit.prevX??unit.x))*alpha;
      const y=(unit.prevY??unit.y)+(unit.y-(unit.prevY??unit.y))*alpha;
      const p=camera.worldToScreen(x*CAMERA_CONFIG.tileSize,y*CAMERA_CONFIG.tileSize);
      if(p.x<-25||p.y<-25||p.x>camera.width+25||p.y>camera.height+25)continue;
      const s=Math.max(5,Math.min(16,scale*0.22));
      ctx.fillStyle='#182631';
      ctx.strokeStyle=nationColor(unit.ownerId);
      ctx.lineWidth=Math.max(1.5,s*0.19);
      ctx.beginPath();
      ctx.moveTo(p.x,p.y-s);
      ctx.lineTo(p.x+s*.8,p.y);
      ctx.lineTo(p.x,p.y+s*.9);
      ctx.lineTo(p.x-s*.8,p.y);
      ctx.closePath();
      ctx.fill();ctx.stroke();
      ctx.fillStyle='#b7c5ce';
      ctx.fillRect(p.x-s*.25,p.y-s*.26,s*.5,s*.52);
      if(unit.health<unit.maxHealth){
        ctx.fillStyle='#14212a';
        ctx.fillRect(p.x-s,p.y-s-5,s*2,2.6);
        ctx.fillStyle=nationColor(unit.ownerId);
        ctx.fillRect(p.x-s,p.y-s-5,s*2*unit.health/unit.maxHealth,2.6);
      }
    }
    for(const shot of shots.values()){
      const x=(shot.prevX??shot.x)+(shot.x-(shot.prevX??shot.x))*alpha;
      const y=(shot.prevY??shot.y)+(shot.y-(shot.prevY??shot.y))*alpha;
      const p=camera.worldToScreen(x*CAMERA_CONFIG.tileSize,y*CAMERA_CONFIG.tileSize);
      if(p.x<-20||p.y<-20||p.x>camera.width+20||p.y>camera.height+20)continue;
      const heavy=shot.damage>=40;
      const scatter=shot.splashRadius>0;
      const r=Math.max(2,(heavy?4.2:scatter?3.2:2.8)*camera.zoom);
      ctx.fillStyle=heavy?'#cfb89b':scatter?'#c9a789':'#f5d39a';
      ctx.strokeStyle=heavy?'#8e8273':'#cf9b65';
      ctx.lineWidth=1.4;
      ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fill();ctx.stroke();
    }
    for(const fx of this.flashes){
      const age=(now-fx.born)/240;
      const p=camera.worldToScreen(fx.x*CAMERA_CONFIG.tileSize,fx.y*CAMERA_CONFIG.tileSize);
      if(p.x<-25||p.y<-25||p.x>camera.width+25||p.y>camera.height+25)continue;
      ctx.globalAlpha=Math.max(0,1-age);
      ctx.strokeStyle=fx.heavy?'#f0c9a0':'#e8c997';
      ctx.lineWidth=fx.type==='hit'?2.4:2;
      if(fx.type==='hit'){
        ctx.beginPath();ctx.arc(p.x,p.y,3+age*(fx.heavy?18:11),0,Math.PI*2);ctx.stroke();
      }else{
        const dx=Math.cos(fx.angle),dy=Math.sin(fx.angle);
        ctx.beginPath();
        ctx.moveTo(p.x+dx*9,p.y+dy*9);
        ctx.lineTo(p.x+dx*(17+age*8),p.y+dy*(17+age*8));
        ctx.stroke();
      }
      ctx.globalAlpha=1;
    }
    if(units.size||shots.size||this.flashes.length)this.wake();
  }
}
