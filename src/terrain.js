/**
 * Deterministic geology and topography. No persisted tile array: all queries
 * derive from integer world coordinates and one seed.
 * Starter veins retain the existing economy's iron / coal / titanium locations.
 */
// Building eligibility and the visible cliff decal use exactly this cutoff.
export const CLIFF_HEIGHT = 0.78;
const clamp01 = v => Math.max(0, Math.min(1, v));
const smooth = v => v * v * (3 - 2 * v);

const STARTER_VEINS = Object.freeze([
  { type: 'iron', x: -8, y: 9, rx: 4.9, ry: 4.4 },
  { type: 'coal', x: 10, y: -4, rx: 4.9, ry: 4.4 },
  { type: 'titanium', x: 18, y: 8, rx: 4.9, ry: 4.4 },
]);

export class Terrain {
  constructor(seed = 2841) { this.seed = seed | 0; }

  hash(x, y) {
    let n = Math.imul((x | 0) + this.seed, 0x9e3779b1) ^
            Math.imul((y | 0) - this.seed, 0x85ebca6b);
    n = Math.imul(n ^ (n >>> 15), 0x27d4eb2d);
    return (n ^ (n >>> 13)) >>> 0;
  }

  noise(x, y, salt = 0) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const tx = smooth(x - ix), ty = smooth(y - iy);
    const sample = (dx, dy) => this.hash(ix + dx + salt, iy + dy - salt) / 0xffffffff;
    const a = sample(0, 0) * (1 - tx) + sample(1, 0) * tx;
    const b = sample(0, 1) * (1 - tx) + sample(1, 1) * tx;
    return a * (1 - ty) + b * ty;
  }

  heightAt(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;
    const continents = this.noise(x / 74, y / 74, 11);
    const hills = this.noise(x / 27, y / 27, 37);
    const detail = this.noise(x / 9, y / 9, 83);
    // Folded ridge noise produces meaningful high ground without a height map.
    const fold = 1 - Math.abs(2 * this.noise(x / 42, y / 42, 59) - 1);
    let height = clamp01(0.08 + continents * 0.43 + hills * 0.22 + detail * 0.09 + fold * 0.25);

    // Do not strand the starter core or scripted early deposits on cliffs.
    const anchors = [{x:0,y:0,r:7}, ...STARTER_VEINS.map(v=>({x:v.x,y:v.y,r:4}))];
    for (const a of anchors) {
      const distance = Math.hypot(x - a.x, y - a.y);
      if (distance < a.r) {
        const weight = smooth(clamp01((a.r - distance) / a.r));
        height = height * (1 - weight * 0.9) + 0.46 * weight * 0.9;
      }
    }
    return height;
  }

  groundAt(x, y) {
    const height = this.heightAt(x, y);
    const east = this.heightAt(x + 1, y);
    const south = this.heightAt(x, y + 1);
    const slope = Math.max(Math.abs(east - height), Math.abs(south - height));
    const moisture = this.noise(x / 42, y / 42, 121);
    const biome = height >= CLIFF_HEIGHT ? 'cliff' : height >= 0.72 ? 'ridge' : height >= 0.64 ? 'rock' :
      moisture >= 0.60 ? 'scrub' : height < 0.32 ? 'basin' : 'plain';
    return { height, slope, moisture, biome };
  }

  isCliffAt(x, y) { return this.heightAt(x, y) >= CLIFF_HEIGHT; }

  canBuildFootprint(x, y, width, height) {
    let low = 1, high = 0;
    for (let dy = 0; dy < height; dy++) for (let dx = 0; dx < width; dx++) {
      const h = this.heightAt(x + dx, y + dy);
      if (h >= CLIFF_HEIGHT) return false;
      low = Math.min(low, h);
      high = Math.max(high, h);
    }
    return high - low <= 0.13;
  }

  oreAt(x, y) {
    if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
    // Guaranteed, irregularly shaped teaching deposits near the first tower.
    for (const vein of STARTER_VEINS) {
      const dx = (x - vein.x) / vein.rx;
      const dy = (y - vein.y) / vein.ry;
      if (Math.abs(dx) > 1.3 || Math.abs(dy) > 1.3) continue;
      const roughness = (this.hash(x * 7 + 37, y * 7 - 83) % 101) / 500 - 0.10;
      if (dx * dx + dy * dy <= 1 + roughness) return vein.type;
    }

    // Sparse, rotated/elongated veins rather than rectangular biome patches.
    const spacing = 20;
    const gx = Math.floor(x / spacing), gy = Math.floor(y / spacing);
    let best = null, bestScore = Infinity;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const cx = gx + ox, cy = gy + oy;
      const id = this.hash(cx, cy);
      if (id % 5 === 0) continue;
      const px = cx * spacing + 4 + (id % 13);
      const py = cy * spacing + 4 + ((id >>> 8) % 13);
      const angle = (id % 6283) / 1000;
      const cosine = Math.cos(angle), sine = Math.sin(angle);
      const dx = x - px, dy = y - py;
      if (Math.abs(dx) > 9 || Math.abs(dy) > 9) continue;
      const u = dx * cosine + dy * sine;
      const v = -dx * sine + dy * cosine;
      const rx = 3.7 + ((id >>> 17) % 4);
      const ry = 2.2 + ((id >>> 19) % 3);
      const score = (u * u) / (rx * rx) + (v * v) / (ry * ry);
      const edgeNoise = (this.hash(x * 3 + cx, y * 3 + cy) % 101) / 650 - 0.075;
      if (score > 1 + edgeNoise || score >= bestScore) continue;
      const sample = (id >>> 21) % 12;
      best = sample < 5 ? 'iron' : sample < 9 ? 'coal' : 'titanium';
      bestScore = score;
    }
    return best;
  }

  depositFor(x, y, width, height, accepted) {
    const found = new Map();
    for (let ty = y; ty < y + height; ty++) for (let tx = x; tx < x + width; tx++) {
      const ore = this.oreAt(tx, ty);
      if (ore && accepted.includes(ore)) found.set(ore, (found.get(ore) ?? 0) + 1);
    }
    let best = null, amount = 0;
    for (const [id, qty] of found) if (qty > amount) { best = id; amount = qty; }
    return best;
  }
}
