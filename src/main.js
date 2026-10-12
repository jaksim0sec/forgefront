import { Camera, CAMERA_CONFIG } from './camera.js';
import { World, STRUCTURES, worldToTile, rotatedSize } from './world.js';
import { BuildingRenderer, installSprites } from './render.js';
import { ItemConnections } from './connections.js';
import { Industry } from './industry.js';
import { extendRoute, planConveyorRoute, commitConveyorRoute } from './routes.js';
import { NATIONS, nationLabel, nationColor } from './nations.js';
import { RESOURCES } from './resources.js';
import { Terrain } from './terrain.js';
import { TerrainRenderer } from './terrain-render.js';
import { RECIPES, BUILD_COSTS } from './progression.js';

const svg = document.getElementById('world');
const camera = new Camera();
const world = new World();
world.terrain = new Terrain();
// Starting faction core offers only minimal power.
world.place('tower', 0, -1, 0, 'north');
world.place('leadCollector', -1, 0, 0, 'north');
world.survival = true;
const connections = new ItemConnections(world);
const industry = new Industry(world, connections);
installSprites(svg);
const buildings = new BuildingRenderer(svg, world, camera, connections);
const terrainVisual = new TerrainRenderer(svg, world.terrain, camera);

const byId = id => document.getElementById(id);
// The main toolbox retains its three essential tools while collapsed.
for (const [id, title] of [['toolbox-panel','건설 도구']]) {
  const panel = byId(id);
  if (!panel) continue;
  panel.classList.add('foldable-panel');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'panel-fold-toggle';
  button.setAttribute('aria-label', title + ' 접기');
  button.setAttribute('aria-expanded', 'true');
  button.textContent = '−';
  button.addEventListener('click', () => setPanelCollapsed(panel, !panel.classList.contains('panel-collapsed')));
  panel.prepend(button);
}
function setPanelCollapsed(panel, collapsed) {
  if (!panel) return;
  panel.classList.toggle('panel-collapsed', collapsed);
  const button = panel.querySelector('.panel-fold-toggle');
  if (button) {
    button.textContent = collapsed ? '+' : '−';
    button.setAttribute('aria-expanded', String(!collapsed));
    button.setAttribute('aria-label', (panel.getAttribute('aria-label') ?? '창') + (collapsed ? ' 펼치기' : ' 접기'));
  }
}
function dismissAuxiliaryPanels() {
  byId('build-inspector').hidden = true;
  byId('selected-detail').hidden = true;
}
document.addEventListener('pointerdown', event => {
  if (event.target.closest('.foldable-panel') || event.target.closest('button, select, input')) return;
  dismissAuxiliaryPanels();
}, {capture:true});
const ui = {
  tile: byId('tile-coords'), count: byId('structure-count'),
  chunks: byId('chunk-count'), selected: byId('selected-info'),
  rotation: byId('rotation'), links: byId('link-count'),
  hp: byId('selected-health'), stock: byId('selected-stock'),
  status: byId('selected-status'), drillResource: byId('drill-resource'),
  resourcePicker: byId('resource-picker'),
  power: byId('power-summary'), powerDetail: byId('selected-power'),
  production: byId('selected-production'), message: byId('build-message'),
};
let tool = 'select', rotation = 0, selectedId = null;
let activeOwner = 'north', hoverPoint = null, showLinks = true;
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
for (const ownerButton of ownerButtons) {
  const active = ownerButton.dataset.owner === activeOwner;
  ownerButton.classList.toggle('active', active);
  ownerButton.setAttribute('aria-pressed', String(active));
}
byId('nation-status').textContent = nationLabel(activeOwner);
byId('nation-status').style.setProperty('--nation-color', nationColor(activeOwner));
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
  const quantity = document.createElement('span');
  quantity.className = 'stock-count';
  quantity.id = 'stock-' + r.id;
  quantity.textContent = '0';
  chip.appendChild(quantity);
  chip.title = r.label;
  resourceList.appendChild(chip);
  if (r.id === 'iron' || r.id === 'coal') {
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
function snappedTile(tile, kind = tool) {
  const def = STRUCTURES[kind];
  if (!def) return { x: tile.x, y: tile.y };
  const size = rotatedSize(def, rotation);
  // Center on the hovered tile. Even footprints bias half a tile up/left.
  return { x: tile.x - Math.floor((size.width - 1) / 2),
           y: tile.y - Math.floor((size.height - 1) / 2) };
}
function previewForStroke(stroke) {
  return stroke?.kind === 'conveyor' ? { route: stroke.route, plan: planConveyorRoute(world, stroke.route, rotation) } : null;
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
  const hoverTile = hoverPoint ? (STRUCTURES[tool] && tool !== 'conveyor' ? snappedTile(hitTile(hoverPoint)) : hitTile(hoverPoint)) : null;
  terrainVisual.draw();
  buildings.draw(tool, hoverTile, rotation, selectedId, showLinks, previewForStroke(paint), activeOwner);
  const area = byId('erase-preview');
  if (paint?.kind === 'erase') {
    const a = paint.route[0], b = paint.route.at(-1);
    const minX = Math.min(a.x,b.x), minY = Math.min(a.y,b.y);
    const maxX = Math.max(a.x,b.x)+1, maxY = Math.max(a.y,b.y)+1;
    const p = camera.worldToScreen(minX * CAMERA_CONFIG.tileSize,minY * CAMERA_CONFIG.tileSize);
    const q = camera.worldToScreen(maxX * CAMERA_CONFIG.tileSize,maxY * CAMERA_CONFIG.tileSize);
    for (const [key,value] of Object.entries({x:p.x,y:p.y,width:q.x-p.x,height:q.y-p.y})) area.setAttribute(key,value);
    area.setAttribute('visibility','visible');
  } else area.setAttribute('visibility','hidden');
  const oreAtHover = hoverTile ? world.terrain.oreAt(hoverTile.x, hoverTile.y) : null;
  ui.tile.textContent = hoverTile ?
    `[${hoverTile.x}, ${hoverTile.y}]${oreAtHover ? ' · ' + RESOURCES[oreAtHover].label : ''}` : '—';
  ui.count.textContent = world.structures.size;
  ui.chunks.textContent = world.chunks.size;
  ui.links.textContent = connections.linkCount;
  ui.power.textContent = `${industry.power.supply} 공급 / ${industry.power.demand} 필요`;
  const wallet = world.walletFor(activeOwner);
  for (const id of Object.keys(RESOURCES)) {
    const node = byId('stock-' + id);
    const quantity = wallet[id] ?? 0;
    node.textContent = quantity;
    node.classList.toggle('positive', quantity > 0);
  }
  ui.rotation.textContent = rotation * 90 + '°';
  const selected = world.structures.get(selectedId);
  const powerRadius = byId('power-radius');
  const source = selected && (selected.type === 'tower' || selected.type === 'generator' ? selected : world.structures.get(selected.powerSourceId));
  const activeSource = source && (source.type === 'tower' || source.burnRemaining > 0);
  if (activeSource) {
    const pos = camera.worldToScreen((source.x + source.width / 2) * CAMERA_CONFIG.tileSize, (source.y + source.height / 2) * CAMERA_CONFIG.tileSize);
    powerRadius.setAttribute('cx', pos.x); powerRadius.setAttribute('cy', pos.y);
    powerRadius.setAttribute('r', (source.type === 'tower' ? 10 : 18) * CAMERA_CONFIG.tileSize * camera.zoom);
    powerRadius.setAttribute('visibility', 'visible');
  } else powerRadius.setAttribute('visibility','hidden');
  ui.selected.textContent = selected ?
    `${STRUCTURES[selected.type].label} #${selected.id} · ${nationLabel(selected.ownerId)}` :
    (tool === 'select' ? '타일 또는 건물을 선택해 봐' : tool === 'erase' ? '건물 철거 모드' :
      `${STRUCTURES[tool].label} 설치 모드`);
  ui.hp.textContent = selected ? `${selected.health} / ${selected.maxHealth}` : '—';
  const recipeState = selected && RECIPES[selected.type];
  const missingMaterials = recipeState ? Object.entries(recipeState.inputs)
    .filter(([id, qty]) => (selected.inventory?.[id] ?? 0) < qty)
    .map(([id, qty]) => `${RESOURCES[id]?.label ?? id} ${qty - (selected.inventory?.[id] ?? 0)}`) : [];
  const finishedCount = recipeState ? (selected.inventory?.[recipeState.output] ?? 0) : 0;
  const stateLabels = {
    idle:'대기 중', mining:'채굴 중', processing:'생산 중', generating:'발전 중',
    transporting:'운송 중', receiving:'자원 수령 중', blocked:'출력 막힘 / 저장 공간 부족',
    'no-power':'전력 부족', 'no-coal':'석탄 부족', 'no-ore':'광맥 없음',
    'waiting-input':'재료 부족'
  };
  ui.status.textContent = selected ? (!selected.enabled ? '중지됨'
    : selected.activity === 'waiting-input' && missingMaterials.length ? '재료 부족 · ' + missingMaterials.join(', ')
    : selected.activity === 'blocked' && finishedCount ? '완성품 ' + finishedCount + '개 · 배출 경로 확인'
    : stateLabels[selected.activity] ?? selected.activity) : '—';
  ui.powerDetail.textContent = selected ? (
    selected.type === 'tower' ? '기본 출력 3' :
    selected.type === 'generator' ? (selected.burnRemaining > 0 ? '석탄 발전 중' : '석탄 필요') :
    selected.powerUse ? `${selected.powerUse} 필요 · ${selected.powered ? '공급 중' : ({capacity:'전력 용량 부족',range:'공급 범위 밖',source:'가동 중인 같은 국가 발전원 없음'}[selected.powerReason] ?? '전력 부족')}` : '불필요'
  ) : '—';
  const recipe = selected ? RECIPES[selected.type] : null;
  ui.production.textContent = !selected ? '—' :
    recipe ? `${RESOURCES[recipe.output].label} · ${Math.min(100, Math.floor(100 * (selected.progress ?? 0) / recipe.seconds))}% ${finishedCount ? '· 완성품 ' + finishedCount + '개' : ''}` :
    selected.resourceId ? `${RESOURCES[selected.resourceId].label} 채집` : '—';
  const stocked = (selected?.type === 'conveyor' || selected?.type === 'junction') ?
    (selected.itemId ? [[selected.itemId, selected.itemCount]] : []) :
    Object.entries(selected?.type === 'tower' ? world.walletFor(selected.ownerId) :
      selected?.inventory ?? {}).filter(([k,v]) => v > 0);
  ui.stock.textContent = stocked.length ? stocked.map(([k,v])=>`${RESOURCES[k]?.label ?? k} ${v}`).join(' · ') : '재고 없음';
  ui.resourcePicker.hidden = selected?.type !== 'drill';
  if (selected?.type === 'drill') ui.drillResource.value = selected.resourceId;
  byId('selected-detail').hidden = !selected;
}
const BUILD_DESCRIPTIONS = Object.freeze({
  conveyor:'단방향 자원 운송 벨트. 드래그로 연속 설치하고 모서리는 자동으로 연결돼.',
  junction:'서로 다른 벨트 경로의 자원을 기계에도 분배해.',
  leadCollector:'지표에서 납을 채집하는 기본 시설. 전기가 필요 없어.',
  drill:'철·석탄 광맥에서 자원을 채굴하는 기본 드릴.',
  smelter:'납과 철을 제련해 발전 설비 제작에 필요한 금속 부품을 생산해.',
  generator:'석탄을 태워 주변 고전력 산업 시설에 전기를 공급해.',
  poweredDrill:'석탄과 전기를 소비해 티타늄 광맥을 채굴하는 고급 장비.',
  siliconPlant:'철과 석탄을 가공해 실리콘을 생산해.',
  superconductorPlant:'철·석탄·실리콘과 전력으로 초전도체를 합성해.',
});
function showBuildInfo(type) {
  const panel = byId('build-inspector');
  if (!STRUCTURES[type]) { panel.hidden = true; return; }
  const def = STRUCTURES[type], cost = BUILD_COSTS[type] ?? {};
  panel.hidden = false;
  byId('build-preview-sprite').setAttribute('href', '#s-' + type);
  byId('build-preview-name').textContent = def.label;
  byId('build-preview-description').textContent = BUILD_DESCRIPTIONS[type] ?? '산업용 구조물';
  byId('build-preview-size').textContent = def.width + ' × ' + def.height;
  byId('build-preview-health').textContent = String(def.maxHealth);
  byId('build-preview-cost').textContent = Object.keys(cost).length ?
    Object.entries(cost).map(([id,amount])=> (RESOURCES[id]?.label ?? id) + ' ' + amount).join(' · ') : '무료';
  byId('build-preview-power').textContent = def.powerUse ? def.powerUse + ' 필요' :
    def.powerOutput ? def.powerOutput + ' 공급' : '없음';
}
function setupBuildThumbnails() {
  for (const button of toolButtons) {
    const type = button.dataset.tool;
    const label = button.textContent.trim().replace(/[0-9VX]$/,'').trim();
    if (STRUCTURES[type]) {
      const icon = button.querySelector('.tool-icon');
      if (icon) icon.remove();
      const sprite = document.createElementNS('http://www.w3.org/2000/svg','svg');
      sprite.setAttribute('viewBox','0 0 100 100');
      sprite.setAttribute('class','build-mini');
      const use = document.createElementNS('http://www.w3.org/2000/svg','use');
      use.setAttribute('href','#s-'+type);
      use.setAttribute('width','100');
      use.setAttribute('height','100');
      sprite.appendChild(use);
      button.prepend(sprite);
    }
    const key = button.querySelector('kbd');
    const caption = document.createElement('span');
    caption.className = 'tool-label';
    const text = [...button.childNodes].filter(x=>x.nodeType===Node.TEXT_NODE).map(x=>x.textContent).join('').trim();
    caption.textContent = text || label;
    for (const node of [...button.childNodes]) if (node.nodeType===Node.TEXT_NODE) node.remove();
    if (key) button.insertBefore(caption,key); else button.appendChild(caption);
  }
}
setupBuildThumbnails();

function setTool(next) {
  if (next !== 'select' && next !== 'erase' && !STRUCTURES[next]) return;
  tool = next;
  showBuildInfo(next);
  paint = null;
  selectedId = null;
  for (const button of toolButtons) {
    const active = button.dataset.tool === tool;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
  const cost = BUILD_COSTS[tool];
  ui.message.textContent = cost != null
    ? (Object.keys(cost).length
      ? '건설비: ' + Object.entries(cost).map(([id, qty]) => `${RESOURCES[id]?.label ?? id} ${qty}`).join(' · ')
      : '기본 건설비 없음')
    : '';
  invalidate();
}
function notifyBuild(result, type) {
  if (result?.ok) { ui.message.textContent = ''; return; }
  const reasons = {
    ore: '해당 자원 광맥 위에 설치해야 해',
    bounds: '맵 범위 밖이야',
    occupied: '건물이 이미 점유한 공간이야',
    restricted: '전기 타워는 점령으로만 확보할 수 있어',
    materials: '국가 비축 물자가 부족해',
  };
  const cost = result?.cost ?? BUILD_COSTS[type];
  const wallet = world.walletFor(activeOwner);
  const missing = result?.reason === 'materials' && cost ?
    Object.entries(cost).filter(([id,amount]) => (wallet[id] ?? 0) < amount)
      .map(([id,amount])=>`${RESOURCES[id]?.label ?? id} ${amount - (wallet[id] ?? 0)}`).join(', ') : '';
  ui.message.textContent = (reasons[result?.reason] ?? '설치할 수 없는 위치야') +
    (missing ? ' · 부족: ' + missing : '');
}
function actionAt(point, alternate = false) {
  const tile = hitTile(point);
  if (alternate || tool === 'erase') {
    const entity = world.getAt(tile.x, tile.y);
    if (entity) { world.remove(entity.id); if (selectedId === entity.id) selectedId = null; }
  } else if (tool === 'conveyor') {
    notifyBuild(commitConveyorRoute(world, planConveyorRoute(world, [tile], rotation), activeOwner), 'conveyor');
  } else if (STRUCTURES[tool]) {
    const anchor = snappedTile(tile);
    const created = world.build(tool, anchor.x, anchor.y, rotation, activeOwner);
    notifyBuild(created, tool);
    if (created.ok) selectedId = created.entity.id;
  } else { selectedId = world.getAt(tile.x, tile.y)?.id ?? null;

  }
  invalidate();
}
function startStroke(pointerId, point, isTouch) {
  paint = { pointerId, route: [{ ...hitTile(point) }], isTouch, kind: tool, lastAnchor: null };
  if (tool !== 'conveyor' && tool !== 'erase') paintStructure(point);
  invalidate();
}
function paintStructure(point) {
  if (!paint || paint.kind === 'conveyor' || paint.kind === 'erase') return;
  const anchor = snappedTile(hitTile(point), paint.kind);
  const size = rotatedSize(STRUCTURES[paint.kind], rotation);
  const previous = paint.lastTile ?? anchor;
  const dx = anchor.x - previous.x, dy = anchor.y - previous.y;
  const steps = Math.min(256, Math.max(Math.abs(dx), Math.abs(dy), 1));
  world.batch(() => {
    for (let i = 1; i <= steps; i++) {
      const x = previous.x + Math.round(dx * i / steps);
      const y = previous.y + Math.round(dy * i / steps);
      const last = paint.lastPlaced;
      // Avoid repeatedly attempting overlapping footprints during a drag.
      if (last && Math.abs(x - last.x) < size.width && Math.abs(y - last.y) < size.height) continue;
      const placed = world.build(paint.kind, x, y, rotation, activeOwner);
      if (!placed.ok) {
        if (!last || placed.reason !== 'occupied') notifyBuild(placed, paint.kind);
      } else {
        selectedId = placed.entity.id;
        paint.lastPlaced = { x, y };
      }
    }
  });
  paint.lastTile = anchor;
}

function extendStroke(point) {
  if (!paint) return;
  if (paint.kind === 'erase') { paint.route[1] = hitTile(point); invalidate(); return; }
  if (paint.kind !== 'conveyor') { paintStructure(point); invalidate(); return; }
  const tile = hitTile(point), last = paint.route.at(-1);
  if (last?.x === tile.x && last?.y === tile.y) return;
  extendRoute(paint.route, tile);
  invalidate();
}
function finishStroke(commit) {
  if (!paint) return;
  if (commit && paint.kind === 'erase') {
    const a = paint.route[0], b = paint.route.at(-1);
    const x0 = Math.min(a.x,b.x), x1 = Math.max(a.x,b.x);
    const y0 = Math.min(a.y,b.y), y1 = Math.max(a.y,b.y);
    const victims = new Set();
    for (let y = y0; y <= y1 && victims.size < 10000; y++) {
      for (let x = x0; x <= x1; x++) { const entity = world.getAt(x,y); if (entity) victims.add(entity.id); }
    }
    world.batch(() => { for (const id of victims) world.remove(id); });
    if (victims.has(selectedId)) selectedId = null;
  }
  if (commit && paint.kind === 'conveyor') {
    notifyBuild(commitConveyorRoute(world, planConveyorRoute(world, paint.route, rotation), activeOwner), 'conveyor');
  }
  paint = null;
  invalidate();
}

// Touch: tap to place, drag to pan, hold 350ms to begin drawing.
// A second finger cancels the stroke and switches to pinch.
const touches = new Map();
const taps = new Map();
let gesture = null;
const HOLD_MS = 350, HOLD_SLOP = 9;
let pendingHold = null;
function cancelHold() {
  if (pendingHold) clearTimeout(pendingHold.timer);
  pendingHold = null;
}
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
      cancelHold();
      if (paint?.isTouch) finishStroke(false);
    }
    touches.set(event.pointerId, point);
    svg.setPointerCapture(event.pointerId);
    taps.set(event.pointerId, { start: point, cancelled: touches.size > 1 });
    resetGesture();
    if (touches.size === 1 && (STRUCTURES[tool] || tool === 'erase')) {
      const pointerId = event.pointerId;
      const timer = setTimeout(() => {
        if (pendingHold?.pointerId !== pointerId || touches.size !== 1 || !taps.has(pointerId)) return;
        const current = touches.get(pointerId);
        if (Math.hypot(current.x - point.x, current.y - point.y) > HOLD_SLOP) return;
        taps.get(pointerId).cancelled = true;
        pendingHold = null;
        gesture = { ...current, type: 'draw' };
        startStroke(pointerId, current, true);
      }, HOLD_MS);
      pendingHold = { pointerId, timer };
    }
    hoverPoint = null;
  } else if (event.button === 0) {
    svg.setPointerCapture(event.pointerId);
    if (STRUCTURES[tool] || tool === 'erase') startStroke(event.pointerId, point, false);
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
  if (candidate && Math.hypot(point.x-candidate.start.x,point.y-candidate.start.y) > HOLD_SLOP) {
    candidate.cancelled = true;
    if (pendingHold?.pointerId === event.pointerId) cancelHold();
  }
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
  if (pendingHold?.pointerId === event.pointerId) cancelHold();
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
  if (pendingHold?.pointerId === event.pointerId) cancelHold();
  if (paint?.pointerId === event.pointerId) finishStroke(false);
  taps.delete(event.pointerId);
  if (touches.delete(event.pointerId)) resetGesture();
});
svg.addEventListener('pointerleave', event => { if (event.pointerType !== 'touch' && !paint) { hoverPoint = null; invalidate(); } });
svg.addEventListener('contextmenu', event => event.preventDefault());
window.addEventListener('blur', () => { cancelHold(); touches.clear(); taps.clear(); gesture = null; finishStroke(false); });

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
  const shortcuts = { '1':'conveyor', '2':'drill', '3':'smelter', '4':'generator', '5':'junction',
    '6':'leadCollector', '7':'poweredDrill', '8':'siliconPlant', '9':'superconductorPlant',
    v:'select', x:'erase' };
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
byId('example').addEventListener('click', () => {
  // Developer sample, not charged against the active faction's stockpile.
  const oldSurvival = world.survival;
  world.survival = false;
  try {
    world.batch(() => {
      world.place('drill', -8, 8, 0, activeOwner);
      const route = [];
      extendRoute(route, { x: -6, y: 8 });
      extendRoute(route, { x: 0, y: 8 });
      extendRoute(route, { x: 0, y: 1 });
      commitConveyorRoute(world, planConveyorRoute(world, route, 0), activeOwner);
    });
  } finally { world.survival = oldSurvival; }
  camera.x = -4 * CAMERA_CONFIG.tileSize;
  camera.y = 4 * CAMERA_CONFIG.tileSize;
  setTool('select');
  ui.message.textContent = '철 채굴 예시를 배치했어 · 건설비 미차감';
  invalidate();
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
