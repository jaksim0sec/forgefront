# FORGEFRONT

A browser-based industrial territory strategy game. The production and construction layer takes inspiration from complex factory games; territorial warfare will be developed separately.

## M03 — Item connection foundation

**Current interactive prototype:** a 2048 × 2048 logical-tile map with sparse occupancy and directional item-port networks.

- **M01:** touch drag, two-finger pinch, desktop arrow pan and wheel zoom (40–300%), with stable screen ↔ world coordinates.
- **M02:** sparse 32×32 tile chunks, multi-tile structure placement, rotation, collision checks and removal. Empty logical tiles allocate no objects.
- **M03:** item input/output ports (including rectangular rotated structures); directional OUT → IN connections automatically updated when structures are placed or removed. No full-world scan on routine edits.
- **Nation visuals:** neutral industrial structure colors; owner-specific CSS variable `--nation-color` controls only a small marker. Two initial nations are configured in `src/nations.js` and new ones can be added there. Ownership does not yet enforce construction or routing rules.
- **Visualization:** small connection arrows, per-structure IN/OUT diagnostics, connection count, and opt-in sample production line.

### Controls

| Action | Desktop | Mobile |
| --- | --- | --- |
| Pan | Arrow keys | One-finger drag |
| Zoom | Wheel/trackpad | Two-finger pinch |
| Select or place | Click | Tap |
| Rotate | R or button | Rotate button |
| Tools | 1–4, V, X or toolbar | Toolbar |
| Remove | Right click / X tool | Remove tool |
| Nation marker | Nation buttons | Nation buttons |
| Inspect example | `생산라인 예시` button | Same |

Use the nation buttons while a structure is selected to change its owner marker, or choose a nation before placing a new structure. There is no actual territory capture yet.

### Run

No external runtime dependencies or build tools are needed.

```bash
python3 -m http.server 8080
# Open http://localhost:8080
```

For tests (Node.js):

```bash
npm test
```

### Architecture

- `src/camera.js` — independent screen/world camera math
- `src/world.js` — bounded logical map, entity registry, sparse occupancy and mutation hooks
- `src/ports.js` — oriented, typed item-port positions at actual footprint boundaries
- `src/connections.js` — incremental directional link graph, upstream/downstream queries
- `src/nations.js` — extensible nation metadata and color tokens
- `src/render.js` — neutral SVG symbols, CSS-based small ownership markers, viewport culling and connection arrows
- `src/main.js` — keyboard, touch, wheel and editor integration
- `tests/...` — deterministic connectivity, changes, orientation, camera and regression tests

### Deliberately not implemented yet

- No resource items move through conveyors yet. Ports describe **possible paths**, not simulation, crafting recipes or throughput.
- Electricity, fuel, territory capture, tower rules, units, projectiles, saves and multiplayer remain future work.
- Nation ownership is currently metadata/visual only; cross-nation item links are allowed until warfare and access rules are designed.

The connection engine operates over *existing structures and immediate neighbors*, not millions of empty tiles. Visual rendering never decides whether a structure actually exists or operates.
