import type { DealTier, Source } from "@/lib/search/types";
import { shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Green "Great" when price < 15% of value, amber "Good" under 40%.
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
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
        tier === "great" ? "bg-deal-great-soft text-deal-great" : "bg-deal-good-soft text-deal-good",
        className
      )}
      title={tier === "great" ? "Price is under 15% of market value" : "Price is under 40% of market value"}
    >
      {tier === "great" ? "Great deal" : "Good deal"}
      <span className="sr-only">{pct}</span>
    </span>
  );
}

export function SourceBadge({ source, date, className }: { source: Source; date: string | null; className?: string }) {
  const text = source === "tax_deed"
    ? `Tax Deed${date ? ` · ${shortDate(date)}` : ""}`
    : `HUD${date ? ` · bids due ${shortDate(date)}` : ""}`;
  return (
    <span className={cn(
      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
      source === "tax_deed" ? "bg-primary text-primary-foreground" : "bg-foreground text-background",
      className
    )}>
      {text}
    </span>
  );
}
