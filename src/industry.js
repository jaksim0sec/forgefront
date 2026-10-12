import { STRUCTURES } from './world.js';

/** Local-only fixed-step factory prototype.
 * Only active producers and occupied belts are touched. Rendering/viewport
 * does not affect world resources. No terrain recipes or power grid yet.
 */
export class Industry {
  constructor(world, connections) {
    this.world = world;
    this.connections = connections;
    this.producers = new Set();
    this.movers = new Set();
    this.dirty = false;
    for (const structure of world.structures.values()) this.track(structure);
    this.unsubscribe = world.subscribe(change => {
      if (change.type === 'remove') {
        this.producers.delete(change.entity.id);
        this.movers.delete(change.entity.id);
      } else if (change.type === 'place') this.track(change.entity);
      else if (change.type === 'state' && change.entity.type === 'drill') this.track(change.entity);
    });
  }
  dispose() { this.unsubscribe(); }
  track(entity) {
    if (entity.type === 'drill') this.producers.add(entity.id);
    if (entity.type === 'conveyor' && entity.itemCount > 0) this.movers.add(entity.id);
  }
  stockCount(entity, id) {
    return entity.type === 'conveyor' ? (entity.itemId === id ? entity.itemCount : 0) :
      (entity.inventory?.[id] ?? 0);
  }
  totalStock(entity) {
    return entity.type === 'conveyor' ? entity.itemCount :
      Object.values(entity.inventory ?? {}).reduce((a,b) => a + b, 0);
  }
  canReceive(entity, itemId) {
    if (!entity.enabled || entity.health <= 0) return false;
    const definition = STRUCTURES[entity.type];
    if (this.totalStock(entity) >= definition.itemCapacity) return false;
    return entity.type !== 'conveyor' || entity.itemCount === 0 || entity.itemId === itemId;
  }
  insert(entity, id, amount=1) {
    if (entity.type === 'conveyor') {
      entity.itemId = id; entity.itemCount += amount;
      this.movers.add(entity.id);
    } else entity.inventory[id] = (entity.inventory[id] ?? 0) + amount;
    this.dirty = true;
  }
  take(entity, id) {
    if (entity.type === 'conveyor') {
      entity.itemCount--;
      if (!entity.itemCount) { entity.itemId = null; this.movers.delete(entity.id); }
    } else {
      entity.inventory[id]--;
      if (!entity.inventory[id]) delete entity.inventory[id];
    }
    this.dirty = true;
  }
  step(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return false;
    dt = Math.min(dt, 0.5);
    this.dirty = false;
    for (const id of this.producers) {
      const s = this.world.structures.get(id);
      if (!s || !s.enabled || s.health <= 0) continue;
      s.progress += dt * STRUCTURES.drill.itemsPerSecond;
      let count = Math.min(2, Math.floor(s.progress));
      while (count-- > 0 && this.totalStock(s) < STRUCTURES.drill.itemCapacity) {
        this.insert(s, s.resourceId);
        s.progress -= 1;
      }
      s.progress = Math.min(s.progress, 1);
      s.activity = this.totalStock(s) >= STRUCTURES.drill.itemCapacity ? 'blocked' : 'mining';
    }

    // Snapshot avoids moving a resource through unlimited conveyors in one tick.
    const active = [...new Set([...this.movers, ...this.producers])];
    for (const id of active) {
      const from = this.world.structures.get(id);
      if (!from || !from.enabled || from.health <= 0) continue;
      if (!this.totalStock(from)) continue;
      const itemsPerSecond = STRUCTURES[from.type].itemsPerSecond ?? 0;
      if (!itemsPerSecond) continue;
      from.moveProgress = Math.min(1, from.moveProgress + itemsPerSecond * dt);
      if (from.moveProgress < 1) continue;
      const itemId = from.type === 'conveyor' ? from.itemId : Object.keys(from.inventory).find(r=>from.inventory[r] > 0);
      if (!itemId) continue;
      let delivered = false;
      for (const targetId of this.connections.outputs(id).keys()) {
        const to = this.world.structures.get(targetId);
        if (!to || !this.canReceive(to, itemId)) continue;
        this.take(from, itemId);
        this.insert(to, itemId);
        from.moveProgress = 0;
        from.activity = 'transporting';
        to.activity = to.type === 'conveyor' ? 'transporting' : 'receiving';
        delivered = true;
        break;
      }
      if (!delivered) from.activity = 'blocked';
    }
    return this.dirty;
  }
}
