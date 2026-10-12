"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Building2, Hash, Landmark, Loader2, MapPin, Search } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { areaHref } from "@/lib/search/state";
import type { Layer, Place } from "@/lib/search/types";
import { cn } from "@/lib/utils";

type Option =
  | { kind: "place"; place: Place }
  | { kind: "address"; text: string };

const GROUPS: { layer: Layer; title: string; icon: typeof MapPin }[] = [
  { layer: "place", title: "City", icon: Building2 },
  { layer: "zcta", title: "ZIP", icon: Hash },
  { layer: "county", title: "County", icon: Landmark },
];

// Filters survive a new area; area keys don't
const AREA_KEYS = ["county", "zip", "city", "place", "lat", "lng", "near", "q", "page"];

function looksLikeAddress(q: string) {
  return /^\s*\d+\s+\S+/.test(q) && !/^\s*\d{1,5}\s*$/.test(q);
}

export function SearchBox({ className, autoFocus, placeholder = "City, ZIP, county or address" }: {
  className?: string;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const id = useId();
  const [q, setQ] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setPlaces([]);
      return;
    }
    const mine = ++reqId.current;
    const t = setTimeout(async () => {
      const { data } = await createSupabaseBrowserClient().rpc("suggest_places", { q: term });
      if (mine === reqId.current) setPlaces((data as Place[] | null) ?? []);
    }, 150);
    return () => clearTimeout(t);
  }, [q]);

  // Grouped City / ZIP / County, then Address
  const options = useMemo<Option[]>(() => {
    const out: Option[] = [];
    for (const g of GROUPS) for (const p of places.filter((x) => x.layer === g.layer)) out.push({ kind: "place", place: p });
    if (looksLikeAddress(q)) out.push({ kind: "address", text: q.trim() });
    return out;
  }, [places, q]);

  useEffect(() => setActive(0), [options.length]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function withFilters(href: string) {
    if (pathname !== "/search") return href;
    const keep = new URLSearchParams(params.toString());
    AREA_KEYS.forEach((k) => keep.delete(k));
    const [path, qs] = href.split("?");
    const next = new URLSearchParams(qs);
    keep.forEach((v, k) => { if (!next.has(k)) next.set(k, v); });
    return `${path}?${next.toString()}`;
  }

  async function choose(opt: Option) {
    setOpen(false);
    setError(null);
    if (opt.kind === "place") {
      setQ(opt.place.label);
      router.push(withFilters(areaHref(opt.place.layer, opt.place.geoid, opt.place.layer === "place" ? opt.place.label : undefined)));
      return;
    }
    setLoading(true);
    try {
      const r = await fetch(`/api/geocode?q=${encodeURIComponent(opt.text)}`);
      const j = await r.json();
      if (!r.ok || !j.lat) throw new Error(j.error || "Address not found");
      setQ(j.label);
      router.push(withFilters(`/search?lat=${j.lat}&lng=${j.lng}&r=5&q=${encodeURIComponent(j.label)}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Address not found");
      setOpen(true);
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = options[active] ?? (q.trim().length > 3 ? ({ kind: "address", text: q.trim() } as Option) : null);
      if (opt) choose(opt);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const listId = `${id}-list`;
  const optId = (i: number) => `${id}-opt-${i}`;
  const showList = open && (options.length > 0 || !!error || (q.trim().length >= 2 && !loading));

  let idx = -1;
  return (
    <div ref={wrap} className={cn("relative w-full", className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && options[active] ? optId(active) : undefined}
          aria-label="Search by city, ZIP, county or address"
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
          value={q}
          placeholder={placeholder}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setError(null); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="h-10 w-full rounded-full border border-input bg-background pl-9 pr-9 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-label="Searching" />}
      </div>
      {showList && (
        <div id={listId} role="listbox" aria-label="Suggestions"
          className="absolute z-50 mt-1 max-h-96 w-full overflow-auto rounded-xl border bg-popover p-1 text-sm shadow-lg">
          {error && <p className="px-3 py-2 text-destructive" role="alert">{error}</p>}
          {GROUPS.map((g) => {
            const group = options.filter((o) => o.kind === "place" && o.place.layer === g.layer);
            if (!group.length) return null;
            return (
              <div key={g.layer} role="group" aria-label={g.title}>
                <div className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{g.title}</div>
                {group.map((o) => {
                  idx = options.indexOf(o);
                  const i = idx;
                  const p = (o as Extract<Option, { kind: "place" }>).place;
                  return (
                    <div key={`${p.layer}-${p.geoid}`} id={optId(i)} role="option" aria-selected={i === active}
                      onMouseDown={(e) => e.preventDefault()} onClick={() => choose(o)} onMouseEnter={() => setActive(i)}
                      className={cn("flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2", i === active && "bg-accent text-accent-foreground")}>
                      <g.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span>{p.label}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
          {options.map((o, i) => o.kind === "address" && (
            <div key="address" role="group" aria-label="Address">
              <div className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Address</div>
              <div id={optId(i)} role="option" aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()} onClick={() => choose(o)} onMouseEnter={() => setActive(i)}
                className={cn("flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2", i === active && "bg-accent text-accent-foreground")}>
                <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span>Search near “{o.text}”</span>
              </div>
            </div>
          ))}
          {!options.length && !error && <p className="px-3 py-2 text-muted-foreground">No matching places. Try a city, ZIP or full address.</p>}
        </div>
      )}
    </div>
  );
}
