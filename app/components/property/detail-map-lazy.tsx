"use client";

import dynamic from "next/dynamic";

// MapLibre needs the browser
export const DetailMapLazy = dynamic(() => import("./detail-map").then((m) => m.DetailMap), {
  ssr: false,
  loading: () => <div className="h-72 w-full animate-pulse rounded-xl bg-muted" aria-label="Loading map" />,
});
