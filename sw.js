// Offline-first availability, network-first freshness. Static assets only.
const CACHE_NAME = 'forgefront-offline-v20';
const CACHE_PREFIX = 'forgefront-offline-';
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./src/style.css",
  "./src/camera.js",
  "./src/build-stroke.js",
  "./src/local-draft.js",
  "./src/combat.js",
  "./src/capture.js",
  "./src/capture-render.js",
  "./src/nation-editor.js",
  "./src/unit-command.js",
  "./src/frontline.js",
  "./src/defense.js",
  "./src/combat-render.js",
  "./src/cargo-renderer.js",
  "./src/connections.js",
  "./src/conveyor-visual.js",
  "./src/entities.js",
  "./src/industry.js",
  "./src/main.js",
  "./src/nations.js",
  "./src/ports.js",
  "./src/power.js",
  "./src/progression.js",
  "./src/render.js",
  "./src/structure-lod.js",
  "./src/resources.js",
  "./src/routes.js",
  "./src/underground.js",
  "./src/terrain-render.js",
  "./src/territory-render.js",
  "./src/territory.js",
  "./src/terrain.js",
  "./src/world.js",
  "./source/resources/coal.svg",
  "./source/resources/iron.svg",
  "./source/resources/lead.svg",
  "./source/resources/parts.svg",
  "./source/resources/silicon.svg",
  "./source/resources/superconductor.svg",
  "./source/resources/titanium.svg",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE_ASSETS.map(path => new URL(path, self.registration.scope).href));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        // Cache write failures must not break online gameplay.
        await cache.put(request, response.clone()).catch(() => {});
      }
      return response;
    } catch {
      const saved = await cache.match(request, {ignoreSearch: true});
      if (saved) return saved;
      if (request.mode === 'navigate') {
        return await cache.match(new URL('./index.html', self.registration.scope).href)
          || Response.error();
      }
      return Response.error();
    }
  })());
});
