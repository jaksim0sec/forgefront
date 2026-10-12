import { STRUCTURES } from './world.js';
import { DIRECTIONS, itemPorts, opposite } from './ports.js';

/** Incremental, directed item routing. A route is a valid OUT -> IN port pair.
 * Graph data is derived: canonical structure positions remain in World.
 * No throughput or item simulation occurs in this class.
 */
export class ItemConnections {
  constructor(world) {
    this.world = world;
    this.outgoing = new Map(); // sourceId -> Map<targetId, link>
    this.incoming = new Map(); // targetId -> Map<sourceId, link>
    this.linkCount = 0;
    this.revision = 0;
    this.lastRebuilt = 0; // diagnostic: number of nodes revisited on last mutation
    this.unsubscribe = world.subscribe(change => {
      if (change.type === 'place' || change.type === 'remove') this.rebuildAround(change.entity);
    });
    // Supports construction after a world has already been populated.
    for (const entity of world.structures.values()) this.rebuildAround(entity);
  }

  dispose() {
    this.unsubscribe();
    this.outgoing.clear();
    this.incoming.clear();
    this.linkCount = 0;
  }

  inputs(id) { return this.incoming.get(id) ?? new Map(); }
  outputs(id) { return this.outgoing.get(id) ?? new Map(); }

  link(fromId, toId) { return this.outgoing.get(fromId)?.get(toId) ?? null; }

  /** All structures which touch the edited footprint, including corner-free
   * cardinal contacts. No global structure scan even for a huge world.
   */
  touching(entity) {
    const ids = new Set([entity.id]);
    const { x, y, width: w, height: h } = entity;
    for (let dx = 0; dx < w; dx++) {
      const top = this.world.getAt(x + dx, y - 1);
      const bottom = this.world.getAt(x + dx, y + h);
      if (top) ids.add(top.id);
      if (bottom) ids.add(bottom.id);
    }
    for (let dy = 0; dy < h; dy++) {
      const left = this.world.getAt(x - 1, y + dy);
      const right = this.world.getAt(x + w, y + dy);
      if (left) ids.add(left.id);
      if (right) ids.add(right.id);
    }
    return ids;
  }

  dropNode(id) {
    // Remove outgoing links and their mirror in incoming.
    for (const dst of this.outputs(id).keys()) {
      this.incoming.get(dst)?.delete(id);
      if (this.incoming.get(dst)?.size === 0) this.incoming.delete(dst);
      this.linkCount--;
    }
    this.outgoing.delete(id);
    // Remove inbound links and their mirror in outgoing.
    for (const src of this.inputs(id).keys()) {
      this.outgoing.get(src)?.delete(id);
      if (this.outgoing.get(src)?.size === 0) this.outgoing.delete(src);
      this.linkCount--;
    }
    this.incoming.delete(id);
  }

  appendContact(source, target, contact) {
    let edges = this.outgoing.get(source.id);
    if (!edges) this.outgoing.set(source.id, edges = new Map());
    let link = edges.get(target.id);
    if (!link) {
      link = { from: source.id, to: target.id, contacts: [] };
      edges.set(target.id, link);
      let incoming = this.incoming.get(target.id);
      if (!incoming) this.incoming.set(target.id, incoming = new Map());
      incoming.set(source.id, link);
      this.linkCount++;
    }
    link.contacts.push(contact);
  }

  /** A structure's static ports only affect edges incident to *that* structure.
   * Rebuild those pairs, never drop an unaffected neighbor's other routes.
   * A long conveyor chain therefore stays O(footprint perimeter) per edit.
   */
  rebuildAround(entity) {
    const touching = this.touching(entity);
    this.lastRebuilt = touching.size;
    this.dropNode(entity.id);
    const live = this.world.structures.get(entity.id);
    if (live) {
      for (const id of touching) {
        if (id === entity.id) continue;
        const neighbor = this.world.structures.get(id);
        if (!neighbor) continue;
        this.rebuildPair(live, neighbor);
        this.rebuildPair(neighbor, live);
      }
    }
    this.revision++;
  }

  rebuildPair(source, target) {
    const input = new Set(itemPorts(target, STRUCTURES)
      .filter(p => p.mode === 'in')
      .map(p => `${p.x},${p.y},${p.side}`));
    for (const port of itemPorts(source, STRUCTURES)) {
      if (port.mode !== 'out') continue;
      const direction = DIRECTIONS[port.side];
      const x = port.x + direction.x;
      const y = port.y + direction.y;
      if (this.world.getAt(x, y)?.id !== target.id) continue;
      if (!input.has(`${x},${y},${opposite(port.side)}`)) continue;
      this.appendContact(source, target, { x: port.x, y: port.y, side: port.side });
    }
  }

  /** Explore directed reachability. Called for inspection only, not every frame. */
  downstream(startId) {
    if (!this.world.structures.has(startId)) return new Set();
    const visited = new Set([startId]);
    const pending = [startId];
    for (let i = 0; i < pending.length; i++) {
      for (const id of this.outputs(pending[i]).keys()) {
        if (visited.has(id)) continue;
        visited.add(id);
        pending.push(id);
      }
    }
    return visited;
  }
}
