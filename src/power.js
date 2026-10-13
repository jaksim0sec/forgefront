/** Sparse local power coverage. A tower provides tiny starter power;
 * coal generators provide much stronger regional output. Physical cables and
 * contested territory can be layered on without changing production recipes.
 */
export class PowerGrid {
  constructor(world) {
    this.world = world;
    this.sources = new Set();
    this.consumers = new Set();
    this.dirty = true;
    this.supply = 0;
    this.demand = 0;
    for (const entity of world.structures.values()) this.track(entity);
    this.unsubscribe = world.subscribe(({type, entity}) => {
      if (type === 'place') this.track(entity);
      else if (type === 'remove') {
        this.sources.delete(entity.id);
        this.consumers.delete(entity.id);
      }
      if (type === 'place' || type === 'remove' || type === 'owner' ||
          (type === 'state' && (this.sources.has(entity?.id) || this.consumers.has(entity?.id)))) this.dirty = true;
    });
  }

  track(entity) {
    if (entity.type === 'tower' || entity.type === 'generator') this.sources.add(entity.id);
    if (entity.powerUse > 0) this.consumers.add(entity.id);
    this.dirty = true;
  }
  invalidate() { this.dirty = true; }
  distance(a, b) {
    const ax = a.x + a.width / 2, ay = a.y + a.height / 2;
    const bx = b.x + b.width / 2, by = b.y + b.height / 2;
    return Math.hypot(ax - bx, ay - by);
  }

  update() {
    if (!this.dirty) return false;
    this.dirty = false;
    const previousSupply = this.supply, previousDemand = this.demand;
    this.supply = 0;
    this.demand = 0;
    const sources = [];
    for (const id of this.sources) {
      const e = this.world.structures.get(id);
      if (!e || !e.enabled || e.health <= 0) continue;
      const capacity = e.type === 'tower' ? 3 : (e.burnRemaining > 0 ? 28 : 0);
      if (!capacity) continue;
      const radius = e.type === 'tower' ? 10 : 18;
      sources.push({ entity: e, remaining: capacity, capacity, radius });
      this.supply += capacity;
    }
    let changed = previousSupply !== this.supply;
    // Stable ordering preserves deterministic allocation; expensive search
    // happens only after placement or power-state changes, not on every frame.
    for (const id of this.consumers) {
      const e = this.world.structures.get(id);
      if (!e) continue;
      const need = e.powerUse ?? 0;
      if (e.enabled && e.health > 0) this.demand += need;
      let powered = need === 0;
      let sourceId = null;
      if (need > 0 && e.enabled && e.health > 0) {
        let closest = null, distance = Infinity;
        for (const candidate of sources) {
          if (candidate.entity.ownerId !== e.ownerId || candidate.remaining < need) continue;
          const d = this.distance(e, candidate.entity);
          if (d <= candidate.radius && d < distance) { closest = candidate; distance = d; }
        }
        if (closest) {
          closest.remaining -= need;
          powered = true;
          sourceId = closest.entity.id;
        }
      }
      const reason = powered ? 'connected' : sources.some(candidate => candidate.entity.ownerId === e.ownerId && this.distance(e, candidate.entity) <= candidate.radius) ? 'capacity' : sources.some(candidate => candidate.entity.ownerId === e.ownerId) ? 'range' : 'source';
      if (e.powerReason !== reason) changed = true;
      e.powerReason = reason;
      if (e.powered !== powered || e.powerSourceId !== sourceId) changed = true;
      e.powered = powered;
      e.powerSourceId = sourceId;
    }
    return changed || previousDemand !== this.demand;
  }

  dispose() { this.unsubscribe(); }
}
