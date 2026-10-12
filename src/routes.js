import { DIRECTIONS, itemPorts } from './ports.js';
import { STRUCTURES } from './world.js';

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
export function planConveyorRoute(world, route, fallbackRotation = 0) {
  if (!route.length) return { ok: false, reason: 'empty', cells: [] };
  const cells = [];
  for (let i = 0; i < route.length; i++) {
    const point = route[i], entity = world.getAt(point.x, point.y);
    const endpoint = !!entity && entity.type !== 'conveyor' && (i === 0 || i === route.length - 1) && route.length > 1;
    if (!world.inBounds(point.x, point.y) || (entity && entity.type !== 'conveyor' && !endpoint)) {
      return { ok: false, reason: entity ? 'occupied' : 'bounds', cells, blocked: point };
    }
    if (endpoint) { cells.push({ ...point, action: 'endpoint', id: entity.id }); continue; }
    let side;
    if (i + 1 < route.length) side = directionBetween(point, route[i + 1]);
    else if (entity) side = (entity.rotation + 2) % 4;
    else side = bestTerminalDirection(world, point, route[i - 1], (fallbackRotation + 2) % 4);
    if (side === null) return { ok: false, reason: 'disconnected', cells, blocked: point };
    const rotation = (side + 2) % 4;
    cells.push({ ...point, action: entity ? (entity.rotation === rotation ? 'keep' : 'rotate') : 'place', id: entity?.id ?? null, rotation });
  }
  return { ok: true, cells };
}

export function commitConveyorRoute(world, plan, ownerId = null) {
  if (!plan.ok) return { ok: false, count: 0, reason: plan.reason };
  let count = 0;
  world.batch(() => {
    for (const cell of plan.cells) {
      if (cell.action === 'place' && world.place('conveyor', cell.x, cell.y, cell.rotation, ownerId).ok) count++;
      else if (cell.action === 'rotate' && world.rotateConveyor(cell.id, cell.rotation)) count++;
    }
  });
  return { ok: true, count };
}
