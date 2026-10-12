# FORGEFRONT

Industrial territory strategy game. The project is currently building its first **world foundation**.

## Milestone M01 — Camera & board

- **Touch:** one-finger drag moves the camera. Two-finger pinch zooms around the gesture center and follows its movement.
- **Desktop:** arrow keys move the camera; mouse wheel or trackpad scroll zooms around the pointer.
- **Zoom limits:** 40%–300%, configured in `src/camera.js`.
- Vector SVG tile / sector grid, responsive camera HUD and reset control.
- Camera world↔screen transforms are separated from rendering and input.

Not yet implemented: building placement, tile occupancy, logistics, power grids, territories or combat.

## Run locally

No build tooling or dependencies are required. Start any static HTTP server in the repository root:

```sh
python3 -m http.server 8080
```

Open `http://localhost:8080` in a browser.

## Source

- `index.html`: SVG world and screen layout
- `src/camera.js`: camera model and zoom limits
- `src/main.js`: touch, keyboard, wheel input and SVG grid updates
- `src/style.css`: responsive industrial UI

SVG is the design source format. Future heavy world rendering can use cached sprites / GPU while keeping SVG assets editable.
