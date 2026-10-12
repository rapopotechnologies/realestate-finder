"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { AlertCircle, ChevronLeft, ChevronRight, List, LocateFixed, Map as MapIcon, SearchX, X } from "lucide-react";
import { toast } from "sonner";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { areaHref, parseSearch, rpcArgs, serializeSearch, type SearchState } from "@/lib/search/state";
import type { Area, Coverage, Layer, ListingItem, SearchResult } from "@/lib/search/types";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PropertyCard, PropertyCardSkeleton } from "@/components/property/property-card";
import { CoverageBadge } from "./coverage-badge";
import { FilterBar } from "./filter-bar";
import { SearchBox } from "./search-box";

// MapLibre touches window: load it in the browser only
const PropertyMap = dynamic(() => import("@/components/map/property-map").then((m) => m.PropertyMap), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-muted" aria-label="Loading map" />,
});

const SUGGESTED = [
  { label: "Orlando, FL", href: "/search?city=Orlando,FL" },
  { label: "Clermont, FL", href: "/search?city=Clermont,FL" },
  { label: "Lakeland, FL", href: "/search?city=Lakeland,FL" },
  { label: "Lake County, FL", href: "/search?county=12069" },
  { label: "Polk County, FL", href: "/search?county=12105" },
  { label: "34711", href: "/search?zip=34711" },
];

type Locate = "idle" | "asking" | "denied";

export function SearchView({ lastSearch }: { lastSearch: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const qs = params.toString();
  const state = useMemo(() => parseSearch(new URLSearchParams(qs)), [qs]);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [area, setArea] = useState<Area | null>(null);
  const [areaError, setAreaError] = useState<string | null>(null);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "map">("list");
  const [locate, setLocate] = useState<Locate>("idle");
  const listRef = useRef<HTMLDivElement>(null);

  const go = useCallback((next: SearchState, replace = false) => {
    const url = `${pathname}?${serializeSearch(next)}`;
    if (replace) router.replace(url, { scroll: false });
    else router.push(url, { scroll: false });
  }, [pathname, router]);

  // ── First open: last search, else "Near you", else suggestions ──────────
  useEffect(() => {
    if (state.area.kind !== "none") return;
    if (lastSearch) {
      router.replace(`/search?${lastSearch}`);
      return;
    }
    if (!("geolocation" in navigator)) { setLocate("denied"); return; }
    setLocate("asking");
    navigator.geolocation.getCurrentPosition(
      (pos) => router.replace(`/search?lat=${pos.coords.latitude.toFixed(5)}&lng=${pos.coords.longitude.toFixed(5)}&near=1`),
      () => setLocate("denied"),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
    );
  }, [state.area.kind, lastSearch, router]);

  function locateMe() {
    setLocate("asking");
    navigator.geolocation?.getCurrentPosition(
      (pos) => router.push(`/search?lat=${pos.coords.latitude.toFixed(5)}&lng=${pos.coords.longitude.toFixed(5)}&near=1`),
      () => { setLocate("denied"); toast.error("Location is blocked. Allow it in your browser settings, or search an area."); },
      { timeout: 10000 }
    );
  }

  // ── Resolve the area (outline, bbox) ─────────────────────────────────────
  const areaKey = state.area.kind === "area" ? `${state.area.layer}:${state.area.geoid ?? ""}:${state.area.label ?? ""}` : "";
  useEffect(() => {
    if (state.area.kind !== "area") { setArea(null); setAreaError(null); return; }
    const a = state.area;
    let stale = false;
    supabase.rpc("get_area", { p_layer: a.layer, p_geoid: a.geoid, p_label: a.label }).then(({ data, error }) => {
      if (stale) return;
      if (error || !data) { setArea(null); setAreaError("We couldn't find that area. Try another search."); return; }
      setAreaError(null);
      setArea(data as unknown as Area);
    });
    return () => { stale = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- areaKey captures state.area
  }, [areaKey, supabase]);

  // ── Coverage (and start tracking supported counties on demand) ───────────
  const coverageKey = state.area.kind === "area" ? `${area?.geoid}:${state.radiusMi}`
    : state.area.kind === "point" ? `${state.area.lat}:${state.area.lng}:${state.radiusMi}` : "";
  useEffect(() => {
    if (state.area.kind === "none" || (state.area.kind === "area" && !area)) { setCoverage(null); return; }
    const args = state.area.kind === "area"
      ? { p_area_layer: area!.layer, p_area_geoid: area!.geoid, p_radius_mi: state.radiusMi ?? undefined }
      : { p_lat: state.area.lat, p_lng: state.area.lng, p_radius_mi: state.radiusMi ?? undefined };
    let stale = false;
    supabase.rpc("ensure_area_coverage", args).then(({ data }) => {
      if (stale || !data) return;
      const c = data as unknown as Coverage;
      setCoverage(c);
      for (const county of c.counties.filter((x) => x.newly_activated)) {
        toast.success(`We've started tracking ${county.name} County. Results appear within 24 hours.`, { duration: 8000 });
      }
    });
    return () => { stale = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- coverageKey captures the inputs
  }, [coverageKey, supabase]);

  // ── Search ───────────────────────────────────────────────────────────────
  const searchKey = `${qs}|${area?.geoid ?? ""}`;
  useEffect(() => {
    if (state.area.kind === "none" || (state.area.kind === "area" && !area)) return;
    const args = rpcArgs(state, area?.geoid ?? null);
    if (!args) return;
    let stale = false;
    setLoading(true);
    setError(null);
    supabase.rpc("search_properties", args).then(({ data, error }) => {
      if (stale) return;
      setLoading(false);
      if (error) { setError("Search failed. Check your connection and try again."); return; }
      setResult(data as unknown as SearchResult);
      listRef.current?.scrollTo({ top: 0 });
    });
    return () => { stale = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- searchKey captures state + area
  }, [searchKey, supabase]);

  // Signed URLs for this page's HUD thumbnails (private bucket)
  useEffect(() => {
    const paths = (result?.items ?? []).map((i) => i.thumb_path).filter((p): p is string => !!p && !photos[p]);
    if (!paths.length) return;
    supabase.storage.from("photos").createSignedUrls(paths, 3600).then(({ data }) => {
      if (!data) return;
      setPhotos((prev) => {
        const next = { ...prev };
        for (const d of data) if (d.path && d.signedUrl) next[d.path] = d.signedUrl;
        return next;
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the page of results changes
  }, [result, supabase]);

  // Remember the last search on the profile
  useEffect(() => {
    if (state.area.kind === "none") return;
    const t = setTimeout(async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) await supabase.from("profiles").update({ last_search: serializeSearch({ ...state, page: 1 }) }).eq("id", user.id);
    }, 1500);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- qs captures state
  }, [qs, supabase]);

  // Clicking a pin highlights (and scrolls to) its card
  useEffect(() => {
    if (!selectedId) return;
    document.getElementById(`card-${selectedId}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedId]);

  const onAreaClick = useCallback((layer: Layer, geoid: string, label: string) => {
    const keep = new URLSearchParams(qs);
    ["county", "zip", "city", "place", "lat", "lng", "near", "q", "page", "r"].forEach((k) => keep.delete(k));
    const href = areaHref(layer, geoid, layer === "place" ? label : undefined);
    const [, areaQs] = href.split("?");
    router.push(`/search?${areaQs}${keep.toString() ? `&${keep}` : ""}`);
  }, [qs, router]);

  // ── Render ───────────────────────────────────────────────────────────────
  if (state.area.kind === "none") {
    return <Welcome locate={locate} onLocate={locateMe} />;
  }

  const title = state.area.kind === "point"
    ? state.area.near ? "Near you" : `Near ${state.area.label ?? "this address"}`
    : area?.label ?? (areaError ? "Area not found" : "Loading…");
  const items = result?.items ?? [];
  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.page_size)) : 1;
  const selected = selectedId ? items.find((i) => i.listing_id === selectedId) ?? null : null;
  const selectedPoint = selectedId && !selected ? result?.points.find((p) => p.listing_id === selectedId) ?? null : null;

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col">
      <div className="border-b bg-card">
        <FilterBar state={state} onChange={(s) => go(s)} isArea={state.area.kind === "area"} />
      </div>

      <div className="relative grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(420px,44%)]">
        {/* Map */}
        <div className={cn("relative min-h-0", view === "map" ? "block" : "hidden lg:block")}>
          <PropertyMap
            area={area}
            point={state.area.kind === "point" ? { lat: state.area.lat, lng: state.area.lng, radiusMi: state.radiusMi ?? 25 } : null}
            nearbyRadiusMi={state.area.kind === "area" ? state.radiusMi : null}
            points={result?.points ?? []}
            hoveredId={hoveredId}
            selectedId={selectedId}
            onHover={setHoveredId}
            onSelect={setSelectedId}
            onAreaClick={onAreaClick}
          />
          {(selected || selectedPoint) && (
            <div className="absolute inset-x-3 bottom-3 z-10 mx-auto max-w-sm">
              <button type="button" aria-label="Close" onClick={() => setSelectedId(null)}
                className="absolute -right-2 -top-2 z-20 grid size-7 place-items-center rounded-full border bg-card shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <X className="size-3.5" />
              </button>
              {selected ? (
                <PropertyCard item={selected} photoUrl={selected.thumb_path ? photos[selected.thumb_path] : null} highlighted />
              ) : selectedPoint?.property_id && (
                <Link href={`/property/${selectedPoint.property_id}`}
                  className="block rounded-xl border bg-card p-3 shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <p className="text-lg font-bold">{money(selectedPoint.price)}</p>
                  <p className="text-sm text-muted-foreground">{selectedPoint.source === "hud" ? "HUD home" : "Tax deed"} · open details</p>
                </Link>
              )}
            </div>
          )}
        </div>

        {/* List */}
        <div ref={listRef} className={cn("min-h-0 overflow-y-auto bg-background", view === "list" ? "block" : "hidden lg:block")}>
          <div className="space-y-1 px-4 pb-2 pt-4 sm:px-6">
            <h1 className="text-xl font-semibold">{title}</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              {result && !loading && <span aria-live="polite">{result.total.toLocaleString()} propert{result.total === 1 ? "y" : "ies"}</span>}
              <CoverageBadge coverage={coverage} />
            </div>
          </div>

          {areaError ? (
            <EmptyState icon={SearchX} title="Area not found" body={areaError} />
          ) : error ? (
            <EmptyState icon={AlertCircle} title="Something went wrong" body={error}
              action={<Button variant="outline" onClick={() => router.refresh()}>Try again</Button>} />
          ) : loading && !result ? (
            <div className="grid gap-4 px-4 pb-6 sm:grid-cols-2 sm:px-6">{Array.from({ length: 6 }, (_, i) => <PropertyCardSkeleton key={i} />)}</div>
          ) : items.length === 0 && result ? (
            <EmptyState icon={SearchX} title="No properties match"
              body={coverage?.counties.some((c) => c.status === "starting")
                ? "We just started tracking this area. Tax deed auctions show up after tonight's update."
                : "Try a bigger area, turn on “Include nearby”, or loosen the filters."}
              action={state.area.kind === "area" && state.radiusMi == null
                ? <Button variant="outline" onClick={() => go({ ...state, radiusMi: 10, page: 1 })}>Include nearby (10 mi)</Button>
                : undefined} />
          ) : (
            <>
              <div className={cn("grid gap-4 px-4 pb-4 sm:grid-cols-2 sm:px-6", loading && "opacity-60 transition-opacity")} aria-busy={loading}>
                {items.map((item) => (
                  <PropertyCard key={item.listing_id} item={item}
                    photoUrl={item.thumb_path ? photos[item.thumb_path] : null}
                    highlighted={item.listing_id === selectedId || item.listing_id === hoveredId}
                    showDistance={state.area.kind === "point" || state.radiusMi != null}
                    onHover={setHoveredId} />
                ))}
              </div>
              {totalPages > 1 && (
                <nav className="flex items-center justify-center gap-3 px-4 pb-8" aria-label="Pages">
                  <Button variant="outline" size="sm" disabled={state.page <= 1} onClick={() => go({ ...state, page: state.page - 1 })}>
                    <ChevronLeft /> Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">Page {state.page} of {totalPages}</span>
                  <Button variant="outline" size="sm" disabled={state.page >= totalPages} onClick={() => go({ ...state, page: state.page + 1 })}>
                    Next <ChevronRight />
                  </Button>
                </nav>
              )}
            </>
          )}
        </div>

        {/* Mobile Map / List toggle */}
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center lg:hidden">
          <Button className="pointer-events-auto rounded-full shadow-lg" onClick={() => setView((v) => (v === "list" ? "map" : "list"))}>
            {view === "list" ? <><MapIcon /> Map</> : <><List /> List</>}
          </Button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, title, body, action }: { icon: typeof SearchX; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="mx-4 my-8 flex flex-col items-center rounded-xl border border-dashed bg-card px-6 py-10 text-center sm:mx-6" role="status">
      <Icon className="size-8 text-muted-foreground" aria-hidden />
      <h2 className="mt-3 font-semibold">{title}</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function Welcome({ locate, onLocate }: { locate: Locate; onLocate: () => void }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-16 text-center sm:py-24">
      <h1 className="text-3xl font-bold">Where do you want to look?</h1>
      <p className="mt-2 text-muted-foreground">
        {locate === "asking" ? "Finding properties near you…" : "Search a city, ZIP code, county or address in Florida."}
      </p>
      <SearchBox className="mt-6" autoFocus />
      <Button variant="ghost" className="mt-3" onClick={onLocate} disabled={locate === "asking"}>
        <LocateFixed /> Use my location
      </Button>
      <div className="mt-8">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Popular areas</p>
        <ul className="mt-3 flex flex-wrap justify-center gap-2">
          {SUGGESTED.map((s) => (
            <li key={s.href}>
              <Link href={s.href} className="inline-block rounded-full border bg-card px-3 py-1.5 text-sm shadow-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {s.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
