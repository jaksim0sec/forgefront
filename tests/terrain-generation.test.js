import test from 'node:test';
import assert from 'node:assert/strict';
import { Camera } from '../src/camera.js';
import { Terrain } from '../src/terrain.js';
import { TerrainRenderer, terrainChunkBounds, TERRAIN_CHUNK_TILES, groundColor } from '../src/terrain-render.js';
import { World } from '../src/world.js';

test('topography and ore veins remain seeded and stable across negative coordinates', () => {
  const a = new Terrain(2841), b = new Terrain(2841), c = new Terrain(2898);
  for (const [x,y] of [[0,0],[-8,8],[10,-4],[17,8],[-100,-300],[487,265]]) {
    assert.deepEqual(a.groundAt(x,y), b.groundAt(x,y));
    assert.equal(a.oreAt(x,y), b.oreAt(x,y));
    assert.ok(a.heightAt(x,y)>=0 && a.heightAt(x,y)<=1);
    assert.ok(a.groundAt(x,y).slope>=0);
  }
  assert.notEqual(a.heightAt(130,218),c.heightAt(130,218));
  assert.equal(a.oreAt(-8,8),'iron');
  assert.equal(a.oreAt(9,-5),'coal');
  assert.equal(a.oreAt(17,8),'titanium');
  assert.equal(a.oreAt(0,0),null);
  assert.equal(a.depositFor(-8,8,2,2,['iron','coal']),'iron');
  assert.match(groundColor(a.groundAt(0,0)),/^rgb\(\d+,\d+,\d+\)$/);
});

test('steep mountain building constraint preserves scripted start and sandbox', () => {
  const terrain = new Terrain();
  const w = new World();
  w.terrain = terrain;
  w.survival = true;
  w.credit('north','lead',100);
  assert.equal(w.build('drill',-8,8,0,'north').ok,true);
  assert.equal(w.build('drill',9,-5,0,'north').ok,true);
  let inaccessible = null;
  for (let y=-150; y<150 && !inaccessible; y+=3)
    for (let x=-150; x<150; x+=3) if (!terrain.canBuildFootprint(x,y,2,2)) {
      inaccessible = [x,y]; break;
    }
  assert.ok(inaccessible);
  const [x,y] = inaccessible;
  assert.equal(w.canBuild('smelter',x,y,0,'north').reason,'terrain');
  assert.equal(w.place('smelter',x,y).ok,true);
  assert.equal(w.canBuild('drill',5,100,0,'north').reason,'ore');
});

test('terrain renders only two cached image nodes per 16x16 chunk, never per tile', () => {
  const old = {document:globalThis.document,Image:globalThis.Image};
  const nodes = [];
  class SvgElement {
    constructor(tag) {this.tag=tag;this.attributes={};this.children=[];this.parentNode=null;this.setCount=0;}
    setAttribute(k,v){this.attributes[k]=v;this.setCount++;}
    getAttribute(k){return this.attributes[k]??null;}
    appendChild(node){ if(node.parentNode)node.remove();this.children.push(node);node.parentNode=this; }
    remove(){if(!this.parentNode)return;const a=this.parentNode.children; a.splice(a.indexOf(this),1);this.parentNode=null;}
  }
  const canvas={
    width:0,height:0,
    getContext:()=>({
      fillRect(){},clearRect(){},beginPath(){},moveTo(){},lineTo(){},
      closePath(){},fill(){},ellipse(){},drawImage(){},
    }),
    toDataURL:()=> 'data:image/png;base64,AA==',
  };
  try {
    globalThis.document = {
      createElement(t){assert.equal(t,'canvas');return canvas},
      createElementNS(ns,tag){const node=new SvgElement(tag);nodes.push(node);return node},
    };
    // Keep ore fallback images until explicitly loaded.
    globalThis.Image = class {complete=false;naturalWidth=0;set src(v){}};
    const layers=new Map([['#terrain-layer',new SvgElement('g')],['#ore-layer',new SvgElement('g')]]);
    const svg={querySelector:id=>layers.get(id)};
    const camera=new Camera();
    camera.resize(700,500);
    const renderer=new TerrainRenderer(svg,new Terrain(),camera);
    renderer.draw();
    const chunks=renderer.chunks.size;
    assert.ok(chunks>0);
    assert.equal(layers.get('#terrain-layer').children.length,chunks);
    assert.ok(nodes.length<=2*chunks);
    const creates=nodes.length;
    renderer.draw();
    camera.panPixels(5,0);
    renderer.draw();
    assert.equal(nodes.length,creates);
    const before=terrainChunkBounds(camera);
    assert.ok(before.maxX-before.minX<10);
    assert.equal(TERRAIN_CHUNK_TILES,16);
    camera.panPixels(1100,0);
    renderer.draw();
    assert.ok(renderer.chunks.size<20);
    assert.ok(nodes.length<=2*(chunks+renderer.chunks.size)+6);
  } finally {
    for(const [k,v] of Object.entries(old)) {
      if(v===undefined)delete globalThis[k];else globalThis[k]=v;
    }
  }
});
