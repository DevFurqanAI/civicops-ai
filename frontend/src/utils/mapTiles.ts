// MapTiler's documented 256px XYZ variant fits Leaflet's existing zoom scale.
export function mapTilerTiles(apiKey?: string) {
  const key = apiKey?.trim();
  if (!key) return null;
  return {
    url: `https://api.maptiler.com/maps/streets-v4/256/{z}/{x}/{y}.png?key=${encodeURIComponent(key)}`,
    attribution: '<a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener noreferrer">&copy; MapTiler</a> <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">&copy; OpenStreetMap contributors</a>',
    tileSize: 256, zoomOffset: 0, minZoom: 1, crossOrigin: true,
  };
}
