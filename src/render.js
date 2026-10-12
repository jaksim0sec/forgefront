import { CAMERA_CONFIG } from './camera.js';
import { STRUCTURES, tileToWorld, worldToTile } from './world.js';

const NS = 'http://www.w3.org/2000/svg';
const templates = {
  conveyor: `<symbol id="s-conveyor" viewBox="0 0 48 48"><rect x="2" y="2" width="44" height="44" rx="5" fill="#28343d" stroke="#64727b" stroke-width="3"/><rect x="9" y="4" width="30" height="40" rx="2" fill="#151f26"/><g fill="#876d4e" stroke="#c7a16a" stroke-width="1.2"><rect x="12" y="8" width="24" height="6" rx="1"/><rect x="12" y="21" width="24" height="6" rx="1"/><rect x="12" y="34" width="24" height="6" rx="1"/></g><path d="M5 9V39M43 9V39" stroke="#c59757" stroke-width="2" stroke-dasharray="4 4"/><path d="M21 15L24 18L27 15" fill="none" stroke="#e9b96c" stroke-width="1.7"/></symbol>`,
  drill: `<symbol id="s-drill" viewBox="0 0 96 96"><rect x="3" y="3" width="90" height="90" rx="9" fill="#303d45" stroke="#8ca6b2" stroke-width="4"/><rect x="11" y="11" width="74" height="74" rx="7" fill="#19272f" stroke="#536773" stroke-width="2"/><path d="M12 24H84M12 72H84" stroke="#daa65d" stroke-width="3" stroke-dasharray="13 7"/><circle cx="48" cy="48" r="29" fill="#4c626c" stroke="#a1bac2" stroke-width="4"/><circle cx="48" cy="48" r="20" fill="#192b36" stroke="#78929e" stroke-width="3"/><path d="M48 27L55 41L69 48L55 55L48 69L41 55L27 48L41 41Z" fill="#c0d0d4"/><circle cx="48" cy="48" r="7" fill="#e9b769" stroke="#5c7984" stroke-width="3"/><g fill="#c5d1d5"><circle cx="16" cy="16" r="3"/><circle cx="80" cy="16" r="3"/><circle cx="16" cy="80" r="3"/><circle cx="80" cy="80" r="3"/></g></symbol>`,
  smelter: `<symbol id="s-smelter" viewBox="0 0 144 96"><rect x="3" y="3" width="138" height="90" rx="9" fill="#353c43" stroke="#98a1a7" stroke-width="4"/><rect x="12" y="10" width="120" height="76" rx="5" fill="#1a252e" stroke="#64737c" stroke-width="2"/><g fill="#4d3830" stroke="#b88d60" stroke-width="3"><rect x="20" y="24" width="28" height="49" rx="4"/><rect x="57" y="24" width="28" height="49" rx="4"/><rect x="94" y="24" width="28" height="49" rx="4"/></g><g fill="#ef9d50"><rect x="25" y="48" width="18" height="17" rx="2"/><rect x="62" y="48" width="18" height="17" rx="2"/><rect x="99" y="48" width="18" height="17" rx="2"/></g><g stroke="#8d9ba3" stroke-width="3"><path d="M22 16H120M25 78H119"/></g><path d="M9 35V61M135 35V61" stroke="#e6b065" stroke-width="3" stroke-dasharray="5 5"/></symbol>`,
  generator: `<symbol id="s-generator" viewBox="0 0 96 96"><rect x="3" y="3" width="90" height="90" rx="9" fill="#2e4041" stroke="#8cb0ac" stroke-width="4"/><rect x="10" y="10" width="76" height="76" rx="5" fill="#1c2b31" stroke="#536d70" stroke-width="2"/><circle cx="48" cy="48" r="31" fill="#364f50" stroke="#97c5ba" stroke-width="3"/><circle cx="48" cy="48" r="24" fill="#1a3033"/><path d="M48 28L55 40L68 48L54 55L48 69L40 54L28 48L42 40Z" fill="#79aa9d"/><circle cx="48" cy="48" r="9" fill="#b5e2c6" stroke="#306f6a" stroke-width="3"/><path d="M17 17H31M65 17H79M17 79H31M65 79H79" stroke="#bdc8b8" stroke-width="3"/></symbol>`,
};

export function installSprites(svg) {
  const defs = svg.querySelector('defs');
  defs.insertAdjacentHTML('beforeend', Object.values(templates).join(''));
}

function moveSprite(element, structure, camera) {
  const def = STRUCTURES[structure.type];
  const topLeft = tileToWorld(structure.x, structure.y);
  const p = camera.worldToScreen(topLeft.x, topLeft.y);
  const step = CAMERA_CONFIG.tileSize * camera.zoom;
  const w = def.width * step;
  const h = def.height * step;
  const angle = structure.rotation * 90;
  const translate = [
    [p.x, p.y], [p.x + h, p.y], [p.x + w, p.y + h], [p.x, p.y + w],
  ][structure.rotation];
  element.setAttribute('transform', `translate(${translate[0]} ${translate[1]}) rotate(${angle})`);
  const use = element.firstElementChild;
  use.setAttribute('width', w);
  use.setAttribute('height', h);
}

export class BuildingRenderer {
  constructor(svg, world, camera) {
    this.layer = svg.querySelector('#structures-layer');
    this.hover = svg.querySelector('#tile-highlight');
    this.world = world;
    this.camera = camera;
    this.elements = new Map();
  }

  draw(tool, hoverTile, rotation, selectedId) {
    const { camera, world } = this;
    const a = camera.screenToWorld(0, 0);
    const b = camera.screenToWorld(camera.width, camera.height);
    const lo = worldToTile(a.x, a.y);
    const hi = worldToTile(b.x, b.y);
    const active = new Set();
    for (const structure of world.visible(lo.x - 3, lo.y - 3, hi.x + 3, hi.y + 3)) {
      active.add(structure.id);
      let node = this.elements.get(structure.id);
      if (!node) {
        node = document.createElementNS(NS, 'g');
        const use = document.createElementNS(NS, 'use');
        use.setAttribute('href', `#s-${structure.type}`);
        node.appendChild(use);
        this.layer.appendChild(node);
        this.elements.set(structure.id, node);
      }
      moveSprite(node, structure, camera);
      node.setAttribute('opacity', selectedId === structure.id ? '0.78' : '1');
    }
    for (const [id, node] of this.elements) {
      if (!active.has(id)) {
        node.remove();
        this.elements.delete(id);
      }
    }

    if (!hoverTile) {
      this.hover.setAttribute('visibility', 'hidden');
      return;
    }
    let { x, y } = hoverTile;
    let width = 1, height = 1, okay = world.inBounds(x, y);
    if (STRUCTURES[tool]) {
      const validity = world.canPlace(tool, x, y, rotation);
      width = validity.width ?? 1;
      height = validity.height ?? 1;
      okay = validity.ok;
    } else {
      const existing = world.getAt(x, y);
      if (existing) ({ x, y, width, height } = existing);
      okay = !!existing;
    }
    const position = tileToWorld(x, y);
    const screen = camera.worldToScreen(position.x, position.y);
    const step = CAMERA_CONFIG.tileSize * camera.zoom;
    this.hover.setAttribute('x', screen.x);
    this.hover.setAttribute('y', screen.y);
    this.hover.setAttribute('width', width * step);
    this.hover.setAttribute('height', height * step);
    this.hover.setAttribute('fill', okay ? '#71cfaf' : '#f07978');
    this.hover.setAttribute('stroke', okay ? '#b0ffe0' : '#ffb7aa');
    this.hover.setAttribute('visibility', 'visible');
  }
}
