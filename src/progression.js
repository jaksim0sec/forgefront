/**
 * FORGEFRONT's first production ladder.
 * Building costs use the local nation's tower stockpile.
 * Metal parts are a manufactured intermediate, not a seventh raw ore.
 */
export const BUILD_COSTS = Object.freeze({
  tower: null, // strategic starting structure; not freely constructible
  leadCollector: Object.freeze({}),
  conveyor: Object.freeze({ lead: 1 }),
  junction: Object.freeze({ lead: 2 }),
  drill: Object.freeze({ lead: 8 }),
  smelter: Object.freeze({ lead: 14 }),
  generator: Object.freeze({ lead: 4, parts: 6 }),
  turret: Object.freeze({ lead: 12, iron: 6 }),
  poweredDrill: Object.freeze({ iron: 8, parts: 4 }),
  siliconPlant: Object.freeze({ titanium: 10, parts: 4 }),
  superconductorPlant: Object.freeze({ titanium: 16, silicon: 10 }),
});
export const RECIPES = Object.freeze({
  smelter: Object.freeze({
    inputs: Object.freeze({ lead: 1, iron: 1 }),
    output: 'parts', amount: 1, seconds: 2.5, powerUse: 2,
  }),
  siliconPlant: Object.freeze({
    inputs: Object.freeze({ iron: 1, coal: 1 }),
    output: 'silicon', amount: 1, seconds: 3.5, powerUse: 10,
  }),
  superconductorPlant: Object.freeze({
    inputs: Object.freeze({ iron: 1, coal: 2, silicon: 2 }),
    output: 'superconductor', amount: 1, seconds: 6, powerUse: 17,
  }),
});
export const INDUSTRY_TIERS = Object.freeze([
  Object.freeze({ id: 'lead', title: '납과 초기 채집', types: Object.freeze(['leadCollector', 'drill', 'smelter']) }),
  Object.freeze({ id: 'coal', title: '제련과 석탄 발전', types: Object.freeze(['generator']) }),
  Object.freeze({ id: 'titanium', title: '고전력 티타늄 채굴', types: Object.freeze(['poweredDrill']) }),
  Object.freeze({ id: 'silicon', title: '실리콘 가공', types: Object.freeze(['siliconPlant']) }),
  Object.freeze({ id: 'superconductor', title: '초전도체 합성', types: Object.freeze(['superconductorPlant']) }),
]);
export function canAfford(owned, cost) {
  if (!cost) return false;
  return Object.entries(cost).every(([id, n]) => (owned[id] ?? 0) >= n);
}
export function consumeCost(owned, cost) {
  if (!canAfford(owned, cost)) return false;
  for (const [id, n] of Object.entries(cost)) owned[id] -= n;
  return true;
}
export function sumCosts(type, count) {
  if (!Number.isSafeInteger(count) || count < 0) return null;
  const cost = BUILD_COSTS[type];
  return cost ? Object.fromEntries(Object.entries(cost).map(([id, n]) => [id, n * count])) : null;
}
