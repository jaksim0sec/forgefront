/** Pure territory query; independent of UI, industry and terrain rendering.
 * Tower claims are indexed into coarse buckets, so each pixel never scans
 * the full world's structures even after many towers are added.
 */
export const CLAIM_RADIUS = 22;
export const OUTPOST_CLAIM_RADIUS = 13;
const BUCKET_SIZE = 32;

const bucketKey = (x, y) => Math.floor(x / BUCKET_SIZE) + ',' + Math.floor(y / BUCKET_SIZE);

export class Territory {
  constructor(world) {
    this.world = world;
    this.revision = 0;
    this.sources = new Map();
    this.buckets = new Map();
    this.rebuild();
    this.unsubscribe = world.subscribe(({ type, entity }) => {
      if (!entity || !['tower','outpost'].includes(entity.type)) return;
      if (type !== 'place' && type !== 'remove' && type !== 'owner' && type !== 'state') return;
      this.rebuild();
    });
  }

  track(tower) {
    if (!['tower','outpost'].includes(tower.type) || !tower.ownerId || tower.health <= 0) return;
    this.sources.set(tower.id, {
      id: tower.id, x: tower.x + tower.width / 2,
      y: tower.y + tower.height / 2, ownerId: tower.ownerId,
      radius:tower.type==='tower'?CLAIM_RADIUS:OUTPOST_CLAIM_RADIUS,
    });
  }

  rebuild() {
    this.sources.clear();
    this.buckets.clear();
    for (const structure of this.world.structures.values()) this.track(structure);
    for (const source of this.sources.values()) {
      for (let by = Math.floor((source.y - source.radius) / BUCKET_SIZE);
        by <= Math.floor((source.y + source.radius) / BUCKET_SIZE); by++) {
        for (let bx = Math.floor((source.x - source.radius) / BUCKET_SIZE);
          bx <= Math.floor((source.x + source.radius) / BUCKET_SIZE); bx++) {
          const key = bx + ',' + by;
          let sources = this.buckets.get(key);
          if (!sources) this.buckets.set(key, sources = []);
          sources.push(source);
        }
      }
    }
    this.revision++;
  }

  ownerAt(x, y) {
    const sources = this.buckets.get(bucketKey(x, y));
    if (!sources) return null;
    let winner = null, nearest = CLAIM_RADIUS * CLAIM_RADIUS;
    for (const source of sources) {
      const dx = (x + 0.5) - source.x;
      const dy = (y + 0.5) - source.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > source.radius*source.radius) continue;
      if (d2 < nearest || (d2 === nearest && source.id < (winner?.id ?? Infinity))) {
        nearest = d2;
        winner = source;
      }
    }
    return winner?.ownerId ?? null;
  }

  dispose() {
    this.unsubscribe();
    this.sources.clear();
    this.buckets.clear();
  }
}
