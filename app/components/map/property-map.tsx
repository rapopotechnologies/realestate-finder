"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import maplibregl, { type GeoJSONSource, type LngLatBoundsLike, type Map as MLMap, type PointLike } from "maplibre-gl";
import { type MutableRefObject, useCallback, useEffect, useRef, useState } from "react";
import { Layers, Minus, Plus } from "lucide-react";
import { MAP_ACCENT, MAP_STYLE, milesToDegrees } from "@/lib/map";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Area, Layer, MapPoint } from "@/lib/search/types";
import { cn } from "@/lib/utils";

// Pins by source, matching the card badges (tax deed = accent, HUD = ink)
const COLORS = {
  taxDeed: MAP_ACCENT,
  hud: "#1f2937",
  cluster: MAP_ACCENT,
  area: MAP_ACCENT,
};

type BoundaryLayer = Exclude<Layer, "state">;
const BOUNDARY_LAYERS: { id: BoundaryLayer; label: string; minZoom: number; color: string }[] = [
  { id: "county", label: "County lines", minZoom: 0, color: "#6b7280" },
  { id: "place", label: "City limits", minZoom: 8, color: "#7c3aed" },
  { id: "zcta", label: "ZIP codes", minZoom: 9, color: "#db2777" },
];

const empty: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

function circlePolygon(lng: number, lat: number, miles: number, steps = 64): GeoJSON.Polygon {
  const coords: [number, number][] = [];
  const { dLat, dLng } = milesToDegrees(miles, lat);
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    coords.push([lng + dLng * Math.cos(t), lat + dLat * Math.sin(t)]);
  }
  return { type: "Polygon", coordinates: [coords] };
}

export interface PropertyMapProps {
  area: Area | null;
  point: { lat: number; lng: number; radiusMi: number } | null;
  nearbyRadiusMi: number | null;
  points: MapPoint[];
  hoveredId: string | null;
  selectedId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string | null) => void;
  onAreaClick: (layer: Layer, geoid: string, label: string) => void;
  className?: string;
}

export function PropertyMap(props: PropertyMapProps) {
  const { area, point, nearbyRadiusMi, points, hoveredId, selectedId, onHover, onSelect, onAreaClick, className } = props;
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);
  const [enabled, setEnabled] = useState<Record<BoundaryLayer, boolean>>({ county: true, place: true, zcta: false });
  const [layersOpen, setLayersOpen] = useState(false);
  const popup = useRef<maplibregl.Popup | null>(null);
  const fitTarget = useRef<LngLatBoundsLike | null>(null);
  const handlers = useRef({ onHover, onSelect, onAreaClick });
  handlers.current = { onHover, onSelect, onAreaClick };

  // ── create the map once ──────────────────────────────────────────────────
  useEffect(() => {
    if (!container.current) return;
    const m = new maplibregl.Map({
      container: container.current,
      style: MAP_STYLE,
      center: [-81.5, 28.4],
      zoom: 7,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    });
    m.touchZoomRotate.disableRotation();
    map.current = m;
    popup.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8, className: "omf-popup" });

    m.on("load", () => {
      // Boundary outlines (one source per layer, refreshed for what's on screen)
      for (const b of BOUNDARY_LAYERS) {
        m.addSource(`b-${b.id}`, { type: "geojson", data: empty, promoteId: "geoid" });
        m.addLayer({ id: `b-${b.id}-fill`, type: "fill", source: `b-${b.id}`, minzoom: b.minZoom,
          paint: { "fill-color": b.color, "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.08, 0] } });
        m.addLayer({ id: `b-${b.id}-line`, type: "line", source: `b-${b.id}`, minzoom: b.minZoom,
          paint: { "line-color": b.color, "line-opacity": 0.55, "line-width": b.id === "county" ? 1.2 : 0.8 } });
      }
      // Selected area (or radius): light fill + dashed outline, like Zillow
      m.addSource("area", { type: "geojson", data: empty });
      m.addLayer({ id: "area-fill", type: "fill", source: "area", paint: { "fill-color": COLORS.area, "fill-opacity": 0.06 } });
      m.addLayer({ id: "area-line", type: "line", source: "area",
        paint: { "line-color": COLORS.area, "line-width": 2.5, "line-dasharray": [2, 1.5] } });
      m.addSource("nearby", { type: "geojson", data: empty });
      m.addLayer({ id: "nearby-line", type: "line", source: "nearby",
        paint: { "line-color": COLORS.area, "line-width": 1.2, "line-opacity": 0.6, "line-dasharray": [1, 2] } });

      // Pins, clustered when zoomed out
      m.addSource("pts", { type: "geojson", data: empty, cluster: true, clusterRadius: 44, clusterMaxZoom: 13, promoteId: "listing_id" });
      m.addLayer({ id: "clusters", type: "circle", source: "pts", filter: ["has", "point_count"],
        paint: { "circle-color": COLORS.cluster, "circle-opacity": 0.88, "circle-stroke-color": "#fff", "circle-stroke-width": 2,
          "circle-radius": ["step", ["get", "point_count"], 14, 10, 18, 50, 24] } });
      m.addLayer({ id: "cluster-count", type: "symbol", source: "pts", filter: ["has", "point_count"],
        layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 12, "text-font": ["Noto Sans Bold"] },
        paint: { "text-color": "#fff" } });
      m.addLayer({ id: "pin", type: "circle", source: "pts", filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": ["match", ["get", "source"], "hud", COLORS.hud, COLORS.taxDeed],
          "circle-radius": ["case", ["boolean", ["feature-state", "hover"], false], 10,
            ["boolean", ["feature-state", "selected"], false], 10, 7],
          "circle-stroke-color": ["case", ["boolean", ["feature-state", "hover"], false], "#111827", "#fff"],
          "circle-stroke-width": ["case", ["boolean", ["feature-state", "hover"], false], 3, 2],
        } });

      // Pin interactions
      m.on("mouseenter", "pin", (e) => {
        m.getCanvas().style.cursor = "pointer";
        const id = e.features?.[0]?.properties?.listing_id as string | undefined;
        if (id) handlers.current.onHover(id);
      });
      m.on("mouseleave", "pin", () => { m.getCanvas().style.cursor = ""; handlers.current.onHover(null); });
      m.on("click", "pin", (e) => {
        const id = e.features?.[0]?.properties?.listing_id as string | undefined;
        if (id) handlers.current.onSelect(id);
      });
      m.on("click", "clusters", async (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const src = m.getSource("pts") as GeoJSONSource;
        const zoom = await src.getClusterExpansionZoom(f.properties?.cluster_id);
        m.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom });
      });
      m.on("mouseenter", "clusters", () => (m.getCanvas().style.cursor = "pointer"));
      m.on("mouseleave", "clusters", () => (m.getCanvas().style.cursor = ""));

      // Boundary hover (name + count) and click (filter to that shape). Pins win; then the finest visible layer.
      const fillIds = [...BOUNDARY_LAYERS].reverse().map((b) => `b-${b.id}-fill`);
      const pinAt = (pt: PointLike) => m.queryRenderedFeatures(pt, { layers: ["pin", "clusters"] }).length > 0;
      const boundaryAt = (pt: PointLike) => {
        const visible = fillIds.filter((id) => m.getLayer(id) && m.getLayoutProperty(id, "visibility") !== "none");
        return m.queryRenderedFeatures(pt, { layers: visible })[0];
      };
      let hovered: { source: string; id: string } | null = null;
      const clearHover = () => {
        if (hovered) m.setFeatureState(hovered, { hover: false });
        hovered = null;
        popup.current?.remove();
      };
      m.on("mousemove", (e) => {
        const f = pinAt(e.point) ? undefined : boundaryAt(e.point);
        if (!f) { clearHover(); return; }
        const next = { source: f.source, id: String(f.id) };
        if (!hovered || hovered.id !== next.id || hovered.source !== next.source) {
          clearHover();
          hovered = next;
          m.setFeatureState(next, { hover: true });
        }
        const n = Number(f.properties?.count ?? 0);
        popup.current!.setLngLat(e.lngLat)
          .setHTML(`<strong>${escapeHtml(String(f.properties?.label ?? ""))}</strong><br/>${n} propert${n === 1 ? "y" : "ies"} · click to search`)
          .addTo(m);
      });
      m.getCanvas().addEventListener("mouseleave", clearHover);
      m.on("click", (e) => {
        if (pinAt(e.point)) return; // the pin's own click handler selects it
        const f = boundaryAt(e.point);
        if (f) handlers.current.onAreaClick(f.properties?.layer as Layer, String(f.properties?.geoid), String(f.properties?.label));
        else handlers.current.onSelect(null);
      });

      setReady(true);
    });

    // The map can be created hidden (phone list view): resize and re-fit when its box changes
    const ro = new ResizeObserver(() => {
      m.resize();
      if (fitTarget.current && m.getContainer().clientWidth > 0) m.fitBounds(fitTarget.current, { padding: 40, duration: 0, maxZoom: 14 });
    });
    ro.observe(container.current);

    return () => { ro.disconnect(); m.remove(); map.current = null; };
  }, []);

  // ── boundary outlines for the current view ───────────────────────────────
  const loadBoundaries = useCallback(async () => {
    const m = map.current;
    if (!m) return;
    const b = m.getBounds();
    const zoom = Math.floor(m.getZoom());
    const supabase = createSupabaseBrowserClient();
    await Promise.all(BOUNDARY_LAYERS.map(async (layer) => {
      const src = m.getSource(`b-${layer.id}`) as GeoJSONSource | undefined;
      if (!src) return;
      const on = enabled[layer.id] && zoom >= layer.minZoom;
      for (const s of ["fill", "line"]) m.setLayoutProperty(`b-${layer.id}-${s}`, "visibility", on ? "visible" : "none");
      if (!on) return;
      const { data } = await supabase.rpc("boundaries_in_view", {
        p_min_lng: b.getWest(), p_min_lat: b.getSouth(), p_max_lng: b.getEast(), p_max_lat: b.getNorth(),
        p_zoom: zoom, p_layer: layer.id,
      });
      if (data) src.setData(data as unknown as GeoJSON.FeatureCollection);
    }));
  }, [enabled]);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    let t: ReturnType<typeof setTimeout>;
    const onMove = () => { clearTimeout(t); t = setTimeout(loadBoundaries, 250); };
    loadBoundaries();
    m.on("moveend", onMove);
    return () => { clearTimeout(t); m.off("moveend", onMove); };
  }, [ready, loadBoundaries]);

  // ── selected area / radius, and fit the view to it ───────────────────────
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const areaSrc = m.getSource("area") as GeoJSONSource;
    const nearbySrc = m.getSource("nearby") as GeoJSONSource;
    let bounds: LngLatBoundsLike | null = null;
    if (area) {
      areaSrc.setData({ type: "Feature", properties: {}, geometry: area.geometry });
      bounds = [[area.bbox[0], area.bbox[1]], [area.bbox[2], area.bbox[3]]];
      if (nearbyRadiusMi) {
        // Approximate "nearby" ring: the area's box grown by the radius
        const { dLat, dLng } = milesToDegrees(nearbyRadiusMi, area.center[1]);
        const [w, s, e, n] = area.bbox;
        nearbySrc.setData({ type: "Feature", properties: {}, geometry: { type: "Polygon",
          coordinates: [[[w - dLng, s - dLat], [e + dLng, s - dLat], [e + dLng, n + dLat], [w - dLng, n + dLat], [w - dLng, s - dLat]]] } });
        bounds = [[w - dLng, s - dLat], [e + dLng, n + dLat]];
      } else {
        nearbySrc.setData(empty);
      }
    } else if (point) {
      areaSrc.setData({ type: "Feature", properties: {}, geometry: circlePolygon(point.lng, point.lat, point.radiusMi) });
      nearbySrc.setData(empty);
      const { dLat, dLng } = milesToDegrees(point.radiusMi, point.lat);
      bounds = [[point.lng - dLng, point.lat - dLat], [point.lng + dLng, point.lat + dLat]];
    } else {
      areaSrc.setData(empty);
      nearbySrc.setData(empty);
    }
    fitTarget.current = bounds;
    if (bounds && m.getContainer().clientWidth > 0) m.fitBounds(bounds, { padding: 40, duration: 600, maxZoom: 14 });
  }, [ready, area, point, nearbyRadiusMi]);

  // ── pins ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    (m.getSource("pts") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: points.map((p) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.lng, p.lat] },
        properties: { listing_id: p.listing_id, source: p.source },
      })),
    });
  }, [ready, points]);

  // Hovering a card highlights its pin (and vice versa via onHover); the selected pin stays enlarged
  usePinState(map, ready, "hover", hoveredId);
  usePinState(map, ready, "selected", selectedId);

  return (
    <div className={cn("relative h-full w-full", className)}>
      <div ref={container} className="h-full w-full" role="region" aria-label="Map of search results" />
      {/* Zoom + boundary layer controls */}
      <div className="absolute right-3 top-3 flex flex-col gap-2">
        <div className="flex flex-col overflow-hidden rounded-lg border bg-card shadow-sm">
          <button type="button" aria-label="Zoom in" onClick={() => map.current?.zoomIn()}
            className="grid size-9 place-items-center hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"><Plus className="size-4" /></button>
          <button type="button" aria-label="Zoom out" onClick={() => map.current?.zoomOut()}
            className="grid size-9 place-items-center border-t hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"><Minus className="size-4" /></button>
        </div>
        <div className="relative">
          <button type="button" aria-expanded={layersOpen} aria-controls="map-layers" onClick={() => setLayersOpen((o) => !o)}
            className="grid size-9 place-items-center rounded-lg border bg-card shadow-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Boundary layers"><Layers className="size-4" /></button>
          {layersOpen && (
            <fieldset id="map-layers" className="absolute right-0 top-11 w-44 space-y-2 rounded-lg border bg-card p-3 text-sm shadow-lg">
              <legend className="sr-only">Boundary layers</legend>
              {BOUNDARY_LAYERS.map((b) => (
                <label key={b.id} className="flex cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={enabled[b.id]} className="size-4 accent-[hsl(var(--primary))]"
                    onChange={(e) => setEnabled((s) => ({ ...s, [b.id]: e.target.checked }))} />
                  <span className="inline-block h-0.5 w-4 rounded" style={{ background: b.color }} aria-hidden />
                  {b.label}
                </label>
              ))}
              <p className="text-xs text-muted-foreground">Cities show from zoom 8, ZIPs from zoom 9.</p>
            </fieldset>
          )}
        </div>
      </div>
      {/* Legend */}
      <div className="pointer-events-none absolute bottom-6 left-3 hidden gap-3 rounded-lg border bg-card/95 px-3 py-1.5 text-xs shadow-sm sm:flex">
        <LegendDot color={COLORS.taxDeed} label="Tax deed" />
        <LegendDot color={COLORS.hud} label="HUD home" />
      </div>
    </div>
  );
}

/** Keep one pin's feature-state flag (hover / selected) in sync with an id, clearing the previous pin */
function usePinState(map: MutableRefObject<MLMap | null>, ready: boolean, flag: "hover" | "selected", id: string | null) {
  const previous = useRef<string | null>(null);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    if (previous.current) m.setFeatureState({ source: "pts", id: previous.current }, { [flag]: false });
    if (id) m.setFeatureState({ source: "pts", id }, { [flag]: true });
    previous.current = id;
  }, [map, ready, flag, id]);
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block size-2.5 rounded-full" style={{ background: color }} aria-hidden />
      {label}
    </span>
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
