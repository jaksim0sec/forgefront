import { Terrain } from './terrain.js';
import { TerrainRenderer } from './renderer.js';

/** Single integration entry point. No global state or input handlers. */
export function installTerrain({ world, camera, svg, seed = 1738 }) {
  const terrain = new Terrain({ seed, chunkSize: world.config.chunkSize });
  world.setPlacementRule((type, x, y, rotation, area) =>
    terrain.canBuild(type, x, y, area.width, area.height));
  const renderer = new TerrainRenderer(svg, camera, world, terrain);
  return { terrain, draw: () => renderer.draw() };
}
