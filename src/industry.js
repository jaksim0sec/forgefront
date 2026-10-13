import { STRUCTURES } from './world.js';
import { RECIPES } from './progression.js';
import { PowerGrid } from './power.js';

const BELTS = new Set(['conveyor', 'junction']);
const MINERS = new Set(['leadCollector', 'drill', 'poweredDrill']);
const PROCESSORS = new Set(['smelter', 'siliconPlant', 'superconductorPlant']);
const ACCEPTS = Object.freeze({
  smelter: new Set(['lead', 'iron']),
  generator: new Set(['coal']),
  poweredDrill: new Set(['coal']),
  siliconPlant: new Set(['iron', 'coal']),
  superconductorPlant: new Set(['coal', 'iron', 'silicon']),
});

/** One deterministic tick, wholly independent from what the camera renders.
 * Producers, processors, burners and occupied conveyors are the only active
 * entities inspected; empty world tiles are never simulated.
 */
export class Industry {
  constructor(world, connections, power = new PowerGrid(world)) {
    this.world = world;
    this.connections = connections;
    this.power = power;
    this.producers = new Set();
    this.processors = new Set();
    this.generators = new Set();
    this.movers = new Set();
    this.storages = new Set(); // Only non-empty warehouses are simulated.
    this.dirty = false;
    for (const structure of world.structures.values()) this.track(structure);
    this.unsubscribe = world.subscribe(({type,entity}) => {
      if (type === 'remove') {
        this.producers.delete(entity.id);
        this.processors.delete(entity.id);
        this.generators.delete(entity.id);
        this.movers.delete(entity.id);
        this.storages.delete(entity.id);
      } else if (type === 'place') this.track(entity);
    });
  }
  dispose() { this.unsubscribe(); this.power.dispose(); }

  track(entity) {
    if (MINERS.has(entity.type)) this.producers.add(entity.id);
    if (PROCESSORS.has(entity.type)) this.processors.add(entity.id);
    if (entity.type === 'generator') this.generators.add(entity.id);
    if (BELTS.has(entity.type) && entity.itemCount) this.movers.add(entity.id);
    if (entity.type === 'warehouse' && this.totalStock(entity)) this.storages.add(entity.id);
  }

  totalStock(entity) {
    if (BELTS.has(entity.type)) return entity.itemCount;
    return Object.values(entity.inventory ?? {}).reduce((sum, qty) => sum + qty, 0);
  }
  stockCount(entity, id) {
    return BELTS.has(entity.type) ? (entity.itemId === id ? entity.itemCount : 0) : entity.inventory?.[id] ?? 0;
  }

  activity(entity, value) {
    if (entity.activity !== value) { entity.activity = value; this.dirty = true; }
  }

  canReceive(entity, itemId) {
    if (!entity?.enabled || entity.health <= 0 || !itemId) return false;
    if (entity.type === 'tower') return true;
    if (entity.type === 'drill' || entity.type === 'leadCollector') return false;
    const filter = ACCEPTS[entity.type];
    if (filter && !filter.has(itemId)) return false;
    const recipe = RECIPES[entity.type];
    if (recipe) {
      const needed = recipe.inputs[itemId];
      // Keep enough room for every ingredient and the produced output.
      if (!needed || this.stockCount(entity, itemId) >= needed * 3) return false;
    }
    const capacity = STRUCTURES[entity.type]?.itemCapacity ?? 0;
    if (this.totalStock(entity) >= capacity) return false;
    return !BELTS.has(entity.type) || !entity.itemCount || entity.itemId === itemId;
  }

  insert(entity, id, amount = 1) {
    if (!entity || !id || amount <= 0) return false;
    if (entity.type === 'tower') {
      this.world.credit(entity.ownerId, id, amount);
    } else if (BELTS.has(entity.type)) {
      entity.itemId = id;
      entity.itemCount += amount;
      this.movers.add(entity.id);
    } else entity.inventory[id] = (entity.inventory[id] ?? 0) + amount;
    if (entity.type === 'warehouse') this.storages.add(entity.id);
    this.dirty = true;
    return true;
  }
  take(entity, id, amount = 1) {
    if (this.stockCount(entity, id) < amount) return false;
    if (BELTS.has(entity.type)) {
      entity.itemCount -= amount;
      if (!entity.itemCount) { entity.itemId = null; this.movers.delete(entity.id); }
    } else {
      entity.inventory[id] -= amount;
      if (!entity.inventory[id]) delete entity.inventory[id];
      if (entity.type === 'warehouse' && !this.totalStock(entity)) this.storages.delete(entity.id);
    }
    this.dirty = true;
    return true;
  }

  updateGenerators(dt) {
    for (const id of this.generators) {
      const e = this.world.structures.get(id);
      if (!e || !e.enabled || e.health <= 0) continue;
      const wasBurning = e.burnRemaining > 0;
      e.burnRemaining = Math.max(0, e.burnRemaining - dt);
      if (!e.burnRemaining && this.take(e, 'coal')) e.burnRemaining = 8;
      const burning = e.burnRemaining > 0;
      if (wasBurning !== burning) this.power.invalidate();
      this.activity(e, burning ? 'generating' : 'no-coal');
    }
  }

  updateMining(dt) {
    for (const id of this.producers) {
      const e = this.world.structures.get(id);
      if (!e || !e.enabled || e.health <= 0) continue;
      const highTier = e.type === 'poweredDrill';
      const resource = e.type === 'leadCollector' ? 'lead' : highTier ? 'titanium' : e.resourceId;
      const validDeposit = !this.world.terrain || e.type === 'leadCollector' ||
        this.world.terrain.depositFor(e.x, e.y, e.width, e.height, [resource]) === resource;
      if (!resource || !validDeposit) { this.activity(e, 'no-ore'); continue; }
      if (highTier && !e.powered) { this.activity(e, 'no-power'); continue; }
      if (this.totalStock(e) >= STRUCTURES[e.type].itemCapacity) { this.activity(e, 'blocked'); continue; }
      if (highTier && !e.fuelCharges) {
        if (!this.take(e, 'coal')) { this.activity(e, 'no-coal'); continue; }
        e.fuelCharges = 3; // one coal drives three titanium extraction cycles
      }
      e.progress += dt * STRUCTURES[e.type].itemsPerSecond;
      if (e.progress >= 1) {
        this.insert(e, resource);
        e.progress -= 1;
        if (highTier) e.fuelCharges--;
      }
      e.progress = Math.min(e.progress, 1);
      this.activity(e, 'mining');
    }
  }

  updateRecipes(dt) {
    for (const id of this.processors) {
      const e = this.world.structures.get(id);
      if (!e || !e.enabled || e.health <= 0) continue;
      const recipe = RECIPES[e.type];
      if (!e.powered) { this.activity(e, 'no-power'); continue; }
      const canProcess = Object.entries(recipe.inputs).every(([id, qty]) => this.stockCount(e,id) >= qty);
      if (!canProcess) { this.activity(e, 'waiting-input'); continue; }
      const required = Object.values(recipe.inputs).reduce((a,b) => a+b,0);
      const nextStock = this.totalStock(e) - required + recipe.amount;
      if (nextStock > STRUCTURES[e.type].itemCapacity) { this.activity(e, 'blocked'); continue; }
      e.progress += dt;
      if (e.progress >= recipe.seconds) {
        for (const [part, qty] of Object.entries(recipe.inputs)) this.take(e, part, qty);
        this.insert(e, recipe.output, recipe.amount);
        e.progress -= recipe.seconds;
      }
      this.activity(e, 'processing');
    }
  }

  exportResource(e) {
    if (BELTS.has(e.type)) return e.itemId;
    if (e.type === 'leadCollector') return 'lead';
    if (e.type === 'drill') return e.resourceId;
    if (e.type === 'poweredDrill') return 'titanium';
    if (PROCESSORS.has(e.type)) return RECIPES[e.type].output;
    if (e.type === 'warehouse') return Object.keys(e.inventory).find(id => e.inventory[id] > 0) ?? null;
    return null;
  }

  transport(dt) {
    // Snapshot prevents new items from jumping across arbitrarily long belts
    // within a single simulation step.
    const active = [...new Set([...this.movers, ...this.producers, ...this.processors, ...this.storages])];
    for (const id of active) {
      const from = this.world.structures.get(id);
      if (!from || !from.enabled || from.health <= 0) continue;
      const targets = [...this.connections.outputs(id).keys()];
      const itemId = from.type === 'warehouse'
        ? Object.keys(from.inventory).find(item => from.inventory[item] > 0 &&
            targets.some(target => target !== from.lastSourceId &&
              this.canReceive(this.world.structures.get(target), item)))
        : this.exportResource(from);
      if (!itemId || !this.stockCount(from, itemId)) continue;
      const throughput = STRUCTURES[from.type]?.itemsPerSecond ?? 3;
      from.moveProgress = Math.min(1, from.moveProgress + dt * throughput);
      if (from.moveProgress < 1) continue;
      if (from.type === 'junction' && targets.length) {
        const offset = (from.routeCursor ?? 0) % targets.length;
        targets.push(...targets.splice(0, offset));
      }
      let moved = false;
      for (const targetId of targets) {
        if ((from.type === 'junction' || from.type === 'warehouse') &&
            targets.length > 1 && targetId === from.lastSourceId) continue;
        const to = this.world.structures.get(targetId);
        if (!this.canReceive(to, itemId)) continue;
        this.take(from, itemId);
        this.insert(to, itemId);
        this.world.changed('transfer', { fromId: id, toId: targetId, itemId });
        if (to.type === 'junction' || to.type === 'warehouse') to.lastSourceId = from.id;
        if (from.type === 'junction') from.routeCursor = (from.routeCursor ?? 0) + 1;
        from.moveProgress = 0;
        this.activity(from, 'transporting');
        if (to.type !== 'tower') this.activity(to, BELTS.has(to.type) ? 'transporting' : 'receiving');
        moved = true;
        break;
      }
      if (!moved) this.activity(from, 'blocked');
    }
  }

  step(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return false;
    dt = Math.min(.5, dt);
    this.dirty = false;
    this.updateGenerators(dt);
    if (this.power.update()) this.dirty = true;
    this.updateMining(dt);
    this.updateRecipes(dt);
    this.transport(dt);
    return this.dirty;
  }
}
