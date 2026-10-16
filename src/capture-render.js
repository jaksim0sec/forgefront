import { CAMERA_CONFIG } from './camera.js';
import {nationColor,nationLabel,nationFlagSvg} from './nations.js';

const NS='http://www.w3.org/2000/svg';
const RING=2*Math.PI*21;
const svgNode=(tag,attrs={})=>{
  const node=document.createElementNS(NS,tag);
  for(const [name,value] of Object.entries(attrs))node.setAttribute(name,value);
  return node;
};
/** Two lightweight SVG markers follow camera movement; no DOM per tile. */
export class CaptureRenderer {
  constructor(svg,camera,world,capture){
    this.layer=svgNode('g',{'pointer-events':'none','aria-hidden':'true'});
    this.layer.setAttribute('class','capture-markers');
    svg.appendChild(this.layer);
    this.camera=camera;this.world=world;this.capture=capture;
    this.nodes=new Map();
    this.towers=new Set([...world.structures.values()]
      .filter(e=>e.type==='tower').map(e=>e.id));
    this.unsubscribe=world.subscribe(({type,entity})=>{
      if(entity?.type!=='tower')return;
      if(type==='place')this.towers.add(entity.id);
      else if(type==='remove')this.towers.delete(entity.id);
    });
  }
  createMarker(){
    const group=svgNode('g',{class:'capture-marker'});
    const rim=svgNode('circle',{r:21,cx:0,cy:0,class:'capture-rim'});
    const ring=svgNode('circle',{r:21,cx:0,cy:0,fill:'none',
      'stroke-width':3,'stroke-linecap':'round',transform:'rotate(-90)',
      'stroke-dasharray':'0 '+RING});
    const flag=svgNode('image',{x:-17,y:-44,width:34,height:23,
      preserveAspectRatio:'xMidYMid meet'});
    const label=svgNode('text',{x:0,y:36,'text-anchor':'middle',
      class:'capture-label'});
    group.append(rim,ring,flag,label);
    this.layer.appendChild(group);
    return {group,ring,flag,label,lastFlag:''};
  }
  draw(){
    const current=new Set(),scale=CAMERA_CONFIG.tileSize;
    for(const id of [...this.capture.sites,...this.towers]){
      const site=this.world.structures.get(id);
      if(!site)continue;
      current.add(id);
      let item=this.nodes.get(id);
      if(!item){item=this.createMarker();this.nodes.set(id,item);}
      const p=this.camera.worldToScreen((site.x+site.width/2)*scale,
        (site.y+site.height/2)*scale);
      const hidden=p.x<-80||p.x>this.camera.width+80||
        p.y<-80||p.y>this.camera.height+80;
      item.group.setAttribute('visibility',hidden?'hidden':'visible');
      if(hidden)continue;
      item.group.setAttribute('transform','translate('+p.x+' '+p.y+')');
      const owner=site.ownerId;
      const color=nationColor(site.captureTeam??owner);
      const progress=Math.max(0,Math.min(1,site.captureProgress??0));
      item.ring.setAttribute('stroke',color);
      item.ring.setAttribute('stroke-dasharray',(RING*progress)+' '+RING);
      item.ring.setAttribute('opacity',progress>0?'1':'0');
      const flagKey=owner??'neutral';
      const imageSvg=nationFlagSvg(owner);
      if(item.lastFlag!==imageSvg){
        item.lastFlag=imageSvg;
        item.flag.setAttribute('href','data:image/svg+xml;charset=utf-8,'+
          encodeURIComponent(imageSvg));
      }
      item.label.textContent=site.type==='tower' ? nationLabel(owner)+' 중앙 타워' :
        site.captureState==='contested'?'⚔ 점령 경합'
        : progress>0?nationLabel(site.captureTeam)+' '+Math.round(progress*100)+'%'
        : owner?nationLabel(owner)+' 전초기지':'중립 전초기지';
      item.label.setAttribute('fill',color);
    }
    for(const [id,item] of this.nodes){
      if(current.has(id))continue;
      item.group.remove();this.nodes.delete(id);
    }
  }
}
