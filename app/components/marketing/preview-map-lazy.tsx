"use client";

import dynamic from "next/dynamic";

// MapLibre needs the browser
export const PreviewMapLazy = dynamic(() => import("./preview-map").then((m) => m.PreviewMap), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-secondary" aria-hidden />,
});
