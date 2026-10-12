// Resource definitions are UI metadata only; no inventory/production behavior is implied.
const iconUrl = (id) => new URL(`../source/resources/${id}.svg`, import.meta.url).href;

export const RESOURCES = Object.freeze({
  lead: Object.freeze({ id: 'lead', label: '납', kind: 'raw', icon: iconUrl('lead') }),
  iron: Object.freeze({ id: 'iron', label: '철', kind: 'raw', icon: iconUrl('iron') }),
  titanium: Object.freeze({ id: 'titanium', label: '티타늄', kind: 'raw', icon: iconUrl('titanium') }),
  coal: Object.freeze({ id: 'coal', label: '석탄', kind: 'raw', icon: iconUrl('coal') }),
  silicon: Object.freeze({ id: 'silicon', label: '실리콘', kind: 'raw', icon: iconUrl('silicon') }),
  superconductor: Object.freeze({ id: 'superconductor', label: '초전도체', kind: 'processed', icon: iconUrl('superconductor') }),
  parts: Object.freeze({ id: 'parts', label: '금속 부품', kind: 'processed', icon: iconUrl('parts') }),
});

export const RESOURCE_IDS = Object.freeze(Object.keys(RESOURCES));

export function getResource(id) {
  return RESOURCES[id] ?? null;
}
