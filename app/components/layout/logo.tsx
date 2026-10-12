import Link from "next/link";
import { MapPinned } from "lucide-react";
import { BRAND_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

/** compact: icon only on small screens (the header needs the room for search) */
export function Logo({ href = "/", compact = false }: { href?: string; compact?: boolean }) {
  return (
    <Link href={href} aria-label={BRAND_NAME}
      className="flex shrink-0 items-center gap-2 rounded-md font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
        <MapPinned className="size-4" aria-hidden />
      </span>
      <span className={cn(compact && "max-md:hidden")}>{BRAND_NAME}</span>
    </Link>
  );
}
