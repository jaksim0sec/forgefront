import test from 'node:test';
import assert from 'node:assert/strict';
import { Camera } from '../src/camera.js';
import { STRUCTURES } from '../src/world.js';
import { DistantStructureRenderer, DISTANT_ZOOM, shouldDrawDistant,
  structureCanvasPlacement } from '../src/structure-lod.js';

test('distant LOD toggles strictly below connection-arrow zoom', () => {
  assert.equal(shouldDrawDistant(DISTANT_ZOOM), false);
  assert.equal(shouldDrawDistant(DISTANT_ZOOM - 0.01), true);
  assert.equal(shouldDrawDistant(0.4, false), false);
});

test('distant-world placements follow the same four rotations as SVG', () => {
  const s = { x: -2, y: 3, type: 'smelter' };
  const width = STRUCTURES.smelter.width * 48;
  const height = STRUCTURES.smelter.height * 48;
  const xy = [
    [-96, 144], [-96 + height, 144],
    [-96 + width, 144 + height], [-96, 144 + width],
  ];
  for (let i = 0; i < 4; i++) {
    const p = structureCanvasPlacement({ ...s, rotation: i });
    assert.deepEqual([p.tx, p.ty, p.rotation], [...xy[i], i]);
    assert.equal(p.w, width);
    assert.equal(p.h, height);
  }
});

test('thousands of distant structures use one canvas and zero SVG nodes', () => {
  const saved = {
    document: globalThis.document,
    window: globalThis.window,
    Image: globalThis.Image,
  };
  const calls = { canvases: 0, draws: 0, clears: 0, matrices: [], images: [] };
  const ctx = {
    setTransform(...a) { calls.matrices.push(a); },
    clearRect() { calls.clears++; },
    drawImage() { calls.draws++; },
    fillRect() {}, beginPath() {}, arc() {}, fill() {},
    moveTo() {}, lineTo() {}, stroke() {},
    fillStyle: '',
  };
  const canvas = {
    hidden: false, width: 0, height: 0, className: '',
    setAttribute() {},
    getContext: () => ctx,
  };
  try {
    globalThis.document = {
      createElement(type) {
        assert.equal(type, 'canvas');
        calls.canvases++;
        return canvas;
      },
      createElementNS() { throw new Error('DOM per structure'); },
    };
    globalThis.window = { devicePixelRatio: 2 };
    globalThis.Image = class {
      complete = true;
      naturalWidth = 96;
      set src(url) { calls.images.push(url); }
    };
    const camera = new Camera();
    camera.resize(1280, 720);
    camera.zoom = 0.4;
    const machines = Array.from({length: 2000}, (_, id) =>
      ({ id, x: id % 65, y: Math.floor(id / 65), rotation: id % 4,
         type: id % 2 ? 'conveyor' : 'drill', ownerId: null,
         enabled: true, activity: 'mining', health: 100, maxHealth: 100 }));
    const world = { *visible() { yield* machines; } };
    const connections = { inputs: () => new Map() };
    const svg = { insertAdjacentElement(where, node) {
      assert.equal(where, 'afterend');
      assert.equal(node, canvas);
    }};
    const renderer = new DistantStructureRenderer(svg, world, camera, connections,
      { conveyor: '<symbol id="s-conveyor" viewBox="0 0 48 48"><rect width="48" height="48"/></symbol>',
        drill: '<symbol id="s-drill" viewBox="0 0 96 96"><rect width="96" height="96"/></symbol>' });
    assert.equal(calls.canvases, 1);
    assert.equal(calls.images.length, 2);
    assert.ok(calls.images.every(url => url.startsWith('data:image/svg+xml;charset=utf-8,')));
    assert.equal(renderer.draw(null), true);
    assert.equal(calls.draws, 2000);
    assert.equal(canvas.hidden, false);
    assert.deepEqual([canvas.width, canvas.height], [2560, 1440]);
    // The first two render matrices must be different because rotation differs.
    assert.notDeepEqual(calls.matrices[1], calls.matrices[2]);
    camera.zoom = 1;
    assert.equal(renderer.draw(null), false);
    assert.equal(canvas.hidden, true);
    assert.equal(calls.draws, 2000);
    camera.zoom = 0.4;
    assert.equal(renderer.draw(null), true);
    assert.equal(calls.draws, 4000);
    assert.equal(calls.canvases, 1);
  } finally {
    for (const [k,v] of Object.entries(saved)) {
      if (v === undefined) delete globalThis[k];
      else globalThis[k] = v;
    }
  }
});

test('distant mode leaves SVG rendering available without Canvas2D', () => {
  const saved = globalThis.document;
  try {
    globalThis.document = { createElement() { return {
      setAttribute() {}, getContext() { return null; },
    }; }};
    const camera = new Camera();
    camera.zoom = 0.4;
    const renderer = new DistantStructureRenderer({}, {visible() {}}, camera, {},
      {});
    assert.equal(renderer.draw(null), false);
  } finally {
    if (saved === undefined) delete globalThis.document;
    else globalThis.document = saved;
  }
});
