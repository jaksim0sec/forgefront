// Deterministic, lazy 2D heightfield. No DOM, World or simulation dependency.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function hash(x, y, seed) {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
function noise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, seed) * (1 - sx) + hash(ix + 1, iy, seed) * sx;
  const b = hash(ix, iy + 1, seed) * (1 - sx) + hash(ix + 1, iy + 1, seed) * sx;
  return a * (1 - sy) + b * sy;
}
export class Terrain {
  constructor({ seed = 1738, chunkSize = 32, maxCachedChunks = 192 } = {}) {
    this.seed = seed | 0;
    this.chunkSize = chunkSize;
    this.maxCachedChunks = maxCachedChunks;
    this.cache = new Map();
  }
  sample(x, y) {
    // Broad mountain systems plus smaller foothills; world-coordinate deterministic.
    const h = noise(x / 190, y / 190, this.seed) * .56
      + noise(x / 76, y / 76, this.seed + 17) * .29
      + noise(x / 27, y / 27, this.seed + 37) * .15;
    return Math.round(clamp((h - .30) * 500, 0, 255));
  }
  chunk(cx, cy) {
    const key = cx + ',' + cy;
    if (this.cache.has(key)) {
      const value = this.cache.get(key);
      this.cache.delete(key);
      this.cache.set(key, value);
      return value;
    }
    const cells = new Uint8Array(this.chunkSize * this.chunkSize);
    for (let y = 0; y < this.chunkSize; y++)
      for (let x = 0; x < this.chunkSize; x++)
        cells[y * this.chunkSize + x] = this.sample(cx * this.chunkSize + x, cy * this.chunkSize + y);
    this.cache.set(key, cells);
    if (this.cache.size > this.maxCachedChunks) this.cache.delete(this.cache.keys().next().value);
    return cells;
  }
  getHeight(x, y) {
    if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
    const s = this.chunkSize, cx = Math.floor(x / s), cy = Math.floor(y / s);
    return this.chunk(cx, cy)[(y - cy * s) * s + (x - cx * s)];
  }
  getSlope(x, y) {
    const h = this.getHeight(x, y);
    if (h === null) return null;
    return Math.max(...[[1,0],[-1,0],[0,1],[0,-1]]
      .map(([dx,dy]) => Math.abs(h - this.getHeight(x + dx, y + dy))));
  }
  canBuild(type, x, y, width, height) {
    let min = Infinity, max = -Infinity;
    for (let dy = 0; dy < height; dy++) for (let dx = 0; dx < width; dx++) {
      const h = this.getHeight(x + dx, y + dy);
      if (h === null) return { ok: false, reason: 'terrain' };
      min = Math.min(min, h); max = Math.max(max, h);
    }
    // Single-tile conveyors should still be constructible across hills;
    // future logistics can impose grade limits on actual transport links.
    if (max > 205) return { ok: false, reason: 'altitude' };
    if (max - min > 13) return { ok: false, reason: 'slope' };
    return { ok: true };
  }
  getMoveCost(from, to, unit = 'ground') {
    const dh = this.getHeight(to.x, to.y) - this.getHeight(from.x, from.y);
    if (!Number.isFinite(dh)) return Infinity;
    if (unit === 'air') return 1;
    if (Math.abs(dh) > 32) return Infinity;
    return 1 + Math.max(0, dh) / 12 + Math.max(0, -dh) / 32;
  }
}
