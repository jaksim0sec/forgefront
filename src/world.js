import { CAMERA_CONFIG } from './camera.js';
import { DynamicEntities, Effects } from './entities.js';
import { RESOURCES } from './resources.js';
import { BUILD_COSTS, canAfford, consumeCost } from './progression.js';

export const WORLD_CONFIG = Object.freeze({ width: 2048, height: 2048, chunkSize: 32 });
export const STRUCTURES = Object.freeze({
  conveyor: Object.freeze({ label: '컨베이어', width: 1, height: 1, maxHealth: 55, itemCapacity: 3, itemsPerSecond: 5 }),
  junction: Object.freeze({ label: '분배기', width: 1, height: 1, maxHealth: 75, itemCapacity: 3, itemsPerSecond: 5 }),
  drill: Object.freeze({ label: '기본 채굴기', width: 2, height: 2, maxHealth: 180, itemCapacity: 12, itemsPerSecond: 1 }),
  leadCollector: Object.freeze({ label: '납 채집기', width: 1, height: 1, maxHealth: 100, itemCapacity: 10, itemsPerSecond: 0.9 }),
  tower: Object.freeze({ label: '중앙 타워', width: 2, height: 2, maxHealth: 700, itemCapacity: Infinity, powerOutput: 3 }),
  poweredDrill: Object.freeze({ label: '전동 티타늄 드릴', width: 2, height: 2, maxHealth: 300, itemCapacity: 12, itemsPerSecond: 0.7, powerUse: 8 }),
  siliconPlant: Object.freeze({ label: '실리콘 공장', width: 3, height: 2, maxHealth: 370, itemCapacity: 28, powerUse: 10 }),
  superconductorPlant: Object.freeze({ label: '초전도체 공장', width: 3, height: 3, maxHealth: 510, itemCapacity: 36, powerUse: 17 }),
  smelter: Object.freeze({ label: '제련소', width: 3, height: 2, maxHealth: 300, itemCapacity: 24, powerUse: 2 }),
  generator: Object.freeze({ label: '석탄 발전소', width: 2, height: 2, maxHealth: 220, itemCapacity: 16, powerOutput: 28 }),
});
export function worldToTile(worldX, worldY) {
  return { x: Math.floor(worldX / CAMERA_CONFIG.tileSize), y: Math.floor(worldY / CAMERA_CONFIG.tileSize) };
}
export function tileToWorld(tileX, tileY) {
  return { x: tileX * CAMERA_CONFIG.tileSize, y: tileY * CAMERA_CONFIG.tileSize };
}
export function rotatedSize(def, rotation = 0) {
  return rotation % 2 === 0 ? { width: def.width, height: def.height } : { width: def.height, height: def.width };
}

/** Sparse, bounded occupancy: only chunks containing structures exist. */
export class World {
  constructor(config = WORLD_CONFIG) {
    if (!Number.isInteger(config.width) || !Number.isInteger(config.height) ||
        !Number.isInteger(config.chunkSize) || config.width <= 0 || config.height <= 0 || config.chunkSize <= 0) {
      throw new Error('Invalid world dimensions');
    }
    this.config = config;
    this.minX = -Math.floor(config.width / 2);
    this.minY = -Math.floor(config.height / 2);
    this.maxX = this.minX + config.width;
    this.maxY = this.minY + config.height;
    this.chunkColumns = Math.ceil(config.width / config.chunkSize);
    this.chunks = new Map();
    this.structures = new Map();
    this.nextId = 1; // 0 = empty cell
    this.revision = 0;
    this.listeners = new Set();
    this.batchDepth = 0;
    this.pendingChanges = [];
    this.units = new DynamicEntities('unit');
    this.projectiles = new DynamicEntities('projectile');
    this.effects = new Effects();
    this.terrain = null; // Optional deterministic geology (M05)
    this.survival = false; // Existing world.place remains a sandbox constructor
    this.stockpiles = new Map(); // Nation's deliveries to its tower

  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  changed(type, entity) {
    this.revision++;
    const change = { type, entity };
    if (this.batchDepth) this.pendingChanges.push(change);
    else for (const listener of this.listeners) listener(change);
  }

  batch(fn) {
    this.batchDepth++;
    try { return fn(); }
    finally {
      if (--this.batchDepth === 0) {
        const pending = this.pendingChanges;
        this.pendingChanges = [];
        for (const change of pending) for (const listener of this.listeners) listener(change);
      }
    }
  }

  rotateConveyor(id, rotation, inputSide = null) {
    const entity = this.structures.get(id);
    if (!entity || entity.type !== 'conveyor' || !Number.isInteger(rotation)) return false;
    const next = ((rotation % 4) + 4) % 4;
    if (next === entity.rotation && entity.inputSide === inputSide) return true;
    entity.rotation = next;
    entity.inputSide = inputSide;
    this.changed('rotate', entity);
    return true;
  }

  damageStructure(id, amount) {
    const entity = this.structures.get(id);
    if (!entity || !Number.isFinite(amount) || amount <= 0) return null;
    entity.health = Math.max(0, entity.health - amount);
    if (entity.health === 0) this.remove(id);
    else this.changed('state', entity);
    return entity.health;
  }

  setEnabled(id, enabled) {
    const entity = this.structures.get(id);
    if (!entity) return false;
    entity.enabled = !!enabled;
    this.changed('state', entity);
    return true;
  }

  setDrillResource(id, resourceId) {
    const entity = this.structures.get(id);
    if (!entity || entity.type !== 'drill' || !['iron','coal'].includes(resourceId)) return false;
    if (this.terrain && this.terrain.depositFor(entity.x, entity.y, entity.width, entity.height, [resourceId]) !== resourceId) return false;
    entity.resourceId = resourceId;
    entity.progress = 0;
    this.changed('state', entity);
    return true;
  }

  walletFor(ownerId) {
    const key = ownerId ?? 'neutral';
    let wallet = this.stockpiles.get(key);
    if (!wallet) this.stockpiles.set(key, wallet = Object.create(null));
    return wallet;
  }

  credit(ownerId, itemId, count = 1) {
    if (!RESOURCES[itemId] || !Number.isSafeInteger(count) || count <= 0) return false;
    const stock = this.walletFor(ownerId);
    stock[itemId] = (stock[itemId] ?? 0) + count;
    this.changed('economy', null);
    return true;
  }

  canBuild(type, x, y, rotation = 0, ownerId = null) {
    const position = this.canPlace(type, x, y, rotation);
    if (!position.ok) return position;
    if (!this.survival) return position;
    const cost = BUILD_COSTS[type];
    if (cost == null) return { ok: false, reason: 'restricted' };
    const ore = this.terrain && (
      type === 'drill' ? this.terrain.depositFor(x, y, position.width, position.height, ['iron', 'coal']) :
      type === 'poweredDrill' ? this.terrain.depositFor(x, y, position.width, position.height, ['titanium']) :
      null
    );
    if ((type === 'drill' || type === 'poweredDrill') && !ore) return { ok: false, reason: 'ore' };
    // Gameplay-height constraint only applies to built facilities. World.place()
    // stays an unrestricted sandbox primitive for tools and existing fixtures.
    if (type !== 'conveyor' && type !== 'junction' && this.terrain?.canBuildFootprint &&
        !this.terrain.canBuildFootprint(x, y, position.width, position.height))
      return { ok: false, reason: 'terrain' };
    const wallet = this.walletFor(ownerId);
    if (!canAfford(wallet, cost)) return { ok: false, reason: 'materials', cost };
    return { ...position, ore };
  }

  build(type, x, y, rotation = 0, ownerId = null, inputSide = null) {
    const check = this.canBuild(type, x, y, rotation, ownerId);
    if (!check.ok) return check;
    const result = this.place(type, x, y, rotation, ownerId, inputSide);
    if (result.ok && this.survival) consumeCost(this.walletFor(ownerId), BUILD_COSTS[type]);
    return result;
  }

  setOwner(id, ownerId) {
    const entity = this.structures.get(id);
    if (!entity) return false;
    if (entity.ownerId === ownerId) return true;
    entity.ownerId = ownerId;
    this.changed('owner', entity);
    return true;
  }

  inBounds(x, y) {
    return Number.isInteger(x) && Number.isInteger(y) && x >= this.minX && y >= this.minY && x < this.maxX && y < this.maxY;
  }

  cellInfo(x, y) {
    const offsetX = x - this.minX;
    const offsetY = y - this.minY;
    const cx = Math.floor(offsetX / this.config.chunkSize);
    const cy = Math.floor(offsetY / this.config.chunkSize);
    return {
      key: cy * this.chunkColumns + cx,
      index: (offsetY % this.config.chunkSize) * this.config.chunkSize + offsetX % this.config.chunkSize,
    };
  }

  getAt(x, y) {
    if (!this.inBounds(x, y)) return null;
    const { key, index } = this.cellInfo(x, y);
    const id = this.chunks.get(key)?.cells[index] ?? 0;
    return id ? this.structures.get(id) ?? null : null;
  }

  footprint(type, x, y, rotation = 0) {
    const def = STRUCTURES[type];
    if (!def || !Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(rotation)) return null;
    const normalizedRotation = ((rotation % 4) + 4) % 4;
    return { ...rotatedSize(def, normalizedRotation), rotation: normalizedRotation };
  }

  canPlace(type, x, y, rotation = 0) {
    const area = this.footprint(type, x, y, rotation);
    if (!area) return { ok: false, reason: 'invalid' };
    if (!this.inBounds(x, y) || !this.inBounds(x + area.width - 1, y + area.height - 1)) {
      return { ok: false, reason: 'bounds', ...area };
    }
    for (let dy = 0; dy < area.height; dy++) {
      for (let dx = 0; dx < area.width; dx++) {
        if (this.getAt(x + dx, y + dy)) return { ok: false, reason: 'occupied', ...area };
      }
    }
    return { ok: true, ...area };
  }

  place(type, x, y, rotation = 0, ownerId = null, inputSide = null) {
    const check = this.canPlace(type, x, y, rotation);
    if (!check.ok) return check;
    if (this.nextId > 0xffffffff) return { ok: false, reason: 'id-exhausted' };
    const entity = {
      id: this.nextId++, type, x, y, width: check.width, height: check.height,
      rotation: check.rotation, ownerId,
      inputSide: type === 'conveyor' ? inputSide : null,
      maxHealth: STRUCTURES[type].maxHealth,
      health: STRUCTURES[type].maxHealth,
      enabled: true,
      activity: 'idle',
      progress: 0,
      moveProgress: 0,
      itemId: null, // one-item-type fast lane for conveyor
      itemCount: 0,
      inventory: type === 'conveyor' || type === 'junction' ? null : Object.create(null),
      resourceId: type === 'leadCollector' ? 'lead' : type === 'poweredDrill' ? 'titanium' : type === 'drill' ? (this.terrain?.depositFor(x, y, check.width, check.height, ['iron', 'coal']) ?? 'iron') : null,
      powered: false,
      powerUse: STRUCTURES[type].powerUse ?? 0,
      powerSourceId: null,
      burnRemaining: 0,
      fuelProgress: 0,
    };
    this.structures.set(entity.id, entity);
    for (let dy = 0; dy < entity.height; dy++) {
      for (let dx = 0; dx < entity.width; dx++) {
        const { key, index } = this.cellInfo(x + dx, y + dy);
        let chunk = this.chunks.get(key);
        if (!chunk) {
          chunk = { cells: new Uint32Array(this.config.chunkSize ** 2), ids: new Set(), count: 0 };
          this.chunks.set(key, chunk);
        }
        chunk.cells[index] = entity.id;
        chunk.ids.add(entity.id);
        chunk.count++;
      }
    }
    this.changed('place', entity);
    return { ok: true, entity };
  }

  remove(id) {
    const entity = this.structures.get(id);
    if (!entity) return false;
    const touched = new Set();
    for (let dy = 0; dy < entity.height; dy++) {
      for (let dx = 0; dx < entity.width; dx++) {
        const { key, index } = this.cellInfo(entity.x + dx, entity.y + dy);
        const chunk = this.chunks.get(key);
        chunk.cells[index] = 0;
        chunk.count--;
        touched.add(key);
      }
    }
    for (const key of touched) {
      const chunk = this.chunks.get(key);
      chunk.ids.delete(id);
      if (chunk.count === 0) this.chunks.delete(key);
    }
    this.structures.delete(id);
    this.changed('remove', entity);
    return true;
  }

  removeAt(x, y) {
    const entity = this.getAt(x, y);
    return entity ? this.remove(entity.id) : false;
  }

  /** Iterate only occupied chunks intersecting the viewport, not the full entity registry. */
  *visible(minX, minY, maxX, maxY) {
    const left = Math.max(this.minX, minX);
    const top = Math.max(this.minY, minY);
    const right = Math.min(this.maxX - 1, maxX);
    const bottom = Math.min(this.maxY - 1, maxY);
    if (left > right || top > bottom) return;
    const start = this.cellInfo(left, top);
    const end = this.cellInfo(right, bottom);
    const startCol = start.key % this.chunkColumns;
    const endCol = end.key % this.chunkColumns;
    const startRow = Math.floor(start.key / this.chunkColumns);
    const endRow = Math.floor(end.key / this.chunkColumns);
    const seen = new Set();
    for (let cy = startRow; cy <= endRow; cy++) {
      for (let cx = startCol; cx <= endCol; cx++) {
        const chunk = this.chunks.get(cy * this.chunkColumns + cx);
        if (!chunk) continue;
        for (const id of chunk.ids) {
          if (seen.has(id)) continue;
          seen.add(id);
          const item = this.structures.get(id);
          if (item && item.x <= right && item.y <= bottom &&
              item.x + item.width > left && item.y + item.height > top) yield item;
        }
      }
    }
  }
}
