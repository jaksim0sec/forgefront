import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { Terrain, CLIFF_HEIGHT } from '../src/terrain.js';
import { Territory, CLAIM_RADIUS } from '../src/territory.js';
import { TerritoryRenderer } from '../src/territory-render.js';
import { Camera } from '../src/camera.js';

test('the command tower defines an owned region; competing towers divide it', () => {
  const world = new World();
  const a = world.place('tower', 0, -1, 0, 'north').entity;
  const b = world.place('tower', 31, -12, 0, 'south').entity;
  const territory = new Territory(world);
  assert.equal(CLAIM_RADIUS, 22);
  assert.equal(territory.ownerAt(0, 0), 'north');
  assert.equal(territory.ownerAt(31, -11), 'south');
  assert.equal(territory.ownerAt(400, 400), null);
  assert.equal(territory.ownerAt(0, -25), null);
  assert.equal(territory.ownerAt(9, -6), 'north');
  assert.equal(territory.ownerAt(28, -8), 'south');
  const revision = territory.revision;
  world.setOwner(b.id, 'north');
  assert.equal(territory.ownerAt(31, -11), 'north');
  assert.ok(territory.revision > revision);
  world.remove(b.id);
  assert.equal(territory.ownerAt(31, -11), null);
  world.remove(a.id);
  assert.equal(territory.ownerAt(0, 0), null);
  territory.dispose();
});

test('unclaimed towers do not paint territory; an ownership change activates it', () => {
  const world = new World();
  const a = world.place('tower', -60, 30, 0, null).entity;
  const territory = new Territory(world);
  assert.equal(territory.ownerAt(-59,31), null);
  world.setOwner(a.id, 'south');
  assert.equal(territory.ownerAt(-59,31), 'south');
  world.setOwner(a.id, null);
  assert.equal(territory.ownerAt(-59,31), null);
});

test('cliff art threshold matches the actual impassable building rule', () => {
  const terrain = new Terrain();
  let found = null;
  for (let y = -160; y <= 160 && !found; y++) {
    for (let x = -160; x <= 160; x++) {
      if (terrain.isCliffAt(x, y)) { found = [x,y]; break; }
    }
  }
  assert.ok(found, 'at least one deterministic cliff tile is present');
  const [x,y] = found;
  assert.ok(terrain.heightAt(x,y) >= CLIFF_HEIGHT);
  assert.equal(terrain.groundAt(x,y).biome, 'cliff');
  assert.equal(terrain.canBuildFootprint(x,y,1,1), false);
  assert.equal(terrain.canBuildFootprint(0,0,1,1), true);
});

test('territory draw is one cached image per visible chunk; only tower edits invalidate it', () => {
  const old = { document: globalThis.document, window: globalThis.window };
  class Elem {
    constructor(){this.attrs={};this.children=[];this.parentNode=null;}
    setAttribute(n,v){this.attrs[n]=v;}
    appendChild(node){if(node.parentNode)node.remove();this.children.push(node);node.parentNode=this;}
    remove(){if(!this.parentNode)return;const siblings=this.parentNode.children;siblings.splice(siblings.indexOf(this),1);this.parentNode=null;}
  }
  let creations=0,draws=0;
  try {
    globalThis.document={
      createElement(tag) {assert.equal(tag,'canvas');return {
        width:0,height:0,
        getContext(){return {clearRect(){},fillRect(){draws++;}};},
        toDataURL(){return 'data:image/png;base64,AA==';}
      };},
      createElementNS(ns,tag){assert.equal(tag,'image');creations++;return new Elem();}
    };
    globalThis.window={devicePixelRatio:1};
    const world=new World();
    const tower=world.place('tower',0,0,0,'north').entity;
    const territory=new Territory(world);
    const camera=new Camera();
    camera.resize(800,600);
    const group=new Elem();
    const renderer=new TerritoryRenderer({querySelector:()=>group},territory,camera);
    renderer.draw();
    const initial=creations;
    assert.ok(initial>0);
    assert.ok(initial<20,'only the touched chunks should have claims');
    assert.ok(draws>0);
    renderer.draw();
    camera.panPixels(3,2);
    renderer.draw();
    assert.equal(creations,initial,'moving inside the same chunks should reuse images');
    world.place('drill',-12,10);
    renderer.draw();
    assert.equal(creations,initial,'ordinary structures do not invalidate boundaries');
    world.setOwner(tower.id,'south');
    renderer.draw();
    assert.ok(creations>initial,'a capture redraws the claim images');
    const revised=creations;
    world.remove(tower.id);
    renderer.draw();
    assert.equal(territory.ownerAt(0,0),null);
    assert.equal(creations,revised,'unclaimed chunks have no SVG images');
    territory.dispose();
  } finally {
    for (const [key,value] of Object.entries(old)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});
