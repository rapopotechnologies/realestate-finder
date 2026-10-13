"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, Expand, X } from "lucide-react";
import type { PhotoView } from "@/lib/property/load";
import { PhotoPlaceholder } from "./property-photo";
import { cn } from "@/lib/utils";

type Slide = { src: string; thumb: string; credit: string | null };

/** Photo gallery with a keyboard-friendly lightbox. Tax deed properties use Google imagery via our route. */
export function Gallery({ propertyId, photos, address }: { propertyId: string; photos: PhotoView[]; address: string }) {
  const slides: Slide[] = [];
  for (const p of photos) {
    if (p.source === "hud" && p.url) slides.push({ src: p.url, thumb: p.thumb ?? p.url, credit: p.attribution });
    if (p.source === "streetview") slides.push({ src: `/api/streetview/${propertyId}?size=1200x800`, thumb: `/api/streetview/${propertyId}?size=400x260`, credit: "Image: Google" });
    if (p.source === "satellite" || p.source === "streetview")
      slides.push({ src: `/api/streetview/${propertyId}?size=1200x800&kind=satellite`, thumb: `/api/streetview/${propertyId}?size=400x260&kind=satellite`, credit: "Image: Google" });
  }
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const visible = slides.filter((s) => !broken.has(s.src));
  const grid = useRef<HTMLDivElement>(null);

  // A server-rendered <img> can fail before hydration attaches onError: check once mounted
  useEffect(() => {
    const failed = [...(grid.current?.querySelectorAll("img") ?? [])].filter((i) => i.complete && !i.naturalWidth);
    if (failed.length) setBroken((b) => new Set([...b, ...failed.map((i) => i.dataset.src!)]));
  }, []);
  const go = useCallback((d: number) => setIndex((i) => (i + d + visible.length) % visible.length), [visible.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, go]);

  if (!visible.length) {
    return <PhotoPlaceholder className="h-48 w-full rounded-xl md:h-64"
      label={photos.some((p) => p.source === "streetview" || p.source === "satellite") ? "Image unavailable" : "No photo for this property yet"} />;
  }
  const markBroken = (src: string) => setBroken((b) => new Set(b).add(src));
  const main = visible[0];
  const side = visible.slice(1, 5);
  // Two images (e.g. Street View + satellite): equal tiles; three or more: big photo + grid of four
  const pair = visible.length === 2;

  return (
    <>
      <div ref={grid} className={cn("grid gap-2 overflow-hidden rounded-xl", pair ? "md:grid-cols-2" : side.length ? "md:grid-cols-[2fr_1fr]" : "")}>
        <button type="button" onClick={() => { setIndex(0); setOpen(true); }} aria-label={`Open photo 1 of ${visible.length}`}
          className="group relative aspect-[16/10] w-full overflow-hidden bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:aspect-auto md:h-[420px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={main.src} data-src={main.src} alt={`${address}, photo 1`} onError={() => markBroken(main.src)} className="h-full w-full object-cover transition group-hover:scale-[1.01]" />
          {main.credit && <span className="absolute bottom-2 left-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white">{main.credit}</span>}
          <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium shadow">
            <Expand className="size-3" aria-hidden /> {visible.length} photo{visible.length === 1 ? "" : "s"}
          </span>
        </button>
        {pair && (
          <button type="button" onClick={() => { setIndex(1); setOpen(true); }} aria-label="Open photo 2"
            className="relative hidden h-[420px] overflow-hidden bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={side[0].src} data-src={side[0].src} alt="" loading="lazy" onError={() => markBroken(side[0].src)} className="h-full w-full object-cover" />
            {side[0].credit && <span className="absolute bottom-2 left-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white">{side[0].credit}</span>}
          </button>
        )}
        {!pair && side.length > 0 && (
          <div className="hidden grid-cols-2 gap-2 md:grid">
            {side.map((s, i) => (
              <button key={s.src} type="button" onClick={() => { setIndex(i + 1); setOpen(true); }} aria-label={`Open photo ${i + 2}`}
                className="relative h-[206px] overflow-hidden bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.thumb} data-src={s.src} alt="" loading="lazy" onError={() => markBroken(s.src)} className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/90" />
          <DialogPrimitive.Content className="fixed inset-0 z-50 flex flex-col focus:outline-none" aria-describedby={undefined}>
            <DialogPrimitive.Title className="sr-only">Photos of {address}</DialogPrimitive.Title>
            <div className="flex items-center justify-between p-3 text-sm text-white">
              <span aria-live="polite">{index + 1} / {visible.length}</span>
              <DialogPrimitive.Close className="grid size-10 place-items-center rounded-full hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label="Close">
                <X className="size-5" />
              </DialogPrimitive.Close>
            </div>
            <div className="relative flex min-h-0 flex-1 items-center justify-center px-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={visible[index]?.src} alt={`${address}, photo ${index + 1}`} className="max-h-full max-w-full object-contain" />
              {visible[index]?.credit && <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">{visible[index].credit}</span>}
              {visible.length > 1 && (
                <>
                  <button type="button" onClick={() => go(-1)} aria-label="Previous photo"
                    className="absolute left-3 grid size-11 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><ChevronLeft /></button>
                  <button type="button" onClick={() => go(1)} aria-label="Next photo"
                    className="absolute right-3 grid size-11 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><ChevronRight /></button>
                </>
              )}
            </div>
            <div className="flex gap-2 overflow-x-auto p-3">
              {visible.map((s, i) => (
                <button key={s.src} type="button" onClick={() => setIndex(i)} aria-label={`Photo ${i + 1}`} aria-current={i === index}
                  className={cn("h-14 w-20 shrink-0 overflow-hidden rounded opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white", i === index && "opacity-100 ring-2 ring-white")}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.thumb} data-src={s.src} alt="" loading="lazy" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
