import { Camera, CAMERA_CONFIG } from './camera.js';
import { World, STRUCTURES, worldToTile } from './world.js';
import { BuildingRenderer, installSprites } from './render.js';
import { ItemConnections } from './connections.js';
import { NATIONS, nationLabel } from './nations.js';

const svg = document.getElementById('world');
const tilePattern = document.getElementById('tile-grid');
const sectorPattern = document.getElementById('sector-grid');
const tilePath = document.getElementById('tile-grid-path');
const sectorPath = document.getElementById('sector-grid-path');
const origin = document.getElementById('world-origin');
const camera = new Camera();
const world = new World();
const connections = new ItemConnections(world);
installSprites(svg);
const buildings = new BuildingRenderer(svg, world, camera, connections);
const ui = {
  tile: document.getElementById('tile-coords'),
  count: document.getElementById('structure-count'),
  chunks: document.getElementById('chunk-count'),
  selected: document.getElementById('selected-info'),
  rotation: document.getElementById('rotation'),
  links: document.getElementById('link-count'),
};
let tool = 'select';
let rotation = 0;
let selectedId = null;
let hoverPoint = null;
let activeOwner = null;
let showLinks = true;
const toolboxButtons = [...document.querySelectorAll('[data-tool]')];
const ownerSwatches = document.getElementById('owner-swatches');
for (const nation of Object.values(NATIONS)) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'owner-swatch';
  button.dataset.owner = nation.id;
  button.style.setProperty('--nation-color', nation.color);
  button.setAttribute('aria-pressed', 'false');
  button.textContent = nation.label;
  ownerSwatches.appendChild(button);
}
const ownerButtons = [...ownerSwatches.querySelectorAll('[data-owner]')];
function selectedDescription() {
  const structure = world.structures.get(selectedId);
  if (structure) return `${STRUCTURES[structure.type].label} #${structure.id} · ${nationLabel(structure.ownerId)} · IN ${connections.inputs(structure.id).size} / OUT ${connections.outputs(structure.id).size}`;
  return tool === 'select' ? '타일 또는 건물을 선택해 봐' :
    tool === 'erase' ? '선택한 건물 철거' : STRUCTURES[tool].label + ' 설치 모드';
}
function setTool(next) {
  if (next !== 'select' && next !== 'erase' && !STRUCTURES[next]) return;
  tool = next;
  selectedId = null;
  for (const button of toolboxButtons) {
    const active = button.dataset.tool === tool;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
  invalidate();
}
function hitTile(point) {
  const pos = camera.screenToWorld(point.x, point.y);
  return worldToTile(pos.x, pos.y);
}
function act(point, alternate = false) {
  const tile = hitTile(point);
  if (alternate || tool === 'erase') {
    const existing = world.getAt(tile.x, tile.y);
    if (existing) {
      world.remove(existing.id);
      if (selectedId === existing.id) selectedId = null;
    }
  } else if (STRUCTURES[tool]) {
    const result = world.place(tool, tile.x, tile.y, rotation, activeOwner);
    if (result.ok) selectedId = result.entity.id;
  } else {
    selectedId = world.getAt(tile.x, tile.y)?.id ?? null;
  }
  hoverPoint = point;
  invalidate();
}

let renderPending = false;
function render() {
  renderPending = false;
  const tile = CAMERA_CONFIG.tileSize * camera.zoom;
  const sector = tile * CAMERA_CONFIG.sectorTiles;
  const zero = camera.worldToScreen(0, 0);

  for (const [pattern, path, step] of [
    [tilePattern, tilePath, tile],
    [sectorPattern, sectorPath, sector],
  ]) {
    pattern.setAttribute('width', step);
    pattern.setAttribute('height', step);
    pattern.setAttribute('x', ((zero.x % step) + step) % step);
    pattern.setAttribute('y', ((zero.y % step) + step) % step);
    path.setAttribute('d', 'M' + step + ' 0H0V' + step);
  }
  tilePattern.setAttribute('visibility', tile < 18 ? 'hidden' : 'visible');
  origin.setAttribute('transform', 'translate(' + zero.x + ' ' + zero.y + ')');
  origin.style.display = zero.x < -30 || zero.x > camera.width + 30 ||
    zero.y < -30 || zero.y > camera.height + 30 ? 'none' : '';
  document.getElementById('cam-x').textContent = (camera.x / CAMERA_CONFIG.tileSize).toFixed(1);
  document.getElementById('cam-y').textContent = (camera.y / CAMERA_CONFIG.tileSize).toFixed(1);
  document.getElementById('zoom').textContent = Math.round(camera.zoom * 100) + '%';
  const hoverTile = hoverPoint ? hitTile(hoverPoint) : null;
  buildings.draw(tool, hoverTile, rotation, selectedId, showLinks);
  ui.tile.textContent = hoverTile ? '[' + hoverTile.x + ', ' + hoverTile.y + ']' : '—';
  ui.count.textContent = String(world.structures.size);
  ui.chunks.textContent = String(world.chunks.size);
  ui.links.textContent = String(connections.linkCount);
  ui.selected.textContent = selectedDescription();
  ui.rotation.textContent = rotation * 90 + '°';
}
function invalidate() {
  if (renderPending) return;
  renderPending = true;
  requestAnimationFrame(render);
}
function resize() {
  const rect = svg.getBoundingClientRect();
  camera.resize(rect.width, rect.height);
  invalidate();
}
new ResizeObserver(resize).observe(svg);
resize();

// Touch: one finger pans, two fingers pinch around the moving midpoint.
// Reset baselines on any finger count change to avoid camera jumps.
const fingers = new Map();
const tapCandidates = new Map();
let gesture = null;
function midAndDistance() {
  const [a, b] = [...fingers.values()];
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    distance: Math.hypot(a.x - b.x, a.y - b.y),
  };
}
function baseline() {
  if (fingers.size === 1) {
    const [point] = fingers.values();
    gesture = { type: 'pan', ...point };
  } else if (fingers.size >= 2) {
    gesture = { type: 'pinch', ...midAndDistance() };
  } else {
    gesture = null;
  }
}
function localPoint(event) {
  const rect = svg.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}
svg.addEventListener('pointerdown', event => {
  const point = localPoint(event);
  if (event.pointerType === 'touch') {
    if (fingers.size >= 2) return;
    if (fingers.size) for (const candidate of tapCandidates.values()) candidate.cancelled = true;
    fingers.set(event.pointerId, point);
    tapCandidates.set(event.pointerId, { start: point, cancelled: fingers.size > 1 });
    svg.setPointerCapture(event.pointerId);
    baseline();
    hoverPoint = null;
  } else if (event.button === 0 || event.button === 2) {
    tapCandidates.set(event.pointerId, { start: point, cancelled: false, alternate: event.button === 2 });
  }
  invalidate();
});
svg.addEventListener('pointermove', event => {
  const point = localPoint(event);
  const candidate = tapCandidates.get(event.pointerId);
  if (candidate && Math.hypot(point.x - candidate.start.x, point.y - candidate.start.y) > 9) candidate.cancelled = true;
  if (!fingers.has(event.pointerId)) {
    if (event.pointerType !== 'touch') hoverPoint = point;
    invalidate();
    return;
  }
  fingers.set(event.pointerId, point);
  if (fingers.size === 1 && gesture?.type === 'pan') {
    const [point] = fingers.values();
    camera.panPixels(point.x - gesture.x, point.y - gesture.y);
    gesture = { type: 'pan', ...point };
    invalidate();
  } else if (fingers.size >= 2 && gesture?.type === 'pinch') {
    const next = midAndDistance();
    camera.panPixels(next.x - gesture.x, next.y - gesture.y);
    if (gesture.distance > 0 && next.distance > 0) {
      camera.zoomAt(next.distance / gesture.distance, next.x, next.y);
    }
    gesture = { type: 'pinch', ...next };
    invalidate();
  }
});
function releasePointer(event, allowAction) {
  const candidate = tapCandidates.get(event.pointerId);
  if (candidate && allowAction && !candidate.cancelled) act(localPoint(event), candidate.alternate);
  tapCandidates.delete(event.pointerId);
  if (fingers.delete(event.pointerId)) {
    if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
    baseline();
  }
  invalidate();
}
svg.addEventListener('pointerup', event => releasePointer(event, true));
svg.addEventListener('pointercancel', event => releasePointer(event, false));
svg.addEventListener('lostpointercapture', event => releasePointer(event, false));
svg.addEventListener('pointerleave', event => {
  if (event.pointerType !== 'touch') { hoverPoint = null; invalidate(); }
});
svg.addEventListener('contextmenu', event => event.preventDefault());
window.addEventListener('blur', () => { fingers.clear(); tapCandidates.clear(); baseline(); });

// Desktop wheel zooms about the pointer, not the viewport center.
svg.addEventListener('wheel', event => {
  event.preventDefault();
  const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? camera.height : 1;
  const point = localPoint(event);
  camera.zoomAt(
    Math.exp(-event.deltaY * multiplier * CAMERA_CONFIG.wheelSensitivity),
    point.x, point.y
  );
  invalidate();
}, { passive: false });

// Frame-rate-independent keyboard movement, with diagonal normalization.
const pressed = new Set();
let keyboardFrame = null;
let previousFrame = 0;
function keyboardStep(time) {
  keyboardFrame = null;
  const delta = Math.min(0.05, (time - (previousFrame || time)) / 1000);
  previousFrame = time;
  const dx = Number(pressed.has('ArrowRight')) - Number(pressed.has('ArrowLeft'));
  const dy = Number(pressed.has('ArrowDown')) - Number(pressed.has('ArrowUp'));
  if (dx || dy) {
    const length = Math.hypot(dx, dy);
    const amount = CAMERA_CONFIG.keyboardSpeed * delta;
    camera.panPixels(-dx / length * amount, -dy / length * amount);
    invalidate();
  }
  if (pressed.size) keyboardFrame = requestAnimationFrame(keyboardStep);
  else previousFrame = 0;
}
function isEditing(target) {
  return target instanceof Element &&
    !!target.closest('input, textarea, select, [contenteditable="true"]');
}
window.addEventListener('keydown', event => {
  if (isEditing(event.target)) return;
  if (event.key.startsWith('Arrow')) {
    event.preventDefault();
    pressed.add(event.key);
    if (keyboardFrame === null) keyboardFrame = requestAnimationFrame(keyboardStep);
    return;
  }
  if (event.repeat) return;
  const shortcuts = { '1': 'conveyor', '2': 'drill', '3': 'smelter', '4': 'generator', v: 'select', x: 'erase' };
  if (shortcuts[event.key.toLowerCase()]) setTool(shortcuts[event.key.toLowerCase()]);
  if (event.key.toLowerCase() === 'r') { rotation = (rotation + 1) % 4; invalidate(); }
  if (event.key === 'Escape') setTool('select');
});
window.addEventListener('keyup', event => {
  pressed.delete(event.key);
  if (event.key.startsWith('Arrow')) event.preventDefault();
});
window.addEventListener('blur', () => { pressed.clear(); previousFrame = 0; });

toolboxButtons.forEach(button => button.addEventListener('click', () => setTool(button.dataset.tool)));
ownerButtons.forEach(button => button.addEventListener('click', () => {
  const next = button.dataset.owner === 'neutral' ? null : button.dataset.owner;
  if (next && !NATIONS[next]) return;
  activeOwner = next;
  if (selectedId !== null) world.setOwner(selectedId, next);
  for (const ownerButton of ownerButtons) {
    const active = ownerButton.dataset.owner === (activeOwner ?? 'neutral');
    ownerButton.classList.toggle('active', active);
    ownerButton.setAttribute('aria-pressed', String(active));
  }
  invalidate();
}));
document.getElementById('show-links').addEventListener('click', event => {
  showLinks = !showLinks;
  event.currentTarget.setAttribute('aria-pressed', String(showLinks));
  event.currentTarget.textContent = `↗ 자원 연결 표시 ${showLinks ? 'ON' : 'OFF'}`;
  invalidate();
});
document.getElementById('example').addEventListener('click', () => {
  // Opt-in illustrative chain. Never erase the user's existing structures.
  const sample = [
    ['drill', -4, -1, 0], ['conveyor', -2, 0, 3],
    ['conveyor', -1, 0, 3], ['smelter', 0, 0, 0], ['generator', 3, 0, 0],
  ];
  let placed = 0;
  for (const [type, x, y, direction] of sample) {
    if (world.place(type, x, y, direction, activeOwner).ok) placed++;
  }
  camera.reset();
  if (placed) setTool('select');
  invalidate();
});
document.getElementById('rotate').addEventListener('click', () => { rotation = (rotation + 1) % 4; invalidate(); });
document.getElementById('reset').addEventListener('click', () => {
  camera.reset();
  hoverPoint = null;
  invalidate();
});
setTool('select');
