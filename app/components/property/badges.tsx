"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import type { DealTier, Source } from "@/lib/search/types";
import { daysUntil, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/** "Tax deed · Nov 17" in seal orange, "HUD · bids Oct 21" in federal blue */
export function SourceBadge({ source, date, className }: { source: Source; date: string | null; className?: string }) {
  const when = date ? shortDate(date) : null;
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
      source === "tax_deed" ? "bg-deed-soft text-deed" : "bg-hud-soft text-hud", className)}>
      {source === "tax_deed" ? `Tax deed${when ? ` · ${when}` : ""}` : `HUD${when ? ` · bids ${when}` : ""}`}
    </span>
  );
}

/**
 * Time left until an auction / bid deadline: muted, then seal orange inside a week, alert red inside 3 days.
 * Renders nothing for past dates or closed listings (the status says it instead).
 */
export function Countdown({ date, closed, className }: { date: string | null; closed?: boolean; className?: string }) {
  const days = daysUntil(date);
  if (days == null || days < 0 || closed) return null;
  const text = days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
  return (
    <span className={cn("whitespace-nowrap text-xs font-medium",
      days <= 3 ? "font-semibold text-alert" : days <= 7 ? "text-deed" : "text-muted-foreground", className)}>
      {text}
    </span>
  );
}

/**
 * Green "Great" when price < 15% of value, outlined "Good" under 40%.
 * Not shown for tax deeds: the opening bid is the unpaid taxes, not the price (sales run several times
 * higher), so the ratio would mislead. They get a chip back once it's based on real sold prices.
 */
export function DealChip({ source, tier, ratio, className }: {
  source: Source | null;
  tier: DealTier | null;
  ratio?: number | null;
  className?: string;
}) {
  if (source === "tax_deed" || (tier !== "great" && tier !== "good")) return null;
  const pct = ratio != null ? ` · ${Math.round(ratio * 100)}% of value` : "";
  return (
    <span
      className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold text-gain",
        tier === "great" ? "bg-gain-soft" : "border border-gain/40", className)}
      title={tier === "great" ? "Price is under 15% of county value" : "Price is under 40% of county value"}
    >
      {tier === "great" ? "Great deal" : "Good deal"}
      <span className="sr-only">{pct}</span>
    </span>
  );
}

/** Parcel / case / certificate numbers: typewriter face, one click to copy for calls to the county */
export function RecordId({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex items-center gap-1">
      <span className="font-mono text-[0.95em]">{value}</span>
      <button type="button" aria-label={copied ? `${label} copied` : `Copy ${label}`}
        onClick={async () => { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {copied ? <Check className="size-3.5 text-gain" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      </button>
    </span>
  );
}
