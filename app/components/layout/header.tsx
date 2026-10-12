import Link from "next/link";
import { Suspense } from "react";
import { Heart } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { SearchBox } from "@/components/search/search-box";

export function Header({ email, dataUpdated }: { email: string | null; dataUpdated: string | null }) {
  return (
    <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur">
      <div className="flex h-16 items-center gap-3 px-4 sm:gap-4 sm:px-6">
        <Logo href="/search" compact />
        <div className="min-w-0 max-w-md flex-1">
          <Suspense fallback={<div className="h-10 rounded-full border bg-background" />}>
            <SearchBox />
          </Suspense>
        </div>
        <div className="flex-1 max-md:hidden" />
        {dataUpdated && (
          <span className="hidden whitespace-nowrap text-xs text-muted-foreground lg:inline">Data updated {dataUpdated}</span>
        )}
        <Link
          href="/my-list"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Heart className="size-4" aria-hidden /> <span className="max-sm:sr-only">My List</span>
        </Link>
        <SignOutButton email={email} />
      </div>
    </header>
  );
}
