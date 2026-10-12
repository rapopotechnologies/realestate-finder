import type { DealTier } from "@/lib/search/types";

// Same thresholds as the listings_feed view: price under 15% of market value is "great", under 40% "good"
export function dealTier(price: number | null | undefined, value: number | null | undefined): DealTier | null {
  if (price == null || !value || value <= 0) return null;
  const r = price / value;
  return r < 0.15 ? "great" : r < 0.4 ? "good" : "fair";
}

export function valueRatio(price: number | null | undefined, value: number | null | undefined): number | null {
  if (price == null || !value || value <= 0) return null;
  return Math.round((price / value) * 10000) / 10000;
}
