import { CAMERA_CONFIG } from './camera.js';
import { TERRAIN_CHUNK_TILES, terrainChunkBounds } from './terrain-render.js';
import { nationColor } from './nations.js';

const NS = 'http://www.w3.org/2000/svg';
const CELL = 24;
const CHUNK_PX = TERRAIN_CHUNK_TILES * CELL;
const WORLD_SIZE = TERRAIN_CHUNK_TILES * CAMERA_CONFIG.tileSize;

// Static territorial tint and borders, baked into one image per visible chunk.
// Only rebuilt on tower/ownership changes; no per-frame tile DOM.
export class TerritoryRenderer {
  constructor(svg, territory, camera) {
    this.layer = svg.querySelector('#territory-layer');
    this.territory = territory;
    this.camera = camera;
    this.chunks = new Map();
    this.viewport = '';
    this.transform = '';
    this.revision = -1;
    try {
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.canvas.height = CHUNK_PX;
      this.ctx = this.canvas.getContext('2d', { alpha: true });
      if (!this.canvas.toDataURL || !this.layer) this.ctx = null;
    } catch {
      this.ctx = null;
    }
  }

  makeChunk(cx, cy) {
    const ctx = this.ctx;
    const x0 = cx * TERRAIN_CHUNK_TILES;
    const y0 = cy * TERRAIN_CHUNK_TILES;
    ctx.clearRect(0, 0, CHUNK_PX, CHUNK_PX);
    let painted = false;
    for (let y = 0; y < TERRAIN_CHUNK_TILES; y++) {
      for (let x = 0; x < TERRAIN_CHUNK_TILES; x++) {
        const tx = x0 + x, ty = y0 + y;
        const owner = this.territory.ownerAt(tx, ty);
        if (!owner) continue;
        painted = true;
        const color = nationColor(owner);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.15;
        ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
        ctx.globalAlpha = 0.8;
        // Edge-aware border: never draw internal tile seams.
        const right = this.territory.ownerAt(tx + 1, ty);
        const bottom = this.territory.ownerAt(tx, ty + 1);
        const left = this.territory.ownerAt(tx - 1, ty);
        const top = this.territory.ownerAt(tx, ty - 1);
        if (right !== owner) ctx.fillRect((x + 1) * CELL - 3, y * CELL, 3, CELL);
        if (bottom !== owner) ctx.fillRect(x * CELL, (y + 1) * CELL - 3, CELL, 3);
        if (left !== owner) ctx.fillRect(x * CELL, y * CELL, 3, CELL);
        if (top !== owner) ctx.fillRect(x * CELL, y * CELL, CELL, 3);
      }
    }
    ctx.globalAlpha = 1;
    if (!painted) return null;
    const image = document.createElementNS(NS, 'image');
    image.setAttribute('x', cx * WORLD_SIZE);
    image.setAttribute('y', cy * WORLD_SIZE);
    image.setAttribute('width', WORLD_SIZE);
    image.setAttribute('height', WORLD_SIZE);
    image.setAttribute('preserveAspectRatio', 'none');
    image.setAttribute('pointer-events', 'none');
    image.setAttribute('href', this.canvas.toDataURL('image/png'));
    return image;
  }

  draw() {
    if (!this.ctx) return;
    const c = this.camera;
    const transform = `translate(${c.width / 2 - c.x * c.zoom} ${c.height / 2 - c.y * c.zoom}) scale(${c.zoom})`;
    if (transform !== this.transform) {
      this.layer.setAttribute('transform', transform);
      this.transform = transform;
    }
    if (this.revision !== this.territory.revision) {
      for (const node of this.chunks.values()) node?.remove();
      this.chunks.clear();
      this.viewport = '';
      this.revision = this.territory.revision;
    }
    const {minX,maxX,minY,maxY} = terrainChunkBounds(c);
    const viewport = `${minX},${maxX},${minY},${maxY}`;
    if (viewport === this.viewport) return;
    this.viewport = viewport;
    const keep = new Set();
    for (let cy = minY; cy <= maxY; cy++) for (let cx = minX; cx <= maxX; cx++) {
      const key = cx + ',' + cy;
      keep.add(key);
      let node = this.chunks.get(key);
      if (node === undefined) {
        try { node = this.makeChunk(cx,cy); }
        catch { this.ctx = null; return; }
        this.chunks.set(key, node);
      }
      if (node && node.parentNode !== this.layer) this.layer.appendChild(node);
    }
    for (const [key,node] of this.chunks) {
      if (keep.has(key)) continue;
      node?.remove();
      this.chunks.delete(key);
    }
  }
}
