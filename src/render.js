import { CAMERA_CONFIG } from './camera.js';
import { STRUCTURES, tileToWorld, worldToTile } from './world.js';
import { nationColor, nationSigil } from './nations.js';
import { RESOURCES } from './resources.js';
import { DIRECTIONS } from './ports.js';

const NS = 'http://www.w3.org/2000/svg';
const templates = {
  conveyor: `<symbol id="s-conveyor" viewBox="0 0 48 48"><rect x="2" y="2" width="44" height="44" rx="5" fill="#28343d" stroke="#64727b" stroke-width="3"/><rect x="9" y="4" width="30" height="40" rx="2" fill="#151f26"/><g fill="#56626a" stroke="#82909a" stroke-width="1.2"><rect x="12" y="8" width="24" height="6" rx="1"/><rect x="12" y="21" width="24" height="6" rx="1"/><rect x="12" y="34" width="24" height="6" rx="1"/></g><path d="M5 9V39M43 9V39" stroke="#8c9aa4" stroke-width="2" stroke-dasharray="4 4"/><path d="M21 15L24 18L27 15" fill="none" stroke="#b3c0c6" stroke-width="1.7"/></symbol>`,
  drill: `<symbol id="s-drill" viewBox="0 0 96 96"><rect x="3" y="3" width="90" height="90" rx="9" fill="#303d45" stroke="#8ca6b2" stroke-width="4"/><rect x="11" y="11" width="74" height="74" rx="7" fill="#19272f" stroke="#536773" stroke-width="2"/><path d="M12 24H84M12 72H84" stroke="#8e9da5" stroke-width="3" stroke-dasharray="13 7"/><circle cx="48" cy="48" r="29" fill="#4c626c" stroke="#a1bac2" stroke-width="4"/><circle cx="48" cy="48" r="20" fill="#192b36" stroke="#78929e" stroke-width="3"/><path d="M48 27L55 41L69 48L55 55L48 69L41 55L27 48L41 41Z" fill="#c0d0d4"/><circle cx="48" cy="48" r="7" fill="#b7c8cb" stroke="#5c7984" stroke-width="3"/><g fill="#c5d1d5"><circle cx="16" cy="16" r="3"/><circle cx="80" cy="16" r="3"/><circle cx="16" cy="80" r="3"/><circle cx="80" cy="80" r="3"/></g></symbol>`,
  smelter: `<symbol id="s-smelter" viewBox="0 0 144 96"><rect x="3" y="3" width="138" height="90" rx="9" fill="#353c43" stroke="#98a1a7" stroke-width="4"/><rect x="12" y="10" width="120" height="76" rx="5" fill="#1a252e" stroke="#64737c" stroke-width="2"/><g fill="#404f59" stroke="#86969f" stroke-width="3"><rect x="20" y="24" width="28" height="49" rx="4"/><rect x="57" y="24" width="28" height="49" rx="4"/><rect x="94" y="24" width="28" height="49" rx="4"/></g><g fill="#758992"><rect x="25" y="48" width="18" height="17" rx="2"/><rect x="62" y="48" width="18" height="17" rx="2"/><rect x="99" y="48" width="18" height="17" rx="2"/></g><g stroke="#8d9ba3" stroke-width="3"><path d="M22 16H120M25 78H119"/></g><path d="M9 35V61M135 35V61" stroke="#98a4aa" stroke-width="3" stroke-dasharray="5 5"/></symbol>`,
  generator: `<symbol id="s-generator" viewBox="0 0 96 96"><rect x="3" y="3" width="90" height="90" rx="9" fill="#2e4041" stroke="#8c9da5" stroke-width="4"/><rect x="10" y="10" width="76" height="76" rx="5" fill="#1c2b31" stroke="#536d70" stroke-width="2"/><circle cx="48" cy="48" r="31" fill="#364f50" stroke="#97a7ad" stroke-width="3"/><circle cx="48" cy="48" r="24" fill="#1a3033"/><path d="M48 28L55 40L68 48L54 55L48 69L40 54L28 48L42 40Z" fill="#94a7af"/><circle cx="48" cy="48" r="9" fill="#c4d0d3" stroke="#657b85" stroke-width="3"/><path d="M17 17H31M65 17H79M17 79H31M65 79H79" stroke="#bdc8b8" stroke-width="3"/></symbol>`,
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
  element.querySelector('.insignia')?.setAttribute('transform', `translate(${5 * camera.zoom} ${5 * camera.zoom}) scale(${camera.zoom})`);
  element.querySelector('.cargo-overlay')?.setAttribute('transform',
    `translate(${(def.width * 48 - 25) * camera.zoom} ${5 * camera.zoom}) scale(${camera.zoom})`);
  const health = element.querySelector('.structure-health');
  health?.setAttribute('transform', `translate(${5 * camera.zoom} ${(def.height * 48 - 7) * camera.zoom}) scale(${camera.zoom})`);
  health?.firstElementChild?.setAttribute('width', def.width * 48 - 10);
  health?.lastElementChild?.setAttribute('width', (def.width * 48 - 10) * structure.health / structure.maxHealth);
}

export class BuildingRenderer {
  constructor(svg, world, camera, connections) {
    this.layer = svg.querySelector('#structures-layer');
    this.hover = svg.querySelector('#tile-highlight');
    this.linksLayer = svg.querySelector('#connections-layer');
    this.routeLayer = svg.querySelector('#route-preview');
    this.routeBlock = svg.querySelector('#route-block');
    this.connections = connections;
    this.linkElements = new Map();
    this.world = world;
    this.camera = camera;
    this.elements = new Map();
  }

  drawLinks(visible, selectedId, showLinks) {
    const keep = new Set();
    if (showLinks && this.camera.zoom >= 0.58) {
      const tileSize = CAMERA_CONFIG.tileSize;
      for (const sourceId of visible) {
        for (const link of this.connections.outputs(sourceId).values()) {
          if (!visible.has(link.to)) continue;
          link.contacts.forEach((contact, index) => {
            const key = `${link.from}-${link.to}-${index}`;
            keep.add(key);
            let path = this.linkElements.get(key);
            if (!path) {
              path = document.createElementNS(NS, 'path');
              path.setAttribute('class', 'item-link');
              this.linksLayer.appendChild(path);
              this.linkElements.set(key, path);
            }
            const direction = DIRECTIONS[contact.side];
            const p = this.camera.worldToScreen((contact.x + 0.5) * tileSize, (contact.y + 0.5) * tileSize);
            const d = tileSize * this.camera.zoom;
            const x = p.x + direction.x * d * 0.70;
            const y = p.y + direction.y * d * 0.70;
            const tailX = p.x + direction.x * d * 0.28;
            const tailY = p.y + direction.y * d * 0.28;
            const px = -direction.y, py = direction.x;
            const arrow = Math.max(3, d * 0.10);
            path.setAttribute('d', `M${tailX} ${tailY} L${x} ${y} M${x - direction.x * arrow + px * arrow * .6} ${y - direction.y * arrow + py * arrow * .6} L${x} ${y} L${x - direction.x * arrow - px * arrow * .6} ${y - direction.y * arrow - py * arrow * .6}`);
            path.classList.toggle('focused', selectedId === sourceId || selectedId === link.to);
          });
        }
      }
    }
    for (const [key, element] of this.linkElements) {
      if (!keep.has(key)) {
        element.remove();
        this.linkElements.delete(key);
      }
    }
  }

  drawRoute(preview) {
    if (!preview?.route?.length) {
      this.routeLayer.setAttribute('visibility', 'hidden');
      this.routeBlock.setAttribute('visibility', 'hidden');
      return;
    }
    const tile = CAMERA_CONFIG.tileSize;
    const points = preview.route.map(({ x, y }) =>
      this.camera.worldToScreen((x + .5) * tile, (y + .5) * tile));
    this.routeLayer.setAttribute('d', points.map((p, i) =>
      `${i ? 'L' : 'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' '));
    this.routeLayer.setAttribute('stroke-width', Math.max(4, tile * this.camera.zoom * .72));
    this.routeLayer.setAttribute('class', preview.plan.ok ? 'route-preview valid' : 'route-preview invalid');
    this.routeLayer.setAttribute('visibility', 'visible');
    if (preview.plan.blocked) {
      const p = this.camera.worldToScreen(preview.plan.blocked.x * tile, preview.plan.blocked.y * tile);
      this.routeBlock.setAttribute('x', p.x);
      this.routeBlock.setAttribute('y', p.y);
      this.routeBlock.setAttribute('width', tile * this.camera.zoom);
      this.routeBlock.setAttribute('height', tile * this.camera.zoom);
      this.routeBlock.setAttribute('visibility', 'visible');
    } else this.routeBlock.setAttribute('visibility', 'hidden');
  }

  draw(tool, hoverTile, rotation, selectedId, showLinks = true, preview = null) {
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
        const cargo = document.createElementNS(NS, 'g');
        cargo.setAttribute('class', 'cargo-overlay');
        cargo.setAttribute('visibility', 'hidden');
        const resourceIcon = document.createElementNS(NS, 'image');
        resourceIcon.setAttribute('x', '0');
        resourceIcon.setAttribute('y', '0');
        resourceIcon.setAttribute('width', '17');
        resourceIcon.setAttribute('height', '17');
        cargo.appendChild(resourceIcon);
        const resourceAmount = document.createElementNS(NS, 'text');
        resourceAmount.setAttribute('x', '8');
        resourceAmount.setAttribute('y', '22');
        resourceAmount.setAttribute('text-anchor', 'middle');
        resourceAmount.setAttribute('class', 'cargo-count');
        cargo.appendChild(resourceAmount);
        node.appendChild(cargo);
        const insignia = document.createElementNS(NS, 'g');
        insignia.setAttribute('class', 'insignia');
        insignia.setAttribute('visibility', 'hidden');
        insignia.innerHTML = '<rect class="insignia-recess" x="0" y="0" width="16" height="17" rx="3"/><path class="insignia-rune" fill="none" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>';
        node.appendChild(insignia);
        const health = document.createElementNS(NS, 'g');
        health.setAttribute('class', 'structure-health');
        health.innerHTML = '<rect height="3.1" rx="1" fill="#141c22" /><rect height="3.1" rx="1" fill="#9eb5ad" />';
        node.appendChild(health);
        this.layer.appendChild(node);
        this.elements.set(structure.id, node);
      }
      moveSprite(node, structure, camera);
      node.style.setProperty('--nation-color', nationColor(structure.ownerId));
      const sigil = nationSigil(structure.ownerId);
      node.querySelector('.insignia').setAttribute('visibility', sigil ? 'visible' : 'hidden');
      node.querySelector('.insignia-rune').setAttribute('d', sigil);
      node.querySelector('.structure-health').setAttribute('visibility',
        selectedId === structure.id || structure.health < structure.maxHealth ? 'visible' : 'hidden');
      const cargo = node.querySelector('.cargo-overlay');
      const firstItem = structure.type === 'conveyor' ? structure.itemId :
        Object.keys(structure.inventory ?? {}).find(id => structure.inventory[id] > 0);
      const amount = structure.type === 'conveyor' ? structure.itemCount : (structure.inventory?.[firstItem] ?? 0);
      const resource = RESOURCES[firstItem];
      cargo.setAttribute('visibility', resource && amount && camera.zoom >= .68 ? 'visible' : 'hidden');
      if (resource && amount && camera.zoom >= .68) {
        cargo.firstElementChild.setAttribute('href', resource.icon);
        cargo.lastElementChild.textContent = amount > 99 ? '99+' : String(amount);
      }
      node.setAttribute('opacity', '1');
    }
    for (const [id, node] of this.elements) {
      if (!active.has(id)) {
        node.remove();
        this.elements.delete(id);
      }
    }

    this.drawLinks(active, selectedId, showLinks);
    this.drawRoute(preview);
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
