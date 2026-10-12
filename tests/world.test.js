import test from 'node:test';
import assert from 'node:assert/strict';
import { World, STRUCTURES, worldToTile, tileToWorld } from '../src/world.js';
import { Camera } from '../src/camera.js';

test('negative and positive tile math remains consistent around boundaries', () => {
  assert.deepEqual(worldToTile(-0.01, 47.99), { x: -1, y: 0 });
  assert.deepEqual(worldToTile(48, -48), { x: 1, y: -1 });
  assert.deepEqual(tileToWorld(-20, 21), { x: -960, y: 1008 });
});
test('sparse world does not allocate empty cells or chunks', () => {
  const w = new World();
  assert.equal(w.chunks.size, 0);
  assert.equal(w.getAt(20, 20), null);
  assert.equal(w.chunks.size, 0);
  const a = w.place('conveyor', 20, 20);
  assert.equal(a.ok, true);
  assert.equal(w.chunks.size, 1);
  assert.equal(w.getAt(20, 20), a.entity);
  assert.equal(w.remove(a.entity.id), true);
  assert.equal(w.chunks.size, 0);
});
test('rectangular building rotates and checks every occupied tile', () => {
  const w = new World();
  const p = w.place('smelter', 4, 6, 1);
  assert.equal(p.ok, true);
  assert.equal(p.entity.width, 2);
  assert.equal(p.entity.height, 3);
  for (let y = 6; y <= 8; y++) for (let x = 4; x <= 5; x++) assert.equal(w.getAt(x,y)?.id,p.entity.id);
  assert.equal(w.place('drill', 5, 8).reason, 'occupied');
  assert.equal(w.structures.size, 1);
  assert.equal(w.removeAt(5, 8), true);
  assert.equal(w.structures.size, 0);
  assert.equal(w.getAt(5, 8), null);
});
test('atomic placement rejects out-of-map or invalid input with no mutation', () => {
  const w = new World();
  const before = w.revision;
  assert.equal(w.place('smelter', 1023, 1023).reason, 'bounds');
  assert.equal(w.place('bad', 0, 0).reason, 'invalid');
  assert.equal(w.place('conveyor', 0.5, 0).reason, 'invalid');
  assert.equal(w.place('conveyor', -1025, 0).reason, 'bounds');
  assert.equal(w.chunks.size, 0);
  assert.equal(w.revision, before);
});
test('multi-chunk structures are visible once and cleanly removed', () => {
  const w = new World();
  const p = w.place('smelter', -993, -993); // spans 4 chunks at 32-cell boundaries
  assert.equal(p.ok, true);
  assert.equal(w.chunks.size, 4);
  assert.deepEqual([...w.visible(-995, -995, -991, -991)].map(v => v.id), [p.entity.id]);
  assert.equal([...w.visible(-993,-993,-993,-993)].length,1);
  assert.equal([...w.visible(-900,-900,-890,-890)].length,0);
  assert.equal(w.remove(p.entity.id),true);
  assert.equal(w.chunks.size,0);
});
test('camera projection stays invertible at different zoom and positions', () => {
  const c = new Camera(); c.resize(800,600); c.panPixels(127,-80);
  for (const factor of [0.1,0.4,0.99,2,30]) {
    const before=c.screenToWorld(150,170);
    c.zoomAt(factor,150,170);
    const after=c.screenToWorld(150,170);
    assert.ok(Math.abs(before.x-after.x)<1e-8);
    assert.ok(Math.abs(before.y-after.y)<1e-8);
    assert.ok(c.zoom>=0.4&&c.zoom<=3);
  }
});
test('catalog is immutable at the shape level',()=>{
  assert.ok(Object.isFrozen(STRUCTURES));
  assert.ok(Object.values(STRUCTURES).every(Object.isFrozen));
});
