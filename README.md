# FORGEFRONT

Browser-based industrial territory strategy game. **Current stage: M04 factory interaction prototype.** Static app with no server-side gameplay code or runtime dependencies.

## Implemented

- **Map foundation:** 2048 × 2048 logical tile coordinates; sparse 32×32 allocation for occupied chunks, ID-indexed structures.
- **Camera:** arrow keys / wheel, one-finger pan / two-finger pinch, clamped 40–300% zoom.
- **Industrial editor:** multi-tile footprints, placement, removal, rotation, canvas culling.
- **Conveyor route drawing:** click and drag on desktop; tile gap filling, corner turns, preview, auto-selected conveyor orientation, reorientation of existing route tiles. Placement validated before commit and connections rebuilt around changed neighbors rather than globally.
- **Touch gestures:** one-finger camera pan by default; separate "터치 경로 건설" toggle to draw conveyor paths. Pinch cancels any incomplete touch stroke. Tap still places a single building or conveyor.
- **Directional item connectivity:** input/output ports on all four sides where configured, with incremental graph updates when structures rotate or are installed/destroyed.
- **Structure state:** health and max health, enabled flag, activity, production progress and item inventory. Test damage and enable/disable from inspector.
- **Entity hierarchy:** dynamic unit and projectile registries have health without occupying building tiles; visual effects are separate and have no health.
- **Resources:** six original SVGs in `source/resources/` linked via `src/resources.js`. Resource library and inventory icons are visible in UI.
- **Industrial vertical slice:** a drill produces a configurable raw resource; nearby conveyors carry items at a capped rate into a receiving structure. This is a **placeholder logistics experiment**, not finalized recipes, power generation or terrain deposits.
- **Nation identity:** steel/neutral building shells with subtle engraved faction rune; faction identity controlled through `--nation-color`, not a full-building tint. Nation registry can be expanded.

## Controls

| Input | Result |
| --- | --- |
| PC arrow keys / scroll | Move / zoom camera |
| PC conveyor tool + mouse drag | Draw continuous conveyor route |
| PC right-click | Remove building |
| Mobile one finger | Pan camera |
| Mobile two fingers | Pinch zoom; cancel pending paint |
| Mobile touch drawing toggle + conveyor tool | Draw a conveyor route |
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

`src/world.js` is the single owner of structures and sparse occupancy; `src/routes.js` computes tentative conveyor paths; `src/ports.js` and `src/connections.js` calculate directed contacts; `src/industry.js` advances only active producers and occupied belts; `src/entities.js` manages units/projectiles separately; `src/resources.js` resolves SVG metadata; `src/render.js` handles only visible SVG elements; `src/main.js` contains the gesture and editor state machine. Nation insignia and metadata live in `src/nations.js`.

### Next milestones

- M05: terrain/ore deposits, per-building resource recipes, stockpiles and power graphs with tower-provided base power.
- M06: faction towers, ownership/territory bounds, capture and territory-dependent power activation.
- M07: defense lines, attack units and real projectile simulation; spatial indexing for moving entities.
- M08: persistent world/save snapshots, bulk-logistics optimizations and profile-guided rendering upgrades.

Not implemented: multiplayer, functional terrain deposits, advanced factory recipes, actual power consumption, territory capture, pathfinding or automated combat. SVG assets and game logic are separate to keep them editable and cheap to render.
