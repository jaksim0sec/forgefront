/** Independent camera model shared by all future world layers. */
export const CAMERA_CONFIG = Object.freeze({
  tileSize: 48,
  sectorTiles: 8,
  minZoom: 0.4,
  maxZoom: 3,
  wheelSensitivity: 0.0015,
  keyboardSpeed: 440, // screen pixels per second
});

export const clamp = (value, lower, upper) => Math.min(upper, Math.max(lower, value));

export class Camera {
  constructor(config = CAMERA_CONFIG) {
    this.config = config;
    this.x = 0;
    this.y = 0;
    this.zoom = 1;
    this.width = 1;
    this.height = 1;
  }

  resize(width, height) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
  }

  screenToWorld(screenX, screenY) {
    return {
      x: this.x + (screenX - this.width / 2) / this.zoom,
      y: this.y + (screenY - this.height / 2) / this.zoom,
    };
  }

  worldToScreen(worldX, worldY) {
    return {
      x: (worldX - this.x) * this.zoom + this.width / 2,
      y: (worldY - this.y) * this.zoom + this.height / 2,
    };
  }

  panPixels(deltaX, deltaY) {
    this.x -= deltaX / this.zoom;
    this.y -= deltaY / this.zoom;
  }

  zoomAt(scale, screenX, screenY) {
    if (!Number.isFinite(scale) || scale <= 0) return false;
    const next = clamp(this.zoom * scale, this.config.minZoom, this.config.maxZoom);
    if (next === this.zoom) return false;
    const anchor = this.screenToWorld(screenX, screenY);
    this.zoom = next;
    this.x = anchor.x - (screenX - this.width / 2) / this.zoom;
    this.y = anchor.y - (screenY - this.height / 2) / this.zoom;
    return true;
  }

  reset() {
    this.x = 0;
    this.y = 0;
    this.zoom = 1;
  }
}
