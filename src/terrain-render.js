import { CAMERA_CONFIG } from './camera.js';
import { RESOURCES } from './resources.js';

const NS = 'http://www.w3.org/2000/svg';
export const TERRAIN_CHUNK_TILES = 16;
export const TERRAIN_RASTER_TILE = 32;
const TILE = CAMERA_CONFIG.tileSize;
const CHUNK_WORLD_SIZE = TERRAIN_CHUNK_TILES * TILE;
const CHUNK_PX = TERRAIN_CHUNK_TILES * TERRAIN_RASTER_TILE;
const ORES = ['iron', 'coal', 'titanium'];

export function terrainChunkBounds(camera) {
  const left = camera.screenToWorld(0, 0);
  const right = camera.screenToWorld(camera.width, camera.height);
  return {
    minX: Math.floor(left.x / CHUNK_WORLD_SIZE),
    maxX: Math.floor(right.x / CHUNK_WORLD_SIZE),
    minY: Math.floor(left.y / CHUNK_WORLD_SIZE),
    maxY: Math.floor(right.y / CHUNK_WORLD_SIZE),
  };
}

export function groundColor({ height, moisture, biome }, variation = 0) {
  const base = biome === 'cliff' ? [55, 69, 75] : biome === 'ridge' ? [73, 85, 86] :
    biome === 'rock' ? [59, 76, 83] :
    biome === 'scrub' ? [49, 69, 62] :
    biome === 'basin' ? [34, 54, 62] : [47, 64, 69];
  const lift = Math.round((height - 0.45) * 26 + (moisture - 0.5) * 8 + variation);
  return `rgb(${base.map(c => Math.max(0, Math.min(255, c + lift)) | 0).join(',')})`;
}

/** Static ground and ore are rasterized once per visible chunk, then displayed
 * as one SVG <image> each. Zoom/pan change only two parent transforms.
 * The 2D canvas is scratch memory; it is never appended to the document.
 */
export class TerrainRenderer {
  constructor(svg, terrain, camera) {
    this.terrain = terrain;
    this.camera = camera;
    this.groundLayer = svg.querySelector('#terrain-layer');
    this.oreLayer = svg.querySelector('#ore-layer');
    this.chunks = new Map();
    this.lastViewport = '';
    this.lastTransform = '';
    this.icons = new Map();
    this.scratch = null;
    this.ctx = null;
    try {
      this.scratch = document.createElement('canvas');
      this.scratch.width = this.scratch.height = CHUNK_PX;
      this.ctx = this.scratch.getContext('2d', { alpha: true });
      if (!this.scratch.toDataURL || !this.groundLayer || !this.oreLayer) this.ctx = null;
    } catch {
      this.ctx = null;
    }

    if (this.ctx && typeof Image !== 'undefined') for (const type of ORES) {
      const icon = new Image();
      icon.onload = () => {
        // Upgrade initial vector fallbacks with the actual resource artwork.
        if (!this.ctx) return;
        try {
          for (const chunk of this.chunks.values()) this.paintOre(chunk);
        } catch {
          // Same-origin SVGs normally export cleanly; a browser's restricted
          // canvas implementation must not interrupt the world renderer.
          this.icons.delete(type);
        }
      };
      icon.src = RESOURCES[type].icon;
      this.icons.set(type, icon);
    }
  }

  node(tag, x, y) {
    const element = document.createElementNS(NS, tag);
    element.setAttribute('x', x * CHUNK_WORLD_SIZE);
    element.setAttribute('y', y * CHUNK_WORLD_SIZE);
    element.setAttribute('width', CHUNK_WORLD_SIZE);
    element.setAttribute('height', CHUNK_WORLD_SIZE);
    element.setAttribute('pointer-events', 'none');
    return element;
  }

  paintGround(chunk) {
    const { ctx } = this;
    const { cx, cy } = chunk;
    const size = TERRAIN_RASTER_TILE;
    ctx.clearRect(0, 0, CHUNK_PX, CHUNK_PX);
    for (let ty = 0; ty < TERRAIN_CHUNK_TILES; ty++) for (let tx = 0; tx < TERRAIN_CHUNK_TILES; tx++) {
      const x = cx * TERRAIN_CHUNK_TILES + tx;
      const y = cy * TERRAIN_CHUNK_TILES + ty;
      const sample = this.terrain.groundAt(x, y);
      const detail = this.terrain.hash(x * 7, y * 7);
      const px = tx * size, py = ty * size;
      ctx.fillStyle = groundColor(sample, (detail % 9) - 4);
      ctx.fillRect(px, py, size, size);

      // Orthographic terrace relief. Height steps are shared across tile
      // boundaries, so this reads as layered land instead of random colors.
      const right = this.terrain.heightAt(x + 1, y);
      const below = this.terrain.heightAt(x, y + 1);
      const above = this.terrain.heightAt(x, y - 1);
      const left = this.terrain.heightAt(x - 1, y);
      const level = Math.floor(sample.height * 12);
      const eastLevel = Math.floor(right * 12);
      const southLevel = Math.floor(below * 12);
      const northLevel = Math.floor(above * 12);
      const westLevel = Math.floor(left * 12);
      // Top-facing lip and deep south/east drop shadow form a raised board tile.
      if (level > southLevel) {
        const depth = Math.min(9, 2 + (level - southLevel) * 3);
        ctx.fillStyle = 'rgba(13,22,29,.68)';
        ctx.fillRect(px, py + size - depth, size, depth);
        ctx.fillStyle = 'rgba(175,189,183,.31)';
        ctx.fillRect(px, py + size - depth - 2, size, 2);
      } else if (level < southLevel) {
        ctx.fillStyle = 'rgba(207,218,209,.26)';
        ctx.fillRect(px, py + size - 2, size, 2);
      }
      if (level > eastLevel) {
        const depth = Math.min(7, 2 + (level - eastLevel) * 2);
        ctx.fillStyle = 'rgba(9,18,24,.44)';
        ctx.fillRect(px + size - depth, py, depth, size);
      }
      if (level > northLevel) {
        ctx.fillStyle = 'rgba(183,196,186,.22)';
        ctx.fillRect(px + 1, py + 1, size - 2, 2);
      }
      if (level > westLevel) {
        ctx.fillStyle = 'rgba(197,210,198,.16)';
        ctx.fillRect(px + 1, py + 1, 2, size - 2);
      }

      // Deterministic, sparse ground grit. Avoid SVG filters and per-pixel noise.
      const sx = px + 3 + ((detail >>> 5) % (size - 8));
      const sy = py + 3 + ((detail >>> 14) % (size - 8));
      ctx.fillStyle = (detail & 1) ? 'rgba(199,203,184,.13)' : 'rgba(6,16,24,.18)';
      if ((detail & 3) === 0) ctx.fillRect(sx, sy, sample.biome === 'ridge' ? 5 : 3, 2);
      if (sample.biome === 'cliff') {
        // The same slate/sandstone palette as adjacent rock, with an
        // understated top lip and only boundary-facing dark relief.
        // Avoid the detached black stripe + giant triangle tile stamp.
        const dropS = Math.max(0, sample.height - below);
        const dropE = Math.max(0, sample.height - right);
        ctx.fillStyle = 'rgba(19,30,37,.17)';
        ctx.fillRect(px + 2,py + 2,size - 4,size - 4);
        ctx.strokeStyle='rgba(185,201,197,.21)';
        ctx.lineWidth=1.5;
        ctx.beginPath();
        ctx.moveTo(px+5,py+11);
        ctx.lineTo(px+14,py+6);
        ctx.lineTo(px+23,py+10);
        if ((detail & 3) === 0) ctx.stroke();
        if(dropS>0.035) {
          const depth=Math.min(9,3+Math.floor(dropS*58));
          ctx.fillStyle='rgba(16,29,36,.62)';
          ctx.fillRect(px,py+size-depth,size,depth);
          ctx.fillStyle='rgba(154,174,173,.46)';
          ctx.fillRect(px,py+size-depth-2,size,2);
        }
        if(dropE>0.035) {
          const depth=Math.min(7,2+Math.floor(dropE*50));
          ctx.fillStyle='rgba(18,32,39,.48)';
          ctx.fillRect(px+size-depth,py,depth,size);
        }
      } else if ((sample.biome === 'rock' || sample.biome === 'ridge') && (detail & 3) === 0) {
        ctx.fillStyle = 'rgba(15,24,30,.22)';
        ctx.beginPath();
        ctx.moveTo(px + 5, py + size - 5);
        ctx.lineTo(px + 14, py + 8);
        ctx.lineTo(px + 22, py + size - 9);
        ctx.closePath();
        ctx.fill();
      }
    }
    chunk.ground.setAttribute('href', this.scratch.toDataURL('image/png'));
  }

  drawOreFallback(ctx, type, px, py, size) {
    const color = type === 'iron' ? '#a78a79' : type === 'coal' ? '#626c70' : '#90acbb';
    ctx.fillStyle = 'rgba(11,19,25,.4)';
    ctx.beginPath();
    ctx.ellipse(px + size * .52, py + size * .81, size * .34, size * .13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(px + size * .15, py + size * .65);
    ctx.lineTo(px + size * .38, py + size * .15);
    ctx.lineTo(px + size * .62, py + size * .39);
    ctx.lineTo(px + size * .80, py + size * .24);
    ctx.lineTo(px + size * .94, py + size * .70);
    ctx.lineTo(px + size * .57, py + size * .90);
    ctx.closePath();
    ctx.fill();
  }

  paintOre(chunk) {
    if (!this.ctx) return;
    const { ctx } = this;
    ctx.clearRect(0, 0, CHUNK_PX, CHUNK_PX);
    let count = 0;
    const cell = TERRAIN_RASTER_TILE;
    for (let ty = 0; ty < TERRAIN_CHUNK_TILES; ty++) for (let tx = 0; tx < TERRAIN_CHUNK_TILES; tx++) {
      const x = chunk.cx * TERRAIN_CHUNK_TILES + tx;
      const y = chunk.cy * TERRAIN_CHUNK_TILES + ty;
      const ore = this.terrain.oreAt(x, y);
      if (!ore || !RESOURCES[ore]) continue;
      count++;
      const jitter = this.terrain.hash(x * 13, y * 13);
      const scale = .53 + ((jitter >>> 3) % 10) / 100;
      const size = cell * scale;
      const px = tx * cell + (cell - size) / 2;
      const py = ty * cell + (cell - size) / 2;
      const image = this.icons.get(ore);
      if (image?.complete && image.naturalWidth > 0) {
        ctx.globalAlpha = .77;
        ctx.drawImage(image, px, py, size, size);
        ctx.globalAlpha = 1;
      } else {
        this.drawOreFallback(ctx, ore, px, py, size);
      }
    }
    if (!count) {
      chunk.ore.remove();
      return;
    }
    // Decals retain transparency and sit above grid but below all buildings.
    chunk.ore.setAttribute('href', this.scratch.toDataURL('image/png'));
    if (chunk.ore.parentNode !== this.oreLayer) this.oreLayer.appendChild(chunk.ore);
  }

  fallbackChunk(chunk) {
    // Useful on browsers without Canvas2D: retain visibility, not a blank map.
    const ground = this.terrain.groundAt(chunk.cx * TERRAIN_CHUNK_TILES + 8,
      chunk.cy * TERRAIN_CHUNK_TILES + 8);
    chunk.ground = this.node('rect', chunk.cx, chunk.cy);
    chunk.ground.setAttribute('fill', groundColor(ground));
    const group = document.createElementNS(NS, 'g');
    for (let ty = 0; ty < TERRAIN_CHUNK_TILES; ty++) for (let tx = 0; tx < TERRAIN_CHUNK_TILES; tx++) {
      const x = chunk.cx * TERRAIN_CHUNK_TILES + tx;
      const y = chunk.cy * TERRAIN_CHUNK_TILES + ty;
      const ore = this.terrain.oreAt(x, y);
      if (!ore || !RESOURCES[ore]) continue;
      const image = document.createElementNS(NS, 'image');
      image.setAttribute('href', RESOURCES[ore].icon);
      image.setAttribute('x', (x + .18) * TILE);
      image.setAttribute('y', (y + .18) * TILE);
      image.setAttribute('width', TILE * .64);
      image.setAttribute('height', TILE * .64);
      image.setAttribute('opacity', '.75');
      group.appendChild(image);
    }
    chunk.ore = group;
  }

  makeChunk(cx, cy) {
    const chunk = { cx, cy, ground: null, ore: null };
    if (this.ctx) {
      try {
        chunk.ground = this.node('image', cx, cy);
        chunk.ore = this.node('image', cx, cy);
        this.paintGround(chunk);
        this.paintOre(chunk);
      } catch {
        // Canvas exports may be blocked on unusual browsers/privacy modes.
        // Keep the old SVG icon fallback rather than losing all terrain.
        chunk.ground?.remove();
        chunk.ore?.remove();
        this.ctx = null;
        this.fallbackChunk(chunk);
      }
    } else this.fallbackChunk(chunk);
    return chunk;
  }

  draw() {
    const camera = this.camera;
    const transform = `translate(${camera.width / 2 - camera.x * camera.zoom} ${camera.height / 2 - camera.y * camera.zoom}) scale(${camera.zoom})`;
    if (transform !== this.lastTransform) {
      this.groundLayer.setAttribute('transform', transform);
      this.oreLayer.setAttribute('transform', transform);
      this.lastTransform = transform;
    }
    const bounds = terrainChunkBounds(camera);
    const view = `${bounds.minX},${bounds.minY},${bounds.maxX},${bounds.maxY}`;
    if (view === this.lastViewport) return;
    this.lastViewport = view;
    const visible = new Set();
    for (let cy = bounds.minY; cy <= bounds.maxY; cy++) {
      for (let cx = bounds.minX; cx <= bounds.maxX; cx++) {
        const key = `${cx},${cy}`;
        visible.add(key);
        let chunk = this.chunks.get(key);
        if (!chunk) {
          chunk = this.makeChunk(cx, cy);
          this.chunks.set(key, chunk);
        }
        if (chunk.ground.parentNode !== this.groundLayer) this.groundLayer.appendChild(chunk.ground);
        // paintOre appends when nonempty. Restore nonempty cached chunks if needed.
        if (this.ctx && chunk.ore.getAttribute('href') && chunk.ore.parentNode !== this.oreLayer)
          this.oreLayer.appendChild(chunk.ore);
        else if (!this.ctx && chunk.ore.parentNode !== this.oreLayer)
          this.oreLayer.appendChild(chunk.ore);
      }
    }
    for (const [key, chunk] of this.chunks) {
      if (visible.has(key)) continue;
      chunk.ground.remove();
      chunk.ore.remove();
      this.chunks.delete(key);
    }
  }
}
