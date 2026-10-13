import { CAMERA_CONFIG } from './camera.js';
import { STRUCTURES, tileToWorld, worldToTile } from './world.js';
import { nationColor, nationSigil } from './nations.js';
import { RESOURCES } from './resources.js';
import { DIRECTIONS } from './ports.js';
import { conveyorOpenSides, conveyorSeamPath } from './conveyor-visual.js';
import { DistantStructureRenderer } from './structure-lod.js';

const NS = 'http://www.w3.org/2000/svg';
const templates = {
  conveyor: `<symbol id="s-conveyor" viewBox="0 0 48 48">
    <rect x="1" y="1" width="46" height="46" rx="5" fill="#2e3639" stroke="#586165" stroke-width="1.3"/>
    <path d="M11 0H37V48H11Z" fill="#20292c"/>
    <path d="M10 0V48M38 0V48" stroke="#71695d" stroke-width="2.2"/>
    <path d="m20 22 4 4 4-4" fill="none" stroke="#929a97" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
  </symbol>`,
  tunnelEntrance: `<symbol id="s-tunnelEntrance" viewBox="0 0 48 48">
    <rect x="2" y="2" width="44" height="44" rx="6" fill="#3b4443" stroke="#7b8883" stroke-width="2.5"/>
    <rect x="8" y="9" width="32" height="30" rx="5" fill="#1b282a" stroke="#6c7973" stroke-width="2"/>
    <path d="M13 29H35M13 34H35" stroke="#494e49" stroke-width="2"/>
    <path d="m19 17 5-5 5 5M24 12V27" fill="none" stroke="#ac9a78" stroke-width="2.6"/>
    <rect x="13" y="36" width="22" height="4" rx="2" fill="#7b7160"/>
  </symbol>`,
  tunnelExit: `<symbol id="s-tunnelExit" viewBox="0 0 48 48">
    <rect x="2" y="2" width="44" height="44" rx="6" fill="#414b48" stroke="#89958c" stroke-width="2.5"/>
    <rect x="8" y="9" width="32" height="30" rx="5" fill="#202f31" stroke="#687d77" stroke-width="2"/>
    <path d="M13 30H35M13 35H35" stroke="#64675b" stroke-width="2"/>
    <path d="M24 30V12m-5 5 5-5 5 5" fill="none" stroke="#c0ae89" stroke-width="2.6"/>
    <circle cx="24" cy="36" r="2" fill="#c0ae89"/>
  </symbol>`,
  junction: `<symbol id="s-junction" viewBox="0 0 48 48"><rect x="3" y="3" width="42" height="42" rx="5" fill="#343d40" stroke="#687579" stroke-width="1.8"/><rect x="9" y="9" width="30" height="30" rx="4" fill="#202b30"/><path d="M24 6V42M6 24H42" stroke="#877e6e" stroke-width="5" stroke-linecap="round"/><circle cx="24" cy="24" r="8" fill="#4a5559" stroke="#a49478" stroke-width="1.4"/><path d="M20 24h8m-4-4v8" stroke="#bac5c5" stroke-width="1.8"/></symbol>`,
  drill: `<symbol id="s-drill" viewBox="0 0 96 96"><rect x="3" y="3" width="90" height="90" rx="9" fill="#48413c" stroke="#9f8b78" stroke-width="4"/><rect x="11" y="11" width="74" height="74" rx="7" fill="#19272f" stroke="#536773" stroke-width="2"/><path d="M12 24H84M12 72H84" stroke="#8e9da5" stroke-width="3" stroke-opacity=".55"/><circle cx="48" cy="48" r="29" fill="#6c5c4f" stroke="#b29c85" stroke-width="4"/><circle cx="48" cy="48" r="20" fill="#192b36" stroke="#78929e" stroke-width="3"/><g class="real-blades"><path d="M48 27L55 41L69 48L55 55L48 69L41 55L27 48L41 41Z" fill="#c0d0d4"/></g><circle cx="48" cy="48" r="7" fill="#b7c8cb" stroke="#5c7984" stroke-width="3"/><g fill="#c5d1d5"><circle cx="16" cy="16" r="3"/><circle cx="80" cy="16" r="3"/><circle cx="16" cy="80" r="3"/><circle cx="80" cy="80" r="3"/></g></symbol>`,
  smelter: `<symbol id="s-smelter" viewBox="0 0 144 96"><rect x="3" y="3" width="138" height="90" rx="9" fill="#3d4247" stroke="#98a1a7" stroke-width="4"/><rect x="12" y="10" width="120" height="76" rx="5" fill="#1a252e" stroke="#64737c" stroke-width="2"/><g fill="#5d5147" stroke="#a99682" stroke-width="3"><rect x="20" y="24" width="28" height="49" rx="4"/><rect x="57" y="24" width="28" height="49" rx="4"/><rect x="94" y="24" width="28" height="49" rx="4"/></g><g fill="#a08b70"><rect x="25" y="48" width="18" height="17" rx="2"/><rect x="62" y="48" width="18" height="17" rx="2"/><rect x="99" y="48" width="18" height="17" rx="2"/></g><g stroke="#8d9ba3" stroke-width="3"><path d="M22 16H120M25 78H119"/></g><path d="M9 35V61M135 35V61" stroke="#98a4aa" stroke-width="3" stroke-opacity=".5"/></symbol>`,
  generator: `<symbol id="s-generator" viewBox="0 0 96 96"><rect x="3" y="3" width="90" height="90" rx="9" fill="#374442" stroke="#8c9da5" stroke-width="4"/><rect x="10" y="10" width="76" height="76" rx="5" fill="#1c2b31" stroke="#536d70" stroke-width="2"/><circle cx="48" cy="48" r="31" fill="#364f50" stroke="#97a7ad" stroke-width="3"/><circle cx="48" cy="48" r="24" fill="#1a3033"/><g class="real-blades"><path d="M48 28L55 40L68 48L54 55L48 69L40 54L28 48L42 40Z" fill="#94a7af"/></g><circle cx="48" cy="48" r="9" fill="#c4d0d3" stroke="#657b85" stroke-width="3"/><path d="M17 17H31M65 17H79M17 79H31M65 79H79" stroke="#bdc8b8" stroke-width="3"/></symbol>`,
};

Object.assign(templates, {
  leadCollector: `<symbol id="s-leadCollector" viewBox="0 0 48 48">
    <rect x="2" y="2" width="44" height="44" rx="5" fill="#444c51" stroke="#84929a" stroke-width="3"/>
    <rect x="8" y="7" width="32" height="34" rx="4" fill="#25323a" stroke="#71838b"/>
    <circle cx="24" cy="24" r="13" fill="#39474e" stroke="#95a8ad" stroke-width="2"/>
    <circle cx="24" cy="24" r="7" fill="#19272d" stroke="#a7b5bb" stroke-width="2"/>
    <path d="M24 15V33M15 24H33" stroke="#a0b2b7" stroke-width="2"/>
    <path d="M37 13V37" stroke="#b5a17e" stroke-width="2"/>
  </symbol>`,
  tower: `<symbol id="s-tower" viewBox="0 0 96 96">
    <rect x="2" y="2" width="92" height="92" rx="9" fill="#303e48" stroke="#8299a6" stroke-width="3"/>
    <rect x="9" y="9" width="78" height="78" rx="7" fill="#1a2c36" stroke="#57717e" stroke-width="2"/>
    <g fill="#526774" stroke="#a5b8c0" stroke-width="2">
      <path d="M11 11h22v22H11zM63 11h22v22H63zM11 63h22v22H11zM63 63h22v22H63z"/>
    </g>
    <g stroke="#b2c2c6" stroke-width="2.5"><path d="M16 20h12M68 20h12M16 76h12M68 76h12"/></g>
    <path d="M48 6V20M48 76V90M6 48H20M76 48H90" stroke="#bb9a65" stroke-width="5" stroke-linecap="round"/>
    <path d="M48 15 76 28 83 48 76 68 48 81 20 68 13 48 20 28Z" fill="#344c5a" stroke="#a6b7bb" stroke-width="3"/>
    <path d="M48 23 70 34 74 48 70 62 48 73 26 62 22 48 26 34Z" fill="#14262f" stroke="#627e89" stroke-width="2"/>
    <circle cx="48" cy="48" r="21" fill="#486473" stroke="#a3b9bf" stroke-width="3"/>
    <circle cx="48" cy="48" r="15" fill="#152e38" stroke="#a98b5e" stroke-width="4"/>
    <path d="M48 34 59 44 55 57 41 60 35 48Z" fill="#c2c7bd" stroke="#6c8b92" stroke-width="2"/>
    <path d="M48 36V56M39 46H57" stroke="#253941" stroke-width="3" stroke-linecap="round"/>
    <g fill="#d5b684"><circle cx="48" cy="15" r="3"/><circle cx="81" cy="48" r="3"/><circle cx="48" cy="81" r="3"/><circle cx="15" cy="48" r="3"/></g>
  </symbol>`,

  turret: `<symbol id="s-turret" viewBox="0 0 96 96">
    <rect x="3" y="3" width="90" height="90" rx="9" fill="#343d47" stroke="#8596a2" stroke-width="3.5"/>
    <rect x="11" y="11" width="74" height="74" rx="7" fill="#162630" stroke="#607681" stroke-width="2.5"/>
    <path d="M12 26H84M12 70H84" stroke="#576976" stroke-width="3" stroke-opacity=".45"/>
    <g fill="#5b707a" stroke="#9aafb6" stroke-width="2">
      <path d="M11 11H28V28H11ZM68 11H85V28H68ZM11 68H28V85H11ZM68 68H85V85H68Z"/>
    </g>
    <circle cx="48" cy="48" r="31" fill="#425560" stroke="#a8b5bc" stroke-width="3"/>
    <circle cx="48" cy="48" r="24" fill="#202f38" stroke="#718a97" stroke-width="3"/>
    <path d="M38 20V39L31 51 42 63H54L65 51 58 39V20Z" fill="#74858c" stroke="#c5cdd0" stroke-width="3"/>
    <path d="M42 13V39H54V13" fill="#b6a68c" stroke="#d9d5c7" stroke-width="2.5"/>
    <rect x="38" y="9" width="20" height="8" rx="2" fill="#44565e" stroke="#a9b7bc" stroke-width="2"/>
    <circle cx="48" cy="48" r="10" fill="#273b46" stroke="#b7c4c6" stroke-width="3"/>
    <circle cx="48" cy="48" r="3" fill="#d3b988"/>
  </symbol>`,
  poweredDrill: `<symbol id="s-poweredDrill" viewBox="0 0 96 96">
    <rect x="2" y="2" width="92" height="92" rx="8" fill="#3e505c" stroke="#b4c1c7" stroke-width="4"/>
    <rect x="9" y="9" width="78" height="78" rx="7" fill="#23323e" stroke="#5e7785" stroke-width="3"/>
    <path d="M12 22H84M12 74H84" stroke="#acafb2" stroke-width="4" stroke-opacity=".48"/>
    <circle cx="48" cy="48" r="29" fill="#526779" stroke="#b9c7cb" stroke-width="4"/>
    <circle cx="48" cy="48" r="20" fill="#1e3039" stroke="#788f99" stroke-width="3"/>
    <g class="real-blades"><path d="M48 22 57 40 73 48 57 56 48 74 39 56 23 48 39 40Z" fill="#b4bec2" stroke="#596e7d" stroke-width="2"/></g>
    <circle cx="48" cy="48" r="7" fill="#d1dbdf"/>
    <path d="M17 17H31M65 17H79" stroke="#85c4cc" stroke-width="3"/>
  </symbol>`,
  siliconPlant: `<symbol id="s-siliconPlant" viewBox="0 0 144 96">
    <rect x="2" y="2" width="140" height="92" rx="9" fill="#39454b" stroke="#a3b2b7" stroke-width="4"/>
    <rect x="11" y="10" width="122" height="76" rx="7" fill="#1c2e37" stroke="#556975" stroke-width="2.5"/>
    <g fill="#4d6570" stroke="#9eb7bb" stroke-width="3">
      <rect x="20" y="19" width="29" height="57" rx="4"/><rect x="58" y="19" width="29" height="57" rx="4"/><rect x="96" y="19" width="29" height="57" rx="4"/>
    </g>
    <g stroke="#dae3e1" stroke-width="2"><path d="M24 36H45M24 48H45M24 60H45M62 36H83M62 48H83M62 60H83M100 36H121M100 48H121M100 60H121"/></g>
    <path d="M13 11H131" stroke="#8db4bd" stroke-width="3"/>
  </symbol>`,
  superconductorPlant: `<symbol id="s-superconductorPlant" viewBox="0 0 144 144">
    <rect x="2" y="2" width="140" height="140" rx="12" fill="#394951" stroke="#acbdc3" stroke-width="4"/>
    <rect x="12" y="12" width="120" height="120" rx="9" fill="#1a2b32" stroke="#6a838e" stroke-width="4"/>
    <circle cx="72" cy="72" r="46" fill="#425761" stroke="#a8b9be" stroke-width="4"/>
    <circle cx="72" cy="72" r="34" fill="#172a33" stroke="#70919c" stroke-width="5"/>
    <circle cx="72" cy="72" r="21" fill="#516d77" stroke="#ced7da" stroke-width="4"/>
    <circle cx="72" cy="72" r="9" fill="#d4dfdf"/>
    <g stroke="#99aeb7" stroke-width="4" fill="none"><path d="M72 17V35M72 109V127M17 72H35M109 72H127"/></g>
    <path d="M24 24H44M100 24H120M24 120H44M100 120H120" stroke="#6ab8bb" stroke-width="3"/>
  </symbol>`,
});

Object.assign(templates, {
  warehouse: `<symbol id="s-warehouse" viewBox="0 0 96 96">
    <rect x="3" y="3" width="90" height="90" rx="11" fill="#414849" stroke="#8b9793" stroke-width="4"/>
    <rect x="10" y="10" width="76" height="76" rx="8" fill="#252f32" stroke="#556969" stroke-width="2.5"/>
    <rect x="18" y="22" width="60" height="51" rx="6" fill="#49534d" stroke="#a1977b" stroke-width="3"/>
    <path d="M18 40H78M38 22V73M58 22V73" stroke="#7c8b89" stroke-width="3"/>
    <rect x="29" y="44" width="38" height="22" rx="4" fill="#2d3a3a" stroke="#b7a78a" stroke-width="2.5"/>
    <path d="M40 55h16" stroke="#d0c6ae" stroke-width="3"/>
  </symbol>`,
  wall: `<symbol id="s-wall" viewBox="0 0 48 48">
    <rect x="1.5" y="1.5" width="45" height="45" rx="5" fill="#4c5050" stroke="#8b9290" stroke-width="3"/>
    <rect x="6" y="7" width="36" height="34" rx="4" fill="#454c4d" stroke="#677778" stroke-width="2"/>
    <path d="M6 24H42M24 7V24M15 24V41M33 24V41" stroke="#89908b" stroke-width="2.5" opacity=".75"/>
  </symbol>`,
  ironWall: `<symbol id="s-ironWall" viewBox="0 0 48 48">
    <rect x="1.5" y="1.5" width="45" height="45" rx="5" fill="#454b4c" stroke="#a0a9aa" stroke-width="3"/>
    <rect x="7" y="7" width="34" height="34" rx="4" fill="#263236" stroke="#82928e" stroke-width="3.5"/>
    <path d="M7 16H41M7 32H41" stroke="#758785" stroke-width="3"/>
    <path d="M16 7V41M32 7V41" stroke="#657775" stroke-width="2"/>
    <g fill="#c0ac89"><circle cx="11" cy="11" r="2"/><circle cx="37" cy="11" r="2"/><circle cx="11" cy="37" r="2"/><circle cx="37" cy="37" r="2"/></g>
  </symbol>`,
  reinforcedWall: `<symbol id="s-reinforcedWall" viewBox="0 0 48 48">
    <rect x="1.5" y="1.5" width="45" height="45" rx="5" fill="#3e5155" stroke="#afc0bd" stroke-width="3"/>
    <rect x="7" y="7" width="34" height="34" rx="5" fill="#24353b" stroke="#809a9c" stroke-width="3"/>
    <path d="m12 12 24 24M36 12 12 36" stroke="#95a9a5" stroke-width="4"/>
    <circle cx="24" cy="24" r="7" fill="#485e62" stroke="#c6ba9a" stroke-width="2.5"/>
  </symbol>`,
  scatterTurret: `<symbol id="s-scatterTurret" viewBox="0 0 96 96">
    <rect x="3" y="3" width="90" height="90" rx="10" fill="#40484a" stroke="#8e9b99" stroke-width="4"/>
    <rect x="11" y="11" width="74" height="74" rx="8" fill="#1d2c30" stroke="#617775" stroke-width="2.5"/>
    <circle cx="48" cy="49" r="29" fill="#54615c" stroke="#a5aa98" stroke-width="3"/>
    <circle cx="48" cy="49" r="20" fill="#25383a" stroke="#869997" stroke-width="3"/>
    <path d="M35 47V17h8v30M45 47V14h8v33M55 47V17h8v30" fill="#6d7774" stroke="#b9baa7" stroke-width="3"/>
    <path d="M35 21h8M45 18h8M55 21h8" stroke="#c6ab81" stroke-width="4"/>
    <circle cx="48" cy="49" r="9" fill="#425557" stroke="#c7c5ac" stroke-width="3"/>
  </symbol>`,
  heavyTurret: `<symbol id="s-heavyTurret" viewBox="0 0 144 144">
    <rect x="3" y="3" width="138" height="138" rx="14" fill="#42494b" stroke="#abb5ae" stroke-width="5"/>
    <rect x="13" y="13" width="118" height="118" rx="10" fill="#1e3035" stroke="#627b7d" stroke-width="4"/>
    <path d="M22 22h30M92 22h30M22 122h30M92 122h30" stroke="#958e7e" stroke-width="6"/>
    <circle cx="72" cy="77" r="47" fill="#4e5f63" stroke="#a4b2ad" stroke-width="5"/>
    <circle cx="72" cy="77" r="33" fill="#273c42" stroke="#8b9f9e" stroke-width="5"/>
    <path d="M59 67V14H85V67Z" fill="#687678" stroke="#c6c5b5" stroke-width="5"/>
    <path d="M59 27h26M59 47h26" stroke="#bca17d" stroke-width="6"/>
    <rect x="55" y="9" width="34" height="12" rx="4" fill="#3d4b4d" stroke="#adbcb9" stroke-width="4"/>
    <circle cx="72" cy="77" r="15" fill="#4e6467" stroke="#bfcac2" stroke-width="5"/>
    <circle cx="72" cy="77" r="5" fill="#d1b68c"/>
  </symbol>`,
});

// Shared rounded line endings apply to the game sprites and distant cached art.
for (const type of Object.keys(templates))
  templates[type] = templates[type].replace('<symbol ', '<symbol stroke-linecap="round" stroke-linejoin="round" ');

export function installSprites(svg) {
  const defs = svg.querySelector('defs');
  defs.insertAdjacentHTML('beforeend', Object.values(templates).join(''));
}

// A single world-space transform moves all visible structures. Camera motion
// must not rewrite transforms and dimensions on every individual SVG node.
export function worldLayerTransform(camera) {
  return `translate(${camera.width / 2 - camera.x * camera.zoom} ${camera.height / 2 - camera.y * camera.zoom}) scale(${camera.zoom})`;
}

export function structureWorldTransform(structure) {
  const def = STRUCTURES[structure.type];
  const x = structure.x * CAMERA_CONFIG.tileSize;
  const y = structure.y * CAMERA_CONFIG.tileSize;
  const w = def.width * CAMERA_CONFIG.tileSize;
  const h = def.height * CAMERA_CONFIG.tileSize;
  const translate = [
    [x, y], [x + h, y], [x + w, y + h], [x, y + w],
  ][structure.rotation];
  return `translate(${translate[0]} ${translate[1]}) rotate(${structure.rotation * 90})`;
}

function moveSprite(element, structure, connections, world) {
  const def = STRUCTURES[structure.type];
  const parts = element._parts;
  const placement = `${structure.x},${structure.y},${structure.rotation},${structure.type}`;
  if (parts.wall) {
    if (element._placement !== placement) {
      element.setAttribute('transform', structureWorldTransform(structure));
      parts.use.setAttribute('width', def.width * CAMERA_CONFIG.tileSize);
      parts.use.setAttribute('height', def.height * CAMERA_CONFIG.tileSize);
      parts.health.setAttribute('transform', `translate(5 ${def.height * 48 - 7})`);
      parts.health.firstElementChild.setAttribute('width', def.width * 48 - 10);
      element._placement = placement;
    }
    if (element._health !== structure.health) {
      parts.health.lastElementChild.setAttribute('width',
        (def.width * 48 - 10) * structure.health / structure.maxHealth);
      element._health = structure.health;
    }
    return;
  }
  if (element._placement !== placement) {
    element.setAttribute('transform', structureWorldTransform(structure));
    parts.use.setAttribute('width', def.width * CAMERA_CONFIG.tileSize);
    parts.use.setAttribute('height', def.height * CAMERA_CONFIG.tileSize);
    parts.insignia.setAttribute('transform', 'translate(5 5)');
    parts.cargo.setAttribute('transform',
      `translate(${def.width * 48 - (structure.type === 'conveyor' ? 27 : 25)} 5)`);
    parts.health.setAttribute('transform', `translate(5 ${def.height * 48 - 7})`);
    parts.health.firstElementChild.setAttribute('width', def.width * 48 - 10);
    parts.status.setAttribute('transform', `translate(${def.width * 48 - 8} 8)`);
    element._placement = placement;
  }
  if (parts.bend && element._bendRevision !== connections.revision) {
    const inputSides = [...connections.inputs(structure.id).values()]
      .flatMap(link => link.contacts.map(contact => (contact.side + 2) % 4));
    const localSides = [...new Set(inputSides.map(side => (side - structure.rotation + 4) % 4))];
    const turns = { 1: 'M44 24H24V44', 3: 'M4 24H24V44' };
    const path = localSides.filter(side => turns[side]).map(side => turns[side]).join(' ');
    parts.bend.setAttribute('visibility', path ? 'visible' : 'hidden');
    parts.bend.setAttribute('d', path);
    element._bendRevision = connections.revision;
  }
  if (parts.seam && element._seamRevision !== connections.revision) {
    const sides = conveyorOpenSides(structure, connections, world);
    const path = conveyorSeamPath(sides);
    parts.seam.setAttribute('visibility', path ? 'visible' : 'hidden');
    if (path) parts.seam.setAttribute('d', path);
    element._seamRevision = connections.revision;
  }
  if (element._health !== structure.health || element._maxHealth !== structure.maxHealth) {
    parts.health.lastElementChild.setAttribute('width',
      (def.width * 48 - 10) * structure.health / structure.maxHealth);
    element._health = structure.health;
    element._maxHealth = structure.maxHealth;
  }
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
    this.lastTransform = '';
    this.lastLinkRevision = -1;
    this.lastLinkSelected = null;
    this.lastLinkShow = null;
    this.lastLinkVisible = new Set();
    this.distant = new DistantStructureRenderer(svg, world, camera, connections, templates);
    this.distantMode = false;
  }

  drawLinks(visible, selectedId, showLinks) {
    const enabled = showLinks && this.camera.zoom >= 0.92;
    const sameVisible = visible.size === this.lastLinkVisible.size
      && [...visible].every(id => this.lastLinkVisible.has(id));
    if (sameVisible && this.lastLinkRevision === this.connections.revision &&
        this.lastLinkSelected === selectedId && this.lastLinkShow === enabled) return;
    this.lastLinkVisible = new Set(visible);
    this.lastLinkRevision = this.connections.revision;
    this.lastLinkSelected = selectedId;
    this.lastLinkShow = enabled;
    const keep = new Set();
    if (enabled) {
      const tileSize = CAMERA_CONFIG.tileSize;
      for (const sourceId of visible) {
        for (const link of this.connections.outputs(sourceId).values()) {
          if (link.contacts.some(contact => contact.underground)) continue;
          if (!visible.has(link.to)) continue;
          const source = this.world.structures.get(sourceId);
          const destination = this.world.structures.get(link.to);
          if (source?.type === 'conveyor' && destination?.type === 'conveyor' &&
              selectedId !== sourceId && selectedId !== link.to) continue;
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
            const p = {x: (contact.x + 0.5) * tileSize, y: (contact.y + 0.5) * tileSize};
            const d = tileSize;
            const x = p.x + direction.x * d * 0.70;
            const y = p.y + direction.y * d * 0.70;
            const tailX = p.x + direction.x * d * 0.28;
            const tailY = p.y + direction.y * d * 0.28;
            const px = -direction.y, py = direction.x;
            const arrow = d * 0.10;
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

  draw(tool, hoverTile, rotation, selectedId, showLinks = true, preview = null, ownerId = null) {
    const { camera, world } = this;
    const distant = this.distant.draw(selectedId);
    if (distant !== this.distantMode) {
      this.layer.setAttribute('visibility', distant ? 'hidden' : 'visible');
      this.linksLayer.setAttribute('visibility', distant ? 'hidden' : 'visible');
      if (distant) {
        // Release SVG nodes rather than merely hiding thousands of them.
        for (const element of this.elements.values()) element.remove();
        for (const element of this.linkElements.values()) element.remove();
        this.elements.clear();
        this.linkElements.clear();
        this.lastLinkVisible.clear();
        this.lastLinkRevision = -1;
      }
      this.distantMode = distant;
    }
    if (!distant) {
    const a = camera.screenToWorld(0, 0);
    const b = camera.screenToWorld(camera.width, camera.height);
    const lo = worldToTile(a.x, a.y);
    const hi = worldToTile(b.x, b.y);
    const transform = worldLayerTransform(camera);
    if (transform !== this.lastTransform) {
      this.layer.setAttribute('transform', transform);
      this.linksLayer.setAttribute('transform', transform);
      this.lastTransform = transform;
    }
    const active = new Set();
    for (const structure of world.visible(lo.x - 3, lo.y - 3, hi.x + 3, hi.y + 3)) {
      active.add(structure.id);
      let node = this.elements.get(structure.id);
      if (!node) {
        node = document.createElementNS(NS, 'g');
        node._connections = this.connections;
        const use = document.createElementNS(NS, 'use');
        use.setAttribute('href', `#s-${structure.type}`);
        node.appendChild(use);
        if (STRUCTURES[structure.type].blocksGround) {
          const health = document.createElementNS(NS, 'g');
          health.setAttribute('class', 'structure-health');
          health.setAttribute('visibility', 'hidden');
          health.innerHTML = '<rect height="3.1" rx="1" fill="#141c22" /><rect height="3.1" rx="1" fill="#9eb5ad" />';
          node.appendChild(health);
          node._parts = {use,health,wall:true};
          this.layer.appendChild(node);
          this.elements.set(structure.id,node);
        } else {
        let seam = null;
        let bend = null;
        if (structure.type === 'conveyor') {
          bend = document.createElementNS(NS, 'path');
          bend.setAttribute('class', 'conveyor-bend');
          bend.setAttribute('fill', 'none');
          bend.setAttribute('stroke', '#797469');
          bend.setAttribute('stroke-width', '3.5');
          bend.setAttribute('stroke-linejoin', 'round');
          bend.setAttribute('visibility', 'hidden');
          node.appendChild(bend);
          seam = document.createElementNS(NS,'path');
          seam.setAttribute('class','conveyor-seam');
          seam.setAttribute('fill','none');
          seam.setAttribute('stroke','#27343a');
          seam.setAttribute('stroke-width','7');
          seam.setAttribute('stroke-linecap','butt');
          seam.setAttribute('visibility','hidden');
          node.appendChild(seam);
        }
        const cargo = document.createElementNS(NS, 'g');
        cargo.setAttribute('class','cargo-overlay');
        cargo.setAttribute('visibility', 'hidden');
        const resourceIcon = document.createElementNS(NS, 'image');
        resourceIcon.setAttribute('x', '0');
        resourceIcon.setAttribute('y', '0');
        resourceIcon.setAttribute('width', structure.type === 'conveyor' ? '23' : '19');
        resourceIcon.setAttribute('height', structure.type === 'conveyor' ? '23' : '19');
        cargo.appendChild(resourceIcon);
        const resourceAmount = document.createElementNS(NS, 'text');
        resourceAmount.setAttribute('x', structure.type === 'conveyor' ? '11.5' : '9');
        resourceAmount.setAttribute('y', structure.type === 'conveyor' ? '30' : '24');
        resourceAmount.setAttribute('text-anchor', 'middle');
        resourceAmount.setAttribute('class', 'cargo-count');
        cargo.appendChild(resourceAmount);
        node.appendChild(cargo);
        const status = document.createElementNS(NS, 'circle');
        status.setAttribute('class','machine-status-dot');
        status.setAttribute('r','3.3');
        status.setAttribute('cx','0');
        status.setAttribute('cy','0');
        node.appendChild(status);

        const insignia = document.createElementNS(NS, 'g');
        insignia.setAttribute('class', 'insignia');
        insignia.setAttribute('visibility', 'hidden');
        insignia.innerHTML = '<rect class="insignia-recess" x="0" y="0" width="16" height="17" rx="3"/><path class="insignia-rune" fill="none" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>';
        node.appendChild(insignia);
        const health = document.createElementNS(NS, 'g');
        health.setAttribute('class', 'structure-health');
        health.innerHTML = '<rect height="3.1" rx="1" fill="#141c22" /><rect height="3.1" rx="1" fill="#9eb5ad" />';
        node.appendChild(health);
        node._parts = { use, bend, seam, cargo, resourceIcon, resourceAmount, status, insignia,
          rune: insignia.querySelector('.insignia-rune'), health };
        this.layer.appendChild(node);
        this.elements.set(structure.id, node);
        }
      }
      moveSprite(node, structure, this.connections, world);
      if (STRUCTURES[structure.type].blocksGround) {
        const health = node._parts.health;
        const visibility = selectedId === structure.id || structure.health < structure.maxHealth ? 'visible' : 'hidden';
        if (node._healthVisibility !== visibility) {
          health.setAttribute('visibility', visibility);
          node._healthVisibility = visibility;
        }
        continue;
      }
      const { status, insignia, rune, health, cargo, resourceIcon, resourceAmount } = node._parts;
      const blocked = !structure.enabled || ['no-power','no-coal','no-ore','blocked'].includes(structure.activity);
      const operating = ['mining','processing','generating','transporting','receiving'].includes(structure.activity);
      const stateKey = `${blocked}:${operating}:${structure.ownerId}`;
      if (node._renderStateKey !== stateKey) {
        const minor = ['conveyor','junction','tunnelEntrance','tunnelExit'].includes(structure.type) ||
          Boolean(STRUCTURES[structure.type].blocksGround);
        status.setAttribute('visibility', minor ? 'hidden' : 'visible');
        status.setAttribute('fill', blocked ? '#e69b79' : operating ? '#8ac9ad' : '#8697a3');
        node.classList.toggle('machine-operating', operating);
        node.classList.toggle('machine-blocked', blocked);
        node.style.setProperty('--blade-play', operating ? 'running' : 'paused');
        node.style.setProperty('--nation-color', nationColor(structure.ownerId));
        const sigil = nationSigil(structure.ownerId);
        insignia.setAttribute('visibility', sigil && !minor ? 'visible' : 'hidden');
        if (sigil) rune.setAttribute('d', sigil);
        node._renderStateKey = stateKey;
      }
      const healthVisibility =
        selectedId === structure.id || structure.health < structure.maxHealth ? 'visible' : 'hidden';
      if (node._healthVisibility !== healthVisibility) {
        health.setAttribute('visibility', healthVisibility);
        node._healthVisibility = healthVisibility;
      }
      const firstItem = (['conveyor','junction','tunnelEntrance','tunnelExit'].includes(structure.type)) ? structure.itemId :
        Object.keys(structure.inventory ?? {}).find(id => structure.inventory[id] > 0);
      const amount = (['conveyor','junction','tunnelEntrance','tunnelExit'].includes(structure.type)) ? structure.itemCount : (structure.inventory?.[firstItem] ?? 0);
      const resource = RESOURCES[firstItem];
      // Conveyor cargo in transit is shown by CargoRenderer, not this overlay.
      // Only a blocked belt gets a stationary inventory badge.
      const isBelt = ['conveyor','tunnelEntrance','tunnelExit'].includes(structure.type);
      const cargoVisible = Boolean(resource && amount && camera.zoom >= .68 &&
        (!isBelt || structure.activity === 'blocked'));
      if (node._cargoVisible !== cargoVisible) {
        cargo.setAttribute('visibility', cargoVisible ? 'visible' : 'hidden');
        node._cargoVisible = cargoVisible;
      }
      if (cargoVisible) {
        if (resourceIcon.getAttribute('href') !== resource.icon) resourceIcon.setAttribute('href', resource.icon);
        // Put the parked cargo and count on one edge, away from the belt path.
        if (isBelt && !node._stackBadge) {
          // A stopped item and its quantity share a small inset badge.
          // Keep both inside 48px; the center remains clear for flowing cargo.
          resourceIcon.setAttribute('width','15');
          resourceIcon.setAttribute('height','15');
          resourceIcon.setAttribute('x','0');
          resourceIcon.setAttribute('y','0');
          resourceAmount.setAttribute('x','17');
          resourceAmount.setAttribute('y','11');
          resourceAmount.setAttribute('text-anchor','start');
          cargo.setAttribute('transform','translate(7 31)');
          node._stackBadge = true;
        }
        const label = amount > 99 ? '99+' : String(amount);
        if (resourceAmount.textContent !== label) resourceAmount.textContent = label;
      }
    }
    for (const [id, node] of this.elements) {
      if (!active.has(id)) {
        node.remove();
        this.elements.delete(id);
      }
    }

    this.drawLinks(active, selectedId, showLinks);
    }
    this.drawRoute(preview);
    if (!hoverTile) {
      this.hover.setAttribute('visibility', 'hidden');
      return;
    }
    let { x, y } = hoverTile;
    let width = 1, height = 1, okay = world.inBounds(x, y);
    if (STRUCTURES[tool]) {
      const validity = world.survival ? world.canBuild(tool, x, y, rotation, ownerId) : world.canPlace(tool, x, y, rotation);
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
