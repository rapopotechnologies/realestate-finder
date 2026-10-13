// Search state lives in the URL so any search can be shared:
//   /search?county=12069            a county (FIPS)
//   /search?city=Clermont,FL        a city or town (or ?place=<Census GEOID>)
//   /search?zip=34715&r=25          a ZIP, plus everything within 25 miles ("Include nearby")
//   /search?lat=28.5&lng=-81.7&r=25&near=1      near you
//   /search?lat=..&lng=..&r=5&q=123 Main St      an address
// Filters: src, pmin, pmax, type, beds, bldg, closed, sort, page

import type { Json } from "@/lib/supabase/types";
import type { Layer, Source } from "./types";

export type AreaRef =
  | { kind: "area"; layer: Layer; geoid?: string; label?: string }
  | { kind: "point"; lat: number; lng: number; near: boolean; label?: string }
  | { kind: "none" };

export type Sort = "deal" | "price_asc" | "price_desc" | "date" | "distance" | "newest";

export interface Filters {
  sources: Source[]; // empty = both
  priceMin: number | null;
  priceMax: number | null;
  types: string[];
  bedsMin: number | null;
  hasBuilding: boolean;
  showClosed: boolean;
}

export interface SearchState {
  area: AreaRef;
  radiusMi: number | null; // with an area: "Include nearby"; with a point: the radius
  filters: Filters;
  sort: Sort;
  page: number;
}

export const DEFAULT_RADIUS = 25;
export const SORTS: { value: Sort; label: string }[] = [
  { value: "date", label: "Soonest auction / deadline" },
  { value: "deal", label: "Lowest price vs county value" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "distance", label: "Distance" },
  { value: "newest", label: "Newest" },
];
export const PROPERTY_TYPES: { value: string; label: string }[] = [
  { value: "single_family", label: "Single family" },
  { value: "condo", label: "Condo" },
  { value: "townhouse", label: "Townhouse" },
  { value: "mobile_home", label: "Mobile home" },
  { value: "multi_family", label: "Multi-family" },
  { value: "vacant_land", label: "Vacant land" },
  { value: "commercial", label: "Commercial" },
  { value: "agricultural", label: "Agricultural" },
  { value: "other", label: "Other" },
];

const num = (v: string | null) => (v != null && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : null);

/** Nearest first around a point; otherwise what's happening soonest */
function defaultSort(area: AreaRef): Sort {
  return area.kind === "point" ? "distance" : "date";
}

export function parseSearch(p: URLSearchParams): SearchState {
  let area: AreaRef = { kind: "none" };
  if (p.get("county")) area = { kind: "area", layer: "county", geoid: p.get("county")! };
  else if (p.get("zip")) area = { kind: "area", layer: "zcta", geoid: p.get("zip")! };
  else if (p.get("place")) area = { kind: "area", layer: "place", geoid: p.get("place")! };
  else if (p.get("city")) area = { kind: "area", layer: "place", label: p.get("city")!.replace(/,\s*/, ", ") };
  else if (num(p.get("lat")) != null && num(p.get("lng")) != null)
    area = { kind: "point", lat: num(p.get("lat"))!, lng: num(p.get("lng"))!, near: p.get("near") === "1", label: p.get("q") ?? undefined };

  const src = (p.get("src") ?? "").split(",").filter((s): s is Source => s === "tax_deed" || s === "hud");
  const sort = (p.get("sort") as Sort) || defaultSort(area);
  return {
    area,
    radiusMi: num(p.get("r")) ?? (area.kind === "point" ? DEFAULT_RADIUS : null),
    filters: {
      sources: src,
      priceMin: num(p.get("pmin")),
      priceMax: num(p.get("pmax")),
      types: (p.get("type") ?? "").split(",").filter(Boolean),
      bedsMin: num(p.get("beds")),
      hasBuilding: p.get("bldg") === "1",
      showClosed: p.get("closed") === "1",
    },
    sort: SORTS.some((s) => s.value === sort) ? sort : defaultSort(area),
    page: Math.max(1, num(p.get("page")) ?? 1),
  };
}

export function serializeSearch(s: SearchState): string {
  const p = new URLSearchParams();
  const a = s.area;
  if (a.kind === "area") {
    if (a.layer === "county" && a.geoid) p.set("county", a.geoid);
    else if (a.layer === "zcta" && a.geoid) p.set("zip", a.geoid);
    else if (a.layer === "place") {
      if (a.label) p.set("city", a.label.replace(", ", ","));
      else if (a.geoid) p.set("place", a.geoid);
    }
  } else if (a.kind === "point") {
    p.set("lat", a.lat.toFixed(5));
    p.set("lng", a.lng.toFixed(5));
    if (a.near) p.set("near", "1");
    if (a.label) p.set("q", a.label);
  }
  if (s.radiusMi != null && !(a.kind === "point" && s.radiusMi === DEFAULT_RADIUS && a.near)) p.set("r", String(s.radiusMi));
  const f = s.filters;
  if (f.sources.length === 1) p.set("src", f.sources[0]);
  if (f.priceMin != null) p.set("pmin", String(f.priceMin));
  if (f.priceMax != null) p.set("pmax", String(f.priceMax));
  if (f.types.length) p.set("type", f.types.join(","));
  if (f.bedsMin != null) p.set("beds", String(f.bedsMin));
  if (f.hasBuilding) p.set("bldg", "1");
  if (f.showClosed) p.set("closed", "1");
  if (s.sort !== defaultSort(a)) p.set("sort", s.sort);
  if (s.page > 1) p.set("page", String(s.page));
  // Commas are fine in a query string; keep "city=Clermont,FL" readable for sharing
  return p.toString().replace(/%2C/gi, ",");
}

/** Arguments for the search_properties RPC */
export function rpcArgs(s: SearchState, areaGeoid: string | null) {
  const f = s.filters;
  const filters: { [key: string]: Json } = { hide_closed: !f.showClosed };
  if (f.sources.length === 1) filters.sources = f.sources;
  if (f.priceMin != null) filters.price_min = f.priceMin;
  if (f.priceMax != null) filters.price_max = f.priceMax;
  if (f.types.length) filters.property_types = f.types;
  if (f.bedsMin != null) filters.beds_min = f.bedsMin;
  if (f.hasBuilding) filters.has_building = true;
  const base = { p_filters: filters, p_sort: s.sort, p_page: s.page, p_page_size: 24 };
  if (s.area.kind === "area") {
    return { ...base, p_area_layer: s.area.layer, p_area_geoid: areaGeoid ?? s.area.geoid, p_radius_mi: s.radiusMi ?? undefined };
  }
  if (s.area.kind === "point") {
    return { ...base, p_lat: s.area.lat, p_lng: s.area.lng, p_radius_mi: s.radiusMi ?? DEFAULT_RADIUS };
  }
  return null;
}

export function areaHref(layer: Layer, geoid: string, label?: string): string {
  if (layer === "county") return `/search?county=${geoid}`;
  if (layer === "zcta") return `/search?zip=${geoid}`;
  if (layer === "place") return label ? `/search?city=${encodeURIComponent(label.replace(", ", ","))}` : `/search?place=${geoid}`;
  return "/search";
}
