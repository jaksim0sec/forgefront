import test from 'node:test';
import assert from 'node:assert/strict';
import { Camera, CAMERA_CONFIG } from '../src/camera.js';
import { STRUCTURES } from '../src/world.js';
import { structureWorldTransform, worldLayerTransform } from '../src/render.js';
import { CargoRenderer } from '../src/cargo-renderer.js';

test('world transforms preserve the previous screen-space placement at every rotation', () => {
  const camera = new Camera();
  camera.resize(940, 660);
  camera.x = -120;
  camera.y = 75;
  camera.zoom = 1.65;
  const worldMatch = worldLayerTransform(camera).match(
    /^translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+)\)$/
  );
  assert.ok(worldMatch);
  const [, offsetX, offsetY, zoom] = worldMatch.map(Number);
  for (const type of ['conveyor', 'drill', 'smelter', 'superconductorPlant']) {
    const def = STRUCTURES[type];
    for (let rotation = 0; rotation < 4; rotation++) {
      const structure = { type, x: -2, y: 7, rotation };
      const worldMatch = structureWorldTransform(structure).match(
        /^translate\(([-\d.]+) ([-\d.]+)\) rotate\((\d+)\)$/
      );
      assert.ok(worldMatch);
      const [, worldX, worldY, angle] = worldMatch.map(Number);
      assert.equal(angle, rotation * 90);
      const tile = CAMERA_CONFIG.tileSize;
      const topLeft = camera.worldToScreen(structure.x * tile, structure.y * tile);
      const width = def.width * tile * camera.zoom;
      const height = def.height * tile * camera.zoom;
      const previous = [
        [topLeft.x, topLeft.y],
        [topLeft.x + height, topLeft.y],
        [topLeft.x + width, topLeft.y + height],
        [topLeft.x, topLeft.y + width],
      ][rotation];
      assert.ok(Math.abs((worldX * zoom + offsetX) - previous[0]) < 1e-7);
      assert.ok(Math.abs((worldY * zoom + offsetY) - previous[1]) < 1e-7);
    }
  }
});

test('cargo animation uses one canvas and never appends per-transfer SVG elements', () => {
  const old = {
    document: globalThis.document, window: globalThis.window,
    Image: globalThis.Image, requestAnimationFrame: globalThis.requestAnimationFrame,
  };
  const draws = [];
  const context = {
    setTransform() {}, clearRect() {}, drawImage(...params) { draws.push(params); },
    globalAlpha: 1,
  };
  const canvas = {
    width: 0, height: 0, className: '', setAttribute() {},
    getContext: () => context,
  };
  let inserted = 0;
  try {
    globalThis.document = { createElement: () => canvas };
    globalThis.window = {
      devicePixelRatio: 2, matchMedia: () => ({ matches: false }),
    };
    globalThis.Image = class {
      complete = true;
      naturalWidth = 32;
      set src(value) { this.url = value; }
    };
    globalThis.requestAnimationFrame = () => 1;

    const svg = {
      querySelector: () => ({ appendChild() { throw new Error('SVG fallback used'); } }),
      insertAdjacentElement: () => { inserted++; },
    };
    const camera = new Camera();
    camera.resize(1000, 700);
    const cargo = new CargoRenderer(svg, camera, { lead: { icon: './lead.svg' } });
    const world = {
      structures: new Map([
        [1, { x: 0, y: 0, width: 1, height: 1 }],
        [2, { x: 1, y: 0, width: 1, height: 1 }],
      ]),
    };
    cargo.transfer({ type: 'transfer', entity: { fromId: 1, toId: 2, itemId: 'lead' } }, world);
    assert.equal(inserted, 1);
    assert.equal(cargo.items.length, 1);
    cargo.animate(cargo.items[0].start + 100);
    assert.equal(draws.length, 1);
    assert.equal(canvas.width, 2000);
    cargo.animate(cargo.items[0].start + 400);
    assert.equal(cargo.items.length, 0);
  } finally {
    for (const [key, value] of Object.entries(old)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});
