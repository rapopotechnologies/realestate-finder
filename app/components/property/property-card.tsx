"use client";

import Link from "next/link";
import { forwardRef } from "react";
import { bathsLabel, money, number } from "@/lib/format";
import type { ListingItem } from "@/lib/search/types";
import { cn } from "@/lib/utils";
import { DealChip, SourceBadge } from "./badges";
import { PropertyPhoto } from "./property-photo";
import { SaveButton } from "./save-button";

export const PropertyCard = forwardRef<HTMLElement, {
  item: ListingItem;
  photoUrl?: string | null;
  highlighted?: boolean;
  showDistance?: boolean;
  onHover?: (id: string | null) => void;
}>(function PropertyCard({ item, photoUrl, highlighted, showDistance, onHover }, ref) {
  const facts = [
    item.beds != null ? `${item.beds} bd` : null,
    bathsLabel(item.baths),
    item.sqft ? `${number(item.sqft)} sqft` : null,
  ].filter(Boolean);
  const place = [item.city, item.county_name ? `${item.county_name} County` : null, item.zip].filter(Boolean).join(" · ");
  const title = item.address || "Address not listed";
  const href = item.property_id ? `/property/${item.property_id}` : "#";

  return (
    <article
      ref={ref}
      id={`card-${item.listing_id}`}
      onMouseEnter={() => onHover?.(item.listing_id)}
      onMouseLeave={() => onHover?.(null)}
      onFocus={() => onHover?.(item.listing_id)}
      onBlur={() => onHover?.(null)}
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-card shadow-sm transition hover:shadow-md",
        highlighted && "ring-2 ring-primary"
      )}
    >
      <Link href={href} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
        <PropertyPhoto src={photoUrl} propertyId={item.property_id} photoSource={item.photo_source} alt={title}
          className="aspect-[16/10] w-full" size="640x400" />
        <div className="space-y-1.5 p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <SourceBadge source={item.source} date={item.event_date} />
            <DealChip tier={item.deal_tier} ratio={item.value_ratio} />
            {item.is_closed && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{item.listing_status}</span>}
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xl font-bold tracking-tight">
              {money(item.price)}
              <span className="sr-only">{item.source === "tax_deed" ? " opening bid" : " list price"}</span>
            </p>
            {item.market_value != null && (
              <p className="text-xs text-muted-foreground">Est. value {money(item.market_value)}</p>
            )}
          </div>
          {facts.length > 0 && <p className="text-sm">{facts.join(" · ")}</p>}
          <p className="truncate text-sm font-medium">{title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {place}
            {showDistance && item.distance_mi != null && item.distance_mi > 0 && ` · ${item.distance_mi} mi away`}
          </p>
        </div>
      </Link>
      {item.property_id && (
        <SaveButton propertyId={item.property_id} saved={!!item.saved_status} className="absolute right-2 top-2" />
      )}
    </article>
  );
});

export function PropertyCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm" aria-hidden>
      <div className="aspect-[16/10] w-full animate-pulse bg-muted" />
      <div className="space-y-2 p-3">
        <div className="h-4 w-28 animate-pulse rounded bg-muted" />
        <div className="h-6 w-24 animate-pulse rounded bg-muted" />
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        <div className="h-3 w-48 animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}
