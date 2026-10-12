import { CAMERA_CONFIG } from './camera.js';
import { RESOURCES } from './resources.js';

const NS = 'http://www.w3.org/2000/svg';

/** Reused SVG nodes, bounded to the visible viewport. There is no static
 * 4-million-tile art cache and no terrain DOM outside the viewport.
 */
export class TerrainRenderer {
  constructor(svg, terrain, camera) {
    this.layer = svg.querySelector('#ore-layer');
    this.terrain = terrain;
    this.camera = camera;
    this.pool = [];
    this.lastPose = null;
  }

  draw() {
    // Factory inventory updates must not cause geology to be redrawn.
    const pose = [this.camera.x, this.camera.y, this.camera.zoom,
      this.camera.width, this.camera.height].join(':');
    if (pose === this.lastPose) return;
    this.lastPose = pose;
    if (this.camera.zoom < 0.6) {
      this.layer.setAttribute('visibility', 'hidden');
      return;
    }
    this.layer.setAttribute('visibility', 'visible');
    const size = CAMERA_CONFIG.tileSize;
    const a = this.camera.screenToWorld(0, 0);
    const b = this.camera.screenToWorld(this.camera.width, this.camera.height);
    // Always sample the same logical tiles at every zoom level.
    // Skipping every other tile while zoomed out made deposits appear to
    // jump/disappear independently from the camera gesture.
    const left = Math.floor(a.x / size);
    const top = Math.floor(a.y / size);
    const right = Math.ceil(b.x / size) + 1;
    const bottom = Math.ceil(b.y / size) + 1;
    let count = 0;
    outer: for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        const ore = this.terrain.oreAt(x, y);
        if (!ore || !RESOURCES[ore]) continue;
        if (count >= 450) break outer;
        let icon = this.pool[count];
        if (!icon) {
          icon = document.createElementNS(NS, 'image');
          icon.setAttribute('class', 'ore-visual');
          icon.setAttribute('opacity', '.46');
          this.layer.appendChild(icon);
          this.pool.push(icon);
        }
        if (icon.dataset.ore !== ore) {
          icon.dataset.ore = ore;
          icon.setAttribute('href', RESOURCES[ore].icon);
        }
        const screen = this.camera.worldToScreen((x + .21) * size, (y + .21) * size);
        const diameter = size * this.camera.zoom * .58;
        icon.setAttribute('x', screen.x);
        icon.setAttribute('y', screen.y);
        icon.setAttribute('width', diameter);
        icon.setAttribute('height', diameter);
        icon.setAttribute('visibility', 'visible');
        count++;
      }
    }
    for (let i = count; i < this.pool.length; i++) this.pool[i].setAttribute('visibility', 'hidden');
  }
}
