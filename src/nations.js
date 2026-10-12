/** Nation styling belongs to the owner, never to the structure definition.
 * Gameplay mechanics do not depend on these colors. More nations can be added
 * without modifying structures, renderers or the occupancy grid.
 */
export const NATIONS = Object.freeze({
  north: Object.freeze({ id: 'north', label: '북부', color: '#77a9e4', sigil: 'M2 13L7 2L12 13M4 10H10' }),
  south: Object.freeze({ id: 'south', label: '남부', color: '#e18a86', sigil: 'M2 3H12L7 9V14M3 12H11' }),
});
export const NEUTRAL_COLOR = '#9aa4ab';
export function nationColor(ownerId) {
  return NATIONS[ownerId]?.color ?? NEUTRAL_COLOR;
}
export function nationLabel(ownerId) {
  return NATIONS[ownerId]?.label ?? '중립';
}

/** Abstract engraved insignia, not a letter or a flag sticker. */
export function nationSigil(ownerId) { return NATIONS[ownerId]?.sigil ?? ''; }
