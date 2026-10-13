"use client";

import Link from "next/link";
import { useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Download, GripVertical, Heart, StickyNote } from "lucide-react";
import { toast } from "sonner";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { SavedStatus, Source } from "@/lib/search/types";
import { dealTier } from "@/lib/deal";
import { bathsLabel, money, number } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DealChip, SourceBadge } from "@/components/property/badges";
import { PropertyPhoto } from "@/components/property/property-photo";
import { STATUSES } from "@/components/property/status-notes";

export interface SavedItem {
  propertyId: string;
  status: SavedStatus;
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

export function MyListBoard({ initial }: { initial: SavedItem[] }) {
  const [items, setItems] = useState(initial);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));

  async function move(propertyId: string, status: SavedStatus) {
    const prev = items;
    if (prev.find((i) => i.propertyId === propertyId)?.status === status) return;
    setItems((xs) => xs.map((x) => (x.propertyId === propertyId ? { ...x, status } : x)));
    const { error } = await createSupabaseBrowserClient().from("saved_properties").update({ status }).eq("property_id", propertyId);
    if (error) { setItems(prev); toast.error("Couldn't move that property"); }
  }

  function onDragEnd(e: DragEndEvent) {
    if (e.over) move(String(e.active.id), e.over.id as SavedStatus);
  }

  if (!items.length) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
        <Heart className="size-10 text-muted-foreground" aria-hidden />
        <h1 className="mt-4 text-2xl font-semibold">Your list is empty</h1>
        <p className="mt-2 text-muted-foreground">Tap the heart on any property to save it here and track your outreach.</p>
        <Button asChild className="mt-6"><Link href="/search">Find properties</Link></Button>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">My List</h1>
          <p className="text-sm text-muted-foreground">{items.length} saved propert{items.length === 1 ? "y" : "ies"}. Drag cards between columns or use the menu on each card.</p>
        </div>
        <Button variant="outline" onClick={() => downloadCsv(items)}><Download /> Export CSV</Button>
      </div>
      <DndContext id="my-list" sensors={sensors} onDragEnd={onDragEnd}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {STATUSES.map((s) => (
            <Column key={s.value} status={s.value} title={s.label} items={items.filter((i) => i.status === s.value)} onMove={move} />
          ))}
        </div>
      </DndContext>
    </div>
  );
}

function Column({ status, title, items, onMove }: { status: SavedStatus; title: string; items: SavedItem[]; onMove: (id: string, s: SavedStatus) => void }) {
  const { isOver, setNodeRef } = useDroppable({ id: status });
  return (
    <section ref={setNodeRef} aria-labelledby={`col-${status}`}
      className={cn("flex min-h-40 flex-col rounded-xl border bg-secondary/50 p-3 transition", isOver && "border-primary bg-accent")}>
      <h2 id={`col-${status}`} className="mb-3 flex items-center justify-between text-sm font-semibold">
        {title} <span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted-foreground">{items.length}</span>
      </h2>
      <ul className="space-y-3">
        {items.map((i) => <SavedCard key={i.propertyId} item={i} onMove={onMove} />)}
        {!items.length && <li className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">Drop properties here</li>}
      </ul>
    </section>
  );
}

function SavedCard({ item, onMove }: { item: SavedItem; onMove: (id: string, s: SavedStatus) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.propertyId });
  const facts = [item.beds != null ? `${item.beds} bd` : null, bathsLabel(item.baths), item.sqft ? `${number(item.sqft)} sqft` : null].filter(Boolean).join(" · ");
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform) }}
      className={cn("overflow-hidden rounded-lg border bg-card shadow-sm", isDragging && "relative z-10 shadow-lg ring-2 ring-primary")}>
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
            <DealChip source={item.source} tier={dealTier(item.price, item.marketValue)} className="text-[10px]" />
          </div>
        </div>
        <button type="button" {...listeners} {...attributes} aria-label={`Drag ${item.address ?? "property"} to another column`}
          className="hidden h-8 cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:block">
          <GripVertical className="size-4" />
        </button>
      </div>
      {item.latestNote && (
        <p className="flex gap-1.5 border-t bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
          <StickyNote className="mt-0.5 size-3 shrink-0" aria-hidden />
          <span className="line-clamp-2">{item.latestNote}{item.noteCount > 1 && ` (+${item.noteCount - 1} more)`}</span>
        </p>
      )}
      <div className="border-t px-2 py-1.5">
        <label className="sr-only" htmlFor={`st-${item.propertyId}`}>Status</label>
        <select id={`st-${item.propertyId}`} value={item.status} onChange={(e) => onMove(item.propertyId, e.target.value as SavedStatus)}
          className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>
    </li>
  );
}

function downloadCsv(items: SavedItem[]) {
  const header = ["Status", "Address", "City", "ZIP", "County", "Source", "Price", "Auction / bid deadline", "Listing status",
    "Est. value", "Beds", "Baths", "Sq ft", "Owner", "Owner mailing address", "Latest note", "Link"];
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    // Quote everything; neutralize spreadsheet formulas
    return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
  };
  const rows = items.map((i) => [
    STATUSES.find((s) => s.value === i.status)?.label, i.address, i.city, i.zip, i.county,
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
