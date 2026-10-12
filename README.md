# FORGEFRONT

Browser-based industrial territory strategy game. **Current stage: M05 industrial progression prototype.** Static app with no server-side gameplay code or runtime dependencies.

## Implemented

- **Map foundation:** 2048 × 2048 logical tile coordinates; sparse 32×32 allocation for occupied chunks, ID-indexed structures. The deterministic terrain now supplies elevation, slope and muted landcover biomes without allocating a tile array.
- **Camera:** arrow keys / wheel, one-finger pan / two-finger pinch, clamped 40–300% zoom.
- **Industrial editor:** multi-tile footprints, placement, removal, rotation, canvas culling.
- **Conveyor route drawing:** click and drag on desktop; tile gap filling, corner turns, preview, auto-selected conveyor orientation, reorientation of existing route tiles. Placement validated before commit and connections rebuilt around changed neighbors rather than globally.
- **Touch gestures:** one-finger pan by default; hold a building or conveyor tool on the map for 350ms, then drag to build. Moving before the hold pans the camera. Pinch cancels an incomplete conveyor stroke. Tap places a single building or conveyor.
- **Directional item connectivity:** input/output ports on all four sides where configured, with incremental graph updates when structures rotate or are installed/destroyed.
- **Structure state:** health and max health, enabled flag, activity, production progress and item inventory. Test damage and enable/disable from inspector.
- **Entity hierarchy:** dynamic unit and projectile registries have health without occupying building tiles; visual effects are separate and have no health.
- **Resources:** six original SVGs in `source/resources/` linked via `src/resources.js`. Resource library and inventory icons are visible in UI.
- **Industrial vertical slice:** a drill produces a configurable raw resource; nearby conveyors carry items at a capped rate into a receiving structure. This is a **placeholder logistics experiment**, not finalized recipes, power generation or terrain deposits.
- **Nation identity:** steel/neutral building shells with subtle engraved faction rune; faction identity controlled through `--nation-color`, not a full-building tint. Nation registry can be expanded.


## M05 — Resource and power progression

The **actual M05 build mode uses `World.build()`**, which checks national stockpiles and deposits. The existing lower-level `World.place()` remains available for internal fixtures and compatibility with parallel development.

1. **Lead:** a free surface lead collector needs no mining power. The starting northern tower collects lead from an adjacent collector, providing early building materials.
2. **Iron and coal:** a lead-built ordinary drill can mine either resource, only when its footprint covers a matching ore deposit.
3. **Smelting:** a lead-built smelter consumes **lead + iron → metal parts**, using only **2 power** from the tower's tiny **3-power** supply.
4. **Coal electricity:** metal parts unlock coal generators. They must actually receive and burn **coal** to supply **28 power** locally.
5. **Titanium:** the advanced drill costs **iron + metal parts** and requires both **electricity + coal** to mine a titanium deposit.
6. **Silicon:** a factory costing **titanium + metal parts** processes **iron + coal → silicon** using electricity.
7. **Superconductors:** the final factory costs **titanium + silicon**, then processes **iron + coal + silicon → superconductor**, drawing substantial electricity.

Ore veins and ground elevation are generated from coordinates with a deterministic seed rather than millions of stored tile objects. Starter iron, coal and titanium veins remain reachable at their original locations, now with irregular natural edges. Normal factories cannot be built on high mountain ridges or excessively uneven footprints; free conveyors and junctions keep their prior routing rules. The renderer samples only the visible terrain; camera-independent simulation tracks only active facilities and occupied conveyors.

**Supply matters:** resources must be delivered through port-connected infrastructure into a nation's tower before the stockpile can spend them on construction. The temporary power model uses tower/generator local coverage and bounded power budgets; wire networks and capture-driven tower power will come later. Initial generator and refinery rates/costs are prototype balancing values, not finalized game design.

The first M05 bootstrapped scene consists of a northern tower and adjacent free lead collector. Other national colors remain selectable, but factions without a tower have no construction stockpile production until territory mechanics are introduced.

The new `src/progression.js` owns the recipes/build costs, `src/terrain.js` generates mineral patches, `src/power.js` allocates scarce electricity, and `src/terrain-render.js` handles the visible ore visuals. An SVG for the intermediate metal parts lives in `source/resources/parts.svg`. Conveyor item SVGs are 23px wide at normal zoom, up from 17px.

## Controls

| Input | Result |
| --- | --- |
| PC arrow keys / scroll | Move / zoom camera |
| PC conveyor tool + mouse drag | Draw continuous conveyor route |
| PC right-click | Remove building |
| Mobile one finger | Pan camera |
| Mobile two fingers | Pinch zoom; cancel pending paint |
| Mobile long press + drag with any building tool | Draw a conveyor route or repeat building placement |
| Tap / click building tool | Place selected prototype building |
| R / Rotate button | Rotation for new structures |
| V / X | Select / delete mode |
| 1 / 2 / 3 / 4 | Conveyor / drill / smelter / generator |
| Faction controls | Set owner for new or selected structures |
| Sample button | Place test drill → belt → receiver system |

Select a building to view its health, current stock and activity. Drill resources can be changed in the inspector.

## Local run

```sh
python3 -m http.server 8080
# Open http://localhost:8080
```

Optional focused checks: `npm test` (Node.js). No external dependencies.

## Architecture

`src/world.js` is the single owner of structures, nation stockpiles and sparse occupancy; `src/routes.js` computes tentative conveyor paths; `src/ports.js` and `src/connections.js` calculate directed contacts; `src/industry.js` advances only active producers and occupied belts; `src/entities.js` manages units/projectiles separately; `src/resources.js` resolves SVG metadata; `src/render.js` handles only visible SVG elements; `src/main.js` contains the gesture and editor state machine. Nation insignia and metadata live in `src/nations.js`.

### Rendering scalability (incremental)

- Buildings and their connection lines remain the original SVG artwork, but now live in world coordinates. Panning or zooming updates one transform per layer instead of every building's transform.
- The renderer keeps per-structure SVG references and avoids rewriting unchanged placement, activity, ownership, health and cargo attributes. Connection paths are recalculated only when connection revision, camera-visible IDs, link visibility or selection changes.
- Real resource transfer events are animated on **one transparent Canvas2D layer** (maximum 48 concurrent sprites), tracking the camera during movement. If Canvas2D is unavailable, the old SVG animation remains available.
- Camera input, building selection, world simulation and industrial logic are unchanged. This is not yet WebGL instancing, and large-scale performance still needs browser profiling before promising a unit count.
- At zoom levels below 58%, machine artwork is rasterized from the **existing SVG definitions** into one Canvas2D layer. Visible buildings and belts are drawn in one pass without adding an SVG node per structure; near zoom retains full SVG details and interactions.
- Distant LOD retains rotations, simplified factory-state lights, team ownership marks, conveyor turns, selection/health cues and screen-space culling. It falls back to the previous SVG path automatically if Canvas2D isn't available.
- This is Canvas2D **batching, not yet GPU instancing**; large-scale FPS on mobile browsers has not been measured.
- The Service Worker includes both renderer modules for offline PWA use.
- **M05 terrain rasterization:** independent 16×16 terrain chunks now bake ground texture and ore decals into at most two SVG `<image>` elements per visible chunk. The Canvas2D raster surface is only used as scratch space; the DOM still owns selection/gestures and the normal SVG drawing order.
- The ground palette, shallow rock textures, contour edges, biome classification, ore composition and starter veins all derive from the same seeded `Terrain` queries. No terrain images are created every frame: the camera moves two SVG parent layers.
- Existing resource SVG art is drawn into the ore chunk when it loads; a small drawn mineral-shard fallback covers image load delays or environments without a usable Canvas2D surface. No WebGL/GPU requirement and no per-tile canvas/DOM attachment.
- `World.canBuild()` respects impassable ridge height and footprint unevenness for stationary factories. `World.place()` stays an unrestricted fixture/editor primitive, and conveyor routes keep their existing semantics.


### Next milestones

- M05: first economy, recipe and local-power vertical slice implemented; refine network topology and balance.
- M06: faction towers, ownership/territory bounds, capture and territory-dependent power activation. Reuse the new seeded elevation for defensible high ground without coupling terrain rendering to the territory state.
- M07: defense lines, attack units and real projectile simulation; spatial indexing for moving entities.
- M08: persistent world/save snapshots, bulk-logistics optimizations and profile-guided rendering upgrades.

Not implemented: multiplayer, proper physical power cables, territorial capture, advanced full-factory recipes/balancing, pathfinding or automated combat. SVG assets and game logic are separate to keep them editable and cheap to render.
