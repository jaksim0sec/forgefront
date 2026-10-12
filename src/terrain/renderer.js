import { CAMERA_CONFIG } from '../camera.js';
const NS = 'http://www.w3.org/2000/svg';
const COLORS = ['#283b3c','#304346','#3a4b4b','#48554d','#58604f','#6c6d58','#807c65','#969078'];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Separate SVG layer below grid/structures. Camera never changes terrain coordinates. */
export class TerrainRenderer {
  constructor(svg, camera, world, terrain) {
    this.camera = camera;
    this.world = world;
    this.terrain = terrain;
    this.layer = document.createElementNS(NS, 'g');
    this.layer.setAttribute('id', 'terrain-layer');
    this.layer.setAttribute('pointer-events', 'none');
    // Insert just after the background, under grid and every game object.
    const sectorGrid = svg.querySelector('#tile-grid');
    svg.insertBefore(this.layer, sectorGrid ?? svg.firstElementChild?.nextSibling ?? null);
    this.nodes = new Map();
  }
  buildChunk(cx, cy) {
    const s = this.terrain.chunkSize, cells = this.terrain.chunk(cx, cy);
    const shapes = Array.from({ length: COLORS.length }, () => '');
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const band = Math.min(COLORS.length - 1, cells[y * s + x] >> 5);
      shapes[band] += `M${x} ${y}h1v1h-1z`;
    }
    const group = document.createElementNS(NS, 'g');
    for (let band = 0; band < COLORS.length; band++) {
      if (!shapes[band]) continue;
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', shapes[band]);
      path.setAttribute('fill', COLORS[band]);
      group.appendChild(path);
    }
    this.layer.appendChild(group);
    return group;
  }
  draw() {
    const {camera, world, terrain} = this;
    const a = camera.screenToWorld(0, 0), b = camera.screenToWorld(camera.width, camera.height);
    const t = CAMERA_CONFIG.tileSize, s = terrain.chunkSize;
    const minX = clamp(Math.floor(Math.min(a.x,b.x)/t), world.minX, world.maxX - 1);
    const maxX = clamp(Math.floor(Math.max(a.x,b.x)/t), world.minX, world.maxX - 1);
    const minY = clamp(Math.floor(Math.min(a.y,b.y)/t), world.minY, world.maxY - 1);
    const maxY = clamp(Math.floor(Math.max(a.y,b.y)/t), world.minY, world.maxY - 1);
    const active = new Set();
    for (let cy = Math.floor(minY/s); cy <= Math.floor(maxY/s); cy++) {
      for (let cx = Math.floor(minX/s); cx <= Math.floor(maxX/s); cx++) {
        const key = cx + ',' + cy;
        active.add(key);
        let node = this.nodes.get(key);
        if (!node) { node = this.buildChunk(cx,cy); this.nodes.set(key,node); }
        const top = camera.worldToScreen(cx*s*t, cy*s*t);
        node.setAttribute('transform', `translate(${top.x} ${top.y}) scale(${t*camera.zoom})`);
      }
    }
    for (const [key, node] of this.nodes) if (!active.has(key)) {
      node.remove(); this.nodes.delete(key);
    }
  }
}
