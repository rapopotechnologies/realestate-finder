import Link from "next/link";
import { BRAND_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

/**
 * The mark: a lot outline as drawn on a plat, in `plat`, with a `deed` seal dot where a pin would sit.
 * Same drawing as app/icon.svg (the favicon).
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <rect width="32" height="32" rx="8" className="fill-plat" />
      <path d="M7.5 11.5 L17 6.5 L25 12 L23 24.5 L9.5 25.5 Z" fill="none" stroke="white" strokeWidth="2" strokeLinejoin="round" />
      <path d="M17 6.5 L16 16 L23 24.5 M16 16 L7.5 11.5" fill="none" stroke="white" strokeWidth="1" strokeOpacity="0.55" />
      <circle cx="16" cy="16" r="3.2" className="fill-deed" stroke="white" strokeWidth="1.5" />
    </svg>
  );
}

/** compact: mark only below desktop width (the header needs the room for search) */
export function Logo({ href = "/", compact = false }: { href?: string; compact?: boolean }) {
  const [first, ...rest] = BRAND_NAME.split(" ");
  return (
    <Link href={href} aria-label={BRAND_NAME}
      className="flex shrink-0 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <LogoMark />
      <span className={cn("leading-none", compact && "max-lg:hidden")}>
        <span className="font-display text-lg font-semibold tracking-tight">{first}</span>{" "}
        <span className="text-sm font-medium text-muted-foreground">{rest.join(" ")}</span>
      </span>
    </Link>
  );
}
