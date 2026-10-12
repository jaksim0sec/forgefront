import { Camera, CAMERA_CONFIG } from './camera.js';
import { installTerrain } from './terrain/index.js';
import { World, STRUCTURES, worldToTile } from './world.js';
import { BuildingRenderer, installSprites } from './render.js';
import { ItemConnections } from './connections.js';
import { Industry } from './industry.js';
import { extendRoute, planConveyorRoute, commitConveyorRoute } from './routes.js';
import { NATIONS, nationLabel, nationColor } from './nations.js';
import { RESOURCES } from './resources.js';

const svg = document.getElementById('world');
const camera = new Camera();
const world = new World();
const terrainView = installTerrain({ world, camera, svg });
const connections = new ItemConnections(world);
const industry = new Industry(world, connections);
installSprites(svg);
const buildings = new BuildingRenderer(svg, world, camera, connections);

const byId = id => document.getElementById(id);
const ui = {
  tile: byId('tile-coords'), count: byId('structure-count'),
  chunks: byId('chunk-count'), selected: byId('selected-info'),
  rotation: byId('rotation'), links: byId('link-count'),
  hp: byId('selected-health'), stock: byId('selected-stock'),
  status: byId('selected-status'), drillResource: byId('drill-resource'),
  resourcePicker: byId('resource-picker'),
};
let tool = 'select', rotation = 0, selectedId = null;
let activeOwner = null, hoverPoint = null, showLinks = true, touchDraw = false;
const toolButtons = [...document.querySelectorAll('[data-tool]')];

const ownerSwatches = byId('owner-swatches');
for (const nation of Object.values(NATIONS)) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'owner-swatch';
  button.dataset.owner = nation.id;
  button.style.setProperty('--nation-color', nation.color);
  button.setAttribute('aria-pressed', 'false');
  button.innerHTML = `<svg class="swatch-rune" viewBox="0 0 16 16" aria-hidden="true"><path d="${nation.sigil}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg> ${nation.label}`;
  ownerSwatches.appendChild(button);
}
const ownerButtons = [...ownerSwatches.querySelectorAll('[data-owner]')];
const resourceList = byId('resource-list');
for (const r of Object.values(RESOURCES)) {
  const chip = document.createElement('span');
  chip.className = 'resource-chip';
  const img = document.createElement('img');
  img.src = r.icon;
  img.alt = '';
  img.loading = 'lazy';
  chip.appendChild(img);
  chip.append(r.label);
  chip.title = r.label;
  resourceList.appendChild(chip);
  if (r.kind === 'raw') {
    const option = document.createElement('option');
    option.value = r.id;
    option.textContent = r.label;
    ui.drillResource.appendChild(option);
  }
}
function hitTile(point) {
  const { x, y } = camera.screenToWorld(point.x, point.y);
  return worldToTile(x, y);
}
function localPoint(event) {
  const bounds = svg.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
}
function previewForStroke(stroke) {
  return stroke ? { route: stroke.route, plan: planConveyorRoute(world, stroke.route, rotation) } : null;
}

let paint = null, renderPending = false;
function invalidate() {
  if (renderPending) return;
  renderPending = true;
  requestAnimationFrame(render);
}
function render() {
  renderPending = false;
  const tile = CAMERA_CONFIG.tileSize * camera.zoom;
  const sector = tile * CAMERA_CONFIG.sectorTiles;
  const zero = camera.worldToScreen(0, 0);
  for (const [pattern, path, size] of [
    [byId('tile-grid'), byId('tile-grid-path'), tile],
    [byId('sector-grid'), byId('sector-grid-path'), sector],
  ]) {
    pattern.setAttribute('width', size);
    pattern.setAttribute('height', size);
    pattern.setAttribute('x', ((zero.x % size) + size) % size);
    pattern.setAttribute('y', ((zero.y % size) + size) % size);
    path.setAttribute('d', `M${size} 0H0V${size}`);
  }
  byId('tile-grid').setAttribute('visibility', tile < 18 ? 'hidden' : 'visible');
  byId('world-origin').setAttribute('transform', `translate(${zero.x} ${zero.y})`);
  byId('world-origin').style.display = zero.x < -30 || zero.x > camera.width + 30 ||
    zero.y < -30 || zero.y > camera.height + 30 ? 'none' : '';
  byId('cam-x').textContent = (camera.x / CAMERA_CONFIG.tileSize).toFixed(1);
  byId('cam-y').textContent = (camera.y / CAMERA_CONFIG.tileSize).toFixed(1);
  byId('zoom').textContent = Math.round(camera.zoom * 100) + '%';
  const hoverTile = hoverPoint ? hitTile(hoverPoint) : null;
  terrainView.draw();
  buildings.draw(tool, hoverTile, rotation, selectedId, showLinks, previewForStroke(paint));
  ui.tile.textContent = hoverTile ? `[${hoverTile.x}, ${hoverTile.y}]` : '—';
  ui.count.textContent = world.structures.size;
  ui.chunks.textContent = world.chunks.size;
  ui.links.textContent = connections.linkCount;
  ui.rotation.textContent = rotation * 90 + '°';
  const selected = world.structures.get(selectedId);
  ui.selected.textContent = selected ?
    `${STRUCTURES[selected.type].label} #${selected.id} · ${nationLabel(selected.ownerId)}` :
    (tool === 'select' ? '타일 또는 건물을 선택해 봐' : tool === 'erase' ? '건물 철거 모드' :
      `${STRUCTURES[tool].label} 설치 모드`);
  ui.hp.textContent = selected ? `${selected.health} / ${selected.maxHealth}` : '—';
  ui.status.textContent = selected ? (selected.enabled ? selected.activity : '중지됨') : '—';
  const stocked = selected?.type === 'conveyor' ?
    (selected.itemId ? [[selected.itemId, selected.itemCount]] : []) :
    Object.entries(selected?.inventory ?? {}).filter(([k,v]) => v > 0);
  ui.stock.textContent = stocked.length ? stocked.map(([k,v])=>`${RESOURCES[k]?.label ?? k} ${v}`).join(' · ') : '재고 없음';
  ui.resourcePicker.hidden = selected?.type !== 'drill';
  if (selected?.type === 'drill') ui.drillResource.value = selected.resourceId;
  byId('selected-detail').hidden = !selected;
}
function setTool(next) {
  if (next !== 'select' && next !== 'erase' && !STRUCTURES[next]) return;
  tool = next;
  paint = null;
  selectedId = null;
  for (const button of toolButtons) {
    const active = button.dataset.tool === tool;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
  invalidate();
}
function actionAt(point, alternate = false) {
  const tile = hitTile(point);
  if (alternate || tool === 'erase') {
    const entity = world.getAt(tile.x, tile.y);
    if (entity) { world.remove(entity.id); if (selectedId === entity.id) selectedId = null; }
  } else if (tool === 'conveyor') {
    commitConveyorRoute(world, planConveyorRoute(world, [tile], rotation), activeOwner);
  } else if (STRUCTURES[tool]) {
    const created = world.place(tool, tile.x, tile.y, rotation, activeOwner);
    if (created.ok) selectedId = created.entity.id;
  } else selectedId = world.getAt(tile.x, tile.y)?.id ?? null;
  invalidate();
}
function startStroke(pointerId, point, isTouch) {
  paint = { pointerId, route: [{ ...hitTile(point) }], isTouch };
  invalidate();
}
function extendStroke(point) {
  if (!paint) return;
  const tile = hitTile(point), last = paint.route.at(-1);
  if (last?.x === tile.x && last?.y === tile.y) return;
  extendRoute(paint.route, tile);
  invalidate();
}
function finishStroke(commit) {
  if (!paint) return;
  if (commit) commitConveyorRoute(world, planConveyorRoute(world, paint.route, rotation), activeOwner);
  paint = null;
  invalidate();
}

// Gesture ownership: 1-finger pan is the default even while a building tool
// is active. Touch drawing requires explicit opt-in; pinch always overrides it.
const touches = new Map();
const taps = new Map();
let gesture = null;
function pinchState() {
  const [a,b] = [...touches.values()];
  return { x:(a.x+b.x)/2, y:(a.y+b.y)/2, distance:Math.hypot(a.x-b.x,a.y-b.y), type:'pinch' };
}
function resetGesture() {
  if (touches.size === 1) gesture = { ...touches.values().next().value, type:'pan' };
  else if (touches.size === 2) gesture = pinchState();
  else gesture = null;
}
svg.addEventListener('pointerdown', event => {
  const point = localPoint(event);
  if (event.pointerType === 'touch') {
    if (touches.size >= 2) return;
    if (touches.size === 1) {
      for (const tap of taps.values()) tap.cancelled = true;
      if (paint?.isTouch) finishStroke(false);
    }
    touches.set(event.pointerId, point);
    svg.setPointerCapture(event.pointerId);
    taps.set(event.pointerId, { start: point, cancelled: touches.size > 1 });
    resetGesture();
    if (touches.size === 1 && touchDraw && tool === 'conveyor') startStroke(event.pointerId, point, true);
    hoverPoint = null;
  } else if (event.button === 0) {
    svg.setPointerCapture(event.pointerId);
    if (tool === 'conveyor') startStroke(event.pointerId, point, false);
    else taps.set(event.pointerId, { start: point, cancelled: false });
  } else if (event.button === 2) {
    svg.setPointerCapture(event.pointerId);
    taps.set(event.pointerId, { start: point, cancelled: false, alternate: true });
  }
  invalidate();
});
svg.addEventListener('pointermove', event => {
  const point = localPoint(event);
  const candidate = taps.get(event.pointerId);
  if (candidate && Math.hypot(point.x-candidate.start.x,point.y-candidate.start.y) > 9) candidate.cancelled = true;
  if (event.pointerType !== 'touch') {
    const previous = hoverPoint ? hitTile(hoverPoint) : null;
    hoverPoint = point;
    if (paint?.pointerId === event.pointerId) extendStroke(point);
    else {
      const next = hitTile(point);
      if (!previous || next.x !== previous.x || next.y !== previous.y) invalidate();
    }
    return;
  }
  if (!touches.has(event.pointerId)) return;
  touches.set(event.pointerId, point);
  if (touches.size === 2 && gesture?.type === 'pinch') {
    const next = pinchState();
    camera.panPixels(next.x - gesture.x, next.y - gesture.y);
    if (gesture.distance > 0 && next.distance > 0) camera.zoomAt(next.distance / gesture.distance, next.x, next.y);
    gesture = next;
  } else if (touches.size === 1) {
    if (paint?.isTouch && paint.pointerId === event.pointerId) extendStroke(point);
    else if (gesture?.type === 'pan') {
      camera.panPixels(point.x - gesture.x, point.y - gesture.y);
      gesture = { ...point, type:'pan' };
    }
  }
  invalidate();
});
function release(event, commit) {
  const point = localPoint(event);
  const candidate = taps.get(event.pointerId);
  if (paint?.pointerId === event.pointerId) {
    if (commit) extendStroke(point);
    finishStroke(commit);
  } else if (candidate && commit && !candidate.cancelled) actionAt(point, candidate.alternate);
  taps.delete(event.pointerId);
  if (touches.delete(event.pointerId)) resetGesture();
  if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
  invalidate();
}
svg.addEventListener('pointerup', event => release(event, true));
svg.addEventListener('pointercancel', event => release(event, false));
svg.addEventListener('lostpointercapture', event => {
  if (paint?.pointerId === event.pointerId) finishStroke(false);
  taps.delete(event.pointerId);
  if (touches.delete(event.pointerId)) resetGesture();
});
svg.addEventListener('pointerleave', event => { if (event.pointerType !== 'touch' && !paint) { hoverPoint = null; invalidate(); } });
svg.addEventListener('contextmenu', event => event.preventDefault());
window.addEventListener('blur', () => { touches.clear(); taps.clear(); gesture = null; finishStroke(false); });

svg.addEventListener('wheel', event => {
  event.preventDefault();
  const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? camera.height : 1;
  const point = localPoint(event);
  camera.zoomAt(Math.exp(-event.deltaY * multiplier * CAMERA_CONFIG.wheelSensitivity), point.x, point.y);
  invalidate();
}, { passive: false });

const pressed = new Set();
let keyboardFrame = null, previousFrame = 0;
function keyboardStep(time) {
  keyboardFrame = null;
  const dt = Math.min(.05, (time - (previousFrame || time)) / 1000);
  previousFrame = time;
  const dx = Number(pressed.has('ArrowRight')) - Number(pressed.has('ArrowLeft'));
  const dy = Number(pressed.has('ArrowDown')) - Number(pressed.has('ArrowUp'));
  if (dx || dy) {
    const length = Math.hypot(dx, dy), speed = CAMERA_CONFIG.keyboardSpeed * dt;
    camera.panPixels(-dx / length * speed, -dy / length * speed);
    invalidate();
  }
  if (pressed.size) keyboardFrame = requestAnimationFrame(keyboardStep);
  else previousFrame = 0;
}
function isEditing(target) {
  return target instanceof Element && !!target.closest('input, textarea, select, [contenteditable="true"]');
}
window.addEventListener('keydown', event => {
  if (isEditing(event.target)) return;
  if (event.key.startsWith('Arrow')) {
    event.preventDefault(); pressed.add(event.key);
    if (keyboardFrame === null) keyboardFrame = requestAnimationFrame(keyboardStep);
    return;
  }
  if (event.repeat) return;
  const shortcuts = { '1':'conveyor', '2':'drill', '3':'smelter', '4':'generator', v:'select', x:'erase' };
  if (shortcuts[event.key.toLowerCase()]) setTool(shortcuts[event.key.toLowerCase()]);
  if (event.key.toLowerCase() === 'r') { rotation = (rotation+1)%4; paint=null; invalidate(); }
  if (event.key === 'Escape') { finishStroke(false); setTool('select'); }
});
window.addEventListener('keyup', event => { pressed.delete(event.key); if (event.key.startsWith('Arrow')) event.preventDefault(); });
window.addEventListener('blur', () => { pressed.clear(); previousFrame=0; });

new ResizeObserver(() => {
  const rect = svg.getBoundingClientRect();
  camera.resize(rect.width,rect.height);
  invalidate();
}).observe(svg);

toolButtons.forEach(button => button.addEventListener('click', () => setTool(button.dataset.tool)));
ownerButtons.forEach(button => button.addEventListener('click', () => {
  activeOwner = button.dataset.owner === 'neutral' ? null : button.dataset.owner;
  if (selectedId !== null) world.setOwner(selectedId, activeOwner);
  for (const element of ownerButtons) {
    const active = element.dataset.owner === (activeOwner ?? 'neutral');
    element.classList.toggle('active',active);
    element.setAttribute('aria-pressed',String(active));
  }
  byId('nation-status').textContent = nationLabel(activeOwner);
  byId('nation-status').style.setProperty('--nation-color', nationColor(activeOwner));
  invalidate();
}));
byId('show-links').addEventListener('click',event => {
  showLinks = !showLinks;
  event.currentTarget.setAttribute('aria-pressed',String(showLinks));
  event.currentTarget.textContent = `↗ 자원 연결 ${showLinks ? 'ON' : 'OFF'}`;
  invalidate();
});
byId('touch-draw').addEventListener('click',event => {
  touchDraw = !touchDraw;
  finishStroke(false);
  event.currentTarget.setAttribute('aria-pressed',String(touchDraw));
  event.currentTarget.textContent = `✎ 터치 경로 건설 ${touchDraw ? 'ON' : 'OFF'}`;
  invalidate();
});
byId('example').addEventListener('click', () => {
  // Resource flow prototype: drill -> east-bound belts -> receiving smelter.
  world.batch(() => {
    world.place('drill',-4,-1,0,activeOwner);
    world.place('smelter',0,0,0,activeOwner);
    world.place('generator',3,0,0,activeOwner);
    commitConveyorRoute(world,planConveyorRoute(world,[{x:-2,y:0},{x:-1,y:0}],3),activeOwner);
  });
  camera.reset(); setTool('select'); invalidate();
});
byId('rotate').addEventListener('click',()=>{rotation=(rotation+1)%4;finishStroke(false);invalidate();});
byId('reset').addEventListener('click',()=>{camera.reset();hoverPoint=null;invalidate();});
ui.drillResource.addEventListener('change', event => {
  if (selectedId !== null) world.setDrillResource(selectedId,event.target.value);
  invalidate();
});
byId('toggle-building').addEventListener('click', () => {
  const selected=world.structures.get(selectedId);
  if (selected) world.setEnabled(selected.id,!selected.enabled);
  invalidate();
});
byId('damage-building').addEventListener('click', () => {
  if (selectedId !== null && world.damageStructure(selectedId,25) === 0) selectedId=null;
  invalidate();
});

let lastTick = performance.now();
setInterval(() => {
  const now = performance.now(), dt = Math.min(.5, (now-lastTick)/1000);
  lastTick = now;
  if (industry.step(dt)) invalidate();
}, 200);

setTool('select');
