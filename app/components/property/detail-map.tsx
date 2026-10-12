"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import maplibregl from "maplibre-gl";
import { useEffect, useRef } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Area } from "@/lib/search/types";

const TILE_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;
const STYLE = TILE_KEY
  ? `https://api.maptiler.com/maps/dataviz-light/style.json?key=${TILE_KEY}`
  : "https://tiles.openfreemap.org/styles/positron";

/** The parcel point plus the outline of its city (or ZIP when it's unincorporated) */
export function DetailMap({ lat, lng, placeGeoid, zip }: { lat: number; lng: number; placeGeoid: string | null; zip: string | null }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!el.current) return;
    const m = new maplibregl.Map({ container: el.current, style: STYLE, center: [lng, lat], zoom: 14,
      attributionControl: { compact: true }, dragRotate: false, cooperativeGestures: true });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    new maplibregl.Marker({ color: "#0969a0" }).setLngLat([lng, lat]).addTo(m);
    m.on("load", async () => {
      const layer = placeGeoid ? "place" : zip ? "zcta" : null;
      const geoid = placeGeoid ?? zip;
      if (!layer || !geoid) return;
      const { data } = await createSupabaseBrowserClient().rpc("get_area", { p_layer: layer, p_geoid: geoid });
      const area = data as unknown as Area | null;
      if (!area || !m.getStyle()) return;
      m.addSource("area", { type: "geojson", data: { type: "Feature", properties: {}, geometry: area.geometry } });
      m.addLayer({ id: "area-fill", type: "fill", source: "area", paint: { "fill-color": "#0969a0", "fill-opacity": 0.05 } });
      m.addLayer({ id: "area-line", type: "line", source: "area", paint: { "line-color": "#0969a0", "line-width": 2, "line-dasharray": [2, 1.5] } });
    });
    return () => m.remove();
  }, [lat, lng, placeGeoid, zip]);
  return <div ref={el} className="h-72 w-full overflow-hidden rounded-xl border" role="region" aria-label="Map of the property location" />;
}
