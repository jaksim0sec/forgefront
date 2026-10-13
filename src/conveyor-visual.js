/** Visual-only conveyor seams, based on the actual directed connection graph.
 * No change to transport directions or production rules.
 */
export function conveyorOpenSides(entity, connections, world) {
  if (entity.type !== 'conveyor') return [];
  const sides = new Set();
  const visit = (link, output) => {
    const other = world.structures.get(output ? link.to : link.from);
    if (!other || other.type !== 'conveyor' || other.ownerId !== entity.ownerId) return;
    // Contacts contain the source-facing side. Inbound side is opposite.
    for (const contact of link.contacts) {
      const worldSide = output ? contact.side : (contact.side + 2) % 4;
      sides.add((worldSide - entity.rotation + 4) % 4);
    }
  };
  for (const link of connections.outputs(entity.id).values()) visit(link,true);
  for (const link of connections.inputs(entity.id).values()) visit(link,false);
  return [...sides].sort();
}
/** Short bridge across the shared tile edge, covering only the facing rim. */
export function conveyorSeamPath(sides) {
  return sides.map(side => [
    'M17 1H31','M47 17V31','M17 47H31','M1 17V31'
  ][side]).join(' ');
}
