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
  }

  makeChunk(cx, cy) {
    const group = document.createElementNS(NS, 'g');
    group.setAttribute('data-ore-chunk', `${cx},${cy}`);
    for (let y = cy * CHUNK_TILES; y < (cy + 1) * CHUNK_TILES; y++) {
      for (let x = cx * CHUNK_TILES; x < (cx + 1) * CHUNK_TILES; x++) {
        const ore = this.terrain.oreAt(x, y);
        if (!ore || !RESOURCES[ore]) continue;
        const icon = document.createElementNS(NS, 'image');
        icon.setAttribute('class', 'ore-visual');
        icon.setAttribute('href', RESOURCES[ore].icon);
        icon.setAttribute('opacity', '.46');
        icon.setAttribute('x', (x + .21) * TILE);
        icon.setAttribute('y', (y + .21) * TILE);
        icon.setAttribute('width', TILE * .58);
        icon.setAttribute('height', TILE * .58);
        group.appendChild(icon);
      }
    }
    return group;
  }

  draw() {
    const c = this.camera;
    // World->screen translation is identical to camera.worldToScreen().
    // No zoom-specific sampling means panning/pinching stays pixel-perfect.
    this.layer.setAttribute(
      'transform',
      `translate(${c.width / 2 - c.x * c.zoom} ${c.height / 2 - c.y * c.zoom}) scale(${c.zoom})`
    );

    const halfW = c.width / (2 * c.zoom * TILE);
    const halfH = c.height / (2 * c.zoom * TILE);
    const x = c.x / TILE;
    const y = c.y / TILE;
    const minCX = Math.floor((x - halfW) / CHUNK_TILES);
    const maxCX = Math.floor((x + halfW) / CHUNK_TILES);
    const minCY = Math.floor((y - halfH) / CHUNK_TILES);
    const maxCY = Math.floor((y + halfH) / CHUNK_TILES);
    const viewport = `${minCX},${minCY},${maxCX},${maxCY}`;
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
