"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import maplibregl from "maplibre-gl";
import { useEffect, useRef } from "react";
import { MAP_COLORS, MAP_STYLE } from "@/lib/map";

export type PreviewPoint = { lng: number; lat: number; source: "tax_deed" | "hud" };

/** Landing page: a still map of where listings are (rounded to ~1 km). Not interactive, no details. */
export function PreviewMap({ points }: { points: PreviewPoint[] }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!el.current) return;
    const m = new maplibregl.Map({ container: el.current, style: MAP_STYLE, interactive: false, attributionControl: { compact: true },
      bounds: [[-83.0, 27.3], [-80.6, 29.4]], fitBoundsOptions: { padding: 20 } });
    m.on("load", () => {
      m.addSource("pts", { type: "geojson", data: { type: "FeatureCollection", features: points.map((p) => ({
        type: "Feature", properties: { source: p.source }, geometry: { type: "Point", coordinates: [p.lng, p.lat] } })) } });
      m.addLayer({ id: "pts", type: "circle", source: "pts", paint: {
        "circle-radius": 4.5, "circle-color": ["match", ["get", "source"], "hud", MAP_COLORS.hud, MAP_COLORS.deed],
        "circle-stroke-color": "#fff", "circle-stroke-width": 1.5 } });
    });
    // The lazy wrapper can mount before the figure has its final width
    const fit = new ResizeObserver(() => m.resize());
    fit.observe(el.current);
    return () => { fit.disconnect(); m.remove(); };
  }, [points]);
  // Not role="img": the map holds the OpenStreetMap attribution links, which must stay reachable
  return (
    <>
      <p className="sr-only">Map of Central Florida with {points.length} upcoming tax deed auctions and HUD homes.</p>
      <div ref={el} className="h-full w-full" />
    </>
  );
}
