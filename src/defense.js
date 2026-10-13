/** Practical, material-first defenses. Stats belong here, never in rendering. */
export const WEAPONS = Object.freeze({
  turret: Object.freeze({
    range: 9, secondsPerShot: 0.72, damage: 14, shotSpeed: 23
  }),
  scatterTurret: Object.freeze({
    range: 6.2, secondsPerShot: 1.05, damage: 13, shotSpeed: 21,
    splashRadius: 1.8, splashDamage: 10
  }),
  heavyTurret: Object.freeze({
    range: 14, secondsPerShot: 1.8, damage: 52, shotSpeed: 19
  }),
});
export const WALL_TYPES = Object.freeze(['wall','ironWall','reinforcedWall']);
export function isWall(type) { return WALL_TYPES.includes(type); }
export function weaponFor(type) { return WEAPONS[type] ?? null; }
