import Link from "next/link";
import { MapPinned } from "lucide-react";
import { BRAND_NAME } from "@/lib/brand";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 rounded-md font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
        <MapPinned className="size-4" aria-hidden />
      </span>
      <span>{BRAND_NAME}</span>
    </Link>
  );
}
