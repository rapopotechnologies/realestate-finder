// Shared map settings for the search map and the property map

const TILE_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

/** MapTiler's light style when a key is set; otherwise OpenFreeMap (free, no key) */
export const MAP_STYLE = TILE_KEY
  ? `https://api.maptiler.com/maps/dataviz-light/style.json?key=${TILE_KEY}`
  : "https://tiles.openfreemap.org/styles/positron";

/** The app accent (--primary) as a hex color, for map paint properties */
export const MAP_ACCENT = "#0969a0";

/** Degrees of latitude / longitude spanned by `miles` at a given latitude (good enough for Florida-size areas) */
export function milesToDegrees(miles: number, lat: number): { dLat: number; dLng: number } {
  return { dLat: miles / 69, dLng: miles / (69 * Math.cos((lat * Math.PI) / 180)) };
}
