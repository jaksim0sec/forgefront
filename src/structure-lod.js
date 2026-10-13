import { CAMERA_CONFIG } from './camera.js';
import { STRUCTURES, worldToTile } from './world.js';
import { nationColor } from './nations.js';
import { conveyorOpenSides } from './conveyor-visual.js';

// Keep the expensive interactive SVG details at close zoom. At medium/distant
// zoom, draw the same machine art on ONE Canvas surface.
// There is no SVG DOM node per visible structure in this mode.
export const DISTANT_ZOOM = 0.72;

export function structureCanvasPlacement(structure, tileSize = CAMERA_CONFIG.tileSize) {
  const def = STRUCTURES[structure.type];
  const x = structure.x * tileSize, y = structure.y * tileSize;
  const w = def.width * tileSize, h = def.height * tileSize;
  const rotation = structure.rotation % 4;
  const corners = [[x, y], [x + h, y], [x + w, y + h], [x, y + w]];
  const [tx, ty] = corners[rotation];
  return { tx, ty, rotation, w, h };
}

export function shouldDrawDistant(zoom, available = true) {
  return available && zoom < DISTANT_ZOOM;
}

function spriteUrl(markup, def) {
  // The existing SVG <symbol> is rendered as a self-contained image.
  // No external files, font downloads or second set of illustrations.
  const svg = markup.replace(/^<symbol\b/,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${def.width * 48}" height="${def.height * 48}"`)
    .replace(/<\/symbol>\s*$/, '</svg>');
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

export class DistantStructureRenderer {
  constructor(svg, world, camera, connections, templates) {
    this.world = world;
    this.camera = camera;
    this.connections = connections;
    this.active = false;
    this.selectedId = null;
    this.context = null;
    this.canvas = null;
    this.images = new Map();
    this.seams = new Map();
    this.seamRevision = -1;
    this.lastPaint = 0;
    this.lastView = null;
    this.needsPaint = true;
    try {
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'structure-lod-canvas';
      this.canvas.setAttribute('aria-hidden', 'true');
      this.context = this.canvas.getContext('2d', { alpha: true });
      if (typeof Image === 'undefined' || !svg.insertAdjacentElement) this.context = null;
    } catch {
      this.context = null;
    }
    if (!this.context) return;
    // Only occupancy and visible state changes invalidate a static distant frame.
    this.unsubscribe = world.subscribe?.(({ type }) => {
      if (type === 'place' || type === 'remove' || type === 'rotate' ||
          type === 'state' || type === 'owner') this.needsPaint = true;
    });

    for (const [type, markup] of Object.entries(templates)) {
      const def = STRUCTURES[type];
      if (!def) continue;
      const image = new Image();
      image.onload = () => { this.needsPaint = true; if (this.active) this.draw(this.selectedId); };
      image.onerror = () => { this.needsPaint = true; if (this.active) this.draw(this.selectedId); };
      image.src = spriteUrl(markup, def);
      this.images.set(type, image);
    }
    this.canvas.hidden = true;
    svg.insertAdjacentElement('afterend', this.canvas);
  }

  draw(selectedId) {
    if (!shouldDrawDistant(this.camera.zoom, !!this.context)) {
      this.active = false;
      this.lastView = null;
      if (this.context) this.canvas.hidden = true;
      return false;
    }
    this.active = true;
    this.selectedId = selectedId;
    this.canvas.hidden = false;
    const camera = this.camera;
    const view = [camera.x,camera.y,camera.zoom,camera.width,camera.height,selectedId].join(',');
    const now = typeof performance === 'undefined' ? Date.now() : performance.now();
    // Camera motion renders immediately. A stationary frame refreshes at most
    // eight times per second to reflect activity, not every animation tick.
    if (!this.needsPaint && this.lastView === view && now-this.lastPaint < 125) return true;
    this.needsPaint = false;
    this.lastView = view;
    this.lastPaint = now;
    const ctx = this.context;
    // Distance view is icon-sized; full retina resolution costs many pixels with no benefit.
    const dpr = Math.min(window.devicePixelRatio || 1, camera.zoom < .48 ? 1 : 1.35);
    const width = Math.max(1, Math.round(camera.width * dpr));
    const height = Math.max(1, Math.round(camera.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);

    if (this.seamRevision !== this.connections.revision) {
      this.seams.clear();
      this.seamRevision = this.connections.revision;
    }
    const scale = camera.zoom * dpr;
    const ox = dpr * (camera.width / 2 - camera.x * camera.zoom);
    const oy = dpr * (camera.height / 2 - camera.y * camera.zoom);
    const a = camera.screenToWorld(0, 0);
    const b = camera.screenToWorld(camera.width, camera.height);
    const lo = worldToTile(a.x, a.y);
    const hi = worldToTile(b.x, b.y);
    for (const structure of this.world.visible(lo.x - 3, lo.y - 3, hi.x + 3, hi.y + 3)) {
      const { tx, ty, rotation, w, h } = structureCanvasPlacement(structure);
      const px = ox + scale * tx, py = oy + scale * ty;
      // No save/restore per sprite; one matrix setup followed by a drawImage.
      switch (rotation) {
        case 0: ctx.setTransform(scale, 0, 0, scale, px, py); break;
        case 1: ctx.setTransform(0, scale, -scale, 0, px, py); break;
        case 2: ctx.setTransform(-scale, 0, 0, -scale, px, py); break;
        case 3: ctx.setTransform(0, -scale, scale, 0, px, py); break;
      }
      const image = this.images.get(structure.type);
      if (image?.complete && image.naturalWidth) {
        ctx.drawImage(image, 0, 0, w, h);
      } else {
        // A missing/broken sprite must not make structures disappear.
        ctx.fillStyle = structure.type === 'conveyor' ? '#414c51' : '#465660';
        ctx.fillRect(2, 2, w - 4, h - 4);
      }

      if (structure.type === 'conveyor') {
        this.drawBend(ctx, structure);
        this.drawSeams(ctx, structure);
        // One tiny badge only for a jammed belt. No extra elements or animation.
        if (structure.activity === 'blocked' && structure.itemCount > 0 &&
            typeof ctx.fillText === 'function') {
          ctx.fillStyle = '#9da7a4';
          ctx.font = 'bold 12px sans-serif';
          ctx.textAlign = 'right';
          ctx.fillText(String(Math.min(99, structure.itemCount)), 44, 41);
        }
      }

      const blocked = !structure.enabled ||
        ['no-power', 'no-coal', 'no-ore', 'blocked'].includes(structure.activity);
      const operating = ['mining', 'processing', 'generating', 'transporting', 'receiving']
        .includes(structure.activity);
      if (structure.type !== 'conveyor' && structure.type !== 'junction' &&
          !STRUCTURES[structure.type].blocksGround) {
        ctx.beginPath();
        ctx.arc(w - 8, 8, 3.3, 0, Math.PI * 2);
        ctx.fillStyle = blocked ? '#e69b79' : operating ? '#8ac9ad' : '#8697a3';
        ctx.fill();
      }
      if (structure.ownerId && structure.type !== 'conveyor' && structure.type !== 'junction' &&
          !STRUCTURES[structure.type].blocksGround) {
        ctx.fillStyle = '#18232b';
        ctx.fillRect(4, 4, 13, 13);
        ctx.fillStyle = nationColor(structure.ownerId);
        ctx.fillRect(7, 7, 7, 7);
      }
      if (structure.id === selectedId || structure.health < structure.maxHealth) {
        const fraction = Math.max(0, Math.min(1, structure.health / structure.maxHealth));
        ctx.fillStyle = '#141c22';
        ctx.fillRect(5, h - 7, w - 10, 3.1);
        ctx.fillStyle = '#9eb5ad';
        ctx.fillRect(5, h - 7, (w - 10) * fraction, 3.1);
      }
    }
    return true;
  }

  drawSeams(ctx, structure) {
    let sides = this.seams.get(structure.id);
    if (!sides) {
      sides = conveyorOpenSides(structure, this.connections, this.world);
      this.seams.set(structure.id, sides);
    }
    if (!sides.length) return;
    ctx.strokeStyle = '#27343a';
    ctx.lineWidth = 5;
    ctx.beginPath();
    for (const side of sides) {
      switch(side) {
        case 0:ctx.moveTo(17,1);ctx.lineTo(31,1);break;
        case 1:ctx.moveTo(47,17);ctx.lineTo(47,31);break;
        case 2:ctx.moveTo(17,47);ctx.lineTo(31,47);break;
        case 3:ctx.moveTo(1,17);ctx.lineTo(1,31);break;
      }
    }
    ctx.stroke();
  }

  drawBend(ctx, structure) {
    const sides = new Set();
    for (const link of this.connections.inputs(structure.id).values()) {
      for (const contact of link.contacts) {
        const side = (contact.side + 2 - structure.rotation + 4) % 4;
        if (side === 1 || side === 3) sides.add(side);
      }
    }
    if (!sides.size) return;
    ctx.beginPath();
    for (const side of sides) {
      ctx.moveTo(side === 1 ? 44 : 4, 24);
      ctx.lineTo(24, 24);
      ctx.lineTo(24, 44);
    }
    ctx.strokeStyle = '#797469';
    ctx.lineWidth = 3.5;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}
