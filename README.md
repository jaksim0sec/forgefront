# FORGEFRONT

Browser-based industrial territory strategy game. **Current stage: M07 early defense prototype; territory-restricted industrial progression remains playable.** Static app with no server-side gameplay code or runtime dependencies.

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

## M06 — Command towers, cliffs and territory (first slice)

- Existing `tower` is now explicitly the **2×2 central command tower** (700 HP, tower stockpile, 3 starter power), with a purpose-built fortified SVG instead of the generic lightning-bolt icon. The structure type, item ports, health and power behavior stay compatible with the M05 economy.
- The starter map has a northern command tower at its existing location and a southern rival tower beyond the starting camera. Each owned tower claims territory within **22 tiles**, and overlapping influence is assigned to the nearest tower deterministically. Neutral towers claim nothing.
- `src/territory.js` owns the claim model and coarse spatial index, with targeted invalidation for tower placement, removal, damage and change of ownership. Ownership can currently be edited in the existing inspector; **unit-based combat and capture progress are not implemented yet**.
- `src/territory-render.js` bakes nation colors and border-only outlines into at most one image per visible 16×16 chunk; repaint happens only when tower ownership changes or new chunks become visible. The UI includes a territory visibility toggle and selected structure's territory status.
- Build-blocking highlands now share the public `CLIFF_HEIGHT = 0.78` constant with the terrain art. The ground layer paints actual impassable cells as clear basalt cliff faces with bright upper edges, dark strata and relief shadows; the hover HUD identifies them as **절벽**. Existing construction rules and free routing behavior are unchanged.
- This is a **territory influence foundation**, not full conquest gameplay. Tower logistics still work, and the map is designed to accommodate future front lines and units without changing the industry tick.

## M07 — Territory building rules, terrain relief and first defense prototype

- **Territorial construction:** in survival mode the game injects the current `Territory` index into `World`. Every occupied tile of a proposed structure footprint must belong to the constructing nation. Neutral and enemy tiles cannot be used, even for a zero-cost collector or a single conveyor. The unrestricted `World.place()` path stays available only as a fixture/editor primitive.
- **Atomic conveyor borders:** preview and commit both validate the entire conveyor route, including enemy-owned existing belts; an invalid segment cannot leave a partially installed route. The no-cost example facility is restricted to the northern starting territory.
- **Topographic relief:** deterministic ridgeline bands now create long walls and valleys, with raised-step shadows, terrace edges, visible rock faces and cliff highlights. Building cutoff and render cutoff continue to share the same `CLIFF_HEIGHT`; starter material veins remain accessible.
- **Defensive turret:** new 2×2 `turret` structure with unique SVG sprite, 260 health and material cost of 12 lead + 6 iron. It needs 2 power from the existing `PowerGrid`, acquires hostile scouting units within 9 tiles, and fires bounded projectile entities that apply real unit health damage.
- **Terrain in combat:** steep slopes slow scouting units and impassable cliffs block movement and turret line of sight. Small manually initiated drone raids approach the chosen nation's central command tower and can inflict limited structural damage on reaching it. There are no unsolicited attacks or autonomous enemy production.
- **Batching:** `src/combat.js` operates on the existing `world.units`/`world.projectiles` registries without any dependency on rendering. `src/combat-render.js` draws interpolated units and projectiles on one passive Canvas2D layer with no per-unit DOM elements. The frame loop stops when no dynamic objects remain.
- The BUILD bar includes the turret, its range is drawn while selected, and the toolbox has a manual scout raid test action.

The unit movement here is a local training scenario, not yet full pathfinding or battlefield AI. There is no automatic tower capture, ammo industry, ammunition routing, real-player multiplayer or sophisticated combat balancing yet.

## Mobile UX and portrait PWA update
- Fixed bottom status and help HUD panels have been removed. Selected-object context now appears in a small non-interactive label near the top of the screen; camera reset is available within the toolbox.
- The toolbox keeps one SVG thumbnail and one label per tool with tighter mobile spacing. The full editor still folds into select / conveyor / delete.
- Repeated-building drags use a stable origin-aligned footprint grid, even through sharp corners. `src/build-stroke.js` is isolated and tested independently.
- Opposing southern command tower moved farther away to (70, -25). Natural ridge bands are more frequent; blocked cliffs use the same slate shading family as nearby rock, with relief edges rather than stamped black stripes.
- Manifest prefers landscape orientation. On launch the installed standalone PWA requests a landscape lock if supported and permitted; browsers may refuse the lock.

## Palette and defensible terrain update
- The wide top brand/status banner and side watermark are removed from the playable viewport.
- Build/inspect view is docked to the right on widescreen and portrait screens; the toolbox keeps its own scroll.
- The build palette is split into Basic / Production / Defense groups, each tool has only one title and one SVG illustration.
- Resource construction costs use the actual SVG resource icon, required quantity and a low-stock appearance rather than ambiguous text alone.
- A deterministic winding escarpment rises between the factions around the map's midfront, but has two open passages. The height function determines both collision and appearance; original tutorial resources and both starting towers remain reachable.
- The portrait-mode PWA orientation setting remains unchanged.

## Conveyor seams, distant rendering and compact build palette
- Adjacent conveyor sprites only visually join on sides confirmed by actual directed item links. Border bridge decals respect belt turns, rotations and faction separation. The gameplay connection graph is unchanged.
- The distant building canvas caps pixel density to reduce zoomed-out fill rate; it retains the existing sprite artwork and seam decals. This is a targeted rendering adjustment, not a verified device FPS improvement.
- The construction palette now uses collapsible category buttons; only one group is expanded at a time.
- When the main drawer is collapsed, its upper row has Select beside the expansion control; the lower row offers the most recently selected building, Conveyor, and Demolish. The recent-building shortcut never expands the drawer.
- New on-screen building feedback and messages use concise, polite Korean.

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

`src/territory.js` is the derived territory index, with `src/territory-render.js` rendering visible borders; `src/world.js` is the single owner of structures, nation stockpiles and sparse occupancy; `src/routes.js` computes tentative conveyor paths; `src/ports.js` and `src/connections.js` calculate directed contacts; `src/industry.js` advances only active producers and occupied belts; `src/entities.js` manages units/projectiles separately; `src/resources.js` resolves SVG metadata; `src/render.js` handles only visible SVG elements; `src/main.js` contains the gesture and editor state machine. Nation insignia and metadata live in `src/nations.js`.

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
- M06: basic faction influence, drawn boundaries and full-footprint owned-territory build restrictions implemented; next add real capture conditions and territory-aware industry operation.
- M07: first powered defense turret, bounded scout units and real projectile damage implemented; next expand to attack units, defense lines, mobile-unit spatial indexing and proper navigation.
- M08: persistent world/save snapshots, bulk-logistics optimizations and profile-guided rendering upgrades.

Not implemented: multiplayer, proper physical power cables, unit-based territorial capture, advanced full-factory recipes/balancing, pathfinding or automated combat. SVG assets and game logic are separate to keep them editable and cheap to render.
