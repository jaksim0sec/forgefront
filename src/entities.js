/** Dynamic units and projectiles never claim building tiles. */
export class DynamicEntities {
  constructor(kind) {
    if (kind !== 'unit' && kind !== 'projectile') throw new Error('Unknown entity kind');
    this.kind = kind;
    this.entities = new Map();
    this.nextId = 1;
  }
  spawn({ x, y, health = 10, ownerId = null, ...extra } = {}) {
    if (![x,y,health].every(Number.isFinite) || health <= 0) return null;
    const entity = { ...extra, id: this.nextId++, kind: this.kind, x, y, ownerId, health, maxHealth: health, enabled: true };
    this.entities.set(entity.id, entity);
    return entity;
  }
  get(id) { return this.entities.get(id) ?? null; }
  damage(id, amount) {
    const entity = this.get(id);
    if (!entity || !Number.isFinite(amount) || amount <= 0) return null;
    entity.health = Math.max(0, entity.health - amount);
    if (!entity.health) this.entities.delete(id);
    return entity.health;
  }
  move(id, x, y) {
    const entity = this.get(id);
    if (!entity || !Number.isFinite(x) || !Number.isFinite(y)) return false;
    entity.x = x; entity.y = y;
    return true;
  }
  remove(id) { return this.entities.delete(id); }
}

/** Visual effects are disposable and intentionally have no health. */
export class Effects {
  constructor() { this.items = []; }
  emit(x, y, duration, style = 'spark') {
    if (![x,y,duration].every(Number.isFinite) || duration <= 0) return;
    this.items.push({ x, y, remaining: duration, style });
  }
  step(delta) { this.items = this.items.filter(effect => (effect.remaining -= delta) > 0); }
}
