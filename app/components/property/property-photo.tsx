"use client";

import { useEffect, useRef, useState } from "react";
import { Home } from "lucide-react";
import { cn } from "@/lib/utils";

/** Illustrated stand-in when there's no photo: a soft house sketch over a pale grid */
export function PhotoPlaceholder({ className, label = "No photo yet" }: { className?: string; label?: string }) {
  return (
    <div className={cn("relative flex items-center justify-center overflow-hidden bg-gradient-to-br from-secondary to-accent", className)}>
      <svg aria-hidden className="absolute inset-0 h-full w-full text-plat/10" viewBox="0 0 100 60" preserveAspectRatio="none">
        <defs>
          <pattern id="omf-grid" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M10 0H0V10" fill="none" stroke="currentColor" strokeWidth="0.4" />
          </pattern>
        </defs>
        <rect width="100" height="60" fill="url(#omf-grid)" />
      </svg>
      <div className="relative flex flex-col items-center gap-1 text-plat/70">
        <Home className="size-8" aria-hidden />
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}

/**
 * Card / gallery image for a property:
 *  - HUD: our resized copy in Storage (signed URL passed in)
 *  - tax deed with Street View: /api/streetview/:id (Google, not stored)
 *  - tax deed without Street View: placeholder plus a satellite tile when a key is configured
 */
export function PropertyPhoto({ src, propertyId, photoSource, alt, className, size = "640x400" }: {
  src?: string | null;
  propertyId: string | null;
  photoSource: string | null;
  alt: string;
  className?: string;
  size?: string;
}) {
  const [failed, setFailed] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  // A server-rendered <img> can fail before hydration attaches onError: check once mounted
  useEffect(() => {
    if (img.current?.complete && img.current.naturalWidth === 0) setFailed(true);
  }, []);
  const google = propertyId && (photoSource === "streetview" || photoSource === "satellite");
  const url = src ?? (google ? `/api/streetview/${propertyId}?size=${size}${photoSource === "satellite" ? "&kind=satellite" : ""}` : null);

  if (!url || failed) return <PhotoPlaceholder className={className} />;
  return (
    <div className={cn("relative overflow-hidden bg-muted", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- signed / proxied URLs, already sized */}
      <img ref={img} src={url} alt={alt} loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover" />
      {google && (
        <span className="absolute bottom-1 right-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">
          Image: Google
        </span>
      )}
    </div>
  );
}
