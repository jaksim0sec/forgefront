import test from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world.js';
import { Terrain } from '../src/terrain.js';
import { Industry } from '../src/industry.js';
import { ItemConnections } from '../src/connections.js';
import { BUILD_COSTS, RECIPES } from '../src/progression.js';

test('deterministic mineral deposits and surface lead extraction', () => {
  const terrain = new Terrain();
  assert.equal(terrain.oreAt(-8, 8), 'iron');
  assert.equal(terrain.oreAt(9, -5), 'coal');
  assert.equal(terrain.oreAt(17, 8), 'titanium');
  assert.equal(terrain.oreAt(-8, 8), terrain.oreAt(-8, 8));
  const world = new World();
  world.terrain = terrain;
  world.place('tower', 0, -1, 0, 'north');
  world.place('leadCollector', -1, 0, 0, 'north');
  world.survival = true;
  const industry = new Industry(world, new ItemConnections(world));
  for (let i = 0; i < 30; i++) industry.step(.2);
  assert.ok(world.walletFor('north').lead >= 4);
  assert.equal(world.walletFor('south').lead ?? 0, 0);
});

test('construction draws real costs from a faction tower stockpile', () => {
  const w = new World(); w.terrain = new Terrain(); w.survival = true;
  assert.equal(w.build('drill', -8, 8, 0, 'north').reason, 'materials');
  w.credit('north', 'lead', 22);
  assert.equal(w.build('drill', 0, 0, 0, 'north').reason, 'ore');
  const drill = w.build('drill', -8, 8, 0, 'north');
  assert.equal(drill.ok, true);
  assert.equal(drill.entity.resourceId, 'iron');
  assert.equal(w.walletFor('north').lead, 14);
  assert.equal(w.build('smelter', 2, 0, 0, 'north').ok, true);
  assert.equal(w.walletFor('north').lead, 0);
  assert.equal(w.build('tower', 8, 0, 0, 'north').reason, 'restricted');
});

test('weak tower powers smelter, but not advanced factories', () => {
  const w = new World();
  w.place('tower', 0, -1, 0, 'north');
  const smelter = w.place('smelter', 2, 0, 0, 'north').entity;
  const advanced = w.place('siliconPlant', 6, 0, 0, 'north').entity;
  const industry = new Industry(w, new ItemConnections(w));
  industry.step(.2);
  assert.equal(smelter.powered, true);
  assert.equal(advanced.powered, false);
  industry.insert(smelter, 'lead', 2);
  industry.insert(smelter, 'iron', 2);
  for (let i = 0; i < 15; i++) industry.step(.2);
  assert.ok(smelter.inventory.parts >= 1);
  assert.deepEqual(RECIPES.superconductorPlant.inputs, { iron: 1, coal: 2, silicon: 2 });
});

test('coal generator enables coal-fed titanium drill and advanced synthesis', () => {
  const w = new World(); w.terrain = new Terrain();
  const generator = w.place('generator', 6, 1, 0, 'north').entity;
  const drill = w.place('poweredDrill', 17, 8, 0, 'north').entity;
  const silicon = w.place('siliconPlant', 11, 3, 0, 'north').entity;
  const superFactory = w.place('superconductorPlant', 7, 10, 0, 'north').entity;
  const industry = new Industry(w, new ItemConnections(w));
  industry.step(.2);
  assert.equal(drill.powered, false);
  industry.insert(generator, 'coal', 3);
  industry.insert(drill, 'coal', 2);
  industry.step(.2);
  assert.equal(drill.powered, true);
  for(let i=0;i<20;i++) industry.step(.2);
  assert.ok(drill.inventory.titanium > 0);
  industry.insert(silicon, 'iron', 4);
  industry.insert(silicon, 'coal', 4);
  for(let i=0;i<20;i++) industry.step(.2);
  assert.ok(silicon.inventory.silicon > 0);
  w.setEnabled(drill.id, false);
  w.setEnabled(silicon.id, false);
  industry.insert(superFactory, 'iron', 3);
  industry.insert(superFactory, 'coal', 6);
  industry.insert(superFactory, 'silicon', 6);
  for(let i=0;i<35;i++) industry.step(.2);
  assert.ok(superFactory.inventory.superconductor > 0);
  assert.deepEqual(BUILD_COSTS.superconductorPlant, { titanium: 16, silicon: 10 });
});
