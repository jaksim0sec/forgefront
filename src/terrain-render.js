import { CAMERA_CONFIG } from './camera.js';
import { RESOURCES } from './resources.js';

const NS = 'http://www.w3.org/2000/svg';
const CHUNK_TILES = 16;
const TILE = CAMERA_CONFIG.tileSize;

/** Ore geometry stays in WORLD coordinates. The camera changes only one SVG
 * transform per frame; chunk contents are generated only on first visibility.
 * Unlike the previous implementation, there is no per-frame tile scan, icon
 * repositioning, or zoom threshold that makes resources disappear.
 */
export class TerrainRenderer {
  constructor(svg, terrain, camera) {
    this.layer = svg.querySelector('#ore-layer');
    this.terrain = terrain;
    this.camera = camera;
    this.chunks = new Map();
    this.lastViewport = '';
    this.detailLevel = 'full';
    this.lastTransform = '';
  }

  makeChunk(cx, cy) {
    const group = document.createElementNS(NS, 'g');
    group.setAttribute('data-ore-chunk', `${cx},${cy}`);
    const distant = this.detailLevel === 'distant';
    for (let y = cy * CHUNK_TILES; y < (cy + 1) * CHUNK_TILES; y++) {
      for (let x = cx * CHUNK_TILES; x < (cx + 1) * CHUNK_TILES; x++) {
        // At low zoom sample a stable world-aligned 2x2 lattice.
        // Do not create thousands of individual SVG images while zoomed out.
        if (distant && (x % 2 !== 0 || y % 2 !== 0)) continue;
        const ore = this.terrain.oreAt(x, y);
        if (!ore || !RESOURCES[ore]) continue;
        const icon = document.createElementNS(NS, distant ? 'circle' : 'image');
        icon.setAttribute('class', 'ore-visual');
        if (!distant) icon.setAttribute('href', RESOURCES[ore].icon);
        icon.setAttribute('opacity', distant ? '.38' : '.46');
        if (distant) {
          icon.setAttribute('cx', (x + .5) * TILE);
          icon.setAttribute('cy', (y + .5) * TILE);
          icon.setAttribute('r', TILE * .17);
          icon.setAttribute('fill', ore === 'coal' ? '#66727a' : ore === 'iron' ? '#a9a7a0' : '#83a2b5');
        } else {
          icon.setAttribute('x', (x + .21) * TILE);
          icon.setAttribute('y', (y + .21) * TILE);
          icon.setAttribute('width', TILE * .58);
          icon.setAttribute('height', TILE * .58);
        }
        group.appendChild(icon);
      }
    }
    return group;
  }

  draw() {
    const c = this.camera;
    // World->screen translation is identical to camera.worldToScreen().
    // No zoom-specific sampling means panning/pinching stays pixel-perfect.
    const transform = `translate(${c.width / 2 - c.x * c.zoom} ${c.height / 2 - c.y * c.zoom}) scale(${c.zoom})`;
    if (transform !== this.lastTransform) {
      this.layer.setAttribute('transform', transform);
      this.lastTransform = transform;
    }

    const halfW = c.width / (2 * c.zoom * TILE);
    const halfH = c.height / (2 * c.zoom * TILE);
    const x = c.x / TILE;
    const y = c.y / TILE;
    const minCX = Math.floor((x - halfW) / CHUNK_TILES);
    const maxCX = Math.floor((x + halfW) / CHUNK_TILES);
    const minCY = Math.floor((y - halfH) / CHUNK_TILES);
    const maxCY = Math.floor((y + halfH) / CHUNK_TILES);
    const detailLevel = c.zoom < .9 ? 'distant' : 'full';
    if (detailLevel !== this.detailLevel) {
      this.detailLevel = detailLevel;
      for (const chunk of this.chunks.values()) chunk.remove();
      this.chunks.clear();
    }
    const viewport = `${minCX},${minCY},${maxCX},${maxCY},${this.detailLevel}`;
    if (viewport === this.lastViewport) return;
    this.lastViewport = viewport;

    const visible = new Set();
    for (let cy = minCY; cy <= maxCY; cy++) {
      for (let cx = minCX; cx <= maxCX; cx++) {
        const key = `${cx},${cy}`;
        visible.add(key);
        let chunk = this.chunks.get(key);
        if (!chunk) {
          chunk = this.makeChunk(cx, cy);
          this.chunks.set(key, chunk);
        }
        if (chunk.parentNode !== this.layer) this.layer.appendChild(chunk);
      }
    }

    // Retain only visible chunks. No unbounded DOM/cache growth while roaming.
    for (const [key, chunk] of this.chunks) {
      if (!visible.has(key)) {
        chunk.remove();
        this.chunks.delete(key);
      }
    }
  }
}
