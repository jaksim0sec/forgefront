/** Cardinal sides are clockwise: north=0, east=1, south=2, west=3. */
export const DIRECTIONS = Object.freeze([
  Object.freeze({ x: 0, y: -1 }),
  Object.freeze({ x: 1, y: 0 }),
  Object.freeze({ x: 0, y: 1 }),
  Object.freeze({ x: -1, y: 0 }),
]);

/** Prototype item-port rules. Later: type filters, liquids, configuration.
 * A port is on the exterior edge of a structure; each edge tile has its own
 * contact. Rotation rotates *both* side and edge-cell position.
 */
const port = (side, mode) => Object.freeze({ side, mode });
export const ITEM_PORTS = Object.freeze({
  conveyor: Object.freeze([port(0, 'in'), port(1, 'in'), port(3, 'in'), port(2, 'out')]),
  junction: Object.freeze([0, 1, 2, 3].flatMap(side => [port(side, 'in'), port(side, 'out')])),
  tunnelEntrance: Object.freeze([port(2,'in')]),
  tunnelExit: Object.freeze([port(0,'out')]),
  drill: Object.freeze([0, 1, 2, 3].map(side => port(side, 'out'))),
  leadCollector: Object.freeze([0, 1, 2, 3].map(side => port(side, 'out'))),
  tower: Object.freeze([0, 1, 2, 3].map(side => port(side, 'in'))),
  poweredDrill: Object.freeze([...[0, 1, 2, 3].map(side => port(side, 'in')), port(0, 'out'), port(1, 'out'), port(2, 'out')]),
  siliconPlant: Object.freeze([0, 1, 2, 3].flatMap(side => [port(side, 'in'), port(side, 'out')])),
  superconductorPlant: Object.freeze([0, 1, 2, 3].flatMap(side => [port(side, 'in'), port(side, 'out')])),
  smelter: Object.freeze([0, 1, 2, 3].flatMap(side => [port(side, 'in'), port(side, 'out')])),
  generator: Object.freeze([0, 1, 2, 3].map(side => port(side, 'in'))),
  warehouse: Object.freeze([0, 1, 2, 3].flatMap(side => [port(side, 'in'), port(side, 'out')])),
});

export function rotateCell(x, y, width, height, rotation) {
  switch (rotation) {
    case 0: return { x, y };
    case 1: return { x: height - 1 - y, y: x };
    case 2: return { x: width - 1 - x, y: height - 1 - y };
    case 3: return { x: y, y: width - 1 - x };
    default: throw new Error('Invalid quarter turn');
  }
}

/** Ports returned in world tile coordinates, without allocating world tiles. */
export function itemPorts(structure, definitions) {
  const definition = definitions[structure.type];
  if (!definition) return [];
  const rules = ITEM_PORTS[structure.type] ?? [];
  const result = [];
  for (const { side, mode } of rules) {
    const horizontal = side === 0 || side === 2;
    const length = horizontal ? definition.width : definition.height;
    for (let offset = 0; offset < length; offset++) {
      const localX = side === 1 ? definition.width - 1 : side === 3 ? 0 : offset;
      const localY = side === 2 ? definition.height - 1 : side === 0 ? 0 : offset;
      const pos = rotateCell(localX, localY, definition.width, definition.height, structure.rotation);
      const rotatedSide = (side + structure.rotation) % 4;
      result.push({ x: structure.x + pos.x, y: structure.y + pos.y, side: rotatedSide, mode });
    }
  }
  return result;
}

export function opposite(side) { return (side + 2) % 4; }
