# FORGEFRONT

An industrial territory strategy game, built around detailed factory construction and tower-led territorial control.

## Current scope — M02 World & Placement Foundation

The world is a **2048 × 2048 logical tile map**, centered on (0, 0). Its empty tiles do **not** exist as JavaScript objects. Grid coordinates are computed from continuous world coordinates; only regions containing structures allocate occupancy data.

### Implemented

- M01 camera preserved: one-finger pan, two-finger pinch, arrow-key pan and pointer-anchored wheel zoom (40–300%).
- O(1) world-pixel ↔ tile conversion using 48 world units per tile.
- Sparse 32 × 32 chunk occupancy backed by `Uint32Array`; unoccupied chunks use no occupancy arrays.
- Structure registry with stable numeric IDs; each occupied tile stores its structure ID.
- Bounds, overlap, rotated footprint and atomic placement checks for 1×1, 2×2 and 3×2 test structures.
- Removal frees tile claims and deletes chunks that become empty.
- Viewport culling by occupied chunks, with SVG symbol reuse.
- Touch tap / mouse click placement, selection, rotation and deletion; a camera drag or pinch does not place anything.
- Developer HUD for tile coordinate, total structures and allocated chunks.

### Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Move camera | Arrow keys | One-finger drag |
| Zoom | Mouse wheel / trackpad | Two-finger pinch |
| Select or place | Click | Tap |
| Rotate construction | R or Rotate button | Rotate button |
| Select / place tools | V, 1–4 | Toolbar |
| Remove | X tool or right-click | Remove tool |
| Reset camera | Reset button | Reset button |

**Current structure types are visual/occupancy prototypes**, not functional factories. They do not mine, move resources or generate power yet.

## Run

Use any static HTTP server; no build step or external dependencies:

```bash
python3 -m http.server 8080
```

Open http://localhost:8080

Core logic regression tests require Node.js:

```bash
npm test
```

## Architecture

- `src/camera.js` — independent camera model and projection
- `src/world.js` — world dimensions, sparse occupancy, structure registry, queries
- `src/render.js` — reusable SVG assets and only-visible structure display
- `src/main.js` — input, UI, camera integration
- `src/style.css` — responsive editor styling
- `tests/world.test.js` — core world and camera regression tests

### Data model and future extensions

- **Structure**: tile-anchored, multi-tile occupancy; rotating or moving visual parts belong to its render definition.
- **Unit**: moving world-space object; use a separate spatial lookup later, without permanent tile occupancy.
- **Projectile**: short-lived moving combat object; optionally has a target.
- **Effect**: lightweight render-only visual, intentionally outside the gameplay entity registry.
- **Territory**: later ownership layer on top of the tiles; no nation/tower mechanics have been added yet.
- **Logistics & power**: later graph systems, independent from the occupancy grid.

The occupancy index answers *which structure is at a tile* without scanning all objects. The structure registry stores each object's canonical state. Regions are only allocated as used. Rendering is independent from simulation; camera visibility never changes world state.

### Not implemented yet

Resource logistics, conveyors transporting items, power networks, terrain generation, nation/territory ownership, combat, multiplayer, save/load, and mass-placement drag.

SVG is the editable art source. If later large-scale rendering requires a GPU, the assets can be cached as textures without replacing the world data model.
