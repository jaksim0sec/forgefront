import { Camera, CAMERA_CONFIG } from './camera.js';

const svg = document.getElementById('world');
const tilePattern = document.getElementById('tile-grid');
const sectorPattern = document.getElementById('sector-grid');
const tilePath = document.getElementById('tile-grid-path');
const sectorPath = document.getElementById('sector-grid-path');
const origin = document.getElementById('world-origin');
const camera = new Camera();

let renderPending = false;
function render() {
  renderPending = false;
  const tile = CAMERA_CONFIG.tileSize * camera.zoom;
  const sector = tile * CAMERA_CONFIG.sectorTiles;
  const zero = camera.worldToScreen(0, 0);

  for (const [pattern, path, step] of [
    [tilePattern, tilePath, tile],
    [sectorPattern, sectorPath, sector],
  ]) {
    pattern.setAttribute('width', step);
    pattern.setAttribute('height', step);
    pattern.setAttribute('x', ((zero.x % step) + step) % step);
    pattern.setAttribute('y', ((zero.y % step) + step) % step);
    path.setAttribute('d', 'M' + step + ' 0H0V' + step);
  }
  tilePattern.setAttribute('visibility', tile < 18 ? 'hidden' : 'visible');
  origin.setAttribute('transform', 'translate(' + zero.x + ' ' + zero.y + ')');
  origin.style.display = zero.x < -30 || zero.x > camera.width + 30 ||
    zero.y < -30 || zero.y > camera.height + 30 ? 'none' : '';
  document.getElementById('cam-x').textContent = (camera.x / CAMERA_CONFIG.tileSize).toFixed(1);
  document.getElementById('cam-y').textContent = (camera.y / CAMERA_CONFIG.tileSize).toFixed(1);
  document.getElementById('zoom').textContent = Math.round(camera.zoom * 100) + '%';
}
function invalidate() {
  if (renderPending) return;
  renderPending = true;
  requestAnimationFrame(render);
}
function resize() {
  const rect = svg.getBoundingClientRect();
  camera.resize(rect.width, rect.height);
  invalidate();
}
new ResizeObserver(resize).observe(svg);
resize();

// Touch: one finger pans, two fingers pinch around the moving midpoint.
// Reset baselines on any finger count change to avoid camera jumps.
const fingers = new Map();
let gesture = null;
function midAndDistance() {
  const [a, b] = [...fingers.values()];
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    distance: Math.hypot(a.x - b.x, a.y - b.y),
  };
}
function baseline() {
  if (fingers.size === 1) {
    const [point] = fingers.values();
    gesture = { type: 'pan', ...point };
  } else if (fingers.size >= 2) {
    gesture = { type: 'pinch', ...midAndDistance() };
  } else {
    gesture = null;
  }
}
function localPoint(event) {
  const rect = svg.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}
svg.addEventListener('pointerdown', event => {
  if (event.pointerType !== 'touch' || fingers.size >= 2) return;
  fingers.set(event.pointerId, localPoint(event));
  svg.setPointerCapture(event.pointerId);
  baseline();
});
svg.addEventListener('pointermove', event => {
  if (!fingers.has(event.pointerId)) return;
  fingers.set(event.pointerId, localPoint(event));
  if (fingers.size === 1 && gesture?.type === 'pan') {
    const [point] = fingers.values();
    camera.panPixels(point.x - gesture.x, point.y - gesture.y);
    gesture = { type: 'pan', ...point };
    invalidate();
  } else if (fingers.size >= 2 && gesture?.type === 'pinch') {
    const next = midAndDistance();
    camera.panPixels(next.x - gesture.x, next.y - gesture.y);
    if (gesture.distance > 0 && next.distance > 0) {
      camera.zoomAt(next.distance / gesture.distance, next.x, next.y);
    }
    gesture = { type: 'pinch', ...next };
    invalidate();
  }
});
function releasePointer(event) {
  if (!fingers.delete(event.pointerId)) return;
  if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
  baseline();
}
svg.addEventListener('pointerup', releasePointer);
svg.addEventListener('pointercancel', releasePointer);
svg.addEventListener('lostpointercapture', releasePointer);
window.addEventListener('blur', () => { fingers.clear(); baseline(); });

// Desktop wheel zooms about the pointer, not the viewport center.
svg.addEventListener('wheel', event => {
  event.preventDefault();
  const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? camera.height : 1;
  const point = localPoint(event);
  camera.zoomAt(
    Math.exp(-event.deltaY * multiplier * CAMERA_CONFIG.wheelSensitivity),
    point.x, point.y
  );
  invalidate();
}, { passive: false });

// Frame-rate-independent keyboard movement, with diagonal normalization.
const pressed = new Set();
let keyboardFrame = null;
let previousFrame = 0;
function keyboardStep(time) {
  keyboardFrame = null;
  const delta = Math.min(0.05, (time - (previousFrame || time)) / 1000);
  previousFrame = time;
  const dx = Number(pressed.has('ArrowRight')) - Number(pressed.has('ArrowLeft'));
  const dy = Number(pressed.has('ArrowDown')) - Number(pressed.has('ArrowUp'));
  if (dx || dy) {
    const length = Math.hypot(dx, dy);
    const amount = CAMERA_CONFIG.keyboardSpeed * delta;
    camera.panPixels(-dx / length * amount, -dy / length * amount);
    invalidate();
  }
  if (pressed.size) keyboardFrame = requestAnimationFrame(keyboardStep);
  else previousFrame = 0;
}
function isEditing(target) {
  return target instanceof Element &&
    !!target.closest('input, textarea, select, [contenteditable="true"]');
}
window.addEventListener('keydown', event => {
  if (!event.key.startsWith('Arrow') || isEditing(event.target)) return;
  event.preventDefault();
  pressed.add(event.key);
  if (keyboardFrame === null) keyboardFrame = requestAnimationFrame(keyboardStep);
});
window.addEventListener('keyup', event => {
  pressed.delete(event.key);
  if (event.key.startsWith('Arrow')) event.preventDefault();
});
window.addEventListener('blur', () => { pressed.clear(); previousFrame = 0; });

document.getElementById('reset').addEventListener('click', () => {
  camera.reset();
  invalidate();
});
