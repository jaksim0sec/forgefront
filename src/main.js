import { Camera, CAMERA_CONFIG } from './camera.js';
import { World, STRUCTURES, worldToTile, rotatedSize } from './world.js';
import { BuildingRenderer, installSprites } from './render.js';
import { ItemConnections } from './connections.js';
import { Industry } from './industry.js';
import { extendRoute, planConveyorRoute, commitConveyorRoute } from './routes.js';
import { buildTunnel, tunnelGeometry } from './underground.js';
import { startBuildStroke, buildStrokeStep } from './build-stroke.js';
import { nationLabel } from './nations.js';
import { RESOURCES } from './resources.js';
import { Terrain } from './terrain.js';
import { TerrainRenderer } from './terrain-render.js';
import { Territory } from './territory.js';
import { TerritoryRenderer } from './territory-render.js';
import { Combat } from './combat.js';
import { WEAPONS, isWall } from './defense.js';
import { CombatRenderer } from './combat-render.js';
import { CargoRenderer } from './cargo-renderer.js';
import { RECIPES, BUILD_COSTS } from './progression.js';

const svg = document.getElementById('world');
const camera = new Camera();
const world = new World();
world.terrain = new Terrain();
// Starting faction core offers only minimal power.
world.place('tower', 0, -1, 0, 'north');
// Rival command tower lays out a visible front line; AI combat is not active yet.
world.place('tower', 70, -25, 0, 'south');
world.place('leadCollector', -1, 0, 0, 'north');
world.survival = true;
const connections = new ItemConnections(world);
const industry = new Industry(world, connections);
const combat = new Combat(world);
installSprites(svg);
const buildings = new BuildingRenderer(svg, world, camera, connections);
const terrainVisual = new TerrainRenderer(svg, world.terrain, camera);
const territory = new Territory(world);
world.territory = territory;
const territoryVisual = new TerritoryRenderer(svg, territory, camera);
// Cargo visuals use one transparent Canvas, with the original SVG fallback.
const cargoRenderer = new CargoRenderer(svg, camera, RESOURCES);
world.subscribe(change => cargoRenderer.transfer(change, world));
const combatVisual = new CombatRenderer(svg, camera, world, combat);

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
let selectionDismissed = false;
function dismissAuxiliaryPanels() {
  selectionDismissed = true;
  byId('build-inspector').hidden = true;
  byId('selected-detail').hidden = true;
}
// Close auxiliary details only after an actual single-pointer outside tap.
// A second touch marks the entire gesture as a pinch, even when fingers land
// on different DOM targets. Panning / dragging does not dismiss panels.
const outsidePointers = new Map();
const activeOutsideTouches = new Set();
let outsideTouchGesture = false;
document.addEventListener('pointerdown', event => {
  if (event.pointerType === 'touch') {
    activeOutsideTouches.add(event.pointerId);
    if (activeOutsideTouches.size > 1) outsideTouchGesture = true;
  }
  outsidePointers.set(event.pointerId, {
    x:event.clientX, y:event.clientY,
    eligible:!event.target.closest('.foldable-panel, #build-inspector, #selected-detail, button, select, input'),
    touch:event.pointerType === 'touch',
    multi:outsideTouchGesture || activeOutsideTouches.size > 1,
    button:event.button
  });
  if (activeOutsideTouches.size > 1)
    for (const pointer of outsidePointers.values()) if (pointer.touch) pointer.multi = true;
}, {capture:true});
document.addEventListener('pointerup', event => {
  const pointer = outsidePointers.get(event.pointerId);
  outsidePointers.delete(event.pointerId);
  if (pointer?.touch) {
    activeOutsideTouches.delete(event.pointerId);
    if (!activeOutsideTouches.size) outsideTouchGesture = false;
  }
  if (!pointer || !pointer.eligible || pointer.multi || (pointer.button !== 0 && !pointer.touch)) return;
  if (Math.hypot(event.clientX-pointer.x,event.clientY-pointer.y) > 10) return;
  dismissAuxiliaryPanels();
}, {capture:true});
function cancelOutsidePointer(event) {
  outsidePointers.delete(event.pointerId);
  if (activeOutsideTouches.delete(event.pointerId) && !activeOutsideTouches.size)
    outsideTouchGesture = false;
}
document.addEventListener('pointercancel',cancelOutsidePointer,{capture:true});
window.addEventListener('blur',()=>{
  outsidePointers.clear();activeOutsideTouches.clear();outsideTouchGesture=false;
});
const ui = {
  tile: byId('tile-coords'), count: byId('structure-count'),
  chunks: byId('chunk-count'), selected: byId('selected-info'),
  rotation: byId('rotation'), links: byId('link-count'),
  hp: byId('selected-health'), stock: byId('selected-stock'),
  status: byId('selected-status'), drillResource: byId('drill-resource'),
  resourcePicker: byId('resource-picker'),
  power: byId('power-summary'), powerDetail: byId('selected-power'),
  territoryDetail: byId('selected-territory'),
  production: byId('selected-production'), message: byId('build-message'),
};
let tool = 'select', rotation = 0, selectedId = null;
let activeOwner = 'north', hoverPoint = null, showLinks = true;
const toolButtons = [...document.querySelectorAll('[data-tool]')];
let recentStructure = 'drill';
const quickSelect = document.createElement('button');
quickSelect.type='button';
quickSelect.className='quick-select';
quickSelect.textContent='⌖ 선택';
quickSelect.setAttribute('aria-label','선택 도구');
quickSelect.addEventListener('click',()=>setTool('select'));
// The same quick controls remain mounted whether the drawer is folded or open.
const toolbox = byId('toolbox-panel');
const quickBar=document.createElement('div');
quickBar.className='collapsed-top-row';
quickBar.append(quickSelect,toolbox.querySelector('.panel-fold-toggle'));
toolbox.prepend(quickBar);
const shortcuts=document.createElement('div');
shortcuts.className='collapsed-shortcuts';
const recentButton=document.createElement('button');
recentButton.type='button';recentButton.className='recent-tool-shortcut';
recentButton.addEventListener('click',()=>setTool(recentStructure));
shortcuts.append(recentButton);
for(const [id,label] of [['conveyor','컨베이어'],['erase','철거']]){
  const button=document.createElement('button');
  button.type='button';button.className='shortcut-'+id;
  button.innerHTML='<span class="shortcut-symbol">'+(id==='erase'?'×':'⇥')+'</span><span>'+label+'</span>';
  button.addEventListener('click',()=>setTool(id));
  shortcuts.append(button);
}
toolbox.querySelector('.tool-list').before(shortcuts);
// Keep the primary toolbar fixed. Only the content below it expands/scrolls.
const paletteDetails = document.createElement('div');
paletteDetails.className = 'palette-details';
for (let child = shortcuts.nextSibling; child;) {
  const next = child.nextSibling;
  paletteDetails.appendChild(child);
  child = next;
}
toolbox.appendChild(paletteDetails);
toolbox.querySelector('.toolbox-heading')?.remove();
function refreshRecentShortcut(){
  recentButton.replaceChildren();
  const original=toolButtons.find(button=>button.dataset.tool===recentStructure);
  const icon=original?.querySelector('.build-mini');
  if(icon)recentButton.append(icon.cloneNode(true));
  const label=document.createElement('span');
  label.textContent=STRUCTURES[recentStructure]?.label??'최근 건물';
  recentButton.append(label);
  recentButton.setAttribute('aria-label','최근 건물: '+label.textContent);
}


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
  return stroke?.kind === 'conveyor' ? { route: stroke.route, plan: planConveyorRoute(world, stroke.route, rotation, activeOwner) } : null;
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
  territoryVisual.draw();
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
  const groundAtHover = hoverTile ? world.terrain.groundAt(hoverTile.x, hoverTile.y) : null;
  const terrainLabels = { plain: '평원', scrub: '초지', basin: '저지대', rock: '암반', ridge: '산지', cliff: '⛔ 절벽' };
  const territoryAtHover = hoverTile ? territory.ownerAt(hoverTile.x, hoverTile.y) : null;
  ui.tile.textContent = hoverTile ?
    `[${hoverTile.x}, ${hoverTile.y}] · ${terrainLabels[groundAtHover.biome]} ${Math.round(groundAtHover.height * 100)} · ${territoryAtHover ? nationLabel(territoryAtHover) + ' 영토' : '무주지'}${oreAtHover ? ' · ' + RESOURCES[oreAtHover].label : ''}` : '—';
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
  const weaponRadius = byId('weapon-radius');
  if (selected && WEAPONS[selected.type]) {
    const origin = camera.worldToScreen((selected.x + selected.width / 2) * CAMERA_CONFIG.tileSize,
      (selected.y + selected.height / 2) * CAMERA_CONFIG.tileSize);
    weaponRadius.setAttribute('cx', origin.x);
    weaponRadius.setAttribute('cy', origin.y);
    weaponRadius.setAttribute('r', WEAPONS[selected.type].range * CAMERA_CONFIG.tileSize * camera.zoom);
    weaponRadius.setAttribute('visibility', 'visible');
  } else weaponRadius.setAttribute('visibility','hidden');
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
    (tool === 'select' ? '타일 또는 건물을 선택하세요.' : tool === 'erase' ? '건물 철거 모드' :
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
    selected.resourceId ? `${RESOURCES[selected.resourceId].label} 채집` :
    WEAPONS[selected.type] ? `사거리 ${WEAPONS[selected.type].range}칸 · 피해 ${WEAPONS[selected.type].damage} · ${selected.powered ? '방어 준비' : '전력 대기'}` :
    isWall(selected.type) ? '지상 침입자 차단 · 내구도 기반' :
    selected.type === 'warehouse' ? `저장 ${Object.values(selected.inventory??{}).reduce((a,b)=>a+b,0)}/${STRUCTURES.warehouse.itemCapacity}` : '—';
  const stocked = (selected?.type === 'conveyor' || selected?.type === 'junction') ?
    (selected.itemId ? [[selected.itemId, selected.itemCount]] : []) :
    Object.entries(selected?.type === 'tower' ? world.walletFor(selected.ownerId) :
      selected?.inventory ?? {}).filter(([k,v]) => v > 0);
  ui.stock.textContent = stocked.length ? stocked.map(([k,v])=>`${RESOURCES[k]?.label ?? k} ${v}`).join(' · ') : '재고 없음';
  const occupying = selected && territory.ownerAt(
    Math.floor(selected.x + selected.width / 2), Math.floor(selected.y + selected.height / 2));
  ui.territoryDetail.textContent = selected?.type === 'tower'
    ? `${nationLabel(selected.ownerId)} · 영향 반경 22칸`
    : selected ? (occupying ? nationLabel(occupying) + ' 영토' : '무주지') : '—';
  ui.resourcePicker.hidden = selected?.type !== 'drill';
  if (selected?.type === 'drill') ui.drillResource.value = selected.resourceId;
  byId('selected-detail').hidden = !selected || selectionDismissed;
}
const BUILD_DESCRIPTIONS = Object.freeze({
  conveyor:'단방향 자원 운송 벨트. 드래그로 연속 설치하고 모서리는 자동으로 연결돼.',
  junction:'서로 다른 벨트 경로의 자원을 기계에도 분배해.',
  tunnelEntrance:'매설 수송 통로. 시작과 끝을 지정해 지상 시설 아래로 물자를 운반해.' ,
  leadCollector:'지표에서 납을 채집하는 기본 시설. 전기가 필요 없어.',
  drill:'철·석탄 광맥에서 자원을 채굴하는 기본 드릴.',
  smelter:'납과 철을 제련해 발전 설비 제작에 필요한 금속 부품을 생산해.',
  generator:'석탄을 태워 주변 고전력 산업 시설에 전기를 공급해.',
  turret:'정밀 구동 포탑. 전력을 공급받아 일정 거리의 적을 추적해.',
  scatterTurret:'근거리 광역 방어 장치. 넓은 탄착으로 밀집한 적을 제압해.',
  heavyTurret:'고하중 포신과 정밀 구동축으로 멀리 있는 적에 강한 타격을 가해.',
  wall:'간단한 조립식 차단벽. 지상 침입자의 이동을 막아.',
  ironWall:'주철로 보강한 중형 방벽. 장시간 방어에 적합해.',
  reinforcedWall:'복합 장갑판을 적용한 고내구 방벽.',
  warehouse:'여러 종류의 자원을 한곳에 보관하고 컨베이어에 다시 공급해.',
  poweredDrill:'석탄과 전기를 소비해 티타늄 광맥을 채굴하는 고급 장비.',
  siliconPlant:'철과 석탄을 가공해 실리콘을 생산해.',
  superconductorPlant:'철·석탄·실리콘과 전력으로 초전도체를 합성해.',
});
function resourceCostNode(id, amount, available) {
  const resource = RESOURCES[id];
  const chip = document.createElement('span');
  chip.className = 'cost-chip' + (available < amount ? ' missing' : '');
  const image = document.createElement('img');
  image.src = resource?.icon ?? '';
  image.alt = resource?.label ?? id;
  const label = document.createElement('span');
  label.textContent = resource?.label ?? id;
  const value = document.createElement('strong');
  value.textContent = String(amount);
  chip.append(image, label, value);
  chip.title = `${resource?.label ?? id} ${amount}개 필요 · 보유 ${available}개`;
  return chip;
}
function fillCost(container, cost) {
  container.replaceChildren();
  if (!cost) {
    container.textContent = '점령 전용';
    return;
  }
  if (!Object.keys(cost).length) {
    container.textContent = '무료';
    return;
  }
  const wallet = world.walletFor(activeOwner);
  for (const [id, amount] of Object.entries(cost))
    container.appendChild(resourceCostNode(id,amount,wallet[id] ?? 0));
}
function previewResourceChip(id, amount, context) {
  const resource = RESOURCES[id];
  if (!resource) return null;
  const chip = document.createElement('span');
  chip.className = 'preview-resource-chip';
  chip.title = resource.label + (amount ? ' · ' + amount : '') + (context ? ' · ' + context : '');
  chip.setAttribute('aria-label', chip.title);
  const image = document.createElement('img');
  image.src = resource.icon;
  image.alt = resource.label;
  chip.appendChild(image);
  if (amount) {
    const number = document.createElement('strong');
    number.textContent = String(amount);
    chip.appendChild(number);
  }
  return chip;
}
function fillPreviewFlow(id, rowId, items) {
  const container = byId(id);
  container.replaceChildren();
  for (const item of items) {
    const node = previewResourceChip(item.id, item.amount, item.context);
    if (node) container.appendChild(node);
  }
  byId(rowId).hidden = !container.childElementCount;
}
function showBuildInfo(type) {
  const panel = byId('build-inspector');
  if (!STRUCTURES[type]) { panel.hidden = true; return; }
  const def = STRUCTURES[type], recipe = RECIPES[type];
  panel.hidden = false;
  byId('build-preview-sprite').setAttribute('href','#s-' + type);
  byId('build-preview-name').textContent = def.label;
  byId('build-preview-description').textContent = BUILD_DESCRIPTIONS[type] ?? '산업용 구조물';
  byId('build-preview-size').textContent = def.width + '×' + def.height;
  byId('build-preview-health').textContent = 'HP ' + def.maxHealth;
  fillCost(byId('build-preview-cost'), BUILD_COSTS[type]);

  let inputs = recipe ? Object.entries(recipe.inputs).map(([id, amount]) => ({ id, amount })) : [];
  let outputs = recipe ? [{ id:recipe.output, amount:recipe.amount + '/' + recipe.seconds + '초' }] : [];
  if (type === 'generator') inputs = [{id:'coal',amount:'1/8초'}];
  if (type === 'poweredDrill') inputs = [{id:'coal',amount:'1/3회'}];
  if (type === 'leadCollector') outputs = [{id:'lead',amount:def.itemsPerSecond + '/초'}];
  if (type === 'drill') outputs = [
    {id:'iron',context:'광맥에 따라 선택'},
    {id:'coal',context:'광맥에 따라 선택'}
  ];
  if (type === 'poweredDrill') outputs = [{id:'titanium',amount:def.itemsPerSecond + '/초'}];
  fillPreviewFlow('build-preview-inputs','build-preview-input-row',inputs);
  fillPreviewFlow('build-preview-outputs','build-preview-output-row',outputs);

  const usesPower = !!def.powerUse, producesPower = !!def.powerOutput;
  const powerRow = byId('build-preview-power-row');
  powerRow.hidden = !usesPower && !producesPower;
  byId('build-preview-power').textContent = usesPower ? '⚡ ' + def.powerUse + ' 소비' : producesPower ? '⚡ +' + def.powerOutput + ' 공급' : '';

  const effect = byId('build-preview-effect');
  const description = WEAPONS[type] ? '사거리 ' + WEAPONS[type].range + '칸 · 피해 ' + WEAPONS[type].damage + ' / ' + WEAPONS[type].secondsPerShot + '초'
    : type === 'drill' ? '광맥별 철 또는 석탄 · ' + def.itemsPerSecond + '/초'
    : type === 'conveyor' ? '단방향 자원 이동'
    : type === 'warehouse' ? '보관 한도 ' + def.itemCapacity + ' · 자동 입출고'
    : isWall(type) ? '지상 침입자 차단 · 내구도 ' + def.maxHealth
    : '';
  effect.textContent = description;
  effect.hidden = !description;
}
const TOOL_GROUPS = Object.freeze([
  {label:'물류', icon:'<path d="M4 8h13m-4-4 4 4-4 4M7 16h13m-4-4 4 4-4 4"/>',
    types:['conveyor','junction','warehouse']},
  {label:'방어', icon:'<path d="M12 3 20 6v6c0 5-3 8-8 9-5-1-8-4-8-9V6l8-3Z"/><path d="m9 12 2 2 4-4"/>',
    types:['turret','scatterTurret','heavyTurret','wall','ironWall','reinforcedWall']},
  {label:'채굴', icon:'<path d="m5 19 13-13M9 5l10 10M4 19h16"/>',
    types:['leadCollector','drill','poweredDrill']},
  {label:'생산', icon:'<path d="M3 20V9l6 4V9l6 4V5h6v15Z"/><path d="M7 17h2m3 0h2m3 0h2"/>',
    types:['smelter','siliconPlant','superconductorPlant']},
  {label:'전력', icon:'<path d="m13 2-8 11h7l-1 9 8-12h-7l1-8Z"/>',
    types:['generator']},
]);
function setBuildCategory(grid) {
  if (!grid) return;
  const list = grid.closest('.tool-list');
  if (!list) return;
  for (const current of list.querySelectorAll('.tool-group-grid'))
    current.hidden = current !== grid;
  for (const tab of list.querySelectorAll('.tool-group-title')) {
    const active = tab.getAttribute('aria-controls') === grid.id;
    tab.setAttribute('aria-selected',String(active));
    tab.setAttribute('tabindex', active ? '0' : '-1');
  }
}
function setupBuildThumbnails() {
  const list = toolbox.querySelector('.tool-list');
  const tabs = document.createElement('div');
  tabs.className = 'tool-categories';
  tabs.setAttribute('role','tablist');
  tabs.setAttribute('aria-label','건설 종류');
  const groups = new Map();
  const grids = [];
  TOOL_GROUPS.forEach(({label,icon,types},index) => {
    const tab = document.createElement('button');
    tab.type='button';
    tab.className='tool-group-title';
    tab.setAttribute('role','tab');
    tab.setAttribute('aria-selected', String(index===0));
    tab.setAttribute('aria-controls','build-category-'+index);
    tab.setAttribute('tabindex',index===0?'0':'-1');
    const svgIcon=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svgIcon.setAttribute('viewBox','0 0 24 24');
    svgIcon.setAttribute('fill','none');
    svgIcon.setAttribute('stroke','currentColor');
    svgIcon.setAttribute('stroke-linecap','round');
    svgIcon.setAttribute('stroke-linejoin','round');
    svgIcon.setAttribute('aria-hidden','true');
    svgIcon.innerHTML=icon;
    const name=document.createElement('span');
    name.textContent=label;
    tab.append(svgIcon,name);
    tabs.appendChild(tab);
    const grid = document.createElement('div');
    grid.className='tool-group-grid';
    grid.id='build-category-'+index;
    grid.setAttribute('role','tabpanel');
    grid.hidden=index!==0;
    tab.addEventListener('click',()=>setBuildCategory(grid));
    grids.push(grid);
    if (label === '방어') {
      for (const [sectionName, sectionTypes] of [
        ['포탑',['turret','scatterTurret','heavyTurret']],
        ['방벽',['wall','ironWall','reinforcedWall']],
      ]) {
        const section = document.createElement('section');
        section.className = 'defense-section';
        const heading = document.createElement('div');
        heading.className = 'defense-heading';
        heading.textContent = sectionName;
        const items = document.createElement('div');
        items.className = 'defense-section-items';
        section.append(heading,items);
        grid.appendChild(section);
        sectionTypes.forEach(type=>groups.set(type,items));
      }
    }
    types.forEach(type=>{ if(!groups.has(type)) groups.set(type,grid); });
  });
  // Keyboard users can move between the category tabs without jumping
  // focus into the map; mouse/touch use the same buttons.
  tabs.addEventListener('keydown', event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const buttons = [...tabs.querySelectorAll('.tool-group-title')];
    const current = Math.max(0, buttons.indexOf(document.activeElement));
    const next = (current + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].click();
    buttons[next].focus();
  });
  list.appendChild(tabs);
  grids.forEach(grid=>list.appendChild(grid));

  for (const button of toolButtons) {
    const type = button.dataset.tool;
    if (type==='select'||type==='erase') {
      button.remove(); // These actions live in the always-visible quick bar.
      continue;
    }
    const legacy = button.querySelector('.tool-icon');
    const key = button.querySelector('kbd');
    if (legacy) legacy.remove();
    for (const child of [...button.children])
      if (child !== key && child.tagName !== 'svg') child.remove();
    for (const node of [...button.childNodes])
      if (node.nodeType === Node.TEXT_NODE) node.remove();
    const sprite = document.createElementNS('http://www.w3.org/2000/svg','svg');
    sprite.setAttribute('viewBox','0 0 100 100');
    sprite.setAttribute('class','build-mini');
    const use = document.createElementNS('http://www.w3.org/2000/svg','use');
    use.setAttribute('href','#s-'+type);
    use.setAttribute('width','100');
    use.setAttribute('height','100');
    sprite.appendChild(use);
    button.prepend(sprite);
    const caption = document.createElement('span');
    caption.className='tool-label';
    caption.textContent=STRUCTURES[type]?.label??type;
    button.append(caption);
    if(key) button.append(key);
    groups.get(type)?.appendChild(button);
  }
}
setupBuildThumbnails();
refreshRecentShortcut();

function setTool(next) {
  if (next !== 'select' && next !== 'erase' && !STRUCTURES[next]) return;
  tool = next;
  if(STRUCTURES[next] && next!=='conveyor'){
    recentStructure=next;
    refreshRecentShortcut();
  }
  quickSelect.classList.toggle('active',next==='select');
  recentButton.classList.toggle('active',next===recentStructure);
  shortcuts.querySelector('.shortcut-conveyor').classList.toggle('active',next==='conveyor');
  shortcuts.querySelector('.shortcut-erase').classList.toggle('active',next==='erase');
  const activeButton = toolButtons.find(button => button.dataset.tool === next);
  const activeGrid = activeButton?.closest('.tool-group-grid');
  if (activeGrid) setBuildCategory(activeGrid);
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
    ore: '해당 광맥 위에 설치해야 합니다.',
    territory: '자국 영토에만 건설할 수 있습니다.',
    terrain: '경사가 가파르거나 높은 지형에는 건설할 수 없습니다.',
    bounds: '지도 범위 밖입니다.',
    occupied: '이미 건물이 설치된 위치입니다.',
    restricted: '중앙 타워는 점령으로만 확보할 수 있습니다.',
    materials: '국가 비축 물자가 부족합니다.',
  };
  const cost = result?.cost ?? BUILD_COSTS[type];
  const wallet = world.walletFor(activeOwner);
  const missing = result?.reason === 'materials' && cost ?
    Object.entries(cost).filter(([id,amount]) => (wallet[id] ?? 0) < amount)
      .map(([id,amount])=>`${RESOURCES[id]?.label ?? id} ${amount - (wallet[id] ?? 0)}`).join(', ') : '';
  ui.message.textContent = (reasons[result?.reason] ?? '설치할 수 없는 위치입니다.') +
    (missing ? ' · 부족: ' + missing : '');
}
function actionAt(point, alternate = false) {
  const tile = hitTile(point);
  if (alternate || tool === 'erase') {
    const entity = world.getAt(tile.x, tile.y);
    if (entity) { world.remove(entity.id); if (selectedId === entity.id) selectedId = null; }
  } else if (tool === 'conveyor') {
    notifyBuild(commitConveyorRoute(world, planConveyorRoute(world, [tile], rotation, activeOwner), activeOwner), 'conveyor');
  } else if (STRUCTURES[tool]) {
    const anchor = snappedTile(tile);
    const created = world.build(tool, anchor.x, anchor.y, rotation, activeOwner);
    notifyBuild(created, tool);
    if (created.ok) selectedId = created.entity.id;
  } else { selectedId = world.getAt(tile.x, tile.y)?.id ?? null;
    selectionDismissed = false;

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
  const tile = hitTile(point);
  if (!paint.grid) {
    const size = rotatedSize(STRUCTURES[paint.kind], rotation);
    paint.grid = startBuildStroke(tile, size.width, size.height);
    paint.attempted = new Set();
    placeAtGrid(paint.grid.origin);
    return;
  }
  const anchors = buildStrokeStep(paint.grid, tile);
  if (!anchors.length) return;
  world.batch(() => {
    for (const anchor of anchors) placeAtGrid(anchor);
  });
}
function placeAtGrid(anchor) {
  if (!paint) return;
  const key = anchor.x + ',' + anchor.y;
  if (paint.attempted.has(key)) return;
  paint.attempted.add(key);
  const placed = world.build(paint.kind, anchor.x, anchor.y, rotation, activeOwner);
  if (placed.ok) selectedId = placed.entity.id;
  else if (placed.reason !== 'occupied') notifyBuild(placed, paint.kind);
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
    notifyBuild(commitConveyorRoute(world, planConveyorRoute(world, paint.route, rotation, activeOwner), activeOwner), 'conveyor');
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
    '0':'turret',
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
byId('show-territory').addEventListener('click', event => {
  const visible = event.currentTarget.getAttribute('aria-pressed') !== 'true';
  event.currentTarget.setAttribute('aria-pressed', String(visible));
  event.currentTarget.textContent = `◇ 영토 경계 ${visible ? 'ON' : 'OFF'}`;
  territoryVisual.layer.setAttribute('visibility', visible ? 'visible' : 'hidden');
  invalidate();
});
byId('show-links').addEventListener('click',event => {
  showLinks = !showLinks;
  event.currentTarget.setAttribute('aria-pressed',String(showLinks));
  event.currentTarget.textContent = `↗ 자원 연결 ${showLinks ? 'ON' : 'OFF'}`;
  invalidate();
});
byId('simulate-raid').addEventListener('click', () => {
  const ok = combat.spawnRaid(activeOwner);
  ui.message.textContent = ok ? '적 정찰 드론 3기 접근 중 · 포탑으로 방어하세요.'
    : '정찰 시험을 시작할 수 없습니다. 해당 국가의 중앙 타워를 확인하세요.';
  if (ok) { combatVisual.wake(); invalidate(); }
});
byId('example').addEventListener('click', () => {
  // This no-cost tutorial shortcut must not silently construct in rival territory.
  if (activeOwner !== 'north') {
    ui.message.textContent = '철 채굴 예시는 북부 시작 영토에서만 사용할 수 있습니다.';
    return;
  }
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
      commitConveyorRoute(world, planConveyorRoute(world, route, 0, activeOwner), activeOwner);
    });
  } finally { world.survival = oldSurvival; }
  camera.x = -4 * CAMERA_CONFIG.tileSize;
  camera.y = 4 * CAMERA_CONFIG.tileSize;
  // The Screen Orientation API is optional and only allowed in installed PWAs.
const requestLandscape = () => {
  if (!window.matchMedia?.('(display-mode: standalone)').matches) return;
  try {
    const requested = screen.orientation?.lock?.('landscape');
    requested?.catch?.(() => {});
  } catch { /* Some browsers require a gesture or do not permit locking. */ }
};
window.addEventListener('pageshow', requestLandscape);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) requestLandscape();
});
requestLandscape();

setTool('select');
  ui.message.textContent = '철 채굴 예시를 설치했습니다 · 건설비 미차감';
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
  const productionChanged = industry.step(dt);
  const combatChanged = combat.step(dt);
  if (productionChanged || combatChanged) invalidate();
  if (combatChanged) combatVisual.wake();
}, 200);

// A phone starts with the compact two-row palette. Expanding adds content below.
if (window.matchMedia?.('(pointer: coarse)').matches)
  setPanelCollapsed(toolbox,true);
setTool('select');
