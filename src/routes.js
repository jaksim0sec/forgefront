import { DIRECTIONS, itemPorts } from './ports.js';
import { STRUCTURES } from './world.js';
import { BUILD_COSTS, canAfford, sumCosts } from './progression.js';

export const ROUTE_LIMIT = 2048;
export function directionBetween(a, b) {
  for (let side = 0; side < 4; side++) if (b.x - a.x === DIRECTIONS[side].x && b.y - a.y === DIRECTIONS[side].y) return side;
  return null;
}

/** Fill skipped tiles orthogonally, trim loops and backtracks. */
export function extendRoute(route, target) {
  if (!Number.isInteger(target?.x) || !Number.isInteger(target?.y)) return route;
  if (!route.length) { route.push({ x: target.x, y: target.y }); return route; }
  let { x, y } = route.at(-1);
  const walk = (axis, destination) => {
    while (route.length < ROUTE_LIMIT && (axis === 'x' ? x : y) !== destination) {
      if (axis === 'x') x += Math.sign(destination - x);
      else y += Math.sign(destination - y);
      const prev = route.at(-2);
      if (prev && prev.x === x && prev.y === y) { route.pop(); continue; }
      const seen = route.findIndex(p => p.x === x && p.y === y);
      if (seen >= 0) { route.splice(seen + 1); continue; }
      route.push({ x, y });
    }
  };
  if (Math.abs(target.x - x) >= Math.abs(target.y - y)) { walk('x', target.x); walk('y', target.y); }
  else { walk('y', target.y); walk('x', target.x); }
  return route;
}

function bestTerminalDirection(world, point, previous, fallback) {
  for (let side = 0; side < 4; side++) {
    const delta = DIRECTIONS[side], nx = point.x + delta.x, ny = point.y + delta.y;
    if (previous && nx === previous.x && ny === previous.y) continue;
    const neighbor = world.getAt(nx, ny);
    if (neighbor && itemPorts(neighbor, STRUCTURES).some(p =>
      p.mode === 'in' && p.x === nx && p.y === ny && p.side === (side + 2) % 4)) return side;
  }
  return previous ? directionBetween(previous, point) : fallback;
}

/** Pure preview: endpoints may be existing producer/consumer facilities. */
export function planConveyorRoute(world, route, fallbackRotation = 0, ownerId = null) {
  if (!route.length) return { ok: false, reason: 'empty', cells: [] };
  const cells = [];
  for (let i = 0; i < route.length; i++) {
    const point = route[i], entity = world.getAt(point.x, point.y);
    const endpoint = !!entity && entity.type !== 'conveyor' && (i === 0 || i === route.length - 1) && route.length > 1;
    if (!world.inBounds(point.x, point.y) || (entity && entity.type !== 'conveyor' && !endpoint)) {
      return { ok: false, reason: entity ? 'occupied' : 'bounds', cells, blocked: point };
    }
    if (world.survival && world.territory && (!ownerId ||
        world.territory.ownerAt(point.x, point.y) !== ownerId)) {
      return { ok: false, reason: 'territory', cells, blocked: point };
    }
    if (entity && entity.type === 'conveyor' && world.survival && entity.ownerId !== ownerId)
      return { ok: false, reason: 'territory', cells, blocked: point };
    if (endpoint) { cells.push({ ...point, action: 'endpoint', id: entity.id }); continue; }
    let side;
    if (i + 1 < route.length) side = directionBetween(point, route[i + 1]);
    else side = entity ? (entity.rotation + 2) % 4 : (route.length > 1 && route[i - 1] ? directionBetween(route[i - 1], point) : bestTerminalDirection(world, point, null, (fallbackRotation + 2) % 4));

    if (side === null) return { ok: false, reason: 'disconnected', cells, blocked: point };
    const rotation = (side + 2) % 4;
    // An isolated endpoint accepts feeds from any non-output side. A drawn
    // continuous route keeps its explicitly specified incoming side.
    const inputSide = i > 0 ? directionBetween(point, route[i - 1]) : null;
    const unchanged = entity && entity.rotation === rotation && entity.inputSide === inputSide;
    cells.push({ ...point, action: entity ? (unchanged ? 'keep' : 'rotate') : 'place', id: entity?.id ?? null, rotation, inputSide });
  }
  return { ok: true, cells };
}

export function commitConveyorRoute(world, plan, ownerId = null) {
  if (!plan.ok) return { ok: false, count: 0, reason: plan.reason };
  // Transaction preflight: an invalid endpoint or enemy belt must never
  // leave a partially placed line behind.
  if (world.survival && world.territory) for (const cell of plan.cells) {
    if (cell.action === 'endpoint') continue;
    if (!ownerId || world.territory.ownerAt(cell.x, cell.y) !== ownerId ||
        (cell.id && world.structures.get(cell.id)?.ownerId !== ownerId))
      return { ok: false, count: 0, reason: 'territory', blocked: cell };
  }
  const placements = plan.cells.filter(cell => cell.action === 'place').length;
  if (world.survival && !canAfford(world.walletFor(ownerId), sumCosts('conveyor', placements))) {
    return { ok: false, count: 0, reason: 'materials', cost: sumCosts('conveyor', placements) };
  }
  let count = 0;
  world.batch(() => {
    for (const cell of plan.cells) {
      if (cell.action === 'place') {
        const result = world.survival
          ? world.build('conveyor', cell.x, cell.y, cell.rotation, ownerId, cell.inputSide)
          : world.place('conveyor', cell.x, cell.y, cell.rotation, ownerId, cell.inputSide);
        if (result.ok) count++;
      } else if (cell.action === 'rotate' && world.rotateConveyor(cell.id, cell.rotation, cell.inputSide)) count++;
    }
  });
  return { ok: true, count };
}
