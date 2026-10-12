import { CAMERA_CONFIG } from './camera.js';

const DURATION = 330;
const MAX_ITEMS = 48;

/**
 * Dynamic cargo belongs on a single transparent Canvas layer, never a new SVG
 * DOM node per transfer. Structure/industry state remains owned by World.
 * The old SVG route is retained if 2D Canvas is unavailable.
 */
export class CargoRenderer {
  constructor(svg, camera, resources) {
    this.camera = camera;
    this.resources = resources;
    this.svgLayer = svg.querySelector('#moving-items');
    this.items = [];
    this.images = new Map();
    this.flying = 0;
    this.frame = 0;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'cargo-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    try {
      this.context = this.canvas.getContext('2d', { alpha: true });
    } catch {
      this.context = null;
    }
    if (this.context) {
      svg.insertAdjacentElement('afterend', this.canvas);
      this.animate = this.animate.bind(this);
    }
  }

  transfer(change, world) {
    if (change.type !== 'transfer') return;
    const { fromId, toId, itemId } = change.entity;
    const from = world.structures.get(fromId);
    const to = world.structures.get(toId);
    const resource = this.resources[itemId];
    if (!from || !to || !resource) return;

    const tile = CAMERA_CONFIG.tileSize;
    const a = { x: (from.x + from.width / 2) * tile, y: (from.y + from.height / 2) * tile };
    const b = { x: (to.x + to.width / 2) * tile, y: (to.y + to.height / 2) * tile };
    const screenA = this.camera.worldToScreen(a.x, a.y);
    const screenB = this.camera.worldToScreen(b.x, b.y);
    if (Math.max(screenA.x, screenB.x) < -32 || Math.min(screenA.x, screenB.x) > this.camera.width + 32 ||
        Math.max(screenA.y, screenB.y) < -32 || Math.min(screenA.y, screenB.y) > this.camera.height + 32) return;

    if (!this.context) {
      this.svgFallback(a, b, resource.icon);
      return;
    }

    const now = performance.now();
    this.items = this.items.filter(item => now - item.start < item.duration);
    if (this.items.length >= MAX_ITEMS) return;
    if (!this.images.has(itemId)) {
      const image = new Image();
      image.src = resource.icon;
      this.images.set(itemId, image);
    }
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this.items.push({ a, b, itemId, start: now, duration: reduced ? 100 : DURATION, reduced });
    this.requestFrame();
  }

  requestFrame() {
    if (!this.frame) this.frame = requestAnimationFrame(this.animate);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(this.camera.width * dpr));
    const h = Math.max(1, Math.round(this.camera.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  animate(time) {
    this.frame = 0;
    this.resize();
    const ctx = this.context;
    ctx.clearRect(0, 0, this.camera.width, this.camera.height);
    const size = Math.max(13, 23 * this.camera.zoom);
    const live = [];
    for (const item of this.items) {
      const t = (time - item.start) / item.duration;
      if (t >= 1) continue;
      live.push(item);
      const progress = item.reduced ? 0 : Math.max(0, t);
      const p = this.camera.worldToScreen(
        item.a.x + (item.b.x - item.a.x) * progress,
        item.a.y + (item.b.y - item.a.y) * progress
      );
      if (p.x < -size || p.y < -size || p.x > this.camera.width + size ||
          p.y > this.camera.height + size) continue;
      const image = this.images.get(item.itemId);
      if (image?.complete && image.naturalWidth > 0) {
        ctx.globalAlpha = 0.88 + 0.12 * Math.sin(Math.PI * progress);
        ctx.drawImage(image, p.x - size / 2, p.y - size / 2, size, size);
      }
    }
    ctx.globalAlpha = 1;
    this.items = live;
    if (live.length) this.requestFrame();
  }

  svgFallback(a, b, src) {
    if (this.flying >= MAX_ITEMS) return;
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    const size = Math.max(13, 23 * this.camera.zoom);
    const start = this.camera.worldToScreen(a.x, a.y);
    const end = this.camera.worldToScreen(b.x, b.y);
    icon.setAttribute('href', src);
    icon.setAttribute('width', size);
    icon.setAttribute('height', size);
    icon.setAttribute('x', -size / 2);
    icon.setAttribute('y', -size / 2);
    icon.setAttribute('transform', `translate(${start.x} ${start.y})`);
    icon.classList.add('flying-item');
    this.svgLayer.appendChild(icon);
    this.flying++;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (!reduced) requestAnimationFrame(() => requestAnimationFrame(() => {
      icon.setAttribute('transform', `translate(${end.x} ${end.y})`);
    }));
    setTimeout(() => { icon.remove(); this.flying--; }, reduced ? 100 : DURATION);
  }
}
