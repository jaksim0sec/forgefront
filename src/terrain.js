/** Infinite-looking deterministic deposit sampling, without a tile array.
 * Natural ore is patchy; lead is abundant at the surface, not a gated vein.
 */
export class Terrain {
  constructor(seed = 2841) { this.seed = seed | 0; }

  hash(x, y) {
    let n = Math.imul((x | 0) + this.seed, 0x9e3779b1) ^
            Math.imul((y | 0) - this.seed, 0x85ebca6b);
    n = Math.imul(n ^ (n >>> 15), 0x27d4eb2d);
    return (n ^ (n >>> 13)) >>> 0;
  }

  oreAt(x, y) {
    if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
    // Deliberate early-game nearby pockets, visible around the starting core.
    if (x >= -11 && x <= -5 && y >= 6 && y <= 12) return 'iron';
    if (x >= 7 && x <= 13 && y >= -7 && y <= -1) return 'coal';
    if (x >= 15 && x <= 21 && y >= 5 && y <= 12) return 'titanium';

    const spacing = 20;
    const gx = Math.floor(x / spacing), gy = Math.floor(y / spacing);
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const cx = gx + ox, cy = gy + oy;
      const id = this.hash(cx, cy);
      if (id % 5 === 0) continue;
      const px = cx * spacing + 4 + (id % 13);
      const py = cy * spacing + 4 + ((id >>> 8) % 13);
      const radius = 3 + ((id >>> 17) % 3);
      const dx = x - px, dy = y - py;
      if (dx * dx + dy * dy > radius * radius) continue;
      const sample = (id >>> 21) % 12;
      return sample < 5 ? 'iron' : sample < 9 ? 'coal' : 'titanium';
    }
    return null;
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
