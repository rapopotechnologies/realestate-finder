"use client";

import Link from "next/link";
import { useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { CalendarClock, CircleDollarSign, Download, GripVertical, Heart, StickyNote } from "lucide-react";
import { toast } from "sonner";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Source } from "@/lib/search/types";
import { STAGES, STRATEGIES, followUpState, labelOf, type Stage, type Strategy } from "@/lib/deals";
import { dealTier } from "@/lib/deal";
import { bathsLabel, money, number, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DealChip, SourceBadge } from "@/components/property/badges";
import { PropertyPhoto } from "@/components/property/property-photo";

export interface SavedItem {
  propertyId: string;
  status: Stage;
  strategy: Strategy;
  followUp: string | null;
  latestOffer: string | null; // "Offered $45,000 · countered $60,000"
  address: string | null;
  city: string | null;
  zip: string | null;
  county: string | null;
  source: Source | null;
  price: number | null;
  eventDate: string | null;
  listingStatus: string | null;
  marketValue: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  owner: { name: string; mailing_address: string | null; mailing_city: string | null; mailing_state: string | null; mailing_zip: string | null } | null;
  latestNote: string | null;
  noteCount: number;
  thumb: string | null;
  photoSource: string | null;
  savedAt: string;
}

/** Within a column: follow-ups first (soonest), then the auction / bid deadline */
function byNextAction(a: SavedItem, b: SavedItem) {
  return (a.followUp ?? "9999").localeCompare(b.followUp ?? "9999") || (a.eventDate ?? "9999").localeCompare(b.eventDate ?? "9999");
}

export function MyListBoard({ initial }: { initial: SavedItem[] }) {
  const [items, setItems] = useState(initial);
  const [strategy, setStrategy] = useState<Strategy | "all">("all");
  // filter() copies, so sorting never reorders the state array itself
  const shown = items.filter((i) => strategy === "all" || i.strategy === strategy).sort(byNextAction);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));

  async function move(propertyId: string, status: Stage) {
    const prev = items;
    if (prev.find((i) => i.propertyId === propertyId)?.status === status) return;
    setItems((xs) => xs.map((x) => (x.propertyId === propertyId ? { ...x, status } : x)));
    const { error } = await createSupabaseBrowserClient().from("saved_properties").update({ status }).eq("property_id", propertyId);
    if (error) { setItems(prev); toast.error("Couldn't move that property"); }
  }

  function onDragEnd(e: DragEndEvent) {
    if (e.over) move(String(e.active.id), e.over.id as Stage);
  }

  if (!items.length) {
    return (
      <EmptyState page icon={Heart} title="Your list is empty"
        body="Tap the heart on any property to save it here, then track calls, offers and follow-ups."
        action={<Button asChild><Link href="/search">Find properties</Link></Button>} />
    );
  }

  return (
    <div className="px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl">My List</h1>
          <p className="text-sm text-muted-foreground">{items.length} saved propert{items.length === 1 ? "y" : "ies"}. Drag cards between columns or use the menu on each card.</p>
        </div>
        <Button variant="outline" onClick={() => downloadCsv(shown)}><Download /> Export CSV</Button>
      </div>
      <div role="group" aria-label="Strategy" className="mb-4 flex flex-wrap gap-2">
        {[{ value: "all" as const, label: "All" }, ...STRATEGIES].map((s) => (
          <button key={s.value} type="button" aria-pressed={strategy === s.value} onClick={() => setStrategy(s.value)}
            className={cn("h-8 rounded-full border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              strategy === s.value ? "border-primary bg-primary text-primary-foreground [&>span]:text-primary-foreground/80" : "bg-card hover:bg-accent")}>
            {s.label}
            <span className="ml-1 text-xs text-muted-foreground">{s.value === "all" ? items.length : items.filter((i) => i.strategy === s.value).length}</span>
          </button>
        ))}
      </div>
      <DndContext id="my-list" sensors={sensors} onDragEnd={onDragEnd}>
        {/* Six stages: stacked on phones, a scrolling row of columns from tablet up */}
        <div className="grid grid-cols-1 gap-4 md:flex md:items-start md:overflow-x-auto md:pb-3">
          {STAGES.map((s) => (
            <Column key={s.value} status={s.value} title={s.label} items={shown.filter((i) => i.status === s.value)} onMove={move} />
          ))}
        </div>
      </DndContext>
    </div>
  );
}

function Column({ status, title, items, onMove }: { status: Stage; title: string; items: SavedItem[]; onMove: (id: string, s: Stage) => void }) {
  const { isOver, setNodeRef } = useDroppable({ id: status });
  return (
    <section ref={setNodeRef} aria-labelledby={`col-${status}`}
      className={cn("flex min-h-40 min-w-0 flex-col rounded-xl border bg-card p-3 transition md:w-72 md:shrink-0", isOver && "border-plat bg-plat-soft")}>
      <h2 id={`col-${status}`} className="mb-3 flex items-center justify-between border-b pb-2 font-sans text-sm font-semibold">
        {title} <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">{items.length}</span>
      </h2>
      <ul className="space-y-3">
        {items.map((i) => <SavedCard key={i.propertyId} item={i} onMove={onMove} />)}
        {!items.length && <li className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">Drop properties here</li>}
      </ul>
    </section>
  );
}

function SavedCard({ item, onMove }: { item: SavedItem; onMove: (id: string, s: Stage) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.propertyId });
  const facts = [item.beds != null ? `${item.beds} bd` : null, bathsLabel(item.baths), item.sqft ? `${number(item.sqft)} sqft` : null].filter(Boolean).join(" · ");
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform) }}
      className={cn("overflow-hidden rounded-lg border bg-card shadow-sm", isDragging && "relative z-10 shadow-lg ring-2 ring-plat")}>
      <div className="flex gap-3 p-2">
        <PropertyPhoto src={item.thumb} propertyId={item.propertyId} photoSource={item.photoSource} alt={item.address ?? "Property"}
          className="h-20 w-24 shrink-0 rounded-md" size="240x200" />
        <div className="min-w-0 flex-1">
          <Link href={`/property/${item.propertyId}`} className="block truncate text-sm font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {money(item.price)} · {item.address ?? "Address not listed"}
          </Link>
          <p className="truncate text-xs text-muted-foreground">{[item.city, item.county && `${item.county} County`, item.zip].filter(Boolean).join(" · ")}</p>
          {facts && <p className="text-xs">{facts}</p>}
          <div className="mt-1 flex flex-wrap gap-1">
            {item.source && <SourceBadge source={item.source} date={item.eventDate} className="text-[10px]" />}
            {item.strategy !== "undecided" && (
              <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium">{labelOf(STRATEGIES, item.strategy)}</span>
            )}
            <DealChip source={item.source} tier={dealTier(item.price, item.marketValue)} className="text-[10px]" />
          </div>
        </div>
        <button type="button" {...listeners} {...attributes} aria-label={`Drag ${item.address ?? "property"} to another column`}
          className="hidden h-8 cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:block">
          <GripVertical className="size-4" />
        </button>
      </div>
      {(item.latestOffer || item.followUp) && (
        <div className="space-y-1 border-t px-3 py-2 text-xs">
          {item.latestOffer && (
            <p className="flex gap-1.5 font-medium"><CircleDollarSign className="mt-0.5 size-3 shrink-0" aria-hidden />{item.latestOffer}</p>
          )}
          {item.followUp && <FollowUp date={item.followUp} />}
        </div>
      )}
      {item.latestNote && (
        <p className="flex gap-1.5 border-t bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
          <StickyNote className="mt-0.5 size-3 shrink-0" aria-hidden />
          <span className="line-clamp-2">{item.latestNote}{item.noteCount > 1 && ` (+${item.noteCount - 1} more)`}</span>
        </p>
      )}
      <div className="border-t px-2 py-1.5">
        <label className="sr-only" htmlFor={`st-${item.propertyId}`}>Status</label>
        <select id={`st-${item.propertyId}`} value={item.status} onChange={(e) => onMove(item.propertyId, e.target.value as Stage)}
          className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>
    </li>
  );
}

function FollowUp({ date }: { date: string }) {
  const state = followUpState(date);
  return (
    <p className={cn("flex gap-1.5", state === "overdue" ? "font-semibold text-destructive" : state === "today" ? "font-semibold text-deed" : "text-muted-foreground")}>
      <CalendarClock className="mt-0.5 size-3 shrink-0" aria-hidden />
      {state === "overdue" ? `Follow-up overdue (${shortDate(date)})` : state === "today" ? "Follow up today" : `Follow up ${shortDate(date)}`}
    </p>
  );
}

function downloadCsv(items: SavedItem[]) {
  const header = ["Stage", "Strategy", "Latest offer", "Follow up", "Address", "City", "ZIP", "County", "Source", "Price", "Auction / bid deadline", "Listing status",
    "County value", "Beds", "Baths", "Sq ft", "Owner", "Owner mailing address", "Latest note", "Link"];
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    // Quote everything; neutralize spreadsheet formulas
    return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
  };
  const rows = items.map((i) => [
    labelOf(STAGES, i.status), labelOf(STRATEGIES, i.strategy), i.latestOffer, i.followUp, i.address, i.city, i.zip, i.county,
    i.source === "tax_deed" ? "Tax deed" : i.source === "hud" ? "HUD" : "", i.price, i.eventDate, i.listingStatus,
    i.marketValue, i.beds, i.baths, i.sqft, i.owner?.name,
    i.owner ? [i.owner.mailing_address, i.owner.mailing_city, i.owner.mailing_state, i.owner.mailing_zip].filter(Boolean).join(" ") : "",
    i.latestNote, `${window.location.origin}/property/${i.propertyId}`,
  ]);
  const csv = [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `my-list-${new Date().toISOString().slice(0, 10)}.csv` });
  a.click();
  URL.revokeObjectURL(url);
}
