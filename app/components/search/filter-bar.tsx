"use client";

import { PROPERTY_TYPES, SORTS, type SearchState } from "@/lib/search/state";
import type { Source } from "@/lib/search/types";
import { cn } from "@/lib/utils";

const PRICES = [5_000, 10_000, 25_000, 50_000, 100_000, 200_000, 300_000, 500_000];
const fmt = (n: number) => (n >= 1000 ? `$${n / 1000}K` : `$${n}`);

const selectCls =
  "h-9 shrink-0 rounded-full border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function FilterBar({ state, onChange, isArea }: {
  state: SearchState;
  onChange: (next: SearchState) => void;
  isArea: boolean;
}) {
  const f = state.filters;
  const set = (patch: Partial<SearchState["filters"]>) => onChange({ ...state, filters: { ...f, ...patch }, page: 1 });
  const sources: { value: Source; label: string }[] = [
    { value: "tax_deed", label: "Tax deed" },
    { value: "hud", label: "HUD" },
  ];
  const toggleSource = (s: Source) => {
    const on = f.sources.length === 0 || f.sources.includes(s);
    const others = sources.map((x) => x.value).filter((x) => x !== s);
    // Turning one off leaves the other; turning the last one off brings both back
    set({ sources: on ? (f.sources.length === 1 ? [] : others) : [] });
  };
  const nearby = state.radiusMi != null;

  return (
    <div className="relative flex items-center gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:none] sm:px-6" role="toolbar" aria-label="Filters">
      <div role="group" aria-label="Source" className="flex shrink-0 overflow-hidden rounded-full border">
        {sources.map((s, i) => {
          const active = f.sources.length === 0 || f.sources.includes(s.value);
          return (
            <button key={s.value} type="button" aria-pressed={active} onClick={() => toggleSource(s.value)}
              className={cn("h-9 px-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                i > 0 && "border-l", active ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent")}>
              {s.label}
            </button>
          );
        })}
      </div>

      <label className="sr-only" htmlFor="f-pmin">Minimum price</label>
      <select id="f-pmin" className={selectCls} value={f.priceMin ?? ""} onChange={(e) => set({ priceMin: e.target.value ? Number(e.target.value) : null })}>
        <option value="">Min price</option>
        {PRICES.map((p) => <option key={p} value={p}>{fmt(p)}+</option>)}
      </select>
      <label className="sr-only" htmlFor="f-pmax">Maximum price</label>
      <select id="f-pmax" className={selectCls} value={f.priceMax ?? ""} onChange={(e) => set({ priceMax: e.target.value ? Number(e.target.value) : null })}>
        <option value="">Max price</option>
        {PRICES.map((p) => <option key={p} value={p}>Up to {fmt(p)}</option>)}
      </select>

      <label className="sr-only" htmlFor="f-type">Property type</label>
      <select id="f-type" className={selectCls} value={f.types[0] ?? ""} onChange={(e) => set({ types: e.target.value ? [e.target.value] : [] })}>
        <option value="">Any type</option>
        {PROPERTY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>

      <label className="sr-only" htmlFor="f-beds">Bedrooms</label>
      <select id="f-beds" className={selectCls} value={f.bedsMin ?? ""} onChange={(e) => set({ bedsMin: e.target.value ? Number(e.target.value) : null })}>
        <option value="">Beds</option>
        {[1, 2, 3, 4, 5].map((b) => <option key={b} value={b}>{b}+ beds</option>)}
      </select>

      <Toggle label="Has building" checked={f.hasBuilding} onChange={(v) => set({ hasBuilding: v })} />
      <Toggle label="Hide redeemed/sold" checked={!f.showClosed} onChange={(v) => set({ showClosed: !v })} />

      {isArea && (
        <Toggle label="Include nearby" checked={nearby}
          onChange={(v) => onChange({ ...state, radiusMi: v ? 10 : null, page: 1 })} />
      )}
      {(nearby || !isArea) && (
        <label className="flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm">
          <span className="whitespace-nowrap">{isArea ? "+" : "Within"} {state.radiusMi} mi</span>
          <input type="range" min={5} max={50} step={5} value={state.radiusMi ?? 25}
            aria-label="Radius in miles" className="w-24 accent-[hsl(var(--primary))]"
            onChange={(e) => onChange({ ...state, radiusMi: Number(e.target.value), page: 1 })} />
        </label>
      )}

      <div className="ml-auto shrink-0 pl-2">
        <label className="sr-only" htmlFor="f-sort">Sort</label>
        <select id="f-sort" className={selectCls} value={state.sort} onChange={(e) => onChange({ ...state, sort: e.target.value as SearchState["sort"], page: 1 })}>
          {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className={cn("h-9 shrink-0 whitespace-nowrap rounded-full border px-3 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        checked ? "border-primary bg-accent text-accent-foreground" : "bg-background hover:bg-accent")}>
      {label}
    </button>
  );
}
